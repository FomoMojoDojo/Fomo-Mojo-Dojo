-- Gate 7b — one RULING per content identity per criterion version.
--
-- market_candidate_outcomes is keyed (run_id, candidate_index, criterion_version): the manifest
-- position, which is what makes a re-judge of the same chunk replace its own row. It says nothing
-- about CONTENT. The verdict store beside it does — market_discovery_verdicts is unique on
-- (company_id, pair_identity, criterion_version), the law that a verdict is never re-rolled — and the
-- outcome row is the same kind of record: a judge's ruling on one content identity under one
-- criterion. Two runs filing two different rulings for the same identity at the same version would
-- be a contradiction the table currently permits and nothing would flag.
--
-- The index makes that a loud failure. It is PARTIAL because two of the CHECK'd outcomes are not
-- rulings: 'already_decided' says a ruling exists somewhere (a replay files one per manifest it
-- visits, legitimately), and 'error' is a terminal without a ruling (a candidate may fail in run A
-- and be ruled on in run B). Everything else — accepted_active, accepted_deferred, deduped,
-- rejected_solution, rejected_buyer — is a ruling and may exist exactly once per identity per version.
--
-- Pre-checked 2026-09-11 against the live table: 0 groups with count > 1 (84 rulings, 100 rows).
-- The v1/v2 pairs on Riverlane #1/#3/#4 are distinct versions and pass by construction.
create unique index market_candidate_outcomes_one_ruling_per_identity
  on public.market_candidate_outcomes (company_id, original_identity, criterion_version)
  where outcome not in ('already_decided', 'error');
