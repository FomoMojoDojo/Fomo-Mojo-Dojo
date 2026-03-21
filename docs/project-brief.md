# Project Brief

This document is the working context brief for the `happy-file-hugger-main` app.

Its purpose is simple: when chat context is lost, this file should provide enough shared understanding to resume work without re-explaining the whole product.

## Product summary

This app is a strategy operating system for consulting engagements.

At a high level, a user selects or creates a company, the system gathers outside-in public evidence, generates structured strategy artifacts, stores them in Supabase, and uses them to support deeper analysis and consulting work.

The software is not just a generic AI dashboard. It is trying to encode a specific consulting methodology into a repeatable workflow and data model.

## Business thesis

Most strategic initiatives fail not because the strategy is inherently poor, but because organizations do not know:

- what is missing
- what is unverified
- where to focus next

MojoMap is intended to solve that problem with an interactive success prediction engine that answers two questions:

1. What is the real-time likelihood of this initiative succeeding?
2. What is the exact path to maximize its success?

The score is not the end product. The score is the diagnostic device that reveals gaps, creates urgency, and points to the highest-value next actions.

## Client promise

The product promise is not "here is an AI summary."

The promise is:

- a candid, data-driven assessment of strategic health
- an intentionally conservative initial score
- a visible path from that low score toward high-confidence execution

The current intended arc is from an intentionally low starting score, often around `30-45%`, toward a target state around `95%` once the strategy is supported by stronger evidence, customer validation, and execution clarity.

This is important because it means the conservative scoring behavior in the code is a product feature, not a bug.

## Business model

MojoMap operates as a productized service with a three-phase client journey:

1. Attract

- free assessment

2. Engage

- paid strategy session

3. Deepen

- ongoing retainer

This means the software is not just an internal tool. It is also part of a client acquisition, conversion, and expansion model.

## Score model

The score model is tiered by evidence depth.

### Tier 1: Public data

Sources include:

- website
- LinkedIn
- press
- financials

This tier tops out around `40%`.

### Tier 2: Client-provided data

Sources include:

- strategic plans
- internal research
- org charts

This tier tops out around `70%`.

### Tier 3: Market-validated data

Sources include:

- customer interviews
- surveys
- opportunity mapping

This tier tops out around `95%`.

This tiering aligns closely with the current architecture:

- `public-baseline` and `research-company` contribute to Tier 1
- uploaded files and internal analysis contribute to Tier 2
- ODI / interviews / surveys / opportunity mapping are the route to Tier 3

That connection between business thesis and technical architecture should be preserved in future work.

## Go-to-market

Current go-to-market assumptions:

- initial industry focus: B2B SaaS and Healthcare
- positioning: expert strategists using a proprietary tool, not a software company
- content strategy: industry job maps can be repurposed into LinkedIn posts, YouTube videos, and long-form articles

This matters because the app should support expert-led delivery and trust-building content, not just self-serve product behavior.

## Core product idea

The product turns evidence into a living company map.

That map currently includes:

- public baseline research
- strategy inputs
- journeys / job steps
- opportunities
- routes
- deep-dive analyses
- uploaded files and internal evidence

The app blends software, AI-assisted research, and named strategic frameworks so a strategist can move from raw evidence to prioritized action.

## Privacy boundary

The app has two AI lanes:

1. Public AI lane

- `public-baseline`
- `research-company`

These functions use public web and company-site evidence and send prompts to OpenAI.

2. Internal AI lane

- `analyze-file`
- `generate-deep-dive`

These functions are intended to use the local Ollama endpoint for uploaded client evidence and internal notes.

This split is important to the product. Public evidence may be processed by hosted models, while internal client material should remain in the local/private path.

## Current architecture

### Frontend

The frontend is a React + Vite + TypeScript app with route-based workspace views.

Main app routes live in `src/App.tsx` and include:

- map view
- inputs
- files
- job steps
- strategy
- opportunities
- positioning
- analytics
- routes
- admin dashboard and company management
- methodology / process pages

### Backend

The backend uses Supabase with:

- database tables and migrations
- edge functions
- auth-aware client access

The two main orchestration functions are:

#### `supabase/functions/public-baseline/index.ts`

This function:

- accepts `company_id`, `company_name`, and `website`
- runs public web search
- scores and filters sources by company/domain relevance
- extracts evidence text
- asks OpenAI for structured baseline output
- returns explicit low-confidence states when evidence is thin or ambiguous

Its role is to create a credible outside-in baseline before deeper strategy generation.

#### `supabase/functions/research-company/index.ts`

This function:

- fetches the latest saved public baseline for the company
- generates structured strategy artifacts
- writes those artifacts into Supabase
- writes conservative company scoring values based on evidence quality and artifact coverage

It is effectively the main strategy artifact generator.

## Current generated artifacts

`research-company` currently generates and persists:

1. Inputs

- exactly 14 strategy inputs
- fixed input keys
- deterministic grouping into `foundation`, `execution`, and `market_evidence`

2. Journeys

- 3 journeys:
  - customer
  - revenue
  - operations

3. Opportunities

- 15 to 30 opportunity records
- tied to journey steps
- scored with importance, satisfaction, and opportunity score logic

4. Routes

- 9 to 18 routes
- categories: `fix`, `improve`, `create`
- meant to represent coherent strategic workstreams rather than raw issues

5. ODI records

- `odi_market_definitions`
- `odi_needs`

These are derived from the baseline and generated opportunities and move the product toward a stronger Jobs-to-be-Done / ODI model.

## Framework layer

The app now includes a reusable framework library in `supabase/functions/_shared/frameworkLibrary.ts`.

Current frameworks include:

- ODI / Jobs-to-be-Done
- April Dunford positioning
- Teresa Torres opportunity mapping
- Heath Brothers
- strategy cascade
- house/orchestration methods

This framework layer exists so the system can:

- route generation through explicit strategic lenses
- persist `frameworks_used` on generated artifacts
- make output provenance inspectable later

This is an important product move. It means the app is not just generating text. It is trying to produce framework-shaped outputs with auditable lineage.

## Current scoring model

The company scoring model was refactored into a reusable shared module:

- `src/lib/scoring/mojoScore.ts`

The intended outputs are:

- `mojo_score`
- `potential_score`
- `projected_score`
- `evidence_status`
- `area_scores_json`

Important scoring rules:

- scoring is intentionally conservative
- weakest-link behavior matters more than simple averaging
- the model uses a weighted harmonic mean across strategic gates
- evidence quality can suppress the overall score even if artifacts exist
- early-stage companies should often land low rather than high

The current system combines:

- gate scoring across positioning, customer insight, strategy cascade, and go-to-market execution
- an evidence multiplier
- a calibration curve

The backend write path in `supabase/functions/research-company/index.ts` is the canonical source of truth. Frontend fallback scoring exists only to keep the UI stable when stored company scores are missing.

That fallback should never be treated as authoritative.

## First-class artifacts added recently

Two important strategic views were upgraded from inferred UI compositions into first-class generated artifacts.

### Strategy cascade

Table:

- `strategy_cascades`

Migration:

- `supabase/migrations/20260312120000_create_strategy_cascades_table.sql`

Frontend:

- `src/hooks/useStrategyCascade.ts`
- `src/views/Strategy/index.tsx`

Backend generation:

- `supabase/functions/research-company/index.ts`

The strategy page should now be thought of as a real generated artifact, not just a grouping of raw inputs.

### Positioning canvas

Table:

- `positioning_canvases`

Migration:

- `supabase/migrations/20260312133000_create_positioning_canvases_table.sql`

Frontend:

- `src/hooks/usePositioningCanvas.ts`
- `src/views/Positioning/index.tsx`

Backend generation:

- `supabase/functions/research-company/index.ts`

The positioning page should prefer stored `positioning_canvases` data. Any fallback to legacy input-derived positioning is a temporary compatibility path, not the desired steady state.

## ODI interpretation

The ODI layer currently uses only `needs`.

Important nuance:

- ODI importance, satisfaction, and opportunity values are currently inferred from public evidence and generated artifacts
- they are not validated ODI survey results
- the UI has been annotated to make this explicit

This means ODI values are directional placeholders for now, not market-validated truth.

## Accuracy and trust rules

A recurring product risk is showing plausible but wrong company-specific content.

Several cleanup passes were made specifically to reduce that risk:

- dangerous mock fallbacks were removed from `src/views/Inputs/index.tsx`
- dangerous mock fallbacks were removed from `src/views/DeepDive/DeepDivePanel.tsx`
- mock company fallback text was removed from `src/components/layout/TopNav.tsx`
- `src/pages/FilesRepository.tsx` no longer relies on mock client context
- route detail cards now explicitly say their steps, evidence gaps, and rationale are inferred from linked artifacts
- the map view explicitly distinguishes stored company scores from estimated fallback scores

The product rule going forward should be:

- if content is real and stored, present it plainly
- if content is inferred, label it as inferred
- if content is missing, show a clear empty state instead of believable placeholder company data

## Known caveats

These caveats are important when resuming work:

1. Positioning can still be wrong until research is rerun

- if a company does not yet have a `positioning_canvases` row, the positioning page may fall back to old input-derived content
- that fallback content may be stale or from earlier bad generations

2. Strategy cascade also requires regenerated data

- the page structure exists
- but companies need a stored `strategy_cascades` row to fully use the new artifact

3. Route details are still partially heuristic

- routes themselves are stored
- but route steps, evidence needed, and why-this-matters detail are currently derived from routes + opportunities + job steps
- there is not yet a dedicated route-detail schema

4. Map score fallback is non-authoritative

- if stored company scores are missing, the frontend computes a temporary estimate
- that estimate should not be treated as a final score

## Recent UI direction

The current visual direction is:

- lighter workspace background around `#faf7f6`
- white cards and surfaces
- sans-serif typography for primary UI
- brighter accent palette using:
  - `#233C4B`
  - `#FF7D2D`
  - `#FAC846`
  - `#A0C382`
  - `#5F9B8C`

Recent pages intentionally aligned to this system include:

- `src/views/MapView/index.tsx`
- `src/views/Strategy/index.tsx`
- `src/views/Positioning/index.tsx`
- `src/views/Routes/index.tsx`
- `src/pages/AdminCompanies.tsx`
- `src/pages/MojoMapPage.tsx`

## Recovery checklist if chat context is lost again

If a new session starts without prior context, use this order:

1. Read this file first
2. Check whether these migrations exist in the target database:
- `20260312120000_create_strategy_cascades_table.sql`
- `20260312133000_create_positioning_canvases_table.sql`
3. Confirm whether the company has rerun `AI Research` since those migrations were applied
4. Treat `research-company` as the canonical source for generated artifacts and stored company scores
5. Be suspicious of any page showing content without matching stored data

## Recommended next technical priorities

The most likely high-value follow-ups are:

1. Add a first-class route-detail artifact so route steps and evidence-needed are no longer heuristic
2. Reduce or eliminate legacy input-derived fallback logic on the positioning page once companies are regenerated
3. Keep replacing inferred display layers with stored artifacts where accuracy matters
4. Continue annotating anything estimated, inferred, or unvalidated

## Database direction

Recent migrations show the current direction clearly:

- `20260311223000_create_routes_table.sql`
  Adds the `routes` table.

- `20260312091000_add_frameworks_used_to_generated_artifacts.sql`
  Adds `frameworks_used` to generated artifacts.

- `20260312103000_create_odi_needs_tables.sql`
  Adds `odi_market_definitions` and `odi_needs`.

- `20260311234500_fix_deep_dive_company_scope.sql`
  Fixes deep-dive uniqueness so analyses are scoped by `user_id + company_id + area_key` instead of just `user_id + area_key`.

The data model is moving from a simpler score/map app toward a richer strategy workspace with provenance and structured opportunity logic.

## Current frontend state

The UI already reflects parts of this architecture:

### `src/pages/AdminCompanies.tsx`

This page currently supports:

- creating companies
- setting active company context
- running `public-baseline`
- running `research-company`
- running a combined baseline-then-research flow

This page appears to be the main orchestration surface for kicking off AI generation.

### `src/components/PublicBaselinePanel.tsx`

This panel currently displays:

- baseline status
- evidence quality
- category archetype
- economic engine
- top hypotheses
- open questions
- top evidence ledger items

This means public research is already being surfaced as a first-class product object, not just a hidden preprocessing step.

### `src/hooks/useOdiNeeds.ts`

This hook reads:

- `odi_market_definitions`
- `odi_needs`

That suggests ODI is becoming a real user-facing concept rather than a hidden backend-only experiment.

### `src/pages/MojoMapPage.tsx`

This page is especially important for product understanding.

It lays out the full consulting methodology as a visible process map across:

- diagnosis
- ODI
- strategy cascade
- positioning
- messaging
- flow / execution

The presence of this page suggests the product is intended to embody a named methodology, not merely host disconnected AI features.

## What is already working

At a practical level, these capabilities appear implemented:

- auth-aware company workspace
- admin company creation
- public baseline generation
- research-company generation
- persistence of inputs, job steps, opportunities, routes, and ODI records
- company score updates based on evidence plus coverage
- deep-dive company scoping fix
- clear privacy boundary between public and internal AI paths

## What still looks in progress

The codebase suggests several areas are still evolving:

1. Backend is ahead of frontend

The database and function layer now support routes, ODI records, and framework provenance, but the UI likely does not yet expose all of that with the same maturity.

2. Baseline ambiguity handling likely needs more UX

The backend can now return `ambiguous_public_evidence` and `insufficient_public_evidence`, but the surrounding interface may still assume a clean successful run too often.

3. Schema and runtime alignment should be verified

There is at least one fallback insert path in `research-company` for environments where `routes.frameworks_used` may not exist yet. That usually means migrations and runtime environments were briefly out of sync.

4. Local project copies are drifting

There are at least two copies of the project on disk:

- `/Users/fomomojodojo/dev/happy-file-hugger-main`
- `/Users/fomomojodojo/dev/happy-file-hugger-main`

The `Downloads` copy is ahead of the `dev` copy. This is a likely source of confusion and lost context.

## Best current product description

This app is a strategy operating system for consulting engagements that turns public research, internal evidence, and named strategic frameworks into a living company map of inputs, journeys, opportunities, routes, and deeper analysis.

## Recommended next steps

1. Verify the full end-to-end path:

- create company
- run public baseline
- run research-company
- confirm generated artifacts appear in the UI

2. Choose one canonical project directory and stop splitting work between `Downloads` and `dev`.

3. Improve the UX around:

- ambiguous baseline results
- ODI outputs
- routes
- framework provenance

4. Add a small operator-facing status or diagnostics view so failures in baseline/research are easier to inspect than raw toasts.

## Working assumptions

These are the assumptions this brief is based on:

- the active working copy is `/Users/fomomojodojo/dev/happy-file-hugger-main`
- the current product direction is toward a strategist workspace, not a generic AI file app
- public evidence and internal evidence are intentionally separated into different model paths
- ODI / JTBD is becoming a central organizing framework, not a side experiment

If any of those assumptions change, update this file first so future sessions do not have to reconstruct intent from scratch.
