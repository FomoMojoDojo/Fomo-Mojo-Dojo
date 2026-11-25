// ── SP-458 / SP-465: a proposed need stands in the Brief, marked, with its patterns under it ─────
//
// The point of the slice, as one render: the two most-evidenced things customers said about Charter
// (P1, 43 counted quotes; P2, 11) were in no brief at all, because they were cards and a card has no
// row for need_evidence to hang a label on. Here they are hotspots, marked proposed, with the
// patterns the judge kept underneath.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { tallyNeed, type EvidenceRow } from "@/lib/needEvidenceCounting";
import { OUTSIDE_VOICE_MARK, OUTSIDE_VOICE_SOURCE_PATH } from "@/lib/outsideVoiceMark";
import { WORKSPACE_STRINGS } from "./workspaceNav";

const CA = "https://www.consumeraffairs.com/internet/spectrum.html";
const APP = "https://apps.apple.com/us/app/spectrum-tv/id1";
const PLAY = "https://play.google.com/store/apps/details?id=x";
const q = (id: string, url: string) => ({ signalId: id, quote: `quote ${id}`, brand: "spectrum", sourceUrl: url, eventDate: "2026-09-30" });
const ev = (url: string): EvidenceRow => ({ bears: true, polarity: "not working", brand: "spectrum", eventDate: "2026-09-30", sourceUrl: url });

const accepted = {
  id: "accepted", statement: "AN ORDINARY ACTIVE NEED", sourcePath: "public_research", proposed: false,
  tally: tallyNeed([ev(CA), ev(APP), ev(PLAY), ev(CA)]),
  quotes: [q("a1", CA), q("a2", APP), q("a3", PLAY), q("a4", CA)], workingQuotes: [],
};
const proposed = {
  id: "proposed", statement: "A PROPOSED NEED NOBODY HAS RULED ON", sourcePath: OUTSIDE_VOICE_SOURCE_PATH, proposed: true,
  tally: tallyNeed([ev(CA), ev(APP), ev(PLAY)]),
  quotes: [q("p1", CA), q("p2", APP), q("p3", PLAY)], workingQuotes: [],
};
const thin = {
  id: "thin", statement: "A THIN PROPOSED NEED", sourcePath: OUTSIDE_VOICE_SOURCE_PATH, proposed: true,
  tally: tallyNeed([ev(CA)]), quotes: [q("t1", CA)], workingQuotes: [],
};

const patterns = [
  { id: "pat1", needId: "accepted", name: "Agents give a different answer each time", parts: ["the answer changes between agents"], strength: "confirmed rule", polarity: "not working", draft: true, ceilingHit: false, supporting: 9, sites: 4, representative: q("a1", CA), representativeSpan: "quote",
    // SP-674: the supporting quotes as the hook hands them out — no brand. "a1" is one of the need's counted quotes; "zz" is not.
    quotes: [{ ...q("a1", CA), brand: "" }, { ...q("zz", APP), brand: "" }] },
  { id: "pat3", needId: "accepted", name: "Agents hang up", parts: ["the agent hangs up"], strength: "possible failure", polarity: "not working", draft: true, ceilingHit: false, supporting: 2, sites: 2, representative: q("a2", APP), quotes: [] },
  { id: "pat2", needId: "proposed", name: "The outage is denied after the fact", parts: ["the outage is denied afterwards", "no credit is given"], strength: "likely rule", polarity: "working", draft: true, ceilingHit: false, supporting: 5, sites: 2, representative: q("p1", CA) },
];

vi.mock("@/views/client/firstReadPreview/operatorControls", () => ({ useOperatorControls: () => ({ on: true }) }));
vi.mock("@/hooks/useCompany", () => ({ useCompany: () => ({ activeCompany: { id: "co", name: "Charter Communications" } }) }));
vi.mock("@/hooks/useBriefNeeds", () => ({ useBriefNeeds: () => ({ needs: [accepted, proposed, thin], storedBrands: ["spectrum"], loading: false, error: null }) }));
vi.mock("@/hooks/useNeedPatterns", () => ({
  useNeedPatterns: () => ({ patterns, assignedByNeed: { accepted: 9, proposed: 5 }, loading: false, error: null }),
}));
vi.mock("@/hooks/useFirstReadOpenQuestions", () => ({ useFirstReadOpenQuestions: () => ({ loading: false, error: null, rows: [], questions: [] }) }));
vi.mock("@/hooks/useSupersededQuestionCount", () => ({ useSupersededQuestionCount: () => 0 }));

import BriefPage from "./BriefPage";
const draw = () => render(<MemoryRouter><BriefPage /></MemoryRouter>);

describe("SP-458: a materialised proposed need in the Brief", () => {
  it("stands in Hotspots with its counts, carrying the proposed mark", () => {
    const { container } = draw();
    const hot = container.querySelector('[data-fr-region="hotspots"]')!;
    expect(hot.textContent).toContain("A PROPOSED NEED NOBODY HAS RULED ON");
    // SP-674: the large count, its label and the sites, in the need's own section
    const section = [...hot.querySelectorAll('[data-testid="brief-need"]')].find((c) => c.textContent?.includes("A PROPOSED NEED NOBODY HAS RULED ON"))!;
    expect(section.querySelector('[data-testid="brief-hot-count"]')!.textContent).toBe("3");
    expect(section.textContent).toContain(WORKSPACE_STRINGS.countedQuotesLabel);
    expect(section.querySelector('[data-testid="brief-hot-sites"]')!.textContent).toBe("3 sites");
    const marks = [...container.querySelectorAll('[data-testid="review-card-proposed"]')].map((n) => n.textContent);
    expect(marks).toContain(WORKSPACE_STRINGS.proposedNeedMark);
  });

  it("an ACCEPTED need carries no proposed mark — the mark is about the decision, not the voice", () => {
    const { container } = draw();
    const cards = [...container.querySelectorAll('[data-testid="brief-need"]')];
    const acceptedCard = cards.find((c) => c.textContent?.includes("AN ORDINARY ACTIVE NEED"))!;
    expect(acceptedCard.querySelector('[data-testid="review-card-proposed"]')).toBeNull();
  });

  it("both marks show on the same card: outside-voice AND proposed", () => {
    const { container } = draw();
    const cards = [...container.querySelectorAll('[data-testid="brief-need"]')];
    const card = cards.find((c) => c.textContent?.includes("A PROPOSED NEED NOBODY HAS RULED ON"))!;
    expect(card.querySelector('[data-testid="review-card-mark"]')!.textContent).toBe(OUTSIDE_VOICE_MARK);
    expect(card.querySelector('[data-testid="review-card-proposed"]')!.textContent).toBe(WORKSPACE_STRINGS.proposedNeedMark);
  });

  it("a proposed need BELOW the bar is a thin spot like any other, still marked", () => {
    const { container } = draw();
    const thinBand = container.querySelector('[data-fr-region="thin-spots"]')!;
    expect(thinBand.textContent).toContain("A THIN PROPOSED NEED");
    expect(thinBand.textContent).toContain(WORKSPACE_STRINGS.belowTheBar);
    expect(thinBand.querySelector('[data-testid="review-card-proposed"]')).not.toBeNull();
  });
});

describe("SP-465: the pattern band under a hotspot", () => {
  it("renders under the need it belongs to, and under no other", () => {
    const { container } = draw();
    const cards = [...container.querySelectorAll('[data-testid="brief-need"]')];
    const acceptedCard = cards.find((c) => c.textContent?.includes("AN ORDINARY ACTIVE NEED"))!;
    const proposedCard = cards.find((c) => c.textContent?.includes("A PROPOSED NEED NOBODY HAS RULED ON"))!;
    expect(acceptedCard.textContent).toContain("Agents give a different answer each time");
    expect(acceptedCard.textContent).not.toContain("The outage is denied after the fact");
    expect(proposedCard.textContent).toContain("The outage is denied after the fact");
  });

  it("shows no band on a thin spot — patterns sit under needs that meet the bar", () => {
    const { container } = draw();
    const thinBand = container.querySelector('[data-fr-region="thin-spots"]')!;
    expect(thinBand.querySelector('[data-testid="pattern-band"]')).toBeNull();
  });

  it("SP-459 / SP-674: the draft mark stands once under the title and in the panel — not on the pattern rows", () => {
    const { container } = draw();
    expect(container.querySelectorAll('[data-testid="brief-draft"]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-testid="pattern-row"] [data-testid="pattern-draft"]')).toHaveLength(0);
    fireEvent.click(container.querySelector('[data-testid="pattern-name"]')!);
    const drafts = [...container.querySelectorAll('[data-testid="brief-panel"] [data-testid="pattern-draft"]')];
    expect(drafts.map((d) => d.textContent)).toEqual([WORKSPACE_STRINGS.briefDraftMark]);
  });

  it("SP-470: each pattern shows its own polarity", () => {
    const { container } = draw();
    const pol = [...container.querySelectorAll('[data-testid="pattern-polarity"]')].map((n) => n.textContent);
    expect(pol).toEqual(["not working", "not working", "working"]);
  });

  it("SP-476: each hotspot's band carries the coverage line, from the hook's derived numbers", () => {
    const { container } = draw();
    const lines = [...container.querySelectorAll('[data-testid="pattern-coverage"]')].map((n) => n.textContent);
    // accepted: 4 counted, 9 assigned is impossible in life but proves the numbers come from the
    // hook and the tally rather than from the pattern rows
    expect(lines).toEqual(["9 of 4 counted quotes under a pattern", "5 of 3 counted quotes under a pattern"]);
  });

  it("SP-463: the counts shown are the ones the hook derived", () => {
    const { container } = draw();
    const support = [...container.querySelectorAll('[data-testid="pattern-support"]')].map((n) => n.getAttribute("aria-label"));
    expect(support).toEqual(["9 supporting quotes · 4 sites", "2 supporting quotes · 2 sites", "5 supporting quotes · 2 sites"]);
  });
});

describe("SP-674: a hotspot's section, and the evidence panel", () => {
  // The page asks the browser whether it is 1024px wide or more. These tests say which.
  const originalMatchMedia = window.matchMedia;
  const setWide = (wide: boolean) => {
    window.matchMedia = ((query: string) => ({ matches: wide, media: query, addEventListener: () => {}, removeEventListener: () => {} })) as unknown as typeof window.matchMedia;
  };
  beforeEach(() => setWide(true));
  afterEach(() => { window.matchMedia = originalMatchMedia; });
  const sectionOf = (container: HTMLElement, text: string) =>
    [...container.querySelectorAll('[data-testid="brief-need"]')].find((c) => c.textContent?.includes(text))! as HTMLElement;

  it("only a hotspot WITH patterns gets a section; its overview row links to it and carries the Patterns tag", () => {
    const { container } = draw();
    expect(container.querySelectorAll('[data-testid="brief-need"]')).toHaveLength(2);
    const rows = [...container.querySelectorAll('[data-testid="brief-overview-row"]')];
    expect(rows.map((r) => r.getAttribute("data-fr-patterns"))).toEqual(["true", "true"]);
    expect(rows.map((r) => r.querySelector('[data-testid="brief-patterns-tag"]')!.textContent)).toEqual(["Patterns", "Patterns"]);
    const link = rows[0].querySelector('[data-testid="brief-overview-name"]') as HTMLAnchorElement;
    expect(link.tagName).toBe("A");
    expect(container.querySelector(link.getAttribute("href")!)).toBe(sectionOf(container, "AN ORDINARY ACTIVE NEED"));
    fireEvent.click(link);
    expect(document.activeElement).toBe(sectionOf(container, "AN ORDINARY ACTIVE NEED"));
    // the header's second number is exactly these
    expect(container.querySelector('[data-fr-stat="with-patterns"] dd')!.textContent).toBe("2");
  });

  it("the section head: one status bar, the counts in words, and the brand split that replaced the triple", () => {
    const { container } = draw();
    const s = sectionOf(container, "AN ORDINARY ACTIVE NEED");
    expect(s.querySelector('[data-testid="brief-need-title"]')!.textContent).toBe("AN ORDINARY ACTIVE NEED");
    expect(s.querySelectorAll('[data-testid="brief-hot-status"] [data-testid="brief-bar"]')).toHaveLength(1);
    expect([...s.querySelectorAll('[data-testid="brief-hot-polarity"]')].map((n) => n.textContent)).toEqual(["4 not working"]);
    expect(s.querySelector('[data-testid="brief-brand-split"]')!.textContent).toBe("spectrum 4");
    expect(s.querySelector('[data-testid="pattern-band-label"]')!.textContent).toBe("What keeps happening \u00b7 2");
  });

  it("'All {n} quotes' opens every counted quote of the need, through QuoteList", () => {
    const { container } = draw();
    const s = sectionOf(container, "AN ORDINARY ACTIVE NEED");
    const opener = s.querySelector('[data-testid="review-card-open"]') as HTMLButtonElement;
    expect(opener.textContent).toBe("All 4 quotes \u2193");
    expect(opener.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(opener);
    expect(opener.textContent).toBe("All 4 quotes \u2191");
    expect(s.querySelectorAll('[data-testid="quote-list"] [data-testid="quote"]')).toHaveLength(4);
  });

  it("the claim opens the panel BESIDE the page; the page is marked narrowed; Escape closes it and focus returns to the row", () => {
    const { container } = draw();
    const page = container.querySelector(".fr-ws-brief")!;
    expect(container.querySelector('[data-testid="brief-panel"]')).toBeNull();
    expect(page.getAttribute("data-fr-panel")).toBeNull();
    const claim = sectionOf(container, "AN ORDINARY ACTIVE NEED").querySelector('[data-testid="pattern-name"]') as HTMLButtonElement;
    fireEvent.click(claim);
    const panel = container.querySelector('[data-testid="brief-panel"]')!;
    // beside the page — a sibling of the content column, never inside or over it
    expect(panel.parentElement).toBe(page);
    expect(container.querySelector(".fr-ws-brief-main")!.contains(panel)).toBe(false);
    expect(page.getAttribute("data-fr-panel")).toBe("open");
    expect(panel.getAttribute("data-fr-inflow")).toBeNull();
    expect(panel.querySelector('[data-testid="brief-panel-position"]')!.textContent).toBe("Pattern \u00b7 1 of 2");
    expect(panel.querySelector('[data-testid="brief-panel-title"]')!.textContent).toBe("Agents give a different answer each time");
    expect(document.activeElement).toBe(panel.querySelector('[data-testid="brief-panel-title"]'));
    expect(claim.getAttribute("aria-expanded")).toBe("true");
    expect(claim.closest('[data-testid="pattern-row"]')!.getAttribute("data-fr-selected")).toBe("true");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(container.querySelector('[data-testid="brief-panel"]')).toBeNull();
    expect(page.getAttribute("data-fr-panel")).toBeNull();
    expect(document.activeElement).toBe(claim);
  });

  it("another claim swaps the panel's content; the close button closes it and returns focus to that row", () => {
    const { container } = draw();
    const claims = [...sectionOf(container, "AN ORDINARY ACTIVE NEED").querySelectorAll('[data-testid="pattern-name"]')] as HTMLButtonElement[];
    fireEvent.click(claims[0]);
    fireEvent.click(claims[1]);
    expect(container.querySelectorAll('[data-testid="brief-panel"]')).toHaveLength(1);
    expect(container.querySelector('[data-testid="brief-panel-title"]')!.textContent).toBe("Agents hang up");
    expect(container.querySelector('[data-testid="brief-panel-position"]')!.textContent).toBe("Pattern \u00b7 2 of 2");
    expect(claims.map((c) => c.getAttribute("aria-expanded"))).toEqual(["false", "true"]);
    fireEvent.click(container.querySelector('[data-testid="brief-panel-close"]')!);
    expect(container.querySelector('[data-testid="brief-panel"]')).toBeNull();
    expect(document.activeElement).toBe(claims[1]);
  });

  it("the panel's quotes take their brand from the need's counted quotes; one with no match shows 'Brand not recorded'", () => {
    const { container } = draw();
    fireEvent.click(sectionOf(container, "AN ORDINARY ACTIVE NEED").querySelector('[data-testid="pattern-name"]')!);
    const opener = container.querySelector('[data-testid="brief-panel-all-quotes"]') as HTMLButtonElement;
    expect(opener.textContent).toContain("All 2 quotes");
    fireEvent.click(opener);
    const metas = [...container.querySelectorAll('[data-testid="brief-panel-quotes"] .fr-ws-quote-meta')].map((n) => n.textContent);
    expect(metas).toEqual(["spectrum \u00b7 ConsumerAffairs \u00b7 September 30, 2026", "Brand not recorded \u00b7 App Store \u00b7 September 30, 2026"]);
    expect(container.textContent).not.toContain("brand_not_recorded");
  });

  it("below 1024px the panel sits in the flow, inside the row it belongs to, and the page is not narrowed", () => {
    setWide(false);
    {
      const { container } = draw();
      const claim = sectionOf(container, "AN ORDINARY ACTIVE NEED").querySelector('[data-testid="pattern-name"]') as HTMLButtonElement;
      fireEvent.click(claim);
      const panel = container.querySelector('[data-testid="brief-panel"]')!;
      expect(panel.getAttribute("data-fr-inflow")).toBe("true");
      expect(panel.parentElement).toBe(claim.closest('[data-testid="pattern-row"]'));
      expect(container.querySelector(".fr-ws-brief")!.getAttribute("data-fr-panel")).toBeNull();
      fireEvent.keyDown(window, { key: "Escape" });
      expect(container.querySelector('[data-testid="brief-panel"]')).toBeNull();
      expect(document.activeElement).toBe(claim);
    }
  });

  it("the panel leaves the shell's keys alone: an Escape with a modal dialog open is not the panel's, and no arrow key is bound", () => {
    const { container } = draw();
    fireEvent.click(sectionOf(container, "AN ORDINARY ACTIVE NEED").querySelector('[data-testid="pattern-name"]')!);
    const dialog = document.createElement("div"); dialog.setAttribute("role", "dialog"); dialog.setAttribute("aria-modal", "true"); document.body.appendChild(dialog);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(container.querySelector('[data-testid="brief-panel"]')).not.toBeNull();
    dialog.remove();
    fireEvent.keyDown(window, { key: "ArrowRight" });
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(container.querySelector('[data-testid="brief-panel-title"]')!.textContent).toBe("Agents give a different answer each time");
  });
});
