# Routes Hierarchy Archaeology — Cafe Barra
**Date:** 2026-05-19  
**Company ID:** 58b2b15b-bada-4bcd-9c12-b7e66a37d0bc  
**Scope:** Read-only investigation. No schema changes, no data mutations.

---

## Executive Summary

The A5 route/leg/action hierarchy was **designed and partially implemented but never applied to Cafe Barra's data.** The schema migration ran (DDL only). The proposal doc was written. Phase 3 — the data migration that would have created the 3 top-level routes and reassigned 10 existing rows as legs — was explicitly blocked pending user approval and was never run. The 9 routes currently in the DB are a separate `research-company` run from 2026-05-18 that wrote consumer-facing brewing UX routes — unrelated to the B2B hierarchy A5 designed — because `research-company` always inserts `level='route'` with no `parent_id` regardless of the A5 plan.

---

## Phase 1 — Documentation Review

### `docs/migrations/cafe-barra-a5-route-proposal.md`

**Status at file:** "Awaiting user review" — dated 2026-05-15.

The document proposed restructuring 10 existing Cafe Barra route cards into 3 top-level routes with legs beneath:

| Route | Legs | Focus |
|-------|------|-------|
| **A: Earn the right to make the exceptional claim** | A1 (margin), A2 (supplier terms), A3 (stock-out), A4 (prep quality) | Operational reliability |
| **B: Make the Barra Process visible and transferable** | B1 (template), B2 (seasonal brief), B3 (consistency signal), B4 (comparison test) | Process externalization + proof |
| **C: Win the right partners through evidence, not pitch** | C1 (pre-qual tier), C2 (proof → confidence) | Partner pipeline |

**Desired outcome proposed:**
> "Earn recognition as the verifiable quality standard for craft-first cafe operators, building sustainable margin through selective partner relationships and a documented, transferable process."  
> `importance_score: 9, satisfaction_score: 2`

The doc explicitly states:
> "Do not run Phase 3 (data migration) until you approve, modify, or override these groupings."

**Phase 3 was never approved. No response is recorded in this doc.**

---

### `docs/migrations/cafe-barra-leg-title-rewrites.md`

**Status at file:** "Proposed — awaiting sign-off before any DB update."

Proposed client-facing rewrites for all 10 leg titles (voice target: "smart friend, direct, zero jargon"). The doc lists the exact UUIDs targeted for the `title` UPDATE:

| Route | UUID prefix | Proposed title (sample) |
|-------|-------------|------------------------|
| A1 | `ecf0b2e3` | "See how price changes actually hit your margins" |
| A2 | `f0fac021` | "Fix your supplier terms — the ambiguity is creating stock-outs" |
| A3 | `6dacee4b` | "Track inventory properly so you stop finding out too late" |
| A4 | `111d3d7f` | "Make prep quality consistent without one person holding it together" |
| B1 | `e3000001` | "Turn one roasting template into something a partner can actually verify" |
| B2 | `e4000001` | "Make seasonal transitions feel intentional to partners, not like a supply problem" |
| B3 | `e1000001` | "Give partners a way to check your consistency themselves" |
| B4 | `e5000001` | "Find out if your positioning survives a head-to-head with Blue Bottle or Stumptown" |
| C1 | `e2000001` | "Screen partners earlier — save the full interview for the ones already showing fit" |
| C2 | `49318645` | "Find out if documented proof actually changes how partners decide to come back" |

**None of these UUIDs match the 9 routes currently in the DB** (current prefixes: 80ffc6d6, 279dad58, b3362e0e, 0d7a9251, 44b7b34d, 6697fbcc, c86b6e90, 62b02b76, 9c70a027). The 10 original rows these titles targeted appear to no longer exist as active routes, or were from a prior DB state that predates the current 9 rows.

---

### `supabase/migrations/20260603200000_a5_route_leg_action_hierarchy.sql`

**Schema-only DDL migration — no data mutations.**

What it adds to `routes`:

| Column | Default | Constraint |
|--------|---------|-----------|
| `level` | `'leg'` | `CHECK (level IN ('route', 'leg', 'action'))` |
| `parent_id` | NULL | FK → `routes(id) ON DELETE SET NULL` |
| `primary_desired_outcome_id` | NULL | FK → `desired_outcomes(id) ON DELETE SET NULL` |
| `secondary_desired_outcome_ids` | `'{}'` | uuid[] |
| `rejected_alternatives` | `'[]'` | jsonb |
| `what_would_have_to_be_true` | `'[]'` | jsonb |

New tables created: `public.desired_outcomes` (with unique index enforcing at most one `is_primary=true` per company), `public.tests`, `public.mojo_scores`.

**Key detail:** `level` defaults to `'leg'` — not `'route'`. Rows created before this migration (with no explicit `level` value) would become `'leg'` after the migration ran. But `research-company` explicitly overrides this by writing `level: "route"` in every insert payload (see Phase 3 below).

**Status:** The migration is in the migrations directory. Whether it ran against Cafe Barra's DB is confirmed by the diagnostic: the columns exist. Schema migration ran successfully.

---

## Phase 2 — Code Consumer Survey

### `level` and `parent_id` consumers in `src/`

| File | Usage | Notes |
|------|-------|-------|
| `hooks/useFoundationStatus.ts:42` | `routes.filter((r) => r.level === "route")` | Foundation status computes over top-level routes only |
| `hooks/useDirectionEvidence.ts:155–178` | Filters `level === "route"` for topRoutes; groups legs by `parent_id` into a map | Full hierarchy-aware grouping — currently dead for Cafe Barra (no legs) |
| `lib/mojoScore/contributors/actionPortfolioBalance.ts:21` | `hasHierarchy = routes.some((r) => r.level === "route")` | Falls back to flat behavior if no route-level rows |
| `views/client/ClientRefinePreviewRoutesView.tsx:2477–2506` | `hasHierarchy`, `topLevelRoutes`, `legRoutes`, `legsByParentId` map, `leadRoute` computation | Full hierarchy rendering; if `hasHierarchy=true` but `legRoutes=[]`, renders 9 top-level route panels with no legs inside |

**Current rendering behavior for Cafe Barra:** `hasHierarchy=true` (because all 9 rows have `level='route'`), but `legRoutes=[]` (no legs exist). The UI renders 9 "top-level route" panels that contain no leg cards — an empty hierarchy.

---

## Phase 3 — Edge Function Inspection

### `research-company`

Lines 7062 and 7084 in the insert payloads:
```typescript
level: "route",
```

`research-company` **always** inserts routes with `level: "route"` and **never** sets `parent_id`. It has no leg-writing code. This is the root cause of the current state: when `research-company` ran on 2026-05-18 and generated 9 routes from consumer-facing ODI customer job data, every row landed with `level='route'` and `parent_id=NULL`.

`research-company` also inserts `rejected_alternatives` and `what_would_have_to_be_true` from LLM output — so those fields are populated on the current 9 rows, but they're A5 hierarchy fields on flat routes, not on the strategic structure A5 intended.

### `propose-route-changes`

The proposal schema covers: `title`, `short_description`, `rejected_alternatives`, `what_would_have_to_be_true`, `proposal_reason`. **Does not include `level` or `parent_id`.** This function is hierarchy-blind — accepting a proposal will never restructure the route/leg relationship.

---

## Root Cause Reconstruction

**What happened, chronologically:**

1. **Pre-A5 (some time before 2026-05-15):** Cafe Barra had 10 existing routes. These were the rows the A5 proposal planned to convert to legs. Their UUID prefixes (ecf0b2e3, f0fac021, etc.) are referenced in the leg-title-rewrites doc.

2. **A5 Phase 1 (schema migration ran):** `level`, `parent_id`, and associated columns added to `routes`. The 10 existing rows would have received `level='leg'` as the column default.

3. **A5 Phase 2 (proposal doc written, 2026-05-15):** `cafe-barra-a5-route-proposal.md` written. Awaiting user approval to run Phase 3.

4. **Phase 3 blocked — never approved.** No evidence of a reply or approval. The 3 top-level routes (A, B, C) were never created. The 10 original rows were never restructured as legs. The desired outcome row was never inserted.

5. **`research-company` ran on 2026-05-18T14:32:24 UTC.** Generated 9 new routes from consumer-facing ODI customer job data (source: `system`). Each row inserted with `level='route'`, `parent_id=NULL`. These 9 rows describe consumer brewing UX problems — not B2B cafe partnership strategy. They appear to be from a research run that predated or ignored the B2B pivot.

6. **The original 10 rows** (ecf0b2e3, f0fac021, etc.) either: (a) were deleted/replaced by the research-company run, or (b) existed alongside these 9 new routes and were removed at some point. The diagnostic confirmed exactly 9 rows now, all with the new UUIDs.

---

## Summary Table

| Item | Status | Detail |
|------|--------|--------|
| A5 schema migration ran | ✓ YES | `level`, `parent_id`, `desired_outcomes`, `tests`, `mojo_scores` all present |
| A5 route proposal doc exists | ✓ YES | `docs/migrations/cafe-barra-a5-route-proposal.md` |
| A5 Phase 3 data migration ran | ✗ NO | Blocked pending user approval; never approved |
| 3 top-level B2B routes created | ✗ NO | Phase 3 never ran |
| 10 original legs restructured | ✗ NO | Original UUIDs (ecf0b2e3 etc.) not in current DB |
| Leg title rewrites applied | ✗ NO | `cafe-barra-leg-title-rewrites.md` still "awaiting sign-off" |
| Desired outcome row inserted | ✗ NO | `desired_outcomes` table likely empty for Cafe Barra |
| Current 9 routes — source | `research-company` (2026-05-18) | `level='route'`, `parent_id=NULL`, consumer-facing brewing UX |
| Current 9 routes — B2B aligned | ✗ NO | Pre-B2B-pivot consumer artifacts |
| `research-company` creates legs | ✗ NO | Always writes `level='route'`, never sets `parent_id` |
| `propose-route-changes` touches hierarchy | ✗ NO | Schema covers title/description/alternatives only |
| UI rendering code is hierarchy-ready | ✓ YES | `ClientRefinePreviewRoutesView` handles route/leg grouping |
| Current UI rendering | Empty hierarchy | 9 top-level routes, zero legs inside any of them |

---

## Implications

**For A78/A79:**

1. **The drift baseline (A76) is technically correct but covers the wrong routes.** The 9 routes that received a baseline are consumer-facing brewing UX routes — not the B2B strategic routes A5 intended. If the hierarchy is ever rebuilt from scratch, those 9 routes would be replaced and their baselines would be orphaned.

2. **`research-company` must not be run again before the hierarchy decision is made.** Each run adds more flat `level='route'` rows with no parent linkage, deepening the mismatch.

3. **`propose-route-changes` is safe to run on current routes** (hierarchy-blind, won't corrupt `level`/`parent_id`), but proposals will be for the wrong routes if the goal is the B2B hierarchy.

4. **To actually build the A5 hierarchy, Phase 3 needs to be run manually.** The approved path (from the proposal doc) requires: creating a `desired_outcomes` row, inserting 3 new `level='route'` rows (A, B, C), updating the 10 original leg rows with `parent_id` references, and setting `level='leg'` on them. Since the original 10 leg UUIDs appear gone, this would be a clean-start migration: archive or delete the 9 current consumer routes, generate or hand-author the 3 B2B routes + 10 legs.

5. **The UI is ready.** Once real hierarchy data exists (3 routes + legs), `hasHierarchy=true`, `legRoutes` will be non-empty, and `legsByParentId` will group correctly. No frontend changes needed to render the hierarchy.
