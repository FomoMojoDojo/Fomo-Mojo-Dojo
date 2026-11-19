-- SP-415 (signed 2026-11-19): close the odi_needs.source_path default and constrain the column's shape.
--
-- WHY. source_path is the column that decides whether a need's content may reach an outside model:
-- needRestsOnPrivateSource (supabase/functions/_shared/externalProvenance.ts:84-104) is an ALLOWLIST
-- whose only public member is 'public_research'. Until now the column carried
-- `NOT NULL DEFAULT 'public_research'`, so an insert that omitted it landed on the PUBLIC value and
-- was admitted to external models — the failure direction. The SP-411 census established that every
-- current insert path sets the column explicitly, so dropping the default converts a silent
-- fail-OPEN into a loud failure.
--
-- SCOPE. This migration does NOT add 'outside_voice_read' and does NOT touch PUBLIC_NEED_SOURCE_PATHS.
-- Permitting a value in this column is NOT the same as that value being public: the public/private
-- decision stays in TypeScript, where 'public_research' is still the only public value, and
-- need-source-path-guard.sh asserts that. 'outside_voice_read' is deliberately absent from the list
-- below, so adding it later is a visible, separate act.
--
-- NOT VALID, deliberately: the 338 existing rows are not scanned, so deploy cannot fail on legacy
-- data. VALIDATE CONSTRAINT is explicitly out of scope. Note the consequence: a NOT VALID check is
-- still enforced on every INSERT *and UPDATE*, so the 6 Cafe Barra rows whose source_path is free
-- prose ('Customer interviews', 'Observation (peak shifts) + customer interviews', and two like them)
-- cannot be UPDATED until they are reconciled. That reconciliation is a data act needing its own
-- sign-off and is not done here.

begin;

-- 1. the default was the fail-open: an omitted column became 'public_research'.
alter table public.odi_needs alter column source_path drop default;

-- 2. the shape. One arm per live writer, named, so a new writer is a visible addition.
alter table public.odi_needs
  add constraint odi_needs_source_path_shape check (
       source_path = 'public_research'           -- the ONLY public value (research-company / researchSynthesisWrite)
    or source_path = 'uploaded_file_research'    -- research-company, uploaded_evidence_fallback mode (index.ts:7155)
    or source_path = 'internal_declared'         -- _shared/opportunitySynthesis.ts:347
    or source_path = 'intake.quiz'               -- src/components/admin/CompanyFilesPanel.tsx:1053
    or source_path = 'interview'                 -- interview-derived needs
    or source_path = ''                          -- unlinkNeedsFromFilePath: a detached file's needs (useInputActions.ts:88)
    or source_path like 'file_proposal:%'        -- accept_candidate_proposal() (20261114010000)
    or source_path like 'manual_%'               -- manual_j3_recovery, manual_<uuid>, manual_context_edit
    or source_path like '%/%'                    -- a storage path (upload-derived)
  ) not valid;

commit;
