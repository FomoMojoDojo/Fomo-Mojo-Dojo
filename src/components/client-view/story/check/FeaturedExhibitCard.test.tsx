// Gate 2.5 fix — the featured card renders the RIGHT shape per delta_type. The escaped defect:
// a publicly_silent theme-1 pick rendered the outside-raised "The record says:" label over EMPTY
// content (no public side). Now say-vs-see deltas render both sides by register, and a
// publicly_silent shows the declared side + the honest absence line — never an empty body.
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import FeaturedExhibitCard from "./FeaturedExhibitCard";
import type { CheckItem } from "@/hooks/useFirstReadCapture";
import { SAY_LABEL, SEE_LABEL, SILENT_SEE_LINE } from "@/lib/firstRead/sayVsSee";
import { OUTSIDE_RAISED_LABEL } from "./OutsideRaisedSection";

const delta = (deltaType: string, say: string, see: string): CheckItem => ({
  kind: "delta", ref: "d", identity: "d1", text: say || see,
  verdict: null, correctionText: null, capturedAt: null,
  delta: { deltaType, say, see, quote: null, quoteSourceText: null, eventDate: null },
} as unknown as CheckItem);

// The exhibit "body" = the card text minus its register labels — what must never be empty.
const body = (c: HTMLElement) =>
  (c.textContent || "").split(SAY_LABEL).join("").split(SEE_LABEL).join("").split(OUTSIDE_RAISED_LABEL).join("").trim();

describe("FeaturedExhibitCard — shape by delta_type, never an empty body", () => {
  it("publicly_silent → declared side (You say + claim) + the honest absence line; NOT an empty 'record says'", () => {
    const { container } = render(<FeaturedExhibitCard item={delta("publicly_silent", "We are the only kinship-first provider.", "")} />);
    const text = container.textContent || "";
    expect(text).toContain(SAY_LABEL);
    expect(text).toContain("We are the only kinship-first provider.");
    expect(text).toContain(SILENT_SEE_LINE); // "Nothing we've read so far speaks to this."
    expect(text).not.toContain(OUTSIDE_RAISED_LABEL); // the outside-raised label must NOT appear
    expect(body(container).length).toBeGreaterThan(0); // structurally non-empty
  });

  it("divergent → BOTH sides render (say + see)", () => {
    const { container } = render(<FeaturedExhibitCard item={delta("divergent", "We serve everyone.", "The record shows a narrow niche.")} />);
    const text = container.textContent || "";
    expect(text).toContain("We serve everyone.");
    expect(text).toContain("The record shows a narrow niche.");
    expect(text).not.toContain(SILENT_SEE_LINE);
  });

  it("echoed → both sides render", () => {
    const { container } = render(<FeaturedExhibitCard item={delta("echoed", "We focus on families.", "Reviews confirm a family focus.")} />);
    expect(container.textContent).toContain("We focus on families.");
    expect(container.textContent).toContain("Reviews confirm a family focus.");
  });

  it("internally_silent → the outside-raised shape (record says + statement)", () => {
    const { container } = render(<FeaturedExhibitCard item={delta("internally_silent", "", "The city froze placements in 2019.")} />);
    const text = container.textContent || "";
    expect(text).toContain(OUTSIDE_RAISED_LABEL);
    expect(text).toContain("The city froze placements in 2019.");
    expect(body(container).length).toBeGreaterThan(0);
  });

  it("FALSIFICATION: an empty-content card is structurally impossible for every delta_type", () => {
    for (const dt of ["echoed", "divergent", "publicly_silent", "internally_silent"]) {
      // even with the OTHER side blank, the rendered body is non-empty
      const { container } = render(<FeaturedExhibitCard item={delta(dt, dt === "internally_silent" ? "" : "A declared claim.", dt === "internally_silent" ? "An observed statement." : "")} />);
      expect(body(container).length).toBeGreaterThan(0);
    }
  });

  it("finding → kind label + verbatim statement", () => {
    const finding = { kind: "finding" as const, ref: "f", identity: "f1", text: "Edgewood has a 170-year moat.", verdict: null, correctionText: null, capturedAt: null };
    expect(render(<FeaturedExhibitCard item={finding} />).container.textContent).toContain("Edgewood has a 170-year moat.");
  });
});
