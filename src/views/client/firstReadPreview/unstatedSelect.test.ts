// Gate 5b — the beat's read of market_candidate_outcomes is version-aware.
//
// RED ON REVERT. Before 5b the hook read `outcome in (rejected_solution, rejected_buyer)` with no
// version — after a v2 re-fire a candidate would render BOTH its v1 and v2 rows, and a candidate
// that v2 ACCEPTED would still show its v1 rejection beside the numbered group it became.
import { describe, it, expect } from "vitest";
import { selectUnstatedRows } from "./unstatedSelect";
import { CRITERION_VERSION } from "../../../../supabase/functions/_shared/solutionAgnosticJudge.ts";

const row = (candidate_index: number, outcome: string, criterion_version: number | null, id = `${candidate_index}-v${criterion_version}`) =>
  ({ id, candidate_index, outcome, criterion_version });

describe("selectUnstatedRows (Gate 5b)", () => {
  it("(g5b) a v1 rejection with NO v2 ruling renders, marked stale", () => {
    const out = selectUnstatedRows([row(0, "rejected_solution", 1)]);
    expect(out.map((r) => [r.id, r.stale])).toEqual([["0-v1", true]]);
  });

  it("(g5b) once v2 has ruled, the v2 row renders and the v1 row is NOT duplicated", () => {
    const out = selectUnstatedRows([row(0, "rejected_solution", 1), row(0, "rejected_solution", 2)]);
    expect(out.map((r) => [r.id, r.stale])).toEqual([["0-v2", false]]);
  });

  it("(g5b) a v2 ACCEPT drops the candidate even though v1 rejected it", () => {
    const out = selectUnstatedRows([row(0, "rejected_solution", 1), row(0, "accepted", 2), row(1, "rejected_buyer", 1)]);
    expect(out.map((r) => [r.id, r.stale])).toEqual([["1-v1", true]]);
  });

  it("(g5b) non-rejections never render under any version; null version reads as v1", () => {
    const out = selectUnstatedRows([row(0, "deduped", null), row(1, "already_decided", 2), row(2, "error", 2)]);
    expect(out).toEqual([]);
  });

  it("(g5b) 'current' is the judge module's CRITERION_VERSION, never inferred from the rows", () => {
    expect(CRITERION_VERSION).toBe(2);
    // a v2-only manifest: current, not stale — the authority and the rows agree
    expect(selectUnstatedRows([row(0, "rejected_solution", 2)])[0].stale).toBe(false);
  });

  it("(g5b) an explicit currentVersion overrides the authority (the operator toggle's v1/v2 view)", () => {
    const out = selectUnstatedRows([row(0, "rejected_solution", 1)], 2);
    expect(out[0].stale).toBe(true);
    expect(selectUnstatedRows([row(0, "rejected_solution", 1)], 1)[0].stale).toBe(false);
  });
});
