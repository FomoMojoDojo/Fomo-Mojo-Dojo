// ── SP-458 / SP-465: a proposed need stands in the Brief, marked, with its patterns under it ─────
//
// The point of the slice, as one render: the two most-evidenced things customers said about Charter
// (P1, 43 counted quotes; P2, 11) were in no brief at all, because they were cards and a card has no
// row for need_evidence to hang a label on. Here they are hotspots, marked proposed, with the
// patterns the judge kept underneath.
import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
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
  { id: "pat1", needId: "accepted", name: "Agents give a different answer each time", strength: "confirmed rule", polarity: "not working", draft: true, ceilingHit: false, supporting: 9, sites: 4, representative: q("a1", CA) },
  { id: "pat2", needId: "proposed", name: "The outage is denied after the fact", strength: "likely rule", polarity: "working", draft: true, ceilingHit: false, supporting: 5, sites: 2, representative: q("p1", CA) },
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
    expect(hot.textContent).toContain("3 counted quotes · 3 sites");
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

  it("SP-459: every pattern on the page carries the draft mark", () => {
    const { container } = draw();
    const drafts = [...container.querySelectorAll('[data-testid="pattern-draft"]')];
    expect(drafts).toHaveLength(2);
    expect(drafts.every((d) => d.textContent === WORKSPACE_STRINGS.briefDraftMark)).toBe(true);
  });

  it("SP-470: each pattern shows its own polarity", () => {
    const { container } = draw();
    const pol = [...container.querySelectorAll('[data-testid="pattern-polarity"]')].map((n) => n.textContent);
    expect(pol).toEqual(["not working", "working"]);
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
    const support = [...container.querySelectorAll('[data-testid="pattern-support"]')].map((n) => n.textContent);
    expect(support).toEqual(["9 supporting quotes · 4 sites", "5 supporting quotes · 2 sites"]);
  });
});
