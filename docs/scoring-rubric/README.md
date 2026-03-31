# Scoring Rubric Versioning

This folder versions the Notion-facing scoring rubric separately from implementation code.

Current phase is proving/pre-release, so versions remain in 0.x until the model is fully validated.

## Guiding principles
- Clarity first: scoring logic and labels should be easy to understand without consulting jargon.
- Evidence over opinion: prefer observed evidence and traceable signals over assumptions.
- Actionable outputs: each score component should point to a practical next improvement.
- Comparable and stable: formulas should be consistent across companies and over time.
- Transparent tradeoffs: document what the rubric rewards and what it penalizes.

## Current version
- See `VERSION.json`.

## Files
- `VERSION.json`: current active rubric version metadata.
- `CHANGELOG.md`: human-readable release notes.
- `versions/<version>.md`: immutable snapshot of rubric formulas/rules for that release.
- `artifacts/notion/mojo_scoring_database_template.csv`: import template for Notion.
- `artifacts/notion/mojo_scoring_formula_map.csv`: formula registry for Notion formula properties.

## Versioning policy (SemVer)
- MAJOR: reserved for post-1.0 stable releases.
- MINOR: substantial proving-stage rubric changes (still within 0.x).
- PATCH: proving-stage documentation/schema clarity updates with no formula behavior change.

## Release checklist
1. Update formulas/templates.
2. Create new snapshot in `versions/`.
3. Update `VERSION.json`.
4. Append release note in `CHANGELOG.md`.
5. Reference source code lines used for verification.
