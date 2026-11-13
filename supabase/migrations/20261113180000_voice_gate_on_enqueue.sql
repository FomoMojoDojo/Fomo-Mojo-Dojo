-- The enqueue will not analyse a document whose voice was never classified (SP-199..SP-213; 2026-11-13).
--
-- WHY. SP-194 assumed the upload path resolved voice before inserting `queued`. Measured, it does
-- not: resolveUploadOrigin runs inside persistDifyResult, AFTER the model has answered, and writes
-- doc_voice_verdicts keyed by (input_file_id, content_sha) — never a column on file_proposals. Voice
-- IS classified at upload, but by the browser dialog calling classify-upload-voice. Before I-1 a
-- human clicked "Run analysis", so a file that skipped that call needed a person to push it onward.
-- I-1 removes the person, so the gate has to be explicit.
--
-- WHY THIS IS ONLY A PRE-FILTER (SP-209). content_sha is sha256(normalizeForHash(full sidecar text))
-- computed by the TypeScript authority contentIdentity.ts, over a storage object Postgres cannot
-- read. SQL therefore cannot tell a CURRENT verdict from one for an older sha. It asks the weaker
-- question — does any verdict exist for this file — and the exact, sha-matched question is asked in
-- dify-analyze-file's upload path, which has the sidecar in hand and uses that same TS authority.
-- Writing "sha-matched" here would have been a second content-identity authority, which
-- uploadCorpus.ts:8-9 explicitly forbids.

-- ── SP-212: the reason code is stored, and NOT rendered ──────────────────────────────────────────
-- processing_error IS shown to the client — inputsShared.tsx:540-542 renders
-- "Analysis failed: {processing_error}" — so a code placed there would read as
-- "Analysis failed: voice_not_classified". No existing column can hold a machine-readable code, so
-- this adds one. These rows carry processing_error = NULL, which makes that block render nothing at
-- all: the client sees the existing "Analysis failed" badge, no code and no dangling colon.
alter table public.file_proposals
  add column if not exists processing_error_code text;

comment on column public.file_proposals.processing_error_code is
  'SP-212: machine-readable failure reason (e.g. voice_not_classified). NEVER rendered — the client reads the existing "Analysis failed" wording. NULL on every row written before 2026-11-13 and on any failure that predates the codes.';

-- ── the enqueue, with the voice pre-filter and the SP-205 closeout ───────────────────────────────
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
              where p.file_id = f.id and p.status <> 'rejected'
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
              where p.file_id = f.id and p.status <> 'rejected'
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
              where p.file_id = f.id and p.status <> 'rejected'
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
