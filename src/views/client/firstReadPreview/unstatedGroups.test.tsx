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

const FALLBACK_LINE = "Only makes sense with your product in it — take it out and ask what they'd still be trying to do.";
const BUYER_LINE = "Written as what you want them to do, not what they're trying to get done — say it from their side.";
const EYEBROW = "OTHER GROUPS WE SAW";
const INTRO = "These groups are described around your product — so they tell us what you sell, not what they need.";

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
  offeringProductLabels: string[] = [],
): FirstReadPreviewData => ({
  ...EMPTY_FIRST_READ,
  company: { name: "Co", website: "https://co.com" },
  observedMarkets, unstatedGroups, unstatedIntegrity, offeringProductLabels,
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
    expect(text).toContain(FALLBACK_LINE);   // no offering labels planted ⇒ the fallback
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

describe("the product inside the job is named and marked (Gate 4d)", () => {
  // RED ON REVERT: before this the row said "Says it in terms of what you sell" and never named the
  // thing, so the client had to guess which words were the problem.
  // RED ON REVERT. The exact-label matcher scored 0 of 6 on the real fleet: the read says
  // "Deltaflow QEC system", the model's job says "Deltaflow QEC layer". The head-token match is what
  // makes the signed line fire at all.
  it("(g4d) a job saying 'Deltaflow QEC layer' matches the label 'Deltaflow QEC system'", () => {
    const { container } = render(
      <ActWhoYouServe read={readWith(
        [group({
          who: "Quantum hardware OEMs integrating QEC into their quantum computing systems",
          job: "To ensure their quantum computers are reliable by integrating Riverlane's Deltaflow QEC layer.",
          outcome: "rejected_solution",
        })],
        "looked_none", [], ["Deltaflow QEC system"],
      )} />,
    );
    const text = container.textContent ?? "";
    // the LINE names the full label — what the client calls it in their own read
    expect(text).toContain("Names Deltaflow QEC system — take it out and ask what they'd still be trying to do.");
    // the TINT marks the words the job actually says
    expect(container.querySelector(".fr-unstated-product")?.textContent).toBe("Deltaflow QEC");
    expect(text).not.toContain(FALLBACK_LINE);
  });

  it("(g4d) a bare 'Deltaflow 2' matches 'Deltaflow 2 QEC system'", () => {
    const { container } = render(
      <ActWhoYouServe read={readWith(
        [group({ job: "By deploying Riverlane's Deltaflow 2 at national lab environments.", outcome: "rejected_solution" })],
        "looked_none", [], ["Deltaflow QEC system", "Deltaflow 2 QEC system"],
      )} />,
    );
    expect(container.textContent).toContain("Names Deltaflow 2 QEC system —");
    expect(container.querySelector(".fr-unstated-product")?.textContent).toBe("Deltaflow 2");
  });

  it("(g4d) the LONGEST head wins — 'Deltaflow 2' is never reported as 'Deltaflow'", () => {
    const { container } = render(
      <ActWhoYouServe read={readWith(
        [group({ job: "Deploying Deltaflow 2 at national lab environments.", outcome: "rejected_solution" })],
        "looked_none", [], ["Deltaflow system", "Deltaflow 2 QEC system"],
      )} />,
    );
    expect(container.textContent).toContain("Names Deltaflow 2 QEC system —");
  });

  it("(g4d) a CATEGORY word never names a product — 'embedding AI' falls back", () => {
    const { container } = render(
      <ActWhoYouServe read={readWith(
        [group({ job: "Trying to make progress by embedding AI into their advisory services.", outcome: "rejected_solution" })],
        "looked_none", [], ["Rainmaker Companion AI product"],
      )} />,
    );
    expect(container.textContent).toContain(FALLBACK_LINE);
    expect(container.querySelector(".fr-unstated-product")).toBeNull();
  });

  it("(g4d) a label that IS a category word never matches its bare use", () => {
    const { container } = render(
      <ActWhoYouServe read={readWith(
        [group({ job: "Leverage AI to deliver more distinctive brand work.", outcome: "rejected_solution" })],
        "looked_none", [], ["AI platform"],
      )} />,
    );
    expect(container.textContent).toContain(FALLBACK_LINE);
    expect(container.querySelector(".fr-unstated-product")).toBeNull();
  });

  it("(g4d) no label match ⇒ the signed fallback, and nothing is tinted", () => {
    const { container } = render(
      <ActWhoYouServe read={readWith(
        [group({ job: "A job that names nothing we sell.", outcome: "rejected_solution" })],
        "looked_none", [], ["Deltaflow QEC system"],
      )} />,
    );
    expect(container.textContent).toContain(FALLBACK_LINE);
    expect(container.querySelector(".fr-unstated-product")).toBeNull();
  });

  it("(g4d) a rejected_buyer row never names a product, even when a label matches", () => {
    const { container } = render(
      <ActWhoYouServe read={readWith(
        [group({ job: "Promote Deltaflow QEC system to the market.", outcome: "rejected_buyer" })],
        "looked_none", [], ["Deltaflow QEC system"],
      )} />,
    );
    expect(container.textContent).toContain(BUYER_LINE);
    expect(container.textContent).not.toContain("Names Deltaflow");
    expect(container.querySelector(".fr-unstated-product")).toBeNull();
  });

  it("(g4d) the intro renders under the eyebrow, in the CLIENT's frame", () => {
    const { container } = render(<ActWhoYouServe read={readWith([group({})])} />);
    expect(container.textContent).toContain(INTRO);
    // The ODI definition is our vocabulary, not theirs — it never appears on this surface.
    expect(container.textContent).not.toContain("A market is a group of people");
  });
});

describe("six distinct kinds get six distinct tones (Gate 4d)", () => {
  // RED ON REVERT: with five tones the sequence wrapped and Riverlane's BUYER reused OBSERVER's lime.
  it("(g4d) six kinds across the numbered groups and the section are all different colours", () => {
    const { container } = render(
      <ActWhoYouServe read={readWith(
        [group({ who: "u1", relationshipKind: "partner" }),
         group({ who: "u2", relationshipKind: "recipient" }),
         group({ who: "u3", relationshipKind: "buyer" })],
        "looked_none",
        [market({ who: "n1", relationshipKind: "observer" }),
         market({ who: "n2", relationshipKind: "referrer" }),
         market({ who: "n3", relationshipKind: "funder" })],
      )} />,
    );
    const tones = [...container.querySelectorAll(".fr-chip")].map((c) => c.getAttribute("data-tone"));
    expect(tones).toHaveLength(6);
    expect(new Set(tones).size).toBe(6);
  });
});

describe("only the two rejection outcomes are eligible", () => {
  it("(g4b) a fold, an already_decided and an error never reach the section", () => {
    // The hook filters by outcome, so the guard is that the section renders EXACTLY what it is given
    // and the empty state when given nothing — a fold arriving here would be a hook bug, and this
    // asserts the contract the hook is written against.
    const { container } = render(<ActWhoYouServe read={readWith([], "looked_none")} />);
    expect(container.querySelectorAll(".fr-unstated-item").length).toBe(0);
    // Gate E1: with nothing set aside the section renders nothing at all on the client.
    expect(container.querySelector(".fr-unstated")).toBeNull();
  });
});

describe("nothing renders when nothing was set aside (Gate E1)", () => {
  // RED ON REVERT. The section used to render its eyebrow, intro and a tri-state line even with no
  // rows. On a client surface that teaches the reader a machine graded their words, for no gain — the
  // page shows no gap, so there is nothing to account for. The state is still kept; it moves under
  // the operator toggle, where the person who needs it can read it.
  const STATES: Array<FirstReadPreviewData["unstatedIntegrity"]> = ["not_yet", "looked_none", "couldnt_check"];
  for (const state of STATES) {
    it(`(gE1) ${state} renders NOTHING on the client — no eyebrow, no intro, no state line`, () => {
      const { container } = render(<ActWhoYouServe read={readWith([], state)} />);
      const text = container.textContent ?? "";
      expect(text).not.toContain(EYEBROW);
      expect(text).not.toContain(INTRO);
      expect(text).not.toContain("Not read yet");
      expect(text).not.toContain("Every group we saw");
      expect(text).not.toContain("Couldn't finish this read");
      expect(container.querySelector(".fr-unstated")).toBeNull();
    });
  }

  it("(gE1) REGRESSION GUARD: rows still render when there ARE rows", () => {
    const { container } = render(<ActWhoYouServe read={readWith([group({})])} />);
    expect(container.textContent).toContain(EYEBROW);
    expect(container.querySelectorAll(".fr-unstated-item").length).toBe(1);
  });
});
