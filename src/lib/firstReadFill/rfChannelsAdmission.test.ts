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
    { id: "c", statement: "We ship every Tuesday.", pageUrl: "https://cafebarra.com/" },
    { id: "d", statement: "Come find us in Los Angeles.", pageUrl: null },
  ];
  const judge = vi.fn(async (_t: string | null, statements: string[]) => statements.map((q) => {
    if (q.startsWith("We roast")) return { quote: q, kind: "positioning", kindReason: "why choose us" };
    if (q.startsWith("Just add")) return { quote: q, kind: "instruction", kindReason: "usage copy" };
    if (q.startsWith("We ship")) return { quote: q, kind: "not-a-kind", kindReason: "glitch" };
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

// Operator ruling (2026-09-04, RF review): tasting notes / product-description lines FAIL. The classifier applies
// the extractor's SAME deterministic check (isProductDescription, ownWordsExtract.ts) BEFORE the kind question;
// a matched line is FAIL "product description" and never reaches the judge. The stub judge below answers "offer"
// for everything, so any FAIL here is proof the pre-judge check fired (RED before the check existed).
describe("product-description check, pre-judge (same check as the own-words extractor)", () => {
  const offerJudge = vi.fn(async (_t: string | null, statements: string[]) => statements.map((q) => ({ quote: q, kind: "offer", kindReason: "describes the product" })));
  const CB2 = {
    single: { id: "3c1a9397", statement: "Single origin, mildly aromatic and balanced medium roast coffee that is great for both espresso and drip.", pageUrl: "https://cafebarra.com/our-coffees/quantity" },
    darker: { id: "05937181", statement: "This medium roast tastes a little darker.", pageUrl: "https://cafebarra.com/our-coffees/quantity" },
    machado: { id: "79011c96", statement: "Our Machado Roast is crafted for pour-over but is equally good as drip, press or espresso.", pageUrl: "https://cafebarra.com/our-coffees/quantity" },
    packs: { id: "e5c2f5e4", statement: "Cafe Barra Pour-Over packs allow you to take great, fresh coffee with you wherever you go.", pageUrl: "https://cafebarra.com/home" },
  };

  it("a tasting note the shared check matches → FAIL 'product description', not sent to the judge", async () => {
    const { plan } = await planRfAdmission([CB2.single, CB2.packs], offerJudge);
    expect(plan[0]).toMatchObject({ id: "3c1a9397", verdict: "FAIL", reason: "product description", kind: null });
    expect(plan[1]).toMatchObject({ id: "e5c2f5e4", verdict: "PASS", kind: "offer" });
    // the judge saw ONLY the surviving statement
    expect(offerJudge).toHaveBeenCalledTimes(1);
    expect(offerJudge.mock.calls[0][1]).toEqual([CB2.packs.statement]);
  });

  // Operator ruling (2026-09-04): the shared check is WIDENED fleet-wide (tastes/darker/lighter as flavor words; a
  // capitalised product name + "Roast" as a roast trigger) so these two CB2 lines fail deterministically.
  it("the two CB2 tasting-note lines named in the ruling → FAIL 'product description'", async () => {
    const { plan } = await planRfAdmission([CB2.darker, CB2.machado], offerJudge);
    expect(plan.map((p) => [p.id, p.verdict, p.reason])).toEqual([
      ["05937181", "FAIL", "product description"],
      ["79011c96", "FAIL", "product description"],
    ]);
  });
});
