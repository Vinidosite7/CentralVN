// ============================================================================
// Central Financeira — send-reminders (versão ampliada)
// Roda de hora em hora (pg_cron). Cada usuário recebe pushes conforme a hora
// LOCAL dele (usa o tz salvo na subscription). Tipos:
//   • 08h  Resumo matinal   — o que vence hoje + saldo + caixa
//   • sempre Boletos         — D-3 / D-1 / D0 (escalonado, disparo às 8h)
//   • sempre Fatura cartão   — D-2 do vencimento, com valor do mês
//   • 13h  Meio-dia          — se ainda tem boleto vencendo hoje não pago
//   • 21h  Lembrete noturno  — "registrou as vendas de hoje?" (fecha o loop)
// Textos variam com jitter (anti-habituação). Só dispara o que faz sentido.
//
// Deploy:  supabase functions deploy send-reminders --no-verify-jwt
// Secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, CRON_SECRET,
//          SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// ============================================================================

import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

function addMonthsKey(key, n) {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1 + n, 1).toISOString().slice(0, 7);
}
function purchaseMonths(p) {
  const n = p.recurring ? 24 : p.installments;
  return Array.from({ length: n }, (_, i) => addMonthsKey(p.start_month, i));
}
function monthBill(purchases, cardId, mk) {
  return purchases.filter((p) => p.card_id === cardId).reduce((a, p) => {
    const val = p.recurring ? Number(p.total) : Number(p.total) / p.installments;
    return purchaseMonths(p).includes(mk) ? a + val : a;
  }, 0);
}
const fmt = (n) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const MORNING = ["Bom dia, {n}! Hoje: {resumo}", "{n}, teu dia financeiro: {resumo}", "Resumo da manhã — {resumo}"];
const BILL_D3 = ["Chegando: {t} vence em 3 dias ({v}).", "Heads up — {t} ({v}) em 3 dias.", "{t} no radar: {v}, 3 dias."];
const BILL_D1 = ["Amanhã vence {t}: {v}.", "Falta 1 dia pra {t} ({v}).", "{t} vence amanhã — {v}."];
const BILL_D0 = ["⚠️ VENCE HOJE: {t} — {v}.", "Hoje é o dia de {t}: {v}. Não deixa passar.", "Pagamento de hoje: {t} ({v})."];
const CARD_D2 = ["Fatura {c} vence em 2 dias: {v}.", "{c} fecha em 2 dias — {v}.", "Prepara o caixa: fatura {c} ({v})."];
const NOON = ["Ó, {t} ainda tá em aberto hoje ({v}).", "Não esquece: {t} vence hoje, {v}.", "{t} ({v}) segue pendente pra hoje."];
const NIGHT = ["Fechou o dia? Registra as vendas de hoje 📊", "Antes de dormir: lançou as vendas de hoje?", "Bora fechar o caixa — registra o movimento de hoje.", "{n}, 2 toques pra não perder as vendas de hoje."];
const NIGHT_WITH = ["Hoje entraram {v} 👏 Fecha o caixa se faltou algo.", "Dia rendeu {v}. Confere se lançou tudo.", "{v} hoje. Registra o que faltou antes de dormir."];

function pick(pool, seed) { return pool[seed % pool.length]; }
function hashSeed(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return Math.abs(h); }
function localHour(tz) {
  try { return Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: tz }).format(new Date())); }
  catch { return new Date().getUTCHours() - 3; }
}

Deno.serve(async (req) => {
  if (req.headers.get("x-cron-secret") !== Deno.env.get("CRON_SECRET")) {
    return new Response("unauthorized", { status: 401 });
  }
  webpush.setVapidDetails(
    Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@central.app",
    Deno.env.get("VAPID_PUBLIC_KEY"),
    Deno.env.get("VAPID_PRIVATE_KEY"),
  );
  const supabase = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));

  const today = new Date();
  const todayISO = today.toISOString().slice(0, 10);
  const dayOfMonth = today.getDate();
  const thisMonth = todayISO.slice(0, 7);
  const seed = hashSeed(todayISO);

  const { data: subs } = await supabase.from("push_subscriptions").select("user_id, subscription, tz");
  if (!subs?.length) return Response.json({ sent: 0, reason: "no-subs" });

  const byUser = {};
  for (const s of subs) {
    (byUser[s.user_id] ??= { subs: [], tz: s.tz || "America/Sao_Paulo" }).subs.push(s.subscription);
  }

  let sent = 0;

  for (const userId of Object.keys(byUser)) {
    const { tz, subs: userSubs } = byUser[userId];
    const hour = localHour(tz);
    const notes = [];

    const { data: prof } = await supabase.from("profiles").select("name").eq("user_id", userId).maybeSingle();
    const nome = (prof?.name || "").split(" ")[0] || "Vini";

    // ===== ANTI-ESQUECIMENTO: recria contas recorrentes no dia 1º (por volta das 9h) =====
    if (dayOfMonth === 1 && hour === 9) {
      // pega recorrentes distintas por título (a mais recente de cada)
      const { data: recorrentes } = await supabase
        .from("bills").select("*")
        .eq("user_id", userId).eq("recurring", true)
        .order("created_at", { ascending: false });
      const vistos = new Set();
      for (const r of recorrentes ?? []) {
        if (vistos.has(r.title)) continue; // só a mais recente de cada título
        vistos.add(r.title);
        const dia = Math.min(r.due_day || 10, 28);
        const novoDue = `${thisMonth}-${String(dia).padStart(2, "0")}`;
        // já existe conta desse título vencendo neste mês? então não duplica
        const { data: existe } = await supabase.from("bills")
          .select("id").eq("user_id", userId).eq("title", r.title)
          .gte("due", `${thisMonth}-01`).lte("due", `${thisMonth}-31`).limit(1);
        if (!existe || existe.length === 0) {
          await supabase.from("bills").insert({
            user_id: userId, title: r.title, amount: r.amount, due: novoDue,
            method: r.method, cat: r.cat, paid: false, recurring: true,
            due_day: r.due_day, last_generated: thisMonth,
          });
        }
      }
    }

    // ===== FATURA DO CARTÃO vira conta a pagar no dia de fechamento (9h) =====
    if (hour === 9) {
      const { data: meusCards } = await supabase.from("cards").select("*").eq("user_id", userId);
      if (meusCards?.length) {
        const { data: comprasCartao } = await supabase.from("card_purchases")
          .select("card_id, total, installments, start_month, paid, recurring").eq("user_id", userId);
        for (const c of meusCards) {
          if (c.closing === dayOfMonth) {
            const valorFatura = monthBill(comprasCartao ?? [], c.id, thisMonth);
            if (valorFatura > 0) {
              const diaVenc = Math.min(c.due_day || 10, 28);
              // vencimento: se o dia de venc é <= fechamento, é no mês que vem; senão neste mês
              const vencMes = (c.due_day <= c.closing) ? addMonthsKey(thisMonth, 1) : thisMonth;
              const vencDate = `${vencMes}-${String(diaVenc).padStart(2, "0")}`;
              const titulo = `Fatura ${c.name}`;
              // evita duplicar: já existe fatura desse cartão vencendo nesse mês?
              const { data: jaExiste } = await supabase.from("bills")
                .select("id").eq("user_id", userId).eq("title", titulo)
                .gte("due", `${vencMes}-01`).lte("due", `${vencMes}-31`).limit(1);
              if (!jaExiste || jaExiste.length === 0) {
                await supabase.from("bills").insert({
                  user_id: userId, title: titulo, amount: valorFatura, due: vencDate,
                  method: "Cartão", cat: "Empresa", paid: false, recurring: false,
                });
                notes.push({ title: "💳 Fatura fechou", body: `${c.name}: ${fmt(valorFatura)}. Adicionei nas contas, vence dia ${diaVenc}.` });
              }
            }
          }
        }
      }
    }

    const { data: bills } = await supabase.from("bills").select("title, amount, due").eq("user_id", userId).eq("paid", false);
    const { data: balances } = await supabase.from("balances").select("amount").eq("user_id", userId);
    const caixa = (balances ?? []).reduce((a, b) => a + Number(b.amount), 0);
    const dueToday = (bills ?? []).filter((b) => b.due === todayISO);

    if (hour === 8) {
      const venceHoje = dueToday.length;
      const resumo = venceHoje > 0
        ? `${venceHoje} conta(s) vencem hoje (${fmt(dueToday.reduce((a, b) => a + Number(b.amount), 0))}). Caixa: ${fmt(caixa)}.`
        : `nada vence hoje. Caixa: ${fmt(caixa)}. Respira. 🙌`;
      notes.push({ title: "☀️ Bom dia", body: pick(MORNING, seed).replace("{n}", nome).replace("{resumo}", resumo) });

      for (const b of bills ?? []) {
        const d = Math.round((new Date(b.due + "T00:00:00").getTime() - new Date(todayISO + "T00:00:00").getTime()) / 86400000);
        let tpl = null;
        if (d === 3) tpl = pick(BILL_D3, seed);
        else if (d === 1) tpl = pick(BILL_D1, seed);
        else if (d === 0) tpl = pick(BILL_D0, seed);
        if (tpl) notes.push({ title: d === 0 ? "Vence hoje" : "Conta chegando", body: tpl.replace("{t}", b.title).replace("{v}", fmt(Number(b.amount))) });
      }

      const { data: cards } = await supabase.from("cards").select("id, name, due_day").eq("user_id", userId);
      if (cards?.length) {
        const { data: purchases } = await supabase.from("card_purchases").select("card_id, total, installments, start_month, paid, recurring").eq("user_id", userId);
        for (const c of cards) {
          if (c.due_day - dayOfMonth === 2) {
            const val = monthBill(purchases ?? [], c.id, thisMonth);
            if (val > 0) notes.push({ title: "Fatura de cartão", body: pick(CARD_D2, seed).replace("{c}", c.name).replace("{v}", fmt(val)) });
          }
        }
      }
    }

    if (hour === 13 && dueToday.length > 0) {
      const b = dueToday[0];
      notes.push({ title: "Ainda dá tempo", body: pick(NOON, seed).replace("{t}", b.title).replace("{v}", fmt(Number(b.amount))) });
    }

    if (hour === 21) {
      const { data: salesToday } = await supabase.from("sales").select("amount").eq("user_id", userId).eq("date", todayISO);
      const totalToday = (salesToday ?? []).reduce((a, s) => a + Number(s.amount), 0);
      const body = totalToday > 0 ? pick(NIGHT_WITH, seed).replace("{v}", fmt(totalToday)) : pick(NIGHT, seed).replace("{n}", nome);
      notes.push({ title: "🌙 Fecha o dia", body });
    }

    if (notes.length === 0) continue;

    const payloads = notes.length <= 3 ? notes
      : [{ title: "Central VN", body: notes.map((n) => n.body).join(" · ").slice(0, 170) + "…" }];

    for (const sub of userSubs) {
      for (const p of payloads) {
        try { await webpush.sendNotification(sub, JSON.stringify({ ...p, url: "/" })); sent++; }
        catch (_) {}
      }
    }
  }

  return Response.json({ sent });
});
