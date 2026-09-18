-- C3b (operator ruling 2026-09-18) — own words minted from a registry's SELF-REPORTED section.
--
-- A frozen own-words candidate born from a registry page span (GuideStar/Candid "SOURCE: Self-reported by
-- organization" blocks, the Mission block) records WHERE it came from: the outside_page_snapshots row (id + sha)
-- and the byte-exact span [start, end) the generator saw. The candidate's signal_id stays NULL for these rows —
-- the provable-verbatim SIGNAL set (First Read gate 1) is keyed by signal_id, and a registry row's own excerpt is
-- a model paraphrase that must never inherit a verbatim warrant from a span it did not come from. The signals the
-- minted claim SUPPORTS ride inside registry_origin.signal_ids instead.
alter table public.own_words_candidates
  add column if not exists registry_origin jsonb;

comment on column public.own_words_candidates.registry_origin is
  'C3b: {host, page_url, snapshot_row_id, snapshot_sha, section, start, end, span_index, signal_ids[]} when the candidate was generated from a registry self_reported span (outside_page_snapshots); NULL for own-site pages.';
