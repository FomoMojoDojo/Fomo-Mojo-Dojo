# Cold-Start Capability Audit
**Date:** 2026-05-28  
**Branch:** strategic-object-graph  
**Scope:** Read-only. No data modified, no pipeline runs, no companies touched.

---

## 1. Chain Overview

The cold-start chain runs in two discrete stages:

| Stage | Entry point | What it does | Invokes |
|-------|-------------|--------------|---------|
| F1 | `run-public-research` | Flow wrapper + SearxNG search + website crawl + OpenAI synthesis | `public-baseline` |
| F3 | `run-framework-diagnosis` | Adjudication guard + flow wrapper | `research-company` → `refresh-cascade` → `refresh-positioning` |
| F3b | `local-jobmap-synthesis` | Ollama-local job-map + market def synthesis | Called separately (not chained from F3) |

`run-public-research` and `run-framework-diagnosis` are the two explicit entry points. `local-jobmap-synthesis` is an independent call, not auto-triggered by either.

---

## 2. Write Footprint by Function

### `public-baseline/index.ts`

Runs SearxNG search (8 query passes), website crawl (≤14 pages), and OpenAI structured synthesis.

| Table | Operation | Write site | Condition |
|-------|-----------|-----------|-----------|
| `company_run_locks` | DELETE expired + INSERT | lines 32–44 | Every run; released in `finally` |
| `public_baseline_runs` | INSERT 1 row | lines 2028–2051, 2104–2127, 2183–2206, 2434–2464, 2512–2534 | All paths (ok / insufficient / ambiguous / thin) |
| `signals` | INSERT via `ingestPublicBaselineSignals()` | `evidencePhase1.ts:350–351` | All paths including insufficient/ambiguous |
| `claims` | DELETE + INSERT via `rebuildClaimsForCompany()` | `evidencePhase1.ts:100–117` | All paths |
| `claim_signal_refs` | DELETE + INSERT | `evidencePhase1.ts:89, 148–150` | All paths |
| `strategic_hypotheses` | UPSERT via `rebuildStrategicHypothesesForCompany()` | `strategicHypotheses.ts` | All paths |
| `object_dependencies` | DELETE + INSERT via `upsertDependenciesForArtifact()` | `strategicGraph.ts` | All paths |

**`signals.relevance_state`:** NOT set by `normalizeSignalInsert()` (evidencePhase1.ts:34–55). Value is the DB column default `'active'` (migration `20260519000001_adaptive_refresh_schema.sql:12`). Correct at cold start, but set by DB — not by the pipeline.

**Downstream trigger:** On `status='ok'` only, `public-baseline` fires a background `waitUntil(triggerMojoAnalysis())` (line 2551) which calls `run-mojo-analysis`. This is a separate Dify pipeline, not part of the cold-start chain.

---

### `research-company/index.ts`

LLM-driven synthesis. Called by `run-framework-diagnosis` Stage 2. Takes public-baseline output as context and generates full artifact set.

| Table | Operation | Write site | Notes |
|-------|-----------|-----------|-------|
| `company_run_locks` | DELETE + INSERT | lines 162–190 | Released in `finally` |
| `inputs` | DELETE + INSERT | lines 6451–6453, 6538 | Deletes existing, inserts new |
| `opportunities` | DELETE + INSERT | lines 6465, 6833–6851 | Deletes existing non-manual |
| `routes` | DELETE + INSERT | lines 6467, 7083–7107 | `level: "route"` at lines 7078, 7101 |
| `managed_outcomes` | DELETE + INSERT | lines 6468, 6744–6771 | `journey_key` not stored; single outcome |
| `odi_market_definitions` | DELETE + INSERT | lines 6470, 6976–6984 | `journey_key` N/A (single market def per company) |
| `odi_needs` | DELETE + INSERT | lines 6469, 7008–7025 | `journey_key: "customer"` HARDCODED at line 7015 |
| `solution_ideas` | INSERT | line 7182–7184 | Generated from route × opportunity fit |
| `solution_tests` | INSERT | line 7236 | Generated per solution idea |
| `companies` | UPDATE (scores) | lines 7378–7384 | Updates `mojo_score`, `area_scores_json`, `last_scored_at` |
| `strategy_cascades` | INSERT via `refresh-cascade` | invoked at line 7256 | See below |
| `positioning_canvases` | INSERT via `refresh-positioning` | invoked at line 7263 | See below |

**`routes.relevance_state`:** NOT set by `research-company` insert. Value is DB column default `'active'` (migration `20260520000001_routes_relevance_state.sql`). Correct at cold start, set by DB default.

---

### `refresh-cascade/index.ts`

Invoked in-process by `research-company` at line 7256.

| Table | Operation | Write site |
|-------|-----------|-----------|
| `strategy_cascades` | INSERT | `refresh-cascade/index.ts:335–337` |

Fields written: `winning_aspiration`, `where_to_play`, `how_to_win`, `capabilities_json`, `management_systems_json`, `assumptions_json`.  
Inference source: `public_baseline_runs.result_json` (LLM output from OpenAI baseline).

---

### `refresh-positioning/index.ts`

Invoked in-process by `research-company` at line 7263.

| Table | Operation | Write site |
|-------|-----------|-----------|
| `positioning_canvases` | INSERT | `refresh-positioning/index.ts:353–355` |

Fields written: `competitive_alternatives_json`, `unique_attributes_json`, `value_for_customer`, `best_fit_customers`, `market_category`, `category_rationale`, `current_tagline`, `proposed_tagline`.  
Inference source: `public_baseline_runs.result_json` + LLM re-synthesis.

---

### `local-jobmap-synthesis/index.ts`

Standalone Ollama-local synthesis. Must be called explicitly (not chained from F3).

| Table | Operation | Write site | Notes |
|-------|-----------|-----------|-------|
| `job_steps` | DELETE + INSERT per journey | via `regenerateJobMapJourney()` — `jobMapRegeneration.ts` | 8 checkpoints per journey key |
| `odi_market_definitions` | UPDATE or INSERT | lines 1099–1129 | Updates if row exists; inserts if not. No `journey_key` column on this table. |
| `artifact_versions` | INSERT (snapshot) | `strategicGraph.ts:snapshotArtifactVersion()` | Previous steps snapshotted before overwrite |
| `strategic_events` | INSERT | `strategicGraph.ts:recordStrategicEvent()` | Per step created/updated/deleted |
| `object_dependencies` | DELETE + INSERT | `strategicGraph.ts:upsertDependenciesForArtifact()` | claim→step, step→need links |

**Journey selection:** `parseSelectedJobMaps()` (line 122–157) reads the `selected_job_maps` request param. If empty or absent, **defaults to a single `"customer"` journey** (line 140–156). No partner journey is generated without an explicit `selected_job_maps` argument.

**`odi_needs` NOT written:** Line 1094: `"synthesized ODI needs were computed for context only and not written."` — `local-jobmap-synthesis` computes needs in-memory for prompt context but does NOT insert them to `odi_needs`.

---

## 3. Dimension Table

The 10 dimensions from ONB-CD1:

| # | Dimension | Produced on cold start? | Function | Inferred from | Code cite (write site) | Edgewood A actual |
|---|-----------|------------------------|----------|---------------|----------------------|-------------------|
| 1 | `desired_outcomes` / `managed_outcomes` | **YES** | `research-company` | Public baseline LLM output | `research-company:6744, 6771` | **0 rows** — F3 never run |
| 2 | `routes` with `level='route'` (hasHierarchy) | **YES** | `research-company` | Public baseline LLM output | `research-company:7078, 7101` | **0 rows** — F3 never run |
| 3 | `strategy_cascades` | **YES** | `refresh-cascade` (via research-company) | Public baseline LLM output | `refresh-cascade:335–337` | **0 rows** — F3 never run |
| 4 | `claims` | **YES** | `public-baseline` → `evidencePhase1.ts` | OpenAI evidence_ledger synthesis | `evidencePhase1.ts:115–117` | **6 rows** ✓ |
| 5 | `claim_signal_refs` | **YES** | `public-baseline` → `evidencePhase1.ts` | Claims × signals cross-reference | `evidencePhase1.ts:148–150` | **6 rows** ✓ |
| 6 | `positioning_canvases` | **YES** | `refresh-positioning` (via research-company) | Public baseline LLM output | `refresh-positioning:353–355` | **0 rows** — F3 never run |
| 7 | `odi_market_definitions` | **YES** | `research-company` (line 6976) or `local-jobmap-synthesis` (line 1117) | LLM-synthesized from lens_card + journey title | `research-company:6976–6984` | **0 rows** — F3 never run |
| 8 | `odi_needs` (customer journey) | **PARTIAL** | `research-company` | LLM output — customer journey only | `research-company:7008–7025` | **0 rows** — F3 never run |
| 9 | `signals.relevance_state = 'active'` | **YES (DB default)** | DB schema — not set by pipeline | `DEFAULT 'active'` on column | Migration `20260519000001:12` | **18 signals, all active** ✓ |
| 10 | `routes.relevance_state = 'active'` | **YES (DB default)** | DB schema — not set by pipeline | `DEFAULT 'active'` on column | Migration `20260520000001` | **0 routes** — F3 never run |

---

## 4. Gap List

### Gaps NOT produced by any cold-start function

**`odi_needs` for non-customer journeys (partner, revenue, operations)**  
- `research-company` hardcodes `journey_key: "customer"` at line 7015.  
- LLM prompt enforces this: `"All outcomes must be for journey_key=customer."` (line 1590).  
- `local-jobmap-synthesis` computes non-customer needs in-memory only (line 1094).  
- **Classification:** Not an inference gap — by design. Partner journey is manual-only. New inference candidate if partner data is required.

**`job_steps` (all journeys)**  
- Neither `public-baseline` nor `research-company` writes to `job_steps`.  
- `local-jobmap-synthesis` must be called explicitly as a third step.  
- **Classification:** Produced by cold start IF `local-jobmap-synthesis` is called. Not produced by the F1+F3 pair alone.

**`odi_canonical_statement` on cold-start `odi_needs`**  
- `research-company` passes `opp?.odi_canonical_statement || null` (line 7014) — depends on LLM output including it.  
- Not guaranteed. If null, CANON1.1 backfill is required.  
- **Classification:** Partial — LLM may produce it but it's not enforced.

---

## 5. Explicit Answers

### Industry → job-steps inference: Does it exist?

**No.** There is no hardcoded industry→job-steps template. The `inferStandardMarketCategory()` function (line 247) infers a label from text patterns (e.g., `/\bcafe\b/` → "Hospitality / Foodservice") but this label is used to populate `strategy_cascades.where_to_play` — NOT to select a pre-built job-step template. `local-jobmap-synthesis` sends industry context to Ollama as a prompt hint, and Ollama generates 8 checkpoints from the canonical JTBD_ODI_CHECKPOINTS anchor list. If Ollama fails, the fallback is the same 8 canonical anchors with contextually-derived descriptions — not industry-specific templates.

### Partner-journey limit: By design or untriggered?

**By design.** `research-company` hardcodes `journey_key: "customer"` on every `odi_needs` insert (line 7015) and the LLM prompt explicitly constrains the LLM: `"All outcomes must be for journey_key=customer."` (line 1590). `local-jobmap-synthesis` defaults to the `"customer"` journey when `selected_job_maps` is absent (line 140–156); if `selected_job_maps` includes a partner key, it generates job steps for that key but does NOT write `odi_needs` (those remain in-memory only, line 1094). There is no code path that auto-generates `odi_market_definitions` or `odi_needs` for `journey_key='partner'` on a cold run. Partner data requires manual surgery (as done in ONB-CD3 Item 1).

### "Insufficient to infer" / confidence-floor / gap signaling: Exists?

**No.** No user-surfaced signaling exists in the chain today.

- `public-baseline` writes `open_questions: ["Not enough public sources..."]` to `public_baseline_runs.result_json` when evidence is thin (line 1457–1461 in `buildInsufficientResult()`), but this is a JSON field in the run record — it is not surfaced as an actionable client-facing flag or notification.  
- `local-jobmap-synthesis` enters `synthesisMode: "fallback"` when Ollama fails (line 963) and uses `forceContextualDescriptions: true` to silently substitute canonical step descriptions. No user-visible notification is emitted.  
- No function emits a "not enough to infer — request uploads" prompt to the client.

---

## 6. DB Corroboration — Edgewood A (`3dd2cfbb`)

Edgewood A had `public-baseline` run but `research-company` was never invoked. It is a live specimen of Stage 1 output only — not a full cold-start run.

| Dimension | Code says cold start produces | Edgewood A actual | Status |
|-----------|------------------------------|-------------------|--------|
| `public_baseline_runs` | 1 row | **1 row** | ✓ matches |
| `signals` | ≥1 row, all `relevance_state='active'` | **18 rows, 18 active** | ✓ matches |
| `claims` | Rebuilt from signals | **6 rows** | ✓ matches |
| `claim_signal_refs` | 1 ref per claim×signal | **6 refs** | ✓ matches |
| `routes` (level='route') | Produced by research-company | **0 rows** | F3 not run — expected gap |
| `strategy_cascades` | Produced by refresh-cascade | **0 rows** | F3 not run — expected gap |
| `positioning_canvases` | Produced by refresh-positioning | **0 rows** | F3 not run — expected gap |
| `odi_market_definitions` | Produced by research-company | **0 rows** | F3 not run — expected gap |
| `odi_needs` | Produced by research-company | **0 rows** | F3 not run — expected gap |
| `managed_outcomes` | Produced by research-company | **0 rows** | F3 not run — expected gap |
| `inputs` | Produced by research-company | **0 rows** | F3 not run — expected gap |
| `job_steps` | Produced by local-jobmap-synthesis | **0 rows** | Neither F3 nor jobmap run — expected gap |

**No honestly-wrong gap found.** Every missing dimension is explained by F3 not having run. The code audit predicts exactly the state we observe.

---

## 7. Summary

A full cold-start chain (`public-baseline` + `research-company` + `local-jobmap-synthesis`) produces:

- **All 10 dimensions** in the customer-journey scope.
- **`hasHierarchy = true`**: `research-company` writes `level: "route"` at lines 7078/7101. New design unlocks.
- **Dimensions set by DB default, not pipeline code:** `signals.relevance_state` and `routes.relevance_state` — both default to `'active'`. Correct behavior, but fragile if the default is ever changed.
- **`job_steps`** require an explicit third call to `local-jobmap-synthesis` — not chained from F3.

Three gaps remain after a full cold-start:

1. **Partner journey** — by design. No code path generates `odi_needs` or `odi_market_definitions` for `journey_key='partner'`. Manual surgery required (ONB-CD3 pattern).
2. **`odi_canonical_statement`** on cold-start needs — not enforced. Depends on LLM output; CANON1.1 backfill may be needed.
3. **"No public footprint" signaling** — does not exist. When `public-baseline` yields `insufficient_public_evidence`, the result is written to the run record but no actionable flag is surfaced to the operator or client.

**Migration readiness verdict:** If `public-baseline` returns `status: 'ok'`, running `research-company` + `local-jobmap-synthesis` should produce a complete customer-journey structure (all 10 dimensions, hasHierarchy active) without any prerequisite gap-closing work. The cold-start chain is migration-capable for FomoMojoDojo and Edgewood A provided their public baselines return ok-quality results.
