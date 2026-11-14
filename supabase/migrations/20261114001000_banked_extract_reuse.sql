-- Reusing banked window extracts (SP-278, SP-279; 2026-11-14).
--
-- WHY. Extracting a 17-window document costs about eleven minutes of local model time, and the
-- framework pass that reads the result can fail on a time ceiling that has nothing to do with the
-- extraction. Re-running the whole document to retry one Dify call wastes every one of those windows
-- and, on a document the operator re-analyses deliberately, wastes them again.
--
--   SP-278  a framework pass that fails on a TIME CEILING is retried ONCE over the banked extracts,
--           with no re-extraction. A second failure ends the document failed with a real code.
--   SP-279  "Analyze again" on a document whose sidecar sha is UNCHANGED reuses the banked extracts
--           and runs only the merge and the framework pass.
--
-- WHAT MAKES REUSE SAFE. `sidecar_sha` is sha256(normalizeForHash(the text the extracts were built
-- from)), through contentIdentity.ts like every other identity here. Every stored extract's pointer
-- is an offset into THAT text, so reuse is sound exactly when the sha matches and unsound the moment
-- it does not — which is the same test the voice gate already applies to the same bytes.
--
-- A CAVEAT WORTH WRITING DOWN: an unchanged sidecar sha means the stored text has not changed. It
-- does NOT mean the installed parser would still produce that text. A parser upgrade changes what a
-- fresh read would yield while leaving the stored sidecar's sha untouched, so reuse will skip the
-- improvement until something re-extracts. That is the deliberate trade SP-279 makes: eleven minutes
-- of local model time against a parser change that no column records.

alter table public.file_proposals
  add column if not exists sidecar_sha text,
  add column if not exists framework_attempts integer not null default 0;

comment on column public.file_proposals.sidecar_sha is
  'SP-279: sha256(normalizeForHash(the extracted text these windows and extracts were built from)), via contentIdentity.ts. Reuse of banked extracts is sound exactly when this matches the current sidecar, because every stored pointer is an offset into this text.';
comment on column public.file_proposals.framework_attempts is
  'SP-278: how many times the framework pass has been started for this proposal. A pass that fails on a TIME CEILING is retried once over the banked extracts; the second failure is terminal.';

alter table public.file_proposals
  drop constraint if exists check_sidecar_sha_shape;
alter table public.file_proposals
  add constraint check_sidecar_sha_shape
    check (sidecar_sha is null or sidecar_sha ~ '^[0-9a-f]{64}$');

alter table public.file_proposals
  drop constraint if exists check_framework_attempts_bounded;
alter table public.file_proposals
  -- Two is the whole budget (SP-278): the first pass and its one retry. A row claiming more has lost
  -- count, which is the shape of the bug SP-269 found one level down.
  add constraint check_framework_attempts_bounded
    check (framework_attempts >= 0 and framework_attempts <= 2);

-- The reuse lookup: the newest proposal for this file whose extracts were built from this same text.
create index if not exists file_proposals_reuse_lookup
  on public.file_proposals (file_id, sidecar_sha, created_at desc)
  where file_id is not null and sidecar_sha is not null;
