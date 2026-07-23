// V2-2 / V2-2b — Act 1 "What You Say": guard, provenance labels, quote path, export, style.

import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { admitStatedProblem, statedProblemLabel, STATED_PROBLEM_LABELS } from "@/lib/firstRead/statedProblem";
import ActUnderConstruction from "@/components/client-view/story/ActUnderConstruction";
import SignalQuote from "@/components/evidence/SignalQuote";
import { buildFirstReadExportHtml, type FirstReadExportData } from "@/lib/firstRead/exportHtml";
import { AS_CAPTURED_LABEL } from "@/components/evidence/SignalQuote";

const REAL = "Delivering comprehensive mental healthcare services for youth and families across the San Francisco Bay Area.";
const QUOTE = "Edgewood offers a continuum of mental healthcare for youth and families";

describe("V2-2 — admitStatedProblem render guard", () => {
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

const row = (over: Record<string, unknown> = {}) => ({
  statement: REAL, quote: null, quote_source_text: null, register: "internal_declared", descriptive_fallback: false, ...over,
});

describe("V2-2/2b — StatedProblemAct render", () => {
  it("company_declared → statement + 'brought to us' label; quote via SignalQuote when present", () => {
    hookState = { data: row({ quote: QUOTE, quote_source_text: "x", register: "internal_declared" }), loading: false };
    const { container } = render(<StatedProblemAct companyId="c1" />);
    expect(container.querySelector(".cvs-fr-statedproblem-text")?.textContent).toBe(REAL);
    expect(container.querySelector(".cvs-fr-statedproblem-source")?.textContent).toBe(STATED_PROBLEM_LABELS.company_declared);
    expect((container.textContent || "")).toContain(QUOTE);
    expect((container.textContent || "")).toContain(AS_CAPTURED_LABEL);
  });

  it("site_inferred descriptive fallback → 'how you describe yourselves' label", () => {
    hookState = { data: row({ register: "public_observed", descriptive_fallback: true }), loading: false };
    const { container } = render(<StatedProblemAct companyId="c1" />);
    expect(container.querySelector(".cvs-fr-statedproblem-source")?.textContent).toBe(STATED_PROBLEM_LABELS.site_descriptive);
  });

  it("canned statement → honest-empty; no data → honest-empty", () => {
    hookState = { data: row({ statement: "This company solves problems for businesses." }), loading: false };
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

describe("V2-2/2b — export renders Act 1 with its provenance label", () => {
  const data = (sp: FirstReadExportData["statedProblem"]): FirstReadExportData => ({
    company: { name: "Acme" },
    session: { id: "s1", date: "2026-07-23", presenter: null },
    statedProblem: sp,
    standard: null,
    mirror: { score: null, bet: null, findings: [] },
    check: { items: [], tally: { confirmed: 0, corrected: 0, rejected: 0, not_important: 0 } },
    gap: [], proposal: null, exportedAt: "2026-07-23T00:00:00Z",
  });

  it("statement + provenance label + verbatim quote under 'What You Say'", () => {
    const html = buildFirstReadExportHtml(data({ statement: REAL, quote: QUOTE, register: "internal_declared", descriptive_fallback: false }));
    expect(html).toContain("What You Say");
    expect(html).toContain(REAL);
    expect(html).toContain(STATED_PROBLEM_LABELS.company_declared);
    expect(html).toContain(QUOTE);
    expect(html).toContain(AS_CAPTURED_LABEL);
  });

  it("site descriptive → the descriptive label; canned/null → honest-empty", () => {
    const desc = buildFirstReadExportHtml(data({ statement: REAL, quote: null, register: "public_observed", descriptive_fallback: true }));
    expect(desc).toContain(STATED_PROBLEM_LABELS.site_descriptive);
    const none = buildFirstReadExportHtml(data(null));
    expect(none).toContain("No problem is stated");
  });
});
