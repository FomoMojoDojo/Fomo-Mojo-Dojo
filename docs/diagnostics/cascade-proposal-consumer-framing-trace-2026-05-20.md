# Cascade Proposal Consumer Framing Trace
**Date:** 2026-05-20  
**Company:** Cafe Barra (id: `58b2b15b-bada-4bcd-9c12-b7e66a37d0bc`)  
**Function:** `supabase/functions/propose-cascade-changes/index.ts`  
**Trigger:** Operator clicked "Propose changes from current evidence" via DriftDetailPanel (A79a verification flow)

---

## The Proposal

### User-reported consumer-framing summary
The resulting proposal described shifting the cascade toward:
- "individual coffee consumers as the primary job executors"
- "specialty coffee roaster and retailer category"
- "brewing guidance and freshness transparency"
- "customer education, feedback, and order verification"

This is B2C/retail framing — directly opposed to Cafe Barra's documented B2B strategy (independent café partners, 8-criteria selectivity, Barra Process as proof point) restored in Option B.

### Full proposed_state (surface_proposals id: `960c7241-6389-4716-8210-6a4511f5fbea`)

**winning_aspiration:**
> Cafe Barra aims to be the leading specialty coffee roaster and retailer for discerning coffee drinkers in Los Angeles and Todos Santos, delivering consistently exceptional small batch, hand-roasted coffees that empower customers to achieve superior home brewing and in-store coffee experiences.

**where_to_play:**
> We compete in the specialty coffee roaster and retailer category serving individual coffee consumers in Los Angeles and Todos Santos who seek high-quality, flavorful, small batch coffees and value expert brewing guidance to enhance their coffee preparation at home or in local cafes.

**how_to_win:**
> We will win by offering meticulously sourced and roasted coffees with clear brewing recommendations that reduce customer uncertainty and brewing errors, supported by an engaging origin and craft story that builds trust and loyalty. Our focus on product quality, freshness verification, and customer education will differentiate us and foster repeat purchases and strong customer relationships.

**proposal_reason (LLM-generated):**
> This refresh refines the cascade to focus more explicitly on individual coffee consumers as the primary job executors, aligning where to play with the specialty coffee roaster and retailer category. It emphasizes brewing guidance and freshness transparency as key how-to-win elements, reflecting identified customer needs and opportunity areas. Capabilities and management systems highlight gaps in customer education, feedback, and order verification, which were underrepresented before.

**Current live cascade (for contrast):**
- `where_to_play`: "Independent cafes and specialty retailers with 1–5 LA locations who are done with roasters that promise partnership and deliver beans. Operators who treat coffee as central to their brand..."
- `how_to_win`: "Win by making first LA clients measurably more successful — building a track record... The Barra Process delivers consistent quality... partner selectivity (8-criteria scorecard)..."

---

## Evidence Sources — Filtering Verdict

### Source 1: Public Baseline (`public_baseline_runs`)
**Filter applied:** None. Takes latest non-weak run. No relevance filtering.  
**Verdict: HIGH TRUST CONTRIBUTOR — B2C frame injected here first.**

The most recent baseline for Cafe Barra was scraped from cafebarra.com — a retail consumer-facing website:

| Field | Value |
|---|---|
| `category_archetype` | "Specialty Coffee Roaster and Retailer" |
| `primary_buyer` | "Coffee drinkers in Los Angeles and Todos Santos, BCS seeking small batch, hand-roasted specialty coffees" |
| `user` | "End consumers preparing coffee at home or visiting locations to buy coffee" |
| `alignment_status` | unknown |

The system prompt instructs the LLM: *"Stay strictly consistent with the public baseline, website, buyer context, and company category."* This rule causes the baseline to dominate over the manually-curated cascade `where_to_play`. Since the baseline says B2C consumer, and this rule is first in the constraint list, the entire framing is anchored to retail consumers before any other evidence is considered.

The evidence ledger (first 3 items, all strong/90% confidence) are all product/consumer-facing snippets about brewing methods, roast profiles, and sold-out DTC products — zero B2B partner language.

### Source 2: Job Steps (`job_steps`)
**Filter applied:** None. All steps for company fetched in journey_key order.  
**Verdict: STRONG CONTRIBUTOR — sole journey is consumer home-brewing.**

Cafe Barra has exactly one job map: `journey_key = 'customer'`. All 8 steps describe the consumer coffee-buying and home-brewing journey:

| Step | Label | Has Gap | Evidence Conf |
|---|---|---|---|
| 1 | Define desired progress | yes | 42% |
| 2 | Locate viable options | yes | 42% |
| 3 | Prepare required conditions | yes | 42% |
| 4 | Confirm readiness | yes | 42% |
| 5 | Perform the core task | yes | 42% |
| 6 | Monitor results | yes | 42% |
| 7 | Adjust the approach | yes | 42% |
| 8 | Conclude and learn | yes | 42% |

All 8 steps have `has_gap = true`, all at 42% confidence. The LLM sees a journey labeled "customer" with 8 flagged gaps — it reads this as a consumer-side gap map that needs addressing in the cascade.

No B2B partner journey has been mapped (no `journey_key = 'partner'` or equivalent). The partner onboarding, vetting, and relationship management job is absent from this data source entirely.

### Source 3: Opportunities (`opportunities` table)
**Filter applied:** `.eq("company_id", ...).order("opportunity_score", desc).limit(30)` — NO `strategy_alignment` filter, NO `relevance_state` equivalent.  
**Verdict: PRIMARY CULPRIT — all 10 rows are B2C consumer-framed, unfiltered.**

Critical architectural note: `propose-cascade-changes` queries the **`opportunities` table**, not **`odi_needs`**. These are different tables. The `odi_needs` table has a `strategy_alignment` column (with 7 rows marked `off_strategy`), but the `opportunities` table has no such column and is not queried by this function.

All 10 opportunity rows for Cafe Barra have `journey_key = 'customer'`:

| # | Outcome | Score | Journey Key |
|---|---|---|---|
| 1 | Reduce time spent finding specialty coffee options available locally and online | 16 | customer |
| 2 | Improve confidence in verifying coffee freshness and roast date before buying | 14 | customer |
| 3 | Reduce uncertainty about which coffee grind sizes suit different brewing methods | 14 | customer |
| 4 | Increase clarity of desired coffee flavor and roast level preferences before purchase | 14 | customer |
| 5 | Increase ease of verifying coffee order details and delivery options before purchase | 14 | customer |
| 6 | Reduce errors in brewing coffee to consistently achieve desired flavor at home | 14 | customer |
| 7 | Improve confidence in adjusting brewing parameters based on taste feedback | 13 | customer |
| 8 | Increase ability to track coffee taste consistency across different batches | 12 | customer |
| 9 | Increase clarity in capturing lessons from each brewing experience | 12 | customer |
| 10 | Increase access to information on brewing equipment and accessories | 12 | customer |

The LLM receives all 10 of these as ranked by `opportunity_score` — the highest-scoring items (freshness, brewing guidance, order verification) map directly onto the proposed `how_to_win` and capabilities vocabulary.

### Source 4: Routes (`routes` table)
**Filter applied:** `.eq("company_id", ...).not("source", "like", "manual_%").limit(20)`  
**Verdict: DOUBLE-WHAMMY CONTRIBUTOR — filter EXCLUDES active B2B routes, INCLUDES deprioritized B2C routes.**

This is a structural inversion. The `.not("source", "like", "manual_%")` guard was designed to prevent the LLM from reading back the operator's curated choices as evidence. But for Cafe Barra:

- **13 active B2B routes** (`source = 'manual_a5_recovery'`) → **EXCLUDED** (match `manual_%`)
- **9 deprioritized B2C consumer routes** (`source = 'system'`) → **INCLUDED** (do not match `manual_%`)

The LLM sees only the deprioritized, consumer-framed routes:

| Title | Category | Description (excerpt) |
|---|---|---|
| Make specialty coffee options easier to find locally and online | fix | Reduce customer time and effort spent locating available specialty coffee products |
| Reduce brewing errors to achieve consistent desired coffee flavor | fix | Address common brewing mistakes customers make to help them consistently produce coffee |
| Improve confidence in coffee freshness and roast date verification | fix | Enable customers to easily verify coffee freshness and roast dates before purchase |
| Clarify coffee flavor and roast preferences early | fix | Implement a structured process to help customers articulate their preferred coffee flavor |
| Increase ability to track coffee taste consistency across batches | improve | Help customers monitor and compare taste differences between coffee batches |
| Clarify how to capture and learn from each brewing experience | improve | Help customers systematically record and reflect on their coffee brewing results |
| Enhance clarity on suitable coffee grind sizes for brewing methods | improve | Help customers understand which coffee grind sizes work best with different brewing equipment |
| Increase ease of verifying order and delivery details pre-purchase | improve | Make it simpler for customers to confirm coffee order specifics and delivery options |
| Boost confidence in adjusting brewing based on taste feedback | improve | Support customers in modifying brewing parameters effectively when taste outcomes differ |

Zero B2B routes visible to the LLM. Every route it sees is about helping retail consumers buy and brew coffee at home.

### Source 5: Synthetic Drift Signal (`surface_drift_assessments`)
**Filter applied:** N/A — not queried at all.  
**Verdict: NOT CAUSAL — drift-agnostic function.**

The `propose-cascade-changes` function accepts only `{ company_id }` and does not read from `surface_drift_assessments`. The drift badge is a UI trigger only — clicking "Propose changes" from the DriftDetailPanel calls the same function with the same inputs as clicking "Propose changes" from the StrategyOrgPanel button. Drift content (the synthetic `llm_confirmation` and `assessment_basis` signals) is not passed to the LLM. The drift signal's B2C framing in the test row ("B2C segment shift", "68% mobile B2C visits") did not contribute to the proposal output.

---

## Likely Culprits — Ranked

| Rank | Source | Mechanism | Consumer phrases injected |
|---|---|---|---|
| 1 | `opportunities` table | All 10 rows B2C, no `strategy_alignment` filter, none related to partner job | "brewing guidance", "freshness verification", "order verification", "grind sizes for brewing", "brewing errors" |
| 2 | `job_steps` (customer journey) | Only journey is `journey_key = 'customer'`, all 8 steps flagged as gaps | LLM reads "customer" as the job executor label throughout prompt |
| 3 | `public_baseline_runs` | Scraped from retail website; `primary_buyer` and `user` are both end consumers; first constraint in system prompt anchors to baseline | "specialty coffee roaster and retailer", "discerning coffee drinkers", "home brewing", "end consumers" |
| 4 | `routes` (deprioritized, source='system') | `.not(source, manual_%)` filter inverts: EXCLUDES active B2B routes, INCLUDES 9 deprioritized consumer routes | "brewing errors", "freshness and roast date verification", "order and delivery details", "grind sizes" |
| 5 | Synthetic drift signal | NOT causal — function does not read surface_drift_assessments | — |

**Direct content-overlap evidence:**

| Proposed phrase | Source phrase | Source table |
|---|---|---|
| "individual coffee consumers as the primary job executors" | `primary_buyer`: "Coffee drinkers in LA...seeking specialty coffees" | `public_baseline_runs` |
| "specialty coffee roaster and retailer category" | `category_archetype`: "Specialty Coffee Roaster and Retailer" | `public_baseline_runs` |
| "brewing recommendations that reduce customer uncertainty and brewing errors" | "Reduce errors in brewing coffee to consistently achieve desired flavor at home" | `opportunities` |
| "freshness verification" | "Improve confidence in verifying coffee freshness and roast date before buying" | `opportunities` |
| "customer education" | "Address common brewing mistakes customers make" | `routes` (deprioritized) |
| "order verification" | "Increase ease of verifying coffee order details and delivery options before purchase" | `opportunities` |
| "Product freshness and roast date transparency" (capability) | "Improve confidence in coffee freshness and roast date verification" | `routes` (deprioritized) |
| "Customer order verification and delivery confirmation" (management system) | "Increase ease of verifying order and delivery details pre-purchase" | `routes` (deprioritized) + `opportunities` |

---

## LLM Prompt Reconstruction

The function builds `userText` in this order (from `index.ts` lines 338–348):

```
Company: Cafe Barra
Website: cafebarra.com

Current cascade snapshot (for context — generate what the evidence now supports):
Current winning aspiration: [B2B partner aspiration]
Current where to play: [B2B independent cafes]
Current how to win: [Barra Process, 8-criteria scorecard]

Public baseline context:
Category archetype: Specialty Coffee Roaster and Retailer
Primary buyer: Coffee drinkers in Los Angeles and Todos Santos...
User: End consumers preparing coffee at home...
Evidence:
1. [Company product offering | strong | conf 90] Cafe Barra - Small Batch, Hand-Roasted Coffees...
2. [Product details and customer use case | strong | conf 90] MACHADO DE ASSIS - Brazil: ...Suited for pour-over, drip, press...
...

Client-stated strategic problems: [...]

Selected job maps:
1. customer :: [journey title]
- Step 1: Define desired progress | gap=yes | conf=42
- Step 2: Locate viable options | gap=yes | conf=42
...

Generated opportunities:
1. Reduce time spent finding specialty coffee options available locally and online | customer | step 2 | score 16 | focus | importance 9
2. Improve confidence in verifying coffee freshness and roast date before buying | customer | step 2 | score 14 | focus | importance 8
...

Generated routes:
1. fix | Make specialty coffee options easier to find locally and online | Reduce customer time...
2. fix | Reduce brewing errors to achieve consistent desired coffee flavor | Address common brewing mistakes...
...

Generate a full strategy cascade for this exact company. In proposal_reason, explain what changed versus the current snapshot and why.
```

**What the LLM read:**
- Current cascade (B2B): presented as "context" to compare against, NOT as authoritative source
- Baseline (B2C): described as the first and highest-confidence evidence block, with a hard system rule: "Stay strictly consistent with the public baseline"
- Job map: sole journey = "customer" with 8 gaps
- Opportunities: 10 items, all consumer-framed, no partner-job items, top scores all B2C
- Routes: 9 deprioritized consumer routes, zero active B2B routes

The LLM followed instructions correctly. Given the evidence it received, proposing a consumer cascade was the rational output. The bug is in the data pipeline, not the LLM reasoning.

---

## Recommended Fix Direction

### Fix 1 (CRITICAL): Routes — add `relevance_state` filter
**File:** `supabase/functions/propose-cascade-changes/index.ts` lines 284–289

Current:
```typescript
const { data: routeRows } = await db
  .from("routes")
  .select("category, title, short_description, pts_value, effort")
  .eq("company_id", company_id)
  .not("source", "like", "manual_%")
  .limit(20);
```

Change to:
```typescript
const { data: routeRows } = await db
  .from("routes")
  .select("category, title, short_description, pts_value, effort")
  .eq("company_id", company_id)
  .neq("relevance_state", "deprioritized")
  .limit(20);
```

Rationale: The `.not("source", "like", "manual_%")` filter was intended to prevent echo-chambering operator-curated routes back as evidence. But it accidentally excludes ALL active routes (source='manual_a5_recovery') while including ALL deprioritized consumer routes (source='system'). The right filter is `relevance_state != 'deprioritized'` — this respects the operator's explicit deprioritization decisions. Note: removing the manual_ filter is intentional; manual routes represent operator knowledge and are valid evidence context (the current cascade already reflects them; providing routes as context helps the LLM calibrate against them rather than contradicting them).

### Fix 2 (HIGH): Opportunities — replace `opportunities` with `odi_needs` (filtered)
**File:** `supabase/functions/propose-cascade-changes/index.ts` lines 276–281

Current query: `opportunities` table, no `strategy_alignment` filter.

Proposed:
```typescript
const { data: opportunityRows } = await db
  .from("odi_needs")
  .select("desired_outcome, odi_canonical_statement, importance, opportunity_score, strategy_alignment")
  .eq("company_id", company_id)
  .neq("strategy_alignment", "off_strategy")
  .order("opportunity_score", { ascending: false })
  .limit(30);
```

Update `buildOpportunityBrief` to handle `odi_needs` row shape (`desired_outcome` instead of `outcome`, `odi_canonical_statement` instead of `step_label`).

Rationale: The `opportunities` table is a legacy table containing pre-B2B-pivot consumer data that has no strategy_alignment signal. The `odi_needs` table is the current source of truth, carries `strategy_alignment = 'off_strategy'` on 7 of 10 rows, and filtering to non-off_strategy would give the LLM 3 aligned rows (including the one explicitly about partner café operators) rather than 10 consumer-framed rows.

### Fix 3 (MEDIUM): Prompt anchoring — treat manually-sourced cascade as authoritative anchor
**File:** `supabase/functions/propose-cascade-changes/index.ts` lines 302–307 and 314–336

When `cascade.source` matches `manual_%`, add a prompt instruction anchoring the cascade's `where_to_play` as the job executor definition:

```typescript
const cascadeAnchor = cascade.source?.startsWith("manual_")
  ? `\nIMPORTANT: The current cascade has been manually curated by the operator. The job executor and competitive context defined in the current where_to_play should be treated as authoritative. Only propose changes where new evidence clearly warrants deviation — do not switch buyer types, industries, or job executor populations.`
  : "";
```

Append `cascadeAnchor` to `systemText`. This ensures that when an operator has manually set the B2B framing, the LLM treats the baseline's B2C consumer language as potentially stale or website-only context rather than the primary buyer definition.

Rationale: Cafe Barra's website is B2C-facing (retail DTC coffee shop) but its *strategy* is B2B-first (partner café operators). The baseline will always reflect the public website, not the strategic intent. The manually-curated cascade encodes the operator's strategic intent and should anchor the proposal.

### Fix 4 (LOW / Future): `refresh-cascade` should share the same fixes
**File:** `supabase/functions/refresh-cascade/index.ts`

Verify that `refresh-cascade` (the non-proposal variant) has the same `relevance_state` and `opportunities` table issues. If it does, apply the same fixes. Both functions should use the same evidence assembly logic.

---

## Summary

The consumer framing did not come from the drift signal (which was never passed to the LLM). It came from four converging evidence sources, all B2C-framed, feeding an LLM with a strict instruction to "stay consistent with the public baseline":

1. The public baseline scraped the consumer-facing website → established "specialty coffee roaster and retailer for end consumers" as the ground truth
2. The only job map was a consumer home-brewing journey → 8 gaps labeled "customer"
3. All 10 `opportunities` rows were consumer-framed (pre-B2B-pivot data, no strategy_alignment filter) → top-ranked evidence was all retail consumer
4. The routes filter accidentally excluded all 13 active B2B routes while including all 9 deprioritized B2C routes → the "generated routes" block showed only consumer context

The LLM behaved correctly given what it was told. The data pipeline needs fixes 1 and 2 to ensure route and opportunity evidence reflects the operator's strategic decisions rather than pre-pivot defaults.
