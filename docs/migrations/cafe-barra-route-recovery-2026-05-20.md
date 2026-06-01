# Cafe Barra Route Recovery — B Migration Report
**Date:** 2026-05-20  
**Company ID:** 58b2b15b-bada-4bcd-9c12-b7e66a37d0bc  
**Executed by:** Claude Code (A5 recovery migration)

---

## What Was Done

Executed a clean-start migration to replace 9 pre-B2B-pivot consumer routes with the 3 B2B strategic routes + 10 legs from the A5 proposal. Added `routes.relevance_state` to filter deprioritized rows from all live analysis paths.

---

## Phase 1 — Alignment Verdict

**PROCEED.** All 3 proposed routes and 10 legs align with the current B2B cascade:
- Route A (operational reliability) → operationalizes `how_to_win`: Barra Process quality, building a track record
- Route B (process externalization) → directly named in `how_to_win`: "documented methodology lets cafe staff carry the quality forward"
- Route C (partner pipeline) → operationalizes `where_to_play` + `how_to_win`: partner selectivity (8-criteria scorecard), first clients measurably more successful

No staleness detected in any route or leg against the current cascade.

---

## Phase 2 — Schema: `routes.relevance_state`

**Migration file:** `supabase/migrations/20260520000001_routes_relevance_state.sql`

Applied directly via `supabase db query` (migration history state prevented standard push):
```sql
ALTER TABLE public.routes ADD COLUMN IF NOT EXISTS relevance_state TEXT NOT NULL DEFAULT 'active';
ALTER TABLE public.routes ADD CONSTRAINT routes_relevance_state_check CHECK (relevance_state IN ('active', 'deprioritized'));
CREATE INDEX IF NOT EXISTS routes_company_relevance_idx ON public.routes (company_id, relevance_state);
```

All existing rows defaulted to `'active'`.

---

## Phase 3 — Consumer Filtering Updates

Four files updated to filter routes by `relevance_state = 'active'`:

| File | Change |
|------|--------|
| `src/views/Routes/useRoutes.ts` | Added `.eq('relevance_state', 'active')` to main query; added `relevance_state` to `RouteRow` type |
| `src/hooks/useRoutesDerived.ts` | Added `.eq('relevance_state', 'active')` |
| `supabase/functions/assess-surface-drift/index.ts` | Added `.eq('relevance_state', 'active')` to `assessRoutes` query |
| `supabase/functions/propose-route-changes/index.ts` | Added `.eq('relevance_state', 'active')` as defensive guard (fetches by route_id, prevents proposals against deprioritized routes) |

---

## Phase 4 — Recovery Data Migration

**Migration file:** `supabase/migrations/20260520000002_cafe_barra_route_recovery.sql`

### Deprioritized (9 rows)

| Title | Source |
|-------|--------|
| Clarify coffee flavor and roast preferences early | manual_60f51302 |
| Make specialty coffee options easier to find locally and online | system |
| Improve confidence in coffee freshness and roast date verification | system |
| Enhance clarity on suitable coffee grind sizes for brewing methods | system |
| Increase ease of verifying order and delivery details pre-purchase | system |
| Reduce brewing errors to achieve consistent desired coffee flavor | system |
| Increase ability to track coffee taste consistency across batches | system |
| Boost confidence in adjusting brewing based on taste feedback | system |
| Clarify how to capture and learn from each brewing experience | system |

These rows are retained in the DB as audit trail with `relevance_state = 'deprioritized'`.

### Desired Outcome Inserted (1 row)

| Field | Value |
|-------|-------|
| statement | "Earn recognition as the verifiable quality standard for craft-first cafe operators, building sustainable margin through selective partner relationships and a documented, transferable process." |
| importance_score | 9 |
| satisfaction_score | 2 |
| is_primary | true |

### Routes Inserted (3 rows)

| Sort | Title | Category | Effort | pts |
|------|-------|----------|--------|-----|
| 1 | Earn the right to make the exceptional claim | fix | high | 8 |
| 2 | Make the Barra Process visible and transferable | improve | high | 9 |
| 3 | Win the right partners through evidence, not pitch | create | medium | 7 |

All 3 routes linked to the desired outcome via `primary_desired_outcome_id`.

### Legs Inserted (10 rows)

**Route A legs (4):**

| Sort | Title | Category |
|------|-------|----------|
| 1 | Make margin tradeoffs visible before pricing changes | fix |
| 2 | Reduce reorder friction caused by unclear supplier terms | fix |
| 3 | Reduce stock-out risk before manual counts fail | improve |
| 4 | Shift preparation quality from manager-dependent to system-supported | improve |

**Route B legs (4):**

| Sort | Title | Category |
|------|-------|----------|
| 1 | Externalize one Barra roasting template into observable, partner-communicable criteria | improve |
| 2 | Design the seasonal origin transition so partner cafes experience it as a methodology feature, not a supply disruption | fix |
| 3 | Build a seasonal consistency signal partner cafes can observe independently | create |
| 4 | Test whether the exceptional positioning holds under direct comparison with premium craft alternatives | create |

**Route C legs (2):**

| Sort | Title | Category |
|------|-------|----------|
| 1 | Add a lightweight pre-qualification tier before the full partner interview | fix |
| 2 | Test whether operational proof changes repeat purchasing confidence | create |

All 13 rows: `source = 'manual_a5_recovery'`, `relevance_state = 'active'`.

---

## Phase 5 — Baselines Captured

Captured inline in the recovery migration (SQL equivalent of `captureBaseline` utility):

| Metric | Value |
|--------|-------|
| Rows with baseline | 13 / 13 |
| `min(jsonb_array_length(evidence_baseline_signal_ids))` | 218 |
| `max(jsonb_array_length(evidence_baseline_signal_ids))` | 218 |
| `evidence_baseline_captured_at` | 2026-05-20 (migration time) |

The 9 deprioritized routes retain their A76 backfill baselines as audit trail.

---

## Phase 6a — Drift Detection

**`assess-surface-drift` company-scoped run:**

| Metric | Value |
|--------|-------|
| assessed | 25 |
| aligned | 25 |
| slight_drift | 0 |
| material_drift | 0 |

Breakdown: 1 cascade + 1 positioning + 10 odi_needs + 3 routes + 10 legs = 25.  
The 9 deprioritized routes were excluded by the `relevance_state = 'active'` filter (Phase 3 update to `assess-surface-drift`).  
All 25 hit the empty-diff fast-path (baselines were just captured; current active signal IDs == baseline IDs).

---

## Phase 6b — A67 Alignment Classification

All 13 new rows classified as **`aligned`** by `evaluate-route-alignment`. No `off_strategy` results.

Selected classifications:

> **Route A (Earn the right to make the exceptional claim):** "The route focuses on building reliable internal operations and processes to support Cafe Barra's claim of exceptional quality, which directly supports the how-to-win choice of delivering consistent quality and a verifiable partnership."

> **Route B (Make the Barra Process visible and transferable):** "The route focuses on making the Barra Process visible and transferable to partner cafes... directly aligning with the cascade's emphasis on partner selectivity and consistent quality delivery."

> **Route C (Win the right partners through evidence, not pitch):** "The route focuses on improving the partner selection and conversion process to win the right independent cafes and specialty retailers... aligning with the how-to-win mechanism of demonstrating measurable client success."

> **Leg B4 (comparison test):** "The route focuses on testing the company's exceptional positioning against premium craft competitors... aligning with the cascade's emphasis on building a track record."

No classifier calibration needed based on these results.

---

## Phase 7 — Final Verification

### DB State

| Metric | Value |
|--------|-------|
| Total routes for Cafe Barra | 22 |
| `level='route'`, `relevance_state='active'` | 3 |
| `level='leg'`, `relevance_state='active'` | 10 |
| `level='route'`, `relevance_state='deprioritized'` | 9 |
| Desired outcomes (`is_primary=true`) | 1 |
| `parent_id IS NOT NULL` (legs with parent) | 10 |

### TypeScript

- `tsc --noEmit`: **clean**
- `routes.relevance_state` field present in generated `types.ts` (Row, Insert, Update)
- `RouteRow` in `src/views/Routes/useRoutes.ts` updated with `relevance_state` field

### UI Readiness

The `ClientRefinePreviewRoutesView` hierarchy rendering code (`hasHierarchy`, `topLevelRoutes`, `legsByParentId`) will now receive 3 top-level routes with 10 legs in the correct parent_id groupings. The hierarchy UI will render as designed in A5.

---

## Caveats & Follow-On

1. **`research-company` still writes `level='route'` with no legs.** Any future `research-company` run for Cafe Barra would generate new flat routes (not deprioritize the B2B hierarchy). This is a known architectural gap — extending `research-company` for legs is flagged as future work.

2. **`propose-route-changes` is hierarchy-blind.** It proposes changes to `title`, `short_description`, `rejected_alternatives`, `what_would_have_to_be_true` only. It will not generate proposals to restructure the route/leg relationship.

3. **The 9 deprioritized routes carry A76 baselines** in `evidence_baseline_signal_ids`. Their stale `surface_drift_assessments` rows remain in the table as audit trail; they will not be re-assessed since they are excluded from `assess-surface-drift`.

4. **Leg title rewrites** from `docs/migrations/cafe-barra-leg-title-rewrites.md` were NOT applied — those targeted the original 10 routes (now gone). The 10 new legs carry the original A5 proposal titles (more formal). Client-facing rewrite is a separate decision.
