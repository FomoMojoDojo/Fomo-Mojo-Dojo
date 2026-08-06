// V2-7 — Act 4 say-vs-see: delta-item assembly + register guard, verdict control,
// receipt-only-via-quote, honest gaps, collision detection, export. Falsification-validated.

import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { assembleDeltaItems, dropCollidingDeltas, type DeltaInput } from "@/lib/firstRead/deltaItems";
import { SAY_LABEL, SEE_LABEL, SAY_VS_SEE_GROUPS } from "@/lib/firstRead/sayVsSee";
import type { CheckItem } from "@/hooks/useFirstReadCapture";
import { buildFirstReadExportHtml, type FirstReadExportData } from "@/lib/firstRead/exportHtml";
import DeltaItemRow from "@/components/client-view/story/check/DeltaItemRow";
import SayVsSeeExhibit from "@/components/client-view/story/check/SayVsSeeExhibit";

const delta = (over: Partial<DeltaInput> = {}): DeltaInput => ({
  id: "d1", delta_type: "echoed", content_identity: "ci-1",
  declared_statement: "We close gaps in youth mental health care.",
  public_statement: "Edgewood is a leading nonprofit provider of youth mental health services.",
  public_provenance: "public_observed", quote: null, quote_source_text: null, event_date: null, ...over,
});

describe("V2-7 — assembleDeltaItems (say-anchored groups + register lock on the see side)", () => {
  it("builds echoed/divergent (clean public see) + publicly_silent (no see); excludes internally_silent", () => {
    const items = assembleDeltaItems([
      delta({ id: "e", delta_type: "echoed" }),
      delta({ id: "v", delta_type: "divergent" }),
      delta({ id: "s", delta_type: "publicly_silent", public_statement: null, public_provenance: null }),
      delta({ id: "u", delta_type: "internally_silent" }), // no say side → excluded
    ]);
    expect(items.map((i) => i.delta!.deltaType)).toEqual(["echoed", "divergent", "publicly_silent"]);
    expect(items.every((i) => i.kind === "delta")).toBe(true);
    expect(items[0].identity).toBe("ci-1"); // identity = content_identity, not text-hash
  });

  it("REGISTER LOCK: an analytic or framework-token see side is excluded; internal see excluded", () => {
    // FALSIFICATION: same delta shape, only the see-side provenance/text differs
    expect(assembleDeltaItems([delta({ public_provenance: "analytic" })])).toHaveLength(0);
    expect(assembleDeltaItems([delta({ public_provenance: "internal_declared" })])).toHaveLength(0);
    expect(assembleDeltaItems([delta({ public_statement: "Product claims without customer validation in ODI." })])).toHaveLength(0);
    // a clean public_observed see side DOES render (guard can fail)
    expect(assembleDeltaItems([delta()])).toHaveLength(1);
  });

  it("skips a delta with no declared (say) statement", () => {
    expect(assembleDeltaItems([delta({ declared_statement: null })])).toHaveLength(0);
  });
});

// Option B — internally_silent is OBSERVED-anchored: item text is the OBSERVED statement (no
// say), and the BACKING GUARD (has_outside_signal) keeps our own mis-stamped analysis out of
// the outside's voice. FALSIFICATION: same delta shape, only the guard inputs differ.
describe("Option B — assembleDeltaItems (internally_silent, observed-anchored + backing guard)", () => {
  const iSilent = (over: Partial<DeltaInput> = {}): DeltaInput =>
    delta({
      id: "is", delta_type: "internally_silent",
      declared_statement: null, // no say side
      public_statement: "City froze placements after 2019 staff misconduct and child abuse allegations.",
      public_provenance: "public_observed", has_outside_signal: true, ...over,
    });

  it("public_observed + outside-backed → ONE item, text is the OBSERVED statement, say is empty", () => {
    const items = assembleDeltaItems([iSilent()]);
    expect(items).toHaveLength(1);
    expect(items[0].delta!.deltaType).toBe("internally_silent");
    expect(items[0].text).toBe("City froze placements after 2019 staff misconduct and child abuse allegations.");
    expect(items[0].delta!.see).toBe(items[0].text);
    expect(items[0].delta!.say).toBe("");
    expect(items[0].identity).toBe("ci-1"); // content_identity, not text-hash
  });

  it("source_url threads onto the render payload (both anchored + observed groups)", () => {
    const obs = assembleDeltaItems([iSilent({ source_url: "https://www.glassdoor.com/x" })]);
    expect(obs[0].delta!.sourceUrl).toBe("https://www.glassdoor.com/x");
    const anchored = assembleDeltaItems([delta({ source_url: "https://www.yelp.com/biz/y" })]);
    expect(anchored[0].delta!.sourceUrl).toBe("https://www.yelp.com/biz/y");
  });

  it("BACKING GUARD can fail: no outside-band signal → excluded (mis-stamped analysis)", () => {
    expect(assembleDeltaItems([iSilent({ has_outside_signal: false })])).toHaveLength(0);
    expect(assembleDeltaItems([iSilent({ has_outside_signal: undefined })])).toHaveLength(0);
  });

  it("provenance + register guards still bite: analytic/internal see or framework-token text → excluded", () => {
    expect(assembleDeltaItems([iSilent({ public_provenance: "analytic" })])).toHaveLength(0);
    expect(assembleDeltaItems([iSilent({ public_provenance: "internal_declared" })])).toHaveLength(0);
    expect(assembleDeltaItems([iSilent({ public_statement: "Product claims without customer validation in ODI." })])).toHaveLength(0);
  });
});

describe("V2-7 — dropCollidingDeltas (no tally double-count)", () => {
  it("drops a delta whose identity collides with a finding identity; keeps non-colliding", () => {
    const deltas = [{ identity: "shared" }, { identity: "unique" }];
    const kept = dropCollidingDeltas(deltas, new Set(["shared"]));
    expect(kept.map((d) => d.identity)).toEqual(["unique"]);
  });
});

const item = (over: Partial<CheckItem> = {}): CheckItem => ({
  kind: "delta", ref: "d1", text: "say text", identity: "ci-1", verdict: null, correctionText: null, capturedAt: null,
  delta: { deltaType: "echoed", say: "We close gaps in youth mental health care.", see: "Edgewood is a leading nonprofit provider.", quote: null, quoteSourceText: null, eventDate: null },
  ...over,
});

describe("V2-7 — DeltaItemRow: registers labeled, receipt only via the quote field", () => {
  it("renders SAY and SEE labels with their text under them (registers never blend)", () => {
    const { container } = render(<DeltaItemRow item={item()} onSet={vi.fn()} />);
    const labels = Array.from(container.querySelectorAll(".cvs-delta-label")).map((e) => e.textContent);
    expect(labels).toEqual([SAY_LABEL, SEE_LABEL]);
    expect(container.textContent).toContain("We close gaps in youth mental health care.");
    expect(container.textContent).toContain("Edgewood is a leading nonprofit provider.");
    // verdict control present (V2-11: three buttons — the Correct/refine path was retired)
    expect(container.querySelectorAll("button").length).toBeGreaterThanOrEqual(3);
  });

  it("RECEIPT ONLY VIA quote: a see claim with NO quote renders no quotation machinery", () => {
    // FALSIFICATION: the see-side claim text is present as prose but NEVER as a blockquote
    const { container } = render(<DeltaItemRow item={item()} onSet={vi.fn()} />);
    expect(container.querySelector("figure.cvs-signal-quote")).toBeNull();
    expect(container.querySelector("blockquote")).toBeNull();
    // when a real verbatim quote exists, THEN the receipt renders
    const withQuote = item({ delta: { deltaType: "echoed", say: "s", see: "The record's reading.", quote: "leading nonprofit provider", quoteSourceText: "x", eventDate: null } });
    const r2 = render(<DeltaItemRow item={withQuote} onSet={vi.fn()} />);
    expect(r2.container.querySelector("figure.cvs-signal-quote")).toBeTruthy();
    expect(r2.container.textContent).toContain("leading nonprofit provider");
  });

  it("Reported line: renders on a dated NO-quote see side; SUPPRESSED when a quote is present (no double-date)", () => {
    const dated = item({ delta: { deltaType: "divergent", say: "s", see: "the record", quote: null, quoteSourceText: null, eventDate: null, reportedEventDate: "2025-07-18", reportedPrecision: "day", capturedAt: "2026-07-24T00:00:00+00" } });
    const r1 = render(<DeltaItemRow item={dated} onSet={vi.fn()} />);
    expect(r1.container.textContent).toContain("Reported Jul 2025 · read by us Jul 2026");

    // quote present → "As captured" shows and the Reported line is SUPPRESSED (overlap rule)
    const quotedDated = item({ delta: { deltaType: "echoed", say: "s", see: "the record", quote: "leading nonprofit provider", quoteSourceText: "x", eventDate: "2024-05-01", reportedEventDate: "2025-07-18", reportedPrecision: "day", capturedAt: "2026-07-24" } });
    const r2 = render(<DeltaItemRow item={quotedDated} onSet={vi.fn()} />);
    expect(r2.container.querySelector("figure.cvs-signal-quote")).toBeTruthy(); // As captured present
    expect(r2.container.querySelector(".cvs-delta-reported")).toBeNull(); // Reported line SUPPRESSED
    expect(r2.container.textContent).not.toContain("Reported Jul 2025");
  });

  it("SOURCE HOST: host+date, host-only, quote-bearing has NO host, and no <a> anchor", () => {
    // host + date → "{host} · Reported … · read by us …"
    const hostDated = item({ delta: { deltaType: "divergent", say: "s", see: "the record", quote: null, quoteSourceText: null, eventDate: null, reportedEventDate: "2025-07-18", reportedPrecision: "day", capturedAt: "2026-07-24T00:00:00+00", sourceUrl: "https://www.glassdoor.com/Reviews/x-E145192.htm" } });
    const r1 = render(<DeltaItemRow item={hostDated} onSet={vi.fn()} />);
    expect(r1.container.querySelector(".cvs-delta-reported")!.textContent).toBe("glassdoor.com · Reported Jul 2025 · read by us Jul 2026");
    expect(r1.container.querySelector("a")).toBeNull(); // anchor-free — host is plain text

    // host only (undated) → the bare domain, no "Reported"
    const hostOnly = item({ delta: { deltaType: "internally_silent", say: "", see: "the record", quote: null, quoteSourceText: null, eventDate: null, reportedEventDate: null, capturedAt: null, sourceUrl: "https://www.yelp.com/biz/edgewood-san-francisco-2" } });
    const r2 = render(<DeltaItemRow item={hostOnly} onSet={vi.fn()} />);
    expect(r2.container.querySelector(".cvs-delta-reported")!.textContent).toBe("yelp.com");
    expect(r2.container.textContent).not.toContain("Reported");

    // quote-bearing → "As captured" shows, NO host, NO attribution line (unchanged treatment)
    const quoted = item({ delta: { deltaType: "echoed", say: "s", see: "the record", quote: "leading nonprofit provider", quoteSourceText: "x", eventDate: "2024-05-01", reportedEventDate: "2025-07-18", capturedAt: "2026-07-24", sourceUrl: "https://www.glassdoor.com/Reviews/x-E145192.htm" } });
    const r3 = render(<DeltaItemRow item={quoted} onSet={vi.fn()} />);
    expect(r3.container.querySelector("figure.cvs-signal-quote")).toBeTruthy();
    expect(r3.container.querySelector(".cvs-delta-reported")).toBeNull();
    expect(r3.container.textContent).not.toContain("glassdoor.com"); // host NOT added to As-captured
  });
});

describe("V2-7 — SayVsSeeExhibit: three groups + honest-absence per empty group", () => {
  it("renders all three group headings; an empty group shows its honest-absence line", () => {
    const { container } = render(<SayVsSeeExhibit items={[]} onSet={vi.fn()} />);
    for (const g of SAY_VS_SEE_GROUPS) {
      expect(container.textContent).toContain(g.heading);
      expect(container.textContent).toContain(g.empty); // honest-absence, never filler
    }
  });

  it("places an item in its group and drops the empty line there", () => {
    const { container } = render(<SayVsSeeExhibit items={[item({ delta: { deltaType: "divergent", say: "my claim", see: "the record", quote: null, quoteSourceText: null, eventDate: null } })]} onSet={vi.fn()} />);
    expect(container.textContent).toContain("my claim");
    expect(container.textContent).not.toContain(SAY_VS_SEE_GROUPS[1].empty); // divergent no longer empty
  });
});

describe("V2-7 — export byte-follows the exhibit", () => {
  const data = (items: CheckItem[]): FirstReadExportData => ({
    company: { name: "Acme" }, session: { id: "s1", date: "2026-07-23", presenter: null },
    statedProblem: null, standard: null, mirror: { score: null, bet: null, findings: [] }, perception: [],
    check: { items, tally: { confirmed: 0, corrected: 0, rejected: 0, not_important: 0 } },
    gap: [], proposal: null, exportedAt: "2026-07-23T00:00:00Z",
  });
  it("renders group headings, SAY/SEE labels, the delta text, and honest-absence for empty groups", () => {
    const html = buildFirstReadExportHtml(data([item({ delta: { deltaType: "echoed", say: "We close gaps.", see: "Leading provider.", quote: null, quoteSourceText: null, eventDate: null } })]));
    expect(html).toContain(SAY_VS_SEE_GROUPS[0].heading);
    expect(html).toContain(SAY_LABEL);
    expect(html).toContain(SEE_LABEL);
    expect(html).toContain("We close gaps.");
    expect(html).toContain(SAY_VS_SEE_GROUPS[1].empty); // divergent empty
  });

  it("export follows the screen: host+date attribution line renders; host is plain text, no anchor", () => {
    const html = buildFirstReadExportHtml(data([item({ delta: { deltaType: "divergent", say: "s", see: "the record", quote: null, quoteSourceText: null, eventDate: null, reportedEventDate: "2025-07-18", capturedAt: "2026-07-24T00:00:00+00", sourceUrl: "https://www.glassdoor.com/Reviews/x-E145192.htm" } })]));
    expect(html).toContain(`<p class="ss-reported">glassdoor.com · Reported Jul 2025 · read by us Jul 2026</p>`);
    expect(html).not.toContain("<a "); // anchor-free — host never a link
  });
});
