// Gate 5b — VERSION-AWARE selection of the "other groups we saw" rows from market_candidate_outcomes.
//
// Per candidate index: the CURRENT criterion's ruling wins if one exists (a current non-rejection
// drops the candidate even if an older version rejected it — the current criterion has spoken); with
// no current ruling, the newest older rejection is shown STALE-BUT-HONEST, because a v1 rejection
// with no v2 ruling still explains an absence and the operator toggle says which criterion said so.
// "Current" is CRITERION_VERSION from the judge module — the single authority beside the prompt.
// It is NOT inferred from the rows: a manifest not yet re-fired under v2 carries only v1 rows, and
// those are exactly the ones that must read stale.
import { CRITERION_VERSION } from "../../../../supabase/functions/_shared/solutionAgnosticJudge.ts";

export type UnstatedOutcomeRow = {
  candidate_index: number;
  outcome: string;
  criterion_version: number | null;
};

const REJECTIONS = new Set(["rejected_solution", "rejected_buyer"]);
const ver = (r: UnstatedOutcomeRow) => Number(r.criterion_version ?? 1);

export function selectUnstatedRows<T extends UnstatedOutcomeRow>(rows: T[], currentVersion?: number): Array<T & { stale: boolean }> {
  const current = currentVersion ?? CRITERION_VERSION;
  const byIdx = new Map<number, T[]>();
  for (const r of rows) { const k = Number(r.candidate_index); byIdx.set(k, [...(byIdx.get(k) ?? []), r]); }
  const chosen: Array<T & { stale: boolean }> = [];
  for (const [, group] of [...byIdx.entries()].sort((a, b) => a[0] - b[0])) {
    const cur = group.find((r) => ver(r) === current);
    if (cur) {
      if (REJECTIONS.has(cur.outcome)) chosen.push({ ...cur, stale: false });
      continue;
    }
    const older = group.filter((r) => REJECTIONS.has(r.outcome)).sort((a, b) => ver(b) - ver(a))[0];
    if (older) chosen.push({ ...older, stale: true });
  }
  return chosen;
}
