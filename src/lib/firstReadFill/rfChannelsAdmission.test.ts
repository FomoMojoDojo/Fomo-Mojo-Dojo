// RF dry-run core guards (2026-09-04): (a) the verdict mapping — eligible kinds PASS, record kinds FAIL, a
// missing/invalid kind is UNTYPED and never PASS; (b) one judge call per page, input order preserved; (c) the
// module is pure — a stub judge, nothing else touched.
import { describe, expect, it, vi } from "vitest";
import { planRfAdmission, rfTotals, rfVerdictForKind } from "./rfChannelsAdmission";

describe("rfVerdictForKind", () => {
  it("eligible → PASS; record kinds → FAIL; null → UNTYPED", () => {
    for (const k of ["positioning", "offer", "audience", "proof"] as const) expect(rfVerdictForKind(k)).toBe("PASS");
    for (const k of ["instruction", "slogan", "location", "policy", "story", "recruiting", "other"] as const) expect(rfVerdictForKind(k)).toBe("FAIL");
    expect(rfVerdictForKind(null)).toBe("UNTYPED");
  });
});

describe("planRfAdmission", () => {
  const rows = [
    { id: "a", statement: "We roast for cafés that want a partner, not a vendor.", pageUrl: "https://cafebarra.com/partnerships" },
    { id: "b", statement: "Just add hot water.", pageUrl: "https://cafebarra.com/" },
    { id: "c", statement: "Single origin, mildly aromatic and balanced medium roast.", pageUrl: "https://cafebarra.com/" },
    { id: "d", statement: "Come find us in Los Angeles.", pageUrl: null },
  ];
  const judge = vi.fn(async (_t: string | null, statements: string[]) => statements.map((q) => {
    if (q.startsWith("We roast")) return { quote: q, kind: "positioning", kindReason: "why choose us" };
    if (q.startsWith("Just add")) return { quote: q, kind: "instruction", kindReason: "usage copy" };
    if (q.startsWith("Single")) return { quote: q, kind: "not-a-kind", kindReason: "glitch" };
    return { quote: q, kind: "location", kindReason: "where we are" };
  }));

  it("one call per page (3 pages), order preserved, verdicts mapped, UNTYPED on a glitch", async () => {
    const { plan, judgeCalls } = await planRfAdmission(rows, judge);
    expect(judgeCalls).toBe(3);
    expect(plan.map((p) => p.id)).toEqual(["a", "b", "c", "d"]);
    expect(plan.map((p) => p.verdict)).toEqual(["PASS", "FAIL", "UNTYPED", "FAIL"]);
    expect(plan[1].kind).toBe("instruction");
    expect(plan[1].reason).toBe("usage copy");
    expect(plan[2].kind).toBeNull();
    expect(rfTotals(plan)).toEqual({ PASS: 1, FAIL: 2, UNTYPED: 1 });
  });

  it("a judge that returns nothing for a statement yields UNTYPED, never PASS", async () => {
    const { plan } = await planRfAdmission(rows.slice(0, 1), async () => []);
    expect(plan[0].verdict).toBe("UNTYPED");
  });
});
