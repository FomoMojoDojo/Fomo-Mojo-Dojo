// SP-442 / SP-424 / SP-445 / SP-446 / SP-449 (2026-11-19): the Brief page.
//
// The negative case comes first: a render with no operator context is the absent state, carries no
// operator node and does not touch document.title. tests/workspace/f-no-operator-nodes asserts the
// same thing against the real route.
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { tallyNeed, type EvidenceRow } from "@/lib/needEvidenceCounting";
import { OUTSIDE_VOICE_MARK, OUTSIDE_VOICE_SOURCE_PATH } from "@/lib/outsideVoiceMark";
import { WORKSPACE_STRINGS } from "./workspaceNav";

const CA = "https://www.consumeraffairs.com/internet/spectrum.html";
const APP = "https://apps.apple.com/us/app/spectrum-tv/id1";
const PLAY = "https://play.google.com/store/apps/details?id=x";

const q = (id: string, url: string, over: Partial<{ quote: string; brand: string; eventDate: string | null }> = {}) => ({
  signalId: id, quote: over.quote ?? `quote ${id}`, brand: over.brand ?? "spectrum",
  sourceUrl: url, eventDate: over.eventDate === undefined ? "2026-09-30" : over.eventDate,
});
const ev = (brand: string, polarity: string | null, url: string, eventDate: string | null = "2026-09-30"): EvidenceRow =>
  ({ bears: true, polarity, brand, eventDate, sourceUrl: url });

// HOT: 5 counted from 3 sites, one of them working, with a real ConsumerAffairs byline to mask.
const hotQuotes = [
  q("h1", CA, { quote: "Report\n\nJessicaSaginaw, MI\n\nSpectrum internet keeps going out for long periods." }),
  q("h2", CA), q("h3", APP), q("h4", APP), q("h5", PLAY), q("h6", PLAY, { brand: "brand_not_recorded" }),
];
// BAR: 3 counted from 2 sites — at the bar. Also the outside-voice-sourced need, so it carries the mark.
const barQuotes = [q("b1", CA), q("b2", APP), q("b3", APP)];
// THIN: 2 counted from 2 sites, with 3 undated Cox and 1 pre-merger Cox withheld.
const thinQuotes = [q("t1", CA), q("t2", APP)];

const needs = [
  { id: "hot", statement: "A NEED WELL PAST THE BAR", sourcePath: "public_research",
    tally: tallyNeed([ev("spectrum", "working", CA), ev("spectrum", "not working", CA), ev("spectrum", "not working", APP), ev("cox", "not working", APP), ev("cox", "mixed", PLAY), ev("brand_not_recorded", "not working", PLAY)]),
    quotes: hotQuotes, workingQuotes: [hotQuotes[0]] },
  { id: "bar", statement: "A NEED EXACTLY AT THE BAR", sourcePath: OUTSIDE_VOICE_SOURCE_PATH,
    tally: tallyNeed([ev("spectrum", "not working", CA), ev("spectrum", "not working", APP), ev("spectrum", "not working", APP)]),
    quotes: barQuotes, workingQuotes: [] },
  { id: "thin", statement: "A NEED BELOW THE BAR", sourcePath: "public_research",
    tally: tallyNeed([
      ev("spectrum", "not working", CA), ev("spectrum", "not working", APP),
      ev("cox", "not working", CA, null), ev("cox", "not working", CA, null), ev("cox", "not working", CA, null),
      ev("cox", "not working", CA, "2026-05-01"),
    ]),
    quotes: thinQuotes, workingQuotes: [] },
];

let operator: unknown = { on: true };
vi.mock("@/views/client/firstReadPreview/operatorControls", () => ({ useOperatorControls: () => operator }));
vi.mock("@/hooks/useCompany", () => ({ useCompany: () => ({ activeCompany: { id: "co", name: "Charter Communications" } }) }));
vi.mock("@/hooks/useBriefNeeds", () => ({ useBriefNeeds: () => ({ needs, storedBrands: ["spectrum", "cox"], loading: false, error: null }) }));
vi.mock("@/hooks/useFirstReadOpenQuestions", () => ({
  useFirstReadOpenQuestions: () => ({
    loading: false, error: null,
    rows: [1, 2, 3, 4, 5, 6, 7].map((n) => ({ question_text: `QUESTION ${n}`, question_identity: `qi-${n}`, source_kind: "silent_delta", finding_identity: null, anchor_identity: null })),
    questions: [],
  }),
}));
vi.mock("@/hooks/useSupersededQuestionCount", () => ({ useSupersededQuestionCount: () => 13 }));

import BriefPage from "./BriefPage";

const draw = () => render(<MemoryRouter><BriefPage /></MemoryRouter>);

describe("the Brief with no operator context (SP-442 negative case)", () => {
  it("is the absent state, carries no operator node and leaves document.title alone", () => {
    operator = null;
    document.title = "UNTOUCHED";
    const { container } = draw();
    expect(container.querySelector("[data-fr-absent]")).not.toBeNull();
    expect(container.querySelectorAll("[data-fr-operator]")).toHaveLength(0);
    expect(container.textContent).not.toContain(WORKSPACE_STRINGS.briefDraftMark);
    expect(document.title).toBe("UNTOUCHED");
    operator = { on: true };
  });
});

describe("the Brief for an operator", () => {
  it("sets <title> to \"<Page> — <company name>\" (SP-440)", () => {
    draw();
    expect(document.title).toBe("Brief — Charter Communications");
  });

  it("carries the draft mark (SP-424) and the line that says what the counts are (B-1)", () => {
    const { container } = draw();
    expect(container.querySelector('[data-testid="brief-draft"]')!.textContent).toBe(WORKSPACE_STRINGS.briefDraftMark);
    const note = container.querySelector('[data-testid="brief-note"]')!.textContent ?? "";
    expect(note).toBe(WORKSPACE_STRINGS.briefNote);
    expect(note).toContain("it is not a satisfaction rate");
  });

  it("renders the four bands, each as a read region", () => {
    const { container } = draw();
    expect([...container.querySelectorAll("[data-fr-region]")].map((e) => e.getAttribute("data-fr-region")))
      .toEqual(["hotspots", "what-works", "thin-spots", "questions"]);
  });

  it("hotspots are ranked, carry the brand polarity triple and its visible key (SP-445)", () => {
    const { container } = draw();
    const band = container.querySelector('[data-fr-region="hotspots"]')!;
    expect(band.querySelector('[data-testid="brief-polarity-key"]')!.textContent).toBe(WORKSPACE_STRINGS.polarityKey);
    const rows = [...band.querySelectorAll('[data-testid="brief-need"]')];
    expect(rows.map((r) => r.querySelector(".fr-ws-review-headline")!.textContent))
      .toEqual(["A NEED WELL PAST THE BAR", "A NEED EXACTLY AT THE BAR"]);
    expect(rows[0].querySelector('[data-testid="brief-brand-counts"]')!.textContent).toBe("Brand not recorded 0/1/0 · cox 0/1/1 · spectrum 1/2/0");
  });

  it("'At the bar' marks only the need that sits on a floor, and it is one colour on this page", () => {
    const { container } = draw();
    const bars = [...container.querySelectorAll('[data-fr-region="hotspots"] [data-testid="review-card-bar"]')];
    expect(bars).toHaveLength(1);
    expect(bars[0].textContent).toContain(WORKSPACE_STRINGS.atTheBar);
    // SP-452 item 6: the SAME class, and so the same token, as the review group uses
    expect(bars[0].className).toBe("fr-ws-bar-mark fr-mono");
    expect(bars[0].closest('[data-testid="brief-need"]')!.textContent).toContain("EXACTLY AT THE BAR");
  });

  it("an outside-voice-sourced need carries the mark; a public_research one does not", () => {
    const { container } = draw();
    const rows = [...container.querySelectorAll('[data-fr-region="hotspots"] [data-testid="brief-need"]')];
    expect(rows[1].querySelector('[data-testid="review-card-mark"]')!.textContent).toContain(OUTSIDE_VOICE_MARK);
    expect(rows[0].querySelector('[data-testid="review-card-mark"]')).toBeNull();
  });

  it("What works counts the WORKING quotes and their sites, not the need's whole evidence (SP-449)", () => {
    const { container } = draw();
    const band = container.querySelector('[data-fr-region="what-works"]')!;
    const rows = [...band.querySelectorAll('[data-testid="brief-need"]')];
    expect(rows).toHaveLength(1);
    expect(rows[0].querySelector(".fr-ws-review-headline")!.textContent).toBe("A NEED WELL PAST THE BAR");
    // The need has 5 counted quotes from 3 sites, but only ONE working quote, from one site.
    expect(rows[0].querySelector('[data-testid="review-card-open"]')!.textContent).toBe("1 counted quote · 1 site \u2193");
  });

  it("a thin spot says which floor it missed and what the merger rule withheld (B-6, B-7, B-8)", () => {
    const { container } = draw();
    const row = container.querySelector('[data-fr-region="thin-spots"] [data-testid="brief-need"]')!;
    expect(row.querySelector('[data-testid="review-card-bar"]')!.textContent).toContain(WORKSPACE_STRINGS.belowTheBar);
    expect(row.querySelector('[data-testid="brief-thin-reason"]')!.textContent)
      .toBe("too few counted quotes · 3 undated Cox and 1 pre-merger Cox not counted");
  });

  it("each count opens its quotes, with brand · site · date and the reviewer's name MASKED", () => {
    const { container } = draw();
    const row = container.querySelector('[data-fr-region="hotspots"] [data-testid="brief-need"]')!;
    fireEvent.click(row.querySelector('[data-testid="review-card-open"]')!);
    expect(row.querySelector(".fr-ws-quote-meta")!.textContent).toBe("spectrum · ConsumerAffairs · September 30, 2026");
    const text = row.querySelector(".fr-ws-quote-text")!.textContent ?? "";
    expect(text).not.toContain("Jessica");
    expect(text).toContain("[reviewer]");
    expect(text).toContain("Saginaw, MI");
  });

  it("the questions band shows the newest five and states what is not shown (B-9)", () => {
    const { container } = draw();
    const band = container.querySelector('[data-fr-region="questions"]')!;
    expect([...band.querySelectorAll('[data-testid="brief-question"]')].map((q) => q.textContent))
      .toEqual(["QUESTION 7", "QUESTION 6", "QUESTION 5", "QUESTION 4", "QUESTION 3"]);
    expect(band.querySelector('[data-testid="brief-questions-foot"]')!.textContent)
      .toBe("7 live questions · 13 superseded not shown");
  });

  it("SP-456: every live question can be read, and the footer count stays", () => {
    const { container } = draw();
    const band = container.querySelector('[data-fr-region="questions"]')!;
    const btn = band.querySelector('[data-testid="brief-questions-show-all"]') as HTMLButtonElement;
    expect(btn.textContent).toContain("Show all 7");
    fireEvent.click(btn);
    expect(band.querySelectorAll('[data-testid="brief-question"]')).toHaveLength(7);
    expect(btn.textContent).toContain("Show fewer");
    // the footer is not replaced by the control
    expect(band.querySelector('[data-testid="brief-questions-foot"]')!.textContent)
      .toBe("7 live questions · 13 superseded not shown");
    fireEvent.click(btn);
    expect(band.querySelectorAll('[data-testid="brief-question"]')).toHaveLength(5);
  });

  it("SP-456: NO raw stored enum reaches the rendered Brief", () => {
    const { container } = draw();
    const all = [...container.querySelectorAll('[data-fr-region] *')]
      .flatMap((el) => [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent ?? ""));
    const offenders = all.filter((t) => /\b[a-z0-9]+_[a-z0-9_]+\b/.test(t));
    expect(offenders, `underscore-cased value(s) on screen: ${JSON.stringify(offenders.slice(0, 3))}`).toEqual([]);
    // and the sentinel IS present, as its signed label — so this check is not vacuous
    expect(container.textContent).toContain("Brand not recorded");
    expect(container.textContent).not.toContain("brand_not_recorded");
  });
});
