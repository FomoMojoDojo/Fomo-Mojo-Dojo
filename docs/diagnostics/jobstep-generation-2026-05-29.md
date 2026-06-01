# Job-Step Generation — Internals Diagnostic
**Date:** 2026-05-29  
**Branch:** strategic-object-graph  
**Scope:** Read-only. No data modified, no pipeline runs, no companies touched.  
**Prior context:** Cold-start capability audit at `docs/diagnostics/cold-start-capability-2026-05-29.md`

---

## 1. The 8 Anchors (`JTBD_ODI_CHECKPOINTS`)

**Definition site:** `supabase/functions/_shared/jtbdProcess.ts:30–87`

```
stepNumber | key       | canonicalLabel               | description (abbreviated)
-----------+-----------+------------------------------+----------------------------------------------
1          | define    | Define desired progress      | Clarify the progress … that would count as success.
2          | locate    | Locate viable options        | Identify the options, resources, and sources …
3          | prepare   | Prepare required conditions  | Get the prerequisites, inputs, and conditions in place …
4          | confirm   | Confirm readiness            | Confirm the chosen path, inputs, and conditions are good enough …
5          | execute   | Perform the core task        | Carry out the core task required to create the intended progress.
6          | monitor   | Monitor results              | Track progress, quality, and emerging signals while underway.
7          | modify    | Adjust the approach          | Adjust the approach when conditions shift or outcomes fall short.
8          | conclude  | Conclude and learn           | Confirm the result, close the effort cleanly, and capture what should change next time.
```

These are the ODI universal job map checkpoints (Ulwick). Keys match exactly: define / locate / prepare / confirm / execute / monitor / modify / conclude. Canonical labels are English phrases rather than single verbs ("Perform the core task" vs "Execute", "Adjust the approach" vs "Modify") but the mapping is 1-to-1.

The anchors are used in two ways:
- **`normalizeToEightCheckpointSpine()`** (jtbdProcess.ts:207–254): fills missing/invalid steps with canonical labels + descriptions. Used by `normalizeCustomerJourney()` in local-jobmap-synthesis.
- **`validateEightCheckpointSpine()`** (jtbdProcess.ts:173–205): rejects step sets that don't have exactly 8 sequential steps or contain prescriptive/non-ODI language. On failure, `normalizeCustomerJourney()` falls back to the 8 canonical anchors with contextually-derived descriptions (local-jobmap-synthesis:611–623).

---

## 2. What the Ollama Prompt Is Fed — and Whether Industry Signal Can Reach It

### Context object assembled in `local-jobmap-synthesis`

`evidenceContext` is built at lines 874–926 and passed as `contextJson` to `callLocalSynthesis()` (line 959). It contains:

| Field | Source | Industry-bearing? |
|-------|--------|-------------------|
| `odi_context.job_performer` | `odi_market_definitions.job_executor` (from prior `research-company` run, or empty) | Indirectly |
| `odi_context.primary_job` | `odi_market_definitions.jtbd` | Indirectly |
| `odi_context.market_context` | `odi_market_definitions.market_context` | Yes — if research-company ran |
| `odi_context.desired_outcome` | `managed_outcomes.outcome_statement` | No |
| `odi_context.recurring_progress_challenge` | `strategy_problem_statements[0].statement` | No |
| `baseline_lens.primary_buyer` | `public_baseline_runs.result_json.lens_card.primary_buyer` | Yes |
| `baseline_lens.economic_engine` | `public_baseline_runs.result_json.lens_card.economic_engine` | **Yes — most direct** |
| `baseline_signals[0..17]` | `public_baseline_runs.result_json.evidence_ledger[0..17]` | Yes — raw snippets |
| `strategic_problems[0..24]` | `strategy_problem_statements` | No |
| `inputs[0..59]` | `inputs` table | No |

**`economic_engine`** is the highest-signal industry carrier. The OpenAI public baseline synthesis (public-baseline) produces this field from crawled web evidence and it typically reads something like "Specialty coffee roaster serving independent cafes on a wholesale subscription model." This reaches Ollama's context block.

### Prompt construction in `callLocalSynthesis()`

**System prompt** (local-jobmap-synthesis:465–476):  
- Instructs Ollama to generate exactly 8 JTBD checkpoints numbered 1–8.  
- Permitted verbs: "determine, identify, evaluate, validate, confirm, detect, adjust."  
- Prohibited: "execute, launch, deploy, implement, rollout, negotiate, integrate, promote, supplier, campaign, UI, MVP, onboarding, pricing, partnership."  
- `market_definition.market_context` framing rule: job-executor + job, not product category.  
- **No industry label** is mentioned. No industry-specific step guidance.

**User prompt** (lines 487–504):  
- Company name + website  
- `selected_job_maps` (journey key, title, subtitle)  
- Optional `odiContextBlock` if `odi_context` fields are present (job_performer, primary_job, desired_outcome, recurring_progress_challenge)  
- Full `contextJson` as JSON  
- Output schema requirements  
- **No industry label** is mentioned.

### The dead constant

`STANDARD_MARKET_CATEGORY_LIST` is defined at line 21–22 as a comma-separated string of the 13 categories. It is **never referenced again anywhere in the file** — it is a dead constant. The constant exists but was never wired into the prompt or any logic. `inferStandardMarketCategory()` is also not called anywhere in `local-jobmap-synthesis`.

**Verdict:** Industry context reaches the Ollama prompt only implicitly, via `baseline_lens.economic_engine` and `baseline_signals`. No structured industry label or category is threaded in. Adding one requires code change.

---

## 3. `job_steps` Output Schema

**Columns, assembled from create + all ADD COLUMN migrations:**

| Column | Type | Default | Set by cold-start insert | Provenance role |
|--------|------|---------|--------------------------|----------------|
| `id` | uuid | gen_random_uuid() | DB | Row identity |
| `company_id` | uuid | — | Yes | FK |
| `user_id` | uuid | — | Yes | FK |
| `journey_key` | text | `'customer'` | Yes (`normalizedKey`) | Journey identity |
| `journey_title` | text | `''` | Yes | Display |
| `journey_subtitle` | text | `''` | Yes | Display |
| `step_number` | integer | 1 | Yes (1–8) | Anchor position |
| `step_label` | text | `''` | Yes | From LLM or canonical |
| `description` | text | `''` | Yes | From LLM or contextual |
| `designed` | boolean | false | Yes (`false` when evidence_status ≠ evidenced/implied) | Operator flag |
| `has_gap` | boolean | false | Yes (true by default on cold start) | Gap tracking |
| `gap_note` | text | `''` | Yes (contextual template) | Gap description |
| `frameworks_used` | text[] | `{}` | Yes (`["JTBD","ODI","local_ollama","local_jobmap_synthesis"]`) | Provenance tag |
| `evidence_status` | text | `'unclear'` | Yes | Quality tier |
| `evidence_basis` | text | `''` | Yes (`"Local synthesis from uploaded evidence, company context, and baseline signals."`) | Source prose |
| `evidence_confidence` | integer | 0 | Yes (52 for customer journey on cold start) | Confidence score 0–100 |
| `dependency_state` | text | `'fresh'` | Yes (`"fresh"`) | Graph freshness |
| `validation_state` | text | `'unvalidated'` | Yes (`"unvalidated"`) | Validation tier |
| `evidence_state` | text | `'partial'` | Yes (`"thin"` when status=unclear; `"partial"` for implied; `"sufficient"` for evidenced) | Evidence quality enum |
| `stale_reason` | text | null | Yes (`null`) | Stale explanation |
| `stale_since_event_id` | uuid | null | Yes (`null`) | FK to strategic_events |
| `last_reviewed_at` | timestamptz | null | Yes (`null`) | Operator review timestamp |
| `source_run_id` | text | null | Yes (UUID generated at synthesis start) | Run-level provenance |
| `created_at` | timestamptz | now() | DB | Audit |
| `updated_at` | timestamptz | now() | Yes (inserted with timestamp) | Audit |

**Insert site:** `jobMapRegeneration.ts:278–302` (stepPayload construction), written via `supabase.from("job_steps").insert(stepPayload)` at line 304.

**Provenance available for diffing:**
- `source_run_id`: groups all steps from a single synthesis run.
- `frameworks_used`: tag array distinguishing cold-start (`local_ollama`), Dify (`dify_mojo_analysis`), or future industry-template origin.
- `evidence_status` / `evidence_confidence`: quality tier that marks initial-hypothesis steps as `"unclear"` / 52 — the natural "before" state when compared to a client-adjusted "after."
- `evidence_basis`: prose string naming the source; currently always the same generic string on cold start. An industry-derived run could set this to e.g. `"industry_template:Hospitality/Foodservice"`.

There is **no `provenance_type` or `source_path` column** on `job_steps` (unlike `routes`, `odi_needs`, `odi_market_definitions`). The only structured provenance is `frameworks_used` + `source_run_id`.

---

## 4. ODI Vocabulary Alignment

### What conforms

The 8 checkpoint keys (define/locate/prepare/confirm/execute/monitor/modify/conclude) are canonical ODI universal job map positions — correct structure, correct count, correct sequencing.

Validation guards enforce ODI-agnosticism:
- `containsSolutionPrescriptiveLanguage()` (jtbdProcess.ts:153–167): rejects labels/descriptions containing product/feature/tool/platform/dashboard/MVP/workflow-automation/pricing/partnership language.
- `containsNonOdiProcessLanguage()` (jtbdProcess.ts:169–171): rejects "awareness / acquisition / activation / retention / engagement / pipeline stage / marketing funnel / sales funnel / consulting process / delivery process / implementation plan."

Both guards are applied at `normalizeCustomerJourney()` (local-jobmap-synthesis:580–589) and in `validateEightCheckpointSpine()` (jtbdProcess.ts:193–199).

### Divergences from strict ODI vocabulary

1. **Canonical labels use descriptive English phrases, not single Ulwick verbs.** The ODI literature uses "Define," "Locate," "Prepare," etc. as the anchor verbs. The code's canonical labels are "Define desired progress," "Locate viable options," "Perform the core task," "Adjust the approach," "Conclude and learn." These are valid extensions but differ from minimal-verb Ulwick framing. LLM-generated labels diverge further and are only validated against the prescriptive/non-ODI exclusion lists — they are not required to resemble the canonical labels at all.

2. **The system prompt's permitted verbs include "confirm" and "detect," which are not Ulwick canonical.** The prompt (line 471) lists: "determine, identify, evaluate, validate, confirm, detect, adjust." "Confirm" maps to checkpoint 4 (confirm). "Detect" is not a standard Ulwick step verb. These don't break the model but introduce vocabulary drift.

3. **No ODI-style desired outcome (DO) framing is required for step labels.** Step labels describe "what the actor is trying to accomplish" (job framing), not "what outcome the actor is trying to achieve" (ODI DO framing). This is correct — step labels are job-progression checkpoints, not outcome statements. ODI desired outcomes live in `odi_needs`, not `job_steps`.

4. **`designed = false` on all cold-start steps.** In the current model, `designed` is set to false when `evidence_status` is "unclear" (local-jobmap-synthesis:595). All cold-start steps are "unclear" → all have `designed = false`. This is correct behavior for initial hypotheses, not a vocabulary issue.

---

## 5. Design Seam — Industry Derivation Options

The seam is in `callLocalSynthesis()` (local-jobmap-synthesis:456–541) and the `evidenceContext` assembly (lines 874–926). `STANDARD_MARKET_CATEGORY_LIST` already exists at line 21 but is never used — the wiring is absent, not the concept.

---

### Option A — Inject the inferred industry label into the existing Ollama prompt

**What changes:** In `local-jobmap-synthesis`, compute `inferStandardMarketCategory()` from `baseline_lens.economic_engine` + `baseline_signals` text (the same inputs `research-company` uses at line 264). Add the result as a new field in `evidenceContext` (e.g., `industry_label: "Hospitality / Foodservice"`). In the `callLocalSynthesis()` system or user prompt, add a sentence like: "Industry category: {industry_label}. Generate step labels and descriptions that reflect how a {industry_label} business typically executes this job at each checkpoint."

**Wires the dead constant:** `STANDARD_MARKET_CATEGORY_LIST` at line 22 can be injected into the prompt as a reference list so Ollama understands the taxonomy.

**Change surface:** `local-jobmap-synthesis/index.ts` only. No schema change, no new function.

**Tradeoffs:**
- (+) Minimal diff — one new evidenceContext field, a few prompt lines.
- (+) Immediately uses the industry inference already computed by public-baseline.
- (–) Ollama still has discretion over step labels/descriptions. Industry label improves prompt grounding but doesn't guarantee industry-typical output. Quality depends on the local Ollama model's knowledge of that industry.
- (–) No operator-inspectable library. What "industry-typical" means is opaque inside the model.
- (–) Fallback path (`synthesisMode: "fallback"`) still uses generic contextual descriptions — no industry derivation in the fallback.

---

### Option B — Curated industry → ODI-step library (template lookup)

**What changes:** Author a static map of industry label → 8 ODI-format steps (step_label + description per checkpoint). 13 categories × 8 steps = 104 entries. `local-jobmap-synthesis` computes `inferStandardMarketCategory()`, looks up the library entry, and uses it as the step seed instead of (or before) calling Ollama. Ollama is either bypassed entirely for step labels or used to refine descriptions.

**Change surface:** New file `_shared/industryJobStepLibrary.ts`; ~30-line change to `local-jobmap-synthesis`.

**Tradeoffs:**
- (+) Maximum predictability and inspectability — the operator can read and edit what "industry-typical" means before shipping.
- (+) Zero LLM variance on labels. `validateEightCheckpointSpine()` passes deterministically.
- (+) `evidence_basis` can be set to `"industry_template:{label}"` — a clean provenance diff between initial hypothesis and client-adjusted state.
- (+) Fallback path (Ollama down) still works — library is the primary source.
- (–) Authoring burden: 104 step entries, each must pass ODI vocabulary validation (no prescriptive/non-ODI language).
- (–) Library must be maintained as industries and categories evolve.
- (–) Hospitality / Foodservice is one category for both "specialty roastery" and "neighborhood cafe operator" — granularity may be too coarse for some industries.

---

### Option C — Hybrid: LLM proposes industry-specific steps anchored to the ODI 8

**What changes:** Compute `inferStandardMarketCategory()`. Include the label in `evidenceContext`. Add a lean 8-entry "industry starter" (step_label only, ~4 words each — not a full description) as `evidenceContext.industry_step_anchors`. The `callLocalSynthesis()` system prompt instructs: "The industry_step_anchors field provides initial job-step hypotheses for this company's industry. Use them as a starting point; refine each step label and description to fit the specific company context, job executor, and evidence provided." `normalizeCustomerJourney()` and `validateEightCheckpointSpine()` run as now — LLM output is still validated and falls back to canonical if invalid.

**Change surface:** New `industryStepAnchors.ts` with 13 × 8 label strings (~150 lines); `local-jobmap-synthesis` adds ~20 lines to assemble and inject. No schema change.

**Tradeoffs:**
- (+) Industry hypothesis is visible and operator-adjustable (label strings are in a versioned file).
- (+) LLM adapts anchors to company-specific context, which Option B cannot do — the company's market, job executor, and baseline signals shape the final descriptions.
- (+) `validateEightCheckpointSpine()` still screens out bad output; fallback to canonical is unchanged.
- (+) Much lower authoring burden than Option B (8 short labels per industry, not 8 full label+description pairs).
- (–) More moving parts than Option A: both the anchor file and the prompt injection must be maintained.
- (–) LLM can still diverge from anchors if company context is unusually strong — the anchor is a hint, not a constraint.
- (–) If `inferStandardMarketCategory()` returns `""` (no match), the anchors fall back to nothing — same as Option A.

---

## Summary Table

| | Option A | Option B | Option C |
|--|----------|----------|----------|
| Authoring burden | None | High (104 entries) | Low (104 labels, ~4 words each) |
| LLM still involved in labels | Yes | Optional | Yes (refines anchors) |
| Operator can inspect/edit industry mapping | No | Yes | Yes (labels only) |
| Fallback (Ollama down) | Generic | Industry template | Generic (anchors are hints) |
| Schema change needed | No | No | No |
| New file needed | No | Yes | Yes (smaller) |
| Code change surface | local-jobmap-synthesis only | local-jobmap-synthesis + new file | local-jobmap-synthesis + new file |
| `evidence_basis` provenance | Can tag with label | Can tag with `"industry_template:{label}"` | Can tag with label |

**Operator decision required.** This report does not recommend. All three options share the same seam point (`callLocalSynthesis()` prompt + `evidenceContext` assembly) and the same zero-schema-change profile.
