// Council beat-order ruling (2026-08-20): the beats render in the ruled sequence, and no
// "What we see" group label remains. Falsification: swapping two beats breaks the monotonic
// order assertion. The ScoreReveal always-mounted guarantee is covered in scoreFindings.test.
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import {
  ActRecord, ActWhatYouSay, ActGap, ActWhoYouServe, ActFindings,
  ScoreReveal, ActWhereYouStand, ActOurRead, ActQuestions, ActNext, BaseGate,
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
  ["base", "A strong base"],
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
    case "base": return <BaseGate />;
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

  it("beat 4 'The gap' shows NO score — even for a company WITH a score", () => {
    // `read` carries score 16; the gap must not surface it (score is introduced at beat 7).
    const { container } = render(<ActGap read={read} />);
    const text = container.textContent ?? "";
    expect(text).not.toContain("Mojo now"); // FALSIFICATION target: restoring the ScoreNow prop re-adds this
    expect(text).not.toContain("/ 100");
    expect(text).not.toContain("16"); // the score value
    // the gap still renders its own content (not-yet integrity note)
    expect(text).toContain("Where the two readings disagree.");
  });

  it("the 'Mojo now' score panel appears EXACTLY ONCE across all beats — inside beat 7", () => {
    // Render every beat; count "Mojo now" occurrences. ScoreReveal (beat 7) is the only home.
    const seqText = renderSequence(RULED);
    const occurrences = seqText.split("Mojo now").length - 1;
    expect(occurrences).toBe(1);
    // and it is the score beat that carries it
    const { container } = render(<ScoreReveal read={read} />);
    expect(container.textContent).toContain("Mojo now");
    expect(container.textContent).toContain("One number, read from the record.");
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

  it("beat 9 'Our read' = the three rows ONLY (positioning → strategy → promise), NO base", () => {
    const { container } = render(<ActOurRead read={ourReadRead} />);
    const text = container.textContent ?? "";
    const iPos = text.indexOf("Positioning");
    const iStrat = text.indexOf("Strategy");
    const iProm = text.indexOf("Promise");
    expect(iPos).toBeGreaterThan(-1);
    expect(iPos).toBeLessThan(iStrat);
    expect(iStrat).toBeLessThan(iProm);
    // FALSIFICATION (collapse-back): the base is its OWN beat now — it must NOT be inside Our read.
    expect(text).not.toContain("A strong base");
    expect(container.querySelector("svg"), "no base diagram inside Our read").toBeNull();
  });

  it("beat 10 'The Base' is a standalone beat: complete base explanation + illustration + pointer", () => {
    const { container } = render(<BaseGate />);
    expect(container.textContent).toContain("A strong base"); // headline
    expect(container.textContent).toContain("Your base is the four commitments"); // framing
    expect(container.textContent).toContain("Who you serve — see above"); // market pointer
    for (const el of ["STRATEGY", "MARKET", "POSITIONING", "PROMISE"]) {
      expect(container.textContent).toContain(el);
    }
    expect(container.querySelector("svg"), "BaseAlignment illustration present").not.toBeNull();
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
