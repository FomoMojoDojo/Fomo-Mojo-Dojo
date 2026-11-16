-- S0 (2026-11-16): honest failure codes for a file that could not be read.
--
-- WHAT WAS WRONG. The local parser reads text, text-layer PDFs and .docx; for anything else it returned
-- empty text with source "unsupported", analyze-file wrote no sidecar, classify-upload-voice found no
-- document, and five minutes later the enqueue sweep's SP-205 block filed the file 'failed' /
-- 'voice_not_classified' with no reason. The operator saw "Analysis failed" for what was really
-- "we could not read it" — and a password-protected or damaged file looked the same as a spreadsheet.
--
-- WHAT THIS DOES
--   1. input_files.extraction_error_code — set by analyze-file when the parser reports the file
--      unreadable (or the file is empty), cleared when a later read succeeds.
--   2. public.unread_file_close_code(file_id) — THE ONE decision: voice_not_classified only when the
--      sidecar exists; otherwise the recorded extraction code; otherwise no_text_extracted.
--   3. public.close_unread_file(file_id) — writes the failed row with that code (processing_error NULL;
--      the reason is rendered from the code). The sweep's SP-205 loop calls it; a guard calls it on a
--      held fixture, which the sweep itself never touches.
--   4. sweep_file_proposal_enqueue re-created with only the SP-205 loop changed (SP-217 / SP-218 kept).
-- Decision 6 (operator, 2026-11-16) relaxes SP-212 for the unreadable codes only: their reasons render.

alter table public.input_files
  add column if not exists extraction_error_code text;

alter table public.input_files
  drop constraint if exists input_files_extraction_error_code_check;
alter table public.input_files
  add constraint input_files_extraction_error_code_check check (
    extraction_error_code is null or extraction_error_code in (
      'unreadable_password', 'unreadable_corrupt', 'unreadable_empty',
      'unreadable_no_text_after_ocr', 'unreadable_format', 'ocr_unavailable'
    )
  );

create or replace function public.unread_file_close_code(p_file_id uuid)
returns text
language sql
stable
security definer
set search_path = public, storage
as $$
  select case
           when exists (
             select 1 from storage.objects o
              where o.bucket_id = 'input-files'
                and o.name = f.file_path || '.extracted.txt'
           ) then 'voice_not_classified'
           when f.extraction_error_code is not null then f.extraction_error_code
           else 'no_text_extracted'
         end
    from public.input_files f
   where f.id = p_file_id;
$$;

create or replace function public.close_unread_file(p_file_id uuid)
returns text
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  rec  record;
  code text;
begin
  select f.id, f.file_name, i.company_id into rec
    from public.input_files f join public.inputs i on i.id = f.input_id
   where f.id = p_file_id;
  if rec.id is null then return null; end if;
  code := public.unread_file_close_code(p_file_id);
  insert into public.file_proposals
    (company_id, file_id, file_name, source_type, summary, signal_type, status, processing_state,
     processing_error, processing_error_code, processing_completed_at)
  values
    (rec.company_id, rec.id, rec.file_name, 'uploaded_file',
     'Could not start analysis', 'document', 'pending', 'failed',
     null, code, now());
  return code;
end;
$$;

revoke execute on function public.unread_file_close_code(uuid) from public, anon, authenticated;
revoke execute on function public.close_unread_file(uuid)     from public, anon, authenticated;

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

  -- ── SP-205, made honest by S0: no verdict at all, five minutes after upload ⇒ failed, never queued ──
  -- Until S0 every such file was filed 'voice_not_classified', including the ones that were never READ:
  -- with no sidecar there is no document to classify, so the true problem was "we could not read it".
  -- The code now comes from public.unread_file_close_code(), which says voice_not_classified ONLY when
  -- the sidecar exists. processing_error stays NULL: the reason is rendered from the code, from one
  -- string map (src/lib/ingest/ingestStrings.ts UNREADABLE_STRINGS), so the DB and the screen cannot
  -- drift. "Run analysis" / "Analyze again" remain the human path.
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
    perform public.close_unread_file(rec.file_id);
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



revoke execute on function public.sweep_file_proposal_enqueue() from public, anon, authenticated;
