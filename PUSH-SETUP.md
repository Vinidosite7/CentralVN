# 🔔 Ligar o PUSH REAL (notificações no iPhone) — passo a passo

O código do push já está 100% pronto. Faltam só 3 coisas que **só você pode fazer**
(envolvem chaves secretas e deploy). São ~10 min. Segue na ordem.

Pré-requisito que você já fez: ✅ PWA instalado na tela de início do iPhone (iOS 16.4+).

---

## 1. Gerar as chaves VAPID (o "RG" do teu push)

Na pasta do projeto, roda:

```bash
npx web-push generate-vapid-keys
```

Vai cuspir duas chaves:
- **Public Key:** `BN...` (longa)
- **Private Key:** `x...`

Guarda as duas. A pública é, também, uma env var do front.

---

## 2. Colocar a chave pública no front (Vercel)

No painel da **Vercel** → teu projeto → **Settings → Environment Variables** → adiciona:

```
NEXT_PUBLIC_VAPID_PUBLIC_KEY = (a Public Key do passo 1)
```

Marca Production/Preview/Development e salva. Depois **Redeploy** (Deployments →
menu do último → Redeploy) pra pegar a env nova.

---

## 3. Subir a Edge Function e agendar

Precisa do Supabase CLI. Se não tem:
```bash
npm install -g supabase
supabase login
supabase link --project-ref SEU_PROJECT_REF
```
(o PROJECT_REF está na URL do teu Supabase: `https://SEU_PROJECT_REF.supabase.co`)

**3a. Deploy da função:**
```bash
supabase functions deploy send-reminders --no-verify-jwt
```

**3b. Cadastrar os segredos** (a private key NUNCA vai pro front):
```bash
supabase secrets set \
  VAPID_PUBLIC_KEY="(Public Key do passo 1)" \
  VAPID_PRIVATE_KEY="(Private Key do passo 1)" \
  VAPID_SUBJECT="mailto:seu@email.com" \
  CRON_SECRET="invente-um-segredo-forte-aqui"
```

**3c. Agendar o gatilho.** No SQL Editor do Supabase, cola `supabase/cron.sql`
trocando `<PROJECT_REF>` e `<CRON_SECRET>` (esse tem que ser IGUAL ao que você
pôs no secrets acima). Roda.

> Precisa das extensões `pg_cron` e `pg_net` ativas (Database → Extensions).

---

## 4. Ativar no app

No iPhone, abre o PWA → **Perfil** → liga o toggle **"Avisos de vencimento"**.
Ele vai pedir permissão de notificação — aceita. Pronto: a subscription é salva
e o cron começa a mandar.

---

## O que vai chegar (bastante, como você pediu)

- **08h — Resumo matinal:** o que vence hoje + teu caixa. Começa o dia sabendo.
- **Boletos:** aviso 3 dias antes, 1 dia antes, e no dia (esse mais forte).
- **Fatura de cartão:** 2 dias antes do vencimento, com o valor do mês calculado.
- **13h — Meio-dia:** se ainda tem boleto de hoje não pago, cutuca.
- **21h — Fecha o dia:** lembra de registrar as vendas (e se já registrou, te
  parabeniza com o total). Fecha o loop pro TDAH não deixar passar.

Os textos variam a cada dia (anti-habituação) pra não virar ruído que você ignora.

---

## Testar sem esperar o horário

Pra disparar na hora e ver se chega, roda no terminal (troca a URL e o secret):
```bash
curl -X POST 'https://SEU_PROJECT_REF.functions.supabase.co/send-reminders' \
  -H 'x-cron-secret: SEU_CRON_SECRET'
```
Se retornar `{"sent": N}` com N > 0, chegou push. Se `sent: 0`, provável que não
era 8/13/21h no teu fuso, ou não tinha nada pra avisar — normal.
