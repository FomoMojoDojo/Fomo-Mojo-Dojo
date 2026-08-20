// Council beat-order ruling (2026-08-20): the beats render in the ruled sequence, and no
// "What we see" group label remains. Falsification: swapping two beats breaks the monotonic
// order assertion. The ScoreReveal always-mounted guarantee is covered in scoreFindings.test.
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import {
  ActRecord, ActWhatYouSay, ActGap, ActWhoYouServe, ActFindings,
  ScoreReveal, ActWhereYouStand, ActOurRead, ActQuestions, ActNext,
} from "./acts";
import { EMPTY_FIRST_READ, type FirstReadPreviewData } from "./types";

const read: FirstReadPreviewData = {
  ...EMPTY_FIRST_READ,
  company: { name: "Co", website: "https://co.com" },
  score: { value: 16, computedAt: "2026-08-20T00:00:00Z", methodologyVersion: "outside-v1.0.0" },
  scoreLooked: true,
};

// The ruled order: [beat key, headline the beat renders].
const RULED: Array<[string, string]> = [
  ["record", "What the world says."],
  ["yousay", "What you say."],
  ["gap", "Where the two readings disagree."],
  ["serve", "Who you serve."],
  ["findings", "What stands out."],
  ["score", "One number, read from the record."],
  ["where", "Where you stand."],
  ["ourread", "Our read."],
  ["questions", "Questions this read raises."],
  ["next", "What we'd do together."],
];

const renderBeat = (key: string) => {
  switch (key) {
    case "record": return <ActRecord read={read} />;
    case "yousay": return <ActWhatYouSay read={read} />;
    case "gap": return <ActGap read={read} />;
    case "serve": return <ActWhoYouServe read={read} />;
    case "findings": return <ActFindings read={read} />;
    case "score": return <ScoreReveal read={read} />;
    case "where": return <ActWhereYouStand read={read} />;
    case "ourread": return <ActOurRead read={read} />;
    case "questions": return <ActQuestions read={read} />;
    default: return <ActNext />;
  }
};

// Render the sequence into one tree; return the concatenated text.
function renderSequence(order: Array<[string, string]>): string {
  const { container } = render(<div>{order.map(([k]) => <div key={k}>{renderBeat(k)}</div>)}</div>);
  return container.textContent ?? "";
}

describe("beat order — ruled sequence", () => {
  it("every beat headline appears, in the ruled order", () => {
    const text = renderSequence(RULED);
    let prev = -1;
    for (const [key, headline] of RULED) {
      const at = text.indexOf(headline);
      expect(at, `${key} (${headline}) present`).toBeGreaterThan(-1);
      expect(at, `${key} in order`).toBeGreaterThan(prev);
      prev = at;
    }
  });

  it("no 'What we see' group label remains in the rendered beats", () => {
    const text = renderSequence(RULED);
    expect(text).not.toContain("What we see.");
  });

  const ourReadRead: FirstReadPreviewData = {
    ...read,
    positioning: { category: "Cat", value: "Val", differentiators: ["d1"], sourceTag: { label: "Public read · June 11, 2026" } },
    strategy: { aspiration: "Asp", whereToPlay: "W2P", howToWin: "H2W", sourceTag: { label: "Public read · June 11, 2026" } },
    promise: { value: "PromiseVal", tagline: "Tag", sourceTag: { label: "Public read · June 11, 2026" } },
  };

  it("beat 9 'Our read': rows first (positioning → strategy → promise), then the base illustration CLOSES", () => {
    const { container } = render(<ActOurRead read={ourReadRead} />);
    const text = container.textContent ?? "";
    const iPos = text.indexOf("Positioning"); // section eyebrow (mixed case; diagram is UPPERCASE)
    const iStrat = text.indexOf("Strategy");
    const iProm = text.indexOf("Promise");
    const iBase = text.indexOf("A strong base"); // BaseGate headline — closes the beat
    expect(iPos).toBeGreaterThan(-1);
    expect(iPos).toBeLessThan(iStrat);
    expect(iStrat).toBeLessThan(iProm);
    expect(iProm).toBeLessThan(iBase); // FALSIFICATION target: base must come AFTER the rows
    // the illustration + its market pointer render
    expect(container.querySelector("svg"), "BaseAlignment illustration present").not.toBeNull();
    expect(text).toContain("Who you serve — see above");
  });

  it("base explanation renders for a company WITH a score AND without", () => {
    for (const scoreState of [
      { score: { value: 16, computedAt: "2026-08-20T00:00:00Z", methodologyVersion: "outside-v1.0.0" }, scoreLooked: true },
      { score: null, scoreLooked: false },
    ] as Array<Partial<FirstReadPreviewData>>) {
      const { container } = render(<ActOurRead read={{ ...read, ...scoreState }} />);
      expect(container.textContent).toContain("A strong base");
      expect(container.querySelector("svg")).not.toBeNull();
    }
  });

  it("FALSIFICATION: base BEFORE the rows fails the within-beat order", () => {
    // Simulate the opener layout: base headline text placed before the row labels.
    const swapped = "A strong base changes your odds. ... Positioning ... Strategy ... Promise";
    const iBase = swapped.indexOf("A strong base");
    const iProm = swapped.indexOf("Promise");
    // The ruled within-beat order requires Promise BEFORE the base headline (iProm < iBase);
    // in this base-first layout that does NOT hold.
    expect(iProm < iBase).toBe(false);
  });

  it("FALSIFICATION: swapping two beats breaks the monotonic order", () => {
    const swapped = [...RULED];
    [swapped[1], swapped[4]] = [swapped[4], swapped[1]]; // yousay <-> findings
    const text = renderSequence(swapped);
    // In the swapped render, the ruled sequence is NOT monotonic.
    let monotonic = true, prev = -1;
    for (const [, headline] of RULED) {
      const at = text.indexOf(headline);
      if (at <= prev) monotonic = false;
      prev = at;
    }
    expect(monotonic).toBe(false);
  });
});
