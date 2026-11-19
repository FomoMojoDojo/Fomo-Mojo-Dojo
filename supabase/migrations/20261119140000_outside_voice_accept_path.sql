-- SP-433 / SP-417 / SP-410: the accept path for an OUTSIDE-VOICE proposed need.
--
-- A proposed need read out of customers' own public words had nowhere to land. The only accept path
-- hard-coded source_path 'file_proposal:…' and provenance_type 'file_derived', which would have
-- recorded a need derived from an uploaded file — false, and it is the false FILE attribution that is
-- the problem, not the privacy (SP-404 wants these needs private).
--
-- TWO NEW VALUES, NEITHER OF THEM PUBLIC:
--   · provenance_type 'outside_review_derived' (SP-417) — the honest origin: adjudicated from a read
--     of outside customer REVIEWS. It is deliberately NOT 'public_research' (which claims a research
--     crawl) and NOT 'framework_adjudicated' (which is live on 48 research_artifact_runs rows and
--     means something else).
--   · source_path 'outside_voice_read' (SP-404) — private BY DEFAULT and by construction.
--
-- NEITHER VALUE JOINS A PUBLIC LIST, and that is the whole point:
--   · PUBLIC_NEED_SOURCE_PATHS stays exactly {public_research}. needRestsOnPrivateSource is an
--     allowlist, so 'outside_voice_read' is private with no further code — and need-source-path-guard
--     check n3 goes RED if anyone adds it.
--   · EXTERNAL_ADMISSIBLE_PROVENANCE stays {public_research, public_baseline}, so
--     isSubjectExternallyAdmissible REFUSES a need carrying 'outside_review_derived'.
-- Permitting a value in a column is not the same as that value being public.
--
-- The need also keeps source_proposal_id = p.id, which makes needRestsOnPrivateSource true at
-- externalProvenance.ts:96 BEFORE source_path is read at :97 — so the private default holds through
-- two independent gates. candidate-queue-guard asserts both.

-- 1. the provenance value. ALTER TYPE ... ADD VALUE is not wrapped in an explicit transaction here:
--    a value added and used in one transaction is refused by Postgres.
alter type public.provenance_type_enum add value if not exists 'outside_review_derived';

-- 2. the source_path shape, widened by ONE arm. Still NOT VALID: the six Cafe Barra rows that carry
--    free prose are still not reconciled (SP-415), and VALIDATE remains out of scope.
alter table public.odi_needs drop constraint odi_needs_source_path_shape;
alter table public.odi_needs
  add constraint odi_needs_source_path_shape check (
       source_path = 'public_research'           -- the ONLY public value
    or source_path = 'uploaded_file_research'    -- research-company, uploaded_evidence_fallback mode
    or source_path = 'internal_declared'         -- _shared/opportunitySynthesis.ts
    or source_path = 'intake.quiz'               -- CompanyFilesPanel intake
    or source_path = 'interview'                 -- interview-derived needs
    or source_path = 'outside_voice_read'        -- SP-404: an outside-voice need. PRIVATE, not public.
    or source_path = ''                          -- unlinkNeedsFromFilePath: a detached file's needs
    or source_path like 'file_proposal:%'        -- accept_candidate_proposal(), file branch
    or source_path like 'manual_%'               -- manual_j3_recovery, manual_<uuid>, manual_context_edit
    or source_path like '%/%'                    -- a storage path
  ) not valid;
