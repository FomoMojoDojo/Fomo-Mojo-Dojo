# FR-V2-D — First Read v2 decomposition · design record

> **Status: PROPOSAL, awaiting operator ruling. No code, no schema, no prompt
> changes in this gate.** Investigate → propose → STOP. Every new client-facing
> string is drafted PENDING SIGNATURE. Open questions (incl. operator rulings) are
> listed at the end.

Investigated at head `29f5085` (post FR-FLOW-1b).

## The v2 act structure (operator-approved 2026-07-23)
1. **What you say** — their stated problem, from their public page, simplified.
2. **Why we start outside** — rationale + the journey visual (Outside → inside
   foundations: intentions/outcomes/plans/positioning/messaging → customer needs,
   worked backwards, monitored live).
3. **What the outside shows** — their strategy / positioning / messaging read from
   public signals.
4. **Where the customer agrees — and where they don't** — say-vs-see deltas with
   verbatim quotes (CV-2e). The Check verdicts live here.
5. **Why this happens → opportunities → how we can help** — the job map re-slotted
   as a norm-vs-reality exhibit, flowing into heard → help → plan (plan-only;
   per-market pricing adopted, wired later).

## Current rail (what v2 replaces)
`FirstReadView.ACTS`: **Standard** (StandardsShell + FrontDoorMapAct — industry
job-map) · **Mirror** (OutsideHeroAct score+bet, OutsideFindingsAct,
MovementShell + MarketAct + PositionAct) · **Check** (TheCheckAct verdicts) ·
**Gap** (GapAct open_questions) · **Proposal** (ProposalAct — 14b generator,
heard/help/plan blocks). Session machinery, export serializer, and the
corrections/contest feeds all hang off these.

---

## 1. Act-by-act data audit

Legend — **model tiers**: OpenAI-strict = public-baseline's structured generator;
14b = `qwen2.5:14b-instruct`; 70b judge = `llama3:70b`. **Register law**
(`registerGuard.admitForSurface`): `outside` = public register only; `diagnose` =
all registers (the surface whose job is the say/see split). **Voice law**
(`claimProvenance.classifyVoice`): own-domain content → `client_voice`
unconditionally (declared, no corroboration rights); else outside/competitor/market.

### Act 1 — "What you say" (stated problem) — SHIPPED (V2-2 / V2-2b / V2-3 / V2-3b)

> **THREE-LAYER LAW (operator ruling 2026-07-23).** The read triangulates three layers:
> (1) **what they told us** — the problem the client stated in the survey (Act 1);
> (2) **what they say publicly** — their positioning; (3) **what customers experience**.
> The product reads the **gaps between (2) and (3) in the context of (1)**. Act 1 is
> layer (1): the client's stated problem, rendered so they know they're heard.

> **VERBATIM-FIRST (V2-3b, supersedes the V2-2b distillation AND V2-3 Part 2's
> parseable headline+points shape).** When `companies.strategic_problem_brief` is
> present, Act 1 renders it **VERBATIM — the client's own words, no model, no row, no
> distillation** (source-direct at render time; paragraph breaks preserved, no bar). The
> signed label "The problem you brought to us" stays. **Long briefs get no generator
> handling** — the field is editable on the company page and curation is the
> operator's/client's act (a collapsed "read more" is the render-side ceiling, only if
> genuinely needed). ONLY when the brief is blank does it fall back to the **site-inference
> path** (public register, 14b gen + 70b judge, problem-framing preference,
> `descriptive_fallback` when description-only) — the sole model territory left in this
> act. The `first_read_stated_problem` table now caches **site-inference rows only**
> (`public_observed`, signed/pending lifecycle); the declared path never touches it.
> honest-empty only when both the brief and the site are blank.
>
> _Retired by V2-3b:_ the declared-path 14b distillation + 70b judge, the long-brief
> `isLongBrief` threshold + headline/`supporting_points` shape (column dropped), and the
> declared `internal_declared` rows (deleted). The generator returns `declared_verbatim`
> (no model call) for any company that has a brief.

- **Exists:** public-baseline **crawls the company's own domain**
  (`crawlWebsiteEvidence` / `siteEvidence`) and the model reads it into `lens_card`
  (primary_buyer, chooser, switching_costs, …) + own-domain signals. Own-domain
  items are forced to **`client_voice`** — this is the correct register: **"what you
  say" is their declared voice, presented as such, NEVER as corroboration**
  (client_voice holds no corroboration rights — the syndication-strip law).
- **Needs building:** a **simplified stated-problem statement** distinct from
  `lens_card` (which is analysis, not "the problem you state"). Either (a) a new
  small field on the public-baseline output (`stated_problem`, own-domain-sourced),
  or (b) a dedicated tiny generator that reads the banked own-domain signals and
  emits one plain sentence. Recommend (b) — a **new 14b generator + 70b judge**
  (judge criterion: "is this the company's OWN stated problem, drawn only from
  own-domain client_voice text — not an outside inference?"), so it never touches
  the fragile public-baseline schema. **Register:** client_voice only. **Canned-text
  guard:** honest-empty when no own-domain problem statement is derivable (many
  companies don't state a problem) — render nothing, never a placeholder.
- **CV-2e tie-in:** the stated problem is a prime **verbatim-quote** candidate (lift
  the exact sentence from the own-domain page → `signals.quote`).

### Act 2 — "Why we start outside" (rationale + journey visual)
- **Exists:** journey/job-map render components (`src/components/journey`,
  `StrategyJourneyMap*`), and the "worked backwards / monitored live" framing lives
  in the strategy model.
- **Needs building:** this act is **mostly a static designed asset + signed prose**
  (see §5). No generator — the rationale is fixed narrative (operator-signed), the
  journey visual is a designed exhibit. **No model, no register concern** (it's
  method explanation, not a company read). **Canned-text guard:** none needed — it's
  intentionally hand-authored method copy, signed once.

### Act 3 — "What the outside shows" (strategy / positioning / messaging read)
- **Exists, substantially** — but note the **mixed generator tiers**:
  - **Market options** — `marketOptionSynthesis` / `generate-market-options`,
    **14b gen + 70b judge (local Ollama)**. Renders in `MarketAct` (outside surface,
    public register only).
  - **Positioning** — `refresh-positioning`, **external OpenAI `gpt-4.1-mini`** (NOT
    the local pair); proof-tier verification via `judgeAttributeEvidence`. Renders in
    `PositionAct` (differentiators only, no model at render).
  - **Strategy cascade** — `refresh-cascade`, **external OpenAI `gpt-4.1-mini`**;
    writes `strategy_cascades`. **Renders only in ADMIN** (`views/Strategy`) — NOT in
    the client story today.
  - Score + primary finding: OutsideHeroAct (mojo score + "bet"), OutsideFindingsAct.
  - **Messaging:** `message_alignment` already on the public-baseline output
    (company_claim_posture / outside_voice_posture / alignment_status) — reuse it.
- **Needs building:** re-composition, not new generation — assemble strategy +
  positioning + messaging into one "what the outside shows" act, and **bring the
  strategy read client-side** (admin-only today). All on the **`outside` surface =
  public register only** (RG-1 enforced). **Canned-text guards:** the register guard
  + honest-empty lines carry over. **No new model tier** — reuse the shipped
  generators (two local, two OpenAI — a mixed-provider act, worth noting for
  determinism/cost).

### Act 4 — "Where the customer agrees / disagrees" (say-vs-see, quotes, verdicts)
- **Exists:** the **claim_deltas** machinery — `claimDeltaSynthesis`: a
  **deterministic** lexical prefilter proposes candidate declared×public pairs, then
  **14b gen proposes + 70b judge** confirms each pair (`pairing_basis =
  judge_confirmed` plain / `inferred` labeled). Taxonomy: `echoed` / `divergent`
  (judged pairs) / **`publicly_silent`** (a **declared claim with no public echo —
  computed DETERMINISTICALLY, no model; the doctrine literally calls it "an OPEN
  QUESTION"**) / `internally_silent` (market speaks, nothing declared). Declared
  claims are `client_attested` (born from the corrections feed).
- **Existing render — mind the gap:** `StrategicDirectionDelta` renders the full
  say/see split **only in an ADMIN preview** (`ClientRefinePreviewExtractsView`), NOT
  in the client story. The **client-facing** say/see surface today is
  **`DiagnoseMarketAct`** (`surface:'diagnose'`, all-registers, "You've told us" vs
  "Our internal read" framing) — but it's market-scoped. The **Check verdicts**
  (confirm/correct/reject/**set-aside**) live in `first_read_responses`; contests
  (OC-1/2) capture disagreement.
- **A key reconciliation (name it):** `publicly_silent` deltas and the Gap's
  `open_questions` are **the same concept from two producers** — a declared thing the
  public doesn't echo. v2 should reconcile them (are the Gap questions the
  publicly_silent deltas? the FR-FLOW-2a question rows? both?) rather than render two
  parallel "open question" lists. This is a design decision, flagged below.
- **Needs building:** bring the say/see delta render **client-side** (admin-only
  today); **re-slot the Check** so a verdict sits beside the delta it addresses; wire
  the **verbatim-quote receipts** (CV-2e capture shipped, **no producers wired** —
  quotes null today; §4). **Register:** diagnose (all registers). **Canned-text
  guard:** a delta with no verbatim quote renders **without** a quote (CV-2e
  render-boundary — quote field or nothing, never claim_text as a quotation).

### Act 5 — "Why this happens → opportunities → how we can help"
- **Exists:** the FrontDoorMapAct **industry job-map** (`generate-reference-jobmap`,
  **14b + 70b judge**; the company's own map via `generate-normative-jobmap`, same
  tier) — re-slotted here as the **norm-vs-reality exhibit** (norm = the reference
  map, reality = this company's normative read); the **opportunities** layer; and the
  **heard → help → plan** proposal generator (`generate-first-read-proposal`, **14b, NO judge**;
  carries the CV-2e `US_ENGLISH_RULE` + `language_flags`). FR-FLOW-D already spec'd
  the heard(deterministic playback incl. set-aside) → help(from prioritized Gap) →
  plan(survived-scope) restructure.
- **Needs building:** (a) the generator must **stop dropping `not_important`**
  (FR-FLOW-D found this) and cache a `not_important_count`; (b) **norm-vs-reality**
  framing of the job map (norm = the standard shape, reality = this company's read);
  (c) **plan is plan-only** — no price data exists; per-market pricing is adopted but
  **wired later** (a plan block that names scope, not price). Recommend **adding the
  70b judge** to the proposal prose (house discipline; today single-model). **Canned
  guards:** the four in `generate-first-read-proposal` (write-time honest-empty,
  drop-empty-block, `admitProposalBlock` render guard, model-returns-empty-for-null)
  all carry over.

---

## 2. Shared-identity basis (FR-FLOW-2a tension #1) — SHIPPED (V2-4, Shape A)

> **V2-4 shipped Shape A.** `generate-open-questions` (new edge fn, ZERO blast radius)
> is handed the persisted `findings.body` + publicly_silent claim-deltas verbatim and
> emits questions whose depends_on IS the anchor — so links resolve by construction
> (`deriveAnchoredRows`). Findings + silent deltas are ONE list (`first_read_open_questions`,
> stamped `source_kind`); Act 5 (GapAct), the story lead (OutsideQuestionAct), and the
> leave-behind all read the table (`useFirstReadOpenQuestions`) — the old
> `result_json.open_questions[]` populator (`persistOpenQuestionLinks`) is retired.
> Chunked cap-3, `long_runner_runs` ledger, reconcile keep/add/supersede by identity
> (temp-0 gen → idempotent re-click). NOTE: ProposalAct's `open_question_indices` still
> index the run json — a coupling for V2-9 (Act 5 restructure) to align.

**The tension:** question→finding links are keyed by **content identity**, but
today findings (`findings.body`, generated from signals via `frontierFinding` /
`generate-finding-beats`) and the model-declared `open_question_links.depends_on`
(from public-baseline) are generated in **different steps from different text**, so
their content identities rarely match → links are honestly linkless.

**Proposal — generate questions and findings against the SAME statement basis:**
the open questions should be generated **after** findings exist, and reference a
finding **by its exact `findings.body` text**, so `contentIdentity(depends_on) ==
contentIdentity(findings.body)`. Two shapes:

- **A (recommended): a dedicated post-findings question generator.** A new small
  generator runs *after* `frontierFinding` has produced the findings rows; it is
  handed the finding bodies verbatim and asked to emit open questions each tagged
  with the exact finding body it depends on. **14b gen + 70b judge** (judge: "does
  depends_on quote a real finding body verbatim?"). Content identities match by
  construction. **Blast radius: ZERO on the public-baseline generator** — this is a
  new function reading already-persisted findings. This is the safe shape.
- **B: teach public-baseline to emit findings AND questions together** against one
  basis. **Blast radius: HIGH** — touches the fragile, strict-schema, unre-runnable
  public-baseline generator. Not recommended.

Recommend **A**. It also retires the FR-FLOW-2a "verified against findings.body"
wiring's inertness: with A, the link source and the verification target share a
basis, so links actually populate. FR-FLOW-2a's `deriveOpenQuestionRows` law and the
`first_read_open_questions` table are reused unchanged.

---

## 3. Set-aside scope (FR-FLOW-2a tension #3)

**Question:** the Check sets aside not just findings but **markets** and
**differentiators** too. Should those set-asides also shrink the Gap's questions?

**Proposal:** **yes, but keep the link finding-shaped and identity-keyed.** A
market/differentiator is itself a Check item with a content identity
(`contentIdentity(item_text)` — the same identity the contest/verdict machinery
already uses). Generalize the link column's meaning from "finding_identity" to a
**`depends_on_identity`** that may be the identity of *any* Check item
(finding | market | differentiator). FR-FLOW-2b's shrink then reads: "a set-aside on
Check item X (any kind) demotes questions whose `depends_on_identity ==
contentIdentity(X.item_text)`." No new table — a **rename/semantic-widen of
`finding_identity` → `depends_on_identity`** (a small migration, or just treat the
existing column as item-identity going forward). The question generator (§2) must be
handed markets + differentiators alongside findings as valid dependency targets.

**Operator ruling needed:** do market/differentiator set-asides shrink questions in
the room (recommended), or only findings? If only findings, keep the column
finding-scoped and skip the widen.

---

## 4. Quote supply (Act 4 verbatim receipts)

CV-2e shipped the **capture** (signals.quote + verbatim CHECK + `liftVerbatimQuote`
+ `SignalQuote` render primitive + "As captured" label) but **no producers are
wired** — every signal's quote is null today.

**Which source-lift producers to wire first (for say-vs-see receipts):**
1. **Own-domain crawl (Act 1 + Act 4 "say" side).** `crawlWebsiteEvidence` already
   holds the extracted page text. Wire it to pass a candidate verbatim line + its
   retained source snippet through the signal draft → `liftVerbatimQuote` verifies →
   `signals.quote`. This gives the client's OWN words as receipts (highest value:
   "here's exactly what your page says").
2. **Outside-voice signals (Act 4 "see" side).** `outside_voice_signals` already
   carry a `signal` string + `url`; where the crawl retained the source text, lift a
   verbatim line. Second priority (external quotes need the retained fetch text,
   which the crawl has for on-site, less so for search snippets).

**Honest render when a delta has no quote:** the CV-2e render-boundary already
answers this — `SignalQuote` renders the quote **or nothing**. A say-vs-see delta
with no verbatim quote shows the delta (verdict + claim text as plain text) with **no
quotation** — never claim_text dressed as a quote. The act must read cleanly
quote-less (most deltas will be, at first). Draft honest-empty behavior: no "quote
unavailable" placeholder — the quote simply isn't there.

**Blast radius:** producer wiring lives in the crawl/ingest path (evidencePhase1 +
the crawl), NOT the public-baseline model. The verbatim CHECK is the backstop.

---

## 5. Journey visual (Act 2)

A **static designed asset** — "Outside → inside foundations
(intentions/outcomes/plans/positioning/messaging) → customer needs, worked
backwards, monitored live." It is method illustration, not a company read, so it is
**hand-authored and operator-signed once**, not generated.

- **Content:** a left-to-right (or outside-in) flow: **Outside signals** → the
  **inside foundation layers** (intentions → outcomes → plans → positioning →
  messaging) → **customer needs**, with arrows showing "worked backwards from the
  customer" and a "monitored live" motif. Neutral palette (per the client-view
  neutral-palette rulings).
- **Authoring path:** the **design-explore branch pattern** — author the SVG/asset
  in a throwaway design branch (or as an Artifact for review), iterate visually,
  then land the final asset as a self-contained inline SVG component
  (`src/components/client-view/story/JourneyExhibit.tsx` or similar). **Operator
  signs the final asset.** No model, no data dependency, theme-aware
  (dark/light like the rest of the story surface).

---

## 6. Migration path (old acts → v2, without breaking machinery)

The **session machinery, export serializer, and corrections/contest feeds must keep
working at every step.** What each surface hangs off:
- **Session lifecycle** (open→proposal_issued→…): unchanged by v2 (acts are render;
  issuance is Act-5's proposal, which stays).
- **Check verdicts** (`first_read_responses` + freeze + contests + corrections
  feed): the Check *moves* into Act 4 but the capture surface + hooks are unchanged
  — only its **placement** changes. The feeds key off `session_id`, not act order.
- **Export serializer** (`exportHtml`): today emits cover + Standard/Mirror/Check/
  Gap/Proposal sections. Each v2 act needs a **new section function** and the section
  order updated. This is the single-source-with-the-screen contract — every v2 act's
  render helper must be shared between screen and export (the CV-2e/OC-2c precedent).

**Sequencing rule: content changes and order changes are cheap; deletions are the
risk.** Recommended order:
1. **Add the two new opening acts (1, 2)** as new render-only components +
   ACTS entries + export sections. Additive, breaks nothing.
2. **Re-slot the Check into Act 4** (placement change; capture unchanged) and fold
   the deltas + quotes beside it. The old standalone Check act entry is removed only
   after Act 4 renders it.
3. **Fold the Gap into Act 5** ("how we can help") — the Gap questions render inside
   Act 5; the standalone Gap act entry removed after Act 5 consumes it. (Resolves the
   FR-FLOW-D "Gap-as-act vs questions-in-Act-5" tension in favor of Act-5.)
4. **Re-slot the Standard job-map into Act 5** as the norm-vs-reality exhibit; the
   standalone Standard act entry removed after.
5. **Retire the old Mirror composite** as its parts land in Acts 3/4.
- **Export at each step:** add the new section, keep the old one until its content
  has moved, then remove — never a step where the export renders a decision the
  screen doesn't (or vice-versa).

**Nothing deleted before its replacement renders** (the MO-ordering discipline
applied to acts).

---

## 7. Gate decomposition (sizes, order, parallelism)

| # | Gate | Size | Deps | Parallel? | Client strings |
|---|------|------|------|-----------|----------------|
| V2-1 | **Act shell + framing** — new ACTS array (5 v2 acts), rail nav, act eyebrow/line copy, export section stubs | S | — | — | ✅ act names + framing lines |
| V2-2 | **Act 1 stated-problem** generator (14b+70b, own-domain client_voice) + render + export section | M | V2-1 | ∥ with V2-3/5 | ✅ act copy + honest-empty |
| V2-3 | **Act 2 journey visual** (static asset, §5) + rationale prose | S/M | V2-1 | ∥ (design-explore) | ✅ rationale + signed asset |
| V2-4 | **Shared-identity question generator** (§2, shape A) — retires FR-FLOW-2a tension #1 | M | — | ∥ (backend) | — |
| V2-5 | **Act 3 "what the outside shows"** — recompose strategy/positioning/messaging (reuse shipped gens) + export | M | V2-1 | ∥ | ✅ act copy |
| V2-6 | **Quote producers** (§4) — wire own-domain + outside-voice source-lift into signals.quote | M | CV-2e | ∥ (backend) | — |
| V2-7 | **Act 4 say-vs-see** — deltas + quotes + re-slotted Check verdicts; diagnose-register surface | L | V2-4, V2-6 | — | ✅ act copy + delta labels |
| V2-8 | **FR-FLOW-2b Gap shrink** — prioritized/shrinking questions; set-aside scope (§3) | M | V2-4 | — | ✅ section framing |
| V2-9 | **Act 5 heard→help→plan** — not_important cache fix + norm-vs-reality job map + plan-only + optional 70b judge | L | V2-8 | — | ✅ heard/help/plan copy |
| V2-10 | **Export v2 finalize** — all sections single-sourced with the screen; retire old sections | S | all | — | — |

**Recommended order:** V2-1 first (the shell). Then **parallel**: V2-2 (Act 1),
V2-3 (Act 2 design), V2-4 (question generator), V2-5 (Act 3), V2-6 (quote
producers) — these don't depend on each other. Then V2-7 (Act 4, needs V2-4+V2-6),
V2-8 (Gap shrink, needs V2-4), V2-9 (Act 5, needs V2-8). V2-10 finalizes the export.
Client-facing strings in every gate marked ✅ are drafted PENDING SIGNATURE at
build time.

---

## Open questions for the operator (rulings)

1. **Act 1 stated-problem — new generator vs public-baseline field?** Recommend a
   new post-hoc 14b+70b generator (zero blast radius on public-baseline). Confirm.
2. **Shared-identity basis (§2) — shape A (post-findings question generator,
   recommended) vs B (rewire public-baseline)?** A is the safe path; confirm we
   accept a *new* generator rather than touching the fragile one.
3. **Set-aside scope (§3) — do market/differentiator set-asides shrink questions
   (recommended), or findings only?** Determines the `finding_identity` →
   `depends_on_identity` widen.
4. **Quote producers (§4) — own-domain first (recommended) then outside-voice?** And
   confirm the honest quote-less render (no placeholder) is acceptable for the many
   deltas that will have no quote at first.
5. **Journey visual (§5) — design-explore branch → signed inline-SVG component?**
   Confirm the authoring path and that you sign the final asset.
6. **Act 5 plan — plan-only now (no price), per-market pricing wired later?**
   Confirm the plan block names scope, not price, until a pricing input exists.
7. **70b judge on the proposal prose (Act 5) — add it (house discipline) or keep
   single-model 14b?**
8. **Online form — RULED (2026-07-23).** The operator's online-form content enters at
   **COMPANY CREATION** as **client-voice, INTERNAL-register declared content**. For
   Act 1: the act **reads the PUBLIC page** (own-domain client_voice); the form is
   **operator-side context / cross-check**, a *different register* (internal declared),
   and **registers never blend silently** — Act 1 shows "what you say" from the public
   page, and any form-derived context is kept register-separate. V2-2 wires the Act-1
   read against the public page; the form content is available as declared internal
   context, never presented as the public "what you say."
9. **not_important cache fix (Act 5)** — provision `not_important_count` on the
   session + in the proposal `bundle_summary` as part of V2-9 (recommended), so the
   playback and flywheel stats count set-asides?
10. **Messaging read (Act 3)** — is `message_alignment` (already on the public-
    baseline output) sufficient, or does "messaging" need its own read?
11. **`publicly_silent` deltas vs Gap `open_questions` (Act 4/5) — reconcile.**
    Both mean "a declared thing the public doesn't echo — an open question," from two
    different producers (claim_deltas vs public-baseline open_questions). Do the Gap
    questions BECOME the publicly_silent deltas, stay the FR-FLOW-2a question rows, or
    both feed one unified list? This decides whether Act 4 and Act 5 share one
    open-question source or run two.
12. **Mixed-provider Act 3** — positioning + strategy use external OpenAI
    (`gpt-4.1-mini`) while market + job maps use local 14b/70b. Acceptable for v2, or
    should the read be provider-consistent (determinism/cost/offline)?
