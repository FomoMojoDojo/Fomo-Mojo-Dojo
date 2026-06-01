# Strategic Hypotheses Table — Read-Only Diagnostic
**Date:** 2026-05-29  
**Branch:** strategic-object-graph  
**Scope:** Read-only. No data modified, no pipeline runs, no companies touched.  
**Purpose:** Settle build #3 representation before scoping journey inference.

---

## 1. Schema

### Migrations
Two migrations define the table:

**Primary create:** `supabase/migrations/20260509150000_create_strategic_hypotheses.sql` lines 1–35

```sql
CREATE TABLE IF NOT EXISTS public.strategic_hypotheses (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id                  uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  hypothesis_key              text NOT NULL,
  statement                   text NOT NULL,
  hypothesis_kind             text NOT NULL CHECK (hypothesis_kind IN (
                                'directional_hypothesis','inferred_tension','candidate_assumption'
                              )),
  hypothesis_state            text NOT NULL DEFAULT 'inferred' CHECK (hypothesis_state IN (
                                'inferred','emerging','strengthened','contradicted','reframed','retired'
                              )),
  topic                       text NULL,
  confidence                  text NOT NULL DEFAULT 'low' CHECK (confidence IN ('high','medium','low')),
  validation_state            text NOT NULL DEFAULT 'unvalidated' CHECK (validation_state IN (
                                'unvalidated','directional','validated','contradicted'
                              )),
  what_must_be_true           jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_run_id               text NULL,
  reframed_from_hypothesis_id uuid NULL REFERENCES public.strategic_hypotheses(id) ON DELETE SET NULL,
  is_active                   boolean NOT NULL DEFAULT true,
  raw_payload                 jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);
-- UNIQUE(company_id, hypothesis_key)
```

**Lifecycle extension:** `supabase/migrations/20260601120000_add_hypothesis_lifecycle_fields.sql` lines 2–18

```sql
ALTER TABLE public.strategic_hypotheses
  ADD COLUMN IF NOT EXISTS originating_context text NULL,
  ADD COLUMN IF NOT EXISTS reframed_reason      text NULL,
  ADD COLUMN IF NOT EXISTS superseded_by_id     uuid NULL
    REFERENCES public.strategic_hypotheses(id) ON DELETE SET NULL;

-- Extends hypothesis_state enum to add 'unstable':
ALTER TABLE public.strategic_hypotheses DROP CONSTRAINT IF EXISTS strategic_hypotheses_hypothesis_state_check;
ALTER TABLE public.strategic_hypotheses ADD CONSTRAINT strategic_hypotheses_hypothesis_state_check
  CHECK (hypothesis_state IN ('inferred','emerging','unstable','strengthened','contradicted','reframed','retired'));
```

### Complete Column List

| Column | Type | Nullable | Default | Constraint |
|--------|------|----------|---------|------------|
| `id` | uuid | NO | gen_random_uuid() | PK |
| `company_id` | uuid | NO | — | FK → companies(id) CASCADE |
| `hypothesis_key` | text | NO | — | UNIQUE with company_id |
| `statement` | text | NO | — | — |
| `hypothesis_kind` | text | NO | — | CHECK: directional_hypothesis / inferred_tension / candidate_assumption |
| `hypothesis_state` | text | NO | 'inferred' | CHECK: inferred / emerging / unstable / strengthened / contradicted / reframed / retired |
| `topic` | text | YES | NULL | — |
| `confidence` | text | NO | 'low' | CHECK: high / medium / low |
| `validation_state` | text | NO | 'unvalidated' | CHECK: unvalidated / directional / validated / contradicted |
| `what_must_be_true` | jsonb | NO | '[]' | — |
| `source_run_id` | text | YES | NULL | — |
| `reframed_from_hypothesis_id` | uuid | YES | NULL | FK → strategic_hypotheses(id) SET NULL (self-ref) |
| `is_active` | boolean | NO | true | — |
| `raw_payload` | jsonb | NO | '{}' | — |
| `originating_context` | text | YES | NULL | Added by 20260601120000 |
| `reframed_reason` | text | YES | NULL | Added by 20260601120000 |
| `superseded_by_id` | uuid | YES | NULL | FK → strategic_hypotheses(id) SET NULL (self-ref); added by 20260601120000 |
| `created_at` | timestamptz | NO | now() | — |
| `updated_at` | timestamptz | NO | now() | — |

### Field Presence Summary (the three flags)

| Field | Present? | Details |
|-------|----------|---------|
| **Status / lifecycle** | YES | `hypothesis_state` — 7-value enum (inferred → emerging → unstable → strengthened / contradicted / reframed / retired). Also `is_active` boolean for active/inactive segregation. |
| **Confidence** | YES | `confidence` — 3-value enum (high / medium / low). Separate from `validation_state` (unvalidated / directional / validated / contradicted), which tracks evidence corroboration level. |
| **Journey linkage** | **NO** | No `journey_key` column, no journey FK, no journey-scoped index. Hypotheses are company-scoped only. |
| **Evidence linkage** | INDIRECT | No direct FK to signals or claims. Evidence is linked via `object_dependencies` rows (upstream_object_type='claim', downstream_object_type='strategic_hypothesis'). |

---

## 2. Populators

### Primary: `rebuildStrategicHypothesesForCompany()`

**File:** `supabase/functions/_shared/strategicHypotheses.ts` lines 115–336  
**Called from:** `supabase/functions/_shared/evidencePhase1.ts` line 357, inside `persistSignalsAndRebuildClaims()`

**Caller chain:**  
`public-baseline` (on every run, all paths) → `persistSignalsAndRebuildClaims()` (evidencePhase1.ts:350–373) → `rebuildStrategicHypothesesForCompany()` (strategicHypotheses.ts:115)

Also triggered by `research-company` when it ingests LLM-derived claims through the same `persistSignalsAndRebuildClaims()` path.

**Derivation and granularity — per-company, per-claim:**  
Each row in `strategic_hypotheses` is derived from a single qualifying `claims` row. The function:

1. Fetches all claims for the company (limit 1000) and all existing strategic_hypotheses (limit 1000) — strategicHypotheses.ts:122–133
2. Passes claims to `buildStrategicHypothesisCandidates()` in `src/lib/strategicHypothesisMappers.ts` — line 139
3. `shouldGenerateHypothesisFromClaim()` (mappers.ts:81–103) gates each claim:
   - Requires `topic` ≠ 'route' / 'job' / 'unknown' — mappers.ts:85
   - Requires total support count > 0 (outside + org + customer) — mappers.ts:86
   - Requires statement length ≤ 160 chars — mappers.ts:87
   - Excludes route-imperative statements (Build/Create/Ensure/etc.) — mappers.ts:89
   - Excludes weak outside-source descriptions (metadata, social profiles, etc.) — mappers.ts:90
   - For outside-supported claims: passes if any outside support — mappers.ts:93–95
   - For org-only strategic_belief/hypothesis claims: passes only if `canBecomeCandidateAssumption()` — mappers.ts:97–99
   - For contradicted claims with any org or outside support: passes — mappers.ts:101
4. Surviving claims become candidates with:
   - **kind** assigned by `hypothesisKindFromClaim()` (mappers.ts:105–110): `inferred_tension` if contradicted or contains tension language; `candidate_assumption` if strategic_belief; else `directional_hypothesis`
   - **statement** rewritten by `hypothesisStatementFromClaim()` (mappers.ts:112+): rule-based phrase matching for known patterns; falls through to direct claim statement for `candidate_assumption` kind
   - **confidence** computed from triangulation state: `high` if customer-validated or multi-band; `low` default

**UPSERT logic** (strategicHypotheses.ts:153–329):
- Matched by `hypothesis_key` (UNIQUE): updates in place, records `strategic_events` event — lines 163–182
- Unmatched: scores against active rows via `matchReframedHypothesis()` (≥3 shared tokens → reframe detected); marks old row `hypothesis_state='reframed', is_active=false`, inserts new with `reframed_from_hypothesis_id` pointer — lines 219–295
- Still-unmatched active rows: marked `hypothesis_state='retired', is_active=false` — lines 298–322

**Typical row count per company:** Variable. Gated by claim count and filter quality. Companies without F3 run produce 0 hypotheses (no qualifying claims). After a full pipeline run, typically 5–25 active hypotheses per company (fewer for single-product companies, more for multi-signal ones).

### Secondary: `rebuildRouteHypothesisDependencies()`

**File:** `supabase/functions/_shared/strategicHypotheses.ts` lines 338–466

Does NOT write to `strategic_hypotheses` directly. Writes only to `object_dependencies`, linking existing active hypotheses → routes via `buildConservativeRouteHypothesisLinks()` (from `src/lib/routeHypothesisLinking.ts`).

### No Other Writers

Grep across the codebase finds no other INSERT or UPSERT into `strategic_hypotheses` outside of `strategicHypotheses.ts`. The table has a single write path.

---

## 3. Consumers

The table is **actively consumed** — not latent.

### `src/hooks/useStrategicHypotheses.ts` (lines 72–243)
Primary read hook. Two exports:

**`useStrategicHypotheses(companyId)`** (lines 72–211):  
Selects `*` from `strategic_hypotheses` for the company (is_active DESC, updated_at DESC, limit 100). Joins `object_dependencies`, `strategic_events`, `claims`, `claim_signal_refs`, `signals` to build `HypothesisProvenanceCard[]` — claim-level provenance with supporting/weakening claims, triangulation metadata, and event history.

**`useRouteHypothesisDependencies(companyId)`** (lines 213–243):  
Selects from `object_dependencies` where upstream_object_type='strategic_hypothesis' and downstream_object_type='route'. Returns `RouteHypothesisDependency[]` mapping hypothesisId → routeId with dependency type and strength. Used by route decision-path adapters.

### `src/components/admin/StrategicHypothesesPanel.tsx` (lines 1–187)
UI rendering. Calls `useStrategicHypotheses()`, displays hypothesis list with `hypothesis_state` filter chips, kind badges, confidence indicator, `what_must_be_true` items, and supporting/weakening claim cards.

### `src/lib/claimState/migration/runner.ts` (line 7, Phase 1A)
Reads `strategic_hypotheses` to convert hypothesis statements into claim records for backwards-compatibility. Edge case: only active when running the claim-state migration utility.

### `src/integrations/supabase/types.ts` (lines 2618–2704)
Auto-generated Row/Insert/Update TypeScript types. Consumed by any typed Supabase query.

---

## 4. Graph Relationship

### Is it a true node in the strategic object graph?

**Yes.** `strategic_hypotheses` is registered as a first-class node type in the strategic object graph.

**Registration:** `src/lib/strategicGraphDomain.ts` lines 47–56

```typescript
export const STRATEGIC_OBJECT_TYPES = [
  "signal",
  "claim",
  "strategic_hypothesis",   // ← registered
  "job_map",
  "job_step",
  "odi_need",
  "route",
  "desired_outcome",
] as const;
```

Table name resolution: `strategicObjectTable("strategic_hypothesis")` → `"strategic_hypotheses"` (strategicGraphDomain.ts:137–141); also registered in the Edge Function graph via `OBJECT_TABLES` in `supabase/functions/_shared/strategicGraph.ts` line 52.

### Edges in `object_dependencies`

`object_dependencies` uses string `upstream_object_type` / `downstream_object_type` — no FK constraint — so `strategic_hypothesis` is a soft node referenced by string. Two edge types are written:

| Upstream | Downstream | Types written | Strength | Writer |
|----------|------------|---------------|----------|--------|
| `claim` | `strategic_hypothesis` | `supports` / `contradicts` | high/medium/low (from claim support counts) | `rebuildStrategicHypothesesForCompany()`, strategicHypotheses.ts:185–206, 274–295 |
| `strategic_hypothesis` | `route` | `supports` / `constrains` / `assumes` / `contradicts` | high/medium/low | `rebuildRouteHypothesisDependencies()`, strategicHypotheses.ts:439–446 |

Graph topology: **signal → claim → strategic_hypothesis → route** — a four-layer directed path.

### `strategic_events` integration

Every CRUD operation on a hypothesis writes a `strategic_events` row with `object_type='strategic_hypothesis'`, `object_id=hypothesis.id`. Events are written for: created, updated/restored (on change detection), reframed, retired — strategicHypotheses.ts:171–182, 232–243, 261–272, 310–321.

### `artifact_versions` — NOT used

Strategic hypotheses are **not** snapshotted in `artifact_versions`. The versioning table is used for job_steps, odi_needs, routes, and desired_outcomes before update. Hypotheses are considered regenerable from claims and are not individually version-snapshotted.

### Self-referential lineage within the table

Two self-referential FKs create an in-table lineage chain:
- `reframed_from_hypothesis_id`: points backward to the hypothesis this one superseded (set on insert when a reframe is detected — strategicHypotheses.ts:248)
- `superseded_by_id`: points forward to the hypothesis that replaced this one (added by 20260601120000_add_hypothesis_lifecycle_fields.sql)

This makes hypothesis lineage queryable within the table without traversing `object_dependencies`.

---

## 5. Journey-as-Hypothesis Assessment

### Can a journey be represented as a first-class hypothesis today?

**No.** The table does not support journey-scoped rows. Three things are missing:

1. **No `journey_key` column.** Hypotheses are company-scoped. There is no column to associate a hypothesis with a specific journey (customer, partner, revenue, operations). The populator (`rebuildStrategicHypothesesForCompany()`) takes only `companyId` and `sourceRunId` — no journey input — and generates from claims regardless of their journey context.

2. **No journey-scoped generation logic.** `buildStrategicHypothesisCandidates()` (strategicHypothesisMappers.ts) operates on all claims for the company. Claims themselves carry no enforced journey attribution — `odi_needs.journey_key` is hardcoded `"customer"` in `research-company` (cold-start-capability-2026-05-29.md line 56), and claims do not inherit a journey_key. An inferred non-customer journey (e.g. a coffee company's B2B/partner direction) has no column to land in.

3. **No 'pending' or 'unconfirmed' state in the current lifecycle.** The 7-value `hypothesis_state` enum (`inferred`, `emerging`, `unstable`, `strengthened`, `contradicted`, `reframed`, `retired`) begins at `inferred` — which is effectively "system-generated from current evidence." There is no explicit `pending` or `unconfirmed_journey` state that distinguishes an inferred journey candidate from an inferred claim-level hypothesis. `inferred` is already the default for every new row, so it cannot be used as a journey-specific signal without convention.

### Representation Options for Build #3

Two options exist. This section lays out what each would require; no recommendation is made here.

---

#### Option A — First-class on `strategic_hypotheses`

A journey inference becomes a row in `strategic_hypotheses` with `hypothesis_kind='directional_hypothesis'` (or a new `'inferred_journey'` kind), keyed by journey, and tied to a pending/unconfirmed state.

**What this requires:**

| Change | Detail |
|--------|--------|
| Schema migration | Add `journey_key text NULL` to `strategic_hypotheses`. The UNIQUE index on (company_id, hypothesis_key) still works if journey inference rows use a key like `journey:b2b_partner` — but only one hypothesis per journey key per company is supported without relaxing the constraint. |
| Hypothesis_kind extension | Either reuse `directional_hypothesis` with `journey_key IS NOT NULL` as the discriminant, or add a new CHECK value (`'inferred_journey'`), which requires another ALTER on the constraint. |
| Lifecycle state — optional | The existing `inferred` state is close to "unconfirmed." If build #3 needs an explicit `pending` state for journey rows (e.g. to filter them separately in UI), add `'pending'` to the `hypothesis_state` CHECK. Or treat `inferred` + `journey_key IS NOT NULL` as the unconfirmed-journey discriminant and skip the state addition. |
| Generator extension | `rebuildStrategicHypothesesForCompany()` (or a new parallel function) must accept journey context and produce journey-scoped candidates. Currently takes no journey input. |
| `what_must_be_true` | Already a jsonb array — can hold the confirmation conditions for a journey hypothesis without schema change. |
| Consumers | `useStrategicHypotheses()` and `StrategicHypothesesPanel` are already filtering by `hypothesis_state`; journey rows would appear there automatically. Route linking (`rebuildRouteHypothesisDependencies()`) would link journey hypotheses to routes the same way. Confirmation logic (when internal data matches → promote `hypothesis_state` to `strengthened`) would need a new writer or an upgrade to `rebuildStrategicHypothesesForCompany()`. |

**Net cost of Option A:** One schema migration (add `journey_key`, optionally extend enum), generator changes, confirmation promotion logic. Aligns with the existing graph — hypothesis → route edges already exist. Downstream UI rendering is largely free.

---

#### Option B — Interim confidence-field on content rows

Journey inference is not a hypothesis row. Instead, a confidence or hypothesis flag is added to existing content rows — most naturally to `odi_needs` (which already has `journey_key`) or to `signals`/`claims` in JSONB.

**What this requires:**

| Change | Detail |
|--------|--------|
| No `strategic_hypotheses` migration | Journey inference state lives elsewhere. |
| `odi_needs` JSONB field (zero-migration path) | The existing `notes_json` or a new key inside `odi_needs.raw_payload` (if it exists) could hold `{ journey_confidence: "inferred", source: "outside_signals" }`. No schema migration if JSONB. But `odi_needs` already has `journey_key='customer'` hardcoded; a non-customer journey need would require either a real journey_key row insert (migration-like) or a fake `journey_key='b2b_inferred'` convention in the JSONB. |
| Signals/claims JSONB field | A flag on `claims` (e.g. `raw_payload.journey_inference: "b2b_partner"`) marks outside-signal-derived journey candidates. Zero migration; but claims have no lifecycle tracking — a claim flag doesn't advance through a hypothesis lifecycle. |
| Confirmation logic | Must be built separately from the hypothesis lifecycle. When internal data confirms the journey, the content row flag transitions — but there is no existing transition infrastructure for claims the way `hypothesis_state` provides for hypotheses. |
| UI surface | Currently nothing reads a `journey_confidence` flag from odi_needs or claims. New UI plumbing required. |

**Net cost of Option B:** No schema migration, but requires JSONB convention design, confirmation transition logic built from scratch, and new UI plumbing. Avoids the strategic_hypotheses migration but loses the existing lifecycle, graph edges, event history, and UI rendering that Option A inherits for free.

---

## Appendix: Key Files

| File | Role |
|------|------|
| `supabase/migrations/20260509150000_create_strategic_hypotheses.sql` | Schema create |
| `supabase/migrations/20260601120000_add_hypothesis_lifecycle_fields.sql` | Lifecycle column additions + enum extension |
| `supabase/functions/_shared/strategicHypotheses.ts` | `rebuildStrategicHypothesesForCompany()` lines 115–336; `rebuildRouteHypothesisDependencies()` lines 338–466 |
| `supabase/functions/_shared/evidencePhase1.ts` | Caller of hypothesis rebuild at line 357 |
| `src/lib/strategicHypothesisMappers.ts` | `shouldGenerateHypothesisFromClaim()`, `hypothesisKindFromClaim()`, `buildStrategicHypothesisCandidates()` |
| `src/lib/strategicHypothesisDomain.ts` | `StrategicHypothesis`, `StrategicHypothesisCandidate`, `StrategicHypothesisDraft` types |
| `src/lib/strategicGraphDomain.ts` lines 47–56 | `STRATEGIC_OBJECT_TYPES` — node type registration |
| `src/hooks/useStrategicHypotheses.ts` | Primary reader — `useStrategicHypotheses()` + `useRouteHypothesisDependencies()` |
| `src/components/admin/StrategicHypothesesPanel.tsx` | UI rendering |
| `src/lib/claimState/migration/runner.ts` | Backwards-compat migration reader |
