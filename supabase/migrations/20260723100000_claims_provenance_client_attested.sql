-- FR-D1 — add 'client_attested' to the claims.provenance axis.
--
-- Third provenance origin for the First Read corrections→delta feed (FR-D2).
-- A correction is a statement the client spoke aloud in the meeting and the
-- operator attested (first_read_responses.source='client_attested', a
-- single-value CHECK). That is a DIFFERENT origin from:
--   * public_observed   — born from the public research pipeline
--   * internal_declared — born from the operator's own UPLOADED material
--                         (deriveClaimProvenance: every backing signal is
--                          source_type='uploaded_file' in the organization band)
-- A spoken correction has NO signal and NO uploaded file, so neither existing
-- value describes it honestly (Law 7: provenance says WHERE it came from). The
-- token 'client_attested' already exists as first_read_responses.source; this
-- promotes the same word to the claims axis so one origin has one name.
--
-- STAMP LAW (enforced in code, not schema): 'client_attested' is stamped
-- DIRECTLY at the corrections feed (FR-D2) only — never via deriveClaimProvenance
-- (which is signal-backing-based and cannot produce it) and never through the
-- Gate 3b document path (local-strategy-synthesis, which the voice gate refuses
-- for a corpus that has no doc_voice_verdicts row). See the note at
-- deterministicSignalClaimId in _shared/evidencePhase1.ts.
--
-- IMMUTABILITY UNCHANGED: the claims_provenance_immutable_guard (migration
-- 20260707110000) is a BEFORE UPDATE trigger that refuses any change of
-- provenance unless a sanctioned backfill sets app.provenance_backfill='on'.
-- Adding an allowed BIRTH value does not touch that guard: it fires on UPDATE
-- only and blocks value CHANGES regardless of which values the CHECK admits. A
-- client_attested claim is assigned once at INSERT and is thereafter as immutable
-- as any other. Rulings adopted at the design gate: same-text claims of different
-- provenance COEXIST (never merged); the only precedence act is the
-- attestation-wins prune of a colliding claim_delta_rejections row (FR-D2), not a
-- provenance mutation here.

alter table public.claims
  drop constraint if exists claims_provenance_check;

alter table public.claims
  add constraint claims_provenance_check
  check (provenance in ('public_observed', 'internal_declared', 'client_attested'));
