-- Part A — the four entry conditions I-1 left behind (SP-227..SP-230; 2026-11-13).
--
-- Each closes a finding filed during I-1 rather than fixed in it, and each is an entry condition for
-- the chunked pipeline: a reader must be able to trust what a row says before the row describes 34
-- windows instead of one document.

-- ── SP-228 (closes SP-F37): record that minting proceeded under an uncertain origin ──────────────
-- The persist-time voice gate is fail-toward-external BY DESIGN: when classification is unavailable
-- it resolves to authorship 'uncertain' / subject 'uncertain' and the signals are minted under that
-- conservative band. The band stays — it is the right choice. What was missing is that NOTHING on
-- the row said so, so a reader could not tell a document whose voice was established from one whose
-- voice was never establishable.
--
-- 'resolved'  the classifier gave a verdict for this document's current content
-- 'uncertain' minting proceeded without one (no file id, or no local classifier)
-- NULL        no minting step ran, or an intake row, which carries no document at all
alter table public.file_proposals
  add column if not exists minting_origin_state text;

alter table public.file_proposals
  add constraint check_minting_origin_state
    check (minting_origin_state is null or minting_origin_state in ('resolved', 'uncertain'));

comment on column public.file_proposals.minting_origin_state is
  'SP-228: whether the signals on this proposal were minted under a RESOLVED document voice or an UNCERTAIN one. Machine-readable, NEVER rendered. NULL where no minting step ran.';

-- ── SP-230 (closes SP-F40): one voice refusal per file, not two ──────────────────────────────────
-- The voice_not_classified refusal inserts its failed row directly, and SP-192's index covers only
-- ('queued','running') rows, so two posts racing for one file could both land a failed row. The key
-- admits one; the loser reads its unique violation as "the record already exists" and returns.
create unique index if not exists file_proposals_one_voice_refusal_per_file
  on public.file_proposals (file_id)
  where file_id is not null
    and processing_error_code = 'voice_not_classified';

comment on index public.file_proposals_one_voice_refusal_per_file is
  'SP-230: at most one voice_not_classified row per input file, whichever caller gets there first.';

-- ── SP-229 (closes SP-F39): the reconcile looks only at rows with a run in flight ────────────────
-- A `queued` row has no processing_started_at, so it sorted by created_at inside the reconcile's
-- LIMIT 20 window. A backlog of more than twenty waiting rows could therefore crowd a genuinely
-- stuck `running` row out of the window, and the row that needed rescuing never got posted. I-2
-- makes that reachable in earnest, because a chunked document holds the queue for far longer.
--
-- The reconcile now selects 'running' only. The 24-hour CEILING still covers ('queued','running'),
-- because a row that has waited a day without starting is a real stall and must still be closed.
--
-- completion-sweep-guard keeps its subject: all five of its fixtures are inserted 'running', so the
-- three posts it expects (A, C1, C2) are unchanged. A new check in ingest-queue-guard proves the
-- property itself — that a `queued` row is not posted by the reconcile.
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
  -- CEILING: unchanged — a queued row stalled for a day is still closed out.
  update public.file_proposals
     set summary = 'Dify background monitor timed out',
         processing_state = 'failed',
         processing_error = 'Dify workflow did not reach a terminal state within the background polling window.',
         processing_completed_at = now()
   where status <> 'rejected'
     and processing_state in ('queued', 'running')
     and coalesce(processing_started_at, created_at) < now() - interval '24 hours';
  get diagnostics closed = row_count;

  -- SP-189: a lock whose row is no longer live must go, or it wedges the queue for its whole TTL.
  delete from public.ingest_single_flight l
   where not exists (
           select 1 from public.file_proposals p
            where p.id = l.proposal_id
              and p.processing_state in ('queued', 'running')
              and p.status <> 'rejected'
         );
  get diagnostics freed = row_count;

  -- RECONCILE: 'running' ONLY (SP-229). A waiting row is the starter's business, not the rescue's.
  if service_key is not null and service_key <> '' and fn_url is not null and fn_url <> '' then
    for rec in
      select p.id
        from public.file_proposals p
       where p.status <> 'rejected'
         and p.processing_state = 'running'
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

-- SP-218 is the rule for every function this slice touches or adds (SP-246).
revoke execute on function public.sweep_file_proposal_completion() from public, anon, authenticated;
