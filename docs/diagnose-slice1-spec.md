# Diagnose · slice 1 spec (first visit + MH1 home, read-only)

Source of truth: the Design canvas "MojoMap™ · Diagnose Flow — Designed" (Nov 6) and the Notion page "Diagnose Flow — client-facing spec (handoff, Nov 6 2026)". Every string below is signed (S1–I3, Nov 6). Text in [brackets] is a placeholder the system fills later; never hand-write it. Rulings P2, P3 govern this slice: read-only, no new stores, every control holds its change in page state only.

## Route and guards

- `/preview/client-refine/diagnose/:companyId`, sibling of the First Read route, wrapped `AdminModeRoute → InternalViewOnlyRoute` like every sibling.
- Sub-paths: `/send`, `/welcome`, `/w1`, `/w2`, `/w4`, `/w5`, `/w6`, `/w7`, `/w8`, `/w9` (the signed screen ids; there is no W3), `/home` (MH1). Default = `/home`.
- Operator affordances only behind the existing bottom-left glyph switch (`data-fr-operator-switch`); default render has zero `[data-fr-operator]` nodes.
- This route never mounts a view that invokes `evaluate-*`, `propose-*`, `refresh-*`, `assess-surface-drift` or `council-review`.
- No client-facing string may be added or changed; anything not in this file is unsigned and must come back for signature.

## Tokens (Lovable handoff, with contrast-safe inks)

- paper `#f6f1e8` (page) · surface `#fffdf8` · ink `#242323` · muted `#6b665f` · track `#dedbd6` · hairline `rgba(36,35,35,0.12)` · dot `#9cbe6f` · amber `#f6af3c`
- tone base: bg `#9cbe6f` · fill `#6f9a3e` · text `#4e7428`
- tone goal: bg `#f6af3c` · fill `#d98a12` · text `#8a5300`
- tone market: bg `#b0c1de` · fill `#4a6fa8` · text `#3b5d93`
- Kind chips: need `#f6af3c` · Recipients `#9cbe6f` · Referrers `#b0c1de` · Funders `#f6af3c` · Partners `#d0cdc8` · Users `#8ccbc1` · Underway `#242323` · Planned `transparent` · Stalled `#686464`
- Type: Space Grotesk 400/500/700 (display + body); JetBrains Mono 400/500/700 for labels (10–11px, uppercase, 0.12em tracking).
- Shape: SQUARE corners everywhere. Only true circles are round: status dots (≤24px) and the three 96px outcome rings.
- Hero: one 52px bold headline per screen; its final `.` or `?` is in dot green. At most one 18px muted lede.
- Few boxes: hairlines and whitespace; a box only for things you grab, drop or rearrange. Soft shadow `0 1px 2px rgba(60,50,30,0.06), 0 12px 32px -12px rgba(60,50,30,0.22)`.
- Motion: 150ms fade-up on screen enter; staggered rise on list items; 500–700ms on value changes; respect prefers-reduced-motion.

## Shared chrome

- Breadcrumb (15px): **MojoMap™** / Edgewood / phase bar. The phase bar is `#b0c1de`, 13px, padding 4px 18px, with slanted ends matching the slash: `clip-path: polygon(9px 0, 100% 0, calc(100% - 9px) 100%, 0 100%)`. Text: "Diagnose · before the first visit" (Send) · "Diagnose · first visit" (Welcome, W1–W9) · "Diagnose · about two weeks" (app screens).
- Bottom bar (sticky, hairline top): the MojoScore™ block at the FAR RIGHT, full bar height, square, surface background, hairline on its left edge, running to the page edge. Label "MojoScore™" (mono 10px) over the number with a green dot. Walk screens: number 34px, beside it "34 base confirmed / 52 everything in" (12px muted) — SEE SCORE RULE. App screens: number 56px plus a 176px track with marks at 34 (base fill) and 52 (amber).
- SCORE RULE (P13): until the 34 and 52 variants are built and proven able to fail, render ONLY today's computed MojoScore (computeMojoScore via useLiveMojoScore). Omit the 34/52 text and the two marks. Never show a hand-set number.
- All navigation lives in the TOP header, never in the bottom bar.

## Walk chrome (Welcome, W1–W9)

- Header right: 9 progress segments (8px tall; current = 32px wide in the screen's tone fill; done = 16px ink 50%; next = 16px track) + "01 / 09" mono; then `← Back` (ghost) and the Next button (dark pill). Welcome's header shows `← First Read` and `Start with the documents →`.
- Body: max-width 1280, two columns. LEFT (320–380px): "Where these come from" + source line; "Write it as" + mono pattern + "Example:" line. RIGHT: "On the map" label, optional count line, then the item list (hairline rows): index (mono), source line (mono 11px muted) with chips, the statement (20px/500), sub-lines (10px dot + bold label + muted text), then two buttons.
- Bottom bar left: the composer — a surface pill with the pattern as placeholder and an `Add` dark button; beside it the none-yet button (outlined; pressed = dark with ✓). Under it: "Leaving something blank is an answer." (13px muted). Fix on an item opens the composer with the mono label "Fixing item n" and a `Cancel` link; the button reads `Save`. Added items get source "Added at the visit"; fixed items append " · fixed at the visit".
- Page scrolls; no inner scroll region.
- Tones: Documents, Base, Who to hear = base · Problems, Goals, Initiatives = goal · Market, Hypotheses = market.

## DF-00 Send (`/send`) — phase bar "Diagnose · before the first visit"

Eyebrow "Diagnose · step one". H "Send what Edgewood already has." Lede: "The First Read is how the world sees Edgewood from the outside. Diagnose adds the inside: the plans, numbers and decks Edgewood already uses. They go on the map before the first visit, so that visit is spent comparing, not collecting." Dashed drop zone (the one box): "Drop files here" / on drag "Let go to add" / "or click to choose · any format, as many as there are". "Sent so far" + "Edgewood's documents stay here. Nothing leaves." List rows: file name · green dot "Received". "Rather email? Send to [documents@fomomojodojo.com] and they're added here for you." Block "What happens next": "One line comes back when they land: how many came in and how many are on the map. At the visit, Edgewood's documents sit beside the outside read. Edgewood decides who should be heard and notes anything else that's needed. **Nothing to solve that day.**" Button `That's all of them →` → Welcome. Slice 1: the drop zone is visual only (no upload); list = `input_files` for the company, newest first, state Received.

## DF-01 Welcome (`/welcome`)

Eyebrow "Welcome to Diagnose · Edgewood's documents are in". H "Edgewood's documents are in. Now the inside view sits beside the world's." Lede: "The First Read is built from the outside and can only see what's visible. Edgewood's documents say what Edgewood is actually doing. This visit puts the two together." Label "By the end of Diagnose Edgewood holds three things": three 96px dashed rings on a connecting hairline, each with a tone dot — "Edgewood's base, agreed" / "Promise, positioning, strategy, and who Edgewood serves." · "Edgewood's goal, chosen" / "One goal, expressed as a concrete outcome chosen by Edgewood from the potential goals on the table." · "Edgewood's market, selected" / "The group of people critical to Edgewood's success, and what they need to accomplish. Chosen last, from the evidence." Two columns: "Where you are" — "The First Read is in. Diagnose is the first phase, about two weeks. Focus and Flow follow." · "What happens now" — "**Eight short screens. Nothing to solve today.** Three things: see where Edgewood's documents and the outside read agree and where they don't · decide who should be heard · note what else is needed." + "Every screen is prefilled from the documents. Confirm, fix, or add." Bottom bar: `How MojoMap™ works` (ghost, no target yet) + score.

## The eight gather screens

Each: eyebrow · question (H) · why (lede) · source line · pattern · example · buttons · composer placeholder · none-yet label · Next label · the prefilled items as they appear on the canvas (Edgewood example content; the DATA MAPPING section says what replaces each at runtime).

### 1 of 8 · Documents  (`/w1` · tone base)

- H: **What Edgewood's documents add to the map.**
- Why: The outside read can only see what Edgewood shows the world. Edgewood's documents say what Edgewood is actually doing, and trying to do. Together they decide where the map starts. If a document is missing, that part of the map stays a guess.
- Source: Each document lists what it added. Anything not here, add it below.
- Write it as: `[Document name] · [what it is] · [date]` · Example: Board update · slides shown to the board · March 2026
- Buttons: Keep / Fix · Composer placeholder: "A document we should have" · None-yet: "That's all of them" · Next: "Base →"
- Count line: 5 documents · 4 added · 1 could not be opened
- Items:
  - [Strategic plan 2024–2027] Added the strategy, the goals, and who Edgewood serves.
  - [Board update · March 2026] Added where Edgewood stands today and what's already underway.
  - [FY25 numbers] Added the number the map starts from.
  - [Brand playbook] Added the promise and the positioning.
  - [Donor research deck] Could not be opened, so it added nothing yet. Add it again below, or bring it to the visit. · tag “Not added” (need chip)

### 2 of 8 · Base  (`/w2` · tone base)

- H: **Is this Edgewood?**
- Why: Edgewood's base has four parts: what Edgewood promises, how it's positioned, its strategy, and who it serves. Each line is what Edgewood's documents say. Under it is what the outside shows, with one mark: both say it, only the documents say it, or only the outside shows it.
- Source: Edgewood's documents come first. The outside read checks them.
- Write it as: `Promise: [who] can count on [what]. Positioning: for [who], the [what] that [others do not do]. Strategy: play [where], win by [how]. Who Edgewood serves: [a group] trying to [get something done].` · Example: Promise: every young person in crisis can count on a safe place within 24 hours.
- Buttons: That's Edgewood / Not quite · Composer placeholder: "Say it another way" · None-yet: "Not sure what Edgewood's base is" · Next: "Problems →"
- Items:
  - [Promise · brand playbook] Every young person in crisis in San Francisco and San Mateo has a safe place within 24 hours.
    - Both say it: The outside shows expert, trauma-informed care and 24-hour crisis stabilization for Bay Area youth.  (out-both)
  - [Positioning · brand playbook] The first call for a 12-to-17-year-old in crisis, for the counselors and county workers who make that call.
    - Only the documents say it: The outside shows a nonprofit youth mental healthcare provider. “First call” appears in none of 14 sources.  (out-you)
  - [Strategy · strategic plan] Be the county's default answer for youth in crisis, in SF and San Mateo, by being the one that answers. · tag “Intent · 2024 plan” (plain chip)
    - Both say it: The outside matches on where to play and how to win. Capabilities and management systems come only from the plan.  (out-both)
  - [Who Edgewood serves · strategic plan] Young people 12 to 17 in crisis, and the counselors and county workers trying to get them somewhere safe tonight.
    - Only the outside shows it: The outside also names families, foundations and new clinicians. The plan doesn't.  (out-out)

### 3 of 8 · Problems  (`/w4` · tone goal)

- H: **What's the problem, as each person sees it?**
- Why: What hurts now, as each person states it. Edgewood's documents name some; the intake form named others. Reframing comes later, with evidence.
- Source: These come from the board update and the intake form. Add any version of the problem that isn't here.
- Write it as: `[Who] cannot [do what], because [why].` · Example: Counselors cannot place a kid the same night, because beds are full by 6pm.
- Buttons: Keep / Fix · Composer placeholder: "Another version of the problem" · None-yet: "No agreement on the problem" · Next: "Goals →"
- Items:
  - [Board update] Giving is flat while demand is up 40% in two years.
  - [Intake form] The board wants a new program. Staff want to fix the one we have.
  - [Intake form] Nobody outside the county system knows we exist.

### 4 of 8 · Goals  (`/w5` · tone goal)

- H: **What is Edgewood trying to achieve?**
- Why: Edgewood picks the goal. Each goal needs where it starts today and where it should end, so the map can draw the distance between them. A goal from a plan is intent until something confirms it.
- Source: These come from the strategic plan, the intake form and the FY25 numbers. Add any goal that's on the table, agreed or not. What's fixed bounds every goal.
- Write it as: `[What] from [today] to [target] by [date].` · Example: Unrestricted giving from $1.2M to $2M by 2028.
- Buttons: Keep / Fix · Composer placeholder: "Another goal, or something that is fixed" · None-yet: "No agreed goal yet" · Next: "Market →"
- Extra box under the list: label "How will Edgewood know it worked?" with a textarea; placeholder: Plain words. Example: “We stop turning kids away in spring.”
- Items:
  - [Strategic plan] Unrestricted giving from $1.2M to $2M by 2028.
    - Today: $1.2M · FY25 numbers  (today)
  - [Strategic plan] Be the first call for every school counselor in both counties. · tag “Intent · no number yet” (need chip)
    - Today: No number yet. What would the count be, and what is it now?  (today-missing)
  - [Board update] Open a second site. · tag “No date yet” (plain chip)
    - Today: One site · board update  (today)
  - [Board update] What's fixed
    - Fixed: No capital campaign before 2028.  (fixed)
    - Fixed: Two development staff this year.  (fixed)

### 5 of 8 · Market  (`/w6` · tone market)

- H: **Who is critical to Edgewood's success?**
- Why: The market is the group of people critical to Edgewood's success, and what they need to accomplish. Every group named anywhere is here: in the intake form, in the documents, and in the outside read. Choosing one comes at the end of Diagnose, from the evidence. Here the job is to make sure no group is missing.
- Source: These come from the intake form, the strategic plan and the outside read, in the five roles the outside read uses: recipients, referrers, funders, partners, users. Add any group that isn't here.
- Write it as: `[A group of people] trying to [get something done].` · Example: Local donors trying to make their giving do the most good for kids in crisis.
- Buttons: Keep / Fix · Composer placeholder: "Another group" · None-yet: "Not sure who the market is" · Next: "Initiatives →"
- Items:
  - [Intake form · named as the market] Donors · role chip Funders
    - Trying to: make their giving do the most good for kids in crisis  (job)
  - [Strategic plan] Foundations and corporate partners · role chip Funders
    - Trying to: fund outcomes their board can defend  (job)
  - [Outside read] Families and youth in crisis · role chip Recipients
    - Trying to: get a young person somewhere safe tonight  (job)
  - [Outside read] County social workers and school counselors · role chip Referrers
    - Trying to: place a kid the same day, with someone they trust  (job)
  - [Outside read] Government agencies and payers · role chip Partners
    - Trying to: keep a county-wide crisis response that meets their mandate  (job)
  - [Outside read] New clinicians · role chip Users
    - Trying to: do trauma-informed work where they can grow  (job)

### 6 of 8 · Initiatives  (`/w7` · tone goal)

- H: **What's underway, and what has Edgewood tried?**
- Why: Routes Edgewood is already on are the cheapest evidence there is. They go on the map from day one, each with the bet it carries.
- Source: These come from the board update and the strategic plan. Add anything else that's in motion, planned, stalled, or was tried before.
- Write it as: `[Name] · [underway, planned, stalled, or tried before] · bets that [belief].` · Example: Spring gala · underway · bets that people give because they know a kid we helped.
- Buttons: Keep / Fix · Composer placeholder: "Something else in motion or tried" · None-yet: "Nothing underway right now" · Next: "Hypotheses →"
- Items:
  - [Board update] Major gifts push · started Q2 · tag “Underway” (Underway chip)
    - This bets that: a few large donors can close the gap faster than many small ones.  (bet)
  - [Strategic plan] Spring gala · every year · tag “Underway” (Underway chip)
    - This bets that: people give because they know a kid we helped.  (bet)
  - [Board update] School-partnership program · tag “Planned” (Planned chip)
    - This bets that: counselors refer more when there is a formal program.  (bet)
  - [Board update] Outcomes dashboard · tag “Stalled” (Stalled chip)
    - This bets that: foundations give when they can see outcomes.  (bet)

### 7 of 8 · Hypotheses  (`/w8` · tone market)

- H: **What does Edgewood believe is true?**
- Why: Why people choose Edgewood, why they don't, and what would fix it. Edgewood's documents state some. One comes from the outside read and is marked so. Written down before the evidence arrives, so the evidence can move them.
- Source: These come from the strategic plan. One comes from the outside read. None of them says what would prove it wrong yet; that part is the ask.
- Write it as: `We believe [this], because [that]. We would be wrong if [sign].` · Example: We believe foundations pass on us because we have no outcomes data. We would be wrong if a funder said the data was fine.
- Buttons: Keep / Fix · Composer placeholder: "Another belief" · None-yet: "None written down yet" · Next: "Who to hear →"
- Items:
  - [Strategic plan] We believe people give because they know a kid we helped. · tag “Why they choose Edgewood” (plain chip)
    - Wrong if: Not stated yet. What would show this belief is wrong?  (wrong)
  - [Outside read] We believe counselors refer to whoever picks up the phone first, because the plan ties referrals to response time. · tag “Why they choose Edgewood” (plain chip)
    - Wrong if: Not stated yet. What would show this belief is wrong?  (wrong)
  - [Strategic plan] We believe foundations pass on us because we have no outcomes data. · tag “Why they do not” (plain chip)
    - Wrong if: Not stated yet. What would show this belief is wrong?  (wrong)

### 8 of 8 · Who to hear  (`/w9` · tone base)

- H: **Who should be heard?**
- Why: The one thing only Edgewood can supply. Staff, board, stakeholders, a counselor who refers to Edgewood: anyone with a say or a view. The documents name roles; Edgewood names the people.
- Source: Invites go out from Edgewood's own calendar, with FomoMojoDojo as a guest. Names stay here.
- Write it as: `[Name] · [role] · knows [what].` · Example: Priya Nair · development lead · knows which donors lapsed and why.
- Buttons: Keep / Fix · Composer placeholder: "Add a person" · None-yet: "Decide later" · Next: "Home →"
- Items:
  - [You] Maya Chen · Executive director
  - [Intake form] Robert Alvarez · Board chair
  - [Board update · names the role] Development lead · tag “Name needed” (need chip)
  - [Outside read] A school counselor who refers to Edgewood · tag “Name needed” (need chip)

Sub-line marks: Both say it = `#9cbe6f` dot · Only the documents say it = amber dot · Only the outside shows it = `#d0cdc8` dot · Today = ink dot · Today (missing) = amber ring · Fixed = ink square outline · Trying to / Wrong if = ring (Wrong if amber) · This bets that = ink dot. "Only the documents say it" always carries its breadth (e.g. "none of 14 sources"), never a verdict.

W9 "You" rule: the source label "You" shows only when the viewer is that person; anyone else sees the actual source (e.g. "Intake form").

## MH1 Home (`/home`) — phase bar "Diagnose · about two weeks"

- Header: breadcrumb; `Walk through Diagnose →` (→ /welcome) and `The First Read` (→ the First Read route, muted); right-aligned nav: `☰ See all` · `Now` · `Dojo` · `+ Add` (outlined with a filled square + ; opens a dark menu downward: "Add to the map" / "A document" — "Plans, decks, research, numbers. The map shows what it changed." / "A person to hear" — "Staff, board, stakeholder, anyone with a say.") · `What changed [n]` (amber square badge). In slice 1: See all, Dojo, Add targets and What changed are present but disabled (no destination yet); Now scrolls to Today.
- Title row: H 44px "Edgewood's map." + lede "Today sits in the middle. Drag left for what came before, right for what could come." Right: segmented `← Before` · `Today` · `Ahead →` (surface pill group; active = surface + shadow).
- The map: a horizontally scrollable, pointer-draggable strip (scrollbar hidden) on a 28px dot grid, opening centred on Today. Three sections:
  - **Before** (640px): label "Before"; a horizontal hairline timeline with 18px ring points, dashed stems, and 180px cards (date mono · title · note) alternating above/below: "[DATE] · First Read · The outside view" · "[DATE] · Documents in · 5 sent · 4 added" · "[DATE] · First visit · Base checked · who to hear named". Below: box "What the first visit settled" with three lines "· Promise and strategy: both say it" "· Positioning: only the documents say it" "· Who Edgewood serves: only the outside shows it".
  - **Today** (1120px): label with green dot "Today · Edgewood is here". An inset panel (`#efe9dd`, inner shadow) in two columns. LEFT "Today" + pager "n of 4": a 500×430 card stack (14px offset, 1.6° rotation per card, ‹ › buttons 44px). Cards, in order: 1 "Next step" (base bg) — "Name who should be heard." — "Two people on Edgewood's list still need a name: the development lead, and a school counselor who refers to Edgewood." — `Name them →`; 2 "A shift" (goal bg) — "“First call” is in Edgewood's documents, not in the outside read." — "Edgewood's positioning says “first call”. None of 14 outside sources says it." — `Open the base →`; 3 "Where Edgewood stands" (surface) — "Three things end Diagnose." — "None is settled yet. Each fills in as the documents and interviews land." — three outcome rows with 18px rings: "Base agreed · In progress · 2 of 4 lines both say it" (half-filled ring) · "Goal chosen · Not yet · 3 on the table" · "Market chosen · Not yet · chosen last" — `Open the base →`; 4 "Diagnose ends with" (`#d0cdc8`) — "One base, one goal, one market." — "Edgewood chooses the goal and the market once the documents and interviews are in. The tool decides nothing." — `See how it ends →`. RIGHT "In focus": five rows (surface = underway, `#d6e5c1` + chip "Needs Edgewood" = needs the client, dashed = not yet): "Documents · 5 documents · 4 added · 1 could not be opened" · "Interviews · 2 named · 2 still need a name" (needs) · "Base · 2 of 4 lines both say it" · "Goals · 3 on the table · Edgewood chooses at the end of Diagnose" (dashed) · "Market · 6 groups named · chosen last" (dashed). Legend: "Solid = underway · green = needs Edgewood · dashed = not yet".
  - **Ahead** (1500px): label "Ahead"; a futures cone drawn as separate elements (not one SVG blob where avoidable): a horizontal axis from Today, dashed verticals labelled "Focus" and "Flow", nested outline ellipses at the right edge labelled "Probable" / "Plausible" / "Possible", a dashed amber ellipse in the upper-right labelled "Edgewood's goal · chosen at the end of Diagnose" (EMPTY — nothing sits in it), three faint dotted ghost lines labelled "Routes Focus will draw", and the current initiatives as lines from Today: solid = underway, dashed = planned, a short solid line ending in a square = stalled; each line carries ONLY its name as a small surface pill; hover/focus shows a card: state (mono) · name · "Bets that …". Legend: "Lines: solid = underway · dashed = planned · square = stalled · faint = routes Focus will draw. Nothing is in the goal zone until Edgewood chooses a goal."
- Bottom bar: score only (SCORE RULE).

## DATA MAPPING (from the Nov 6 census) — slice 1 is read-only

| Screen element | Source today | Slice-1 behaviour |
|---|---|---|
| Send / W1 list | `input_files` via `inputs.company_id`; states from `file_proposals.processing_state` × `.status` | received = file exists; added = any accepted proposal; "could not be opened" = processing_state failed. "What it added" line: derive from accepted proposals' candidate kinds (base parts / goals / groups / initiatives); if none, show "Added nothing yet." (string already signed in the Donor deck line shape) — NO model call |
| W2 Base: promise / positioning / strategy | declared = `positioning_canvases` / `strategy_cascades` where artifact_role=declared_direction, provenance internal_declared; outside = same tables artifact_role=market_read + `public_reads` | render both sides; the per-part MARK is P4 (not in this slice): show the declared statement and the outside statement WITHOUT a mark line. Who Edgewood serves: MISSING → render the item with the outside side only (recipient-role `odi_market_definitions`) and the none-yet state |
| W2 confirm buttons | — (P6 later) | page state only |
| W4 Problems | `strategy_problem_statements`, `intake_responses`, `first_read_stated_problem` (all 0 for Edgewood); interview pain points only after review (P11) | empty state: none-yet pressed look + items empty; composer works in page state |
| W5 Goals | `managed_outcomes` (1 row: outcome_statement, leading_indicator; no values) | render the statement; the "Today:" sub-line only if a value exists (none → omit the sub-line, do not invent); "What's fixed" from `constraint` if non-null |
| W6 Market | `odi_market_definitions` live rows: relationship_kind → role chip (recipient→Recipients, referrer→Referrers, funder→Funders, partner→Partners, user→Users; buyer/investor/observer/communicator/NULL → no chip), jtbd → "Trying to" sub-line, source = register (public_inferred → "Outside read"; internal_* → "Edgewood's documents"); operator view flags NULL-role rows | real data, 18 rows |
| W7 Initiatives | `routes` (21: 7 route-level) with what_would_have_to_be_true as the bet; lifecycle MISSING (P8) | render route-level routes with the bet and NO lifecycle chip; home map draws them as solid lines (unknown lifecycle = solid) |
| W8 Hypotheses | `strategic_hypotheses` (0) | empty state |
| W9 People | `interview_records` (1 live, unnamed) | one item with source "Interview · [date]" and tag "Name needed"; never render a person's name on any other surface |
| Home cards 1–4 | P12 rules, not a store | slice 1: derive from the same reads — card 1 from unnamed/missing people, card 2 only when a mark exists (P4 later → omit card 2 until then), card 3 outcome rows from counts, card 4 static |
| Home In focus counts | the reads above | computed, never typed |
| Home Before timeline | `first_read_sessions.started_at` (First Read), `input_files.uploaded_at` min/max (Documents in); first-visit date MISSING → omit that card | dates rendered as real dates; no placeholder dates on a live screen |
| Home Ahead | route-level `routes` as lines; goal zone empty | no routes drawn to the goal; no Focus/Flow durations |
| MojoScore | `useLiveMojoScore` | today's number only (SCORE RULE) |

Display-honesty: no count, date or figure is typed in; every number on a live screen is computed from the rows above or omitted. Example content from the canvas ("5 documents · 4 added", "2 of 4", "14 sources") is NOT to be hardcoded.

## Slice-1 rulings (Nov 7)

Rulings G1–G8, signed Nov 7 2026, in answer to the STOP 1 report's six unsigned-string findings. These
strings are as signed as the body above; `{company}` is `companies.name` and `{n}` / `{a}` / `{b}` /
`{list}` are computed. A variable in a signed string does not make the string unsigned.

**G1 — Company name.** Every "Edgewood" in a signed string is `{company}` from `companies.name`. The
possessive is always `{company}'s`, including names ending in s ("Sonos's"). Strings stay signed with
the variable in place.

**G2 — Singular forms.** Computed counts have singular/plural pairs:

- "1 document" / "{n} documents"
- "1 group named" / "{n} groups named"
- "1 on the table" / "{n} on the table"
- "1 named" / "{n} named"
- "1 still needs a name" / "{n} still need a name"
- "{a} of {b} lines both say it" (unchanged)

A zero count reads as the signed none-yet string where one exists, else "0".

**G3 — Zero segments.** A count line drops any segment whose count is 0 — "· 0 could not be opened"
never renders. All segments zero → the line is omitted.

**G4 — Home card 1 is derived.**

- "{n} people on {company}'s list still need a name."
- "One person on {company}'s list still needs a name."

Roles are listed only when every unnamed record has a role; otherwise no role list. No one unnamed →
the card is omitted, and the pager counts the remaining cards.

**G5 — "Added nothing yet."** is signed as the W1 line for a document with no accepted proposals.

**G6 — W1 "what it added".** "Added {list}." built from the kind map in this order:

- `candidate_positioning_updates` → "the positioning"
- `candidate_outcomes` → "the goals"
- `candidate_needs` / `candidate_job_steps` → "what the groups {company} serves need"
- `possible_routes` → "what's underway"

Join with commas and "and" — "Added the positioning, the goals and what's underway."

**G7 — Slice-1 variants of two signed strings that describe unbuilt things.**

- W2's lede ends "Under it is what the outside shows." (the mark clause returns with P4).
- Ahead's legend reads "Lines: what {company} already has underway. Nothing is in the goal zone until {company} chooses a goal." (the full legend returns with P8).

**G8 — The "Rather email?" sentence is omitted** until an address exists. No literal brackets on a
live screen.

**Stage B note.** On a company with no declared base, each W2 item renders the outside side with the
none-yet state — the same shape as who-you-serve.

## Home rulings (Nov 9)

Rulings N1–N10, signed Nov 9 2026 by the council review of the Diagnose home. These strings are as
signed as the body above; `{company}` is `companies.name` and `{n}` / `{m}` / `{a}` / `{b}` / `{g}` /
`{h}` / `{u}` are computed. N1–N8 and N10 are build rulings; N9 is the read-only investigation whose
answer N2 and N3 depend on, recorded under **Stage A finding** below.

**N1 — Zone definitions,** shown on hover/focus of each zone label:

- Possible — "Every condition this route depends on is still untested."
- Plausible — "At least one condition has evidence from documents, interviews or the outside read."
- Probable — "Where {company} lands if what is underway keeps going and nothing else changes."

Until today's value and trend exist (P7), the Probable zone is empty and shows
"Needs today's number and its trend."
The goal is a separate marker (amber), not a ring, empty until chosen; its signed label stays.
Ring nesting: Possible outermost ⊃ Plausible ⊃ Probable.

**N2 — Route position from data only.** Zone by condition evidence (N9); within a zone, ordered by
count of conditions with evidence; nothing placed by layout. Rollover shows
"{n} of {m} conditions have evidence"
and lists the conditions. If N9 finds no per-condition evidence, every route sits in Possible with
n = 0.

**N3 — No line claims underway until P8.** Generated route ideas render as faint dashed lines; legend
label "Ideas from the outside read". The "Lines: what {company} already has underway…" legend (G7) is
withdrawn. W7 renders its signed empty state ("Nothing underway right now") until P8 marks
{company}'s own initiatives; W7's list of generated routes is removed.

**N4 — Keep the cone.** Routes end at the mouth inside their zone ring; line length carries no
meaning and gets no ticks.

**N5 — Remove the bottom scrubber.** Before / Today / Ahead is the only control.

**N6 — See all** opens the dark overlay per the canvas (A-SeeAll) with signed strings A1–A3. Cards
whose pages are not built render their state and are disabled; Today and Base-relevant cards that
have a destination link to it.

**N7 — In focus rows** are one sentence each, state then next, every count computed (G2
singular/plural and G3 zero rules apply):

- Documents — "{n} in. {a} have added to the map."
- Interviews — "{h} heard. {u} still need a name."
- Base — "{b} of 4 parts have both sides."
- Goals — "{g} on the table. {company} chooses at the end of Diagnose."
- Market — "{m} groups named. {company} chooses one last."

**N8 — Legends as swatches.** In focus — white filled square "Underway", green filled square
"Needs {company}", dashed square "Not yet". Cone — dashed faint line "Ideas from the outside read",
amber marker "{company}'s goal", and the three zone rings by name.

**N9 — Per-condition evidence** is the fact N2's zone and N3's dashing rest on: where, if anywhere,
evidence is keyed to an individual `what_would_have_to_be_true` condition, and whether any route-level
route is a client initiative rather than a generated route idea.

**N10 — Rollover card position.** On mouse hover the card sits beside the pointer (offset 16px, flips
to stay on-screen, follows the pointer along the line); on keyboard focus it sits beside the end dot.
One card at a time.

### Stage A finding (read-only, 2026-11-09)

Ids and counts only. Three places key a record to an individual condition; only one is built to hold
evidence, and that column is empty in every row that exists.

- `check_outcomes` — the per-condition table, keyed by `subject_identity` (sha256 of the condition
  text, company-wide) + `check_kind` + `check_version`, carrying `evidence_refs[]`, `note`,
  `recorded_by`. Fleet-wide: **3 rows**, all Edgewood, all recorded 2026-09-12, `evidence_refs`
  **empty in all 3**, `recorded_by` NULL in all 3. One live `condition_check`/`satisfied` (route
  `cf5a043d`); two `leg_test` rows on the same identity. `check_outcome_removals`: 0 rows.
- `condition_removals` — keyed `route_id` + `condition_identity` (sha256). Edgewood 22, Wasabi 0. A
  removal log, not evidence.
- `routes.what_would_have_to_be_true[]` — per element: `condition`, `satisfied_flag` (all 69 across
  both companies), `checked_at` (2), `leg_class`, `source` (28 — a producer stamp
  `generate-route-conditions:<date>`, not an evidence id). The optional `evidence_refs?` the TS types
  declare is present on **0 conditions in the database**.

`routes.evidence_state` is `partial` on all 15 route-level routes of both companies and
`validation_state` is `unvalidated` on 14 (`directional` on `cf5a043d`): route-level, identical
across the set, and therefore unusable as a zone key. `routes.evidence_json` items are
`{id, status, title}` with **no id that is a uuid** (59 items) and no condition key.
`evidence_baseline_signal_ids` is set on 2 Edgewood routes only — 204 signal uuids each, byte-identical
arrays captured the same day: a whole-company snapshot, not per-condition. `route_decision_events`
(Edgewood 7) never mentions a condition. There is no `legs` table — legs are `routes` rows with
`level='leg'`.

**Answer to N2:** no document, interview, signal or outside-read row is linked to any individual
condition anywhere in the database. Edgewood route-level: 7 routes, 29 conditions, **0** with an
evidence link. Wasabi: 8 routes, 13 conditions, **0**. Every route sits in Possible with n = 0.

**Answer to N3:** all 7 Edgewood and all 8 Wasabi route-level routes carry
`provenance_type = public_research` with no document link (`source_file_ids` empty on all 15), no
claim, and no intake row (both companies have **0** `intake_responses`, and that table has no
route-referencing column). Fleet-wide, **0** routes carry `client_attested`, `internal_declared`,
`manual`, `odi_survey`, `framework_adjudicated` or `market_interviewed`. Two Edgewood routes carry
`source='manual_inline'` with an `operator_edited_at` — an inline text edit, not a claim of
ownership. Nothing in the data says any line is underway or is {company}'s own.

## Home rulings, round 2 (Nov 9) — O1–O3

Rulings O1–O3, signed Nov 9 2026 after the Stage A report. O1 and O2 amend N2; O3 supplies the
strings N6 referred to.

**O1 — Strict.** A `satisfied_flag`, or a `check_outcomes` row with no `evidence_refs`, is **not
evidence**. Every Edgewood and Wasabi route sits in Possible with n = 0; Plausible is empty in slice
1. Filed, not fixed: `satisfied_flag` set with no evidence attached (route `cf5a043d`) — a read-only
look later.

**O2 — Replaces N2's within-zone order.** When the routes in a zone do not differ by evidence count,
they render as ONE faint dashed band ending inside that zone's ring, labelled:

- "{n} ideas from the outside read · none tested yet"
- "1 idea from the outside read · not tested yet" (G2 singular)

Hover or focus on the band shows the card (N10 positioning) listing the route titles, one per line,
sorted by title. When evidence counts differ, the routes separate into individual lines ordered by
count.

**O3 — See all overlay** (the N6 canvas, A-SeeAll). Title "Open anything to see it or work on it."
Lede "Each card says where it stands today." Opens from ☰ See all in the bottom bar; closes on ×,
Escape, or a link. Dark ink background, square cards per the shape law. Only "Today" and "The long
map" link; every other card is disabled, not focusable as a link, with its state shown. New signed
string: "Not built yet."

## See all (Nov 9)

Groups and cards — title — description — state.

**Now**

- Today — "The map at Today: the next step, the three outcomes, what's in focus." — "Open" (→ Home,
  highlighted as current)
- What changed — "Everything that landed since the last visit." — "Not built yet."

**Map · {company}'s base**

- Base — "Promise · positioning · strategy · who {company} serves." — "{b} of 4 parts have both
  sides" (computed)
- Voices — "Where the documents, the outside read and the people heard agree, and where there's a gap."
  — "After interviews"
- Problem · goal · market, reframed — "What came in, tested, and a sharper version." — "After
  interviews"

**Map · the choices**

- Goals — "Every goal on the table, each with where it starts today." — "{g} on the table"
- Market — "Every group named, each with what it is trying to get done." — "{m} groups named"
- Needs — "What each group needs, step by step." — "Not built yet."
- The long map — "Before, today, and what could come." — "Open" (→ Home, scrolled to Before)

**Add**

- Documents — "Plans, decks, research, numbers." — "{n} in"
- Interviews — "Who should be heard, and who has been." — "{h} heard · {u} still need a name"
  (G3 drops zero segments)

**Dojo**

- How MojoMap™ works — "The phases, the map, and what moves the score." — "Not built yet."
- The Dojo — "Short walks through how each part works." — "Not designed yet"

### Singulars formed for N7 and N8 (the three for N7 were signed by R4)

N7 says the G2 singular/plural rule applies, and three of its sentences have no signed singular. The
forms used, each the minimal grammatical singular of the signed plural:

- "1 has added to the map." (plural "{a} have added to the map.")
- "1 of 4 parts has both sides." (plural "{b} of 4 parts have both sides.")
- "1 idea from the outside read · not tested yet" — signed by O2.

N8's In-focus swatch labels reuse signed strings where they exist ("Needs {company}", "Not yet"); the
white swatch needs one word that was not signed: "Underway". It is the lifecycle word the spec
already uses in W7's pattern and in the withdrawn G7 legend.

## Home rulings, round 3 (Nov 9) — R1–R5

**R1 — See all overlay, Lovable's layout.** A translucent dark scrim over the page (the page stays
visible, dimmed), not an opaque panel. Title "Open anything to see it or work on it." at 52px with
the green dot; × top right. FOUR columns, equal width, gap ~36px. A mono 11px group label with a
hairline under it. Cards: hairline border, ~24px padding, title 22px bold, one-line description
16px, state in mono 12px uppercase dot-green; 18px between cards. The current card ("Today") takes
the dot-green 2px border and a tinted fill. Square corners (shape law). It must fit 1440×900 with no
scroll.

**R2 — The four columns.**

1. **Now** — Today · What changed
2. **Map · {company}'s base** — Base · Voices · Problem · goal · market, reframed
3. **Map · the choices** — Goals · Market · Needs · The long map
4. **Add & learn** — Documents · Interviews · The Dojo · How MojoMap™ works

New signed group label: "Add & learn". All card strings and states stay as O3 signs them.

**R3 — G3 as applied.** A row's first segment always renders, including "0 in"; only the second
segment drops at zero.

**R4 — Signed singulars.**

- "1 has added to the map."
- "1 of 4 parts has both sides."
- "1 in."

**R5 — The K5 shaded wedge is withdrawn.** It drew a corridor to a goal nobody has chosen. It
returns when a goal is chosen. Its tests go with it, and a test asserts that no wedge renders while
no goal is chosen.
