// V2-2 — Act 1 "What You Say": render guard, honest-empty, quote path, export, placeholder.

import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { admitStatedProblem } from "@/lib/firstRead/statedProblem";
import ActUnderConstruction from "@/components/client-view/story/ActUnderConstruction";
import { buildFirstReadExportHtml, type FirstReadExportData } from "@/lib/firstRead/exportHtml";
import { AS_CAPTURED_LABEL } from "@/components/evidence/SignalQuote";

const REAL = "Delivering comprehensive mental healthcare services for youth and families across the San Francisco Bay Area.";
const QUOTE = "Edgewood offers a continuum of mental healthcare for youth and families";

describe("V2-2 — admitStatedProblem render guard", () => {
  it("admits a real stated problem; REFUSES canned/generic/empty classes", () => {
    expect(admitStatedProblem(REAL)).toBe(true);
    // FALSIFICATION — canned class refused
    expect(admitStatedProblem("This company solves problems for businesses.")).toBe(false);
    expect(admitStatedProblem("A company that helps people.")).toBe(false);
    expect(admitStatedProblem("Provides solutions and services.")).toBe(false);
    expect(admitStatedProblem("")).toBe(false);
    expect(admitStatedProblem("  short ")).toBe(false);
  });
});

// StatedProblemAct reads the hook — mock it to drive the three render states.
let hookState: { data: unknown; loading: boolean } = { data: null, loading: false };
vi.mock("@/hooks/useFirstReadStatedProblem", () => ({ useFirstReadStatedProblem: () => hookState }));
import StatedProblemAct from "@/components/client-view/story/StatedProblemAct";

describe("V2-2 — StatedProblemAct render (guard + quote + honest-empty)", () => {
  it("real statement → renders it; a lifted quote renders via SignalQuote (As captured)", () => {
    hookState = { data: { statement: REAL, quote: QUOTE, quote_source_text: "x", register: "client_voice" }, loading: false };
    const { container } = render(<StatedProblemAct companyId="c1" />);
    expect(container.querySelector(".cvs-fr-statedproblem-text")?.textContent).toBe(REAL);
    // the verbatim anchor renders with the SIGNED label
    expect((container.textContent || "")).toContain(QUOTE);
    expect((container.textContent || "")).toContain(AS_CAPTURED_LABEL);
  });

  it("quote-less is honest — the distillation renders alone, no quote machinery", () => {
    hookState = { data: { statement: REAL, quote: null, quote_source_text: null, register: "client_voice" }, loading: false };
    const { container } = render(<StatedProblemAct companyId="c1" />);
    expect(container.querySelector(".cvs-fr-statedproblem-text")?.textContent).toBe(REAL);
    expect(container.querySelector("blockquote")).toBeNull(); // SignalQuote rendered nothing
  });

  it("canned statement → render guard → honest-empty (never a generic statement)", () => {
    hookState = { data: { statement: "This company solves problems for businesses.", quote: null, quote_source_text: null, register: "client_voice" }, loading: false };
    const { container } = render(<StatedProblemAct companyId="c1" />);
    expect(container.querySelector(".cvs-fr-statedproblem-text")).toBeNull();
    expect((container.textContent || "")).toContain("couldn't find a problem stated");
  });

  it("no data → honest-empty", () => {
    hookState = { data: null, loading: false };
    const { container } = render(<StatedProblemAct companyId="c1" />);
    expect((container.textContent || "")).toContain("couldn't find a problem stated");
  });
});

describe("V2-2 — placeholder sits inside the act column (position fix)", () => {
  it("ActUnderConstruction carries the column class (constrained to the act column)", () => {
    const { container } = render(<ActUnderConstruction />);
    expect(container.querySelector(".cvs-fr-underconstruction")).toBeTruthy();
  });
});

describe("V2-2 — export renders Act 1 (What You Say) via the same source", () => {
  const data = (statedProblem: FirstReadExportData["statedProblem"]): FirstReadExportData => ({
    company: { name: "Acme" },
    session: { id: "s1", date: "2026-07-23", presenter: null },
    statedProblem,
    standard: null,
    mirror: { score: null, bet: null, findings: [] },
    check: { items: [], tally: { confirmed: 0, corrected: 0, rejected: 0, not_important: 0 } },
    gap: [], proposal: null, exportedAt: "2026-07-23T00:00:00Z",
  });

  it("statement + verbatim quote render under 'What You Say' with the signed label", () => {
    const html = buildFirstReadExportHtml(data({ statement: REAL, quote: QUOTE }));
    expect(html).toContain("What You Say");
    expect(html).toContain(REAL);
    expect(html).toContain(QUOTE);
    expect(html).toContain(AS_CAPTURED_LABEL);
  });

  it("canned / null → honest-empty in the export (never a fabricated statement)", () => {
    const canned = buildFirstReadExportHtml(data({ statement: "A company that helps businesses.", quote: null }));
    expect(canned).not.toContain("A company that helps businesses.");
    expect(canned).toContain("No problem is stated");
    const none = buildFirstReadExportHtml(data(null));
    expect(none).toContain("No problem is stated");
  });
});
