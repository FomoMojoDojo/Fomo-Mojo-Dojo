// S2 §6 (signed 2026-09-18) — "Your channels, as we read them" is a paraphrase block with two admission guards
// applied ONCE in the shared load path (useFirstReadPreviewData → channelRowAdmission):
//   (e) admission: a page-tied own-host row is admitted; a synthesis row (label, marker or SHAPE) is not — even
//       when its URL has a saved page; a row whose URL has no saved page (exact or canonical) is not;
//   (f) render: an OUR READ row carries NO quotation-mark glyph; an "In your words" row above it still does.
// Each proof fails if its guard is removed (planted failures reported in the gate).
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { ActWhatYouSay } from "./acts";
import { EMPTY_FIRST_READ, type FirstReadPreviewData, type FRDeclared } from "./types";
import { channelRowAdmission, savedPageIndex, tiesToSavedPage } from "@/lib/firstRead/channelAdmission";

const HOME = "https://edgewood.org/";
// The saved pages Edgewood has: the home page (own_words_page_snapshots, exact) and the outpatient page saved
// under a www / trailing-slash variant (outside_page_snapshots, canonical match only).
const PAGES = savedPageIndex([HOME, "https://www.edgewood.org/partners-providers/outpatient-mental-healthcare-services/behavioral-health-outpatient-program"]);

// The three real shapes, in miniature: b577722a (unmarked synthesis), fdad5d88 (page row), 634964b0 (page row on a
// canonical-only URL), and a page row on a URL nobody saved.
const SIG = {
  synth: { source_url: HOME, voice_class: "client_voice", raw_payload: { hypothesis: "Edgewood is a leading nonprofit provider of youth mental health and family support services in the San Francisco Bay Area." } },
  synthMarked: { source_url: HOME, voice_class: null, raw_payload: { hypothesis: "x", source_type: "analysis" } },
  synthLabelled: { source_url: HOME, voice_class: "analysis", raw_payload: { hypothesis: "x", source_type: "analysis" } },
  page: { source_url: HOME, voice_class: "client_voice", raw_payload: { bucket: "company_claim", url: HOME, snippet: "Edgewood provides expert mental healthcare for youth and families." } },
  canonical: { source_url: "https://edgewood.org/partners-providers/outpatient-mental-healthcare-services/behavioral-health-outpatient-program/", voice_class: "client_voice", raw_payload: { url: "x", snippet: "Individuals eligible for San Francisco Full Scope Medi-Cal…" } },
  unsaved: { source_url: "https://edgewood.org/careers/", voice_class: "client_voice", raw_payload: { url: "https://edgewood.org/careers/", snippet: "We are hiring." } },
};

describe("S2 §6(a)–(b) — channel admission: page-tied rows only, synthesis never", () => {
  it("(e) a page-tied row is admitted; synthesis rows are refused by shape, marker or label — even on a saved URL", () => {
    expect(channelRowAdmission(SIG.page, PAGES)).toBe("admitted");
    expect(channelRowAdmission(SIG.canonical, PAGES)).toBe("admitted");
    expect(channelRowAdmission(SIG.synth, PAGES)).toBe("synthesis");
    expect(channelRowAdmission(SIG.synthMarked, PAGES)).toBe("synthesis");
    expect(channelRowAdmission(SIG.synthLabelled, PAGES)).toBe("synthesis");
  });

  it("(e) a row whose URL has no saved page (exact or canonical) is not admitted, and is a DIFFERENT verdict from synthesis", () => {
    expect(channelRowAdmission(SIG.unsaved, PAGES)).toBe("no_saved_page");
    expect(channelRowAdmission({ ...SIG.page, source_url: null }, PAGES)).toBe("no_saved_page");
    expect(tiesToSavedPage("https://www.edgewood.org", PAGES)).toBe(true); // canonical: www + no slash → home
    expect(tiesToSavedPage("https://edgewood.org/careers/", PAGES)).toBe(false);
    // an empty page index admits nothing that is not synthesis — the whole block drops, reported
    expect(channelRowAdmission(SIG.page, savedPageIndex([]))).toBe("no_saved_page");
    expect(channelRowAdmission(SIG.synth, savedPageIndex([]))).toBe("synthesis");
  });
});

const read = (declared: FRDeclared[]): FirstReadPreviewData => ({
  ...EMPTY_FIRST_READ,
  company: { name: "Edgewood", website: "https://edgewood.org" },
  ownWords: [{ id: "o1", quote: "We provide the people, place, and path for exceptional youth mental healthcare.", pageUrl: HOME, pageHost: "edgewood.org", fidelity: "verbatim", sourceTag: { label: "edgewood.org · read September 11, 2026" } }],
  ownWordsLooked: true,
  ownWordsRun: true,
  declared,
});

describe("S2 §6(c) — OUR READ rows render without the quotation-mark glyph; In your words keeps it", () => {
  it("(f) the channel row has no .fr-quote-mark; the own-words row above still has one", () => {
    const { container } = render(<ActWhatYouSay read={read([
      { id: "c1", topic: "market", facet: "Market", statement: "Individuals eligible for San Francisco Full Scope Medi-Cal funded specialty mental health services.", sourceTag: { label: "edgewood.org · read September 24, 2025" } },
    ])} />);
    const block = container.querySelector('[data-fr-block="channels"]');
    expect(block).not.toBeNull();
    expect(block!.querySelectorAll(".fr-row")).toHaveLength(1);
    expect(block!.querySelectorAll(".fr-quote-mark")).toHaveLength(0);
    expect(block!.textContent).toContain("Our read");
    // the "In your words" row keeps its glyph — the non-empty other side
    const ownWordsGlyphs = [...container.querySelectorAll(".fr-quote-mark")].filter((el) => !block!.contains(el));
    expect(ownWordsGlyphs.length).toBeGreaterThanOrEqual(1);
    expect(container.textContent).toContain("We provide the people, place, and path");
  });
});
