// Single-source external-admissible provenance (operator ruling, 2026-06-18).
//
// Law: anything in the system is INTERNAL — including operator-curated `manual`,
// generated `framework_adjudicated`, and `odi_survey` customer data. The only
// public action is crawling public data; internal content may be COMPARED against
// public but NEVER sent on an external (OpenAI) run, now or under a future hosted
// private model. So only PUBLIC-derived provenance may cross an external boundary.
//
// This set is the ONE authority consumed by BOTH driftExternalGate and
// strategyArtifactGate, so the two external gates can never silently diverge.
// NULL is not a member → fail-closed (unproven provenance never goes external).
export const EXTERNAL_ADMISSIBLE_PROVENANCE = new Set([
  "public_research",
  "public_baseline",
]);
