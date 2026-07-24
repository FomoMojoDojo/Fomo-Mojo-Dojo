// V2-3 — Act 2 "Why We Start Outside": signed rationale, the journey exhibit, style +
// theme-var laws, and the leave-behind following the act. Falsification-validated
// (each assertion fails if the corresponding source is mutated).

import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import WhyOutsideAct from "@/components/client-view/story/WhyOutsideAct";
import JourneyVisual from "@/components/client-view/story/journey/JourneyVisual";
import { WHY_OUTSIDE_RATIONALE, JOURNEY_VISUAL_LABELS } from "@/lib/firstRead/whyOutside";
import { buildFirstReadExportHtml, type FirstReadExportData } from "@/lib/firstRead/exportHtml";

// Proprietary strategy-framework names that must NEVER reach a client surface (plain
// English only). NOTE: "positioning"/"message" are the operator's plain domain words,
// and "Mojo Score" is the product's own score label — none are framework names.
const FRAMEWORK_NAMES = [
  "ODI", "JTBD", "Jobs to Be Done", "Jobs-to-be-Done", "Outcome-Driven",
  "Playing to Win", "Blue Ocean", "Wardley", "Porter", "value proposition canvas",
  "positioning canvas", "Four Actions",
];

describe("V2-3 — Act 2 renders the signed rationale + the journey visual", () => {
  it("renders all three Q&A blocks verbatim, and the placeholder is gone", () => {
    const { container } = render(<WhyOutsideAct />);
    const text = container.textContent || "";
    for (const b of WHY_OUTSIDE_RATIONALE) {
      expect(text).toContain(b.q);
      expect(text).toContain(b.a);
    }
    // FALSIFICATION: the retired under-construction placeholder must not appear
    expect(text).not.toContain("still being built");
    // the visual is present
    expect(container.querySelector("svg.cvs-fr-journey-svg")).toBeTruthy();
  });

  it("the journey carries every station, beat heading, and flow caption", () => {
    const { container } = render(<JourneyVisual />);
    const text = container.textContent || "";
    // subs wrap across tspans, so inter-line spaces are lost in textContent; compare
    // whitespace-squashed — this still catches ANY dropped word (regression guard).
    const squash = (s: string) => s.replace(/\s+/g, "");
    const squashed = squash(text);
    const L = JOURNEY_VISUAL_LABELS;
    for (const n of L.nodes) {
      expect(text).toContain(n.title);
      expect(squashed).toContain(squash(n.sub)); // no word silently dropped by wrapping
    }
    // beat headings render upper-cased in the SVG
    for (const h of Object.values(L.beats)) expect(text.toUpperCase()).toContain(h.toUpperCase());
    for (const c of Object.values(L.flows)) expect(text).toContain(c);
  });
});

describe("V2-3 — style laws: theme-var colors, no vertical bars, no framework names", () => {
  it("every fill/stroke on the SVG is a theme var or 'none' — no hardcoded bare colors", () => {
    const { container } = render(<JourneyVisual />);
    const svg = container.querySelector("svg")!;
    const els = Array.from(svg.querySelectorAll("*"));
    const colorAttrs: string[] = [];
    for (const el of els) {
      for (const name of ["fill", "stroke"]) {
        const v = el.getAttribute(name);
        if (v != null) colorAttrs.push(v);
      }
    }
    expect(colorAttrs.length).toBeGreaterThan(0);
    for (const v of colorAttrs) {
      const ok = v === "none" || v === "currentColor" || v.includes("var(--mm");
      // FALSIFICATION: a bare hex/rgb color (outside a var() fallback) fails this
      expect(ok, `color attr "${v}" must be a theme var or none`).toBe(true);
      expect(/^#[0-9a-f]{3,8}$/i.test(v.trim())).toBe(false);
    }
  });

  it("no element in the rendered act carries a left-border (vertical accent bar)", () => {
    const { container } = render(<WhyOutsideAct />);
    for (const el of Array.from(container.querySelectorAll("*")) as HTMLElement[]) {
      expect(el.style.borderLeft).toBe("");
      expect(el.style.borderLeftWidth).toBe("");
    }
  });

  it("no framework name appears in the rendered act", () => {
    const { container } = render(<WhyOutsideAct />);
    const text = (container.textContent || "").toLowerCase();
    for (const name of FRAMEWORK_NAMES) expect(text).not.toContain(name.toLowerCase());
  });
});

describe("V2-3 — the leave-behind renders Act 2 (rationale + journey text)", () => {
  const data = (): FirstReadExportData => ({
    company: { name: "Acme" },
    session: { id: "s1", date: "2026-07-23", presenter: null },
    statedProblem: null,
    standard: null,
    mirror: { score: null, bet: null, findings: [] },
    perception: [],
    check: { items: [], tally: { confirmed: 0, corrected: 0, rejected: 0, not_important: 0 } },
    gap: [], proposal: null, exportedAt: "2026-07-23T00:00:00Z",
  });

  it("export contains the act title, the signed rationale, and the journey labels", () => {
    const html = buildFirstReadExportHtml(data());
    expect(html).toContain("Why We Start Outside");
    for (const b of WHY_OUTSIDE_RATIONALE) { expect(html).toContain(b.q); expect(html).toContain(b.a); }
    for (const n of JOURNEY_VISUAL_LABELS.nodes) expect(html).toContain(n.title);
    for (const c of Object.values(JOURNEY_VISUAL_LABELS.flows)) expect(html).toContain(c);
  });

  it("no framework name appears in the export", () => {
    const html = buildFirstReadExportHtml(data()).toLowerCase();
    for (const name of FRAMEWORK_NAMES) expect(html).not.toContain(name.toLowerCase());
  });
});
