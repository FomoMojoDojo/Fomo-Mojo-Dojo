-- Analysis starts by itself, one at a time, fleet-wide (SP-178..SP-182, SP-187, SP-189; 2026-11-13).
--
-- WHY. A file's analysis only ever began because a browser called dify-analyze-file. Upload three
-- files and you had to click three times, waiting in between; close the tab and nothing started. And
-- `queued` was a label with no meaning: the row was inserted 'queued' and set 'running' inside the
-- same request, so it was queued for milliseconds and never while it was actually waiting.
--
-- WHAT THIS ADDS.
--   1. ingest_single_flight — exactly one file analysis in the whole fleet, enforced by a primary key
--      on a CONSTANT, so two clicks or two uploads cannot both win.
--   2. sweep_file_proposal_start() — the starter: oldest `queued` row first, LIMIT 1, posting to
--      dify-analyze-file's own sync door with the service-role bearer, exactly as
--      sweep_file_proposal_completion() already does for stranded rows.
--   3. a cron job for it, SEPARATE from jobid 2. Widening jobid 2 would have changed
--      completion-sweep-guard's subject; a separate function and job leaves that guard's count alone.
--   4. release of the lock on the stuck-run path (SP-189), so a dead run cannot wedge the queue.
--
-- WHY NOT A PARTIAL UNIQUE INDEX on file_proposals where processing_state='running'. It creates on
-- this stack — and it would break completion-sweep-guard, which inserts FIVE fixture rows all in
-- 'running' in one statement, and would forbid the completion sweep from reconciling several
-- stranded rows in one pass (its own LIMIT 20). A lock that makes the system's recovery path illegal
-- is the wrong lock.
--
-- WHY NOT company_run_locks. Its primary key is (company_id) ALONE — one lock per company — so it
-- cannot express "one in the fleet". It is still used here, for the baseline interaction (SP-184).

create table if not exists public.ingest_single_flight (
  -- always 'file_analysis'. The PK on a constant IS the fleet-wide guarantee: one row, or none.
  lock_key    text primary key,
  proposal_id uuid not null references public.file_proposals(id) on delete cascade,
  company_id  uuid not null references public.companies(id) on delete cascade,
  started_at  timestamptz not null default now(),
  -- A worker that dies without releasing cannot wedge the queue past this (SP-181, SP-189).
  expires_at  timestamptz not null
);

comment on table public.ingest_single_flight is
  'Fleet-wide single-flight for file analysis (SP-180, SP-187). One row named file_analysis, or none. The primary key on a constant key is the enforcement: two concurrent starters both insert and exactly one wins.';

alter table public.ingest_single_flight enable row level security;

-- No policy is created on purpose: the starter runs SECURITY DEFINER and dify-analyze-file holds the
-- service role, so nothing reaches this table through RLS. A client has no business reading a lock.

-- ── the starter ──────────────────────────────────────────────────────────────────────────────────
create or replace function public.sweep_file_proposal_start()
returns void
language plpgsql
security definer
as $function$
declare
  service_key text := current_setting('app.service_role_key', true);
  fn_url      text := current_setting('app.supabase_functions_url', true);
  held        int;
  baselines   int;
  target      record;
begin
  if service_key is null or service_key = '' or fn_url is null or fn_url = '' then
    return;   -- no door to knock on; the reconciler is in the same position and does the same
  end if;

  -- 1. expire a lock whose worker died. SP-189: the row it pointed at is closed out by
  --    sweep_file_proposal_completion, and the lock must not outlive it.
  delete from public.ingest_single_flight where expires_at < now();

  -- 2. something is already running: the whole point of the slice. Post nothing.
  select count(*) into held from public.ingest_single_flight;
  if held > 0 then return; end if;

  -- 3. SP-184: yield to a baseline or research run ANYWHERE. Those are the other heavy local jobs,
  --    they keep their own per-company lock, and a queued row waiting is honest (SP-182).
  delete from public.company_run_locks where expires_at < now();
  select count(*) into baselines from public.company_run_locks;
  if baselines > 0 then return; end if;

  -- 4. the oldest waiting file, and ONLY a waiting one. 'running' rows belong to the completion
  --    sweep, which is why this starter cannot pick up completion-sweep-guard's fixtures.
  select p.id, p.company_id
    into target
    from public.file_proposals p
   where p.status <> 'rejected'
     and p.processing_state = 'queued'
     and p.dify_workflow_run_id is null
   order by p.created_at
   limit 1;
  if target.id is null then return; end if;

  -- 5. take the lock. If another starter won the race, this raises and we simply do not post.
  begin
    insert into public.ingest_single_flight (lock_key, proposal_id, company_id, expires_at)
    values ('file_analysis', target.id, target.company_id, now() + interval '30 minutes');
  exception when unique_violation then
    return;
  end;

  -- 6. and only now, start it. mode 'start' — NOT 'sync': 'sync' reconciles a run that already
  --    exists and would answer "queued" without doing anything, holding the lock for its whole TTL.
  perform net.http_post(
    url     := fn_url || '/dify-analyze-file',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || service_key),
    body    := jsonb_build_object('mode', 'start', 'proposalId', target.id::text)
  );
  raise notice '[sweep-file-proposal-start] started %', target.id;
end;
$function$;

comment on function public.sweep_file_proposal_start() is
  'Starts the oldest queued file analysis, one at a time fleet-wide (SP-178, SP-179, SP-180). Selects queued rows only, so it never competes with sweep_file_proposal_completion over a running row.';

-- ── the stuck-run path releases the lock (SP-181, SP-189) ────────────────────────────────────────
-- Rebuilt from the live definition with two additions, marked inline. Everything else is unchanged.
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
begin
  -- ── CEILING: close out rows that never reached a terminal state within 24 h ──
  update public.file_proposals
     set summary = 'Dify background monitor timed out',
         processing_state = 'failed',
         processing_error = 'Dify workflow did not reach a terminal state within the background polling window.',
         processing_completed_at = now()
   where status <> 'rejected'
     and processing_state in ('queued', 'running')
     and coalesce(processing_started_at, created_at) < now() - interval '24 hours';
  get diagnostics closed = row_count;

  -- ── SP-189 (NEW): a lock whose row is no longer live must go, or it wedges the queue for 30
  --    minutes for nothing. Two cases: the row reached a terminal state, or the row is gone.
  delete from public.ingest_single_flight l
   where not exists (
           select 1 from public.file_proposals p
            where p.id = l.proposal_id
              and p.processing_state in ('queued', 'running')
              and p.status <> 'rejected'
         );
  get diagnostics freed = row_count;

  -- ── RECONCILE: post the function's own sync door for each stranded row ──
  if service_key is not null and service_key <> '' and fn_url is not null and fn_url <> '' then
    for rec in
      select p.id
        from public.file_proposals p
       where p.status <> 'rejected'
         and p.processing_state in ('queued', 'running')
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

  if posted > 0 or closed > 0 or freed > 0 then
    raise notice '[sweep-file-proposal-completion] posted % sync(s), closed % row(s) past 24h, freed % lock(s)', posted, closed, freed;
  end if;
end;
$function$;

-- ── the job: its own, never a widening of jobid 2 ────────────────────────────────────────────────
select cron.schedule('sweep-file-proposal-start', '* * * * *', 'SELECT public.sweep_file_proposal_start()')
where not exists (select 1 from cron.job where jobname = 'sweep-file-proposal-start');
