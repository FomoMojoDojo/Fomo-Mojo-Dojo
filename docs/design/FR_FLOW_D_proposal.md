# FR-FLOW-D — First Read flow revision · design proposal (read-only gate)

> **Status: PROPOSAL, awaiting operator ruling. No code in this gate.** Operator
> approved the three-part revision for *design* on 2026-07-23: intake pre-meeting,
> prioritized/shrinking Gap, Act 5 restructured to heard → help → plan-and-price.
> This document investigates the current state honestly and proposes gates. Every
> new client-facing string is drafted PENDING SIGNATURE. Open questions are listed
> at the end — several are blockers.

Investigated at head `44c7f2d` (post FR-ATTR).

---

## A. Intake pre-meeting

### What exists today
- **Fields** (all on `first_read_sessions`): `presenter`, `trigger_event`,
  `room_roles` (jsonb), `legal_name`, `domains` (text[]), `landmines` (text).
- **Writer (only one):** `TheCheckAct.createSession` — Act 3 renders an intake form
  *when the rail has no session yet*; "Start the read" inserts the session with these
  fields. So **the session is born inside Act 3**, mid-rail.
- **Session resolution:** `FirstReadView.resolveSession` picks the most-recent
  `open | proposal_issued` session for the company.
- **Consumers of intake fields — named, exhaustively:**
  - `presenter` → **`ExportButton`** only (the leave-behind cover meta line).
  - `trigger_event`, `room_roles`, `legal_name`, `domains`, `landmines` → **NONE.**
    They are **write-only today** — captured, never read back anywhere. (The other
    `domains`/`legal_name` hits in the repo are unrelated: `ClientRefinePreviewCompanyView`
    uses `include/exclude_domains` on a different table; `normativeConsistency` reads
    `companies.legal_name`.)

### Proposal
- **Move capture to the workshop, at scheduling.** A pre-meeting "Prepare First Read"
  step on the workshop Inputs tab (next to "Open First Read →") creates the session
  and writes the intake fields **before** the meeting. The session is then already
  present when the presenter opens the rail.
- **The rail opens cold on The Standard.** Acts 0–1 (Standard, Mirror) read *company*
  data, not session data — they need no session. Only Act 3 (The Check) needs a
  session (to store verdicts). So a cold rail with no session renders Acts 0–1 fine
  and The Check shows a "not prepared yet" state (draft copy below) instead of the
  inline intake form.
- **No data migration.** The five write-only fields already live on
  `first_read_sessions`; nothing reads them, so relocating *the form* breaks no
  consumer. `presenter` keeps its one consumer (export). The only code motion is the
  form + the `insert` from `TheCheckAct` → a workshop-side panel.
- **Session-with-no-intake:** if The Check is reached with no prepared session, it
  either (a) blocks with "prepare from the workshop", or (b) offers a minimal
  create — an **open question** below.

---

## B. Gap prioritization

### What exists today
- `GapAct` renders the **full** `open_questions[]` from the preferred public-baseline
  run's `result_json.open_questions`. They are **free-text strings** — no id, no claim
  linkage, no score-delta, no dependency to any Check item.
- The only ordering is **the generator's emission order.** `GapAct`'s own comment is
  explicit: "the generator-emitted order is the only ranking — none is invented."

### Honest ranking-signal answer
**No per-question score-impact signal exists today.** There is nothing to rank
"which questions most move the score" on — the questions carry no score reference and
no link to claims/findings. The only real ordering available is emission order, which
is **not** a score-impact ranking. Presenting emission order *as if* it were a
score-ranking would fabricate a verdict.

### Proposal
- **Shape:** prioritized-few (e.g. top 3) shown, the rest collapsed under a
  "+K more" toggle.
- **Ranking basis (honest):** until a real signal exists, the "prioritized few" are
  simply **the first N in emission order, rendered as unranked** — framed as "the
  questions the read raised," never "the highest-impact questions." A genuine
  score-impact ranking is a **prerequisite** (gate FR-FLOW-2a), not something to
  assume. Absence-isn't-a-verdict: a question with no ranking signal renders in the
  collapsed "rest," never fabricated-ranked.
- **Live-shrink — the honest blocker:** "a set-aside verdict in The Check removes/
  demotes its dependent questions" **requires a question ↔ finding/claim linkage that
  does not exist.** A Check item is keyed by `item_identity` (→ a claim); a Gap
  question is an untethered string. There is no dependency graph to walk. Live-shrink
  is therefore **not buildable today** without first establishing that linkage
  (2a). With the linkage: `set_aside(finding X)` → demote every question whose source
  set includes X. Without it: no auto-shrink is honest.

---

## C. Act 5 restructure — heard → help → plan-and-price

### What exists today
- **`generate-first-read-proposal`** — single model, **gen `qwen2.5:14b-instruct`,
  hard-pinned, NO judge.** (House judge model, for reference, is `llama3:70b`.)
- **Blocks:** `where_you_are` (score) · `what_the_read_shows` (verdicts) ·
  `what_we_would_answer` (open questions) · `the_engagement` (union). Each carries a
  **server-built sources manifest** (`open_question_indices` / `response_ids` /
  `score_ref`).
- **Canned-text guards (four, all present):** (1) write-time honest-empty — no
  questions ∧ no responses ∧ no score → structured empty, *no model call, no freeze*;
  (2) `push()` drops any block whose model text is empty; (3) `admitProposalBlock`
  render guard — a block with an empty sources manifest is REFUSED in place;
  (4) the system prompt forces empty-string for null fields and bans invented scope/
  price/duration.
- **`not_important` is dropped.** The generator's `ResponseRow` type is
  `confirmed | corrected | rejected` — set-aside verdicts never enter the bundle, and
  the session's cached counts (`confirmed/corrected/rejected_count`) have **no
  `not_important_count`.**

### Proposal (per the three parts)
- **heard** — playback grouped confirmed / corrected / **set-aside**, generated from
  session data with **no hand-authored substance**. This should be **deterministic
  (no model):** list the verbatim `item_text` per verdict group. New work: include
  `not_important` in the bundle + a `set_aside` group; add `not_important_count` to
  the cached counts. No model, no canned text — pure session data.
- **help** — derived from the **prioritized** Gap (reworks `what_we_would_answer`),
  scoped to questions **not demoted by set-asides**. Depends on B (2a linkage + 2b
  prioritization).
- **plan-and-price** — reworks `the_engagement`, **scoped to what survived set-asides.**
  ⚠ **There is no price data**, and the generator is explicitly barred from naming a
  price. "plan-and-price" cannot name a price without fabrication → it stays **plan-only**
  unless a pricing input is ruled in (open question).
- **Freeze language removed from room copy** — `ISSUE_LEAD` currently says "Issuing
  the proposal *freezes the client's verdicts*…". New copy drops "freezes"; the freeze
  still happens silently in the generator's issuance update (`status → proposal_issued`).
- **Model per generator discipline:** the prose blocks (help, plan) stay **14b gen**;
  recommend adding a **70b judge (`llama3:70b`)** pass to verify the prose invents no
  scope/price — currently there is **no judge**. The **heard** playback uses **no
  model** (deterministic).
- **Canned-text guards:** keep all four; the heard playback needs none (verbatim
  data); if the 70b judge is added it becomes the fifth guard on prose.
- **Export serializer needs — and a LIVE GAP found:**
  - The export **tally line already omits "set aside"** (`exportHtml.ts` L126 renders
    only confirmed/refined/wrong) and the **annotation switch omits `not_important`**
    (L132–140 handle confirmed/rejected/corrected only). **The screen and the
    leave-behind already diverge** — a set-aside shows on screen (added in OC-2c) but
    not in the export. This is a live single-source honesty gap, introduced by OC-2/
    OC-2c.
  - For the restructure: the generic block renderer carries new block keys
    automatically, but a distinct **heard** section + set-aside-scoped plan need the
    export's Check section to group by the four verdicts and the proposal section to
    reflect survived-scope.

---

## Gate decomposition (sizes, order)

| # | Gate | Size | Depends on | Summary |
|---|------|------|-----------|---------|
| 1 | **FR-EXPORT-SETASIDE** | XS | — | Export tally 4th segment + `not_important` annotation, single-sourced with the screen. Closes a **live** leave-behind divergence. Fastest honesty win; can ship immediately. |
| 2 | **FR-FLOW-1 (intake move)** | S | — | Relocate intake capture to a workshop pre-meeting step; rail opens cold on The Standard; The Check consumes/creates the session. No data migration. Independent. |
| 3 | **FR-FLOW-2a (gap linkage)** | M | — | Emit/derive a per-question **source claim/finding** linkage (question generator or a matching pass). The prerequisite for both real ranking and live-shrink. The honest blocker. |
| 4 | **FR-FLOW-2b (gap prioritize + live-shrink)** | M | 2a | Prioritized-few + collapsed-rest; ranking = emission order (honestly unranked) until 2a yields score-impact; live-shrink via the 2a linkage. |
| 5 | **FR-FLOW-3 (Act 5 restructure)** | M/L | 1, 2b, +not_important-in-generator | heard (deterministic, incl. set-aside) → help (prioritized+survived Gap) → plan (survived-scope, price-less); rework 14b generator; optional 70b judge; freeze language out of room copy. |

**Recommended order:** 1 → 2 → 3 → 4 → 5 (1 and 2 are independent and quick; 3 unblocks 4; 4 unblocks the "help/plan" scoping in 5). 5 also needs the generator to stop dropping `not_important`.

---

## New client-facing strings — drafted, PENDING SIGNATURE

**Intake / workshop pre-meeting**
- Panel label: `Prepare First Read`
- Panel sub: `Pre-meeting notes for the room — captured now, shown to no one.`
- The Check, no prepared session: `This meeting hasn't been prepared yet. Set it up from the workshop first.`

**Gap (prioritized)**
- Section framing: `The questions the outside read raised — the ones to start with.`
- Collapsed toggle: `+{K} more questions`
- (No rank claim. No "highest impact" language — there is no signal for it.)

**Act 5 (heard → help → plan)**
- Section headings: `What we heard` · `How we can help` · `The plan`
- Heard sub-groups: `You confirmed` · `You refined` · `You set aside`
- New issue lead (freeze removed): `Issuing generates the client's one-screen offer from this read.`
- Issue button (unchanged): `Issue proposal`

**Export set-aside parity**
- Tally segment: `· {n} set aside`
- Annotation: `Set aside by the client · {date}`

---

## Open questions for the operator (several are blockers)

1. **Intake scope & lifecycle:** stays session-scoped (per meeting) or becomes
   company-scoped? Session created at scheduling (pre-meeting), or lazily at first
   Check? If The Check opens with no prepared session — **block** ("prepare first") or
   **silent create**?
2. **Write-only intake fields:** `trigger_event / room_roles / legal_name / domains /
   landmines` have **no consumer today**. Do they need one (e.g. surfaced to the
   presenter on the rail), or is relocating the capture form enough?
3. **Gap ranking reality:** confirmed there is **no score-impact signal**. Accept
   "emission order, rendered unranked" for the prioritized few now, or gate the
   score-impact signal (2a) *before* prioritizing?
4. **Live-shrink prerequisite:** it needs a question↔finding linkage that **doesn't
   exist**. Build 2a first, or ship prioritization-only and defer live-shrink?
5. **"plan-and-price":** there is **no price data** and the generator is barred from
   inventing one. Keep it **plan-only** ("The plan"), or is there a pricing input to
   wire in?
6. **70b judge:** add a `llama3:70b` judge pass over the proposal prose (gen 14b →
   judge 70b, house discipline), or keep single-model 14b?
7. **Export set-aside parity is a LIVE gap** (screen shows 4 tally segments since
   OC-2c; the leave-behind still shows 3, and drops the set-aside annotation). Fix
   **immediately** as gate 1 (XS), or fold into the Act-5 export work?
8. **heard playback:** confirm it is **deterministic verbatim** (no model touches the
   playback substance; only help/plan get model prose)?
