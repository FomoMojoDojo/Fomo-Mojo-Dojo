# Plan Mode Master Prompt (Lovable)

Use the uploaded context files to propose an implementation plan for MojoMap.

## What to optimize for

- Evidence-backed, market-specific outputs
- No cross-company leakage
- Clear next-step guidance over abstract scoring
- Reusable architecture across all markets
- Additive changes that do not break existing flows

## Planning requirements

1. Restate the problem in plain language.
2. Identify impacted areas (frontend, edge functions, DB, prompts, scoring, UX).
3. Provide a phased implementation plan:
- Phase A: safe UI/prototype changes
- Phase B: data and scoring consistency
- Phase C: validation and rollout
4. For each phase include:
- exact files to change
- risk level
- test plan
- rollback plan
5. Call out assumptions explicitly.
6. Highlight any places where evidence is currently weak or unknown.

## UX/content constraints

- Use clear, jargon-free language.
- Preserve direct company quotes where present.
- Keep provenance visible (Public / Company / Evidence / Implemented & Tested).

## Output format required

- Section 1: Summary
- Section 2: Proposed Plan (phased)
- Section 3: File-Level Change List
- Section 4: Risks + Mitigations
- Section 5: Validation Checklist
- Section 6: Open Questions (only if blocking)
