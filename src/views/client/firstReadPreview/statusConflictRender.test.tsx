// S4/S5 (2026-08-20): the status-conflict banner pins ABOVE all rows in Questions + Findings, and
// a STATUS DISPUTED chip marks (never hides) any gap pair / finding whose backing references a
// conflicted location.
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { ActQuestions, ActFindings, ActGap } from "./acts";
import { groupGapStatements } from "./mapping";
import { EMPTY_FIRST_READ, type FirstReadPreviewData, type FRStatusConflict, type FRFinding, type FRGapPair } from "./types";

const CONFLICT: FRStatusConflict = {
  location: "Le French Rooster & Cafe Barra (2221 W Olive Ave, Burbank)",
  matchKey: "le french rooster",
  question: "Some sources say Le French Rooster & Cafe Barra is closed; others still list it as open. Which is true today?",
  closed: [{ host: "yelp.com", date: "2026-07-01", quote: "CLOSED" }],
  open: [{ host: "ubereats.com", date: "2026-08-01", quote: "delivery available" }],
};
const base = (o: Partial<FirstReadPreviewData>): FirstReadPreviewData => ({ ...EMPTY_FIRST_READ, company: { name: "Co", website: null }, ...o });

describe("S4 — status conflict pinned atop Questions + Findings", () => {
  it("Questions: the conflict question renders ABOVE the plain questions", () => {
    const { container } = render(<ActQuestions read={base({ statusConflicts: [CONFLICT], questions: ["A plain question?"] })} />);
    const text = container.textContent ?? "";
    expect(text).toContain("Which is true today?");
    expect(text.indexOf("Which is true today?")).toBeLessThan(text.indexOf("A plain question?"));
    expect(text).toContain("Reported closed");
    expect(text).toContain("Still listed open");
  });

  it("Findings: the conflict banner renders ABOVE the findings", () => {
    const f: FRFinding = { id: "f1", body: "A finding body.", recurrence: 5, sourceTag: { label: "read Aug 1" }, stale: false, ageMarker: null };
    const { container } = render(<ActFindings read={base({ statusConflicts: [CONFLICT], findings: [f] })} />);
    const text = container.textContent ?? "";
    expect(text.indexOf("Which is true today?")).toBeLessThan(text.indexOf("A finding body."));
  });
});

describe("S5 — STATUS DISPUTED chip marks (never hides) conflicted rows", () => {
  const disputed: FRGapPair = { id: "d", statementId: "sd", verdict: "confirmed", declared: "we partner with Le French Rooster", record: "Le French Rooster teaming up", sourceTag: null, eventDate: null, evidenceRank: 3, statusDisputed: true };
  const clean: FRGapPair = { id: "c", statementId: "sc", verdict: "confirmed", declared: "we roast to order", record: "great coffee", sourceTag: null, eventDate: null, evidenceRank: 3, statusDisputed: false };
  const withStatements = (p: FRGapPair): Partial<FirstReadPreviewData> => ({
    gapPairs: [p],
    gapStatements: groupGapStatements([p]),
    gapCounts: { contradicted: 0, unechoed: 0, confirmed: 1 },
  });

  it("a disputed gap pair shows the chip; a clean one does not — BOTH still render", () => {
    const disputedText = render(<ActGap read={base(withStatements(disputed))} />).container.textContent ?? "";
    const cleanText = render(<ActGap read={base(withStatements(clean))} />).container.textContent ?? "";
    expect(disputedText).toContain("Status disputed");
    expect(disputedText).toContain("Le French Rooster teaming up"); // not hidden
    expect(cleanText).not.toContain("Status disputed");
    expect(cleanText).toContain("great coffee");
  });

  it("a disputed finding shows the chip and is not hidden", () => {
    const f: FRFinding = { id: "f", body: "Le French Rooster partnership is primary channel.", recurrence: 3, sourceTag: { label: "read Aug 1" }, stale: false, ageMarker: null, statusDisputed: true };
    const text = render(<ActFindings read={base({ findings: [f] })} />).container.textContent ?? "";
    expect(text).toContain("Status disputed");
    expect(text).toContain("primary channel"); // still rendered
  });
});
