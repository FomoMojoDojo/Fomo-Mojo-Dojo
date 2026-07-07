// SCORE-1 law: snapshotMojoScore (v1.1.0) is the SOLE writer of the companies
// score columns (mojo_score / potential_score / projected_score). Every other
// scorer output — the gate-based scoreCompanyMojo, the local-alignment delta —
// is a market calibration read: recorded in area_scores_json and
// research_artifact_runs, never written as the Mojo Score.
//
// Import-free on purpose so both Deno (edge functions, .ts-extension imports)
// and vitest (node) load it unchanged.

export const SCORE_COLUMNS = ["mojo_score", "potential_score", "projected_score"] as const;
export type ScoreColumn = (typeof SCORE_COLUMNS)[number];

/**
 * Strip the canonical score columns from a scorer result, leaving only the
 * calibration record (evidence fields, area_scores_json, …) that non-canonical
 * writers are allowed to persist onto companies.
 */
export function stripScoreColumns<T extends Record<string, unknown>>(scored: T): Omit<T, ScoreColumn> {
  const record = { ...scored } as Record<string, unknown>;
  for (const column of SCORE_COLUMNS) delete record[column];
  return record as Omit<T, ScoreColumn>;
}
