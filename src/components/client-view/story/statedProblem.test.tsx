// V2-2 / V2-2b / V2-3b — Act 1 "What You Say": verbatim-first declared path, the
// site-inference fallback, provenance labels, export, and style. Falsification-validated.

import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { admitStatedProblem, statedProblemLabel, STATED_PROBLEM_LABELS } from "@/lib/firstRead/statedProblem";
import ActUnderConstruction from "@/components/client-view/story/ActUnderConstruction";
import SignalQuote from "@/components/evidence/SignalQuote";
import { buildFirstReadExportHtml, type FirstReadExportData } from "@/lib/firstRead/exportHtml";
import { AS_CAPTURED_LABEL } from "@/components/evidence/SignalQuote";

const REAL = "Delivering comprehensive mental healthcare services for youth and families across the San Francisco Bay Area.";
const QUOTE = "Edgewood offers a continuum of mental healthcare for youth and families";
// A typical client survey answer — multiple paragraphs, the client's own words.
const BRIEF = "We keep losing deals late in the cycle.\n\nProspects love the demo, then go quiet for weeks and we chase them.\n\nWe can't tell if it's price, timing, or a competitor we never see.";

describe("V2-2 — admitStatedProblem render guard (site-inference fallback only)", () => {
  it("admits a real stated problem; REFUSES canned/generic/empty classes", () => {
    expect(admitStatedProblem(REAL)).toBe(true);
    expect(admitStatedProblem("This company solves problems for businesses.")).toBe(false);
    expect(admitStatedProblem("A company that helps people.")).toBe(false);
    expect(admitStatedProblem("")).toBe(false);
    expect(admitStatedProblem("  short ")).toBe(false);
  });
});

describe("V2-2b — provenance label matches the row's source/register", () => {
  it("internal_declared → 'brought to us'; public problem → 'read from site'; public descriptive → 'how you describe'", () => {
    expect(statedProblemLabel("internal_declared", false)).toBe(STATED_PROBLEM_LABELS.company_declared);
    expect(statedProblemLabel("internal_declared", true)).toBe(STATED_PROBLEM_LABELS.company_declared); // brief never descriptive
    expect(statedProblemLabel("public_observed", false)).toBe(STATED_PROBLEM_LABELS.site_inferred);
    expect(statedProblemLabel("public_observed", true)).toBe(STATED_PROBLEM_LABELS.site_descriptive);
    // FALSIFICATION: a company_declared row must NOT get a site label (plant a mismatch)
    expect(statedProblemLabel("internal_declared", false)).not.toBe(STATED_PROBLEM_LABELS.site_inferred);
    expect(STATED_PROBLEM_LABELS.company_declared).toBe("The problem you brought to us");
    expect(STATED_PROBLEM_LABELS.site_inferred).toBe("Read from your public site");
    expect(STATED_PROBLEM_LABELS.site_descriptive).toBe("How you describe yourselves publicly");
  });
});

// StatedProblemAct reads the hook — mock it to drive the render states.
let hookState: { data: unknown; loading: boolean } = { data: null, loading: false };
vi.mock("@/hooks/useFirstReadStatedProblem", () => ({ useFirstReadStatedProblem: () => hookState }));
import StatedProblemAct from "@/components/client-view/story/StatedProblemAct";

// declared = verbatim (the client's own brief); inferred = model distillation (fallback).
const declared = (over: Record<string, unknown> = {}) => ({
  statement: BRIEF, verbatim: true, quote: null, quote_source_text: null, register: "internal_declared", descriptive_fallback: false, ...over,
});
const inferred = (over: Record<string, unknown> = {}) => ({
  statement: REAL, verbatim: false, quote: null, quote_source_text: null, register: "public_observed", descriptive_fallback: false, ...over,
});

describe("V2-3b — declared path renders the brief VERBATIM (their words, no model)", () => {
  it("rendered text byte-matches the brief exactly, paragraph breaks preserved", () => {
    hookState = { data: declared(), loading: false };
    const { container } = render(<StatedProblemAct companyId="c1" />);
    const el = container.querySelector(".cvs-fr-statedproblem-text") as HTMLElement;
    // BYTE-MATCH: the render is source-direct — no distillation, no transformation
    expect(el.textContent).toBe(BRIEF);
    // FALSIFICATION: a one-char drift must not match (proves it's not fuzzy/normalized)
    expect(el.textContent).not.toBe(BRIEF.replace("late", "1ate"));
    // paragraph breaks preserved via pre-wrap; label present; no verbatim quote element
    expect(el.style.whiteSpace).toBe("pre-wrap");
    expect(container.querySelector(".cvs-fr-statedproblem-source")?.textContent).toBe(STATED_PROBLEM_LABELS.company_declared);
    expect(container.querySelector("figure.cvs-signal-quote")).toBeNull();
  });

  it("the verbatim path does NOT run the canned-class guard (their words render as-is)", () => {
    // a client's own answer that happens to match a 'canned' regex still renders verbatim
    hookState = { data: declared({ statement: "This company solves problems for businesses." }), loading: false };
    const { container } = render(<StatedProblemAct companyId="c1" />);
    expect(container.querySelector(".cvs-fr-statedproblem-text")?.textContent).toBe("This company solves problems for businesses.");
  });

  it("no vertical accent bar on the verbatim block", () => {
    hookState = { data: declared(), loading: false };
    const { container } = render(<StatedProblemAct companyId="c1" />);
    const el = container.querySelector(".cvs-fr-statedproblem-text") as HTMLElement;
    expect(el.style.borderLeft).toBe("");
    expect(el.style.borderLeftWidth).toBe("");
  });
});

describe("V2-3b — site-inference fallback (blank brief) stays model-guarded", () => {
  it("inferred descriptive fallback → 'how you describe yourselves' label + quote when present", () => {
    hookState = { data: inferred({ descriptive_fallback: true, quote: QUOTE, quote_source_text: "x" }), loading: false };
    const { container } = render(<StatedProblemAct companyId="c1" />);
    expect(container.querySelector(".cvs-fr-statedproblem-text")?.textContent).toBe(REAL);
    expect(container.querySelector(".cvs-fr-statedproblem-source")?.textContent).toBe(STATED_PROBLEM_LABELS.site_descriptive);
    expect((container.textContent || "")).toContain(QUOTE);
    expect((container.textContent || "")).toContain(AS_CAPTURED_LABEL);
  });

  it("inferred canned → honest-empty; no data → honest-empty", () => {
    hookState = { data: inferred({ statement: "This company solves problems for businesses." }), loading: false };
    expect(render(<StatedProblemAct companyId="c1" />).container.querySelector(".cvs-fr-statedproblem-text")).toBeNull();
    hookState = { data: null, loading: false };
    expect((render(<StatedProblemAct companyId="c1" />).container.textContent || "")).toContain("couldn't find a problem stated");
  });
});

describe("V2-2b — style: no vertical accent bar on the quote block", () => {
  it("SignalQuote figure has NO left-border; sits below with spacing", () => {
    const { container } = render(<SignalQuote quote={QUOTE} />);
    const fig = container.querySelector("figure") as HTMLElement;
    expect(fig).toBeTruthy();
    // FALSIFICATION: the removed vertical bar must not return
    expect(fig.style.borderLeft).toBe("");
    expect(fig.style.borderLeftWidth).toBe("");
    expect(fig.style.marginTop).toBe("20px"); // breathing room above the quote
  });
});

describe("V2-2 — placeholder sits inside the act column", () => {
  it("ActUnderConstruction carries the column class", () => {
    expect(render(<ActUnderConstruction />).container.querySelector(".cvs-fr-underconstruction")).toBeTruthy();
  });
});

describe("V2-3b — export follows the screen (verbatim declared / inferred fallback)", () => {
  const data = (sp: FirstReadExportData["statedProblem"]): FirstReadExportData => ({
    company: { name: "Acme" },
    session: { id: "s1", date: "2026-07-23", presenter: null },
    statedProblem: sp,
    standard: null,
    mirror: { score: null, bet: null, findings: [] },
    check: { items: [], tally: { confirmed: 0, corrected: 0, rejected: 0, not_important: 0 } },
    gap: [], proposal: null, exportedAt: "2026-07-23T00:00:00Z",
  });

  it("declared → the brief VERBATIM (byte-match) + 'brought to us' label, no quote", () => {
    const html = buildFirstReadExportHtml(data({ statement: BRIEF, verbatim: true, quote: null, register: "internal_declared", descriptive_fallback: false }));
    expect(html).toContain("What You Say");
    expect(html).toContain(BRIEF); // byte-exact (BRIEF has no HTML-escapable chars)
    expect(html).toContain('class="std-label say-verbatim"');
    expect(html).toContain(STATED_PROBLEM_LABELS.company_declared);
    // FALSIFICATION: a drifted brief is not present
    expect(html).not.toContain(BRIEF.replace("late", "1ate"));
  });

  it("inferred → statement + provenance label + verbatim quote under 'What You Say'", () => {
    const html = buildFirstReadExportHtml(data({ statement: REAL, verbatim: false, quote: QUOTE, register: "public_observed", descriptive_fallback: false }));
    expect(html).toContain(REAL);
    expect(html).toContain(STATED_PROBLEM_LABELS.site_inferred);
    expect(html).toContain(QUOTE);
    expect(html).toContain(AS_CAPTURED_LABEL);
  });

  it("null → honest-empty", () => {
    expect(buildFirstReadExportHtml(data(null))).toContain("No problem is stated");
  });
});
