-- ONB-F2 S2: Add provenance_type to research_artifact_runs
--
-- local-alignment writes to this table with status = 'local_alignment'.
-- Adding a nullable text column (no enum FK) keeps the existing rows valid
-- and lets future callers set their own provenance label without a type change.

ALTER TABLE research_artifact_runs
  ADD COLUMN provenance_type text;
