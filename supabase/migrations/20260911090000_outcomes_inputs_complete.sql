-- Gate 8a — inputs_complete on the outcome row; a blind ruling is not THE ruling.
--
-- market_discovery_verdicts has carried inputs_complete since Gate 6e: false when the v2 judge ran
-- with no solution line (no current offering read), replaced in place by the next complete judge.
-- The outcome row had no such field, so marketCandidateDecided clause (3) and the one-ruling index
-- treated a row filed blind as a ruling. The 2026-09-11 census found exactly two such rows in the
-- fleet (Gotham 33c915e6 #1 accepted_active — a def on the client surface — and #2 deduped), judged
-- 02:45–02:47Z against an offering read that landed 03:11:47Z.
--
-- Same meaning as the verdict store: the worker stamps solutionLine.length > 0 at fileOutcome time.
-- DEFAULT true IS the backfill (v1 rows: the criterion took no offering read; rejected_buyer: gate (b)
-- never ran; already_decided / error: not rulings). The two Gotham rows are back-labelled by a
-- separate, guarded data act, justified row by row from their verdicts — never by a blanket UPDATE.
--
-- The one-ruling index (Gate 7b) gains AND inputs_complete: a blind row stays intact, visible and
-- labelled, and the complete re-judge of the same identity lands BESIDE it. "One ruling per identity
-- per criterion" keeps its meaning — a blind ruling was never one.
alter table public.market_candidate_outcomes
  add column inputs_complete boolean not null default true;

drop index public.market_candidate_outcomes_one_ruling_per_identity;
create unique index market_candidate_outcomes_one_ruling_per_identity
  on public.market_candidate_outcomes (company_id, original_identity, criterion_version)
  where outcome not in ('already_decided', 'error') and inputs_complete;
