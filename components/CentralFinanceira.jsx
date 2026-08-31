"use client";
import React, { useState, useMemo, useEffect, useRef } from "react";
import * as DB from "../lib/db";
import { supabase } from "../lib/supabase";
import { subscribePush, unsubscribePush } from "../lib/push";

/* ============================================================================
   CENTRAL FINANCEIRA — Vini (VN)
   Identidade visual herdada do TioTrack/BossFlow: fundo #070812, superfícies
   #0a0b16, bordas sutis, Poppins (títulos + números) + Inter (texto)
   (números), bottom nav flutuante em pill com glow por cor.

   Pensado pra TDAH: boleto na cara, registro em 2 toques, saldo real na hora.

   PERSISTÊNCIA: roda 100% já em memória. Supabase plugável (schema no fim do
   arquivo). Storage de navegador não roda no preview de artifact — jogue no
   seu Next.js pra ganhar persistência real + push (mesma stack do IronTrack).
   ========================================================================== */

const T = {
  bg: "#070812",
  surface: "#0a0b16",
  raised: "#0e1020",
  card: "rgba(10,10,18,0.92)",
  border: "rgba(255,255,255,0.055)",
  borderSub: "rgba(255,255,255,0.03)",
  border2: "rgba(255,255,255,0.09)",
  text1: "#dcdcf0",
  text2: "#8a8aaa",
  text3: "#4a4a6a",
  accent: "var(--acc)",        // dinâmico — trocável nas Config
  accentLight: "var(--acc-l)",
  green: "#34d399",
  red: "#f87171",
  yellow: "#fbbf24",
  cyan: "#22d3ee",
  display: "'Poppins', sans-serif",
  sans: "'Inter', -apple-system, sans-serif",
  mono: "'Poppins', sans-serif",   // números agora em Poppins (estilo Foco3), não mais mono/robótico
};

// Paleta de destaque escolhível (id salvo no profile)
const ACCENTS = {
  purple: { label: "Roxo", base: "#7c6ef7", light: "#a78bfa" },
  mint:   { label: "Menta", base: "#34d399", light: "#6ee7b7" },
  orange: { label: "Laranja", base: "#f59e0b", light: "#fbbf24" },
  blue:   { label: "Azul", base: "#3b82f6", light: "#60a5fa" },
  cyan:   { label: "Ciano", base: "#22d3ee", light: "#67e8f9" },
  pink:   { label: "Rosa", base: "#ec4899", light: "#f472b6" },
};
function applyAccent(id) {
  const a = ACCENTS[id] || ACCENTS.purple;
  const r = document.documentElement;
  r.style.setProperty("--acc", a.base);
  r.style.setProperty("--acc-l", a.light);
  // versões com alpha pra glows/borders
  r.style.setProperty("--acc-18", a.base + "2e");
  r.style.setProperty("--acc-42", a.base + "6b");
}

const PLATFORMS = [
  { id: "kwai", label: "Kwai", color: "#ff6f00" },
  { id: "face", label: "Meta", color: "#0866ff" },
  { id: "tiktok", label: "TikTok", color: "#25f4ee" },
  { id: "google", label: "Google", color: "#ea4335" },
  { id: "taboola", label: "Taboola", color: "#1a73e8" },
];
const CATS_OUT = ["Pessoal", "Empresa", "Tráfego", "Ferramentas", "Impostos", "Outros"];
const PAY_METHODS = ["PIX", "Cartão", "Boleto", "Dinheiro"];

/* bandeiras e tiers de cartão */
const BRANDS = [
  { id: "visa", label: "Visa" },
  { id: "master", label: "Mastercard" },
  { id: "elo", label: "Elo" },
  { id: "amex", label: "Amex" },
  { id: "hiper", label: "Hipercard" },
];
const TIERS = ["Gold", "Platinum", "Black", "Infinite", "Standard"];
const CARD_THEMES = [
  { id: "obsidian", label: "Obsidian", grad: "linear-gradient(135deg,#1a1a2e 0%,#0f0f1a 100%)", glow: "#7c6ef7" },
  { id: "sicoob", label: "Verde", grad: "linear-gradient(135deg,#00514b 0%,#003d38 100%)", glow: "#34d399" },
  { id: "nubank", label: "Roxo", grad: "linear-gradient(135deg,#820ad1 0%,#4a0577 100%)", glow: "#a78bfa" },
  { id: "inter", label: "Laranja", grad: "linear-gradient(135deg,#ff7a00 0%,#c95a00 100%)", glow: "#ff9d3c" },
  { id: "azul", label: "Azul", grad: "linear-gradient(135deg,#1e40af 0%,#0f2470 100%)", glow: "#60a5fa" },
  { id: "graphite", label: "Grafite", grad: "linear-gradient(135deg,#3a3a42 0%,#1c1c22 100%)", glow: "#94a3b8" },
];

/* ------------------------------ Helpers ---------------------------------- */
const fmt = (n) => (n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtShort = (n) => (n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const todayISO = () => new Date().toISOString().slice(0, 10);
const uid = () => Math.random().toString(36).slice(2, 10);
const monthKey = (d = new Date()) => d.toISOString().slice(0, 7);
const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
function monthLabel(key) { const [y, m] = key.split("-"); return `${MONTHS[+m - 1]}/${y.slice(2)}`; }
function addMonthsKey(key, n) { const [y, m] = key.split("-").map(Number); const d = new Date(y, m - 1 + n, 1); return monthKey(d); }
function addDays(n) { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); }
function daysUntil(iso) { const d = new Date(iso + "T00:00:00"); const n = new Date(); n.setHours(0, 0, 0, 0); return Math.round((d - n) / 86400000); }
function dueLabel(iso) {
  const d = daysUntil(iso);
  if (d < 0) return { text: `Venceu há ${Math.abs(d)}d`, tone: "red" };
  if (d === 0) return { text: "Vence HOJE", tone: "red" };
  if (d === 1) return { text: "Vence amanhã", tone: "yellow" };
  if (d <= 3) return { text: `Vence em ${d}d`, tone: "yellow" };
  return { text: `Vence em ${d}d`, tone: "text2" };
}
const tone = (t) => ({ red: T.red, yellow: T.yellow, text2: T.text2 }[t] || T.text2);

/* MOTOR DE PARCELAS — coração do sistema de cartões
   Cada purchase = { id, cardId, desc, total, installments, startMonth }
   Gera parcelas: total/installments em cada mês a partir de startMonth.
   - openOnCard(cardId): soma das parcelas NÃO pagas → é o que "come" o limite
   - monthBill(cardId, monthKey): soma das parcelas daquele mês
*/
function purchaseInstallmentValue(p) { return p.recurring ? p.total : p.total / p.installments; }
function purchaseMonths(p) {
  // recorrente: mostra do mês inicial até 24 meses à frente (assinatura "sem fim" pra projeção)
  const n = p.recurring ? 24 : p.installments;
  return Array.from({ length: n }, (_, i) => addMonthsKey(p.startMonth, i));
}
function paidCount(p) { return p.paid || 0; } // parcelas pagas (não usado em recorrente)
function openOnCard(purchases, cardId) {
  return purchases.filter((p) => p.cardId === cardId).reduce((a, p) => {
    if (p.recurring) return a + p.total; // assinatura ocupa 1 mensalidade do limite
    const remaining = p.installments - paidCount(p);
    return a + (p.total / p.installments) * remaining;
  }, 0);
}
function monthBill(purchases, cardId, mk) {
  return purchases.filter((p) => p.cardId === cardId).reduce((a, p) => {
    return purchaseMonths(p).includes(mk) ? a + purchaseInstallmentValue(p) : a;
  }, 0);
}

/* ----------------------------- Seed data --------------------------------- */
const nowMonth = monthKey();
const SEED = {
  bills: [
    { id: uid(), title: "Aluguel escritório", amount: 1800, due: addDays(2), method: "Boleto", cat: "Empresa", paid: false, recurring: true },
    { id: uid(), title: "Xtracky", amount: 97, due: addDays(-1), method: "Cartão", cat: "Ferramentas", paid: false, recurring: true },
    { id: uid(), title: "Contador", amount: 450, due: addDays(9), method: "PIX", cat: "Empresa", paid: false, recurring: true },
  ],
  cards: [
    { id: uid(), name: "Sicoob", brand: "visa", tier: "Black", theme: "sicoob", limit: 12000, closing: 3, dueDay: 10, last4: "4471" },
    { id: uid(), name: "Nubank", brand: "master", tier: "Platinum", theme: "nubank", limit: 8000, closing: 20, dueDay: 27, last4: "8829" },
  ],
  purchases: [], // preenchido abaixo referenciando os cards
  debts: [
    { id: uid(), who: "Empréstimo sócio", amount: 2000, direction: "owe", note: "Capital de giro", settled: false },
    { id: uid(), who: "Cliente Saffira", amount: 1200, direction: "owed", note: "Gestão do mês", settled: false },
  ],
  balances: [
    { id: uid(), name: "PIX Kwai", amount: 850 },
    { id: uid(), name: "PIX operacional", amount: 2400 },
  ],
  sales: [],
  expenses: [],
};
// compras de exemplo nos cartões
SEED.purchases = [
  { id: uid(), cardId: SEED.cards[0].id, desc: "MacBook", total: 12000, installments: 12, startMonth: addMonthsKey(nowMonth, -2), paid: 2 },
  { id: uid(), cardId: SEED.cards[0].id, desc: "Câmera Sony", total: 4800, installments: 6, startMonth: nowMonth, paid: 0 },
  { id: uid(), cardId: SEED.cards[1].id, desc: "Anúncios diversos", total: 1200, installments: 1, startMonth: nowMonth, paid: 0 },
];

/* ============================================================================
   APP
   ========================================================================== */
const EMPTY = { bills: [], cards: [], purchases: [], debts: [], balances: [], sales: [], expenses: [] };

export default function CentralFinanceira({ userId }) {
  const [tab, setTab] = useState("hoje");
  const [db, setDb] = useState(EMPTY);
  const [profile, setProfile] = useState({ name: "", company: "", accent: "purple", notif: false });
  const [loading, setLoading] = useState(true);
  const [quick, setQuick] = useState(null);
  const [openCard, setOpenCard] = useState(null); // card detail id
  const set = (patch) => setDb((p) => ({ ...p, ...patch }));

  // Carga inicial do Supabase
  useEffect(() => {
    let alive = true;
    (async () => {
      const [res, prof] = await Promise.all([DB.loadAll(), DB.loadProfile()]);
      if (!alive) return;
      if (res.error) { setDb(SEED); } // offline/sem tabelas: usa seed pra não travar
      else setDb({ bills: res.bills, cards: res.cards, purchases: res.purchases, debts: res.debts, balances: res.balances, sales: res.sales, expenses: res.expenses });
      if (prof) { setProfile(prof); applyAccent(prof.accent); }
      else applyAccent("purple");
      setLoading(false);
    })();
    if (userId) subscribePush(userId);
    return () => { alive = false; };
  }, [userId]);

  const saveProfile = async (patch) => {
    const next = { ...profile, ...patch };
    setProfile(next);
    if (patch.accent) applyAccent(patch.accent);
    await DB.upsertProfile(next);
  };
  const displayName = (profile.name || "Vini").split(" ")[0];

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: T.bg, color: T.text2, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: T.sans }}>
        <StyleTag />carregando…
      </div>
    );
  }

  const today = todayISO();
  const salesToday = db.sales.filter((s) => s.date === today);
  const inToday = salesToday.reduce((a, s) => a + s.amount, 0);
  const outToday = db.expenses.filter((e) => e.date === today).reduce((a, e) => a + e.amount, 0);
  const cashOnHand = db.balances.reduce((a, b) => a + b.amount, 0);
  const unpaidBills = db.bills.filter((b) => !b.paid);
  const billsTotal = unpaidBills.reduce((a, b) => a + b.amount, 0);
  const owe = db.debts.filter((d) => d.direction === "owe" && !d.settled).reduce((a, d) => a + d.amount, 0);
  const owed = db.debts.filter((d) => d.direction === "owed" && !d.settled).reduce((a, d) => a + d.amount, 0);
  const realBalance = cashOnHand - billsTotal;
  const urgentBills = unpaidBills.filter((b) => daysUntil(b.due) <= 3).sort((a, b) => daysUntil(a.due) - daysUntil(b.due));

  const cardObj = db.cards.find((c) => c.id === openCard);

  const NAV = [
    ["hoje", "Hoje", "◎"],
    ["contas", "Contas", "▤"],
    ["vendas", "Vendas", "↗"],
    ["cartoes", "Cartões", "▦"],
    ["perfil", "Perfil", "☺"],
  ];

  return (
    <div style={{ minHeight: "100vh", background: T.bg, color: T.text1, fontFamily: T.sans, position: "relative" }}>
      <StyleTag />
      <GridBg />

      <div className="shell">
        {/* SIDEBAR (desktop) */}
        <aside className="sidebar">
          <div style={{ padding: "4px 6px 20px" }}>
            <h1 style={{ margin: 0, fontFamily: T.display, fontWeight: 800, fontSize: 22, letterSpacing: "-0.03em", color: "#f0f0ff" }}>
              Central <span style={{ color: T.accent }}>VN</span>
            </h1>
            <p style={{ margin: "2px 0 0", fontSize: 11, color: T.text3 }}>{profile.company || "Financeiro"}</p>
          </div>
          <nav style={{ display: "grid", gap: 4 }}>
            {NAV.map(([id, label, icon]) => (
              <button key={id} onClick={() => setTab(id)} className="sideBtn" style={sideBtnStyle(tab === id)}>
                <span style={{ fontSize: 18, width: 22, textAlign: "center" }}>{icon}</span>
                <span>{label}</span>
              </button>
            ))}
          </nav>
          <button className="sideNew" onClick={() => setQuick("menu")}>+ Registrar</button>
        </aside>

        {/* MAIN */}
        <div className="mainCol">
          <header className="topHead">
            <div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                <h1 className="brand">Central <span style={{ color: T.accent }}>VN</span></h1>
                <span style={{ fontSize: 12, color: T.text3 }}>{displayName} · {new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}</span>
              </div>
              <p className="pageTitle">{{ hoje: greeting() + ", " + displayName, contas: "Contas a pagar", vendas: "Vendas", cartoes: "Cartões & saldos", perfil: "Perfil" }[tab]}</p>
            </div>
            <div style={{ textAlign: "right" }}>
              <p style={{ margin: 0, fontSize: 10, color: T.text3, textTransform: "uppercase", letterSpacing: 1 }}>Saldo real</p>
              <p style={{ margin: 0, fontFamily: T.mono, fontWeight: 700, fontSize: 20, letterSpacing: "-0.01em", color: realBalance >= 0 ? T.green : T.red }}>{fmt(realBalance)}</p>
            </div>
          </header>

          <main className="content">
            {tab === "hoje" && <Hoje {...{ urgentBills, realBalance, cashOnHand, billsTotal, inToday, outToday, salesToday, owe, owed }} onPay={(id) => { set({ bills: db.bills.map((b) => b.id === id ? { ...b, paid: true } : b) }); DB.setBillPaid(id, true); }} goto={setTab} />}
            {tab === "contas" && <Contas db={db} set={set} displayName={displayName} />}
            {tab === "vendas" && <Vendas db={db} set={set} />}
            {tab === "cartoes" && <Cartoes db={db} set={set} owe={owe} owed={owed} onOpen={setOpenCard} onNew={() => setQuick("card")} />}
            {tab === "perfil" && <Perfil profile={profile} saveProfile={saveProfile} />}
          </main>
        </div>
      </div>

      {/* FAB (mobile) */}
      <button className="fab" onClick={() => setQuick("menu")} aria-label="Registrar">+</button>

      {quick === "menu" && <QuickMenu onClose={() => setQuick(null)} onSale={() => setQuick("sale")} onExpense={() => setQuick("expense")} />}
      {quick === "sale" && <QuickSale onClose={() => setQuick(null)} onSave={async (s) => { setQuick(null); setTab("vendas"); const { data } = await DB.addSale(s); set({ sales: [data || { id: uid(), ...s }, ...db.sales] }); }} />}
      {quick === "expense" && <QuickExpense onClose={() => setQuick(null)} onSave={async (e) => { setQuick(null); const { data } = await DB.addExpense(e); set({ expenses: [data || { id: uid(), ...e }, ...db.expenses] }); }} />}
      {quick === "card" && <CardForm onClose={() => setQuick(null)} onSave={async (c) => { setQuick(null); const { data } = await DB.addCard(c); set({ cards: [data || { id: uid(), ...c }, ...db.cards] }); }} />}

      {cardObj && (
        <CardDetail
          card={cardObj}
          purchases={db.purchases.filter((p) => p.cardId === cardObj.id)}
          onClose={() => setOpenCard(null)}
          onAddPurchase={async (p) => { const { data } = await DB.addPurchase({ ...p, cardId: cardObj.id }); set({ purchases: [data || { id: uid(), cardId: cardObj.id, ...p }, ...db.purchases] }); }}
          onPayInstallment={(pid) => { const cur = db.purchases.find((p) => p.id === pid); set({ purchases: db.purchases.map((p) => p.id === pid ? { ...p, paid: Math.min(p.installments, (p.paid || 0) + 1) } : p) }); if (cur) DB.payInstallment(pid, cur.paid || 0, cur.installments); }}
          onDelPurchase={(pid) => { set({ purchases: db.purchases.filter((p) => p.id !== pid) }); DB.delPurchase(pid); }}
          onEditCard={(patch) => { set({ cards: db.cards.map((c) => c.id === cardObj.id ? { ...c, ...patch } : c) }); DB.updateCard(cardObj.id, patch); }}
          onDelCard={() => { const cid = cardObj.id; setOpenCard(null); set({ cards: db.cards.filter((c) => c.id !== cid), purchases: db.purchases.filter((p) => p.cardId !== cid) }); DB.delCard(cid); }}
          allPurchases={db.purchases}
        />
      )}

      {/* Bottom nav (mobile) */}
      <nav className="nav">
        <div className="navInner">
          {NAV.map(([id, label, icon]) => (
            <button key={id} onClick={() => setTab(id)} className="navBtn" style={{ background: tab === id ? "var(--acc-18)" : "rgba(255,255,255,0.025)", border: `1px solid ${tab === id ? "var(--acc-42)" : T.border}`, color: tab === id ? T.accent : "#5d6378", boxShadow: tab === id ? `0 0 16px var(--acc-18)` : "none" }}>
              <span style={{ fontSize: 16 }}>{icon}</span>
              <span style={{ fontSize: 8.5, fontWeight: 800, letterSpacing: "-0.02em", color: tab === id ? "#E2E8F0" : "#68708a" }}>{label}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}

function sideBtnStyle(active) {
  return {
    display: "flex", alignItems: "center", gap: 12, width: "100%",
    padding: "11px 14px", borderRadius: 12, cursor: "pointer",
    fontFamily: "inherit", fontSize: 14, fontWeight: active ? 700 : 500,
    background: active ? "var(--acc-18)" : "transparent",
    border: `1px solid ${active ? "var(--acc-42)" : "transparent"}`,
    color: active ? "var(--acc-l)" : "#8a8aaa",
    transition: "all .15s",
  };
}

/* ============================== PERFIL ================================= */
function Perfil({ profile, saveProfile }) {
  const [name, setName] = useState(profile.name || "");
  const [company, setCompany] = useState(profile.company || "");
  const [notifMsg, setNotifMsg] = useState("");

  const toggleNotif = async () => {
    if (!profile.notif) {
      const r = await subscribePush((await supabase.auth.getUser()).data?.user?.id);
      if (r.ok) { saveProfile({ notif: true }); setNotifMsg(""); }
      else setNotifMsg(r.reason === "denied" ? "Permissão negada no navegador." : r.reason === "unsupported" ? "Push não suportado aqui (instale como app)." : "Não deu pra ligar agora.");
    } else {
      await unsubscribePush();
      saveProfile({ notif: false });
    }
  };

  return (
    <div style={{ display: "grid", gap: 14, maxWidth: 560 }}>
      <Card>
        <CardTitle>Seus dados</CardTitle>
        <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
          <Field label="Seu nome">
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} onBlur={() => name !== profile.name && saveProfile({ name })} placeholder="Vinicius" />
          </Field>
          <Field label="Nome da empresa">
            <input className="input" value={company} onChange={(e) => setCompany(e.target.value)} onBlur={() => company !== profile.company && saveProfile({ company })} placeholder="ex: VN Digital" />
          </Field>
          <p style={{ margin: 0, fontSize: 11, color: T.text3 }}>Salva sozinho quando você sai do campo.</p>
        </div>
      </Card>

      <Card>
        <CardTitle>Cor de destaque</CardTitle>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
          {Object.entries(ACCENTS).map(([id, a]) => (
            <button key={id} onClick={() => saveProfile({ accent: id })} title={a.label}
              style={{ width: 46, height: 46, borderRadius: 12, cursor: "pointer", background: `linear-gradient(135deg, ${a.base}, ${a.light})`, border: `2px solid ${profile.accent === id ? "#fff" : "transparent"}`, boxShadow: profile.accent === id ? `0 0 16px ${a.base}88` : "none" }} />
          ))}
        </div>
        <p style={{ margin: "10px 0 0", fontSize: 11, color: T.text3 }}>Muda o app inteiro na hora.</p>
      </Card>

      <Card>
        <CardTitle>Notificações</CardTitle>
        <Row style={{ marginTop: 12 }}>
          <div>
            <p className="rt">Avisos de vencimento</p>
            <p className="rs">Boleto e fatura chegam como push no seu celular.</p>
          </div>
          <button onClick={toggleNotif} className="toggle" style={{ background: profile.notif ? "var(--acc)" : "rgba(255,255,255,0.1)" }}>
            <span className="toggleKnob" style={{ transform: profile.notif ? "translateX(20px)" : "translateX(0)" }} />
          </button>
        </Row>
        {notifMsg && <p style={{ margin: "10px 0 0", fontSize: 12, color: T.yellow }}>{notifMsg}</p>}
      </Card>

      <Card>
        <CardTitle>Conta</CardTitle>
        <button className="btnDanger" style={{ marginTop: 12 }} onClick={() => supabase.auth.signOut()}>Sair</button>
      </Card>

      <p style={{ textAlign: "center", fontSize: 11, color: T.text3, margin: "4px 0 0" }}>Central VN · feito pro seu jeito</p>
    </div>
  );
}

/* ============================== HOJE ==================================== */
function Hoje({ urgentBills, realBalance, cashOnHand, billsTotal, inToday, outToday, salesToday, owe, owed, onPay, goto }) {
  const net = inToday - outToday;
  return (
    <div style={{ display: "grid", gap: 12 }}>
      {urgentBills.length > 0 ? (
        <Card glow={T.red} accent="rgba(248,113,113,0.10)">
          <Row style={{ marginBottom: 10 }}>
            <span style={{ display: "flex", gap: 8, alignItems: "center" }}><span style={{ fontSize: 16 }}>🔔</span><CardTitle style={{ color: T.red }}>Pagar agora</CardTitle></span>
          </Row>
          <div style={{ display: "grid", gap: 8 }}>
            {urgentBills.map((b) => {
              const dl = dueLabel(b.due);
              return (
                <Row key={b.id}>
                  <div><p className="rt">{b.title}</p><p className="rs" style={{ color: tone(dl.tone) }}>{dl.text} · {b.method}</p></div>
                  <span style={{ display: "flex", alignItems: "center", gap: 10 }}><Num>{fmt(b.amount)}</Num><button className="btnPay" onClick={() => onPay(b.id)}>Paguei</button></span>
                </Row>
              );
            })}
          </div>
        </Card>
      ) : (
        <Card><p style={{ margin: 0, textAlign: "center", fontSize: 14 }}>✅ Nenhum boleto vencendo em 3 dias.</p><p style={{ margin: "4px 0 0", textAlign: "center", color: T.text2, fontSize: 12 }}>Respira. Tá sob controle.</p></Card>
      )}

      <div className="gridWrap" style={{ display: "grid", gap: 12 }}>
        <Card>
          <CardTitle>Saldo real</CardTitle>
          <p style={{ margin: "4px 0 12px", fontFamily: T.mono, fontWeight: 700, fontSize: 34, letterSpacing: "-0.02em", color: realBalance >= 0 ? T.green : T.red }}>{fmt(realBalance)}</p>
          <div style={{ display: "flex", gap: 8 }}>
            <Pill label="Caixa (PIX)" value={fmt(cashOnHand)} color={T.cyan} />
            <Pill label="A pagar" value={"-" + fmt(billsTotal)} color={T.red} />
          </div>
        </Card>

        <Card>
          <Row style={{ alignItems: "baseline" }}><CardTitle>Movimento de hoje</CardTitle><button className="link" onClick={() => goto("vendas")}>vendas →</button></Row>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 10 }}>
            <Stat label="Entrou" value={fmt(inToday)} color={T.green} />
            <Stat label="Saiu" value={fmt(outToday)} color={T.red} />
            <Stat label="Líquido" value={fmt(net)} color={net >= 0 ? T.text1 : T.red} />
          </div>
          {salesToday.length > 0 && (
            <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 6 }}>
              {PLATFORMS.map((p) => { const t = salesToday.filter((s) => s.platform === p.id).reduce((a, s) => a + s.amount, 0); if (!t) return null; return <span key={p.id} className="chip" style={{ borderColor: p.color + "55" }}><b style={{ color: p.color }}>{p.label}</b> {fmt(t)}</span>; })}
            </div>
          )}
        </Card>

        <Card>
          <CardTitle>Dívidas</CardTitle>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 10 }}>
            <Stat label="Eu devo" value={fmt(owe)} color={T.red} />
            <Stat label="Me devem" value={fmt(owed)} color={T.green} />
          </div>
        </Card>
      </div>
    </div>
  );
}

/* ============================== CONTAS ================================== */
function Contas({ db, set, displayName }) {
  const [showForm, setShowForm] = useState(false);
  const unpaid = db.bills.filter((b) => !b.paid).sort((a, b) => daysUntil(a.due) - daysUntil(b.due));
  const paid = db.bills.filter((b) => b.paid);
  // gastos do mês por categoria
  const monthExp = db.expenses.filter((e) => e.date.slice(0, 7) === todayISO().slice(0, 7));
  const pessoal = monthExp.filter((e) => e.cat === "Pessoal");
  const empresa = monthExp.filter((e) => e.cat !== "Pessoal"); // empresa/tráfego/ferramentas/etc
  const delExp = (id) => { set({ expenses: db.expenses.filter((x) => x.id !== id) }); DB.delExpense(id); };
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <Row><H2>Contas a pagar</H2><button className="btnGhost" onClick={() => setShowForm((s) => !s)}>{showForm ? "Fechar" : "+ Nova"}</button></Row>
      {showForm && <BillForm onSave={async (b) => { setShowForm(false); const { data } = await DB.addBill(b); set({ bills: [data || { id: uid(), paid: false, ...b }, ...db.bills] }); }} />}
      <Card>
        <CardTitle>Em aberto · {fmt(unpaid.reduce((a, b) => a + b.amount, 0))}</CardTitle>
        <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
          {unpaid.length === 0 && <Empty text="Nada em aberto. 🎉" />}
          {unpaid.map((b) => {
            const dl = dueLabel(b.due);
            return (
              <Row key={b.id}>
                <div><p className="rt">{b.title} {b.recurring && <span style={{ color: T.text3, fontSize: 11 }}>↻</span>}</p><p className="rs" style={{ color: tone(dl.tone) }}>{dl.text} · {b.cat} · {b.method}</p></div>
                <span style={{ display: "flex", alignItems: "center", gap: 10 }}><Num>{fmt(b.amount)}</Num><button className="btnPay" onClick={() => { set({ bills: db.bills.map((x) => x.id === b.id ? { ...x, paid: true } : x) }); DB.setBillPaid(b.id, true); }}>Paguei</button><button className="link" style={{ color: T.text3, fontSize: 18 }} onClick={() => { set({ bills: db.bills.filter((x) => x.id !== b.id) }); DB.delBill(b.id); }}>×</button></span>
              </Row>
            );
          })}
        </div>
      </Card>

      {/* Gastos do mês: Pessoal vs Empresa */}
      <div className="gridWrap" style={{ display: "grid", gap: 12 }}>
        <ExpenseBucket title={`Gasto Pessoal${displayName ? " · " + displayName : ""}`} color={T.accentLight} items={pessoal} onDel={delExp} />
        <ExpenseBucket title="Gasto Empresa" color={T.cyan} items={empresa} onDel={delExp} />
      </div>

      {paid.length > 0 && (
        <Card style={{ opacity: 0.65 }}>
          <CardTitle>Pagas</CardTitle>
          <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
            {paid.map((b) => <Row key={b.id}><p className="rt" style={{ textDecoration: "line-through", color: T.text2 }}>{b.title}</p><span style={{ display: "flex", gap: 8, alignItems: "center" }}><Num dim>{fmt(b.amount)}</Num><button className="link" onClick={() => { set({ bills: db.bills.map((x) => x.id === b.id ? { ...x, paid: false } : x) }); DB.setBillPaid(b.id, false); }}>desfazer</button></span></Row>)}
          </div>
        </Card>
      )}
    </div>
  );
}

function ExpenseBucket({ title, color, items, onDel }) {
  const total = items.reduce((a, e) => a + e.amount, 0);
  return (
    <Card glow={color}>
      <Row style={{ alignItems: "baseline" }}>
        <CardTitle>{title}</CardTitle>
        <Num style={{ color, fontSize: 16 }}>{fmt(total)}</Num>
      </Row>
      <p style={{ margin: "2px 0 10px", fontSize: 10, color: T.text3, textTransform: "uppercase", letterSpacing: 0.5 }}>este mês</p>
      <div style={{ display: "grid", gap: 6 }}>
        {items.length === 0 && <Empty text="Sem gastos ainda." />}
        {items.slice(0, 20).map((e) => (
          <Row key={e.id}>
            <div><p className="rt" style={{ fontSize: 13 }}>{e.title}</p><p className="rs">{e.date.slice(8, 10)}/{e.date.slice(5, 7)} · {e.cat} · {e.method}</p></div>
            <span style={{ display: "flex", gap: 8, alignItems: "center" }}><Num sm style={{ color: T.red }}>{fmt(e.amount)}</Num><button className="link" onClick={() => onDel(e.id)}>×</button></span>
          </Row>
        ))}
      </div>
    </Card>
  );
}

/* ============================== VENDAS ================================== */
function Vendas({ db, set }) {
  const [range, setRange] = useState("hoje");
  const filtered = useMemo(() => filterByRange(db.sales, range), [db.sales, range]);
  const total = filtered.reduce((a, s) => a + s.amount, 0);
  const byPlat = PLATFORMS.map((p) => ({ ...p, total: filtered.filter((s) => s.platform === p.id).reduce((a, s) => a + s.amount, 0) }));
  const max = Math.max(1, ...byPlat.map((p) => p.total));
  const traffic = filterByRange(db.expenses, range).filter((e) => e.cat === "Tráfego").reduce((a, e) => a + e.amount, 0);
  const roi = traffic > 0 ? total / traffic : null;
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <Row><H2>Vendas</H2><Seg value={range} setValue={setRange} options={[["hoje", "Hoje"], ["7d", "7d"], ["mes", "Mês"]]} /></Row>
      <Card>
        <Row style={{ alignItems: "baseline" }}>
          <div><CardTitle>Faturamento</CardTitle><p style={{ margin: "4px 0 0", fontFamily: T.mono, fontWeight: 700, fontSize: 30, letterSpacing: "-0.02em", color: T.green }}>{fmt(total)}</p></div>
          {roi && <div style={{ textAlign: "right" }}><p style={{ margin: 0, fontSize: 10, color: T.text3, textTransform: "uppercase", letterSpacing: 1 }}>ROAS</p><p style={{ margin: 0, fontFamily: T.mono, fontWeight: 700, fontSize: 21, letterSpacing: "-0.01em", color: roi >= 1.5 ? T.green : T.yellow }}>{roi.toFixed(2)}x</p></div>}
        </Row>
        <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
          {byPlat.map((p) => (
            <div key={p.id}>
              <Row style={{ fontSize: 12, marginBottom: 4 }}><span style={{ color: p.color, fontWeight: 600 }}>{p.label}</span><Num sm>{fmt(p.total)}</Num></Row>
              <div className="bar"><div className="barFill" style={{ width: `${(p.total / max) * 100}%`, background: p.color }} /></div>
            </div>
          ))}
        </div>
        {traffic > 0 && <p style={{ margin: "12px 0 0", fontSize: 12, color: T.text2 }}>Tráfego no período: <b style={{ color: T.red, fontFamily: T.mono }}>{fmt(traffic)}</b></p>}
      </Card>
      <Card>
        <CardTitle>Lançamentos</CardTitle>
        <div style={{ display: "grid", gap: 6, marginTop: 10 }}>
          {filtered.length === 0 && <Empty text="Sem vendas. Toca no + pra registrar." />}
          {filtered.slice(0, 30).map((s) => { const p = PLATFORMS.find((x) => x.id === s.platform); return <Row key={s.id}><div><p className="rt"><span style={{ color: p?.color }}>{p?.label}</span> · {s.method}</p><p className="rs">{s.date}</p></div><span style={{ display: "flex", gap: 8, alignItems: "center" }}><Num style={{ color: T.green }}>{fmt(s.amount)}</Num><button className="link" onClick={() => { set({ sales: db.sales.filter((x) => x.id !== s.id) }); DB.delSale(s.id); }}>×</button></span></Row>; })}
        </div>
      </Card>
    </div>
  );
}

/* ============================== CARTÕES ================================= */
function Cartoes({ db, set, owe, owed, onOpen, onNew }) {
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <Row><H2>Cartões & saldos</H2><button className="btnGhost" onClick={onNew}>+ Cartão</button></Row>

      {/* Cartões visuais */}
      <div className="cardsGrid" style={{ display: "grid", gap: 14 }}>
        {db.cards.length === 0 && <Empty text="Cadastre seu primeiro cartão no + acima." />}
        {db.cards.map((c) => {
          const used = openOnCard(db.purchases, c.id);
          const avail = c.limit - used;
          const pct = Math.min(100, (used / c.limit) * 100);
          const theme = CARD_THEMES.find((t) => t.id === c.theme) || CARD_THEMES[0];
          return (
            <button key={c.id} onClick={() => onOpen(c.id)} className="creditCard" style={{ background: theme.grad, boxShadow: `0 14px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.06), 0 0 30px ${theme.glow}22` }}>
              <div style={{ position: "absolute", top: 0, right: 0, width: 180, height: 180, background: `radial-gradient(circle at 70% 30%, ${theme.glow}33, transparent 60%)`, pointerEvents: "none" }} />
              <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", height: "100%", justifyContent: "space-between" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div style={{ textAlign: "left" }}>
                    <p style={{ margin: 0, fontFamily: T.display, fontWeight: 800, fontSize: 17, color: "#fff", letterSpacing: "-0.02em" }}>{c.name}</p>
                    <span className="tierBadge">{c.tier}</span>
                  </div>
                  <div style={{ width: 34, height: 26, borderRadius: 5, background: "linear-gradient(135deg,#f5d67b,#c9a227)", opacity: 0.9 }} />
                </div>
                <div style={{ textAlign: "left" }}>
                  <p style={{ margin: "0 0 6px", fontFamily: T.mono, fontSize: 14, color: "rgba(255,255,255,0.85)", letterSpacing: 2 }}>•••• {c.last4 || "0000"}</p>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
                    <div>
                      <p style={{ margin: 0, fontSize: 9, color: "rgba(255,255,255,0.6)", textTransform: "uppercase", letterSpacing: 1 }}>Disponível</p>
                      <p style={{ margin: 0, fontFamily: T.mono, fontWeight: 600, fontSize: 18, color: "#fff" }}>{fmt(avail)}</p>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <p style={{ margin: 0, fontSize: 9, color: "rgba(255,255,255,0.6)" }}>vence dia {c.dueDay}</p>
                      <p style={{ margin: 0, fontSize: 11, color: "rgba(255,255,255,0.85)", fontFamily: T.mono }}>{BRANDS.find((b) => b.id === c.brand)?.label}</p>
                    </div>
                  </div>
                  <div className="cardBar" style={{ marginTop: 8 }}><div style={{ height: "100%", width: `${pct}%`, background: pct > 80 ? "#ff6b6b" : "rgba(255,255,255,0.9)", borderRadius: 999 }} /></div>
                  <p style={{ margin: "4px 0 0", fontSize: 10, color: "rgba(255,255,255,0.7)", fontFamily: T.mono }}>{fmt(used)} usado de {fmt(c.limit)}</p>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Saldos PIX */}
      <BalancesCard db={db} set={set} />

      {/* Dívidas */}
      <Card>
        <CardTitle>Quem deve quem</CardTitle>
        <div style={{ marginTop: 10 }}><DebtManager db={db} set={set} /></div>
      </Card>
    </div>
  );
}

function BalancesCard({ db, set }) {
  const [form, setForm] = useState(false);
  return (
    <Card>
      <Row><CardTitle>Saldos PIX / contas</CardTitle><button className="btnGhost" onClick={() => setForm((s) => !s)}>{form ? "Fechar" : "+ Saldo"}</button></Row>
      {form && <div style={{ marginTop: 10 }}><BalanceForm onSave={async (b) => { setForm(false); const { data } = await DB.addBalance(b); set({ balances: [data || { id: uid(), ...b }, ...db.balances] }); }} /></div>}
      <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
        {db.balances.map((b) => (
          <Row key={b.id}>
            <p className="rt">{b.name}</p>
            <span style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <input className="inlineNum" type="number" value={b.amount} onChange={(e) => { const v = parseFloat(e.target.value) || 0; set({ balances: db.balances.map((x) => x.id === b.id ? { ...x, amount: v } : x) }); DB.updateBalance(b.id, v); }} />
              <button className="link" onClick={() => { set({ balances: db.balances.filter((x) => x.id !== b.id) }); DB.delBalance(b.id); }}>×</button>
            </span>
          </Row>
        ))}
      </div>
    </Card>
  );
}

/* ===================== CARD DETAIL (entrar no cartão) =================== */
function CardDetail({ card, purchases, onClose, onAddPurchase, onPayInstallment, onDelPurchase, onDelCard, allPurchases }) {
  const [addMode, setAddMode] = useState(false);
  const used = openOnCard(allPurchases, card.id);
  const avail = card.limit - used;
  const theme = CARD_THEMES.find((t) => t.id === card.theme) || CARD_THEMES[0];

  // projeção dos próximos 6 meses
  const months = Array.from({ length: 6 }, (_, i) => addMonthsKey(monthKey(), i));
  const monthTotals = months.map((mk) => ({ mk, total: monthBill(allPurchases, card.id, mk) }));
  const maxMonth = Math.max(1, ...monthTotals.map((m) => m.total));

  return (
    <Sheet onClose={onClose} title={`${card.name} · ${card.tier}`} tall>
      {/* mini cartão */}
      <div style={{ background: theme.grad, borderRadius: 14, padding: 14, marginBottom: 14, position: "relative", overflow: "hidden" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div><p style={{ margin: 0, fontFamily: T.mono, fontSize: 12, color: "rgba(255,255,255,0.8)", letterSpacing: 2 }}>•••• {card.last4}</p><p style={{ margin: "4px 0 0", fontSize: 10, color: "rgba(255,255,255,0.6)" }}>fecha dia {card.closing} · vence dia {card.dueDay}</p></div>
          <div style={{ textAlign: "right" }}><p style={{ margin: 0, fontSize: 9, color: "rgba(255,255,255,0.6)", textTransform: "uppercase" }}>Disponível</p><p style={{ margin: 0, fontFamily: T.mono, fontWeight: 700, fontSize: 21, letterSpacing: "-0.01em", color: "#fff" }}>{fmt(avail)}</p></div>
        </div>
      </div>

      {/* projeção mensal — o que você pediu: parcelas redistribuídas */}
      <CardTitle>Fatura projetada · 6 meses</CardTitle>
      <div style={{ display: "flex", gap: 6, alignItems: "flex-end", height: 92, margin: "10px 0 4px" }}>
        {monthTotals.map((m, i) => (
          <div key={m.mk} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            <span style={{ fontSize: 9, fontFamily: T.mono, color: T.text2 }}>{m.total > 0 ? fmtShort(m.total).split(",")[0] : ""}</span>
            <div style={{ width: "100%", height: `${(m.total / maxMonth) * 62}px`, minHeight: m.total > 0 ? 4 : 0, background: i === 0 ? theme.glow : theme.glow + "66", borderRadius: "5px 5px 0 0", transition: "height .4s" }} />
            <span style={{ fontSize: 9, color: i === 0 ? T.text1 : T.text3, fontWeight: i === 0 ? 700 : 400 }}>{monthLabel(m.mk).split("/")[0]}</span>
          </div>
        ))}
      </div>
      <p style={{ fontSize: 11, color: T.text2, margin: "0 0 16px" }}>Este mês: <b style={{ color: T.text1, fontFamily: T.mono }}>{fmt(monthTotals[0].total)}</b></p>

      {/* compras */}
      <Row style={{ marginBottom: 8 }}><CardTitle>Compras no cartão</CardTitle><button className="btnGhost" onClick={() => setAddMode((s) => !s)}>{addMode ? "Fechar" : "+ Compra"}</button></Row>
      {addMode && <PurchaseForm onSave={(p) => { onAddPurchase(p); setAddMode(false); }} />}
      <div style={{ display: "grid", gap: 8, marginTop: addMode ? 12 : 0 }}>
        {purchases.length === 0 && <Empty text="Nenhuma compra lançada." />}
        {purchases.map((p) => {
          if (p.recurring) {
            return (
              <div key={p.id} style={{ background: T.raised, border: `1px solid ${T.cyan}44`, borderRadius: 12, padding: 12 }}>
                <Row>
                  <div><p className="rt">{p.desc} <span style={{ color: T.cyan, fontSize: 11 }}>↻ mensal</span></p><p className="rs">{fmt(p.total)}/mês · desde {monthLabel(p.startMonth)}</p></div>
                  <button className="link" onClick={() => onDelPurchase(p.id)}>×</button>
                </Row>
                <p style={{ margin: "6px 0 0", fontSize: 11, color: T.text2 }}>Assinatura fixa — repete todo mês na fatura.</p>
              </div>
            );
          }
          const val = purchaseInstallmentValue(p);
          const paid = paidCount(p);
          const remaining = p.installments - paid;
          return (
            <div key={p.id} style={{ background: T.raised, border: `1px solid ${T.border}`, borderRadius: 12, padding: 12 }}>
              <Row>
                <div><p className="rt">{p.desc}</p><p className="rs">{fmt(val)} × {p.installments} · começou {monthLabel(p.startMonth)}</p></div>
                <button className="link" onClick={() => onDelPurchase(p.id)}>×</button>
              </Row>
              <div style={{ marginTop: 8 }}>
                <div style={{ display: "flex", gap: 3 }}>
                  {Array.from({ length: p.installments }).map((_, i) => <div key={i} style={{ flex: 1, height: 5, borderRadius: 2, background: i < paid ? T.green : "rgba(255,255,255,0.08)" }} />)}
                </div>
                <Row style={{ marginTop: 8 }}>
                  <span style={{ fontSize: 11, color: T.text2 }}>{remaining > 0 ? `${remaining} parcela(s) · falta ${fmt(val * remaining)}` : "Quitado ✅"}</span>
                  {remaining > 0 && <button className="btnPaySm" onClick={() => onPayInstallment(p.id)}>Paguei 1 parcela</button>}
                </Row>
              </div>
            </div>
          );
        })}
      </div>

      <button className="link" style={{ color: T.red, marginTop: 18, display: "block" }} onClick={onDelCard}>Excluir cartão</button>
    </Sheet>
  );
}

/* ============================ SUB-COMPONENTS ============================= */
function DebtManager({ db, set }) {
  const [form, setForm] = useState(false);
  const [payingId, setPayingId] = useState(null);
  const [payVal, setPayVal] = useState("");
  const active = db.debts.filter((d) => !d.settled);

  const registerPay = (d) => {
    const add = parseFloat(payVal) || 0;
    if (add <= 0) return;
    const newPaid = Math.min(d.amount, (d.paid || 0) + add);
    const settled = newPaid >= d.amount;
    set({ debts: db.debts.map((x) => x.id === d.id ? { ...x, paid: newPaid, settled } : x) });
    DB.payDebt(d.id, newPaid, d.amount);
    setPayingId(null); setPayVal("");
  };

  return (
    <div style={{ display: "grid", gap: 10 }}>
      {active.length === 0 && <Empty text="Ninguém deve nada. Limpo." />}
      {active.map((d) => {
        const paid = d.paid || 0;
        const remaining = d.amount - paid;
        const pct = Math.min(100, (paid / d.amount) * 100);
        const col = d.direction === "owe" ? T.red : T.green;
        return (
          <div key={d.id} style={{ background: T.raised, border: `1px solid ${T.border}`, borderRadius: 12, padding: 12 }}>
            <Row>
              <div><p className="rt">{d.who}</p><p className="rs" style={{ color: col }}>{d.direction === "owe" ? "Eu devo" : "Me devem"}{d.note ? " · " + d.note : ""}</p></div>
              <button className="link" style={{ color: T.text3, fontSize: 18 }} onClick={() => { set({ debts: db.debts.filter((x) => x.id !== d.id) }); DB.delDebt(d.id); }}>×</button>
            </Row>
            <div style={{ marginTop: 8 }}>
              <div className="bar"><div className="barFill" style={{ width: `${pct}%`, background: col }} /></div>
              <Row style={{ marginTop: 6 }}>
                <span style={{ fontSize: 11, color: T.text2, fontFamily: T.mono }}>{fmt(paid)} de {fmt(d.amount)} · falta {fmt(remaining)}</span>
              </Row>
            </div>
            {payingId === d.id ? (
              <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                <input className="input" type="number" autoFocus placeholder="Valor pago" value={payVal} onChange={(e) => setPayVal(e.target.value)} onKeyDown={(e) => e.key === "Enter" && registerPay(d)} style={{ flex: 1 }} />
                <button className="btnPay" onClick={() => registerPay(d)}>OK</button>
                <button className="link" onClick={() => { setPayingId(null); setPayVal(""); }}>×</button>
              </div>
            ) : (
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <button className="btnPaySm" onClick={() => { setPayingId(d.id); setPayVal(""); }}>Registrar pagamento</button>
                <button className="btnPaySm" style={{ background: col + "22", color: col, borderColor: col + "55" }} onClick={() => { set({ debts: db.debts.map((x) => x.id === d.id ? { ...x, paid: d.amount, settled: true } : x) }); DB.payDebt(d.id, d.amount, d.amount); }}>Quitar tudo</button>
              </div>
            )}
          </div>
        );
      })}
      <button className="btnGhost" style={{ marginTop: 4 }} onClick={() => setForm((s) => !s)}>{form ? "Fechar" : "+ Dívida"}</button>
      {form && <DebtForm onSave={async (d) => { setForm(false); const { data } = await DB.addDebt(d); set({ debts: [data || { id: uid(), settled: false, paid: 0, ...d }, ...db.debts] }); }} />}
    </div>
  );
}

/* ------------------------------ Forms ------------------------------------ */
function Field({ label, children }) { return <label style={{ display: "grid", gap: 4 }}><span style={{ fontSize: 11, color: T.text2 }}>{label}</span>{children}</label>; }

function QuickMenu({ onClose, onSale, onExpense }) {
  return (
    <Sheet onClose={onClose} title="Registrar rápido">
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <button className="bigBtn" style={{ borderColor: T.green + "55" }} onClick={onSale}><span style={{ fontSize: 24 }}>↗</span><span>Venda</span></button>
        <button className="bigBtn" style={{ borderColor: T.red + "55" }} onClick={onExpense}><span style={{ fontSize: 24 }}>↘</span><span>Gasto</span></button>
      </div>
    </Sheet>
  );
}
function QuickSale({ onClose, onSave }) {
  const [platform, setPlatform] = useState("kwai");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("PIX");
  const ref = useRef();
  useEffect(() => ref.current?.focus(), []);
  const save = () => { if (!amount) return; onSave({ date: todayISO(), platform, amount: parseFloat(amount), method }); };
  return (
    <Sheet onClose={onClose} title="Nova venda">
      <div style={{ display: "grid", gap: 14 }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{PLATFORMS.map((p) => <button key={p.id} onClick={() => setPlatform(p.id)} className="pchip" style={{ borderColor: platform === p.id ? p.color : T.border, background: platform === p.id ? p.color + "22" : "transparent", color: platform === p.id ? p.color : T.text2 }}>{p.label}</button>)}</div>
        <Field label="Valor"><input ref={ref} className="bigInput" type="number" inputMode="decimal" placeholder="0,00" value={amount} onChange={(e) => setAmount(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()} /></Field>
        <div style={{ display: "flex", gap: 6 }}>{PAY_METHODS.slice(0, 2).map((m) => <button key={m} onClick={() => setMethod(m)} className="pchip" style={{ flex: 1, borderColor: method === m ? T.accent : T.border, color: method === m ? T.accentLight : T.text2 }}>{m}</button>)}</div>
        <button className="btnPrimary" onClick={save}>Salvar venda</button>
      </div>
    </Sheet>
  );
}
function QuickExpense({ onClose, onSave }) {
  const [title, setTitle] = useState(""); const [amount, setAmount] = useState(""); const [cat, setCat] = useState("Tráfego"); const [method, setMethod] = useState("PIX");
  const ref = useRef(); useEffect(() => ref.current?.focus(), []);
  const save = () => { if (!amount) return; onSave({ date: todayISO(), title: title || cat, amount: parseFloat(amount), cat, method }); };
  return (
    <Sheet onClose={onClose} title="Novo gasto">
      <div style={{ display: "grid", gap: 14 }}>
        <Field label="Valor"><input ref={ref} className="bigInput" type="number" inputMode="decimal" placeholder="0,00" value={amount} onChange={(e) => setAmount(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()} /></Field>
        <Field label="Descrição (opcional)"><input className="input" placeholder="ex: Kwai bid 8" value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{CATS_OUT.map((c) => <button key={c} onClick={() => setCat(c)} className="pchip" style={{ borderColor: cat === c ? T.accent : T.border, color: cat === c ? T.accentLight : T.text2 }}>{c}</button>)}</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{PAY_METHODS.map((m) => <button key={m} onClick={() => setMethod(m)} className="pchip" style={{ borderColor: method === m ? T.cyan : T.border, color: method === m ? T.cyan : T.text2 }}>{m}</button>)}</div>
        <button className="btnPrimary" onClick={save}>Salvar gasto</button>
      </div>
    </Sheet>
  );
}
function BillForm({ onSave }) {
  const [f, setF] = useState({ title: "", amount: "", due: todayISO(), method: "Boleto", cat: "Empresa", recurring: false });
  const up = (k, v) => setF((p) => ({ ...p, [k]: v }));
  return (
    <Card style={{ display: "grid", gap: 12 }}>
      <Field label="Título"><input className="input" value={f.title} onChange={(e) => up("title", e.target.value)} placeholder="ex: Fatura Nubank" /></Field>
      <div style={{ display: "flex", gap: 10 }}><Field label="Valor"><input className="input" type="number" value={f.amount} onChange={(e) => up("amount", e.target.value)} placeholder="0,00" /></Field><Field label="Vencimento"><input className="input" type="date" value={f.due} onChange={(e) => up("due", e.target.value)} /></Field></div>
      <div style={{ display: "flex", gap: 10 }}><Field label="Forma"><select className="input" value={f.method} onChange={(e) => up("method", e.target.value)}>{PAY_METHODS.map((m) => <option key={m}>{m}</option>)}</select></Field><Field label="Categoria"><select className="input" value={f.cat} onChange={(e) => up("cat", e.target.value)}>{CATS_OUT.map((c) => <option key={c}>{c}</option>)}</select></Field></div>
      <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, color: T.text2 }}><input type="checkbox" checked={f.recurring} onChange={(e) => up("recurring", e.target.checked)} /> Recorrente (todo mês)</label>
      <button className="btnPrimary" onClick={() => f.amount && onSave({ ...f, amount: parseFloat(f.amount) })}>Adicionar conta</button>
    </Card>
  );
}
function CardForm({ onClose, onSave }) {
  const [f, setF] = useState({ name: "", brand: "visa", tier: "Black", theme: "obsidian", limit: "", closing: 3, dueDay: 10, last4: "" });
  const up = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const theme = CARD_THEMES.find((t) => t.id === f.theme);
  return (
    <Sheet onClose={onClose} title="Novo cartão" tall>
      {/* preview ao vivo */}
      <div style={{ background: theme.grad, borderRadius: 14, padding: 16, marginBottom: 16, minHeight: 120, position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: 0, right: 0, width: 140, height: 140, background: `radial-gradient(circle at 70% 30%, ${theme.glow}33, transparent 60%)` }} />
        <div style={{ position: "relative" }}>
          <p style={{ margin: 0, fontFamily: T.display, fontWeight: 800, fontSize: 16, color: "#fff" }}>{f.name || "Nome do cartão"}</p>
          <span className="tierBadge">{f.tier}</span>
          <p style={{ margin: "18px 0 0", fontFamily: T.mono, fontSize: 13, color: "rgba(255,255,255,0.8)", letterSpacing: 2 }}>•••• {f.last4 || "0000"}</p>
        </div>
      </div>
      <div style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "flex", gap: 10 }}><Field label="Nome (banco)"><input className="input" value={f.name} onChange={(e) => up("name", e.target.value)} placeholder="Sicoob" /></Field><Field label="Final (4 díg.)"><input className="input" maxLength={4} value={f.last4} onChange={(e) => up("last4", e.target.value)} placeholder="4471" /></Field></div>
        <Field label="Cor do cartão"><div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{CARD_THEMES.map((t) => <button key={t.id} onClick={() => up("theme", t.id)} style={{ width: 40, height: 28, borderRadius: 8, background: t.grad, border: `2px solid ${f.theme === t.id ? "#fff" : "transparent"}`, cursor: "pointer" }} title={t.label} />)}</div></Field>
        <div style={{ display: "flex", gap: 10 }}><Field label="Bandeira"><select className="input" value={f.brand} onChange={(e) => up("brand", e.target.value)}>{BRANDS.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}</select></Field><Field label="Tier"><select className="input" value={f.tier} onChange={(e) => up("tier", e.target.value)}>{TIERS.map((t) => <option key={t}>{t}</option>)}</select></Field></div>
        <div style={{ display: "flex", gap: 10 }}><Field label="Limite"><input className="input" type="number" value={f.limit} onChange={(e) => up("limit", e.target.value)} placeholder="12000" /></Field><Field label="Fecha dia"><input className="input" type="number" value={f.closing} onChange={(e) => up("closing", e.target.value)} /></Field><Field label="Vence dia"><input className="input" type="number" value={f.dueDay} onChange={(e) => up("dueDay", e.target.value)} /></Field></div>
        <button className="btnPrimary" onClick={() => f.name && f.limit && onSave({ ...f, limit: parseFloat(f.limit), closing: +f.closing, dueDay: +f.dueDay })}>Adicionar cartão</button>
      </div>
    </Sheet>
  );
}
function PurchaseForm({ onSave }) {
  const [f, setF] = useState({ desc: "", total: "", installments: 1, startMonth: monthKey(), paid: 0, recurring: false });
  const up = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const perInstallment = f.total && f.installments ? parseFloat(f.total) / f.installments : 0;
  return (
    <div style={{ background: T.raised, border: `1px solid ${T.border}`, borderRadius: 12, padding: 12, display: "grid", gap: 10 }}>
      {/* seletor tipo: parcelada x assinatura */}
      <div style={{ display: "flex", gap: 6 }}>
        <button className="pchip" style={{ flex: 1, borderColor: !f.recurring ? T.accent : T.border, color: !f.recurring ? T.accentLight : T.text2 }} onClick={() => up("recurring", false)}>Compra parcelada</button>
        <button className="pchip" style={{ flex: 1, borderColor: f.recurring ? T.cyan : T.border, color: f.recurring ? T.cyan : T.text2 }} onClick={() => up("recurring", true)}>Assinatura mensal ↻</button>
      </div>
      <Field label={f.recurring ? "Nome da assinatura" : "O que comprou"}><input className="input" value={f.desc} onChange={(e) => up("desc", e.target.value)} placeholder={f.recurring ? "ex: Netflix, Xtracky" : "ex: MacBook"} /></Field>
      {f.recurring ? (
        <>
          <Field label="Valor por mês"><input className="input" type="number" value={f.total} onChange={(e) => up("total", e.target.value)} placeholder="97" /></Field>
          <p style={{ margin: 0, fontSize: 12, color: T.cyan, fontFamily: T.mono }}>{f.total ? fmt(parseFloat(f.total)) : "R$ —"}/mês fixo · repete todo mês na fatura</p>
        </>
      ) : (
        <>
          <div style={{ display: "flex", gap: 10 }}>
            <Field label="Valor total"><input className="input" type="number" value={f.total} onChange={(e) => up("total", e.target.value)} placeholder="12000" /></Field>
            <Field label="Parcelas"><input className="input" type="number" min={1} value={f.installments} onChange={(e) => up("installments", Math.max(1, +e.target.value || 1))} /></Field>
          </div>
          <Field label="Parcelas já pagas (se houver)"><input className="input" type="number" min={0} max={f.installments} value={f.paid} onChange={(e) => up("paid", Math.min(f.installments, Math.max(0, +e.target.value || 0)))} /></Field>
          {perInstallment > 0 && <p style={{ margin: 0, fontSize: 12, color: T.accentLight, fontFamily: T.mono }}>{f.installments}× de {fmt(perInstallment)} → some no limite até quitar</p>}
        </>
      )}
      <button className="btnPrimary" onClick={() => f.desc && f.total && onSave({ ...f, total: parseFloat(f.total), installments: f.recurring ? 1 : +f.installments, paid: f.recurring ? 0 : +f.paid })}>{f.recurring ? "Lançar assinatura" : "Lançar compra"}</button>
    </div>
  );
}
function BalanceForm({ onSave }) {
  const [name, setName] = useState(""); const [amount, setAmount] = useState("");
  return (
    <div style={{ display: "flex", gap: 8 }}>
      <input className="input" placeholder="Nome (ex: PIX Kwai)" value={name} onChange={(e) => setName(e.target.value)} style={{ flex: 2 }} />
      <input className="input" type="number" placeholder="R$" value={amount} onChange={(e) => setAmount(e.target.value)} style={{ flex: 1 }} />
      <button className="btnPrimary" style={{ padding: "0 16px" }} onClick={() => name && onSave({ name, amount: parseFloat(amount) || 0 })}>OK</button>
    </div>
  );
}
function DebtForm({ onSave }) {
  const [f, setF] = useState({ who: "", amount: "", direction: "owe", note: "" });
  const up = (k, v) => setF((p) => ({ ...p, [k]: v }));
  return (
    <div style={{ display: "grid", gap: 10, marginTop: 4 }}>
      <div style={{ display: "flex", gap: 6 }}><button className="pchip" style={{ flex: 1, borderColor: f.direction === "owe" ? T.red : T.border, color: f.direction === "owe" ? T.red : T.text2 }} onClick={() => up("direction", "owe")}>Eu devo</button><button className="pchip" style={{ flex: 1, borderColor: f.direction === "owed" ? T.green : T.border, color: f.direction === "owed" ? T.green : T.text2 }} onClick={() => up("direction", "owed")}>Me devem</button></div>
      <input className="input" placeholder="Quem" value={f.who} onChange={(e) => up("who", e.target.value)} />
      <div style={{ display: "flex", gap: 8 }}><input className="input" type="number" placeholder="R$" value={f.amount} onChange={(e) => up("amount", e.target.value)} style={{ flex: 1 }} /><input className="input" placeholder="Nota" value={f.note} onChange={(e) => up("note", e.target.value)} style={{ flex: 2 }} /></div>
      <button className="btnPrimary" onClick={() => f.who && f.amount && onSave({ ...f, amount: parseFloat(f.amount) })}>Adicionar</button>
    </div>
  );
}

/* ------------------------------ Atoms ------------------------------------ */
function Card({ children, style, glow, accent }) {
  return <section style={{ background: accent ? `linear-gradient(180deg, ${accent}, ${T.card})` : T.card, border: `1px solid ${glow ? glow + "55" : T.border}`, borderRadius: 16, padding: 16, boxShadow: glow ? `0 0 30px ${glow}18` : "none", ...style }}>{children}</section>;
}
function CardTitle({ children, style }) { return <h3 style={{ margin: 0, fontSize: 12, fontWeight: 600, color: T.text2, textTransform: "uppercase", letterSpacing: 0.6, fontFamily: T.sans, ...style }}>{children}</h3>; }
function H2({ children }) { return <h2 className="h2title" style={{ fontFamily: T.display, fontWeight: 800, fontSize: 20, margin: 0, letterSpacing: "-0.02em" }}>{children}</h2>; }
function Row({ children, style }) { return <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, ...style }}>{children}</div>; }
function Num({ children, style, dim, sm }) { return <span style={{ fontFamily: T.mono, fontWeight: 700, fontSize: sm ? 12 : 14, color: dim ? T.text2 : T.text1, letterSpacing: "-0.01em", ...style }}>{children}</span>; }
function Stat({ label, value, color }) { return <div><p style={{ margin: 0, fontSize: 10, color: T.text3, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</p><p style={{ margin: "2px 0 0", fontFamily: T.mono, fontWeight: 600, fontSize: 16, color }}>{value}</p></div>; }
function Pill({ label, value, color }) { return <div style={{ flex: 1, background: "rgba(255,255,255,0.03)", borderRadius: 12, padding: "8px 12px" }}><p style={{ margin: 0, fontSize: 10, color: T.text3 }}>{label}</p><p style={{ margin: "2px 0 0", fontWeight: 600, color, fontFamily: T.mono, fontSize: 13 }}>{value}</p></div>; }
function Empty({ text }) { return <p style={{ margin: 0, color: T.text3, fontSize: 13, textAlign: "center", padding: "10px 0" }}>{text}</p>; }
function Seg({ value, setValue, options }) { return <div className="seg">{options.map(([id, l]) => <button key={id} className="segBtn" style={{ background: value === id ? T.accent : "transparent", color: value === id ? "#fff" : T.text2, fontWeight: value === id ? 600 : 400 }} onClick={() => setValue(id)}>{l}</button>)}</div>; }
function Sheet({ children, title, onClose, tall }) {
  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" style={{ maxHeight: tall ? "92vh" : "80vh" }} onClick={(e) => e.stopPropagation()}>
        <Row style={{ marginBottom: 16 }}><h3 style={{ margin: 0, fontFamily: T.display, fontWeight: 800, fontSize: 18 }}>{title}</h3><button className="link" onClick={onClose} style={{ fontSize: 22 }}>×</button></Row>
        <div style={{ overflowY: "auto", maxHeight: tall ? "80vh" : "68vh" }} className="no-scrollbar">{children}</div>
      </div>
    </div>
  );
}
function GridBg() {
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none", zIndex: 0 }}>
      <svg width="100%" height="100%" style={{ position: "absolute", inset: 0, opacity: 0.025 }}><defs><pattern id="g" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M 40 0 L 0 0 0 40" fill="none" stroke="#7c6ef7" strokeWidth="0.5" /></pattern></defs><rect width="100%" height="100%" fill="url(#g)" /></svg>
      <div style={{ position: "absolute", top: "8%", left: "50%", width: 500, height: 400, background: "radial-gradient(ellipse, var(--acc-18) 0%, transparent 70%)", transform: "translate(-50%,-50%)" }} />
    </div>
  );
}

function greeting() { const h = new Date().getHours(); return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite"; }
function filterByRange(arr, range) {
  const t = todayISO();
  if (range === "hoje") return arr.filter((x) => x.date === t);
  if (range === "7d") { const c = new Date(); c.setDate(c.getDate() - 6); const ci = c.toISOString().slice(0, 10); return arr.filter((x) => x.date >= ci); }
  const m = t.slice(0, 7); return arr.filter((x) => x.date.slice(0, 7) === m);
}

/* ------------------------------ Styles ----------------------------------- */
function StyleTag() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Poppins:wght@600;700;800&display=swap');
      :root { --acc: #7c6ef7; --acc-l: #a78bfa; --acc-18: #7c6ef72e; --acc-42: #7c6ef76b; }
      * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
      .no-scrollbar { scrollbar-width: none; } .no-scrollbar::-webkit-scrollbar { display: none; }
      .rt { margin: 0; font-weight: 600; font-size: 14px; color: ${T.text1}; }
      .rs { margin: 2px 0 0; font-size: 12px; color: ${T.text2}; }
      .link { background: none; border: none; color: ${T.accentLight}; font-size: 13px; cursor: pointer; font-family: inherit; padding: 0; }
      .chip { font-size: 12px; padding: 4px 10px; border-radius: 999px; border: 1px solid; background: rgba(255,255,255,0.02); }
      .btnPay { background: ${T.green}; color: #04150e; border: none; border-radius: 10px; padding: 7px 12px; font-weight: 700; font-size: 13px; cursor: pointer; font-family: inherit; }
      .btnPaySm { background: rgba(52,211,153,0.14); color: ${T.green}; border: 1px solid rgba(52,211,153,0.35); border-radius: 9px; padding: 5px 10px; font-weight: 600; font-size: 12px; cursor: pointer; font-family: inherit; }
      .btnPay:active, .btnPaySm:active { transform: scale(0.96); }
      .btnPrimary { background: linear-gradient(135deg, ${T.accent}, ${T.accentLight}); color: #fff; border: none; border-radius: 13px; padding: 13px; font-weight: 700; font-size: 15px; cursor: pointer; font-family: inherit; }
      .btnPrimary:active { transform: scale(0.98); }
      .btnGhost { background: var(--acc-18); color: ${T.accentLight}; border: 1px solid var(--acc-42); border-radius: 11px; padding: 7px 13px; font-weight: 600; font-size: 13px; cursor: pointer; font-family: inherit; }
      .input { background: rgba(255,255,255,0.04); border: 1px solid ${T.border}; border-radius: 11px; padding: 11px 12px; color: ${T.text1}; font-size: 15px; font-family: inherit; width: 100%; outline: none; }
      .input:focus { border-color: ${T.accent}; }
      .bigInput { background: rgba(255,255,255,0.04); border: 1px solid ${T.border}; border-radius: 14px; padding: 16px; color: ${T.text1}; font-size: 30px; font-weight: 600; font-family: ${T.mono}; width: 100%; outline: none; text-align: center; }
      .bigInput:focus { border-color: ${T.accent}; }
      .inlineNum { background: rgba(255,255,255,0.04); border: 1px solid ${T.border}; border-radius: 10px; padding: 6px 10px; color: ${T.text1}; font-size: 14px; font-family: ${T.mono}; width: 100px; text-align: right; outline: none; }
      .pchip { padding: 8px 14px; border-radius: 999px; border: 1px solid; background: transparent; font-size: 13px; font-weight: 600; cursor: pointer; font-family: inherit; }
      .bar { height: 8px; background: rgba(255,255,255,0.05); border-radius: 999px; overflow: hidden; }
      .barFill { height: 100%; border-radius: 999px; transition: width 0.5s cubic-bezier(0.4,0,0.2,1); }
      .cardBar { height: 6px; background: rgba(255,255,255,0.2); border-radius: 999px; overflow: hidden; }
      .creditCard { width: 100%; aspect-ratio: 1.7; max-height: 200px; min-height: 165px; border-radius: 18px; padding: 16px; border: none; cursor: pointer; position: relative; overflow: hidden; font-family: inherit; transition: transform .2s; }
      .creditCard:active { transform: scale(0.98); }
      .tierBadge { display: inline-block; margin-top: 4px; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; color: rgba(255,255,255,0.85); border: 1px solid rgba(255,255,255,0.35); border-radius: 6px; padding: 2px 7px; }
      .fab { position: fixed; bottom: 96px; right: 16px; width: 52px; height: 52px; border-radius: 17px; border: none; background: linear-gradient(135deg, ${T.accent}, ${T.accentLight}); color: #fff; font-size: 27px; font-weight: 300; cursor: pointer; box-shadow: 0 8px 24px var(--acc-42); z-index: 45; display: flex; align-items: center; justify-content: center; }
      .fab:active { transform: scale(0.92); }
      .nav { position: fixed; bottom: 0; left: 0; right: 0; display: flex; justify-content: center; padding: 0 10px 12px; padding-bottom: max(12px, env(safe-area-inset-bottom)); z-index: 30; pointer-events: none; }
      .navInner { pointer-events: auto; display: grid; grid-template-columns: repeat(5,1fr); gap: 4px; width: 100%; padding: 6px; border-radius: 20px; background: rgba(10,10,18,0.96); border: 1px solid var(--acc-18); box-shadow: 0 8px 40px rgba(0,0,0,0.6); backdrop-filter: blur(20px); }
      .navBtn { height: 52px; border-radius: 14px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; cursor: pointer; font-family: inherit; transition: all .15s; padding: 0 2px; }
      .navBtn:active { transform: scale(0.94); }
      .seg { display: flex; background: rgba(255,255,255,0.04); border-radius: 11px; padding: 3px; }
      .segBtn { border: none; padding: 6px 12px; border-radius: 8px; font-size: 13px; cursor: pointer; font-family: inherit; }
      .overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.65); backdrop-filter: blur(4px); z-index: 50; display: flex; align-items: flex-end; justify-content: center; animation: fade .2s; }
      .sheet { background: ${T.surface}; border: 1px solid ${T.border}; border-radius: 24px 24px 0 0; padding: 22px 18px calc(24px + env(safe-area-inset-bottom)); width: 100%; max-width: 460px; animation: slideUp .28s cubic-bezier(0.16,1,0.3,1); }
      .bigBtn { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 22px; border-radius: 16px; border: 1px solid; background: rgba(255,255,255,0.03); color: ${T.text1}; font-weight: 600; font-size: 15px; cursor: pointer; font-family: inherit; }
      .bigBtn:active { transform: scale(0.97); }
      @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
      @keyframes fade { from { opacity: 0; } to { opacity: 1; } }
      @media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }

      /* ===================== LAYOUT RESPONSIVO ===================== */
      /* mobile-first: coluna única, sidebar escondida, bottom nav + fab visíveis */
      .shell { position: relative; z-index: 1; }
      .sidebar { display: none; }
      .mainCol { max-width: 480px; margin: 0 auto; padding-bottom: 120px; }
      .topHead { padding: 20px 16px 4px; display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
      .brand { margin: 0; font-family: ${T.display}; font-weight: 800; font-size: 20px; letter-spacing: -0.03em; color: #f0f0ff; }
      .pageTitle { margin: 8px 0 0; font-family: ${T.display}; font-weight: 800; font-size: 26px; letter-spacing: -0.03em; color: #f4f4ff; }
      .content { padding: 8px 14px 0; }
      .toggle { width: 46px; height: 26px; border-radius: 999px; border: none; cursor: pointer; position: relative; transition: background .2s; padding: 3px; }
      .toggleKnob { display: block; width: 20px; height: 20px; border-radius: 50%; background: #fff; transition: transform .2s; }
      .btnDanger { background: rgba(248,113,113,0.12); color: ${T.red}; border: 1px solid rgba(248,113,113,0.35); border-radius: 12px; padding: 12px 18px; font-weight: 700; font-size: 14px; cursor: pointer; font-family: inherit; width: 100%; }
      .btnDanger:active { transform: scale(0.98); }
      .sideNew { margin-top: 20px; width: 100%; background: linear-gradient(135deg, var(--acc), var(--acc-l)); color: #fff; border: none; border-radius: 12px; padding: 12px; font-weight: 700; font-size: 14px; cursor: pointer; font-family: inherit; box-shadow: 0 8px 24px var(--acc-42); }
      .sideNew:active { transform: scale(0.98); }
      .sideBtn:hover { background: rgba(255,255,255,0.04); }
      .h2title { display: none; }  /* título já aparece no header (pageTitle); evita duplicar */
      /* o Row que continha o H2 agora tem só o botão de ação → empurra pra direita */
      .h2title + button, .h2title + .seg { margin-left: auto; }

      /* ===================== DESKTOP (>= 900px) ===================== */
      @media (min-width: 900px) {
        .shell { display: grid; grid-template-columns: 248px 1fr; min-height: 100vh; max-width: 1280px; margin: 0 auto; }
        .sidebar { display: flex; flex-direction: column; padding: 26px 16px; border-right: 1px solid ${T.border}; position: sticky; top: 0; height: 100vh; }
        .mainCol { max-width: 960px; margin: 0; padding: 0 32px 40px; }
        .topHead { padding: 30px 0 10px; }
        .brand { display: none; }              /* logo já está na sidebar */
        .pageTitle { font-size: 30px; margin-top: 2px; }
        .content { padding: 14px 0 0; }
        /* cards em 2 colunas nas telas de grid */
        .content .gridWrap { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; align-items: start; }
        .content .cardsGrid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        .fab, .nav { display: none !important; }  /* desktop usa sidebar */
      }
    `}</style>
  );
}

/* ============================================================================
   SUPABASE — SCHEMA (rode no SQL editor). Padrão igual TioTrack/BossFlow:
   user_id + RLS "own" em cada tabela.

   create table cards (
     id uuid primary key default gen_random_uuid(), user_id uuid default auth.uid(),
     name text, brand text, tier text, theme text, "limit" numeric,
     closing int, due_day int, last4 text, created_at timestamptz default now());

   create table card_purchases (
     id uuid primary key default gen_random_uuid(), user_id uuid default auth.uid(),
     card_id uuid references cards on delete cascade,
     desc text, total numeric, installments int, start_month text, paid int default 0,
     created_at timestamptz default now());

   create table bills (... title, amount, due date, method, cat, paid bool, recurring bool);
   create table debts (... who, amount, direction, note, settled bool);
   create table balances (... name, amount);
   create table sales (... date, platform, amount, method);
   create table expenses (... date, title, amount, cat, method);

   -- RLS por tabela:
   alter table cards enable row level security;
   create policy own on cards for all using (auth.uid()=user_id) with check (auth.uid()=user_id);

   NOTIFICAÇÃO (reaproveita send-reminders do foco3, com jitter anti-habituação):
   - pg_cron diário 8h → bills where paid=false and due <= current_date+3 → Web Push
   - também alerta faturas: para cada card, se hoje == due_day - 2, push do valor do mês
     (monthBill calculado no servidor com a mesma lógica de parcelas daqui).
   ========================================================================== */
