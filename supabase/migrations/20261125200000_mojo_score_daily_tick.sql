-- SP-478 / SP-682 ruling 5 (2026-11-25) — the Mojo Score's daily tick, INSTALLED HELD.
--
-- The Mojo Score falls as evidence ages (one contributor steps down at 7 / 30 / 90 / 180 / 365 days),
-- and nothing re-took the server snapshot when it did, so mojo_scores and companies.mojo_score drifted
-- from the live number on the calendar alone: on 2026-11-25, 21 of 23 real companies showed a cached
-- score different from their live one. This job asks the ONE writer (snapshotMojoScore, through
-- refresh-mojo-score { all: true }) to re-take the snapshot for every company once a day. The writer
-- adds a row only when a total changed and never writes a frozen company.
--
-- IT IS CREATED INACTIVE, in the same transaction that schedules it, so pg_cron never sees it active.
-- The first run is a counted data write and is the operator's to order (SP-682 ruling 5). To start it:
--   select cron.alter_job((select jobid from cron.job where jobname = 'tick-mojo-scores'), active := true);
--
-- Same shape as the other scheduled functions (sweep_file_proposal_start): SECURITY DEFINER, reads
-- the door from the two database settings, does nothing when either is missing, execute revoked from
-- every browser role.
--
-- REVERSAL:
--   select cron.unschedule('tick-mojo-scores');
--   drop function public.tick_mojo_scores();
--   delete from supabase_migrations.schema_migrations where version = '20261125200000';

begin;

create or replace function public.tick_mojo_scores()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  service_key text := current_setting('app.service_role_key', true);
  fn_url      text := current_setting('app.supabase_functions_url', true);
begin
  if service_key is null or service_key = '' or fn_url is null or fn_url = '' then
    return;   -- no door to knock on
  end if;
  perform net.http_post(
    url     := fn_url || '/refresh-mojo-score',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || service_key),
    body    := jsonb_build_object('all', true),
    timeout_milliseconds := 300000
  );
end;
$$;

revoke execute on function public.tick_mojo_scores() from public, anon, authenticated;
grant  execute on function public.tick_mojo_scores() to service_role;

-- 09:17 UTC, once a day. Scheduled and held in one transaction.
select cron.schedule('tick-mojo-scores', '17 9 * * *', $cron$SELECT public.tick_mojo_scores()$cron$);
select cron.alter_job((select jobid from cron.job where jobname = 'tick-mojo-scores'), active := false);

commit;
