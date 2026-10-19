-- Ejecutar después de guardar rutasegura_push_url y rutasegura_push_dispatch en Vault.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
create or replace function public.dispatch_pending_push() returns void
language plpgsql security definer set search_path = public as $$
declare target text; secret text;
begin
  if not exists(select 1 from public.push_deliveries where sent_at is null
    and discarded_at is null and available_at <= now()) then return; end if;
  select decrypted_secret into target from vault.decrypted_secrets where name = 'rutasegura_push_url';
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'rutasegura_push_dispatch';
  if target is null or secret is null then raise exception 'push_schedule_not_configured'; end if;
  perform net.http_post(url := target || '/functions/v1/send-push',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || secret),
    body := '{}'::jsonb, timeout_milliseconds := 15000);
end $$;
revoke all on function public.dispatch_pending_push() from public, anon, authenticated;
select cron.schedule('rutasegura-push', '10 seconds', 'select public.dispatch_pending_push()');
select cron.schedule('rutasegura-push-cleanup', '15 4 * * *',
  $$delete from public.push_deliveries where created_at < now() - interval '7 days'$$);
