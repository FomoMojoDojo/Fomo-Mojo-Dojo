# MojoMap Scoring System (Current Implementation)

Last updated: March 19, 2026

## 1) What scores we output

For each company, we store:

- `mojo_score` (0-100): current reality score (probability-like, calibrated low early).
- `potential_score` (0-100): realistic near-term lift.
- `projected_score` (0-100): stronger forward outcome if major work is executed.
- `evidence_status`: evidence quality/status label.
- `evidence_note`: short evidence summary.
- `area_scores_json`: full scoring breakdown/debug payload.
- `last_scored_at`: score timestamp.

Primary write path: `supabase/functions/research-company/index.ts`

## 2) Primary scoring flow

### 2.1 Gate scores (0-100 each)

We calculate 4 gates:

1. `positioning`
2. `customer_insight`
3. `strategy_cascade`
4. `gtm_execution`

Each gate blends coverage, journey health, and opportunity signals.

### 2.2 Current gate formulas

Key helper terms:

- `baselineSupport = 0.6 * confNorm + 0.4 * strengthNorm`
- `oppCoverageNorm = opportunities_count / 20 (clamped 0..1)`
- `focusNorm = focus_opportunities / total_opportunities`
- `journeyHealth = 0.55 * designed_ratio + 0.45 * non_gap_ratio`

Gate formulas:

- `positioning = 100 * (0.5*positioningCoverage + 0.25*baselineSupport + 0.15*ledgerCoverage + 0.1*positioningCompleteness)`
- `customer_insight = 100 * (0.2*customerCoverage + 0.25*oppCoverageNorm + 0.2*underservedNorm + 0.2*customerJourneyHealth + 0.15*customerOppCoverage)`
- `strategy_cascade = 100 * (0.2*strategyCoverage + 0.15*revenueJourneyHealth + 0.15*opsJourneyHealth + 0.15*baselineSupport + 0.1*strategyOppCoverage + 0.1*strategyCompleteness + 0.15*strategicProblemAlignment)`
- `gtm_execution = 100 * (0.3*gtmCoverage + 0.2*revenueJourneyHealth + 0.15*revenueOppCoverage + 0.15*opsOppCoverage + 0.1*focusNorm + 0.1*gtmCompleteness)`

All outputs are clamped to `0..100`.

### 2.3 Weakest-link aggregation

Gate score uses a weighted harmonic mean:

- Weights:
  - `positioning: 0.30`
  - `customer_insight: 0.25`
  - `strategy_cascade: 0.25`
  - `gtm_execution: 0.20`

This penalizes one weak gate more strongly than a simple average.

### 2.4 Evidence multiplier (0.6..1.0)

`evidenceMultiplier = clamp(0.6 + 0.18*baselineStrength + 0.22*artifactCoverage, 0.6, 1.0)`

Where:

- `baselineStrength = 0.55*(ledger_count/12) + 0.45*confNorm`
- `artifactCoverage = 0.35*(inputs/14) + 0.30*(steps/18) + 0.35*(opps/20)`

### 2.5 Mojo calibration curve

- `P_raw = (gateScore / 100) * evidenceMultiplier`
- `mojo_score = round(100 * (P_raw ^ gamma))`
- Current `gamma = 2.2`

This intentionally compresses early scores so sparse evidence tends to land low.

### 2.6 Potential + projected

Given `current = mojo_score` and `headroom = 100 - current`:

- `potential_score = round(current + min(22, headroom * 0.35))`
- `projected_score = round(max(potential_score + 10, current + min(42, headroom * 0.62)))`

Both are clamped to `0..100`.

## 3) Strategic problem alignment

We compute alignment from client-stated strategic problems against generated opportunities/routes (and strategy/positioning context in edge scoring).

- Token coverage weight: `65%`
- Statement coverage weight: `35%`
- Output contributes to `strategy_cascade` gate via `strategicProblemAlignment`.

If no strategic problems exist, default alignment score is neutral (`50`).

## 4) Evidence status labels

Current statuses:

- `no_public_evidence`
- `generated_no_baseline`
- `public_evidence_thin`
- `public_evidence_partial`
- `public_evidence_strong`
- `baseline_plus_artifacts`

## 5) Where scoring runs

### 5.1 Persisted company score (authoritative)

Computed and saved during AI research:

- `supabase/functions/research-company/index.ts`

This is what the app should normally display.

### 5.2 Frontend fallback score (when company score missing)

If stored company scores are missing, Map View falls back to local calculation:

- `src/lib/scoring/mojoScore.ts`
- Used from `src/views/MapView/index.tsx`

### 5.3 Local comparison manual apply (optional)

Local alignment can apply an additive delta to current mojo score and then recompute potential/projected:

- `supabase/functions/local-alignment/index.ts`

This is a manual adjustment path, not the baseline research score pipeline.

## 6) Why a new company can appear empty

Common reasons:

1. Company was created with **Create only** (no baseline/research run).
2. Research blocked before artifacts were generated (for example, missing API key, lock, or function error).
3. No baseline evidence and no generated artifacts yet.

Expected path for population: run **Baseline + Research** after company creation.

## 7) Debug fields to inspect

Use `companies.area_scores_json`:

- `scoring_version`
- `gate_weights`
- `gate_score`
- `per_gate_scores`
- `evidence` (multiplier, status, counts)
- `counts`
- `strategic_problem_context`
- `calibration` (`gamma`, `p_raw`)
- `outputs` (mojo/potential/projected)

