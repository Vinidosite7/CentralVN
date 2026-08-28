# Central Financeira

App financeiro pessoal + empresa, feito pro seu jeito de trabalhar: boleto na cara,
registro em 2 toques, cartões visuais com parcelamento que redistribui pelos meses,
vendas por plataforma (Kwai/Meta/TikTok/Google/Taboola) e push de vencimento.

Stack igual aos seus outros SaaS: **Next.js (App Router) + Supabase + Web Push (PWA)**.

---

## 1. Subir o banco (2 min)

1. No painel do Supabase → **SQL Editor** → cole e rode `supabase/schema.sql`.
   Cria todas as tabelas com `user_id` + RLS "own" (cada um vê só o seu).
2. **Database → Extensions**: habilite `pg_cron` e `pg_net` (pro push agendado).

## 2. Configurar o front (2 min)

1. Copie `.env.example` → `.env.local` e preencha:
   - `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` (Settings → API)
2. `npm install`
3. `npm run dev` → abre em `localhost:3000`. Crie sua conta na tela de login.

Já funciona: contas, cartões, compras parceladas, vendas, saldos, dívidas — tudo salvando.

## 3. Ligar o push de vencimento (opcional, 5 min)

1. Gere as chaves VAPID: `npm run gen-vapid`
   - `Public Key` → vai no `.env.local` como `NEXT_PUBLIC_VAPID_PUBLIC_KEY`
   - guarde a `Private Key` pro passo seguinte
2. Deploy da função:
   ```bash
   supabase functions deploy send-reminders --no-verify-jwt
   supabase secrets set \
     VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... \
     VAPID_SUBJECT=mailto:voce@email.com \
     CRON_SECRET=um-segredo-forte
   ```
3. Agende no SQL Editor: cole `supabase/cron.sql`, trocando `<PROJECT_REF>` e
   `<CRON_SECRET>`. Roda todo dia ~08h BRT.

O que o push avisa:
- **Boletos**: D-3 (leve), D-1, e D0 (forte, "VENCE HOJE").
- **Fatura de cartão**: 2 dias antes do vencimento, com o valor do mês já
  calculado a partir das parcelas em aberto.
- Texto varia um pouco a cada dia pra não virar ruído (anti-habituação).

## 4. Instalar no iPhone

Abra a URL no Safari → Compartilhar → **Adicionar à Tela de Início**.
Vira app em tela cheia. O push funciona com o app adicionado à tela inicial
(iOS 16.4+).

---

## Como o motor de cartão funciona

- Uma **compra** = valor total + nº de parcelas + mês inicial + quantas já pagou.
- O **limite disponível** desconta só as parcelas **ainda não pagas**
  (`openOnCard`), então quitar parcela libera limite na hora.
- A **projeção de 6 meses** soma, por mês, a parcela de cada compra que cai
  naquele mês (`monthBill`) — é o que você vê no gráfico dentro do cartão.
- A mesma lógica roda no servidor (`send-reminders`) pra calcular o valor da
  fatura no push.

## Estrutura

```
app/            layout, page (gate de auth)
components/     CentralFinanceira (UI), Auth, RegisterSW
lib/            supabase (client), db (CRUD + motor), push
public/         sw.js, manifest, ícones
supabase/       schema.sql, cron.sql, functions/send-reminders
```

Offline/sem tabelas ainda: o app cai num seed de exemplo pra não travar.
Assim que o schema existe e você loga, passa a ler/gravar de verdade.
