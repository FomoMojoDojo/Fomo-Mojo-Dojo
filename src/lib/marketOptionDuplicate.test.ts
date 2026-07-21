// MO-2b (c) — DUPLICATE-COLLAPSE CALIBRATION FIXTURES.
//
// The operator ruled two pairs, and both are permanent calibration:
//
//   COLLAPSE  "Direct care staff" — a TRUE duplicate. Same WHO, same job said
//             twice with different wording.
//   SURVIVE   "Families and caregivers of at-risk youth aged 5-26" — same WHO,
//             genuinely DIFFERENT jobs. This is breadth, and breadth on a
//             conversation surface is the point of the surface.
//
// The threshold is not a free parameter. If someone retunes it and the families
// pair starts collapsing, Act A silently loses a real reading — the exact
// failure this gate exists to prevent. This file fails first.
//
// A judge was considered and rejected: the fixtures separate by 4.4x
// (0.636 vs 0.143), which needs no model to tell apart, and a deterministic
// rule cannot drift between runs.

import { describe, expect, it } from "vitest";
import { jobSimilarity, DUPLICATE_THRESHOLD } from "../../supabase/functions/_shared/marketOptionSynthesis.ts";

const DIRECT_CARE_A = "seek better working conditions in youth mental health services";
const DIRECT_CARE_B = "Secure better working conditions in youth mental health settings.";
const FAMILIES_A = "Support young people in addressing their mental health needs";
const FAMILIES_B = "Ensure emotional well-being for young people.";

// Survivor rule (operator rule ii): lowest attempt wins, tie-break earliest
// created_at. An attempt-1 clean pass sits closer to what the evidence actually
// said than a coached rewrite does.
type Row = { id: string; attempt: number; createdAt: string };
const better = (a: Row, b: Row) =>
  a.attempt !== b.attempt ? (a.attempt < b.attempt ? a : b) : (a.createdAt <= b.createdAt ? a : b);

describe("MO-2b duplicate collapse — operator calibration fixtures", () => {
  it("COLLAPSES the direct-care pair (true duplicate)", () => {
    const score = jobSimilarity(DIRECT_CARE_A, DIRECT_CARE_B);
    expect(
      score,
      `direct-care pair scored ${score.toFixed(3)}, below the ${DUPLICATE_THRESHOLD} threshold — ` +
      `the TRUE duplicate would render twice on Act A.`,
    ).toBeGreaterThanOrEqual(DUPLICATE_THRESHOLD);
  });

  it("KEEPS the families pair (same WHO, different jobs — breadth)", () => {
    const score = jobSimilarity(FAMILIES_A, FAMILIES_B);
    expect(
      score,
      `families pair scored ${score.toFixed(3)}, at or above the ${DUPLICATE_THRESHOLD} threshold — ` +
      `a REAL reading would be suppressed off Act A. Breadth calibration broken.`,
    ).toBeLessThan(DUPLICATE_THRESHOLD);
  });

  it("keeps a working margin on both sides of the threshold", () => {
    // Recorded so a retune cannot quietly land on the edge of either fixture.
    expect(jobSimilarity(DIRECT_CARE_A, DIRECT_CARE_B)).toBeCloseTo(0.636, 2);
    expect(jobSimilarity(FAMILIES_A, FAMILIES_B)).toBeCloseTo(0.143, 2);
    expect(DUPLICATE_THRESHOLD).toBeGreaterThan(0.143);
    expect(DUPLICATE_THRESHOLD).toBeLessThanOrEqual(0.636);
  });

  it("is symmetric and self-identical", () => {
    expect(jobSimilarity(DIRECT_CARE_A, DIRECT_CARE_B)).toBe(jobSimilarity(DIRECT_CARE_B, DIRECT_CARE_A));
    expect(jobSimilarity(FAMILIES_A, FAMILIES_A)).toBe(1);
    expect(jobSimilarity("", DIRECT_CARE_A)).toBe(0);
  });

  it("survivor rule (ii): the attempt-1 clean pass wins over the coached rewrite", () => {
    // The live direct-care pair, verbatim from market_options.
    const rewrite: Row = { id: "42798a81", attempt: 2, createdAt: "2026-07-21T00:08:47Z" };
    const cleanPass: Row = { id: "66f0e688", attempt: 1, createdAt: "2026-07-21T18:33:32Z" };
    // Note the survivor is the LATER row — lowest attempt beats earliest created.
    expect(better(rewrite, cleanPass).id).toBe("66f0e688");
    expect(better(cleanPass, rewrite).id).toBe("66f0e688");
    // Equal attempts fall back to earliest created.
    const early: Row = { id: "early", attempt: 1, createdAt: "2026-01-01T00:00:00Z" };
    const late: Row = { id: "late", attempt: 1, createdAt: "2026-02-01T00:00:00Z" };
    expect(better(late, early).id).toBe("early");
  });
});
