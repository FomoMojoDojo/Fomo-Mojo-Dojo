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

  it("SP-674: the header carries the four numbers, each from the page's own derivations", () => {
    const { container } = draw();
    const stats = [...container.querySelectorAll('[data-testid="brief-stat"]')].map((n) => [n.getAttribute("data-fr-stat"), n.querySelector("dt")!.textContent, n.querySelector("dd")!.textContent]);
    expect(stats).toEqual([
      ["hotspots", "Hotspots", "2"], ["with-patterns", "With patterns", "0"], ["thin-spots", "Thin spots", "1"], ["questions", "Open questions", "7"],
    ]);
  });

  it("SP-674: the section links name each section with its count, mark the current one, and say what is not built yet", () => {
    const { container } = draw();
    const nav = container.querySelector('[data-testid="brief-tabs"]')!;
    expect(nav.tagName).toBe("NAV");
    expect(nav.getAttribute("aria-label")).toBe("Sections");
    const tabs = [...nav.querySelectorAll('[data-testid="brief-tab"]')] as HTMLAnchorElement[];
    expect(tabs.map((t) => t.textContent)).toEqual(["Hotspots2", "What works1", "Thin spots1", "Open questions7"]);
    // links to sections that exist on the page — not ARIA tabs, because every section stays on it
    expect(tabs.map((t) => t.getAttribute("role"))).toEqual([null, null, null, null]);
    for (const t of tabs) expect(container.querySelector(t.getAttribute("href")!)).not.toBeNull();
    expect(tabs.map((t) => t.getAttribute("aria-current"))).toEqual(["true", null, null, null]);
    fireEvent.click(tabs[2]);
    expect(tabs.map((t) => t.getAttribute("aria-current"))).toEqual([null, null, "true", null]);
    expect(document.activeElement).toBe(container.querySelector("#brief-thin-spots"));
    expect(container.querySelector('[data-testid="brief-not-built"]')!.textContent)
      .toBe("Not built yet \u00b7 So what \u00b7 Says versus customers \u00b7 Practices \u00b7 Merger signals \u00b7 Questions to ask");
  });

  it("the overview has one row per hotspot, ranked, each with one bar of its counted quotes by polarity (SP-445 → SP-674)", () => {
    const { container } = draw();
    const band = container.querySelector('[data-fr-region="hotspots"]')!;
    const rows = [...band.querySelectorAll('[data-testid="brief-overview-row"]')];
    expect(rows.map((r) => r.querySelector('[data-testid="brief-overview-name"]')!.textContent))
      .toEqual(["A NEED WELL PAST THE BAR", "A NEED EXACTLY AT THE BAR"]);
    expect(rows.map((r) => r.querySelector('[data-testid="brief-overview-count"]')!.textContent)).toEqual(["6", "3"]);
    // the bar: a segment per polarity, grown by its count, in the order not working, mixed, working
    const bar = rows[0].querySelector('[data-testid="brief-bar"]')!;
    expect([...bar.children].map((seg) => [seg.getAttribute("data-fr-polarity"), seg.getAttribute("data-fr-n")]))
      .toEqual([["not working", "4"], ["mixed", "1"], ["working", "1"]]);
    expect(bar.getAttribute("role")).toBe("img");
    expect(bar.getAttribute("aria-label")).toBe("4 not working \u00b7 1 mixed \u00b7 1 working");
    // the widest bar is the most-evidenced need; the others are in proportion
    expect((bar as HTMLElement).style.width).toBe("100%");
    expect((rows[1].querySelector('[data-testid="brief-bar"]') as HTMLElement).style.width).toBe("50%");
    // the legend shows the three stored polarity words, and the lede is the signed line
    expect([...band.querySelectorAll('[data-testid="brief-legend"] .fr-ws-pol-word')].map((n) => n.textContent)).toEqual(["not working", "mixed", "working"]);
    expect(band.querySelector('[data-testid="brief-hotspots-lede"]')!.textContent).toBe(WORKSPACE_STRINGS.briefHotspotsLede);
    // ruling 1: the per-brand polarity triple and its key are gone
    expect(container.querySelector('[data-testid="brief-polarity-key"]')).toBeNull();
    expect(container.querySelector('[data-testid="brief-brand-counts"]')).toBeNull();
    expect(container.textContent).not.toContain(WORKSPACE_STRINGS.polarityKey);
  });

  it("'At the bar' is a tag on the overview row of the need that sits on a floor, and only there", () => {
    const { container } = draw();
    const bars = [...container.querySelectorAll('[data-fr-region="hotspots"] [data-testid="review-card-bar"]')];
    expect(bars).toHaveLength(1);
    expect(bars[0].textContent).toContain(WORKSPACE_STRINGS.atTheBar);
    // SP-452 item 6: the SAME class, and so the same token, as the review group uses
    expect(bars[0].className).toBe("fr-ws-bar-mark fr-mono");
    expect(bars[0].closest('[data-testid="brief-overview-row"]')!.textContent).toContain("EXACTLY AT THE BAR");
  });

  it("a hotspot with no patterns opens its quotes from its own overview row, in place — brand · site · date, the reviewer's name MASKED", () => {
    const { container } = draw();
    const rows = [...container.querySelectorAll('[data-testid="brief-overview-row"]')];
    const opener = rows[0].querySelector('[data-testid="brief-overview-open"]') as HTMLButtonElement;
    expect(opener.tagName).toBe("BUTTON");
    // the control is named by the signed counted-quotes line (B-10)
    expect(opener.getAttribute("aria-label")).toBe("6 counted quotes \u00b7 3 sites");
    expect(opener.getAttribute("aria-expanded")).toBe("false");
    expect(rows[0].querySelector('[data-testid="quote-list"]')).toBeNull();
    fireEvent.click(opener);
    expect(opener.getAttribute("aria-expanded")).toBe("true");
    expect(rows[0].querySelector(".fr-ws-quote-meta")!.textContent).toBe("spectrum \u00b7 ConsumerAffairs \u00b7 September 30, 2026");
    const text = rows[0].querySelector(".fr-ws-quote-text")!.textContent ?? "";
    expect(text).not.toContain("Jessica");
    expect(text).toContain("[reviewer]");
    expect(text).toContain("Saginaw, MI");
    fireEvent.click(opener);
    expect(rows[0].querySelector('[data-testid="quote-list"]')).toBeNull();
  });

  it("an outside-voice-sourced need carries the mark where its quotes open; a public_research one does not", () => {
    const { container } = draw();
    const rows = [...container.querySelectorAll('[data-testid="brief-overview-row"]')];
    fireEvent.click(rows[1].querySelector('[data-testid="brief-overview-open"]')!);
    expect(rows[1].querySelector('[data-testid="review-card-mark"]')!.textContent).toContain(OUTSIDE_VOICE_MARK);
    fireEvent.click(rows[0].querySelector('[data-testid="brief-overview-open"]')!);
    expect(rows[0].querySelector('[data-testid="quote-list"]')).not.toBeNull();
    expect(rows[0].querySelector('[data-testid="review-card-mark"]')).toBeNull();
  });

  it("What works counts the WORKING quotes and their sites, not the need's whole evidence (SP-449), and opens them in place", () => {
    const { container } = draw();
    const band = container.querySelector('[data-fr-region="what-works"]')!;
    const rows = [...band.querySelectorAll('[data-testid="brief-works-row"]')];
    expect(rows).toHaveLength(1);
    expect(rows[0].querySelector('[data-testid="brief-row-name"]')!.textContent).toBe("A NEED WELL PAST THE BAR");
    // The need has 6 counted quotes from 3 sites, but only ONE working quote, from one site.
    expect(rows[0].querySelector('[data-testid="brief-row-count"]')!.textContent).toBe("1");
    const opener = rows[0].querySelector('[data-testid="brief-row-open"]') as HTMLButtonElement;
    expect(opener.getAttribute("aria-label")).toBe("A NEED WELL PAST THE BAR \u00b7 1 counted quote \u00b7 1 site");
    fireEvent.click(opener);
    expect(rows[0].querySelectorAll('[data-testid="quote"]')).toHaveLength(1);
  });

  it("a thin spot says which floor it missed and what the merger rule withheld (B-6, B-7, B-8), and opens its quotes in place", () => {
    const { container } = draw();
    const row = container.querySelector('[data-fr-region="thin-spots"] [data-testid="brief-thin-row"]')!;
    expect(row.querySelector('[data-testid="review-card-bar"]')!.textContent).toContain(WORKSPACE_STRINGS.belowTheBar);
    expect(row.querySelector('[data-testid="brief-thin-why"]')!.textContent)
      .toBe("too few counted quotes \u00b7 3 undated Cox and 1 pre-merger Cox not counted");
    expect(row.querySelector('[data-testid="brief-row-count"]')!.textContent).toBe("2");
    fireEvent.click(row.querySelector('[data-testid="brief-row-open"]')!);
    expect(row.querySelectorAll('[data-testid="quote"]')).toHaveLength(2);
  });

  it("SP-674 ruling 2: EVERY need row on the page has a control that opens its quotes", () => {
    const { container } = draw();
    const needRows = [...container.querySelectorAll('[data-testid="brief-overview-row"], [data-testid="brief-works-row"], [data-testid="brief-thin-row"]')];
    expect(needRows).toHaveLength(4);
    for (const row of needRows) {
      const opener = row.querySelector('button[aria-expanded]') as HTMLButtonElement | null;
      expect(opener, `no opener on: ${row.textContent?.slice(0, 40)}`).not.toBeNull();
      fireEvent.click(opener!);
      expect(row.querySelector('[data-testid="quote-list"]'), `no quotes behind: ${row.textContent?.slice(0, 40)}`).not.toBeNull();
    }
  });

  it("the questions band shows the newest five and states what is not shown (B-9)", () => {
    const { container } = draw();
    const band = container.querySelector('[data-fr-region="questions"]')!;
    expect([...band.querySelectorAll('[data-testid="brief-question"]')].map((q) => q.textContent))
      .toEqual(["QUESTION 7", "QUESTION 6", "QUESTION 5", "QUESTION 4", "QUESTION 3"]);
    expect(band.querySelector('[data-testid="brief-questions-foot"]')!.textContent)
      .toBe("7 live questions · 13 superseded not shown");
    // SP-674: the column head is the short label with the live count
    expect(band.querySelector("h2")!.textContent).toBe("Open questions7");
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
    fireEvent.click(container.querySelector('[data-testid="brief-overview-open"]')!);
    fireEvent.click(container.querySelector('[data-testid="quote-show-all"]')!);
    expect(container.textContent).toContain("Brand not recorded");
    expect(container.textContent).not.toContain("brand_not_recorded");
  });
});
