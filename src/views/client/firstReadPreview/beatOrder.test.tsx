// Council beat-order ruling (2026-08-20): the beats render in the ruled sequence, and no
// "What we see" group label remains. Falsification: swapping two beats breaks the monotonic
// order assertion. The ScoreReveal always-mounted guarantee is covered in scoreFindings.test.
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import {
  ActRecord, ActWhatYouSay, ActGap, ActWhoYouServe, ActWhatYouOffer, ActFindings,
  ScoreReveal, ActWhereYouStand, ActPromise, ActPositioning, ActStrategy,
  ActSiesta1, ActSiesta2, ActQuestions, ActNext, BaseGate,
} from "./acts";
import { BEATS } from "./FirstReadPreviewView";
import { EMPTY_FIRST_READ, type FirstReadPreviewData } from "./types";

const read: FirstReadPreviewData = {
  ...EMPTY_FIRST_READ,
  company: { name: "Co", website: "https://co.com" },
  score: { value: 16, computedAt: "2026-08-20T00:00:00Z", methodologyVersion: "outside-v1.0.0" },
  scoreLooked: true,
  // A1: a contradicted count so the gap headline is the disagreement headline (RULED below).
  gapCounts: { contradicted: 1, reverifying: 0, unechoed: 0, confirmed: 0 },
};

// The ruled order (flow restructure 2026-09-02): [beat key, headline the beat renders].
const RULED: Array<[string, string]> = [
  ["record", "What the world sees and says."],
  ["yousay", "What you say."],
  ["gap", "Where the two readings disagree."],
  ["findings", "What stands out."],
  ["siesta1", "That's what the record shows. Now, what it means."],
  ["promise", "Your promise"],
  ["positioning", "Your positioning"],
  ["strategy", "Your strategy"],
  ["serve", "Who you serve."],
  ["base", "A strong base"],
  ["siesta2", "That's your base, as the record shows it."],
  ["offer", "What you offer, as the market can see it."],
  ["score", "One number, read from the record."],
  ["questions", "Questions this read raises."],
  ["next", "Here's what happens next."],
];

const renderBeat = (key: string) => {
  switch (key) {
    case "record": return <ActRecord read={read} />;
    case "yousay": return <ActWhatYouSay read={read} />;
    case "gap": return <ActGap read={read} />;
    case "findings": return <ActFindings read={read} />;
    case "siesta1": return <ActSiesta1 />;
    case "promise": return <ActPromise read={read} />;
    case "positioning": return <ActPositioning read={read} />;
    case "strategy": return <ActStrategy read={read} />;
    case "serve": return <ActWhoYouServe read={read} />;
    case "base": return <BaseGate />;
    case "siesta2": return <ActSiesta2 />;
    case "offer": return <ActWhatYouOffer read={read} />;
    case "score": return <ScoreReveal read={read} />;
    case "where": return <ActWhereYouStand read={read} />;
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
    promise: { text: "PromiseVal", sourceTag: { label: "Public read · June 11, 2026" } },
  };

  it("the 'Where this points' split renders as THREE unpacking pages: promise → positioning → strategy", () => {
    const seq = ["promise", "positioning", "strategy"];
    const { container } = render(<div>{seq.map((k) => <div key={k}>{renderBeat(k)}</div>)}</div>);
    const text = container.textContent ?? "";
    const iProm = text.indexOf("Your promise");
    const iPos = text.indexOf("Your positioning");
    const iStrat = text.indexOf("Your strategy");
    expect(iProm).toBeGreaterThan(-1);
    expect(iProm).toBeLessThan(iPos); // PROMISE FIRST (unpacking order)
    expect(iPos).toBeLessThan(iStrat);
    // each page carries its kind's content (the ourReadRead fixture populates all three)
    const populated = render(
      <div>
        <ActPromise read={ourReadRead} />
        <ActPositioning read={ourReadRead} />
        <ActStrategy read={ourReadRead} />
      </div>,
    ).container.textContent ?? "";
    expect(populated).toContain("PromiseVal");
    expect(populated).toContain("Cat"); // positioning category
    expect(populated).toContain("Asp"); // strategy aspiration rung
  });

  // RULED order == BEATS content order — ONE assertion so the two lists can never drift silently.
  it("RULED order == BEATS content order (bookends arc/cold excluded)", () => {
    const beatsContent = BEATS.filter((b) => b.key !== "arc" && b.key !== "cold").map((b) => b.key);
    expect(RULED.map(([k]) => k)).toEqual(beatsContent);
  });

  it("the forward link on findings points to SIESTA_1 (findings → siesta1)", () => {
    const iFindings = BEATS.findIndex((b) => b.key === "findings");
    expect(BEATS[iFindings + 1].key).toBe("siesta1");
  });

  it("offer is downstream of base (base → siesta2 → offer, by law)", () => {
    const iBase = BEATS.findIndex((b) => b.key === "base");
    const iSiesta2 = BEATS.findIndex((b) => b.key === "siesta2");
    const iOffer = BEATS.findIndex((b) => b.key === "offer");
    expect(iBase).toBeLessThan(iSiesta2);
    expect(iSiesta2).toBeLessThan(iOffer);
  });

  it("the unpacking arc is PROMISE-FIRST (promise → positioning → strategy → serve → base)", () => {
    const k = BEATS.map((b) => b.key as string);
    const seq = ["promise", "positioning", "strategy", "serve", "base"].map((x) => k.indexOf(x));
    expect(seq).toEqual([...seq].sort((a, b) => a - b));
  });

  it("Mojo Score is always mounted (present in the ruled order — product law)", () => {
    expect(BEATS.some((b) => b.key === "score")).toBe(true);
  });

  it("beat 10 'The Base' is a standalone beat: complete base explanation + illustration + pointer", () => {
    const { container } = render(<BaseGate />);
    expect(container.textContent).toContain("A strong base"); // headline
    expect(container.textContent).toContain("Your base is the four commitments"); // framing
    // R1 (2026-09-02): the "Who you serve — coming up" forward pointer is REMOVED — serve now precedes
    // the base in the ruled order, so the pointer was false.
    expect(container.textContent).not.toContain("Who you serve — coming up");
    for (const el of ["STRATEGY", "WHO YOU SERVE", "POSITIONING", "PROMISE"]) {
      expect(container.textContent).toContain(el);
    }
    expect(container.querySelector("svg"), "BaseAlignment illustration present").not.toBeNull();
  });

  it("FALSIFICATION: swapping two beats breaks the monotonic order", () => {
    const swapped = [...RULED];
    [swapped[1], swapped[4]] = [swapped[4], swapped[1]]; // yousay <-> base
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
