# ONB-F1 — Flow Decomposition Design
**Date:** 2026-05-21  
**Branch:** strategic-object-graph  
**Scope:** Read-only design diagnostic. ZERO code changes, ZERO migrations, ZERO new edge functions.

---

## 1. Current `run-agent-flow` — Six Stages at Code Level

`supabase/functions/run-agent-flow/index.ts` (1005 lines). All stages write to `agent_flow_stage_runs` via `runStage()`. The outer run record lives in `agent_flow_runs`.

| # | Stage key | Lines | I/O | Blocking? |
|---|---|---|---|---|
| 1 | `input_collect` | 519–577 | Reads: `public_baseline_runs` (latest), `inputs` (≤240), `input_files` (count), `opportunities` (count), `routes` (count). Returns `{latest_baseline_run_id, latest_baseline_status, uploaded_file_count, existing_artifact_count, website_present}`. | Yes |
| 2 | `evidence_check` | 579–596 | Pure derivation from stage 1 result — no DB I/O. Returns `{weak_public_baseline, has_uploaded_evidence, has_existing_artifacts}`. | Yes |
| 3 | `public_collection` | 601–655 | Calls `public-baseline` edge function (timeout 210s). Skipped if `include_public_collection: false`. Failure → `FlowError`. | Optional |
| 4 | `adjudication` | 657–765 | Pure logic — no DB I/O. Selects `contextMode` from evidence_check result + mode flag. Sets module-level `selectedContextMode`. | Yes |
| 5 | `output_generation` | 770–854 | Calls `research-company` edge function (timeout 420s). Failure → `FlowError`. Passes `context_mode`, `journey_key`, `journeys_to_generate`, `job_maps`, `review_mode`, `allow_review_block_save`, `runtime_contract`. | Yes |
| 6 | `output_check` | 856–911 | Calls `local-alignment` edge function (timeout 120s). Skipped if `include_local_alignment: false`. Errors caught locally → stored in `localAlignmentError`; run becomes `partial` not `failed`. | Optional, non-fatal |

### Adjudication decision table (verbatim from code, lines 657–765)

```
mode=uploaded_only  + no uploads                    → FlowError(422, uploaded_context_requires_files)
mode=uploaded_only  + uploads                       → contextMode = uploaded_only
mode=public_only    + weak/missing baseline         → FlowError(422, public_baseline_not_ready)
mode=public_only    + strong baseline               → contextMode = public_baseline
hybrid              + (weak|missing) + uploads      → contextMode = uploaded_only
hybrid              + weak + no uploads + (hasArtifacts OR !weakBefore) → contextMode = public_baseline
hybrid              + weak + no uploads + no artifacts + weakBefore     → FlowError(422, insufficient_public_evidence)
hybrid              + missing + no uploads          → FlowError(422, missing_evidence_context)
hybrid              + strong                        → contextMode = public_baseline
```

### What each leaf function writes

**`public-baseline`:**
- `public_baseline_runs` — LLM result JSON, sources JSON, run ledger
- Calls `ingestPublicBaselineSignals()` after insert (writes signal extracts to `_shared/evidencePhase1.ts` targets)
- `waitUntil(triggerMojoAnalysis(...))` — fires `run-mojo-analysis` non-blocking after baseline completes

**`research-company`** (called by `output_generation`):
- `positioning_canvases`, `strategy_cascades`, `odi_market_definitions`, `odi_needs`, `routes`, `opportunities`, `public_baselines`

**`local-alignment`** (called by `output_check`):
- `research_artifact_runs` (status = 'local_alignment') — summary + per-area comparison artifacts
- `companies` (mojo_score, potential_score, projected_score, evidence_note, area_scores_json) — only when `apply_score_update: true` (not set by `run-agent-flow`; currently operator-manual only)

---

## 2. Map — Current Stages → Six Target Flows

The six target flows from the scoping brief, with their current home in `run-agent-flow`:

| Target flow | Current coverage | Stage(s) involved | What's missing |
|---|---|---|---|
| **F1 — Public research** | Full path via `include_public_collection: true` | Stage 3 (`public_collection` → `public-baseline`) | None — already a discrete callable. Needs its own trigger path, not only callable via orchestrator. |
| **F2 — Outside-info ingest** | Partial — `uploaded_file_count` from `inputs`/`input_files` tables | Stage 1 (`input_collect`), Stage 4 (`adjudication`) | No dedicated ingest flow. Files are uploaded to `inputs`/`input_files` outside the orchestrator. Adjudication merely _detects_ upload presence — it does not process file content. A dedicated F2 flow would formally index/process uploaded files as a pre-step before adjudication. |
| **F3 — Framework diagnosis** | Full path | Stage 5 (`output_generation` → `research-company`) | `provenance_type` stamping on write (now possible with ONB-M1 columns). `research-company` itself does not set `provenance_type` — it writes rows without it, relying on backfill heuristics. |
| **F4 — ODI survey processing** | Partial | Stage 5 subset — `odi_needs` rows are written by `research-company` with `source_path = 'public_research'`. Separate `local-jobmap-synthesis` edge function exists (called from client-refine only). | True ODI survey ingest (real customer data → `odi_survey` provenance type) has no dedicated flow. `source_path = 'odi_survey'` is not set by any current function. |
| **F5 — Drift / monitoring** | Present as non-fatal tail step | Stage 6 (`output_check` → `local-alignment`) | `local-alignment` runs against Ollama local only (enforced by policy check). Cannot run in production cloud Supabase. Currently the `apply_score_update` flag is never set true by `run-agent-flow` — score update is always manual-only. |
| **F6 — Manual edits** | Zero dedicated flow | None in orchestrator | Manual operator edits happen via direct DB writes (Supabase dashboard or admin UI forms). The ONB-M1 `provenance_type DEFAULT 'manual'` handles stamping, but there is no dedicated flow tracking or validation layer for manual edits. |

---

## 3. Adjudication Relocation

### Current architecture
Adjudication is embedded in `run-agent-flow` stage 4 — a pure in-process function with no DB I/O. It selects `contextMode` based on:
- `mode` parameter from request body
- `weak_public_baseline` / `has_uploaded_evidence` / `has_existing_artifacts` from stage 2
- Module-level `selectedContextMode` variable used by stage 5

### If flows are split

If each target flow becomes its own callable unit (e.g., "run public research", "run framework diagnosis"), adjudication needs to move from the orchestrator to a shared utility — or be embedded as a guard in each flow's entry point.

**Option A — Keep adjudication in a thin orchestrator layer**  
A coordinator function still exists but is stripped down to: read evidence state → run adjudication → dispatch to the appropriate flow. No timeout budget is spent inside the coordinator. Each flow has its own tracking record.

**Option B — Adjudication as a shared library function**  
Move adjudication to `_shared/adjudication.ts`. Each flow entry point calls it independently. No coordinator needed. Flows can be called in isolation (e.g., F3 alone after an operator-triggered F1 run).

**Option C — Adjudication as a DB-readable decision (evidence_status field)**  
The current `evidence_status` column on `companies` already encodes some of this (weak/strong/unknown). Flows could read `evidence_status` and decide their own eligibility rather than re-deriving from raw tables.

**Recommendation (design only — not implementing):** Option B is the cleanest for the six-flow architecture. The adjudication logic is already pure (no I/O) and the `contextMode` enumeration is small. Moving it to `_shared/adjudication.ts` lets each flow gate itself without requiring an orchestrator to sequence them.

---

## 4. Tracking Table Concerns

### Current schema

```
agent_flow_runs
  id, company_id, user_id
  mode            -- 'hybrid' | 'public_only' | 'uploaded_only'
  trigger         -- 'manual'
  status          -- 'running' | 'completed' | 'failed' | 'partial' | 'blocked'
  selected_context_mode
  input_json, summary_json
  created_at, updated_at, completed_at

agent_flow_stage_runs  (→ run_id FK)
  id, run_id, company_id, user_id
  stage_key       -- free-text ('input_collect', 'evidence_check', ...)
  stage_order     -- integer
  status          -- 'pending' | 'running' | 'completed' | 'failed' | 'skipped'
  input_json, output_json, error_text
  started_at, finished_at, duration_ms
```

**Key constraint:** `agent_flow_stage_runs_unique_stage` = UNIQUE(run_id, stage_key). Stage keys are free-text strings with no DB-level enum constraint.

### Three options if flows are extracted

**Option A — Survive unchanged. Add `flow_type` column.**  
Add a `flow_type` text column to `agent_flow_runs` (nullable, default `NULL` = current omnibus run). Each new discrete flow writes its own `agent_flow_runs` record with `flow_type = 'public_research'` or `'framework_diagnosis'` etc. Stage keys get a namespace prefix (`public_research.input_collect`). No schema breakage. UI can filter by `flow_type`.

**Option B — Unified with flow_type check constraint.**  
Same as A but with a CHECK constraint on `flow_type`: `NULL OR ANY ARRAY['public_research', 'framework_diagnosis', 'odi_survey', 'drift_monitoring', 'manual_edits']`. Stricter but requires a migration.

**Option C — Separate tracking tables per flow.**  
Most rigorous but highest migration cost. Each flow gets its own `{flow}_runs` + `{flow}_stage_runs` tables. Eliminates free-text `stage_key` risk. High overhead for a six-flow system.

**Recommendation:** Option A is migration-free and backward compatible. The `flow_type` column is nullable so existing orchestrator records remain untouched. Operators can distinguish new discrete flow runs from the omnibus run records by `flow_type IS NULL` vs `flow_type IS NOT NULL`.

---

## 5. Client-Refine Bypass Concern

### Current state

`ClientRefinePreviewView.tsx` calls edge functions directly — bypassing `run-agent-flow` entirely:

| Function | Edge function called | What's bypassed |
|---|---|---|
| `rerunFoundationScope` (line 652) | `research-company` directly | Orchestrator, adjudication, stage tracking, baseline-fallback logic |
| `rerunOdiJobMapScope` (line 671) | `local-jobmap-synthesis` | Same |
| `rerunOutsideSignals` (line 631) | `public-baseline` | Same (but public-baseline is standalone; no orchestrator needed) |

### Options

**Option A — Let it stay as the fast-path.**  
Client-refine re-runs are intentional re-runs after initial onboarding is done. The operator knows the company already has baseline + artifacts. Adjudication would always resolve to `public_baseline` mode — there's no need to re-derive it. The bypass is a correct fast-path for the re-run case. Provenance stamping on write (F3 flow) would fix the only gap.

**Option B — Route client-refine through a lightweight coordinator.**  
Add a `trigger = 'client_refine'` variant in `run-agent-flow` that skips `input_collect`/`evidence_check`/`public_collection` and goes directly to `adjudication` (with a forced `mode = 'public_baseline'`) → `output_generation`. Gains stage tracking. Loses speed (extra round-trip, extra DB writes).

**Option C — Add provenance stamping to the bypass calls.**  
The only concrete gap the bypass creates with ONB-M1 columns is that re-runs via client-refine will write rows with no `provenance_type` — violating the NOT NULL constraint added in the ONB-M1 migration. `research-company` must set `provenance_type = 'public_research'` on every write regardless of how it's called. This fix closes the gap without requiring the bypass to go away.

**Recommendation:** Option A + Option C together. The bypass is architecturally correct for re-runs. The action item is in `research-company`: set `provenance_type` on write so the NOT NULL constraint is never violated, whether called via orchestrator or directly.

---

## 6. Implementation Sequence

Ordered by dependency and risk. All are design/code changes — no schema changes beyond ONB-M1 (already committed).

| Step | Scope | Depends on | Risk |
|---|---|---|---|
| **S1** | `research-company`: set `provenance_type = 'public_research'` on every artifact write | ONB-M1 (done) | Low — additive column fill |
| **S2** | `local-alignment`: set `provenance_type = 'framework_adjudicated'` on `research_artifact_runs` rows (currently unstamped) | S1 (establishes pattern) | Low |
| **S3** | Extract adjudication logic to `_shared/adjudication.ts` | Current orchestrator unchanged | Low — pure refactor, no I/O change |
| **S4** | Add `flow_type` nullable column to `agent_flow_runs` | S3 | Low — additive migration |
| **S5** | F1 flow: standalone `run-public-research` entry point (thin wrapper around `public-baseline` + tracking) | S4 | Medium — new edge function |
| **S6** | F3 flow: standalone `run-framework-diagnosis` (thin wrapper around `research-company` with adjudication guard) | S3, S4 | Medium — replaces omnibus output_generation path |
| **S7** | F5 flow: `run-drift-check` (local-alignment trigger with explicit `apply_score_update` control) | S4 | Medium — Ollama dependency constrains deployment environment |
| **S8** | Client-refine bypass: verify `provenance_type` stamping through all re-run paths | S1 | Low |
| **S9** | F4 flow: `run-odi-survey-ingest` for real customer data (new flow, `provenance_type = 'odi_survey'`) | S3, S4 | High — requires new survey input schema |

S1 through S3 can run in a single PR. S4 onward are incremental per-flow PRs.

---

## 7. Risks and Open Questions

### Risks

**R1 — NOT NULL violation on `provenance_type` after ONB-M1**  
`research-company` does not currently set `provenance_type`. After the ONB-M1 migration enforces NOT NULL with DEFAULT `'manual'`, new rows from `research-company` will get `provenance_type = 'manual'` by the PostgreSQL default — which is semantically wrong (they are `public_research`). This is an immediate correctness gap. Must be fixed in S1.

**R2 — `local-alignment` is Ollama-local-only**  
`local-alignment/index.ts` line 742: `if (!isLocalOllamaUrl(ollamaUrl)) return json({ error: "Local-only policy violation..." }, 412)`. The F5 drift/monitoring flow cannot run in the cloud Supabase environment without changing this policy. The current behavior when called via `run-agent-flow` stage 6 is that a 412 response is returned, caught by the non-fatal wrapper, stored in `localAlignmentError`, and the run continues as `partial`. The F5 flow must either relax the local-only constraint or remain a local-dev-only feature.

**R3 — `agent_flow_stage_runs` UNIQUE constraint on (run_id, stage_key)**  
If a future flow reuses the same stage key string (e.g., `input_collect`) across two different flow types in the same `run_id`, it would violate the unique constraint. Under Option A (shared tracking table + `flow_type` column), each discrete flow creates its own `agent_flow_runs` record, so the same stage key can appear in different runs. No collision risk as long as flows are never batched into a single `agent_flow_runs` record.

**R4 — Client-refine re-run NOT NULL violation**  
Same as R1. `ClientRefinePreviewView.tsx` calls `research-company` directly. After ONB-M1, rows written by this path will get DEFAULT `'manual'` — wrong provenance. S1 (stamping in `research-company`) resolves this for all callers simultaneously.

**R5 — `source_path` values on `odi_needs` and `odi_market_definitions`**  
The `provenance_type` backfill maps `source_path = 'public_research'` → `public_research`. If `research-company` writes new rows with `source_path = 'research-company'` (as it does for initial pipeline runs), those rows get backfill-mapped to `public_research`. Once S1 is done (explicit `provenance_type` write), the `source_path` backfill heuristic is no longer used for new rows — only legacy rows. This is the intended migration path.

### Open Questions

**Q1 — Who owns F4 (ODI survey processing)?**  
The `odi_survey` provenance type is defined in the enum but no function currently writes it. Is F4 a planned future edge function, or is it expected to come in through the `inputs` → `input_files` upload path with manual operator-set `source_path = 'odi_survey'`? This needs operator decision before S9.

**Q2 — Should `run-agent-flow` be deprecated after flows are extracted, or kept as the omnibus path?**  
The omnibus path is still useful for "run everything" admin-triggered onboarding. It could remain as a coordinator that dispatches to F1 + F3 in sequence. The implementation sequence above assumes it stays. If it's deprecated, S5/S6 need their own full adjudication paths, not just wrappers.

**Q3 — `apply_score_update` default behavior**  
`local-alignment` scores are never auto-applied — the `apply_score_update: true` flag must be explicitly passed. The F5 flow design needs to decide: should drift checks auto-apply by default, require operator confirmation, or remain manual-only? Currently `run-agent-flow` never sets this flag, so every `output_check` run computes a delta but never applies it.

**Q4 — `orchestrator_mode !== "off"` rejection**  
`run-agent-flow` line ~900: `if (orchestrator_mode !== "off") return error(...)`. Multi-framework orchestration is disabled. If F3 (framework diagnosis) needs multi-journey support, this gate must be revisited. For the current single-journey flow it is not a blocker.

**Q5 — Tracking visibility for discrete flows**  
Currently `AgentFlowPanel` (if it exists) reads `agent_flow_runs`. After Option A (add `flow_type`), does the admin UI need a per-flow status view, or is the raw table sufficient? No UI changes are scoped in ONB-F1, but the F4-S4 migration depends on knowing whether the UI will filter by `flow_type`.

---

## Appendix — Tracking Table Schemas (as of 2026-05-21)

```sql
-- agent_flow_runs
id                    uuid PK default gen_random_uuid()
company_id            uuid NOT NULL FK→companies(id) ON DELETE CASCADE
user_id               uuid NOT NULL
mode                  text NOT NULL default 'hybrid'
  CHECK (mode IN ('public_only','uploaded_only','hybrid'))
trigger               text NOT NULL default 'manual'
status                text NOT NULL default 'running'
  CHECK (status IN ('running','completed','failed','partial','blocked'))
selected_context_mode text
  CHECK (NULL OR IN ('public_baseline','uploaded_only','uploaded_evidence_fallback'))
input_json            jsonb NOT NULL default '{}'
summary_json          jsonb NOT NULL default '{}'
created_at, updated_at, completed_at

Indexes:
  (company_id, created_at DESC)
  (status, created_at DESC)

-- agent_flow_stage_runs
id          uuid PK
run_id      uuid NOT NULL FK→agent_flow_runs(id) ON DELETE CASCADE
company_id  uuid NOT NULL FK→companies(id) ON DELETE CASCADE
user_id     uuid NOT NULL
stage_key   text NOT NULL
stage_order integer NOT NULL default 1
status      text NOT NULL default 'pending'
  CHECK (status IN ('pending','running','completed','failed','skipped'))
input_json, output_json jsonb NOT NULL default '{}'
error_text  text NOT NULL default ''
started_at, finished_at timestamptz
duration_ms integer

Unique: (run_id, stage_key)
Index: (run_id, stage_order), (company_id, created_at DESC)
```
