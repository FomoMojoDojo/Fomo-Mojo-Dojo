-- VOICE-GATE-1 — doc_voice_verdicts: the per-document voice-classification store
-- (design signed 2026-07-16, VOICE_GATE_DESIGN.md). Implements the CHANNEL≠VOICE
-- law (JobSteps/index.tsx:2676, market_register OOD-1): an upload is a CHANNEL;
-- "declared / you've told us" requires the client's VOICE. This table is the
-- per-doc marker that law asked for.
--
-- SEMANTICS
--   verdict            — the classifier's read of one document's voice:
--                          client_voice — the document IS the client's own words
--                                         (declared-eligible).
--                          external     — third-party / not-the-client's-voice
--                                         (declared-INeligible).
--                          uncertain    — the classifier was not confident
--                                         (never auto-passes; asks the operator).
--   basis              — the VERBATIM reason. On a model verdict row this is the
--                        classifier's own words (verbatim-or-nothing — never
--                        synthesized). On an operator-override row it is the
--                        operator's stated basis ("corpus attestation",
--                        "operator attestation on record 2026-07-16").
--   classifier_model   — provenance of the model verdict (NULL on override rows).
--   operator_override  — the operator's deliberate per-doc ruling BESIDE (never
--                        OVER) the model verdict: 'client_voice' upgrades a doc
--                        into the declared brief; 'external' excludes it (dropped
--                        from the brief, non-blocking). NULL = a model verdict row.
--
-- IMMUTABLE-PER-CONTENT (mirrors market_discovery_verdicts): rows are INSERT-ONLY.
-- content_sha is the identity of the CLASSIFIED CONTENT, derived ONLY through the
-- single TS authority contentIdentity.ts (normalizeForHash + sha256Hex) — there
-- is deliberately NO SQL hash here (Postgres POSIX \s diverges from JS \s on
-- Unicode whitespace; a SQL reimplementation would silently drift). An edited or
-- re-uploaded document produces a NEW content_sha, which reads as "not classified"
-- and re-blocks — the classifier/gate look up (input_file_id, content_sha) by
-- EXACT match, never latest-wins-by-created_at.
--
-- Two partial-unique indexes keep the store immutable-per-content: at most one
-- MODEL verdict and at most one OPERATOR override per (input_file_id, content_sha).
-- Re-classify / re-attest is therefore idempotent (insert … on conflict do nothing).

begin;

create table public.doc_voice_verdicts (
  id                uuid primary key default gen_random_uuid(),
  input_file_id     uuid not null references public.input_files(id) on delete cascade,
  company_id        uuid not null references public.companies(id) on delete cascade,
  content_sha       text not null,
  verdict           text not null check (verdict in ('client_voice','external','uncertain')),
  basis             text not null,
  classifier_model  text,
  operator_override text check (operator_override in ('client_voice','external')),
  override_by       uuid,
  override_reason   text,
  created_at        timestamptz not null default now(),
  -- A model verdict row carries a classifier_model and no override attribution.
  -- An operator override row carries an override_reason and no classifier_model.
  constraint doc_voice_verdicts_row_shape check (
    (operator_override is null
      and classifier_model is not null
      and override_by is null
      and override_reason is null)
    or
    (operator_override is not null
      and classifier_model is null
      and override_reason is not null)
  )
);

-- Immutable-per-content: exactly one model verdict per (file, content)…
create unique index doc_voice_verdicts_model_uniq
  on public.doc_voice_verdicts (input_file_id, content_sha)
  where operator_override is null;

-- …and exactly one operator override per (file, content).
create unique index doc_voice_verdicts_override_uniq
  on public.doc_voice_verdicts (input_file_id, content_sha)
  where operator_override is not null;

create index doc_voice_verdicts_company_idx
  on public.doc_voice_verdicts (company_id);

create index doc_voice_verdicts_file_sha_idx
  on public.doc_voice_verdicts (input_file_id, content_sha);

commit;
