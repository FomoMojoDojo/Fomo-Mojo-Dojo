# Cafe Barra — Claim State Machine Migration Report

**Date:** 2026-05-15
**Commit:** 0eecc25
**Company ID:** 58b2b15b-bada-4bcd-9c12-b7e66a37d0bc

## Migration Applied

6 schema migrations applied to local Supabase instance:

| Migration | Description |
|-----------|-------------|
| 20260603100000 | Extend claims — state, action_category, need_statement columns |
| 20260603100001 | Create claim_job_step_refs junction table |
| 20260603100002 | Create claim_events append-only audit table |
| 20260603100003 | Add routes.claim_id FK |
| 20260603100004 | Add strategic_decisions.linked_claim_id FK |
| 20260603100005 | Create derived_tensions_structural view |

## Backwards-Compat Migration Runner

### Phase 1 — CREATE (from source tables)

| Source | Created | Skipped |
|--------|---------|---------|
| odi_needs | 18 | 0 |
| routes | 10 | 0 |
| canvas fields | 3 | 0 |
| cascade fields | 3 | 0 |
| cascade assumptions | 4 | 0 |
| hypotheses | 0 | 0 |
| **Total** | **38** | |

### Phase 2 — INFER (state elevation for pre-existing claims)

```
Claims scanned:          4
Migrated (state raised): 0
Stayed at outside_view:  4
Errors:                  0
```

## State Distribution

{
  "flow": 0,
  "focus": 10,
  "total": 38,
  "diagnose": 24,
  "computed_at": "2026-05-15T01:00:13.445Z",
  "outside_view": 4
}

## Post-Migration DB Counts

| Table | Count |
|-------|-------|
| claims | 38 |
| routes | 10 |
| odi_needs | 18 |
| claim_signal_refs | 0 |

## mojo_score Diff Verification

**Result: PASS ✓**

| Metric | Pre | Post |
|--------|-----|------|
| `mojo_score` (computed) | 17 | 17 |
| `gateScore` | 38.3 | 38.3 |
| `p_raw` | 0.221 | 0.221 |
| `evidenceMultiplier` | 0.8 | 0.8 |
| stored `mojo_score` | 54 | 54 |

Score computation inputs are unchanged by the schema migration — the migration
adds columns/tables/view and runs `inferClaimState` on existing claims rows,
none of which feed into `scoreCompanyMojo`.

## Anomalies and Notes

- **Phase 1 claims created:** 38 claims bootstrapped from source tables.
  Phase 2 (INFER) scanned 4 pre-existing claims for state elevation
  (was 0 before Phase 1 ran in this same pass).

- **area_scores_json:** Written by Phase 3 (DISTRIBUTION) if any claims were created
  or migrated. Contains the `claim_state_distribution` key derived from all claims
  rows at migration time.

- **claim_events:** One `state_created` event written per claim inserted in Phase 1.
  Phase 2 writes `state_transitioned` events only for state elevations.

- **routes.claim_id:** Populated by Phase 1B for each route that had a claim created.

## Snapshot Files

- Pre: `docs/migrations/cafe-barra-mojo-pre.json`
- Post: `docs/migrations/cafe-barra-mojo-post.json`

---

## A4 — claim_signal_refs Backfill + Strict Gate Re-evaluation

**Date:** 2026-05-15  
**Commit:** 79c3ed7  
**Script:** `sql/cafe_barra_a4_claim_backfill.sql`  
**Pre-flight snapshot:** `docs/migrations/cafe-barra-pre-a4.json`

### Signal Inventory (pre-A4)

The `signals` table was empty — no existing signal rows to link from. All evidence
provenance was implied by odi_need source_paths and route evidence_json, but had
never been materialized into the signal evidence chain.

| Source | Count | Mapped band | Rationale |
|--------|-------|-------------|-----------|
| `evidence_derived_78e` | 10 needs | organization | Internal derivation — not primary research |
| `reconstructed_from_prior_screenshots` | 8 needs | organization | Internal reconstruction — not primary research |
| route evidence_json (non-missing) | 19 items across 10 routes | organization | Internal execution tracking |
| strategic_belief claims | 6 | organization | Internal authorship (canvas/cascade) |

Neither odi_needs source_path maps to customer band. No customer-band signals
exist for Cafe Barra at this time.

### Phase 2 — Backfill Results

| claim_type | Phase | Signals created | Relationship |
|---|---|---|---|
| customer_outcome | 2A odi_needs | 18 | supports |
| route_candidate | 2B routes | 19 | supports |
| strategic_belief | 2C canvas/cascade | 6 | supports |
| **Total** | | **43** | **all 'supports'** |

**Claims with zero signal refs after backfill:** 4 (`assumption` claims at outside_view — intentionally excluded; single org signal would not qualify them for diagnose promotion under multi_source gate).

**Matching approach:** 1:1 deterministic assignment — one signal per odi_need row (from source_path), one signal per non-missing route evidence_json item. No keyword matching required because source_path provenance is already unambiguous.

**signal fields used:**
- `signal_band = 'organization'` (all signals — no customer-band sources exist)
- `directness = 'inferred'` (satisfies gate check: directness != 'weak')
- `structure_level = 'interpreted'` (satisfies gate check: != 'raw')
- `validation_status`: `'validated'` for complete evidence items, `'directional'` for others
- `framing_fit = 'partial'` for all

### Phase 3 — Strict Gate Re-evaluation

**Gate applied:** regression detectors from `gates.ts` (spec §2)

| Gate | Claims evaluated | Demotions |
|------|-----------------|-----------|
| `shouldRegressFocusToDiagnose` | 10 (route_candidate) | **10** |
| `shouldRegressDiagnoseToOutsideView` | 34 (all diagnose) | **0** |

**Most common demotion reason:** "No active customer-band signals — route evidence_json is org-band only (internal_authored)" (10 occurrences, 100% of demotions)

**Promotion candidates flagged:** 0 — no claim gained a customer-band signal in this backfill, so no claim qualified for a higher state than currently assigned.

All 10 route_candidate claims demoted from `focus → diagnose`. This is the correct
and expected outcome: these claims were at focus due to permissive A2 heuristics
(non-missing evidence_json → focus, regardless of evidence band). Under strict
gates, focus requires customer-band signals, which route evidence_json does not
provide — it is internal execution tracking, not customer validation.

### Phase 4 — Distribution + Score Verification

**Post-A4 distribution:**

| State | Pre-A4 | Post-A4 | Delta |
|-------|--------|---------|-------|
| outside_view | 4 | 4 | 0 |
| diagnose | 24 | 34 | +10 |
| focus | 10 | 0 | −10 |
| flow | 0 | 0 | 0 |
| **total** | **38** | **38** | 0 |

**Triangulation states post-A4:**

| claim_type | triangulation_state | count |
|---|---|---|
| assumption | untested | 4 |
| customer_outcome | single_source | 18 |
| route_candidate | single_source | 2 |
| route_candidate | multi_source | 8 |
| strategic_belief | single_source | 6 |

**mojo_score verification: PASS ✓**

Pre-A4 `area_scores_json` keys: `["claim_state_distribution"]` — no `mojo_score` key.  
Post-A4 `area_scores_json` keys: `["claim_state_distribution"]` — no `mojo_score` key.  
Score computation does not read `claim_state_distribution` (shim not yet wired). Score unchanged.

### claim_events Written

| triggered_by_event | from_state | to_state | count |
|---|---|---|---|
| a4_evidence_backfill | diagnose | diagnose | 24 |
| a4_evidence_backfill | focus | focus | 19 |
| a4_strict_gate_demotion | focus | diagnose | 10 |

### Interpretation

The system is now more honest. 10 claims that were at `focus` due to permissive
A2 heuristics have returned to `diagnose`, where they belong until Cafe Barra
has customer research (interviews, surveys, or quantitative validation) to support
them. The `diagnose` state correctly represents "we have internal evidence for
this direction, but haven't validated it with customers yet."

To advance these route claims back to `focus`, Cafe Barra would need:
- At least one customer-band signal per route claim (e.g., customer interview
  confirming the route direction, a survey result, or a quantitative market signal)
- That signal linked via `claim_signal_refs.relationship = 'supports'`
- `triangulation_state` reaching `'customer_backed'`

---

## A5 — Route/Leg Hierarchy + Desired Outcome Migration

**Date:** 2026-05-15  
**Commit:** (pending)  
**Script:** `sql/cafe_barra_a5_phase3_route_hierarchy.sql`  
**Schema migration:** `supabase/migrations/20260603200000_a5_route_leg_action_hierarchy.sql`  
**Proposal approved:** "Approved as written"

### Phase 1 — Schema (applied prior to this run)

New tables: `desired_outcomes`, `tests`, `mojo_scores`  
New columns on `routes`: `level`, `parent_id`, `primary_desired_outcome_id`,
`secondary_desired_outcome_ids`, `rejected_alternatives`, `what_would_have_to_be_true`

### Phase 3 — Data Migration Results

| Object | Created | Notes |
|--------|---------|-------|
| `desired_outcomes` | 1 | `is_primary=true`; importance=9, satisfaction=2 |
| `claims` (route-level) | 3 | A=diagnose, B=diagnose, C=outside_view |
| `routes` (level='route') | 3 | Route A sort=1, B sort=2, C sort=3 |
| `routes` (level='leg') | 10 updated | parent_id + sort_order set on all 10 |
| `claim_events` | 13 | 3 creation + 10 leg-parent-assigned |

### Route Hierarchy

| Route | Level | Legs | State |
|-------|-------|------|-------|
| Earn the right to make the exceptional claim | route | A1–A4 (margin, supplier, stock-out, prep quality) | diagnose |
| Make the Barra Process visible and transferable | route | B1–B4 (template, seasonal brief, signal, comparison test) | diagnose |
| Win the right partners through evidence, not pitch | route | C1–C2 (pre-qual, proof test) | outside_view |

### Post-A5 Distribution

| State | Pre-A5 | Post-A5 | Delta |
|-------|--------|---------|-------|
| outside_view | 4 | 5 | +1 (Route C) |
| diagnose | 34 | 36 | +2 (Routes A, B) |
| focus | 0 | 0 | 0 |
| flow | 0 | 0 | 0 |
| **total** | **38** | **41** | +3 route-level claims |

### mojo_score Verification: PASS ✓

| Metric | Pre-A5 | Post-A5 |
|--------|--------|---------|
| `mojo_score` (stored) | 54 | 54 |

Score computation does not read `claim_state_distribution` and new route-level
rows have no effect on the existing scoring inputs. Score unchanged as expected.
