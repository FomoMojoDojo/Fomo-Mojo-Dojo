-- Gate 8c — DATA ACT, NOT SCHEMA. Gotham Sports: label the two blind rulings, retract the def born of one.
--
-- WHAT HAPPENED. The fill fired market discovery for Gotham (run 33c915e6) at 02:43:18Z on 2026-09-11,
-- before the public-reads stage had produced the offering read (it landed 03:11:47Z). The v2 judge
-- ran chunk 1 with no solution line: five verdicts banked inputs_complete=false. Candidate #1 ("New
-- York sports fans streaming local games on their mobile…") was ACCEPTED blind and wrote def
-- pmk-new-york-sports-fans-streaming-local-gam + an active lens — a group on the client surface whose
-- judge never saw what the company sells. Candidate #2 folded into it (deduped, blind on both its
-- original and reframed identity). #3–#6 were judged after 03:11:47Z with inputs and stand.
--
-- The 2026-09-11 fleet census (verdict inputs_complete=false ∨ row created before the company's first
-- offering read) found exactly these two rows blind, and no others in any company.
--
-- WHAT THIS DOES. (1) Back-label the two rows inputs_complete=false — justified row by row from their
-- verdicts (Gate 8a: a blind row is filed, is accounted, but neither decides nor is THE ruling, so the
-- complete re-judge can land beside it). (2) Retract the def (Gate 8b): retracted_at set, reason on
-- the row, provenance to the outcome row that made it. The def, its lens, the outcome rows and the
-- blind verdicts all stand as history — nothing deleted, lens untouched. Every enumerator now hides
-- it; the admin portfolio shows it under "retracted".
--
-- WHAT FOLLOWS (not in this file): rejudge #1 then #2 — dry run, operator review, filing call each —
-- with the offering read present. The partial unique on (company_id, journey_key) WHERE retracted_at
-- IS NULL lets the complete re-judge take the clean key.
--
-- IDEMPOTENT, FRESH-DB SAFE: every statement is guarded on the run/def existing and the flag not yet
-- set; re-applied it is a no-op. Never edit the values: they record what was found on 2026-09-11.
update public.market_candidate_outcomes
   set inputs_complete = false
 where run_id = '33c915e6-a7e3-410e-a16c-3376e683e3c5'
   and candidate_index in (1, 2)
   and criterion_version = 2
   and inputs_complete = true;

update public.odi_market_definitions
   set retracted_at = now(),
       retracted_reason = 'ruled without the offering read (judge blind 02:45:43Z; read landed 03:11:47Z)',
       retracted_from_outcome_id = '04533335-705a-48ef-81f6-c049b46ad1dd'
 where company_id = 'eac362ae-70d4-4b5a-ad47-a9a0652d1cfb'
   and journey_key = 'pmk-new-york-sports-fans-streaming-local-gam'
   and retracted_at is null
   and exists (select 1 from public.market_candidate_outcomes where id = '04533335-705a-48ef-81f6-c049b46ad1dd');
