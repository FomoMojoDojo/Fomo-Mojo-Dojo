-- model_calls: one row PER CALL, and each row says which attempt and which prompt (L1, operator
-- ruling 2026-10-15).
--
-- generate-public-read accumulated token usage across every model call of a run — generate, each
-- re-ask, the judge — and wrote ONE row at the end. The Wasabi run of 2026-10-15 15:55 made two
-- generator calls and a judge call and left a single row of 15158 prompt tokens, so "prompt tokens
-- per attempt" was not answerable from the ledger, and nothing tied spend to the prompt that
-- incurred it. Q4 already stamps every prompt with a sha; the cost ledger could not name it.
--
--   * attempt    — 1 for the first answer, 2 for the one re-ask. NULL for a call that is not per
--                  attempt (a judge call on a kind, a site with no attempt concept).
--   * prompt_sha — the sha of the exact prompt that produced the call, matching input_ledger.prompt_sha
--                  on a stored read and the prompt_sha on the attempt's audit row.
--
-- Both nullable: the other six call sites write neither, and backfilling a sha nobody recorded would
-- be inventing one. Past rows keep NULL, which is the honest value.
alter table public.model_calls add column if not exists attempt    int  null;
alter table public.model_calls add column if not exists prompt_sha text null;

comment on column public.model_calls.attempt is
  'Which attempt of its kind incurred this call: 1 = first answer, 2 = the one re-ask. NULL when the site has no attempt concept.';
comment on column public.model_calls.prompt_sha is
  'sha256 of the exact prompt that produced this call; matches input_ledger.prompt_sha on a stored read and the attempt audit row. NULL on sites that do not stamp prompts.';

create index if not exists model_calls_prompt_sha_idx
  on public.model_calls (prompt_sha) where prompt_sha is not null;
