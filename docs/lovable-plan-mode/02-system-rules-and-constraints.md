# System Rules And Constraints

## Architecture

- Frontend: Vite + React + TypeScript
- Backend: Supabase (Postgres + Edge Functions)
- Canonical scoring write path: `supabase/functions/research-company/index.ts`
- Shared scoring module: `src/lib/scoring/mojoScore.ts`

## Data provenance model

Use provenance across pages:

1. Public
- Publicly available sources.
- Useful but lower trust.

2. Company
- Client-provided docs and statements.
- Higher trust than public-only.

3. Evidence
- Primary market evidence (interviews/surveys/field validation).
- Must not be inferred from public content alone.

4. Implemented & Tested
- Change was implemented and measured in practice.

## Non-negotiables

- No cross-company leakage of content, maps, or suggestions.
- Job maps and suggestions must be company/market-specific.
- If uncertain, label as unresolved instead of fabricating precision.
- Keep fallback behavior safe when evidence is sparse.

## Scoring expectations

- Early state should commonly land low (roughly 10-20 range unless evidence is strong).
- Use weakest-link behavior for gates.
- Evidence quality can suppress otherwise optimistic outputs.
- Any score change should be explainable from traceable inputs/evidence.

## UX safety rules

- Do not break existing routes/pages.
- Additive prototype changes should be isolated to new routes/pages when requested.
- Keep UI resilient when no company is selected or data is missing.
