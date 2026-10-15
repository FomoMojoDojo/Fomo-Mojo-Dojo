// ── THE COMMITMENT SOURCE LINE (1a-4, strings S3-S6 + S9, signed 2026-10-08) ────────────────────
//
// Under every commitment: head · host · published. The head is the CLASS, so a reader never has to
// guess whether a line is the record speaking, the company speaking, or us reading. An our_read line
// names the record/you rows it rests on — the mix — and never names our own rows.
//
// The fixture is Edgewood's real 2b dry-run data: the hosts and the years come from the payload and
// the ledger, never typed into the render.
import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { CHANNELS_FRAME_HEAD, CommitmentSource, OurReadTag, orderedSources, VENUE_ORDER, venueOf } from "./primitives";
import { ActPositioning, ActStrategy } from "./acts";
import { EMPTY_FIRST_READ, type FirstReadPreviewData, type FRSourceRef } from "./types";

const MIGHTYCAUSE: FRSourceRef = { host: "mightycause.com", published: "2023", cls: "record" };
const GUIDESTAR: FRSourceRef = { host: "guidestar.org", published: "2024", cls: "you" };
const PSYCHTODAY: FRSourceRef = { host: "psychologytoday.com", published: "April 30, 2026", cls: "record" };
const txt = (el: JSX.Element) => render(el).container.textContent ?? "";

describe("the head is the class (S3 / S4 / S5 / S6)", () => {
  it("record → S3 'In the record'", () => {
    expect(txt(<CommitmentSource sourceClass="record" sources={[MIGHTYCAUSE]} />))
      .toBe("In the record · mightycause.com · 2023");
  });
  it("you → S4 'On your site' when the source IS the company's own site", () => {
    // V1 (2026-10-15): the flag, not the host string. ownSite comes from isOwnDomainUrl in the
    // adapter — the single authority — and the renderer never compares hosts itself.
    expect(txt(<CommitmentSource sourceClass="you" sources={[{ host: "edgewood.org", published: null, cls: "you", ownSite: true }]} />))
      .toBe("On your site · edgewood.org");
  });
  it("V1: a you row that is NOT the own site is 'In your channels' — the renderer never infers from the host", () => {
    // the same host WITHOUT the flag is not own-site. That is deliberate: a renderer that guessed
    // from the string would be a second definition of "your site", and two definitions is how the
    // old eyebrow came to put en.wikipedia.org under "On your site".
    expect(txt(<CommitmentSource sourceClass="you" sources={[{ host: "edgewood.org", published: null, cls: "you" }]} />))
      .toBe("In your channels · edgewood.org");
    expect(txt(<CommitmentSource sourceClass="you" sources={[{ host: "linkedin.com", published: null, cls: "you" }]} />))
      .toBe("In your channels · linkedin.com");
  });
  it("V1: a third_party_profile row is 'In your profile', whatever else is true of it", () => {
    expect(txt(<CommitmentSource sourceClass="you" sources={[{ ...GUIDESTAR, thirdPartyProfile: true }]} />))
      .toBe("In your profile · guidestar.org · 2024");
    // the marker wins even over an own-site flag: a marked profile page is a profile
    expect(txt(<CommitmentSource sourceClass="you" sources={[{ ...GUIDESTAR, thirdPartyProfile: true, ownSite: true }]} />))
      .toBe("In your profile · guidestar.org · 2024");
  });
  it("V1: a record row is NEVER relabelled by a venue flag", () => {
    expect(txt(<CommitmentSource sourceClass="you" sources={[{ host: "en.wikipedia.org", published: null, cls: "record", ownSite: true }]} />))
      .toBe("In the record · en.wikipedia.org");
  });
  it("you → S6 'In your filing' / 'In your profile' for a registry row (the C2 frames, reused)", () => {
    expect(txt(<CommitmentSource sourceClass="you" sources={[{ ...GUIDESTAR, registryFrame: "filing" }]} />))
      .toBe("In your filing · guidestar.org · 2024");
    expect(txt(<CommitmentSource sourceClass="you" sources={[{ ...GUIDESTAR, registryFrame: "profile" }]} />))
      .toBe("In your profile · guidestar.org · 2024");
  });
  it("our_read → S5 'Our read', then the rows it rests on, EACH under its own venue", () => {
    // V1: the line is still ours — that word is kept and still comes first — but the rows it rests
    // on are now named by WHERE each was said, in the signed order, instead of all of them sharing
    // one head taken from the line's class.
    expect(txt(<CommitmentSource sourceClass="our_read" sources={[MIGHTYCAUSE, GUIDESTAR]} />))
      .toBe("Our read · In your channels · guidestar.org · 2024 · In the record · mightycause.com · 2023");
  });
  it("renders NOTHING without a class — a legacy read shows no source line, never a guessed one", () => {
    expect(txt(<CommitmentSource sources={[MIGHTYCAUSE]} />)).toBe("");
    expect(txt(<CommitmentSource sourceClass={null} sources={[MIGHTYCAUSE]} />)).toBe("");
  });
});

describe("segments are omitted, never invented", () => {
  it("drops the published segment when there is no date, with no dangling separator", () => {
    expect(txt(<CommitmentSource sourceClass="record" sources={[{ host: "give.org", published: null, cls: "record" }]} />))
      .toBe("In the record · give.org");
  });
  it("an our_read line with no record/you citation is the head alone", () => {
    expect(txt(<CommitmentSource sourceClass="our_read" sources={[]} />)).toBe("Our read");
    // our OWN rows attribute nothing and are never named
    expect(txt(<CommitmentSource sourceClass="our_read" sources={[{ host: "edgewood.org", published: null, cls: "our_read" }]} />))
      .toBe("Our read");
  });
});

describe("the mix: deduped by host, newest first, capped", () => {
  it("dedupes by host and prefers the dated row", () => {
    const got = orderedSources([
      { host: "guidestar.org", published: null, cls: "you" },
      { host: "guidestar.org", published: "2024", cls: "you" },
    ]);
    expect(got).toHaveLength(1);
    expect(got[0].published).toBe("2024");
  });
  // ruling 2026-10-08: the order is decided on the RAW ISO date. Sorting the rendered segment put
  // "December 1, 2020" above "2025", because "D" > "2" — invisible on the data it shipped against.
  it("orders a December date BELOW a later year-only date (the display-string bug)", () => {
    const got = orderedSources([
      { host: "old.com", published: "December 1, 2020", publishedAt: "2020-12-01", cls: "record" },
      { host: "new.com", published: "2025", publishedAt: "2025-01-01", cls: "record" },
    ]);
    expect(got.map((s) => s.host)).toEqual(["new.com", "old.com"]);
    // and the display string alone would have got it backwards
    expect("December 1, 2020".localeCompare("2025")).toBeGreaterThan(0);
  });
  it("dedupes by host on the raw date too — the later row wins", () => {
    const got = orderedSources([
      { host: "guidestar.org", published: "December 1, 2020", publishedAt: "2020-12-01", cls: "you" },
      { host: "guidestar.org", published: "2024", publishedAt: "2024-01-01", cls: "you" },
    ]);
    expect(got).toHaveLength(1);
    expect(got[0].published).toBe("2024");
  });
  it("orders dated before undated", () => {
    const got = orderedSources([{ host: "a.com", published: null, cls: "record" }, { host: "b.com", published: "2023", cls: "record" }]);
    expect(got.map((s) => s.host)).toEqual(["b.com", "a.com"]);
  });
  it("names at most three hosts, then +n", () => {
    const four: FRSourceRef[] = ["a.com", "b.com", "c.com", "d.com"].map((host, i) => ({ host, published: `202${4 - i}`, cls: "record" as const }));
    expect(txt(<CommitmentSource sourceClass="record" sources={four} />))
      .toBe("In the record · a.com · 2024 · b.com · 2023 · c.com · 2022 · +1");
  });
});

describe("OurReadTag (S9): the tag with no date is the head alone", () => {
  it("renders 'Our read' with no trailing separator when there is no published segment", () => {
    expect(txt(<OurReadTag />)).toBe("Our read");
    expect(txt(<OurReadTag>{""}</OurReadTag>)).toBe("Our read");
  });
  it("keeps the date when there is one", () => {
    expect(txt(<OurReadTag>September 11, 2026</OurReadTag>)).toBe("Our read · September 11, 2026");
  });
});

// ── THE LIVE EDGEWOOD CASE ──────────────────────────────────────────────────────────────────────
// positioning.unique_attributes[0] from the 2b dry run: class our_read, citing the mightycause row
// (record, published 2023-01-01 → the YEAR) and the GuideStar filing (you, 2024-01-01 → 2024).
describe("LIVE: the Level 14 commitment names what it rests on", () => {
  const read: FirstReadPreviewData = {
    ...EMPTY_FIRST_READ,
    positioning: {
      category: "nonprofit youth mental healthcare provider",
      value: null, bestFit: null,
      differentiators: ["operates the only level 14 residential facility in northern California and the only crisis stabilization unit serving youth under 12 in the Bay Area"],
      sourceTag: null,
      fieldSources: {
        category: { cls: "our_read", sources: [] },
        "differentiators.0": { cls: "our_read", sources: [MIGHTYCAUSE, { ...GUIDESTAR, registryFrame: null }] },
      },
    },
  };
  // ORDERING. The ruling says "newest first", so the 2024 filing precedes the 2023 profile. The
  // brief's acceptance line lists mightycause first, which is the oldest — the two cannot both hold.
  // The RULE is implemented; the example is reported as the discrepancy.
  it("names both rows it rests on, newest first", () => {
    const out = txt(<ActPositioning read={read} />);
    // V1: each rested-on row under its own venue, in the signed order
    expect(out).toContain("Our read · In your channels · guidestar.org · 2024 · In the record · mightycause.com · 2023");
    // both hosts and both years are present, and they came from the data
    for (const part of ["mightycause.com", "2023", "guidestar.org", "2024"]) expect(out).toContain(part);
  });
  it("and the category, which rests on nothing citable, is the head alone", () => {
    expect(txt(<ActPositioning read={read} />)).toContain("Our read");
  });
});

describe("LIVE: a strategy rung whose class is the record", () => {
  const read: FirstReadPreviewData = {
    ...EMPTY_FIRST_READ,
    strategy: {
      aspiration: null,
      whereToPlay: "Youth and families in San Francisco and San Mateo counties.",
      howToWin: "Edgewood operates the only level 14 residential facility in northern California.",
      capabilities: [], managementSystems: [], sourceTag: null,
      fieldSources: {
        whereToPlay: { cls: "record", sources: [PSYCHTODAY] },
        howToWin: { cls: "you", sources: [{ ...GUIDESTAR, registryFrame: "filing" }] },
      },
    },
  };
  it("renders the record frame on one rung and the filing frame on the other", () => {
    const out = txt(<ActStrategy read={read} />);
    expect(out).toContain("In the record · psychologytoday.com · April 30, 2026");
    expect(out).toContain("In your filing · guidestar.org · 2024");
  });

  // ── THE RUNG GRID (2026-10-15) ────────────────────────────────────────────────────────────────
  // .fr-rung-cols is a THREE-COLUMN GRID, and a source line rendered as a SIBLING of its rung is a
  // direct grid child: it takes a cell of its own and pushes every later rung along by one. On the
  // operator screenshot that put "In the record · findhelp.org · 2024" at the top of the middle
  // column with no line above it, and the how-to-win source alone in the bottom-left cell.
  // Verified at 274bfd83 in a worktree: byte-identical layout, so this predates V1 — V1 only made
  // the strings longer, which is what made it visible.
  it("every rung source sits INSIDE its own rung, never as a sibling in the grid", () => {
    const { container } = render(<ActStrategy read={read} />);
    const grid = container.querySelector(".fr-rung-cols");
    expect(grid).not.toBeNull();
    // the grid's direct children are rungs and nothing else
    for (const child of [...grid!.children]) {
      expect(child.className).toContain("fr-rung");
      expect(child.matches('[data-testid="commitment-source"]')).toBe(false);
    }
    // and each source is inside a rung, with its own line
    const sources = [...container.querySelectorAll('[data-testid="commitment-source"]')];
    expect(sources.length).toBe(2);
    for (const src of sources) {
      const rung = src.closest(".fr-rung");
      expect(rung).not.toBeNull();
      expect(rung!.querySelector(".fr-rung-text")).not.toBeNull();   // the line it belongs to
    }
  });

});

describe("CommitmentSource renders exactly ONE root element", () => {
  it("one root, whatever the number of venue groups", () => {
    for (const sources of [
      [{ host: "a.example", published: null, cls: "you" as const, ownSite: true }],
      [{ host: "a.example", published: null, cls: "you" as const, ownSite: true },
       { host: "b.example", published: null, cls: "record" as const }],
      [{ host: "a.example", published: null, cls: "you" as const, ownSite: true },
       { host: "b.example", published: null, cls: "record" as const },
       { host: "c.example", published: null, cls: "you" as const, thirdPartyProfile: true }],
    ]) {
      const { container } = render(<CommitmentSource sourceClass="you" sources={sources} />);
      expect(container.childNodes.length).toBe(1);
      expect((container.firstChild as HTMLElement).tagName).toBe("SPAN");
      // every group head is inside that ONE span — a fragment would put them side by side, and in a
      // grid each would take its own cell.
      expect(container.querySelectorAll('[data-testid="commitment-source"]').length).toBe(1);
    }
  });
});

describe("LEGACY: a read with no classes map renders no source line at all", () => {
  const read: FirstReadPreviewData = {
    ...EMPTY_FIRST_READ,
    positioning: { category: "a neighborhood cafe", value: null, bestFit: null, differentiators: ["roasts to order"], sourceTag: null },
  };
  it("shows the commitment and nothing under it", () => {
    const { container } = render(<ActPositioning read={read} />);
    expect(container.textContent ?? "").toContain("roasts to order");
    expect(container.querySelectorAll('[data-testid="commitment-source"]')).toHaveLength(0);
  });
});

describe("a source line is NOT markable", () => {
  it("carries no mark anchor", () => {
    const { container } = render(<CommitmentSource sourceClass="our_read" sources={[MIGHTYCAUSE]} />);
    const el = container.querySelector('[data-testid="commitment-source"]')!;
    expect(el.querySelectorAll("[data-mark-key]")).toHaveLength(0);
    expect(el.getAttribute("data-mark-key")).toBeNull();
    expect(el.closest("[data-mark-key]")).toBeNull();
  });
});

// ── V1 (operator ruling, 2026-10-15): EACH SOURCE IS LABELLED BY ITS OWN VENUE ──────────────────
//
// The head used to be the LINE's class, and every cited host was listed beneath that one word.
// Wasabi's market_category is class `you` (weakest wins over a crunchbase client_voice row), so
// en.wikipedia.org — a row classed `record` — rendered under "On your site", as did gartner.com and
// linkedin.com on the value line. The line's class was right; the eyebrow answered a different
// question from the one it appeared to answer. Row classes do not change.
describe("V1: the venue of ONE source", () => {
  const S = (over: Partial<FRSourceRef>): FRSourceRef =>
    ({ host: "h.example", published: null, cls: "you", ...over });

  it("the signed strings, and the signed order", () => {
    expect(CHANNELS_FRAME_HEAD).toBe("In your channels");
    expect(VENUE_ORDER).toEqual([
      "On your site", "In your filing", "In your profile",
      "In your channels", "In the record", "Our read",
    ]);
  });

  it("class decides first: record and our_read are never relabelled", () => {
    expect(venueOf(S({ cls: "record", ownSite: true, thirdPartyProfile: true, registryFrame: "filing" })))
      .toBe("In the record");
    expect(venueOf(S({ cls: "our_read", ownSite: true }))).toBe("Our read");
  });

  it("within class you: filing, then profile, then own site, then channels", () => {
    expect(venueOf(S({ registryFrame: "filing" }))).toBe("In your filing");
    expect(venueOf(S({ registryFrame: "profile" }))).toBe("In your profile");
    expect(venueOf(S({ thirdPartyProfile: true }))).toBe("In your profile");
    expect(venueOf(S({ ownSite: true }))).toBe("On your site");
    expect(venueOf(S({}))).toBe("In your channels");
    // a marked profile is a profile even if something also flagged it own-site: the markers name a
    // page on someone ELSE's host, so reading them first means a stale flag cannot override them.
    expect(venueOf(S({ thirdPartyProfile: true, ownSite: true }))).toBe("In your profile");
  });

  it("own-site is the FLAG from isOwnDomainUrl — never a host comparison in the renderer", async () => {
    const src = await import("node:fs/promises")
      .then((fs) => fs.readFile("src/views/client/firstReadPreview/primitives.tsx", "utf8"));
    const fn = src.slice(src.indexOf("export function venueOf"), src.indexOf("\n}", src.indexOf("export function venueOf")));
    expect(fn).toContain("s.ownSite === true");
    for (const forbidden of ["endsWith", "includes(", "companyHost", "new URL", "replace(/^www"]) {
      expect(fn).not.toContain(forbidden);
    }
    // and the adapter gets the flag from the one authority
    const adapter = await import("node:fs/promises")
      .then((fs) => fs.readFile("src/views/client/firstReadPreview/useFirstReadPreviewData.ts", "utf8"));
    expect(adapter).toContain('ownSite: isOwnDomainUrl(String(r.source_url ?? ""), companyHost)');
  });

  it("EVERY source builder carries the venue data — the slot-led screen is a builder too", () => {
    // There are THREE places that build an FRSourceRef[]: the array-element line, the full-read
    // field, and the SLOT line. I updated two and shipped a screenshot where edgewood.org — the own
    // host — read "In your channels", because the slot-led screen is the one Wasabi and Edgewood
    // actually render and its builder had dropped the flags. A count, so a fourth cannot be missed.
    const adapter = readFileSync("src/views/client/firstReadPreview/useFirstReadPreviewData.ts", "utf8");
    const builders = [...adapter.matchAll(/const sources: FRSourceRef\[\] = \[\]/g)].length;
    const carrying = [...adapter.matchAll(/sources\.push\(\{ host:[^\n]*ownSite:[^\n]*thirdPartyProfile:/g)].length;
    expect(carrying).toBe(builders);
  });
});

describe("V1: a line groups its sources by venue, in the signed order", () => {
  it("THE WASABI CASE: wikipedia leaves 'On your site' and keeps its own venue", () => {
    const out = txt(<CommitmentSource sourceClass="you" sources={[
      { host: "crunchbase.com", published: "September 11, 2026", cls: "you", thirdPartyProfile: true },
      { host: "en.wikipedia.org", published: "April 2, 2025", cls: "record" },
    ]} />);
    expect(out).toBe("In your profile · crunchbase.com · September 11, 2026 · In the record · en.wikipedia.org · April 2, 2025");
    expect(out).not.toContain("On your site");
  });

  it("every venue present, each with its hosts, in order", () => {
    const out = txt(<CommitmentSource sourceClass="you" sources={[
      { host: "r.example", published: null, cls: "record" },
      { host: "chan.example", published: null, cls: "you" },
      { host: "own.example", published: null, cls: "you", ownSite: true },
    ]} />);
    expect(out).toBe("On your site · own.example · In your channels · chan.example · In the record · r.example");
    expect(out.indexOf("On your site")).toBeLessThan(out.indexOf("In your channels"));
    expect(out.indexOf("In your channels")).toBeLessThan(out.indexOf("In the record"));
  });

  it("a venue with no sources prints no head", () => {
    expect(txt(<CommitmentSource sourceClass="you" sources={[{ host: "own.example", published: null, cls: "you", ownSite: true }]} />))
      .toBe("On your site · own.example");
  });

  it("the per-line host cap still holds, and +n counts what it left out", () => {
    const many: FRSourceRef[] = ["a", "b", "c", "d"].map((h) => ({ host: `${h}.example`, published: null, cls: "you", ownSite: true }));
    expect(txt(<CommitmentSource sourceClass="you" sources={many} />)).toBe("On your site · a.example · b.example · c.example · +1");
  });
});
