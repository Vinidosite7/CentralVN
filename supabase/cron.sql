-- Agenda o send-reminders TODA HORA (a função decide o que mandar conforme a
-- hora local de cada usuário: 8h resumo, 13h meio-dia, 21h noite).
-- Requer extensões pg_cron e pg_net (Database > Extensions no painel).
-- Troque <PROJECT_REF> e <CRON_SECRET> pelos seus valores.

select cron.schedule(
  'central-hourly-reminders',
  '0 * * * *',                      -- no minuto 0 de toda hora
  $$
  select net.http_post(
    url     := 'https://<PROJECT_REF>.functions.supabase.co/send-reminders',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret','<CRON_SECRET>'),
    body    := '{}'::jsonb
  );
  $$
);
-- Para remover:  select cron.unschedule('central-hourly-reminders');
-- Se você tinha agendado a versão antiga:  select cron.unschedule('central-daily-reminders');
