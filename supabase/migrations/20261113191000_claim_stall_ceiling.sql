-- A worker that dies mid-write cannot leave "Analyzing…" on the screen for a day (SP-248; 2026-11-13).
--
-- WHY THIS GAP EXISTS, precisely. SP-227 re-seated the completion claim from the move to 'ready' onto
-- `processing_completed_at`, which is NULL for exactly as long as the row is in flight. That makes
-- exclusivity correct — but it also means a worker that takes the claim and then DIES before the ready
-- write leaves a row that is:
--   processing_state = 'running'  AND  processing_completed_at IS NOT NULL
-- The reconcile posts a sync for it, and `persistDifyResult`'s claim now requires
-- `processing_completed_at IS NULL`, so that sync returns "already persisted by another writer" and
-- changes nothing. The row would therefore sit at "Analyzing…" until the 24-hour ceiling — a day of a
-- client being told their document is still being read.
--
-- 15 minutes is the budget because the write step is signal ingest plus a score snapshot: seconds in
-- practice, and nothing legitimate holds a taken claim for a quarter of an hour.
--
-- completion-sweep-guard keeps its subject: its five fixtures are inserted with no
-- processing_completed_at, so none of them matches this clause.
create or replace function public.sweep_file_proposal_completion()
returns void
language plpgsql
security definer
as $function$
declare
  rec         record;
  service_key text := current_setting('app.service_role_key', true);
  fn_url      text := current_setting('app.supabase_functions_url', true);
  posted      int := 0;
  closed      int := 0;
  freed       int := 0;
  stalled     int := 0;
begin
  -- CEILING: a row that never reached a terminal state within 24 h, whether or not it ever started.
  update public.file_proposals
     set summary = 'Dify background monitor timed out',
         processing_state = 'failed',
         processing_error = 'Dify workflow did not reach a terminal state within the background polling window.',
         processing_completed_at = now()
   where status <> 'rejected'
     and processing_state in ('queued', 'running')
     and coalesce(processing_started_at, created_at) < now() - interval '24 hours';
  get diagnostics closed = row_count;

  -- SP-248: the claim was TAKEN and the write step never finished. The row says failed, with the same
  -- machine-readable code the in-function failure arm uses, and processing_error stays NULL so the
  -- client reads the existing "Analysis failed" wording (SP-212).
  update public.file_proposals
     set processing_state = 'failed',
         processing_error = null,
         processing_error_code = 'ingest_failed'
   where status <> 'rejected'
     and processing_state = 'running'
     and processing_completed_at is not null
     and processing_completed_at < now() - interval '15 minutes';
  get diagnostics stalled = row_count;

  -- SP-189: a lock whose row is no longer live must go. This now also frees the rows just closed above.
  delete from public.ingest_single_flight l
   where not exists (
           select 1 from public.file_proposals p
            where p.id = l.proposal_id
              and p.processing_state in ('queued', 'running')
              and p.status <> 'rejected'
         );
  get diagnostics freed = row_count;

  -- RECONCILE: 'running' ONLY (SP-229), and only rows whose claim is not already taken — a row with a
  -- taken claim is the stalled case handled above, not something a sync can advance.
  if service_key is not null and service_key <> '' and fn_url is not null and fn_url <> '' then
    for rec in
      select p.id
        from public.file_proposals p
       where p.status <> 'rejected'
         and p.processing_state = 'running'
         and p.processing_completed_at is null
         and coalesce(p.processing_started_at, p.created_at) < now() - interval '400 seconds'
         and coalesce(p.processing_started_at, p.created_at) > now() - interval '24 hours'
       order by coalesce(p.processing_started_at, p.created_at)
       limit 20
    loop
      perform net.http_post(
        url     := fn_url || '/dify-analyze-file',
        headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || service_key),
        body    := jsonb_build_object('mode', 'sync', 'proposalId', rec.id::text)
      );
      posted := posted + 1;
    end loop;
  end if;

  if posted > 0 or closed > 0 or freed > 0 or stalled > 0 then
    raise notice '[sweep-file-proposal-completion] posted % sync(s), closed % past 24h, failed % stalled claim(s), freed % lock(s)', posted, closed, stalled, freed;
  end if;
end;
$function$;

revoke execute on function public.sweep_file_proposal_completion() from public, anon, authenticated;
