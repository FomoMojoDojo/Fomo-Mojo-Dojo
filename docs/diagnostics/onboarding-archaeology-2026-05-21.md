# ONB1 — Original Onboarding Flow Archaeology
**Date:** 2026-05-21  
**Branch:** strategic-object-graph  
**Scope:** Read-only. Documents the EXISTING onboarding flow as built — not a proposal.

---

## 1. Entry Point: "+New Company" in AdminCompanies

**File:** `src/pages/AdminCompanies.tsx`  
**Route:** `/admin/companies`

The "New Company" button (line 1031) triggers `setShowCreate(true)`, opening a dialog with:

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `name` | string | yes | Company display name |
| `website` | string | no | Used for public baseline / web research |

---

## 2. Create Modes (at form submission)

Three user-visible buttons at lines 1169–1201:

| Button label | Runner called | What it invokes |
|---|---|---|
| "Create + Baseline + Research" | `runBaselineAndResearch()` | `run-agent-flow` with `include_public_collection: true` |
| "Create + Web Baseline" | `runBaseline()` | `public-baseline` directly |
| "Create only" | none | Insert to `companies` only — no research |

A fourth mode (`research_only`) exists in the `handleCreate` handler (line 654) but has no corresponding button in the UI.

---

## 3. Database Write

`handleCreate` (line 654):

```ts
supabase.from("companies").insert({ name, website, created_by })
```

Only three fields written on creation. All derived fields (`mojo_score`, `potential_score`, `evidence_status`, `public_source_filters_json`, `excluded_signals_json`, `manual_industry_vocab`, etc.) are populated later by the research pipeline or operator edits.

---

## 4. Post-Creation Landing

After insert + research trigger kick-off: **the UI stays on `/admin/companies`**. There is no redirect.

Polling intervals on the companies list:
- Companies table: every 15s
- Reviews: every 12s
- Locks: every 8s

To navigate to the new company's detail page, the operator clicks the company row → `/admin/companies/:companyId`.

---

## 5. Company Detail Page

**File:** `src/pages/AdminCompanyDetail.tsx`  
**Route:** `/admin/companies/:companyId`  
**Lines:** 211

This page is a read-mostly inspector — there is no research trigger here. Research is launched from the creation form only (or from client-refine path re-runs, see §8).

Page sections in render order:

1. **Header** — company name, website link, score chips (Mojo / Reachable / Evidence)
2. **AiBoundaryNote** — disclaimer: public research + file fallback behavior
3. **PublicBaselinePanel** — baseline signal viewer
4. **PublicSourceFiltersPanel** — operator-controlled source exclusions
5. **EvidenceInspectorPanel** — evidence artifact inspector
6. **StrategicHypothesesPanel** — generated hypotheses
7. **CompanyFilesPanel** (`mode="preview"`) — uploaded company files
8. **CouncilRecommendationsPanel** — council recs
9. **FrameworkProvenancePanel** — framework audit trail

Navigation buttons: **"Back to Companies"** (`/admin/companies`) and **"View Map"** (`/` — MapView in admin mode).

---

## 6. run-agent-flow Orchestrator

**File:** `supabase/functions/run-agent-flow/index.ts`  
**Lines:** 1005

Six stages executed in order, each tracked in `agent_flow_stage_runs`:

| Stage key | What it does |
|---|---|
| `input_collect` | Checks `public_baseline_runs`, `inputs`, `input_files`, `opportunities`, `routes` |
| `evidence_check` | Classifies: weak/strong baseline, has-uploads flag |
| `public_collection` | Optional. Calls `public-baseline` (timeout 210s). Skipped when `include_public_collection: false` |
| `adjudication` | Selects `contextMode`: `public_baseline`, `uploaded_only`, or `uploaded_evidence_fallback` based on mode + baseline strength + uploaded evidence |
| `output_generation` | Calls `research-company` (timeout 420s) — the main LLM pipeline |
| `output_check` | Optional. Calls `local-alignment` (timeout 120s). Skipped when `include_local_alignment: false` |

Run record tracked in `agent_flow_runs`. Supports runtime contract (framework_mode, orchestrator_mode, stage) for structured multi-framework runs, but `orchestrator_mode !== "off"` is rejected in the current build.

**Adjudication table (hybrid mode):**

| Baseline | Uploaded evidence | Has existing artifacts | → contextMode |
|---|---|---|---|
| weak/missing | yes | — | `uploaded_only` |
| weak | no | yes | `public_baseline` (continues) |
| weak | no | no | **FlowError 422** |
| missing | no | — | **FlowError 422** |
| strong | — | — | `public_baseline` |

---

## 7. What research-company Generates

`research-company` is the leaf LLM pipeline called by `run-agent-flow`. It writes to:

- `positioning_canvases` — value prop, competitive alternatives, unique attributes, taglines
- `strategy_cascades` — winning aspiration, where to play, how to win, capabilities
- `odi_market_definitions` — job executor, chooser, JTBD, journey key
- `odi_needs` — desired outcomes per journey (with `desired_outcome`; `odi_canonical_statement` populated separately — see backfill-canonical-statements function)
- `routes` — Fix / Improve / Create route cards
- `opportunities` — opportunity landscape items
- `public_baselines` — baseline signal summary

---

## 8. Empty States in Main Views (New Company, No Data)

What a freshly created company looks like across each admin view:

| View | File | Empty state message |
|---|---|---|
| **Strategy** | `views/Strategy/index.tsx` | "No winning aspiration generated yet." / "No where-to-play definition generated yet." / "No how-to-win logic generated yet." (lines 2030, 2050, 2066) |
| **Opportunities** | `views/Opportunities/index.tsx` | "No opportunity data yet. Run AI Research in Admin → Companies." (line 2214); "No desired outcomes found yet." (line 1579) |
| **Positioning** | `views/Positioning/index.tsx` | "No foundation inputs yet. Run AI Research in Admin → Companies." (line 1110); "No value proposition has been generated yet." (line 1271) |
| **JobSteps** | `views/JobSteps/index.tsx` | "No checkpoint map exists yet. Choose or define at least one map above, then run research." (line 3410); "Journeys defined — run research to generate checkpoints." (line 2132) |
| **MapView** | `views/MapView/index.tsx` | No explicit empty state — relies on generated content simply not appearing |

All empty states are passive text. None include action buttons or inline research triggers. The only actionable instruction is "Run AI Research in Admin → Companies" (hyperlink-free prose).

---

## 9. Client-Refine Path (Delta vs. Admin Flow)

The client-refine path (`/preview/client-refine`) is a separate surface for an already-onboarded company. It has its own research re-run hooks in `ClientRefinePreviewView.tsx`:

| Function | Edge function called | Journey scope | Notes |
|---|---|---|---|
| `rerunFoundationScope` (line 652) | `research-company` **directly** (not via `run-agent-flow`) | `journey_key: "customer"` | Bypasses orchestrator and adjudication logic |
| `rerunOdiJobMapScope` (line 671) | `local-jobmap-synthesis` | `journey_key: "customer"` | ODI needs only |
| `rerunOutsideSignals` (line 631) | `public-baseline` | N/A | Baseline refresh only |

The client-refine path also has its own company-config page (`ClientRefinePreviewCompanyView.tsx`) for operator-level overrides (IndustryVocab, exclusion filters, etc.) that are not present in the admin `/admin/companies/:companyId` detail view.

**Key delta:** Admin onboarding → `run-agent-flow` orchestrator (full pipeline, evidence adjudication, stage tracking). Client-refine re-runs → direct edge function calls, no stage tracking, no adjudication.

---

## 10. Onboarding Flow Diagram

```
/admin/companies
    └── "New Company" dialog
         ├── name (required)
         └── website (optional)
              │
              ▼ [on submit]
         companies.insert({ name, website, created_by })
              │
              ├── "Create only" → DONE (no research)
              │
              ├── "Create + Web Baseline" → public-baseline → DONE
              │
              └── "Create + Baseline + Research"
                       │
                       ▼
                  run-agent-flow (hybrid, include_public_collection=true)
                       │
                       ├── input_collect
                       ├── evidence_check
                       ├── public_collection → public-baseline
                       ├── adjudication → selects contextMode
                       ├── output_generation → research-company (420s)
                       └── output_check → local-alignment (120s)
                                │
                                ▼
                       All artifacts written to DB
                       UI stays on /admin/companies (polls 15s)
                                │
                                ▼ [operator navigates]
                       /admin/companies/:companyId
                                │
                                ▼ [View Map button]
                       / (MapView, admin mode)
```

---

## 11. Gaps Relevant to New Onboarding Scoping

1. **No redirect after create.** Operator has no visual confirmation the company is "ready" — they must manually navigate and poll for research completion.
2. **No research trigger on the detail page.** Once a company is created, re-running research requires going back to the companies list or using the client-refine re-run hooks.
3. **Empty states are informational only.** No view has an inline "Run Research" CTA — all direct users to a different URL via prose.
4. **Client-refine re-runs bypass the orchestrator.** `research-company` is called directly, meaning no adjudication, no stage tracking, and no baseline-fallback logic.
5. **`odi_canonical_statement` not populated by initial research pipeline for partner-journey needs.** Requires separate backfill pass (`backfill-canonical-statements`).
