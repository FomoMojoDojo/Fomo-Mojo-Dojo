// DIAGNOSE RUN SELECTION (DF7, signed 2026-10-01) — the latest run BY DATE, and nothing else.
//
// THE LAW. Diagnose binds the newest successful run by date and shows that date. It never uses
// preferredRun or pickPreferredRun (usePublicBaseline.ts:40) — the quality heuristic that can return
// an OLDER run when the newest scores more than 6 points worse. The fact report found Edgewood
// hitting exactly that: its newest run (2026-09-11, quality 143) loses to a 2026-07-24 run (quality
// 153), so every surface bound to preferredRun shows evidence 49 days stale. Diagnose does not.
//
// ORDERING IS BY FULL TIMESTAMP, NOT BY DATE. The John C Mithun Foundation (641d1f62) holds an 'ok'
// run at 2026-09-18 01:17:22 and a 'search_unavailable' run at 2026-09-18 00:47:29 — the SAME
// calendar day. A date-granularity comparison ties, and a tie resolved either way is a coin flip
// about whether that company sees an outage line. created_at ordering answers it: the ok run is
// newer, so no outage line.
//
// STATUSES FOUND FLEET-WIDE (census 2026-10-01): 'ok' (62 runs / 21 companies),
// 'search_unavailable' (5 / 2), 'insufficient_public_evidence' (1 / 1). Anything that is neither
// 'ok' nor 'search_unavailable' is NEITHER an evidence run nor an outage: it is a completed read
// that found too little, which is a finding about the company, not a failure of the search and not
// evidence to bind to.

/** A public_baseline_runs row, reduced to what selection needs. */
export type BaselineRun = {
  readonly id: string;
  /** ISO timestamp. Ordering is on this, never on a date-only derivative. */
  readonly created_at: string;
  /** result_json.status. Null/absent is possible and is treated as "any other status". */
  readonly status: string | null | undefined;
};

export type LatestRunSelection = {
  /** The newest run whose status is 'ok'. Null when the company has never had one. */
  readonly evidenceRun: BaselineRun | null;
  /** evidenceRun.created_at, surfaced separately because DF7 requires the date to be shown. */
  readonly evidenceDate: string | null;
  /** The newest 'search_unavailable' run, ONLY when it is newer than evidenceRun. Else null. */
  readonly outageRun: BaselineRun | null;
};

export const STATUS_OK = "ok";
export const STATUS_SEARCH_UNAVAILABLE = "search_unavailable";

function timeOf(run: BaselineRun): number {
  const t = new Date(run.created_at).getTime();
  return Number.isNaN(t) ? Number.NEGATIVE_INFINITY : t;
}

/** Newest first, by full timestamp. A run with an unparseable created_at sorts last — it can never
 *  win selection on a bad date. */
function newestFirst(runs: readonly BaselineRun[]): BaselineRun[] {
  return [...runs].sort((a, b) => timeOf(b) - timeOf(a));
}

/**
 * Select the evidence run and, if one is pending over it, the outage run.
 *
 * NO EVIDENCE RUN AT ALL (unspecified by DF7, decided here and flagged in the report): when a
 * company has never had an 'ok' run, an outage run IS returned. There is nothing for it to be newer
 * than, and the alternative — suppressing it — would leave a company whose only reads all failed
 * showing no evidence and no explanation, which is the exact silence CV4 exists to prevent.
 */
export function selectLatestRuns(runs: readonly BaselineRun[]): LatestRunSelection {
  const ordered = newestFirst(runs);
  const evidenceRun = ordered.find((r) => String(r.status ?? "") === STATUS_OK) ?? null;
  const newestOutage = ordered.find((r) => String(r.status ?? "") === STATUS_SEARCH_UNAVAILABLE) ?? null;

  let outageRun: BaselineRun | null = null;
  if (newestOutage) {
    // Strictly newer. An outage at the same instant as the evidence run does not override it.
    outageRun = evidenceRun === null || timeOf(newestOutage) > timeOf(evidenceRun) ? newestOutage : null;
  }

  return {
    evidenceRun,
    evidenceDate: evidenceRun ? evidenceRun.created_at : null,
    outageRun,
  };
}

/** Statuses that are neither evidence nor outage, for the run ledger / report. */
export function otherStatuses(runs: readonly BaselineRun[]): string[] {
  const seen = new Set<string>();
  for (const r of runs) {
    const s = String(r.status ?? "(null/missing)");
    if (s !== STATUS_OK && s !== STATUS_SEARCH_UNAVAILABLE) seen.add(s);
  }
  return [...seen].sort();
}
