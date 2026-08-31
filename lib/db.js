import { supabase } from "./supabase";

/* ============================================================================
   CAMADA DE DADOS — Central Financeira
   Cada função assume que o usuário está logado; user_id é preenchido por
   default auth.uid() nas tabelas + RLS. Retorna { data, error }.
   As tabelas espelham o estado local do componente:
   cards, card_purchases, bills, debts, balances, sales, expenses.
   ========================================================================== */

/* -------- LOAD: puxa tudo de uma vez (1 round-trip por tabela) -------- */
export async function loadAll() {
  const [cards, purchases, bills, debts, balances, sales, expenses] = await Promise.all([
    supabase.from("cards").select("*").order("created_at", { ascending: false }),
    supabase.from("card_purchases").select("*").order("created_at", { ascending: false }),
    supabase.from("bills").select("*").order("due", { ascending: true }),
    supabase.from("debts").select("*").order("created_at", { ascending: false }),
    supabase.from("balances").select("*").order("created_at", { ascending: false }),
    supabase.from("sales").select("*").order("date", { ascending: false }),
    supabase.from("expenses").select("*").order("date", { ascending: false }),
  ]);
  return {
    cards: cards.data || [],
    purchases: (purchases.data || []).map(mapPurchaseFromDb),
    bills: bills.data || [],
    debts: debts.data || [],
    balances: balances.data || [],
    sales: sales.data || [],
    expenses: expenses.data || [],
    error: cards.error || purchases.error || bills.error || null,
  };
}

/* mapeia snake_case do banco -> camelCase do componente (só onde difere) */
function mapPurchaseFromDb(p) {
  return { id: p.id, cardId: p.card_id, desc: p.descricao, total: Number(p.total), installments: p.installments, startMonth: p.start_month, paid: p.paid, recurring: !!p.recurring };
}
function mapCardFromDb(c) {
  return { id: c.id, name: c.name, brand: c.brand, tier: c.tier, theme: c.theme, limit: Number(c.limit), closing: c.closing, dueDay: c.due_day, last4: c.last4 };
}

/* --------------------------- CARDS --------------------------- */
export async function addCard(c) {
  const { data, error } = await supabase.from("cards").insert({
    name: c.name, brand: c.brand, tier: c.tier, theme: c.theme,
    limit: c.limit, closing: c.closing, due_day: c.dueDay, last4: c.last4,
  }).select().single();
  return { data: data ? mapCardFromDb(data) : null, error };
}
export async function updateCard(id, patch) {
  const row = {};
  if (patch.name != null) row.name = patch.name;
  if (patch.limit != null) row.limit = patch.limit;
  if (patch.closing != null) row.closing = patch.closing;
  if (patch.dueDay != null) row.due_day = patch.dueDay;
  if (patch.theme != null) row.theme = patch.theme;
  if (patch.tier != null) row.tier = patch.tier;
  if (patch.brand != null) row.brand = patch.brand;
  if (patch.last4 != null) row.last4 = patch.last4;
  return supabase.from("cards").update(row).eq("id", id);
}
export async function delCard(id) {
  return supabase.from("cards").delete().eq("id", id); // purchases caem via ON DELETE CASCADE
}

/* --------------------- CARD PURCHASES (parcelas) --------------------- */
export async function addPurchase(p) {
  const { data, error } = await supabase.from("card_purchases").insert({
    card_id: p.cardId, descricao: p.desc, total: p.total,
    installments: p.installments, start_month: p.startMonth, paid: p.paid || 0, recurring: !!p.recurring,
  }).select().single();
  return { data: data ? mapPurchaseFromDb(data) : null, error };
}
export async function payInstallment(id, currentPaid, installments) {
  const paid = Math.min(installments, (currentPaid || 0) + 1);
  return supabase.from("card_purchases").update({ paid }).eq("id", id);
}
export async function delPurchase(id) {
  return supabase.from("card_purchases").delete().eq("id", id);
}

/* --------------------------- BILLS --------------------------- */
export async function addBill(b) {
  const { data, error } = await supabase.from("bills").insert({
    title: b.title, amount: b.amount, due: b.due,
    method: b.method, cat: b.cat, paid: false, recurring: !!b.recurring,
  }).select().single();
  return { data, error };
}
export async function setBillPaid(id, paid) {
  return supabase.from("bills").update({ paid }).eq("id", id);
}
export async function delBill(id) {
  return supabase.from("bills").delete().eq("id", id);
}

/* --------------------------- DEBTS --------------------------- */
export async function addDebt(d) {
  const { data, error } = await supabase.from("debts").insert({
    who: d.who, amount: d.amount, direction: d.direction, note: d.note, settled: false, paid: 0,
  }).select().single();
  return { data, error };
}
export async function settleDebt(id) {
  return supabase.from("debts").update({ settled: true }).eq("id", id);
}
export async function payDebt(id, newPaid, total) {
  const paid = Math.min(total, Math.max(0, newPaid));
  return supabase.from("debts").update({ paid, settled: paid >= total }).eq("id", id);
}
export async function delDebt(id) {
  return supabase.from("debts").delete().eq("id", id);
}

/* --------------------------- BALANCES --------------------------- */
export async function addBalance(b) {
  const { data, error } = await supabase.from("balances").insert({ name: b.name, amount: b.amount }).select().single();
  return { data, error };
}
export async function updateBalance(id, amount) {
  return supabase.from("balances").update({ amount }).eq("id", id);
}
export async function delBalance(id) {
  return supabase.from("balances").delete().eq("id", id);
}

/* --------------------------- SALES / EXPENSES --------------------------- */
export async function addSale(s) {
  const { data, error } = await supabase.from("sales").insert({
    date: s.date, platform: s.platform, amount: s.amount, method: s.method,
  }).select().single();
  return { data, error };
}
export async function delSale(id) {
  return supabase.from("sales").delete().eq("id", id);
}
export async function addExpense(e) {
  const { data, error } = await supabase.from("expenses").insert({
    date: e.date, title: e.title, amount: e.amount, cat: e.cat, method: e.method,
  }).select().single();
  return { data, error };
}
export async function delExpense(id) {
  return supabase.from("expenses").delete().eq("id", id);
}

/* ============================================================================
   MOTOR DE PARCELAS (mesma lógica do componente; exportada pro server usar)
   ========================================================================== */
export function addMonthsKey(key, n) {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return d.toISOString().slice(0, 7);
}
export function purchaseMonths(p) {
  return Array.from({ length: p.installments }, (_, i) => addMonthsKey(p.startMonth, i));
}
export function openOnCard(purchases, cardId) {
  return purchases.filter((p) => p.cardId === cardId).reduce((a, p) => {
    const remaining = p.installments - (p.paid || 0);
    return a + (p.total / p.installments) * remaining;
  }, 0);
}
export function monthBill(purchases, cardId, mk) {
  return purchases.filter((p) => p.cardId === cardId).reduce((a, p) => {
    return purchaseMonths(p).includes(mk) ? a + p.total / p.installments : a;
  }, 0);
}

/* --------------------------- PROFILE --------------------------- */
export async function loadProfile() {
  const { data } = await supabase.from("profiles").select("*").maybeSingle();
  return data; // pode ser null na primeira vez
}
export async function upsertProfile(patch) {
  const { data: u } = await supabase.auth.getUser();
  const uid = u?.user?.id;
  if (!uid) return { error: "no-user" };
  return supabase.from("profiles").upsert({ user_id: uid, ...patch, updated_at: new Date().toISOString() });
}
