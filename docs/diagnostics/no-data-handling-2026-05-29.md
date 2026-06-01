# No-Data / Thin-Data Handling — Internals Diagnostic
**Date:** 2026-05-29  
**Branch:** strategic-object-graph  
**Scope:** Read-only. No data modified, no pipeline runs, no companies touched.  
**Prior context:** Cold-start audit `docs/diagnostics/cold-start-capability-2026-05-29.md`;
job-step industry-anchor build (complete, on this branch).

---

## 1. Status Taxonomy

### Where status lives

`public_baseline_runs` has no `status` column. Status is stored inside `result_json.status`
(JSON field). `fetchEvidenceState()` in `run-framework-diagnosis:89–92` synthesizes a derived
`"missing"` when no run exists:

```typescript
const baselineStatus = String(
  latestBaselineRun?.result_json?.status || "missing",
);
```

### The four non-ok outcomes

| `result_json.status` | `sources_json.note` | Trigger condition | Code cite |
|---|---|---|---|
| `"insufficient_public_evidence"` | `"no-results"` | `annotated.length === 0 && directEvidence.length === 0` — search returned nothing; crawl also empty | `public-baseline:1999–2027` |
| `"insufficient_public_evidence"` | *(none set)* | `filteredAnnotated.length === 0 && annotated.length > 0 && directEvidence.length === 0` — all sources filtered by source controls | `public-baseline:2070–2143` |
| `"ambiguous_public_evidence"` | `"ambiguous"` | `strong.length === 0 && medium.length === 0 && directEvidence.length === 0` — sources found but no company-match | `public-baseline:2146–2223` |
| `"insufficient_public_evidence"` | `"thin-evidence"` | `evidence.length < 2 && !hasBootstrapEvidence` — fewer than 2 extractable sources | `public-baseline:2398–2481` |

The fifth outcome (not a run at all): `fetchEvidenceState` returns `baselineStatus = "missing"`
when `public_baseline_runs` has zero rows for the company (`run-framework-diagnosis:89–92`).

### No-data vs. thin distinction

- **No public data:** `sources_json.note = "no-results"` — zero search hits, zero crawl. Company
  has no findable public footprint. `result_json.open_questions[0]` = "Not enough public sources..."
- **Thin:** `sources_json.note = "thin-evidence"` — sources found, <2 extractable. Company has
  *some* footprint but it's not enough for synthesis. Same `status = "insufficient_public_evidence"`,
  same `open_questions`, different `sources_json.note`. No dedicated field distinguishes them
  in `result_json`.
- **Ambiguous:** `status = "ambiguous_public_evidence"` — sources found, none match. Likely a name
  collision or very small company.

All three paths call `ingestPublicBaselineSignals()` — signals and claims are written regardless.
`triggerMojoAnalysis()` fires **only on `status: "ok"`** (`public-baseline:2551`).

---

## 2. Latent Signals — Where They Live and Who Reads Them

### `open_questions` (in `result_json`)

**Written by:**
- `buildInsufficientResult()` at `public-baseline:1459–1461`:
  `"Not enough public sources to establish a baseline. Add more sources (press, docs, profiles) or upload internal docs."`
- `buildAmbiguousResult()` at `public-baseline:1513–1515`:
  `"Search results look like they may refer to a different company..."` and
  `"If this company has a small footprint, add a LinkedIn page, press mention, or upload internal docs..."`
- The ok path: `callOpenAI()` may write open_questions; normalized at `public-baseline:1598–1604`.

**Consumed by:**
- `PublicBaselinePanel.tsx:166` — renders up to 4 items in the admin-only baseline detail panel.
- `usePublicBaseline.ts:31` — counts items for quality-scoring only (`listCount(result.open_questions)`).
- `decisionPathAdapter.ts:928` — reads up to 6 lines (`asStringLines(result.open_questions, 6)`)
  as strategy context for the decision path adapter.

**NOT surfaced in any client-facing view.** `PublicBaselinePanel` is admin-only. The decision path
adapter ingests open_questions into strategy context but does not render them as explicit operator
or client prompts.

### `industry_unresolved` (on `job_steps.evidence_basis`)

Written by the industry-anchor build (this branch) when `inferStandardMarketCategory()` returns
`""`. Currently **no code reads this field for surfacing** — it is a latent tag for the no-data
build to act on.

### `synthesisMode: "fallback"` (in HTTP response body)

Written at `local-jobmap-synthesis:962` into the edge function's HTTP response JSON. **Not stored
anywhere in the DB.** The caller receives it but nothing persists or surfaces it. Ephemeral.

### `sources_json.note = "thin-evidence"` / `"no-results"` / `"ambiguous"`

Written into `public_baseline_runs.sources_json` (the debug column). **No frontend code reads
`sources_json.note`** — it is debug-only, inspectable via Studio or raw SQL only.

---

## 3. Create-Anyway / Path C

### Company creation with blank URL

`handleCreateClient()` in `ClientRefinePreviewWorkshopView.tsx:1165–1173`:

```typescript
const { data, error } = await supabase
  .from("companies")
  .insert({
    name,
    website: sanitizedWebsite || null,  // null when URL is blank
    created_by: user.id,
  })
  .select("id,name,website")
  .single();
```

**A company can be created with `website = null`.** The insert succeeds.

### What fires next

After insert (`data.id` available), at line 1182:

```typescript
if (newClientRunBaseline) {
  if (!sanitizedWebsite) {
    throw new Error("Website required to run outside-signals baseline.");
  }
  // ... runs baseline
} else {
  toast.success(`Client created: ${data.name}`);
}
```

`newClientRunBaseline` defaults to `true` (checkbox pre-checked, line 1195 resets on success).

- **URL blank + checkbox checked (default):** company IS created, then throws immediately. Error
  toast shown. Dialog stays open (`setShowCreateClient(false)` is NOT called in catch). The created
  company has no baseline. No rollback.
- **URL blank + checkbox unchecked:** company created, `setActiveCompanyId(data.id)` switches to
  it, success toast, dialog closes, user sees workshop for the empty company.

`public-baseline` itself hard-returns 400 when URL is absent — `public-baseline:1691–1693`:
```typescript
if (!company_name || !website) {
  return json({ error: "company_name and website are required..." }, 400);
}
```
So a blank-URL baseline call is also rejected at the edge function level.

### Does path C land on an upload affordance?

**No.** After creating a company without URL (checkbox unchecked path), the user lands on the
workshop view for that company. `InputsTab` (which contains `FileUploadDialog`) is reachable as a
tab in the workshop, but **nothing automatically routes a no-URL company to it**. There is no
triggered upload prompt, no banner, no redirect. The upload affordance is available but passive.

**Path C status: partially implemented.** "Create a company" works. "Land on upload affordance"
is not wired. The brief's path c (blank URL → create → land on upload affordance) requires
an explicit post-create redirect or prompt that does not currently exist.

---

## 4. Adjudication on No/Thin Baseline

`adjudicate()` in `_shared/adjudication.ts:44–120`. Called by `run-framework-diagnosis:372`
with the current evidence state.

### With `mode = "hybrid"` (cold-start default)

| Condition | `uploadedFileCount` | `existingArtifactCount` | Outcome |
|---|---|---|---|
| `baselineStatus = "missing"` | 0 | any | **422** — `AdjudicationBlockedError`, status `"missing_evidence_context"` (lines 106–111) |
| `baselineStatus = "insufficient_public_evidence"` | 0 | 0 | **422** — `AdjudicationBlockedError`, status `baselineStatus` (lines 92–105) |
| `baselineStatus = "ambiguous_public_evidence"` | 0 | 0 | **422** — same as above |
| `baselineStatus = "insufficient_public_evidence"` | 0 | >0 | Routes gracefully, `contextMode = "public_baseline"` (lines 93–96) |
| `baselineStatus = "missing"` | >0 | any | Routes gracefully, `contextMode = "uploaded_only"` (lines 87–91) |
| `baselineStatus = "insufficient_public_evidence"` | >0 | any | Routes gracefully, `contextMode = "uploaded_only"` (lines 87–91) |

**The brief requirement ("new model should NOT 422")** is NOT met today. A fresh company with no
baseline and no uploads hard-blocks at 422. A fresh company with a thin/insufficient baseline and
no uploads + no prior artifacts also hard-blocks.

The existing grace paths only fire when: (a) uploads exist, or (b) prior artifacts exist (routes
or opportunities count > 0).

### With `mode = "public_only"`

Weak or missing baseline → always 422 (lines 73–82).

### With `mode = "uploaded_only"`

No uploaded files → always 422 (lines 62–69).

---

## 5. Upload Affordance

### `FileUploadDialog` — what it is

`src/components/FileUploadDialog.tsx` — a Dialog component that handles drag-and-drop file
upload, AI analysis of the file, and assignment to an `input_key` (evidence area). It uses the
`useUploadInputFile()` mutation hook.

### Where it appears

| Surface | File | Notes |
|---|---|---|
| Workshop → Inputs tab | `src/views/client/workshop/tabs/InputsTab.tsx:2210` | Operator-accessible in the workshop flow |
| Admin Inputs view | `src/views/Inputs/index.tsx:204` | Admin-only |
| Admin Input Side Panel | `src/views/Inputs/InputSidePanel.tsx:309` | Admin-only inspect panel |
| Admin Company Files | `src/components/admin/CompanyFilesPanel.tsx:1768` | Admin-only; route `/admin/companies/:id/files` |
| Files Repository page | `src/pages/FilesRepository.tsx:708` | Admin-only |

**The only operator-accessible upload surface reachable from the client-facing workshop is
`InputsTab`** — but it's a passive tab, not an active affordance surfaced to new no-data companies.

### What routes a company to uploads today

Nothing. There is no code path that:
- Auto-navigates to `InputsTab` after a no-URL company create
- Shows an "upload docs" banner when `baseline_status = "insufficient"` or `"missing"`
- Triggers `FileUploadDialog` on create of a company with no public footprint

The `InputsTab` contains an integration-status block (lines 1675–1712) that renders a yellow
banner when files are uploaded but not yet analyzed or assigned. But this only shows AFTER files
exist — it does not prompt uploads when no files are present.

---

## 6. Surfacing Seam

Two distinct problems require distinct attachment points.

---

### Case A — No public data (no footprint or blank URL)

**Signal available:** `sources_json.note = "no-results"` OR `companies.website IS NULL` OR
`public_baseline_runs` has zero rows for the company.

The signal is DB-readable but no frontend component consumes it as an actionable prompt.

#### Option A1 — Post-create redirect in `handleCreateClient()`

**What changes:** After `setActiveCompanyId(data.id)`, detect `!sanitizedWebsite` and instead of
only showing a toast, open the Inputs tab (`setSelectedTab("inputs")` or equivalent) and open
`FileUploadDialog` automatically.

**Change surface:** `ClientRefinePreviewWorkshopView.tsx` — `handleCreateClient()` (~5 lines) +
tab state wiring.

**Tradeoffs:**
- (+) Minimal — wires directly to the moment the operator has chosen "no URL."
- (+) No new DB read, no new hook — the condition is known synchronously at create time.
- (–) Only catches the no-URL path. Doesn't catch "URL provided but search returned nothing."
- (–) Requires `InputsTab` to be in the same view as the create form (true for the Workshop).

#### Option A2 — Adjudication graceful routing instead of 422

**What changes:** In `adjudicate()`, for `baselineMissing + no uploads`, instead of throwing
`AdjudicationBlockedError`, return a new `contextMode: "upload_required"` (or extend the enum).
`run-framework-diagnosis` catches this and returns a structured response (e.g., HTTP 200 with
`status: "upload_required"`, not 422). The frontend reads this status and surfaces the upload prompt.

**Change surface:** `_shared/adjudication.ts` (~5 lines), `run-framework-diagnosis/index.ts`
(handle new context mode), frontend error-handling for the framework diagnosis call.

**Tradeoffs:**
- (+) Catches all no-baseline cases, not just blank-URL creates.
- (+) Enables the adjudication result itself to be the surfacing signal — consistent with how
  the system already communicates evidence gaps to callers.
- (–) Requires a schema/enum change to `ContextMode` and downstream handling.
- (–) More surface area; the adjudication change affects all flow entry points.

#### Option A3 — Ambient banner from `companies.website IS NULL` or baseline status

**What changes:** A hook (e.g., `useNoDataPrompt()`) reads the company's baseline status from
`usePublicBaseline`. If `run === null` AND `companies.website === null`, renders a persistent
banner in the workshop/refine view: "No public data found — upload internal documents to start."
Banner links to the Inputs tab.

**Change surface:** New hook + banner component; no backend change.

**Tradeoffs:**
- (+) Zero backend change, no adjudication change.
- (+) Persistent — shows on any visit to the company, not just at create time.
- (–) Reads from the frontend on every load; slightly reactive vs. proactive.
- (–) Doesn't prevent the 422 when framework diagnosis is run on a no-data company.

---

### Case B — Thin data (baseline ran but insufficient/ambiguous)

**Signal available:** `public_baseline_runs.result_json.status = "insufficient_public_evidence"` or
`"ambiguous_public_evidence"`, with `result_json.open_questions` already populated with actionable
text. Also: `sources_json.note = "thin-evidence"` distinguishes thin from filtered.

#### Option B1 — Surface `open_questions` in the workshop compass / Drift inbox

**What changes:** The workshop compass or the Drift inbox (already reads from signals) adds a
"baseline quality" card: if latest baseline status is insufficient/ambiguous, render the first
`open_questions` item as a visible card or banner with an action: "Upload docs to improve baseline."

**Change surface:** Workshop compass component or DriftInbox — add one conditional block.
`usePublicBaseline` hook already returns `run.result_json.open_questions` (accessible via
`run.result_json` field read).

**Tradeoffs:**
- (+) `open_questions` already contains the right text — no new field needed.
- (+) Zero backend change.
- (–) The Drift inbox is for strategy drift, not evidence gaps — mixing concerns.
- (–) `open_questions` is not schema-validated; its content is LLM-generated and can vary.

#### Option B2 — New `data_quality_flag` field on `public_baseline_runs.result_json`

**What changes:** `buildInsufficientResult()` and `buildAmbiguousResult()` add a structured
field: `data_quality_flag: { type: "thin" | "no_results" | "ambiguous", prompt: string }`.
Frontend reads this field and renders a dedicated "Evidence gap" card, separate from hypotheses
and outside-voice signals.

**Change surface:** `public-baseline/index.ts` (~5 lines in each build function). Frontend:
add card in `PublicBaselinePanel` and/or in the workshop evidence-lineage section.

**Tradeoffs:**
- (+) Structured — type-safe, readable, distinguishes thin from no-results.
- (+) Forward-compatible: the prompt text can evolve separately from open_questions.
- (–) Requires a coordinated frontend + backend change.
- (–) Adds a new field to an already-large JSONB column (minor concern).

#### Option B3 — `job_steps.evidence_basis` tag as the seam (use `"industry_unresolved"`)

**What changes:** The no-data build reads `job_steps.evidence_basis = "industry_unresolved"` and
surfaces a "No industry detected — improve baseline or upload docs" overlay on the job-steps view.

**Change surface:** Frontend job-steps view; no backend change beyond what's already in place.

**Tradeoffs:**
- (+) Latent tag already exists (from the industry-anchor build on this branch).
- (+) Scoped to job_steps — doesn't require changes to baseline pipeline.
- (–) Only covers the "industry unresolved" case, not the broader thin-baseline case.
- (–) Requires `job_steps` to have been generated; useless before `local-jobmap-synthesis` runs.

---

## Summary

| Question | Answer | Cite |
|---|---|---|
| How does "no public data" differ from "thin"? | Same `status="insufficient_public_evidence"`; distinguished only by `sources_json.note` ("no-results" vs "thin-evidence"). No dedicated `result_json` field. | `public-baseline:2005, 2414` |
| Who reads `open_questions` today? | Admin panel (`PublicBaselinePanel`), quality scorer (`usePublicBaseline:31`), decision path context (`decisionPathAdapter:928`). No client-facing render. | As cited |
| Is `synthesisMode:"fallback"` stored? | No — HTTP response body only, not persisted. | `local-jobmap-synthesis:962` |
| Does create-without-URL work? | Yes — company created with `website=null`. But baseline throws, dialog may stay open, and no upload affordance is surfaced post-create. | `ClientRefinePreviewWorkshopView.tsx:1165–1196` |
| Is path C implemented? | Partially. Create without URL works. "Land on upload affordance" is not wired. | As above |
| Does adjudication 422 on no baseline? | Yes — fresh company, no baseline, no uploads → 422 `"missing_evidence_context"`. | `adjudication.ts:106–111` |
| Does adjudication 422 on thin baseline? | Yes — thin baseline, no uploads, no existing artifacts → 422. | `adjudication.ts:92–105` |
| Does the upload affordance exist? | Yes — `FileUploadDialog` in `InputsTab`. Not auto-surfaced for no-data companies. | `InputsTab.tsx:2210` |

**Operator decision required for both cases.** All six seam options share zero schema-change
profile except B2 (adds a `data_quality_flag` field to result_json, no migration needed since it's
JSONB). Adjudication change (A2) is the only option that removes the 422 block.
