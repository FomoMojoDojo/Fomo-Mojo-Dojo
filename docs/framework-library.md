# Framework Library

The framework library lives in `supabase/functions/_shared/frameworkLibrary.ts`.

It is designed to make strategic frameworks machine-usable for generation, scoring, and recommendation prompts instead of relying on the model's generic background knowledge.

## Structure

Each framework entry contains:

- `key`: stable identifier
- `name`: display name
- `sourceMode`: `public`, `internal`, or `hybrid`
- `summary`: short explanation of the framework
- `useCases`: which artifacts the framework should shape
- `concepts`: core ideas that should remain stable across outputs
- `heuristics`: practical decision rules for generation
- `scoringDimensions`: dimensions the framework implies for scoring
- `antiPatterns`: things the generator should avoid
- `evidencePreference`: what evidence is most useful for the framework
- `promptRules`: artifact-specific rules

## Current frameworks

- `odi`
- `april_dunford`
- `teresa_torres`
- `heath_brothers`
- `strategy_cascade`
- `sxd`
- `market_validation`
- `strategic_goal_cards`
- `positioning_first`
- `working_playbook`

## Framework classes

There are three practical classes in the library:

1. External frameworks

- `odi`
- `april_dunford`
- `teresa_torres`
- `heath_brothers`
- `strategy_cascade`

2. House methods

- `positioning_first`

3. Orchestration layer

- `working_playbook`

`working_playbook` is intentionally not just another framework entry in spirit. It acts as the top-level routing and sequencing layer for all major artifacts.

## Current usage

`research-company` currently injects framework guidance into:

- inputs
- journeys
- opportunities
- routes

It now uses an explicit routing plan rather than simple artifact matching, so framework order is deliberate.

It also persists `frameworks_used` on generated records in:

- `inputs`
- `job_steps`
- `opportunities`
- `routes`

This is the first layer of generation provenance and makes later auditing possible.

## Design intent

This library is meant to keep three concerns separate:

1. Evidence
   Public baseline, uploaded files, interviews, and notes establish what is true.

2. Framework interpretation
   The framework library defines how to interpret evidence and what patterns matter.

3. Output schema
   The function schema defines how to serialize the result into app data.

## How to add another framework

1. Add a new `FrameworkReference` entry.
2. Choose the correct `useCases`.
3. Write `promptRules` only for the artifacts the framework should shape.
4. Keep rules specific and behavioral; avoid long prose summaries.
5. Add scoring dimensions if the framework should later influence deterministic scoring.

## Routing plan

The library includes an artifact routing plan via `getFrameworkRoutingPlan(...)`.

This is where methodology order should live. For example:

- `working_playbook` first
- then house methods like `positioning_first`
- then supporting external frameworks

That means you can add more frameworks without losing control over precedence.

## Recommended next step

Move important scoring logic out of prompt-only behavior and into code where possible. For example:

- ODI opportunity scoring
- evidence confidence scoring
- positioning completeness scoring

The framework library should guide classification and interpretation, while formulas in code should produce stable scores.
