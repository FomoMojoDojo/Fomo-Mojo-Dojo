# Cafe Barra Diagnostic — Routes/Legs Structure + Signal Band Distribution
**Date:** 2026-05-19  
**Company ID:** 58b2b15b-bada-4bcd-9c12-b7e66a37d0bc  
**Scope:** Read-only. No schema changes, no data mutations.

---

## Routes Structure

### Schema Observations

The `routes` table has **both** hierarchy columns from A5:

| Column | Type | Nullable |
|--------|------|----------|
| `level` | text | YES |
| `parent_id` | uuid | YES |
| `primary_desired_outcome_id` | uuid | YES |
| `secondary_desired_outcome_ids` | uuid[] | YES |

No `parent_route_id` column — the hierarchy foreign key is `parent_id`. Both `level` and `parent_id` exist and are nullable.

### Row Count + Level Distribution

| Metric | Value |
|--------|-------|
| Total rows | 9 |
| `level = 'route'` | 9 |
| `level = 'leg'` | 0 |
| `level = 'action'` | 0 |
| `level IS NULL` | 0 |

### Hierarchy Linkage

| Metric | Value |
|--------|-------|
| `parent_id IS NULL` (top-level) | 9 |
| `parent_id IS NOT NULL` (has parent) | 0 |

No hierarchy whatsoever — all 9 rows are flat, top-level routes.

### Sample Rows (all 9)

| ID prefix | Title | Level | parent_id | source |
|-----------|-------|-------|-----------|--------|
| 80ffc6d6 | Clarify coffee flavor and roast preferences early | route | null | manual_60f51302 |
| 279dad58 | Make specialty coffee options easier to find locally and online | route | null | system |
| b3362e0e | Improve confidence in coffee freshness and roast date verification | route | null | system |
| 0d7a9251 | Enhance clarity on suitable coffee grind sizes for brewing methods | route | null | system |
| 44b7b34d | Increase ease of verifying order and delivery details pre-purchase | route | null | system |
| 6697fbcc | Reduce brewing errors to achieve consistent desired coffee flavor | route | null | system |
| c86b6e90 | Increase ability to track coffee taste consistency across batches | route | null | system |
| 62b02b76 | Boost confidence in adjusting brewing based on taste feedback | route | null | system |
| 9c70a027 | Clarify how to capture and learn from each brewing experience | route | null | system |

All created at `2026-05-18T14:32:24` (same batch).

### Interpretation

**Does not match A5's expected 3 routes + 10 legs.**

A5 introduced the routes/legs hierarchy (level column, parent_id FK) and was supposed to produce 3 strategic routes with 10 legs beneath them. What actually exists is 9 flat rows, all `level='route'`, all with `parent_id=NULL`.

More significantly: the 9 route titles describe **consumer-facing brewing UX problems** (grind size, flavor clarity, batch consistency) — this does not match Cafe Barra's B2B strategic direction established by the cascade (specialty coffee roaster → LA cafe partnerships). These routes appear to be pre-B2B-pivot artifacts from an earlier research-company run, likely generated from ODI customer job data (source: `system`). The B2B leg/route hierarchy that A5 was intended to build was either never generated or was superseded.

**Recommended follow-up questions before A78/A79:**
1. Were the A5 routes ever generated? (Check git log for `research-company` runs around mid-May.)
2. Should the 9 existing routes be retired/archived and replaced with the 3 B2B routes + legs that A5 designed?
3. The drift baseline captured for these 9 routes in A76 is technically valid but may be for routes that are about to be replaced.

---

## Signal Band Distribution

### Schema Observations

There is **no `signal_bias` column** on the `signals` table. The "bias" observation in the session brief likely refers to `signal_band`, which is the categorical column describing whether a signal originates from organization-internal, outside-market, or customer data sources.

Columns confirmed present: `signal_band` (text, NOT NULL), `evidence_type` (text, NOT NULL), `source_type` (text, NOT NULL), `source_title` (text, nullable), `claim_text`, `evidence_excerpt`.

Check constraint on `signal_band`: `IN ('outside', 'organization', 'customer')`.  
Check constraint on `evidence_type`: `IN ('founder_narrative', 'internal_data', 'market_signal', 'customer_validation', 'quantitative', 'unknown')`.

### Total Active Signals

**218** active signals (confirmed; consistent with A76 baseline count).

### signal_band Distribution

| signal_band | Count | % of active |
|-------------|-------|-------------|
| `organization` | 206 | **94.5%** |
| `outside` | 12 | 5.5% |
| `customer` | 0 | 0% |

### evidence_type Distribution (mirrors signal_band)

| evidence_type | Count | % |
|---------------|-------|---|
| `internal_data` | 206 | 94.5% |
| `market_signal` | 12 | 5.5% |

### source_type Breakdown (all active signals)

| source_type | Count | Notes |
|-------------|-------|-------|
| `file` | 147 | PDF documents uploaded by team |
| `internal_authored` | 33 | Manually authored signals |
| `mojo_analysis` | 16 | Analysis-generated signals |
| `public_baseline_run` | 12 | Outside market research (the 12 `outside` signals) |
| `internal_derived` | 10 | Derived from internal processing |

### Top Source Titles by Signal Count

| source_title | Count |
|--------------|-------|
| (null) | 43 |
| THE_BARRA_PROCESS_…pdf | 30 |
| Cafe_Barra_Strategic_Framework_Final.pdf | 21 |
| Cafe_Barra_Alternatives_Mar_18_2026…pdf | 21 |
| Cafe_Barra_Positioning.pdf | 20 |
| Cafe_Barra_Strategic_Framework_Final.pdf.extracted.txt | 20 |
| Cafe_Barra_Positioning.pdf.extracted.txt | 17 |
| Cafe Barra Positioning May 1.pdf.extracted.txt | 15 |
| Cafe Barra public baseline | 12 |
| mojo-analysis-manual-2026-05-18 | 8 |

### Sample Signals — Organization Band (file source_type)

These represent the dominant category (147 file-sourced organization signals):

> *"The Barra Process involves using five main roasting templates tailored to different types of beans, focusing on bringing out the unique characteristics of each bean."*  
> Source: THE_BARRA_PROCESS PDF

> *"Instead of trying to adjust the roasts to make them taste similar to the previous batches, I choose to bring out the unique characteristics of each bean."*  
> Source: THE_BARRA_PROCESS PDF

> *"I have developed 5 main roasting templates that I use to decide if and how to roast each bean."*  
> Source: THE_BARRA_PROCESS PDF

### Sample Signals — Outside Band (public_baseline_run)

These are the 12 outside signals:

> *"The company uses an online platform for direct retail sales and has some physical presence in target geographies."*  
> Source: Cafe Barra public baseline

> *"Product offerings cover various roasts and flavor profiles with careful brew recommendations."*  
> Source: Cafe Barra public baseline

> *"Inventory and demand may fluctuate as some products show as sold out, suggesting a smaller scale or artisanal approach."*  
> Source: Cafe Barra public baseline

### Interpretation

**The evidence base is heavily skewed toward internal organization signals (94.5%).** There are no customer signals at all, and only 12 outside market signals (5.5%).

The "team bias" observed before this diagnostic maps directly to `signal_band = 'organization'` dominating the corpus. This is primarily driven by internal PDF documents (Barra Process methodology, positioning docs, strategic frameworks) rather than external market evidence or customer validation.

**Implications for drift detection (A77-A80):**

1. **Baseline asymmetry:** The A76 baseline captured 218 active signals. Of those, 206 are internal documents. A new outside signal (like a market shift signal) will be small (6% weight) against the internal corpus — drift from outside signals may trigger slight_drift at best, material_drift only if very directionally contradictory. This is why the synthetic test (one outside signal) produced `slight_drift` rather than `material_drift`.

2. **No customer signal coverage:** `customer` band signals = 0. Any customer-voice evidence that surfaces in the future will be 100% "new" relative to the baseline and will likely trigger LLM assessment. This is actually the right behavior — the first real customer evidence should surface as notable.

3. **Threshold calibration (A80):** With 94.5% of signals being internal documents, the embedding_relevance_threshold (if Option A is eventually built) and the LLM prompt guidance around "magnitude" should account for the fact that internal signals confirm each other heavily. A single contradicting outside signal represents a genuine evidence gap, not noise.

4. **Recommended action before A78:** Consider running `research-company` to enrich the outside signal corpus (currently only 12 signals from one public baseline run). Better outside coverage would make drift detection more meaningful and the baseline more balanced.

---

## Summary Table

| Item | Status | Note |
|------|--------|------|
| Routes `level` column exists | ✓ YES | Present and populated |
| Routes `parent_id` column exists | ✓ YES | Present but all NULL |
| A5 hierarchy (3 routes + 10 legs) present | ✗ NO | 9 flat routes, all level='route', no legs |
| Route titles match B2B cascade direction | ✗ NO | Consumer brewing UX routes, likely pre-pivot artifacts |
| `signal_bias` column on signals | ✗ NO | Column does not exist; `signal_band` is the correct column |
| Active signals total | 218 | Consistent with A76 baseline |
| Organization band dominance | 94.5% | 206 of 218 signals are internal documents |
| Customer band coverage | 0% | Zero customer signals in corpus |
| Outside band coverage | 5.5% | 12 signals, all from one public baseline run |
