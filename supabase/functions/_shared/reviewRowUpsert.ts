// REVIEW ROW UPSERT — pure (no Deno, no DB). Operator ruling 2026-09-04: re-crawling a page under a run that already
// holds its review row UPDATES the crawl-derived columns and PRESERVES the operator's decision columns. ONE column list
// drives both the pure semantics (vitest) and the runner's SQL (reviewUpsertSql), so they cannot drift.
export const REVIEW_UPDATABLE_COLUMNS = [
  "baseline_sha256", "baseline_status", "new_sha256", "fetch_status", "http_status", "fetch_path", "disposition",
  "dependent_signal_ids", "dependent_delta_ids", "anchor_present",
] as const;
export const REVIEW_DECISION_COLUMNS = ["operator_decision", "decided_at", "decided_by"] as const;
export const REVIEW_KEY_COLUMNS = ["company_id", "run_id", "source_url"] as const;

export type ReviewRowLike = Record<string, unknown> & { company_id: unknown; run_id: unknown; source_url: unknown };

/** In-memory semantics of the upsert: same key → update the updatable columns only; new key → insert with NULL decision. */
export function applyReviewUpsert<T extends ReviewRowLike>(existing: T[], incoming: ReviewRowLike): Array<T | ReviewRowLike> {
  const same = (r: ReviewRowLike) => REVIEW_KEY_COLUMNS.every((k) => r[k] === incoming[k]);
  const hit = existing.find(same);
  if (!hit) {
    const fresh: ReviewRowLike = { ...incoming };
    for (const c of REVIEW_DECISION_COLUMNS) fresh[c] = null;
    return [...existing, fresh];
  }
  const updated: ReviewRowLike = { ...hit };
  for (const c of REVIEW_UPDATABLE_COLUMNS) if (c in incoming) updated[c] = incoming[c];
  return existing.map((r) => (r === hit ? (updated as T) : r));
}

/** The runner's SQL tail: ON CONFLICT on the key → DO UPDATE SET every updatable column from EXCLUDED, nothing else. */
export function reviewUpsertSql(): string {
  const sets = REVIEW_UPDATABLE_COLUMNS.map((c) => `${c} = excluded.${c}`).join(", ");
  return `on conflict (company_id, run_id, source_url) do update set ${sets}`;
}
