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
// Version-RELATIVE fixtures (2026-09-22, criterion v3): "the current criterion" and "the one before it"
// are expressed against the authority, so only the deliberate tripwire below moves on the next bump.
const CUR = CRITERION_VERSION;
const PREV = CRITERION_VERSION - 1;

describe("selectUnstatedRows (Gate 5b)", () => {
  it("(g5b) a v1 rejection with NO v2 ruling renders, marked stale", () => {
    const out = selectUnstatedRows([row(0, "rejected_solution", 1)]);
    expect(out.map((r) => [r.id, r.stale])).toEqual([["0-v1", true]]);
  });

  it("(g5b) once the CURRENT criterion has ruled, its row renders and the older one is NOT duplicated", () => {
    const out = selectUnstatedRows([row(0, "rejected_solution", PREV), row(0, "rejected_solution", CUR)]);
    expect(out.map((r) => [r.id, r.stale])).toEqual([[`0-v${CUR}`, false]]);
  });

  it("(g5b) a CURRENT accept drops the candidate even though an older version rejected it", () => {
    const out = selectUnstatedRows([row(0, "rejected_solution", PREV), row(0, "accepted", CUR), row(1, "rejected_buyer", PREV)]);
    expect(out.map((r) => [r.id, r.stale])).toEqual([[`1-v${PREV}`, true]]);
  });

  // THE BUMP CONSEQUENCE, pinned (criterion v3, 2026-09-22). While a manifest has no ruling at the
  // CURRENT version, "the current ruling wins" cannot fire — so a candidate an OLDER version accepted
  // shows its older rejection again, and a current-version-less rejection reads stale. This is the
  // stale-but-honest design working, not a regression, and it is why a bump should be followed by a
  // re-fire. Fleet exposure when v3 landed: Geniant 1, Lumio 1, Riverlane 3 candidates; Edgewood 0.
  it("(g5b) with NO ruling at the current version, an older accept no longer suppresses its older rejection", () => {
    const out = selectUnstatedRows([row(0, "rejected_solution", PREV), row(0, "accepted", PREV), row(1, "rejected_buyer", PREV)]);
    expect(out.map((r) => [r.id, r.stale])).toEqual([[`0-v${PREV}`, true], [`1-v${PREV}`, true]]);
  });

  it("(g5b) non-rejections never render under any version; null version reads as v1", () => {
    const out = selectUnstatedRows([row(0, "deduped", null), row(1, "already_decided", 2), row(2, "error", 2)]);
    expect(out).toEqual([]);
  });

  it("(g5b) 'current' is the judge module's CRITERION_VERSION, never inferred from the rows", () => {
    // DELIBERATE TRIPWIRE: a literal, so a criterion bump cannot land without this test naming it and
    // the reader re-reading the consequence pinned above. Move it WITH the bump, never ahead of it.
    expect(CRITERION_VERSION).toBe(3);
    // a current-version-only manifest: current, not stale — the authority and the rows agree
    expect(selectUnstatedRows([row(0, "rejected_solution", CUR)])[0].stale).toBe(false);
  });

  it("(g5b) an explicit currentVersion overrides the authority (the operator toggle's older-version view)", () => {
    const out = selectUnstatedRows([row(0, "rejected_solution", 1)], 2);
    expect(out[0].stale).toBe(true);
    expect(selectUnstatedRows([row(0, "rejected_solution", 1)], 1)[0].stale).toBe(false);
  });
});
