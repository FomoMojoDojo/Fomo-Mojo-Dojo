# Data act — reconstruct two lost market-candidate rulings (Gate 7e)

**Date:** 2026-09-11
**Companies:** Edgewood (`3dd2cfbb-0792-4bf1-9cd4-15db9646874b`), Coreviva (`99775e73-6901-414f-8e66-41f381cb9c57`) — both writable. CB1/CB2 untouched.
**Backup:** `backups/pre-outcome-reconstruct_20260911_081420.sql` (42,993,010 bytes)
**File:** `supabase/migrations/20260911082500_outcomes_reconstruct_lost_rulings.sql` — DML-only, idempotent, fresh-DB no-op; ledger row `20260911082500` carries both statements. Ledger 251 = files 251.

## Why
The 2026-09-11 diagnostic proved three rulings reached by the worker were never filed: the outcome row was
written per chunk after every candidate's model calls, the confirm-poll advanced on a banked gate-(b)
verdict, and the isolate was killed at the 400s wall with the chunk write still ahead (Edgewood isolate
`21f59ea6` at 03:39:58Z; Coreviva `d3a871f7` at 04:21:11Z, both `in_flight_req_exists = true`). 6fda5a8
(Gate 7a–7d) closed the mechanism. This act files the two rulings the bank can reconstruct.

## Rows (both `reconstructed = true`, `criterion_version = 2`) — never delete, never edit
| run / idx | outcome | sourced from |
|---|---|---|
| Edgewood `6582c9b2` #1 "Families and youth seeking mental health support…" | `deduped` → `pmk-families-and-youth-seeking-specialized-m` | SA v2 accepted 03:35:57Z; 14 same_market verdicts 03:36:10–03:37:21Z (3 internal-register pairings, 10 rejections, fold on the first PUBLIC accepted); perspective `buyer` 03:35:23Z |
| Coreviva `704357a2` #3 "First responders seeking whole-body MRI screenings…" | `rejected_solution` (reframed, rail-dropped) | SA v2 rejected 04:18:24Z (original); perspective `buyer` on the reframed text 04:18:47Z; SA v2 rejected 04:19:20Z on reframed identity `70b33090…` |

`judge_reasons` uses the worker's own keys (`buyer`, `solution_agnostic`, `same_market_vs_<journey_key>`,
`reframe`, `buyer_reframed`, `solution_agnostic_reframed`) with the banked `judge_reason` verbatim, plus the
Gate-3 `reconstructed_reason` (judge's words for the terminal) and `reconstructed_source` (bank rows + kill).

**NULL by rule:** Coreviva #3 `reframed_jtbd` — the text survives only as a 50-char log fragment and was not
reconstructed; its identity is on record so `reframed_identity` is filled. Edgewood #1 `reframed_*` — no reframe.

## Not filed
Coreviva `704357a2` #4 "Employers offering whole-body MRI…": original SA rejected 04:20:05Z, reframe produced
a restatement (perspective `buyer` 04:20:27Z), reframed SA judge in flight at the kill. **No ruling exists**;
operator refused an error row; a scoped re-judge is proposed separately.

## Pre-checks (SELECT only, before the act)
- No row at `(6582c9b2, 1)` or `(704357a2, 3)` under any version.
- No ruling row for either `original_identity` at v2 in any run (incl. Edgewood `ae901783`) — the partial
  unique index `market_candidate_outcomes_one_ruling_per_identity` admits both.
- Coreviva's newest `market_discovery` run is `704357a2`.

## Verification
- `market_candidate_outcomes`: 106 → 108 rows; reconstructed 16 → 18.
- Re-applying the file inside a rolled-back txn inserts 0 + 0 (idempotent).
- Reconciliation (scratchpad `reconcile.ts`): verdict-but-no-row gap 3 → 1 (Coreviva #4 only).
