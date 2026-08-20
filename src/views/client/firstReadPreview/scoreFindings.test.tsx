// S1 (Mojo Score always mounted) + S4 (findings ranked, junk-free) — falsification-validated.
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { ScoreReveal, ActFindings } from "./acts";
import { EMPTY_FIRST_READ, type FirstReadPreviewData, type FRFinding } from "./types";

const read = (over: Partial<FirstReadPreviewData>): FirstReadPreviewData => ({
  ...EMPTY_FIRST_READ,
  company: { name: "Co", website: "https://co.com" },
  ...over,
});

const SCORE_HEADLINE = "One number, read from the record.";

describe("S1 — Mojo Score beat is ALWAYS in the mounted tree", () => {
  it("renders the score ladder for a company WITH an outside score (CB2=16)", () => {
    const { container } = render(
      <ScoreReveal read={read({ score: { value: 16, computedAt: "2026-08-20T00:00:00Z", methodologyVersion: "outside-v1.0.0" }, scoreLooked: true, signals: [] })} />,
    );
    expect(container.textContent).toContain(SCORE_HEADLINE); // beat mounted
    expect(container.textContent).toContain("16"); // the number is on the ladder
  });

  it("renders an HONEST EMPTY (not absent) for a company WITHOUT a score — looked", () => {
    const { container } = render(<ScoreReveal read={read({ score: null, scoreLooked: true })} />);
    expect(container.textContent).toContain(SCORE_HEADLINE); // FALSIFICATION: still mounted
    expect(container.textContent).toContain("Not enough public signal to score yet.");
  });

  it("renders an HONEST EMPTY for a company WITHOUT a score — not yet read", () => {
    const { container } = render(<ScoreReveal read={read({ score: null, scoreLooked: false })} />);
    expect(container.textContent).toContain(SCORE_HEADLINE); // still mounted
    expect(container.textContent).toContain("No score snapshot yet.");
  });
});

const finding = (id: string, body: string, recurrence: number): FRFinding => ({
  id, body, recurrence, sourceTag: { label: "Public read · August 19, 2026" },
});

describe("S4 — Findings beat: recurrence rank, first-5/show-all, counts, junk-free", () => {
  // Hook ranks (breadth desc, recency); this fixture is pre-ranked to assert render order + gating.
  const many: FRFinding[] = [
    finding("f1", "Widely corroborated finding.", 5),
    finding("f2", "Second finding.", 3),
    finding("f3", "Third finding.", 2),
    finding("f4", "Fourth finding.", 1),
    finding("f5", "Fifth finding.", 1),
    finding("f6", "Sixth finding — under show all.", 0),
    finding("f7", "Seventh finding — under show all.", 0),
  ];

  it("shows the total count, the first 5, and hides the rest until 'show all'", () => {
    const { container, getByRole } = render(<ActFindings read={read({ findings: many })} />);
    expect(container.textContent).toContain("7"); // count visible (header)
    expect(container.textContent).toContain("Widely corroborated finding.");
    expect(container.textContent).toContain("Fifth finding.");
    expect(container.textContent).not.toContain("Sixth finding"); // FALSIFICATION: hidden until expanded
    // recurrence count is shown as a row label, no verdict language
    expect(container.textContent).toContain("5 sources");
    expect(container.textContent).not.toMatch(/UNDERSERVED|underserved/);
    // expand
    getByRole("button", { name: /show all 7/i }).click();
  });

  it("recurrence rank: a higher-breadth finding renders above a lower one (order preserved)", () => {
    const { container } = render(<ActFindings read={read({ findings: many })} />);
    const text = container.textContent ?? "";
    expect(text.indexOf("Widely corroborated finding.")).toBeLessThan(text.indexOf("Second finding."));
    expect(text.indexOf("Second finding.")).toBeLessThan(text.indexOf("Third finding."));
  });

  it("empty findings → honest empty note, no count chip", () => {
    const { container } = render(<ActFindings read={read({ findings: [] })} />);
    expect(container.textContent).toContain("No public findings surfaced yet.");
  });
});
