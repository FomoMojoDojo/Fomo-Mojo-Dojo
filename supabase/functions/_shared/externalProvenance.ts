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

// ── Subject partition (LOCAL LANE, 2026-06-18) ────────────────────────────────
// Every subject surface carries a provenance_type from this enum (or NULL). The
// six enum values, single-sourced here so the partition below is provably total.
export const PROVENANCE_TYPE_ENUM = [
  "public_research",
  "framework_adjudicated",
  "odi_survey",
  "manual",
  "internal_declared",
  "internal_hypothesis",
] as const;

// `public_baseline` is in EXTERNAL_ADMISSIBLE_PROVENANCE but is a strategy
// artifact_role / public_baselines concept — it is NOT a member of
// provenance_type_enum, so it never appears as a SUBJECT provenance and is
// excluded from this subject partition. On the gated subject tables the only
// external-admissible enum value is `public_research`.
export const EXTERNAL_ADMISSIBLE_ON_ENUM = PROVENANCE_TYPE_ENUM.filter((p) =>
  EXTERNAL_ADMISSIBLE_PROVENANCE.has(p)
); // → ["public_research"]

// The local lane admits the EXACT enum complement of the external-admissible set,
// derived (not hand-listed) so the two can never silently diverge. NULL is admitted
// to local separately (it fails closed on the external side; the local lane is its
// home). Result: {framework_adjudicated, odi_survey, manual, internal_declared,
// internal_hypothesis}.
export const LOCAL_LANE_PROVENANCE = new Set(
  PROVENANCE_TYPE_ENUM.filter((p) => !EXTERNAL_ADMISSIBLE_PROVENANCE.has(p)),
);

export function isSubjectLocalAdmissible(
  provenance: string | null | undefined,
): boolean {
  // NULL → local (fail-closed external means local is its only lane). Any non-enum
  // / unknown value also falls to local (never external) — fail-closed.
  if (provenance == null) return true;
  return !EXTERNAL_ADMISSIBLE_PROVENANCE.has(String(provenance));
}
