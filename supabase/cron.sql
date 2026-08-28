-- Agenda o send-reminders todo dia às 11:00 UTC (~08:00 BRT).
-- Requer as extensões pg_cron e pg_net (Database > Extensions no painel).
-- Troque <PROJECT_REF> e <CRON_SECRET> pelos seus valores.

select cron.schedule(
  'central-daily-reminders',
  '0 11 * * *',
  $$
  select net.http_post(
    url     := 'https://<PROJECT_REF>.functions.supabase.co/send-reminders',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret','<CRON_SECRET>'),
    body    := '{}'::jsonb
  );
  $$
);
-- Para remover:  select cron.unschedule('central-daily-reminders');
