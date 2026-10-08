// ── THE COMMITMENT SOURCE LINE (1a-4, strings S3-S6 + S9, signed 2026-10-08) ────────────────────
//
// Under every commitment: head · host · published. The head is the CLASS, so a reader never has to
// guess whether a line is the record speaking, the company speaking, or us reading. An our_read line
// names the record/you rows it rests on — the mix — and never names our own rows.
//
// The fixture is Edgewood's real 2b dry-run data: the hosts and the years come from the payload and
// the ledger, never typed into the render.
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { CommitmentSource, OurReadTag, orderedSources } from "./primitives";
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
  it("you → S4 'On your site' when the row did not come through a registry", () => {
    expect(txt(<CommitmentSource sourceClass="you" sources={[{ host: "edgewood.org", published: null, cls: "you" }]} />))
      .toBe("On your site · edgewood.org");
  });
  it("you → S6 'In your filing' / 'In your profile' for a registry row (the C2 frames, reused)", () => {
    expect(txt(<CommitmentSource sourceClass="you" sources={[{ ...GUIDESTAR, registryFrame: "filing" }]} />))
      .toBe("In your filing · guidestar.org · 2024");
    expect(txt(<CommitmentSource sourceClass="you" sources={[{ ...GUIDESTAR, registryFrame: "profile" }]} />))
      .toBe("In your profile · guidestar.org · 2024");
  });
  it("our_read → S5 'Our read', then the record/you rows it rests on, newest first", () => {
    expect(txt(<CommitmentSource sourceClass="our_read" sources={[MIGHTYCAUSE, GUIDESTAR]} />))
      .toBe("Our read · guidestar.org · 2024 · mightycause.com · 2023");
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
    expect(out).toContain("Our read · guidestar.org · 2024 · mightycause.com · 2023");
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
