-- Gate 9a — DATA ACT: annotate the seven livelocked delta runs with their cause.
--
-- The cause (diagnosed 2026-09-11): the span gate's mechanical branch (span_not_in_observed /
-- span_missing) recorded NOTHING, so the plan could not subtract the pair, the packer re-packed it as
-- chunks[0], and the deterministic judge failed it identically every pass — "plan yields work, write
-- refuses". Gate 9a records those outcomes as claim_delta_looks; these rows predate it.
--
-- Rows are never deleted or re-statused: this is an idempotent jsonb merge of chain_state.cause on
-- exactly these ids (a null chain_state becomes {"cause": ...}; an existing state keeps its keys).
--   41322cd1  claim_deltas         Edgewood  2026-09-11  livelock: plan yields work write refuses
--   1edf270d  full_refresh         Edgewood  2026-09-11  livelock: plan yields work write refuses
--   ae0ef657  claim_deltas_public            2026-08-21  manually quiesced (livelock)
--   18443e15, e0180821, c2b6d268, 1b572a5f  claim_deltas_public  2026-08-21  stalled partway (~190 passes)
update long_runner_runs
   set chain_state = coalesce(chain_state, '{}'::jsonb) || '{"cause": "span_gate_unjudged"}'::jsonb
 where id in (
   '41322cd1-489d-4b16-9760-9e4321de8448',
   '1edf270d-5a24-434d-9388-fd28137d9586',
   'ae0ef657-6378-470a-9305-b635fe2341ee',
   '18443e15-9a79-44e3-bd0c-2b73f0bb21e5',
   'e0180821-45d0-4f2d-82dc-6316ff754b3b',
   'c2b6d268-b0d0-48ec-9745-ba3ad673d156',
   '1b572a5f-b392-49c5-beb0-cfc9fcc62982'
 )
   and coalesce(chain_state->>'cause', '') <> 'span_gate_unjudged';
