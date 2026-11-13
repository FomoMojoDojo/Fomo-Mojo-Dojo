-- Analysis is queued with no click, and only ever once per file (SP-190..SP-194; 2026-11-13).
--
-- WHY. I-1's starter picks up `queued` rows one at a time — but nothing created a queued row except a
-- browser clicking "Run analysis", so an upload still waited for a human. This adds the step before
-- the starter: a server-side enqueue that turns a stored, extracted file into a queued proposal.
--
-- It reuses dify-analyze-file's EXISTING upload path rather than duplicating extraction in SQL. That
-- path already extracts, resolves upload origin and inserts the row `queued`; after I-1 it no longer
-- starts the workflow, so posting to it is exactly "enqueue". The cron carries the service-role
-- bearer, which SP-151 admits, so SP-179 holds: the browser never has to call it for a new upload.

-- ── SP-192: ONE LIVE PROPOSAL PER FILE, enforced by the database ─────────────────────────────────
-- Two enqueue ticks, or a tick racing the "Run analysis" fallback, must not be able to create two
-- analyses of one file. A partial unique index makes it unrepresentable rather than merely unlikely.
--
-- Checked against every guard that writes file_proposals before choosing the predicate: all of them
-- insert 'ready' rows, which the predicate excludes, EXCEPT completion-sweep-guard — and its five
-- 'running' fixture rows each carry a distinct gen_random_uuid() file_id, so they remain legal. Zero
-- live rows on this stack carry a duplicate file_id today, so the index creates clean.
create unique index if not exists file_proposals_one_live_per_file
  on public.file_proposals (file_id)
  where file_id is not null
    and status <> 'rejected'
    and processing_state in ('queued', 'running');

comment on index public.file_proposals_one_live_per_file is
  'SP-192: at most one in-flight analysis per input file. A rejected row, or a finished one (ready/failed), does not block a re-queue — that is what "Analyse again" does.';

-- ── SP-193: enqueue failure is BOUNDED ───────────────────────────────────────────────────────────
-- net.http_post is fire-and-forget, so a post that never produces a row cannot be detected inline.
-- Attempts are therefore counted, and after three the file is closed out with a failed proposal row
-- carrying the real reason. No file is ever re-posted forever.
create table if not exists public.ingest_enqueue_attempts (
  file_id      uuid primary key references public.input_files(id) on delete cascade,
  attempts     int not null default 0,
  last_error   text,
  last_attempt_at timestamptz not null default now()
);

comment on table public.ingest_enqueue_attempts is
  'SP-193: how many times the enqueue sweep has posted for a file. At 3 the file is closed out as failed rather than re-posted forever.';

alter table public.ingest_enqueue_attempts enable row level security;
-- No policy: written only by the SECURITY DEFINER sweep. A client has no business reading it.

-- ── the enqueue sweep ────────────────────────────────────────────────────────────────────────────
create or replace function public.sweep_file_proposal_enqueue()
returns void
language plpgsql
security definer
as $function$
declare
  service_key text := current_setting('app.service_role_key', true);
  fn_url      text := current_setting('app.supabase_functions_url', true);
  -- SP-191 NO BACKFILL. The I-1 migration's own timestamp: nothing uploaded before this slice is
  -- ever enqueued. Measured when this landed: all 94 existing input_files predate it, so the sweep
  -- sees none of them, and the 94 stay exactly as they are.
  cutoff      constant timestamptz := '2026-11-13 16:00:00+00';
  -- Cafe Barra (CB1) is frozen; no run of any kind touches it.
  frozen_cb1  constant uuid := '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc';
  rec         record;
  posted      int := 0;
  closed      int := 0;
begin
  if service_key is null or service_key = '' or fn_url is null or fn_url = '' then
    return;
  end if;

  -- ── SP-193 closeout: three posts and still no row ⇒ say so on the row and stop trying ──────────
  for rec in
    select f.id as file_id, f.file_name, i.company_id, a.attempts
      from public.input_files f
      join public.inputs i on i.id = f.input_id
      join public.companies c on c.id = i.company_id
      join public.ingest_enqueue_attempts a on a.file_id = f.id
     where a.attempts >= 3
       and f.uploaded_at > cutoff
       and f.archived_at is null
       and coalesce(f.is_interview, false) = false
       and i.company_id <> frozen_cb1
       and c.fixture_hold is null
       and not exists (
             select 1 from public.file_proposals p
              where p.file_id = f.id and p.status <> 'rejected'
           )
     limit 5
  loop
    insert into public.file_proposals
      (company_id, file_id, file_name, source_type, summary, signal_type, status, processing_state,
       processing_error, processing_completed_at)
    values
      (rec.company_id, rec.file_id, rec.file_name, 'uploaded_file',
       'Could not start analysis', 'document', 'pending', 'failed',
       format('The analysis could not be queued after %s attempts. %s',
              rec.attempts, coalesce((select last_error from public.ingest_enqueue_attempts where file_id = rec.file_id), 'No further detail was recorded.')),
       now());
    closed := closed + 1;
  end loop;

  -- ── the enqueue itself ─────────────────────────────────────────────────────────────────────────
  for rec in
    select f.id as file_id, f.file_path, f.file_name, coalesce(f.file_type, '') as file_type,
           i.company_id
      from public.input_files f
      join public.inputs i on i.id = f.input_id
      join public.companies c on c.id = i.company_id
      left join public.ingest_enqueue_attempts a on a.file_id = f.id
     where f.uploaded_at > cutoff                                  -- SP-191
       and f.archived_at is null                                   -- SP-191
       and coalesce(f.is_interview, false) = false                 -- the interview fence, in SQL
       and i.company_id <> frozen_cb1                              -- SP-191
       and c.fixture_hold is null                                  -- SP-191
       and coalesce(a.attempts, 0) < 3                             -- SP-193
       -- SP-194: stored AND extracted. The sidecar is the proof of extraction, and the upload path
       -- resolves upload origin before it inserts, so the voice precondition is met by construction.
       and exists (
             select 1 from storage.objects o
              where o.bucket_id = 'input-files'
                and o.name = f.file_path || '.extracted.txt'
           )
       -- never a second analysis of a file that already has one (SP-192's rule, applied early so the
       -- sweep does not spend a post discovering what the index would refuse)
       and not exists (
             select 1 from public.file_proposals p
              where p.file_id = f.id and p.status <> 'rejected'
           )
     order by f.uploaded_at
     limit 2                                                       -- SP-194
  loop
    -- count the attempt BEFORE posting: a post that never lands must still age toward the ceiling.
    insert into public.ingest_enqueue_attempts (file_id, attempts, last_error, last_attempt_at)
    values (rec.file_id, 1, null, now())
    on conflict (file_id) do update
      set attempts = public.ingest_enqueue_attempts.attempts + 1,
          last_attempt_at = now(),
          last_error = 'Posted to dify-analyze-file but no proposal row appeared.';

    perform net.http_post(
      url     := fn_url || '/dify-analyze-file',
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || service_key),
      body    := jsonb_build_object(
                   'fileId',     rec.file_id::text,
                   'filePath',   rec.file_path,
                   'fileName',   rec.file_name,
                   'fileType',   rec.file_type,
                   'companyId',  rec.company_id::text,
                   'sourceType', 'uploaded_file'
                 )
    );
    posted := posted + 1;
  end loop;

  if posted > 0 or closed > 0 then
    raise notice '[sweep-file-proposal-enqueue] posted % enqueue(s), closed % file(s) past the attempt ceiling', posted, closed;
  end if;
end;
$function$;

comment on function public.sweep_file_proposal_enqueue() is
  'Turns a stored, extracted file into a queued proposal with no user click (SP-178, SP-190). Cap 2 per tick (SP-194), no backfill before the I-1 migration (SP-191), bounded at 3 attempts (SP-193).';

select cron.schedule('sweep-file-proposal-enqueue', '* * * * *', 'SELECT public.sweep_file_proposal_enqueue()')
where not exists (select 1 from cron.job where jobname = 'sweep-file-proposal-enqueue');
