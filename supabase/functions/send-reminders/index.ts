// ============================================================================
// Central Financeira — send-reminders
// Roda 1x/dia (pg_cron às 11:00 UTC ≈ 08:00 BRT). Para cada usuário:
//   1) Boletos em aberto vencendo em D-3, D-1 ou D0  → push escalonado
//   2) Faturas de cartão: se hoje == due_day - 2      → push do valor do mês
// Usa jitter leve no texto pra reduzir habituação (mesmo espírito do Foco3).
//
// Deploy:  supabase functions deploy send-reminders --no-verify-jwt
// Secrets: supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... \
//          VAPID_SUBJECT=mailto:voce@email.com CRON_SECRET=um-segredo-forte
// ============================================================================

import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

/* ---------- motor de parcelas (idêntico ao client) ---------- */
function addMonthsKey(key: string, n: number) {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return d.toISOString().slice(0, 7);
}
function purchaseMonths(p: any): string[] {
  return Array.from({ length: p.installments }, (_, i) => addMonthsKey(p.start_month, i));
}
function monthBill(purchases: any[], cardId: string, mk: string) {
  return purchases
    .filter((p) => p.card_id === cardId)
    .reduce((a, p) => (purchaseMonths(p).includes(mk) ? a + Number(p.total) / p.installments : a), 0);
}

const fmt = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/* ---------- textos com leve variação (anti-habituação) ---------- */
const BILL_D3 = ["Chegando: {t} vence em 3 dias ({v}).", "Heads up — {t} ({v}) vence em 3 dias.", "{t} no radar: {v}, 3 dias pra vencer."];
const BILL_D1 = ["Amanhã vence {t}: {v}.", "Falta 1 dia pra {t} ({v}).", "{t} vence amanhã — {v}."];
const BILL_D0 = ["⚠️ VENCE HOJE: {t} — {v}.", "Hoje é o dia de {t}: {v}. Não deixa passar.", "Pagamento de hoje: {t} ({v})."];
const CARD_D2 = ["Fatura {c} vence em 2 dias: {v}.", "{c} fecha a conta em 2 dias — {v}.", "Prepara o caixa: fatura {c} ({v}) em 2 dias."];

function pick(pool: string[], seed: number) { return pool[seed % pool.length]; }
function hashSeed(s: string) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return Math.abs(h); }

Deno.serve(async (req) => {
  if (req.headers.get("x-cron-secret") !== Deno.env.get("CRON_SECRET")) {
    return new Response("unauthorized", { status: 401 });
  }

  webpush.setVapidDetails(
    Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@central.app",
    Deno.env.get("VAPID_PUBLIC_KEY")!,
    Deno.env.get("VAPID_PRIVATE_KEY")!,
  );

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const today = new Date();
  const todayISO = today.toISOString().slice(0, 10);
  const dayOfMonth = today.getDate();
  const thisMonth = todayISO.slice(0, 7);
  const seed = hashSeed(todayISO);

  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("user_id, subscription");
  if (!subs?.length) return Response.json({ sent: 0, reason: "no-subs" });

  const subsByUser: Record<string, any[]> = {};
  for (const s of subs) (subsByUser[s.user_id] ??= []).push(s.subscription);

  let sent = 0;

  for (const userId of Object.keys(subsByUser)) {
    const notes: { title: string; body: string }[] = [];

    // 1) BOLETOS vencendo
    const { data: bills } = await supabase
      .from("bills").select("title, amount, due")
      .eq("user_id", userId).eq("paid", false);
    for (const b of bills ?? []) {
      const d = Math.round((new Date(b.due + "T00:00:00").getTime() - new Date(todayISO + "T00:00:00").getTime()) / 86400000);
      let tpl: string | null = null;
      if (d === 3) tpl = pick(BILL_D3, seed);
      else if (d === 1) tpl = pick(BILL_D1, seed);
      else if (d === 0) tpl = pick(BILL_D0, seed);
      if (tpl) {
        notes.push({
          title: d === 0 ? "Vence hoje" : "Conta chegando",
          body: tpl.replace("{t}", b.title).replace("{v}", fmt(Number(b.amount))),
        });
      }
    }

    // 2) FATURAS de cartão (D-2 do vencimento)
    const { data: cards } = await supabase
      .from("cards").select("id, name, due_day").eq("user_id", userId);
    if (cards?.length) {
      const { data: purchases } = await supabase
        .from("card_purchases").select("card_id, total, installments, start_month, paid")
        .eq("user_id", userId);
      for (const c of cards) {
        if (c.due_day - dayOfMonth === 2) {
          const val = monthBill(purchases ?? [], c.id, thisMonth);
          if (val > 0) {
            notes.push({
              title: "Fatura de cartão",
              body: pick(CARD_D2, seed).replace("{c}", c.name).replace("{v}", fmt(val)),
            });
          }
        }
      }
    }

    // dispara (agrupa: se tiver muita coisa, manda um resumo)
    const payloads = notes.length <= 2
      ? notes
      : [{ title: "Financeiro do dia", body: `${notes.length} avisos: ${notes.map((n) => n.body).join(" · ").slice(0, 160)}…` }];

    for (const sub of subsByUser[userId]) {
      for (const p of payloads) {
        try {
          await webpush.sendNotification(sub, JSON.stringify({ ...p, url: "/" }));
          sent++;
        } catch (_) { /* subscription morta: ignora */ }
      }
    }
  }

  return Response.json({ sent });
});
