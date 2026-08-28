-- ============================================================================
-- CENTRAL FINANCEIRA — schema completo
-- Cole tudo no SQL Editor do Supabase e rode. Padrão igual TioTrack/BossFlow:
-- cada tabela tem user_id default auth.uid() + RLS "own" (dono vê só o seu).
-- ============================================================================

-- ---------- CARDS ----------
create table if not exists cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  brand text,            -- visa | master | elo | amex | hiper
  tier text,             -- Gold | Platinum | Black | Infinite | Standard
  theme text,            -- obsidian | sicoob | nubank | inter | azul | graphite
  "limit" numeric not null default 0,
  closing int default 1, -- dia de fechamento
  due_day int default 10,-- dia de vencimento
  last4 text,
  created_at timestamptz default now()
);

-- ---------- CARD PURCHASES (compras parceladas) ----------
create table if not exists card_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  card_id uuid not null references cards(id) on delete cascade,
  descricao text not null,
  total numeric not null,
  installments int not null default 1,
  start_month text not null,     -- 'YYYY-MM' do primeiro vencimento na fatura
  paid int not null default 0,   -- quantas parcelas já pagas
  created_at timestamptz default now()
);

-- ---------- BILLS (contas a pagar / boletos) ----------
create table if not exists bills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null,
  amount numeric not null,
  due date not null,
  method text,           -- PIX | Cartão | Boleto | Dinheiro
  cat text,              -- Pessoal | Empresa | Tráfego | Ferramentas | Impostos | Outros
  paid boolean default false,
  recurring boolean default false,
  created_at timestamptz default now()
);

-- ---------- DEBTS (dívidas: eu devo / me devem) ----------
create table if not exists debts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  who text not null,
  amount numeric not null,
  direction text not null,   -- 'owe' (eu devo) | 'owed' (me devem)
  note text,
  settled boolean default false,
  created_at timestamptz default now()
);

-- ---------- BALANCES (saldos PIX / contas) ----------
create table if not exists balances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  amount numeric not null default 0,
  created_at timestamptz default now()
);

-- ---------- SALES (vendas por plataforma) ----------
create table if not exists sales (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date date not null,
  platform text not null,    -- kwai | face | tiktok | google | taboola
  amount numeric not null,
  method text,               -- PIX | Cartão
  created_at timestamptz default now()
);

-- ---------- EXPENSES (gastos) ----------
create table if not exists expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date date not null,
  title text,
  amount numeric not null,
  cat text,                  -- Tráfego | Pessoal | Empresa | ...
  method text,
  created_at timestamptz default now()
);

-- ---------- PUSH SUBSCRIPTIONS ----------
create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  endpoint text unique not null,
  subscription jsonb not null,
  tz text default 'America/Sao_Paulo',
  updated_at timestamptz default now()
);

-- ============================================================================
-- RLS — habilita e aplica policy "own" em cada tabela
-- ============================================================================
do $$
declare t text;
begin
  foreach t in array array['cards','card_purchases','bills','debts','balances','sales','expenses','push_subscriptions']
  loop
    execute format('alter table %I enable row level security;', t);
    execute format('drop policy if exists own_select on %I;', t);
    execute format('drop policy if exists own_all on %I;', t);
    execute format(
      'create policy own_all on %I for all using (auth.uid() = user_id) with check (auth.uid() = user_id);', t
    );
  end loop;
end $$;

-- ---------- índices úteis ----------
create index if not exists idx_purchases_card on card_purchases(card_id);
create index if not exists idx_bills_due on bills(user_id, due) where paid = false;
create index if not exists idx_sales_date on sales(user_id, date);
create index if not exists idx_expenses_date on expenses(user_id, date);

-- ============================================================================
-- PROFILES (nome, empresa, cor de destaque, prefs) — 1 por usuário
-- ============================================================================
create table if not exists profiles (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  name text,
  company text,
  accent text default 'purple',   -- purple | mint | orange | blue | cyan | pink
  notif boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table profiles enable row level security;
drop policy if exists own_all on profiles;
create policy own_all on profiles for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
