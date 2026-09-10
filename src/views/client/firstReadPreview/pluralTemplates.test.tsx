// PLURAL-AWARE COUNT TEMPLATES (2026-09-09) — exact-string snapshots at n = 0, 1, 2.
//
// THE DEFECT. Riverlane's cold open read: "You say 1 things about yourself. The public record echoes
// none of them and contradicts 1." Two faults in one sentence — a plural noun on a count of one, and
// a plural antecedent ("them") for a single statement. The census found four client-visible
// templates with this shape.
//
// n=0 IS NOT A PLURAL PROBLEM. English pluralises on n !== 1, so "0 sources" is already correct. What
// n=0 must not do is start rendering a sentence that used to be absent — the cold-open rung is gated
// on statements > 0 and the further-signals toggle on length > 0, and both stay gated.
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { plural } from "./plural";
import { coldOpenLadder, type ColdOpenLadderInput } from "./mapping";
import { ActRecord, ActWhatYouOffer } from "./acts";
import { EMPTY_FIRST_READ, type FirstReadPreviewData, type FRColdOpen, type FRSignal } from "./types";

const FALLBACK: FRColdOpen = { text: "A strong outside signal.", sourceTag: { label: "example.com · June 2026" }, eventDate: "2026-06-01" };
const ladder = (statements: number, confirmed: number, contradicted: number) =>
  coldOpenLadder({
    statusConflict: null, deltasRunDate: null, fallback: FALLBACK,
    gap: statements > 0 ? { statements, confirmed, contradicted } : null,
  } as ColdOpenLadderInput);

describe("plural() — the helper", () => {
  it("pluralises on n !== 1, so zero takes the plural", () => {
    expect(plural(0, "thing", "things")).toBe("things");
    expect(plural(1, "thing", "things")).toBe("thing");
    expect(plural(2, "thing", "things")).toBe("things");
    expect(plural(-1, "thing", "things")).toBe("things");
  });
});

describe("SITE 1+2 — cold-open rung 2 (mapping.ts)", () => {
  it("n=0 → the rung is ABSENT; it falls through to the strongest signal (unchanged)", () => {
    const c = ladder(0, 0, 0)!;
    expect(c.text).toBe("A strong outside signal.");   // never "You say 0 things"
  });

  it("n=1, nothing echoed, 1 contradicted → THE RIVERLANE SENTENCE, fixed", () => {
    expect(ladder(1, 0, 1)!.text).toBe(
      "You say 1 thing about yourself. The public record does not echo it and contradicts 1.",
    );
  });

  it("n=1, nothing echoed, none contradicted", () => {
    expect(ladder(1, 0, 0)!.text).toBe(
      "You say 1 thing about yourself. The public record does not echo it.",
    );
  });

  it("n=1, echoed once", () => {
    expect(ladder(1, 1, 0)!.text).toBe(
      "You say 1 thing about yourself. The public record echoes 1.",
    );
  });

  it("n=2 keeps the plural wording exactly as before", () => {
    expect(ladder(2, 0, 1)!.text).toBe(
      "You say 2 things about yourself. The public record echoes none of them and contradicts 1.",
    );
    expect(ladder(2, 1, 0)!.text).toBe(
      "You say 2 things about yourself. The public record echoes 1.",
    );
  });

  it("VACUOUS PROOF — the pre-fix wording is gone at n=1", () => {
    expect(ladder(1, 0, 1)!.text).not.toContain("1 things");
    expect(ladder(1, 0, 1)!.text).not.toContain("none of them");
  });
});

const offerRead = (examined: number): FirstReadPreviewData => ({
  ...EMPTY_FIRST_READ,
  company: { name: "Riverlane", website: "https://riverlane.com" },
  offeringIntegrity: "looked_none",
  offeringExamined: examined,
  offeringThroughDate: "September 9, 2026",
} as FirstReadPreviewData);

describe("SITE 4 — the offering earned-empty line (acts.tsx)", () => {
  const line = (n: number) => render(<ActWhatYouOffer read={offerRead(n)} />).container.textContent ?? "";

  it("n=0 → plural, unchanged (0 takes the plural in English)", () => {
    expect(line(0)).toContain("Across 0 public sources through September 9, 2026, nothing spoke to it.");
  });
  it("n=1 → SINGULAR", () => {
    expect(line(1)).toContain("Across 1 public source through September 9, 2026, nothing spoke to it.");
    expect(line(1)).not.toContain("1 public sources");
  });
  it("n=2 → plural", () => {
    expect(line(2)).toContain("Across 2 public sources through September 9, 2026, nothing spoke to it.");
  });
});

const sig = (id: string, strength: FRSignal["strength"]): FRSignal => ({
  id, text: `Signal ${id}`, strength, sourceTag: { label: "example.com · September 2026" },
} as FRSignal);

/** The record beat shows the first SHOWN_FULL_SIZE signals and folds the rest into the toggle. */
const SHOWN_FULL_SIZE = 4; // mirrors acts.tsx:309
const recordRead = (further: number): FirstReadPreviewData => ({
  ...EMPTY_FIRST_READ,
  company: { name: "Riverlane", website: "https://riverlane.com" },
  signals: [
    ...Array.from({ length: SHOWN_FULL_SIZE }, (_, i) => sig(`s${i}`, "strong")),
    ...Array.from({ length: further }, (_, i) => sig(`f${i}`, "thin")),
  ],
} as FirstReadPreviewData);

describe("SITE 5 — the further-signals toggle (acts.tsx)", () => {
  const text = (n: number) => render(<ActRecord read={recordRead(n)} />).container.textContent ?? "";

  it("n=0 → the toggle is ABSENT (guarded on length > 0), never '0 further signals'", () => {
    expect(text(0)).not.toContain("further signal");
  });
  it("n=1 → SINGULAR", () => {
    expect(text(1)).toContain("+ 1 further signal ·");
    expect(text(1)).not.toContain("1 further signals");
  });
  it("n=2 → plural", () => {
    expect(text(2)).toContain("+ 2 further signals ·");
  });
});
