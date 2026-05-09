# Evidence Architecture

This document freezes the current evidence substrate as the canonical base layer for MojoMap reasoning.

Current scope:
- `signals`
- evidence statements
- `claims`
- `claim_signal_refs`
- `object_dependencies`
- `artifact_versions`
- `strategic_events`

Out of scope for this layer:
- assumptions
- validation evidence
- route confidence
- MojoScore recalculation
- council delta reasoning
- scoped rerun orchestration

## Core Object Model

### `signals`
Durable evidence rows stored in Supabase.

Purpose:
- preserve raw source evidence
- preserve source metadata
- preserve signal band and evidence type
- remain traceable even when no claim is created

Key fields:
- `signal_band`: `outside | organization | customer`
- `source_type`
- `evidence_type`
- `claim_text`
- `evidence_excerpt`
- `topic`
- `framework`
- `directness`
- `framing_fit`
- `structure_level`
- `validation_status`
- `confidence_to_use`
- `raw_payload`

Rule:
- a signal can remain useful even if it never becomes a claim

### Evidence Statements
Evidence statements are a derived mapper layer, not a database table.

Purpose:
- convert raw organization and customer evidence into short, reusable observations before claim insertion

Current behavior:
- generated in `src/lib/evidenceMappers.ts`
- derived from a single signal
- short, declarative, and evidence-backed
- suppressed if too raw, too generic, too meta, or too presentation-shaped

Traceability:
- claim
  -> evidence statement
  -> signal
  -> original source metadata and excerpt

### `claims`
Canonical reusable evidence statements stored in Supabase.

Purpose:
- act as the triangulation layer
- aggregate support across multiple signals
- provide the stable support unit used by provenance

Key fields:
- `statement`
- `topic`
- `claim_type`
- `outside_support_count`
- `organization_support_count`
- `customer_support_count`
- `triangulation_state`
- `confidence`
- `revalidation_flag`
- `raw_payload`

Rule:
- claims should read like strategic observations, not recommendations or source snippets

### `claim_signal_refs`
Links from claims back to supporting or contradicting signals.

Relationships:
- `supports`
- `contradicts`
- `qualifies`

Purpose:
- preserve exact provenance
- preserve support shape
- preserve contradictions without flattening them into a single confidence number

### `object_dependencies`
Graph edges between strategic objects.

Current minimum usage:
- `claim -> job_step`
- `job_step -> odi_need`
- direct `claim -> odi_need` only when the match is strong enough

Dependency types currently used in this layer:
- `supports`
- `derives`
- `contradicts`

Purpose:
- make provenance traversable
- make downstream review state possible

### `artifact_versions`
Snapshots of prior artifact state before regeneration.

Current usage:
- job map regeneration snapshots prior `job_steps`

Purpose:
- preserve previous state before replacement
- support later restore behavior

### `strategic_events`
Operational event log for strategic objects.

Current usage:
- job map regenerated
- job step created / updated / deleted / refreshed
- downstream artifacts marked stale or reviewed

Purpose:
- explain what changed
- explain why review state exists
- support review state, change banners, and future delta reasoning

## Evidence Flow

Canonical flow:

`signal`
-> evidence statement
-> claim
-> dependency graph
-> provenance UI

Write paths:
- `public-baseline`
  -> outside signals
- Dify file / proposal analysis
  -> organization or customer signals
- `mapSignalsToClaimCandidates(...)`
  -> evidence-statement synthesis
  -> canonicalized claims
- dependency rebuild
  -> `claim -> job_step`
  -> `job_step -> odi_need`
- provenance UI
  -> job step and need inspection

Important detail:
- evidence statements are generated before claim insertion
- claims do not derive directly from raw excerpts anymore

## Architectural Principles

### Dify assists inference, not state ownership
Dify can produce summaries, contradictions, and extracted evidence, but MojoMap owns:
- durable signals
- claims
- dependency graph
- strategic events

### Claims are the triangulation layer
Signals are raw evidence units.
Claims are the reusable unit where support shape is aggregated.

### Empty provenance is preferable to false support
If support is weak or semantically loose, the system should show no claim rather than a misleading one.

### Downstream artifacts should be marked stale, not auto-rewritten
Job map changes should mark linked needs `needs_review`.
They should not silently rewrite needs or routes.

### Provenance must remain inspectable and traceable
Users must be able to inspect:
- supporting claims
- supporting signals
- contradictions
- source metadata

### Customer-backed support should be conservative
Customer-backed status should not be inferred from generic phrasing or bracketed labels.
It should come from real customer-band signal support.

### Contradictions should be preserved, not flattened
Conflicting evidence should remain visible through:
- contradicted signals
- contradicted claim refs
- contradicted dependency edges where relevant

## Claim Quality Rules

### What becomes a claim
A signal can become a claim only if the synthesized evidence statement is:
- concise
- declarative
- strategically meaningful
- reusable
- evidence-backed

Examples:
- `Cafe operators report inconsistent roast quality across batches.`
- `Reliability concerns appear tied to repeat purchasing confidence.`
- `Partnership support currently depends on hands-on service and documentation.`

### What remains only a signal
Keep the evidence as a signal only if it is:
- a raw excerpt
- source metadata
- a question
- a page-title fragment
- a nav/footer snippet
- a feature list with no diagnostic meaning
- model-analysis commentary
- vague strategy language
- a fake validation label

### Suppression Rules
Current suppression behavior filters out:
- page metadata declarations
- generic scraped headers
- nav/footer/profile snippets
- `question`-framework rows
- meta-analysis phrases
- status/evaluation language
- bracketed validation labels
- generic imperatives
- repeated low-value outside descriptions
- claims longer than `160` characters

### Canonicalization Rules
Current canonicalization does all of the following before claim insertion:
- normalize whitespace
- strip boilerplate prefixes
- normalize for duplicate matching
- reject obvious generic phrases
- collapse repeated named-program claims
- rewrite first-person anecdotes into third-person observations
- rewrite some feature dumps into one concise differentiation observation

### Evidence-Statement Synthesis Rules
Current synthesis aims for:
- one sentence
- short and reusable phrasing
- observable pattern, failure, tension, or recurring need

Preferred language:
- `appears`
- `reports`
- `describes`
- `relies on`
- `is creating`
- `is tied to`

Avoid:
- recommendations
- consultant phrasing
- abstract strategic filler
- implementation language

## Dependency Rules

### `claim -> job_step`
Only create this edge when:
- the claim topic is compatible with a job-step explanation
- the wording is semantically relevant to the specific step
- the score clears the conservative matcher

Do not link:
- broad market claims
- loose positioning claims
- route claims
- unrelated complaints

### `job_step -> odi_need`
This is the structural backbone for need provenance.

Current rule:
- link by `journey_key + step_number`

This is intentionally simple and reliable.

### Direct `claim -> odi_need`
Use sparingly.

Current rule:
- only certain claim types are eligible
- need text must align strongly enough
- if uncertain, do not create the direct edge

### Contradiction Handling
Only preserve contradictions that describe a real conflict.

Accept:
- opposing observations
- `conflicts with`
- `cannot both be true`
- equivalent real conflict structures

Reject:
- confidence/status commentary
- meta-analysis fragments
- fake contradiction labels

## Review-State Flow

Current vertical slice:

job map regeneration
-> snapshot prior `job_steps`
-> write top-level `job_map` regeneration event
-> write refreshed `job_steps`
-> write per-step events
-> rebuild `claim -> job_step` and `job_step -> odi_need` dependencies
-> mark linked `odi_needs` as `needs_review`
-> user reviews a need
-> write `refreshed` strategic event

Review-state rules:
- review does not rewrite need text
- review does not change evidence
- review only acknowledges that the current need is still usable

## Current Known Limitations

- customer evidence is still sparse in several companies
- route graph is not expanded yet
- no assumption or validation-evidence layer yet
- no council delta layer yet
- no route confidence propagation yet
- some provenance panels may correctly show no supporting claims

These are known limitations, not bugs in the current substrate.

## Future Extension Points

Do not implement these on top of ad hoc logic. Build them on this substrate.

Planned later layers:
- validation evidence
- assumptions
- route confidence
- MojoScore integration
- council delta reasoning
- scoped reruns

Design rule:
- extend from claims, dependencies, events, and versions
- do not bypass the substrate with direct AI output writes

## Canonical Files

Core domain:
- `src/lib/evidenceDomain.ts`
- `src/lib/strategicGraphDomain.ts`

Evidence synthesis and matching:
- `src/lib/evidenceMappers.ts`

Evidence persistence:
- `supabase/functions/_shared/evidencePhase1.ts`

Strategic graph and review-state helpers:
- `supabase/functions/_shared/strategicGraph.ts`
- `supabase/functions/_shared/jobMapRegeneration.ts`

Inspection UI:
- job-step and need provenance panels consume claims, signals, refs, and dependencies

## Lightweight Test Coverage

Current stabilization tests should lock the following behaviors:
- evidence suppression
- claim canonicalization
- contradiction filtering
- conservative dependency matching

These tests belong at the mapper layer because that is where the current substrate is shaped.
