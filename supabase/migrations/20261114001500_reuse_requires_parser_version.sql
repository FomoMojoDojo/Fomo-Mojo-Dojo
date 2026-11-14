-- Reuse of banked extracts requires the SAME PARSER as well as the same text (SP-283; 2026-11-14).
--
-- SP-279 keyed reuse on `sidecar_sha` alone, and the caveat was written into its own migration: an
-- unchanged sha means the STORED text has not changed, not that today's parser would still produce
-- it. A parser upgrade would be skipped by reuse until something re-extracted, and no column recorded
-- which parser wrote what.
--
-- `parser_version` is the local parser's own `versions.server` string, recorded when a run extracts.
-- It is already a meaningful value, not a date: it was suffixed `-whole` precisely because two bumps
-- landed on 2026-11-13 and a date alone could not tell a 30-page read from a whole one.
--
-- Reuse now requires BOTH to match. A NULL parser_version — a row written before this column, or a
-- run whose re-read failed and fell back to the stored sidecar — can never match, so it can never be
-- reused: the answer to "which parser wrote this?" is "unknown", and unknown re-extracts.

alter table public.file_proposals
  add column if not exists parser_version text;

comment on column public.file_proposals.parser_version is
  'SP-283: the local parser''s versions.server for the read these windows and extracts were built from. Reuse (SP-279) requires this AND sidecar_sha to match the current parser and sidecar; NULL never matches, so a read of unknown provenance is always re-extracted.';

drop index if exists public.file_proposals_reuse_lookup;
create index if not exists file_proposals_reuse_lookup
  on public.file_proposals (file_id, sidecar_sha, parser_version, created_at desc)
  where file_id is not null and sidecar_sha is not null and parser_version is not null;
