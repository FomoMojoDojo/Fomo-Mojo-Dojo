# Job Map Archaeology — 2026-05-20

Diagnostic for Cafe Barra (`company_id: 58b2b15b-bada-4bcd-9c12-b7e66a37d0bc`).
Read-only. No code, schema, or data changes.

---

## Current State

The Job Map view renders a single journey (`journey_key = 'customer'`) with 8 steps. Every
symptom observed during the 2026-05-20 walkthrough is confirmed by DB query:

| What was seen | Root cause |
|---|---|
| Generic step labels ("Perform the core task") | Synthesis fallback reset to canonical templates |
| `evidence_basis` identical across all steps | `normalizeToEightCheckpointSpine` injects one `defaultEvidenceBasis` into every step |
| "What must be true" mixes template with content | Derived client-side from generic descriptions + repeated basis text |
| Consumer home-brewing journey for a B2B strategy | `journey_title` = B2C framing; no partner journey exists |
| No solution-to-step mapping | Routes matched heuristically at render time; no schema junction |

**Live DB step content (all 8 steps, all identical fields):**

```
evidence_basis:  "The first pass produced invalid steps, so this map was rebuilt
                  into the required 8-step customer sequence"
evidence_status: unclear
has_gap:         true
journey_key:     customer
journey_title:   "Job Map: End consumers preparing coffee at home or visiting
                  locations to buy coffee"
```

Step labels (as stored):

1. Define desired progress
2. Locate viable options
3. Prepare required conditions
4. Confirm readiness
5. Perform the core task  ← most obviously template-generic
6. Monitor results
7. Adjust the approach
8. Conclude and learn

Steps 5–8 descriptions (`job_steps.description`): textbook ODI templates from
`JTBD_ODI_CHECKPOINTS.description` ("Carry out the core task required to create the intended
progress.", "Detect early signals of progress or risk.", etc.).

---

## Generator Trace

### Where step content comes from

**Entry point:** `supabase/functions/local-jobmap-synthesis/index.ts`

The synthesis function:
1. Calls Ollama LLM to generate a `NormalizedJourney` (steps + needs)
2. Validates the output via `validateEightCheckpointSpine()`
3. If validation fails → calls `normalizeToEightCheckpointSpine([], { defaultEvidenceBasis: "..." })`

Step 3 is what happened to Cafe Barra. The reset path (line ~608 in the synthesis file):

```ts
normalizeToEightCheckpointSpine([], {
  defaultEvidenceBasis: `${args.evidenceBasis} The first pass produced invalid steps,
    so this map was reset to the required 8-step customer sequence.`,
  defaultConfidence: 45,
  defaultGapNote: contextualGapNote,
})
```

`normalizeToEightCheckpointSpine` (in `supabase/functions/_shared/jtbdProcess.ts`) maps over
all 8 `JTBD_ODI_CHECKPOINTS` and injects the `defaultEvidenceBasis` string into EVERY step
because each `byStep.get(checkpoint.stepNumber)` returns `undefined` (empty input array):

```ts
evidence_basis: safeText(existing?.evidence_basis) || defaults.defaultEvidenceBasis,
// existing is undefined for all 8 → same string injected 8×
```

This is the mechanical cause of the verbatim repetition.

### Why the first pass failed

The LLM output had step labels that passed `containsSolutionPrescriptiveLanguage()` or the
spine validation failed on step count/format. The synthesis function contains no retry — it
immediately falls back to the canonical template spine.

### Source attribution

No separate `source_run_id` column is populated in the current Cafe Barra rows (NULL).
`frameworks_used` was not set on these rows (populated only in the reconstructed seed).
All timestamps cluster together, consistent with a single automated generation run.

### "Rebuild map" comment in evidence basis text

The text says "**rebuilt** into the required 8-step customer sequence." The seed file comment
(`cafe_barra_full_workspace.sql` line 285) confirms the original Cafe Barra job map was
AI-generated and is unrecoverable from git. The current 8 rows are the fallback-reset
output, not the original synthesis.

---

## Data Flow

### `job_steps` schema (complete as of 2026-05-20)

Table `public.job_steps`:

| Column | Type | Notes |
|---|---|---|
| `id` | UUID | PK |
| `company_id` | UUID | FK → companies |
| `user_id` | UUID | |
| `journey_key` | TEXT | `'customer'` / `'revenue'` / `'operations'` / custom; no FK |
| `journey_title` | TEXT | Denormalized journey name |
| `journey_subtitle` | TEXT | Denormalized subtitle |
| `step_number` | INTEGER | 1–8 |
| `step_label` | TEXT | Step articulation title |
| `description` | TEXT | Step description |
| `designed` | BOOLEAN | |
| `has_gap` | BOOLEAN | |
| `gap_note` | TEXT | |
| `evidence_status` | TEXT | `evidenced` / `implied` / `unclear` |
| `evidence_basis` | TEXT | Textual attribution (added 20260313113000) |
| `evidence_confidence` | INTEGER | 0–100 (added 20260313113000) |
| `frameworks_used` | TEXT[] | (added 20260312091000) |
| `dependency_state` | TEXT | Strategic graph (added 20260508180000) |
| `validation_state` | TEXT | |
| `evidence_state` | TEXT | |
| `last_reviewed_at` | TIMESTAMPTZ | |
| `stale_reason` | TEXT | |
| `stale_since_event_id` | UUID | FK → strategic_graph_events |
| `source_run_id` | TEXT | |

**No `what_must_be_true` column.** That field exists only on `strategic_hypotheses`.

### Opportunity-to-step linkage

No foreign key. Link is resolved at **render time** in `JobMapOrgPanel.tsx` (line 1071–1073):

```ts
const linkedOpps = allNeeds.filter(
  (n) => n.journey_key === step.journey_key && n.step_number === (step.step_number ?? idx + 1),
);
```

Both `odi_needs.journey_key` and `odi_needs.step_number` are plain columns (not FKs).
If `job_steps` step numbers are renumbered, the linkage silently breaks.

### SERVED / UNDERSERVED classification

Stored directly on `odi_needs.service_state` (TEXT, default `'served'`).
Values in Cafe Barra: `'served'` and `'underserved'` (correctly set per need).
NOT computed dynamically — it's a stored field set at needs-generation time or manually.
Displayed in `JobMapOrgPanel.tsx` line 1129–1141.

### "What must be true" derivation

**Not stored anywhere.** Derived entirely client-side by `deriveInternalConditions()` in
`JobMapOrgPanel.tsx` (lines 242–268). Priority order:

1. `condFromGap(step.gap_note)` — strips negation, wraps core noun as a requirement
2. `condFromDescription(step.description)` — extracts noun list or first clause
3. `condFromBasis(step.evidence_basis)` — strips research preamble
4. `condOwnership(step_label, gap_note)` — "Ownership of X is named and documented"
5. `ODI_PHASE_COND[odiLabel]` — ODI-phase generic fallback

For Cafe Barra: because all steps have the same generic `evidence_basis` and template
descriptions, `condFromBasis()` and `condFromDescription()` produce near-identical output
across steps. The ownership condition `condOwnership()` also repeats because `gap_note`
is empty for most steps.

---

## Solution-Mapping Gap

### Current state

No junction table linking routes/capabilities to job steps exists anywhere in the schema.
Searched all migration files for: `route_steps`, `step_routes`, `capability_steps`,
`step_capability`, `solution_steps` — zero matches.

The `SuggestedRoutes` component (`JobMapOrgPanel.tsx` lines 535–569) already renders
"Routes that could help" per step but uses a **keyword token overlap heuristic**
(`matchRoutesToStep`) computed at render time:

```ts
const stepTokens = tokenSet(stepLabel + gap_note + description + conditions);
const routeTokens = tokenSet(route.title + why_this_matters_json + short_description);
let score = 0;
for (const w of routeTokens) if (stepTokens.has(w)) score++;
```

Fallback when no token overlap: ranked by `route.pts_value` descending.

This means:
- Route suggestions are plausible but not curated
- When step labels are all generic templates, token overlap is near-zero for most routes
- Routes are sorted by `pts_value` as fallback — which is arbitrary from the step's perspective

The `claim_job_step_refs` junction table (added 20260603100001) links *claims* to job steps,
not routes. This is the evidence provenance chain, not the solution-addressing chain.

### Recommended J4 schema approach

Two options:

**Option A — explicit junction table** (matches AMEX/Strategyn pattern):
```sql
CREATE TABLE route_job_step_links (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  route_id    UUID NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  job_step_id UUID NOT NULL REFERENCES job_steps(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```
Pros: explicit curator control, FK integrity, query-efficient.
Cons: manual curation required; stale if steps regenerated.

**Option B — `step_number` array on routes** (lighter):
Add `addresses_step_numbers INTEGER[]` to `routes`.
Pros: no migration + no join overhead.
Cons: breaks if step numbers change; no FK; less expressive.

Option A is recommended. Populate from the existing heuristic as a starting point, then allow
operator curation.

---

## Partner Journey Gap

### Journeys table

There is **no separate `journeys` table**. Journey metadata is denormalized onto every
`job_steps` row via `journey_key`, `journey_title`, `journey_subtitle`. Same pattern on
`odi_needs`.

### Current Cafe Barra state

```
1 journey: journey_key = 'customer'
journey_title = 'Job Map: End consumers preparing coffee at home or visiting
                 locations to buy coffee'
8 steps (all with has_gap=true, evidence_status='unclear')
```

This is a B2C consumer framing. Cafe Barra's active strategy is B2B (coffee distributor
targeting independent cafe operators). The consumer journey is wrong for the current
strategic context.

### What J3 must create

A partner/B2B journey requires:

1. **8 new `job_steps` rows** with:
   - `journey_key = 'partner'` (or `'b2b_cafe'`)
   - `journey_title` = B2B framing (e.g. "Cafe operators sourcing a distinctive specialty coffee offering")
   - Audience-specific step labels + descriptions (NOT the canonical template)
   - Evidence basis drawn from actual Cafe Barra B2B research signals

2. **`odi_needs` rows** with `journey_key = 'partner'` — linked by `step_number` matching.
   These do not currently exist; B2B needs would need to be generated or seeded.

3. No schema changes needed — `journey_key` is already a free-text field with no FK
   constraint.

### UI multi-journey support

`JobMapOrgPanel.tsx` handles multiple journeys via a `Map<string, JobStepRow[]>` grouping.
Behavior depends on layout mode:

**Legacy layout** (current default): each journey key gets its own `JourneySection` rendered
sequentially. A partner journey would appear below the customer journey — readable but
scroll-heavy.

**Hierarchy layout** (`hasHierarchy = true`): all primary journey keys are **flattened** into
one `allPrimarySteps` array (line 1056–1058). A 'partner' journey would NOT be separated —
its 8 steps would be appended to the 'customer' 8 steps, producing a 16-step tab bar with no
journey label separating them. This is broken for a multi-audience map.

`isInternalJourneyKey()` only separates keys matching `'internal'` or `'operations'`. A
`'partner'` key is treated as primary.

**J3 must address this:** the hierarchy layout needs a journey selector (tabs or dropdown) to
show one audience at a time. The legacy layout works as-is but produces a long page.

---

## Recommended J-Series Scope

### J2 — Customer-specific step regeneration

**What:** Replace the 8 template-generic `job_steps` rows with evidence-derived,
Cafe-Barra-specific step articulation. The regeneration should target the correct job
executor (cafe operators sourcing specialty coffee, not end consumers) and use actual
Cafe Barra research inputs.

**How:** Trigger `local-jobmap-synthesis` edge function with updated `job_executor_role`
and ensure the Ollama output passes `validateEightCheckpointSpine()` so the fallback
template-reset is NOT invoked. Likely requires:
- Updating the company's `job_executor_role` / `jtbd_core_job` metadata before synthesis
- Possibly fixing the synthesis prompt to be more specific about Cafe Barra's B2B context

**Complexity: Medium**

**Dependencies:** None — can run against current schema.

---

### J3 — Partner journey creation

**What:** Create a second journey (`journey_key = 'partner'` or `'b2b_cafe'`) representing
the B2B cafe-operator-as-buyer job. Requires 8 step rows + partner `odi_needs`.

**Sub-tasks:**
1. Data: generate or seed 8 `job_steps` with B2B framing
2. Data: generate `odi_needs` linked to partner steps
3. UI: add journey selector to hierarchy layout (prevents 16-step merging)
4. UI: opportunity-mapping needs filtering by journey when both exist

**Complexity: Large** (data generation + UI changes for journey switching)

**Dependencies:** J2 should run first to clean up the customer journey so the two journeys
don't both show template content.

---

### J4 — Solution-to-step mapping (AMEX pattern)

**What:** Add schema to explicitly link routes/capabilities to job steps. Surface this in
the UI as curated "How we address this step" per step panel.

**Sub-tasks:**
1. Schema: `route_job_step_links` junction table (see Option A above)
2. Seed/backfill: run existing heuristic to populate initial links as a starting draft
3. UI: replace `matchRoutesToStep()` heuristic with a FK-backed query + allow curation
4. Operator UX: add link/unlink controls in the workshop job map panel

**Complexity: Large** (schema migration + backfill + UI curation layer)

**Dependencies:** J2 (step content must be meaningful before curation is useful); J3 (links
should eventually support both journeys).

---

### J5 — Served/underserved per-step rendering + AMEX-style UI

**What:** Surface SERVED/UNDERSERVED classification per step in a cleaner visual summary.
Currently the per-step detail panel lists all `linkedOpps` with their `service_state` label
inline but there's no step-level aggregate (e.g. "3 of 5 needs at this step are
underserved").

**Sub-tasks:**
1. Derive step-level opportunity density + service-state summary
2. Add visual treatment to the tab bar (e.g. colored dot = worst service state at that step)
3. Consider adding an "underserved spotlight" section per step (top 2 highest-score unmet needs)

**Complexity: Small** (no schema changes; all derivable from existing data)

**Dependencies:** J2 (generic descriptions produce noisy linked-opp lists). Can ship J5
after J2 independently of J3/J4.

---

## Dependency Graph

```
J2 (regenerate customer steps)
  └── J3 (partner journey)
       └── J3-UI (multi-journey selector)
  └── J5 (served/underserved UI)  ← can also run independently

J2 + J3
  └── J4 (route-to-step mapping)  ← most valuable after both journeys have real content
```

Recommended order: **J2 → J5 → J3 → J4**
