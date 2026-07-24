// V2-5 — Act 3 "What the Outside Shows": the register lock (the render IS the guard),
// band framing, honest-absence, and the leave-behind. Falsification-validated.

import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { isPublicProvenance } from "@/lib/registerGuard";
import { OUTSIDE_BANDS, outsideBand } from "@/lib/firstRead/outsideBands";
import OutsideBand from "@/components/client-view/story/movement/OutsideBand";
import { buildFirstReadExportHtml, type FirstReadExportData } from "@/lib/firstRead/exportHtml";

describe("V2-5 — isPublicProvenance (claims register lock)", () => {
  it("admits public_observed ONLY; blocks internal_declared / null / unknown", () => {
    expect(isPublicProvenance("public_observed")).toBe(true);
    expect(isPublicProvenance("internal_declared")).toBe(false);
    expect(isPublicProvenance(null)).toBe(false);
    expect(isPublicProvenance("")).toBe(false);
    expect(isPublicProvenance("public")).toBe(false); // not the exact token
  });
});

// OutsideMessageBand reads the hook + active company — mock both to drive render states.
let perceptionState: { claims: Array<{ id: string; statement: string; topic: string | null; provenance: string }>; loading: boolean } = { claims: [], loading: false };
vi.mock("@/hooks/useOutsidePerception", () => ({ useOutsidePerception: () => perceptionState }));
vi.mock("@/hooks/useCompany", () => ({ useCompany: () => ({ activeCompany: { id: "c1" } }) }));
import OutsideMessageBand from "@/components/client-view/story/movement/OutsideMessageBand";

const PUBLIC = "Edgewood is a leading nonprofit provider of youth mental health services";
const DECLARED = "[DECLARED] Our tagline: coordinated care for every family";

describe("V2-5 — Message band register lock (the render is the guard)", () => {
  it("renders public_observed claims; a planted internal_declared row is EXCLUDED", () => {
    perceptionState = {
      claims: [
        { id: "1", statement: PUBLIC, topic: "market", provenance: "public_observed" },
        // planted leak — must never reach this public act
        { id: "2", statement: DECLARED, topic: null, provenance: "internal_declared" },
      ],
      loading: false,
    };
    const { container } = render(<OutsideMessageBand />);
    const text = container.textContent || "";
    expect(text).toContain(PUBLIC);
    // FALSIFICATION: the declared row is excluded by the render-boundary guard
    expect(text).not.toContain("DECLARED");
    expect(container.querySelectorAll(".cvs-ob-msg").length).toBe(1);
  });

  it("empty band → honest-absence line, never a canned observation", () => {
    perceptionState = { claims: [], loading: false };
    const { container } = render(<OutsideMessageBand />);
    expect(container.textContent).toContain(outsideBand("message").empty);
    // no fabricated list content
    expect(container.querySelector(".cvs-ob-msglist")).toBeNull();
  });

  it("a band with ONLY internal_declared rows → honest-absence (all blocked)", () => {
    perceptionState = { claims: [{ id: "2", statement: DECLARED, topic: null, provenance: "internal_declared" }], loading: false };
    const { container } = render(<OutsideMessageBand />);
    expect(container.textContent).not.toContain("DECLARED");
    expect(container.textContent).toContain(outsideBand("message").empty);
  });
});

describe("V2-5 — OutsideBand wrapper (signed heading + framing, no bar)", () => {
  it("renders the band heading + framing; no left-border on any element", () => {
    const { container } = render(<OutsideBand bandKey="strategy"><p>content</p></OutsideBand>);
    expect(container.textContent).toContain(outsideBand("strategy").heading);
    expect(container.textContent).toContain(outsideBand("strategy").framing);
    for (const el of Array.from(container.querySelectorAll("*")) as HTMLElement[]) {
      expect(el.style.borderLeft).toBe("");
    }
  });

  it("all three bands are ordered strategy → positioning → message", () => {
    expect(OUTSIDE_BANDS.map((b) => b.key)).toEqual(["strategy", "positioning", "message"]);
  });
});

describe("V2-5 — export follows the Message band", () => {
  const data = (perception: string[]): FirstReadExportData => ({
    company: { name: "Acme" },
    session: { id: "s1", date: "2026-07-23", presenter: null },
    statedProblem: null,
    standard: null,
    mirror: { score: null, bet: null, findings: [] },
    perception,
    check: { items: [], tally: { confirmed: 0, corrected: 0, rejected: 0, not_important: 0 } },
    gap: [], proposal: null, exportedAt: "2026-07-23T00:00:00Z",
  });

  it("renders the Message band heading + perception claims; empty → honest-absence", () => {
    const html = buildFirstReadExportHtml(data([PUBLIC]));
    expect(html).toContain(outsideBand("message").heading);
    expect(html).toContain(outsideBand("message").framing);
    expect(html).toContain(PUBLIC);
    // FALSIFICATION: empty perception → the honest-absence line, not a claim list
    const none = buildFirstReadExportHtml(data([]));
    expect(none).toContain(outsideBand("message").empty);
    expect(none).not.toContain('class="say-verbatim-list"');
  });
});
