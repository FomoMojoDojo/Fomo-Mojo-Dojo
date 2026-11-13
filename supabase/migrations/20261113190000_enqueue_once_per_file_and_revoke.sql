-- The automatic path fires ONCE per file, and the sweeps are not callable by a client
-- (SP-217, SP-218; 2026-11-13). A fourth migration because the three before it are already applied.
--
-- SP-217 — WHAT WAS WRONG. All three selections in sweep_file_proposal_enqueue skipped a file only if
-- it had a NON-REJECTED proposal (`p.status <> 'rejected'`). A rejected proposal therefore did not
-- count, so a file whose analysis an operator had REJECTED was picked up again by the enqueue — and
-- again, up to the SP-193 ceiling of three attempts — after which the closeout wrote
-- "The analysis could not be queued after 3 attempts", which was false: it had been queued three
-- times and analysed, and a human had rejected the result each time. Rejecting an analysis is a
-- decision, not an invitation to redo it; "Analyze again" is how a human asks for another.
--
-- The rule is now simply: if the file has ANY file_proposals row, the automatic path leaves it alone.
-- Re-queueing a finished file stays possible — that is the button, which inserts the row itself and
-- is unaffected by these predicates.
--
-- SP-218 — WHAT WAS EXPOSED. All four sweeps carried the default PUBLIC EXECUTE plus explicit anon and
-- authenticated grants, so the publishable anon key could invoke them through /rest/v1/rpc. They are
-- SECURITY DEFINER, they write rows, and two of them post to an edge function with the service-role
-- bearer. Measured before this migration:
--   =X/postgres | postgres=X | anon=X | authenticated=X | service_role=X   (all four)
-- Nothing in the repo calls them over rpc — only pg_cron (as the job owner) and psql in a guard — so
-- revoking costs nothing. service_role keeps EXECUTE, so an operator script and the cron are unaffected.

create or replace function public.sweep_file_proposal_enqueue()
returns void
language plpgsql
security definer
as $function$
declare
  service_key text := current_setting('app.service_role_key', true);
  fn_url      text := current_setting('app.supabase_functions_url', true);
  cutoff      constant timestamptz := '2026-11-13 16:00:00+00';
  frozen_cb1  constant uuid := '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc';
  rec         record;
  posted      int := 0;
  closed      int := 0;
  unvoiced    int := 0;
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
              where p.file_id = f.id
           )
     limit 5
  loop
    insert into public.file_proposals
      (company_id, file_id, file_name, source_type, summary, signal_type, status, processing_state,
       processing_error, processing_error_code, processing_completed_at)
    values
      (rec.company_id, rec.file_id, rec.file_name, 'uploaded_file',
       'Could not start analysis', 'document', 'pending', 'failed',
       format('The analysis could not be queued after %s attempts.', rec.attempts),
       'enqueue_attempts_exhausted', now());
    closed := closed + 1;
  end loop;

  -- ── SP-205: no verdict at all, five minutes after upload ⇒ failed, and NEVER queued ────────────
  -- The browser's classify-upload-voice call either did not happen or did not land. Five minutes is
  -- long enough that a slow call is not mistaken for a missing one. The row says 'failed' with a
  -- machine-readable code and NO rendered reason (SP-212); "Run analysis" remains the human path,
  -- exactly as before I-1 (SP-205, SP-211).
  for rec in
    select f.id as file_id, f.file_name, i.company_id
      from public.input_files f
      join public.inputs i on i.id = f.input_id
      join public.companies c on c.id = i.company_id
     where f.uploaded_at > cutoff
       and f.uploaded_at < now() - interval '5 minutes'
       and f.archived_at is null
       and coalesce(f.is_interview, false) = false
       and i.company_id <> frozen_cb1
       and c.fixture_hold is null
       and not exists (select 1 from public.doc_voice_verdicts v where v.input_file_id = f.id)
       and not exists (
             select 1 from public.file_proposals p
              where p.file_id = f.id
           )
     limit 5
  loop
    insert into public.file_proposals
      (company_id, file_id, file_name, source_type, summary, signal_type, status, processing_state,
       processing_error, processing_error_code, processing_completed_at)
    values
      (rec.company_id, rec.file_id, rec.file_name, 'uploaded_file',
       'Could not start analysis', 'document', 'pending', 'failed',
       null, 'voice_not_classified', now());
    unvoiced := unvoiced + 1;
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
       and exists (
             select 1 from storage.objects o
              where o.bucket_id = 'input-files'
                and o.name = f.file_path || '.extracted.txt'
           )                                                       -- stored AND extracted
       -- SP-209 PRE-FILTER ONLY: any verdict for this file. The sha-matched question is asked in
       -- dify-analyze-file, which has the sidecar and the TS content-identity authority.
       and exists (select 1 from public.doc_voice_verdicts v where v.input_file_id = f.id)
       and not exists (
             select 1 from public.file_proposals p
              where p.file_id = f.id
           )
     order by f.uploaded_at
     limit 2                                                       -- SP-194
  loop
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

  if posted > 0 or closed > 0 or unvoiced > 0 then
    raise notice '[sweep-file-proposal-enqueue] posted % enqueue(s), closed % past the attempt ceiling, % unclassified', posted, closed, unvoiced;
  end if;
end;
$function$;


-- ── SP-218: the sweeps are cron and operator machinery, not an API ───────────────────────────────
revoke execute on function public.sweep_file_proposal_enqueue()    from public, anon, authenticated;
revoke execute on function public.sweep_file_proposal_start()      from public, anon, authenticated;
revoke execute on function public.sweep_file_proposal_completion() from public, anon, authenticated;
revoke execute on function public.sweep_stale_chains()             from public, anon, authenticated;
