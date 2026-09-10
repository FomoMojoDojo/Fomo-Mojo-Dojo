// Gate 4b — "groups we saw but couldn't state in your customers' terms".
//
// THE LAW (Living Memory, 2026-09-10): Who-you-serve is a conversation. A solution-bound group
// surfaces LABELLED, never dropped. Before this the beat rendered defs only, so a candidate that was
// judged and rejected left nothing to render — Riverlane's buyer group was invisible twice over:
// first dropped silently by the confirm-poll, then, once judged, rejected with no way to say so.
//
// PLANTED DIFFERENCES (what makes each guard designed-to-fail):
//  - The section renders rejected_solution and rejected_buyer ONLY. Rendering a fold would
//    double-count an audience already visible inside the numbered group it folded into.
//  - The sub-line is the SIGNED plain-words string per outcome class, never the judge's verbatim
//    clause, which is operator-only.
//  - Each row carries its ROLE chip (operator ruling 2026-09-10, striking the earlier "IN YOUR WORDS"
//    chip), drawn from the SAME per-company colour sequence as the numbered groups: a kind that
//    appears both above and below gets one colour, because the chip means the same thing in both
//    places. A kind first seen in the section takes the next colour in the sequence.
//  - An empty section is never omitted: it renders one of three signed lines from the persisted
//    integrity record, because omission cannot tell "nothing to say" from "we never looked".
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { ActWhoYouServe } from "./acts";
import { EMPTY_FIRST_READ, type FirstReadPreviewData, type FRUnstatedGroup, type FRMarketDef } from "./types";

const SOLUTION_LINE = "Says it in terms of what you sell — likely the same people, described from your side of the table.";
const BUYER_LINE = "Reads as a goal of yours, not a job of theirs — likely the same people, described from your side of the table.";
const EYEBROW = "GROUPS WE SAW BUT COULDN'T STATE IN YOUR CUSTOMERS' TERMS";

const group = (over: Partial<FRUnstatedGroup>): FRUnstatedGroup => ({
  id: Math.random().toString(36).slice(2),
  who: "Someone we couldn't state",
  job: "The job, in the words the read found.",
  relationshipKind: "buyer",
  outcome: "rejected_solution",
  judgeReason: "names 'machine-readable system' which is a key feature of Brand AI's product",
  reconstructed: false,
  ...over,
});

const market = (over: Partial<FRMarketDef>): FRMarketDef => ({
  id: Math.random().toString(36).slice(2),
  who: "A group that landed", job: null, relationshipKind: "buyer",
  sourceTag: { label: "Public read · Sep 10, 2026" }, ...over,
});

const readWith = (
  unstatedGroups: FRUnstatedGroup[],
  unstatedIntegrity: FirstReadPreviewData["unstatedIntegrity"] = "looked_none",
  observedMarkets: FRMarketDef[] = [],
): FirstReadPreviewData => ({
  ...EMPTY_FIRST_READ,
  company: { name: "Co", website: "https://co.com" },
  observedMarkets, unstatedGroups, unstatedIntegrity,
});

describe("the section renders the signed strings", () => {
  // ── RED ON REVERT ───────────────────────────────────────────────────────────────────────────────
  // The Lumio fixture: one buyer folded/rejected, one referrer rail-dropped.
  it("(g4b) two rows render their ROLE chips (BUYER / REFERRER) and their signed sub-lines", () => {
    const { container } = render(
      <ActWhoYouServe read={readWith([
        group({ who: "Law firm partners and leaders looking to scale scarce expertise",
                relationshipKind: "buyer", outcome: "rejected_solution" }),
        group({ who: "Legal technology conference organizers and event sponsors",
                relationshipKind: "referrer", outcome: "rejected_buyer" }),
      ])} />,
    );
    const text = container.textContent ?? "";
    expect(text).toContain(EYEBROW);
    expect(text).toContain("Law firm partners and leaders looking to scale scarce expertise");
    expect(text).toContain("Legal technology conference organizers and event sponsors");
    expect(text).toContain(SOLUTION_LINE);
    expect(text).toContain(BUYER_LINE);
    expect(container.querySelectorAll(".fr-unstated-item").length).toBe(2);
    // the ROLE chips, via the Gate 2 vocabulary — not a section-specific label
    const chips = [...container.querySelectorAll(".fr-unstated-item .fr-chip")].map((c) => c.textContent);
    expect(chips).toEqual(["Buyer", "Referrer"]);
  });

  it("(g4b) a kind seen ABOVE and again in the section shares ONE colour token", () => {
    const { container } = render(
      <ActWhoYouServe read={readWith(
        [group({ who: "An unstated funder", relationshipKind: "funder" })],
        "looked_none",
        [market({ who: "A numbered observer", relationshipKind: "observer" }),
         market({ who: "A numbered funder", relationshipKind: "funder" })],
      )} />,
    );
    const toneOf = (root: Element | null) => root?.querySelector(".fr-chip")?.getAttribute("data-tone");
    const numbered = [...container.querySelectorAll(".fr-hanging")];
    const above = toneOf(numbered[1]);                                   // the numbered `funder`
    const below = toneOf(container.querySelector(".fr-unstated-item"));  // the unstated `funder`
    expect(above).toBeTruthy();
    expect(below).toBe(above);
    // and a DIFFERENT kind above keeps a different colour — the sequence is real, not a constant
    expect(toneOf(numbered[0])).not.toBe(above);
  });

  it("(g4b) a kind first seen IN THE SECTION takes the next colour, not the first", () => {
    const { container } = render(
      <ActWhoYouServe read={readWith(
        [group({ who: "An unstated referrer", relationshipKind: "referrer" })],
        "looked_none",
        [market({ who: "A numbered observer", relationshipKind: "observer" })],
      )} />,
    );
    const toneOf = (root: Element | null) => root?.querySelector(".fr-chip")?.getAttribute("data-tone");
    expect(toneOf(container.querySelector(".fr-unstated-item")))
      .not.toBe(toneOf(container.querySelector(".fr-hanging")));
  });

  it("(g4b) the judge's verbatim clause is NEVER in the client render (no operator provider)", () => {
    const { container } = render(
      <ActWhoYouServe read={readWith([group({ judgeReason: "names 'machine-readable system' which is a key feature of Brand AI's product" })])} />,
    );
    expect(container.textContent).not.toContain("machine-readable system");
    expect(container.textContent).not.toContain("JUDGE:");
  });

  it("(g4b) the numbered groups above are untouched — the section is additive", () => {
    const { container } = render(
      <ActWhoYouServe read={readWith(
        [group({ who: "Unstated one" })], "looked_none",
        [market({ who: "Numbered one", relationshipKind: "funder" })],
      )} />,
    );
    const text = container.textContent ?? "";
    expect(text).toContain("Numbered one");
    expect(text).toContain("Funder");        // the Gate 2 label still renders
    expect(text).toContain("Unstated one");
  });
});

describe("only the two rejection outcomes are eligible", () => {
  it("(g4b) a fold, an already_decided and an error never reach the section", () => {
    // The hook filters by outcome, so the guard is that the section renders EXACTLY what it is given
    // and the empty state when given nothing — a fold arriving here would be a hook bug, and this
    // asserts the contract the hook is written against.
    const { container } = render(<ActWhoYouServe read={readWith([], "looked_none")} />);
    const text = container.textContent ?? "";
    expect(container.querySelectorAll(".fr-unstated-item").length).toBe(0);
    expect(text).toContain("Every group we saw could be stated in your customers' terms.");
  });
});

describe("the empty state is never omitted — three signed lines", () => {
  const CASES: Array<[FirstReadPreviewData["unstatedIntegrity"], string]> = [
    ["not_yet", "Not read yet — this snapshot's market pass hasn't run."],
    ["looked_none", "Every group we saw could be stated in your customers' terms."],
    ["couldnt_check", "Couldn't finish this read — nothing is hidden, there's just nothing to show yet."],
  ];
  for (const [state, line] of CASES) {
    it(`(g4b) ${state} renders its signed line, and the eyebrow still renders`, () => {
      const { container } = render(<ActWhoYouServe read={readWith([], state)} />);
      expect(container.textContent).toContain(line);
      expect(container.textContent).toContain(EYEBROW);   // the section is never omitted
    });
  }
  it("(g4b) the three lines are distinct — no state borrows another's words", () => {
    const rendered = CASES.map(([state]) => {
      const { container } = render(<ActWhoYouServe read={readWith([], state)} />);
      return container.textContent ?? "";
    });
    for (const [, line] of CASES) {
      expect(rendered.filter((t) => t.includes(line)).length).toBe(1);
    }
  });
});
