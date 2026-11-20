// SP-441 / SP-443 / SP-444 (2026-11-19): the proposed-needs review group on the workspace Inputs page.
//
// The masking case is the one that matters most: `maskReviewerNames` had NO production caller before
// this slice, so a quote opener that did not call it would ship reviewer names on a new surface. The
// fixture below carries the real ConsumerAffairs byline shape, glued name and all.
import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render } from "@testing-library/react";
import { tallyNeed, type EvidenceRow } from "@/lib/needEvidenceCounting";
import { OUTSIDE_VOICE_MARK } from "@/lib/outsideVoiceMark";
import { WORKSPACE_STRINGS } from "./workspaceNav";

const CA_URL = "https://www.consumeraffairs.com/internet/spectrum.html";
const APP_URL = "https://apps.apple.com/us/app/spectrum-tv/id420455839";
const PLAY_URL = "https://play.google.com/store/apps/details?id=com.TWCableTV";
/** 640 characters, so the clip rule (600) has something to cut. */
const LONG = `Internet goes out at random for hours on end and nobody can tell me why. ${"x".repeat(1200)}`;

const quote = (n: number, over: Partial<{ quote: string; brand: string; sourceUrl: string; eventDate: string | null }> = {}) => ({
  signalId: `sig-${n}`,
  quote: over.quote ?? `quote number ${n}`,
  brand: over.brand ?? "spectrum",
  sourceUrl: over.sourceUrl ?? CA_URL,
  eventDate: over.eventDate === undefined ? "2026-09-30" : over.eventDate,
});

const tally = (quotes: ReturnType<typeof quote>[]) =>
  tallyNeed(quotes.map((q): EvidenceRow => ({ bears: true, polarity: null, brand: q.brand, eventDate: q.eventDate, sourceUrl: q.sourceUrl })));

// AT THE BAR: 3 counted quotes from 2 sites — clears the bar and sits exactly on the quote floor.
const atBarQuotes = [
  quote(1, { quote: "Report\n\nStewartMyrtle Beach, SC\n\n21- times Spectrum internet has been down in 2- weeks." }),
  quote(2, { sourceUrl: APP_URL, eventDate: null }),
  quote(3, { sourceUrl: APP_URL, quote: LONG }),
];
// Well past the bar: 5 counted from 3 sites, so the quote list has a remainder to state.
const bigQuotes = [1, 2, 3, 4, 5].map((n) => quote(n + 10, {
  sourceUrl: n > 3 ? PLAY_URL : n > 1 ? APP_URL : CA_URL,
  // the FIFTH quote — only visible once revealed — carries a byline, so the masking assertion above
  // is about the revealed set and not only about the first four
  ...(n === 5 ? { quote: "Report\n\nStewartMyrtle Beach, SC\n\nthe outage lasted three days." } : {}),
}));

const reject = vi.fn(async () => {});
const accept = vi.fn(async () => {});

vi.mock("@/hooks/useCompany", () => ({ useCompany: () => ({ activeCompany: { id: "co", name: "Charter Communications" } }) }));
vi.mock("@/hooks/useCandidateQueue", () => ({
  useCandidateQueue: () => ({
    loading: false,
    error: null,
    storedBrands: ["spectrum", "cox"],
    reload: async () => {},
    accept,
    reject,
    cards: [
      { id: "file-card", surfaceType: "candidate_need", outsideVoice: false, headline: "A NEED READ OUT OF AN UPLOADED FILE",
        voice: "unlabeled", signalIds: [], quotes: [], tally: tallyNeed([]), canAccept: true, createdAt: "2026-11-17T00:00:00Z" },
      { id: "at-bar", surfaceType: "candidate_need", outsideVoice: true, headline: "A NEED EXACTLY AT THE BAR",
        voice: "outside", signalIds: atBarQuotes.map((q) => q.signalId), quotes: atBarQuotes, tally: tally(atBarQuotes), canAccept: true, createdAt: "2026-11-19T00:00:00Z" },
      { id: "past-bar", surfaceType: "candidate_need", outsideVoice: true, headline: "A NEED WELL PAST THE BAR",
        voice: "outside", signalIds: bigQuotes.map((q) => q.signalId), quotes: bigQuotes, tally: tally(bigQuotes), canAccept: true, createdAt: "2026-11-19T00:00:01Z" },
      // Not a need: the group's label is "Proposed needs — review", so it is never in the list.
      { id: "route-card", surfaceType: "candidate_route", outsideVoice: false, headline: "A ROUTE CANDIDATE",
        voice: "unlabeled", signalIds: [], quotes: [], tally: tallyNeed([]), canAccept: false, createdAt: "2026-11-17T00:00:00Z" },
    ],
  }),
}));

import { ProposedNeedsReview } from "./reviewGroup";

const draw = (canApply = true) => render(<ProposedNeedsReview companyId="co" canApply={canApply} />);

describe("the review group (SP-441)", () => {
  it("SP-453: two groups, each with its own label and a count that is TRUE of the cards under it", () => {
    const { container } = draw();
    const outside = container.querySelector('[data-testid="review-group-outside"]')!;
    const files = container.querySelector('[data-testid="review-group-files"]')!;
    expect(outside.querySelector('[data-testid="review-group-title"]')!.textContent).toBe(WORKSPACE_STRINGS.proposedNeedsReview);
    expect(outside.querySelector('[data-testid="review-group-count"]')!.textContent).toBe("2 pending · outside voice");
    expect([...outside.querySelectorAll(".fr-ws-review-headline")].map((h) => h.textContent))
      .toEqual(["A NEED EXACTLY AT THE BAR", "A NEED WELL PAST THE BAR"]);
    expect(files.querySelector('[data-testid="review-group-files-title"]')!.textContent).toBe(WORKSPACE_STRINGS.proposedNeedsFromFiles);
    expect(files.querySelector('[data-testid="review-group-files-count"]')!.textContent).toBe("1 pending");
    expect([...files.querySelectorAll(".fr-ws-review-headline")].map((h) => h.textContent))
      .toEqual(["A NEED READ OUT OF AN UPLOADED FILE"]);
    // a route candidate is not a proposed NEED, so neither label covers it
    expect(container.textContent).not.toContain("A ROUTE CANDIDATE");
  });

  it("the card carries its kind and voice chips and the site names, as the signed mock shows", () => {
    const { container } = draw();
    const card = [...container.querySelectorAll('[data-testid="review-card"]')]
      .find((c) => c.textContent?.includes("WELL PAST THE BAR"))!;
    expect(card.querySelector(".fr-ws-review-meta")!.textContent).toContain("Need · Outside voices");
    expect(card.querySelector('[data-testid="review-card-sites"]')!.textContent).toBe("App Store · ConsumerAffairs · Google Play");
  });

  it("the mark is on the outside-voice cards and on no other", () => {
    const { container } = draw();
    const marks = [...container.querySelectorAll('[data-testid="review-card-mark"]')];
    expect(marks).toHaveLength(2);
    // the mock renders it as a tag, not as another mono chip
    for (const m of marks) expect(m.className).toBe("fr-ws-review-tag");
    for (const m of marks) expect(m.textContent).toContain(OUTSIDE_VOICE_MARK);
    const fileCard = [...container.querySelectorAll('[data-testid="review-card"]')]
      .find((c) => c.textContent?.includes("UPLOADED FILE"))!;
    expect(fileCard.querySelector('[data-testid="review-card-mark"]')).toBeNull();
  });

  it("the count is the opener (B-10), and only a card whose quotes ARE counted quotes has one", () => {
    const { container } = draw();
    const openers = [...container.querySelectorAll('[data-testid="review-card-open"]')].map((b) => b.textContent);
    expect(openers).toEqual(["3 counted quotes · 2 sites \u2193", "5 counted quotes · 3 sites \u2193"]);
  });

  it("'At the bar' marks the need that clears the bar and sits on a floor — not the one past it", () => {
    const { container } = draw();
    const bars = [...container.querySelectorAll('[data-testid="review-card-bar"]')];
    expect(bars).toHaveLength(1);
    expect(bars[0].textContent).toContain(WORKSPACE_STRINGS.atTheBar);
    expect(bars[0].closest('[data-testid="review-card"]')!.textContent).toContain("EXACTLY AT THE BAR");
    // SP-452 item 6: ONE class, so the Brief cannot drift to another colour (BriefPage.test asserts the same)
    expect(bars[0].className).toBe("fr-ws-bar-mark fr-mono");
  });

  it("Accept is hidden without governance.proposal.apply; Reject is not (SP-444)", () => {
    const off = draw(false).container;
    expect(off.querySelectorAll('[data-testid="review-card-accept"]')).toHaveLength(0);
    expect(off.querySelectorAll('[data-testid="review-card-reject"]')).toHaveLength(3);
    const on = draw(true).container;
    expect(on.querySelectorAll('[data-testid="review-card-accept"]')).toHaveLength(3);
  });

  it("Reject marks the proposal — it names the row, and nothing deletes it", async () => {
    const { container } = draw();
    const card = [...container.querySelectorAll('[data-testid="review-card"]')]
      .find((c) => c.textContent?.includes("EXACTLY AT THE BAR"))!;
    // The handler awaits the write, so the state update after it belongs inside act().
    await act(async () => { fireEvent.click(card.querySelector('[data-testid="review-card-reject"]')!); });
    expect(reject).toHaveBeenCalledWith("at-bar");
  });
});

describe("the quotes behind a count (SP-443)", () => {
  const open = (headline: string) => {
    const { container } = draw();
    const card = [...container.querySelectorAll('[data-testid="review-card"]')]
      .find((c) => c.textContent?.includes(headline))!;
    fireEvent.click(card.querySelector('[data-testid="review-card-open"]')!);
    return card;
  };

  it("each quote carries brand · site · date, and the signed line where the page showed none", () => {
    const card = open("EXACTLY AT THE BAR");
    const metas = [...card.querySelectorAll(".fr-ws-quote-meta")].map((p) => p.textContent);
    expect(metas[0]).toBe("spectrum · ConsumerAffairs · September 30, 2026");
    expect(metas[1]).toBe(`spectrum · App Store · ${WORKSPACE_STRINGS.dateNotShown}`);
  });

  it("the quote marks are the surface's; the stored text carries none", () => {
    const card = open("EXACTLY AT THE BAR");
    const t = card.querySelector(".fr-ws-quote-text")!.textContent ?? "";
    expect(t.startsWith("\u201C")).toBe(true);
    expect(t.endsWith("\u201D")).toBe(true);
  });

  it("MASKING IS STILL THE SECOND LAYER — a name in the stored quote never reaches the screen", () => {
    const card = open("EXACTLY AT THE BAR");
    const text = card.querySelector(".fr-ws-quote-text")!.textContent ?? "";
    expect(text).not.toContain("Stewart");
    expect(text).toContain("[reviewer]");
    expect(text).toContain("Myrtle Beach, SC");
  });

  it("a long quote is clipped with a VISIBLE ellipsis, never silently cut", () => {
    const card = open("EXACTLY AT THE BAR");
    const clipped = card.querySelector('[data-fr-clipped="true"]');
    expect(clipped).not.toBeNull();
    expect(clipped!.querySelector(".fr-ws-quote-text")!.textContent!.endsWith("\u2026\u201D")).toBe(true);
    expect(clipped!.querySelector(".fr-ws-quote-text")!.textContent!.length).toBeLessThan(LONG.length);
  });

  it("SP-455b: the remainder is a CONTROL that reveals every quote, in the First Read's own words", () => {
    const card = open("WELL PAST THE BAR");
    const list = card.querySelector('[data-testid="quote-list"]')!;
    expect(list.getAttribute("data-fr-showing")).toBe("4");
    const btn = card.querySelector('[data-testid="quote-show-all"]') as HTMLButtonElement;
    expect(btn.textContent).toContain("Show all 5");
    expect(btn.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(btn);
    expect(list.getAttribute("data-fr-showing")).toBe("5");
    expect(card.querySelectorAll('[data-testid="quote"]')).toHaveLength(5);
    expect(btn.textContent).toContain("Show fewer");
    expect(btn.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(btn);
    expect(list.getAttribute("data-fr-showing")).toBe("4");
  });

  it("the masking and date rules apply to the REVEALED quotes too — one call, not a second path", () => {
    const card = open("WELL PAST THE BAR");
    fireEvent.click(card.querySelector('[data-testid="quote-show-all"]')!);
    const metas = [...card.querySelectorAll(".fr-ws-quote-meta")].map((p) => p.textContent);
    expect(metas).toHaveLength(5);
    for (const m of metas) expect(m).toMatch(/· (September 30, 2026|date not shown)$/);
    expect(card.textContent).not.toContain("Stewart");
  });

  it("a card with nothing hidden has no control at all", () => {
    expect(open("EXACTLY AT THE BAR").querySelector('[data-testid="quote-show-all"]')).toBeNull();
  });
});
