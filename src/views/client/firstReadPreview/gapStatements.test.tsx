// 2026-08-21: the unit of echo is the STATEMENT, not the pair row. Beat 4 groups public_vs_public
// pairs by their own-words id (statementId), one row per statement, with every pair kept visible as
// evidence beneath. Headline counts run on statement counts. These tests pin the grouping and the
// grouped render (nothing hidden).
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { groupGapStatements } from "./mapping";
import { ActGap } from "./acts";
import { EMPTY_FIRST_READ, type FirstReadPreviewData, type FRGapPair, type FRGapCounts } from "./types";

function pair(over: Partial<FRGapPair> & Pick<FRGapPair, "id" | "statementId" | "verdict">): FRGapPair {
  return {
    declared: "We say something.",
    record: over.verdict === "unechoed" ? null : "A public source says it too.",
    sourceTag: over.verdict === "unechoed" ? null : { label: "example.com" },
    eventDate: "2026-06-01",
    evidenceRank: 3,
    ...over,
  };
}

// FIXTURE: 2 statements / 5 rows. Statement A = 3 echoed pairs (confirmed); statement B = 2
// publicly_silent rows (not echoed).
const FIVE_ROWS: FRGapPair[] = [
  pair({ id: "a1", statementId: "A", verdict: "confirmed", declared: "All coffees ship in 12 oz.", record: "Retailer A lists the 12 oz bag." }),
  pair({ id: "a2", statementId: "A", verdict: "confirmed", declared: "All coffees ship in 12 oz.", record: "Retailer B lists the 12 oz bag." }),
  pair({ id: "a3", statementId: "A", verdict: "confirmed", declared: "All coffees ship in 12 oz.", record: "Retailer C lists the 12 oz bag." }),
  pair({ id: "b1", statementId: "B", verdict: "unechoed", declared: "We use the Barra Method." }),
  pair({ id: "b2", statementId: "B", verdict: "unechoed", declared: "We use the Barra Method." }),
];

describe("beat 4 — group by statement (2026-08-21)", () => {
  it("collapses 5 pair rows into 2 statements; verdict per statement; evidence kept", () => {
    const statements = groupGapStatements(FIVE_ROWS);
    expect(statements).toHaveLength(2);

    const a = statements.find((s) => s.statementId === "A")!;
    expect(a.verdict).toBe("confirmed");
    expect(a.evidence.map((e) => e.id)).toEqual(["a1", "a2", "a3"]); // every pair visible, none lost

    const b = statements.find((s) => s.statementId === "B")!;
    expect(b.verdict).toBe("unechoed");
    expect(b.evidence).toHaveLength(0); // record silent — no evidence beneath
  });

  it("contradicted wins over echoed within one statement", () => {
    const mixed = groupGapStatements([
      pair({ id: "x1", statementId: "X", verdict: "confirmed" }),
      pair({ id: "x2", statementId: "X", verdict: "contradicted" }),
    ]);
    expect(mixed).toHaveLength(1);
    expect(mixed[0].verdict).toBe("contradicted");
    expect(mixed[0].evidence).toHaveLength(2);
  });

  it("render: one statement row each; confirmed lists all its pairs; not-echoed shows the signed line", () => {
    const statements = groupGapStatements(FIVE_ROWS);
    const gapCounts: FRGapCounts = { contradicted: 0, unechoed: 1, confirmed: 1 };
    const read: FirstReadPreviewData = {
      ...EMPTY_FIRST_READ,
      company: { name: "Co", website: null },
      gapPairs: FIVE_ROWS,
      gapStatements: statements,
      gapCounts,
      gapIntegrity: "looked_none",
    };
    const { container } = render(<ActGap read={read} />);
    const text = container.textContent ?? "";
    // headline counts run on statements (1 confirmed / 1 not echoed)
    expect(text).toContain("1 not echoed");
    expect(text).toContain("1 confirmed");
    // statement A's three public sources all present beneath the single statement row
    expect(text).toContain("Retailer A lists the 12 oz bag.");
    expect(text).toContain("Retailer B lists the 12 oz bag.");
    expect(text).toContain("Retailer C lists the 12 oz bag.");
    // not-echoed statement B carries the signed record-silent line
    expect(text).toContain("The public record doesn't echo this yet.");
    // one statement row per statement (declared text appears once each)
    const declaredRows = [...container.querySelectorAll("h3")].map((h) => h.textContent);
    expect(declaredRows.filter((t) => t?.includes("All coffees ship in 12 oz."))).toHaveLength(1);
  });
});
