-- Gate 7e — DATA ACT, NOT SCHEMA. Two rulings reconstructed from the verdict bank (operator ruling
-- 2026-09-11: never delete; reconstruct from banked verdicts only; invent nothing).
--
-- WHY THESE TWO. The 2026-09-11 diagnostic proved three rulings were reached by the worker and never
-- filed: the outcome row was written once per chunk, after every candidate's model calls, and the
-- isolate holding each chunk was killed at the 400s wall with the request in flight (edge log:
-- `wall clock duration reached … in_flight_req_exists = true`) while the confirm-poll had already
-- advanced the cursor on a banked gate-(b) verdict. Gate 7a–7d (6fda5a8) closed the mechanism; this
-- act files what it lost. The third — Coreviva #4 — has NO ruling (its reframed judge never finished)
-- and is NOT filed here: an error row was refused by the operator; it gets a scoped re-judge instead.
--
-- HOW EACH FIELD IS SOURCED. Exactly as the worker's fileOutcome would have written it, from the
-- rows the worker DID bank: job_executor / original_jtbd / relationship_kind from the persisted
-- manifest (long_runner_runs.chain_state), original_identity = marketIdentity(executor, jtbd) computed
-- by the TS authority (contentIdentity.ts — never SQL), judge_reasons keys in the worker's own
-- vocabulary (buyer, solution_agnostic, same_market_vs_<journey_key>, reframe, *_reframed) with each
-- value the banked judge_reason verbatim, dedup_target_identity = the identity of the PUBLIC def the
-- same-market loop folded into, reframed_identity = market_a_identity of the banked reframed verdict.
-- The Gate-3 backfill's `reconstructed_reason` key carries the judge's own words for the terminal;
-- `reconstructed_source` names the bank rows and the kill. reconstructed = true, as Gate 3 did.
--
-- WHAT IS NULL. Coreviva #3's reframed_jtbd: the reframed text lives nowhere but a 50-character
-- edge-log fragment, and a truncated statement is not the statement. Its identity IS on record (the
-- reframed verdict's market_a_identity), so reframed_identity is filled and the text is not.
--
-- IDEMPOTENT AND FRESH-DB SAFE. Each insert is guarded by the run's existence (FK) and the row's
-- absence at (run_id, candidate_index, criterion_version). On a database without these runs it is a
-- no-op; re-applied here it is a no-op. Never edit the values: they are a record of what the judge
-- said on 2026-09-11, not a place to improve it.
--
-- Pre-checks 2026-09-11 (SELECT only, before this act): no row at either (run, idx) under any
-- version; no ruling row for either original_identity at v2 in any run (the partial unique index
-- market_candidate_outcomes_one_ruling_per_identity therefore admits both); Coreviva's newest
-- market_discovery run is still 704357a2. Backup: backups/pre-outcome-reconstruct_20260911_081420.sql.

-- ═══ Edgewood run 6582c9b2-b455-40bb-b0d4-b3a428e6f8d7 #1 — deduped ═══
--   buyer ← step_perspective_verdicts judged_at 2026-09-11T03:35:23.653014+00:00
--   solution_agnostic ← market_discovery_verdicts SA v2 accepted @ 2026-09-11T03:35:57.963946+00:00
--   same_market_vs_customer ← same_market accepted @ 2026-09-11T03:36:10.110576+00:00 [internal_inferred]
--   same_market_vs_dmk-families-and-caregivers-of-at-risk-youth ← same_market accepted @ 2026-09-11T03:36:15.650586+00:00 [internal_declared]
--   same_market_vs_dmk-families-and-caregivers-of-at-risk-youth-2 ← same_market accepted @ 2026-09-11T03:36:20.766274+00:00 [internal_declared]
--   same_market_vs_mkt-community-organizations-raising-funds-fo ← same_market rejected @ 2026-09-11T03:36:26.626843+00:00 [internal_inferred]
--   same_market_vs_mkt-direct-care-staff-seeking-better-working ← same_market rejected @ 2026-09-11T03:36:32.026379+00:00 [internal_inferred]
--   same_market_vs_mkt-funders-looking-to-support-impactful-you ← same_market rejected @ 2026-09-11T03:36:37.253444+00:00 [internal_inferred]
--   same_market_vs_mkt-government-agencies-responsible-for-yout ← same_market rejected @ 2026-09-11T03:36:42.230248+00:00 [internal_inferred]
--   same_market_vs_mkt-healthcare-professionals-referring-youth ← same_market rejected @ 2026-09-11T03:36:47.629724+00:00 [internal_inferred]
--   same_market_vs_mkt-nonprofit-organizations-aiming-to-improv ← same_market rejected @ 2026-09-11T03:36:53.099726+00:00 [internal_inferred]
--   same_market_vs_mkt-schools-seeking-partnerships-for-integra ← same_market rejected @ 2026-09-11T03:36:58.39194+00:00 [internal_inferred]
--   same_market_vs_mkt-youth-in-crisis-seeking-immediate-stabil ← same_market rejected @ 2026-09-11T03:37:03.738729+00:00 [internal_inferred]
--   same_market_vs_pmk-community-members-seeking-to-support-you ← same_market rejected @ 2026-09-11T03:37:08.8913+00:00 [public_inferred]
--   same_market_vs_pmk-county-social-workers-and-school-iep-tea ← same_market rejected @ 2026-09-11T03:37:15.218387+00:00 [public_inferred]
--   same_market_vs_pmk-families-and-youth-seeking-specialized-m ← same_market accepted @ 2026-09-11T03:37:21.65086+00:00 [public_inferred]
--   dedup_target_identity ← def pmk-families-and-youth-seeking-specialized-m (fold verdict, loop breaks on first PUBLIC same_market accepted)
--   reframed_jtbd / reframed_identity NULL ← no reframe: outcome was deduped on the original wording
insert into public.market_candidate_outcomes (company_id, run_id, candidate_index, job_executor, relationship_kind, original_jtbd, original_identity, reframed_jtbd, reframed_identity, outcome, judge_reasons, dedup_target_identity, journey_key, reconstructed, criterion_version)
select '3dd2cfbb-0792-4bf1-9cd4-15db9646874b', '6582c9b2-b455-40bb-b0d4-b3a428e6f8d7', 1, 'Families and youth seeking mental health support for children, teens, and young adults', 'recipient', 'Families and youth are trying to address mental health challenges and provide comprehensive care for their children, teens, and young adults, aiming to stabilize crises, improve family relationships, and support long-term mental health.', 'fabd0ab13913a2203b751bc2146eb82dd3a5d59617645e70c2d47a7ee3289aa8', NULL, NULL, 'deduped', '{"buyer":"buyer","solution_agnostic":"3-0 accepted: The job focuses on the mental health challenges and desired outcomes, not the specific solutions.","same_market_vs_customer":"accepted: Both focus on families and youth seeking mental health support for children, teens, and young adults. (cross-register pairing — internal def kept, public row written)","same_market_vs_dmk-families-and-caregivers-of-at-risk-youth":"accepted: Both markets involve families and focus on mental health support for youth. (cross-register pairing — internal def kept, public row written)","same_market_vs_dmk-families-and-caregivers-of-at-risk-youth-2":"accepted: Both markets involve families seeking mental health support for youth. (cross-register pairing — internal def kept, public row written)","same_market_vs_mkt-community-organizations-raising-funds-fo":"rejected: Different executors (Families and youth vs Community organizations)","same_market_vs_mkt-direct-care-staff-seeking-better-working":"rejected: Different executors (Families and youth vs Direct care staff)","same_market_vs_mkt-funders-looking-to-support-impactful-you":"rejected: Different executors (Families and youth vs Funders)","same_market_vs_mkt-government-agencies-responsible-for-yout":"rejected: Different executors (families vs government agencies)","same_market_vs_mkt-healthcare-professionals-referring-youth":"rejected: Different executors (Families and youth vs Healthcare professionals)","same_market_vs_mkt-nonprofit-organizations-aiming-to-improv":"rejected: Different executors (Families and youth vs Nonprofit organizations)","same_market_vs_mkt-schools-seeking-partnerships-for-integra":"rejected: Different executors (Families and youth vs Schools)","same_market_vs_mkt-youth-in-crisis-seeking-immediate-stabil":"rejected: Different executor (families and youth vs. youth in crisis)","same_market_vs_pmk-community-members-seeking-to-support-you":"rejected: Different executors (Families and youth vs Community members)","same_market_vs_pmk-county-social-workers-and-school-iep-tea":"rejected: Different executors (Families and youth vs County social workers and school IEP teams)","same_market_vs_pmk-families-and-youth-seeking-specialized-m":"accepted: Both markets involve families and youth seeking mental health support for children, teens, and young adults.","reconstructed_reason":"Both markets involve families and youth seeking mental health support for children, teens, and young adults.","reconstructed_source":"reconstructed 2026-09-11 from market_discovery_verdicts + step_perspective_verdicts; ruling reached 03:37:21Z, worker isolate 21f59ea6 wall-clock reached 03:39:58Z before the chunk write (diagnostic 2026-09-11)"}'::jsonb, '9fa0c39ecb38e0e53eb1e8bec3a11b05bb6c45636c403a0c05e9d62b16d23f61', NULL, true, 2
where exists (select 1 from public.long_runner_runs where id='6582c9b2-b455-40bb-b0d4-b3a428e6f8d7')
  and not exists (select 1 from public.market_candidate_outcomes where run_id='6582c9b2-b455-40bb-b0d4-b3a428e6f8d7' and candidate_index=1 and criterion_version=2);

-- ═══ Coreviva run 704357a2-e5f4-4107-91ea-d7d8e6b5eccf #3 — rejected_solution (reframed, rail-dropped) ═══
--   buyer ← step_perspective_verdicts judged_at 2026-09-11T04:17:57.356145+00:00
--   solution_agnostic ← SA v2 rejected @ 2026-09-11T04:18:24.379088+00:00 on original identity
--   reframe ← worker constant for the solution-bound branch; branch proven by the two reframed verdicts below
--   buyer_reframed ← step_perspective_verdicts judged_at 2026-09-11T04:18:47.963613+00:00 (hash 42b07a5c; edge log 04:18:47 "To secure whole-body MRI screenings…" → buyer)
--   solution_agnostic_reframed ← SA v2 rejected @ 2026-09-11T04:19:20.447094+00:00 on reframed identity 70b33090
--   reframed_identity ← market_a_identity of that verdict (= marketIdentity(executor, reframed_jtbd), banked by the worker)
--   reframed_jtbd NULL ← text not on record (only a 50-char log fragment); NOT reconstructed
insert into public.market_candidate_outcomes (company_id, run_id, candidate_index, job_executor, relationship_kind, original_jtbd, original_identity, reframed_jtbd, reframed_identity, outcome, judge_reasons, dedup_target_identity, journey_key, reconstructed, criterion_version)
select '99775e73-6901-414f-8e66-41f381cb9c57', '704357a2-e5f4-4107-91ea-d7d8e6b5eccf', 3, 'First responders seeking whole-body MRI screenings through institutional partnerships', 'user', 'To access whole-body MRI screenings as part of a comprehensive health and wellness program provided by their employer or professional organization.', '179bc0beecb6cf2a713bdbc667184056f6db1427aff4702740bd96918a46630d', NULL, '70b33090d24f96de8ecd4d4775b6ad3abebe74a40a38779f009084733c06a5e4', 'rejected_solution', '{"buyer":"buyer","solution_agnostic":"3-0 rejected: names the company''s product","reframe":"(solution-bound) job restated in the executor''s own terms","buyer_reframed":"buyer","solution_agnostic_reframed":"3-0 rejected: names the company''s product","reconstructed_reason":"3-0 rejected: names the company''s product","reconstructed_source":"reconstructed 2026-09-11 from market_discovery_verdicts + step_perspective_verdicts; rail-dropped 04:19:20Z, worker isolate d3a871f7 wall-clock reached 04:21:11Z before the chunk write (diagnostic 2026-09-11)"}'::jsonb, NULL, NULL, true, 2
where exists (select 1 from public.long_runner_runs where id='704357a2-e5f4-4107-91ea-d7d8e6b5eccf')
  and not exists (select 1 from public.market_candidate_outcomes where run_id='704357a2-e5f4-4107-91ea-d7d8e6b5eccf' and candidate_index=3 and criterion_version=2);

