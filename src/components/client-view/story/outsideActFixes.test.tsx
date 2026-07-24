// V2-5b — Act 3 honesty fixes: perception guard (framework tokens + analytic voice),
// containment dedupe, market collapse, export follows. Falsification-validated.

import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { admitPublicPerception, containsFrameworkToken, isAnalyticVoice, splitPerception } from "@/lib/firstRead/perceptionGuard";
import { dedupeByContainment, collapseMarketsByWho, normalizeForContainment } from "@/lib/firstRead/outsideCollapse";
import { buildFirstReadExportHtml, type FirstReadExportData } from "@/lib/firstRead/exportHtml";

// Real Edgewood rows (the operator frame-audit).
const ODI = "Specific product claims without customer validation in ODI.";
const ANALYTIC = "The organization needs to explore current service offerings and financial sustainability.";
const OPS = "There are substantial operational challenges inherent to delivering 24/7 crisis care.";
const CLEAN = "Edgewood is a leading nonprofit provider of youth mental health and family support services.";
const TEAMSTERS_FULL = "Teamsters shop steward Eric Foster: 'Before we became Teamsters, my co-workers didn't feel valued.'";
const TEAMSTERS_BARE = "Before we became Teamsters, my co-workers didn't feel valued.";

describe("V2-5b — perception guard (framework tokens + analytic voice)", () => {
  it("excludes framework tokens (ODI/JTBD) and admits a clean claim (both sides)", () => {
    expect(containsFrameworkToken(ODI)).toBe(true);
    expect(admitPublicPerception(ODI)).toBe(false);
    expect(containsFrameworkToken("The team uses JTBD to plan")).toBe(true);
    // FALSIFICATION: a clean description with no token STILL renders
    expect(containsFrameworkToken(CLEAN)).toBe(false);
    expect(admitPublicPerception(CLEAN)).toBe(true);
    // "odi" only as a whole word — not inside another word
    expect(containsFrameworkToken("melodic odyssey")).toBe(false);
  });

  it("excludes analytic voice; a clean outside description passes", () => {
    expect(isAnalyticVoice(ANALYTIC)).toBe(true);
    expect(isAnalyticVoice(OPS)).toBe(true);
    expect(admitPublicPerception(ANALYTIC)).toBe(false);
    expect(admitPublicPerception(OPS)).toBe(false);
    expect(isAnalyticVoice(CLEAN)).toBe(false);
    expect(admitPublicPerception(TEAMSTERS_FULL)).toBe(true); // outside voice passes
  });

  it("splitPerception reports the excluded rows + reason (for upstream fixing)", () => {
    const rows = [{ t: ODI }, { t: ANALYTIC }, { t: CLEAN }, { t: TEAMSTERS_FULL }];
    const { admitted, excluded } = splitPerception(rows, (r) => r.t);
    expect(admitted.map((r) => r.t)).toEqual([CLEAN, TEAMSTERS_FULL]);
    expect(excluded.map((e) => e.reason)).toEqual(["framework_token", "analytic_voice"]);
  });
});

describe("V2-5b — containment dedupe (Message band)", () => {
  it("keeps the fuller variant when one text is contained in another", () => {
    const kept = dedupeByContainment([{ t: TEAMSTERS_BARE }, { t: TEAMSTERS_FULL }], (r) => r.t);
    expect(kept.map((r) => r.t)).toEqual([TEAMSTERS_FULL]);
  });
  it("a non-contained pair renders both; equal keeps the earliest", () => {
    const both = dedupeByContainment([{ t: CLEAN }, { t: "Edgewood serves the East Bay too." }], (r) => r.t);
    expect(both).toHaveLength(2);
    const dup = dedupeByContainment([{ t: "same" }, { t: "same" }], (r) => r.t);
    expect(dup).toHaveLength(1);
  });
});

describe("V2-5b — market collapse (Strategy band, render-side only)", () => {
  it("folds a contained WHO under the fuller one, merging + deduping jobs", () => {
    const markets = [
      { who: "Families", jobs: [{ job: "find care" }] },
      { who: "Families in crisis", jobs: [{ job: "find care fast" }, { job: "find care" }] },
      { who: "Referrers", jobs: [{ job: "route a family" }] },
    ];
    const out = collapseMarketsByWho(markets, (j) => j.job);
    // "Families" folds under "Families in crisis"; Referrers stands alone → 2 markets
    expect(out.map((m) => m.who)).toEqual(["Families in crisis", "Referrers"]);
    // jobs merged + deduped: "find care" is contained in "find care fast" → only the fuller
    expect(out[0].jobs.map((j) => j.job)).toEqual(["find care fast"]);
  });

  it("FALSIFICATION: two non-contained markets BOTH render (no false fold)", () => {
    const markets = [{ who: "Donors", jobs: [] }, { who: "Referrers", jobs: [] }];
    expect(collapseMarketsByWho(markets, () => "").map((m) => m.who)).toEqual(["Donors", "Referrers"]);
  });

  it("does NOT mutate the input (stored candidates untouched)", () => {
    const markets = [{ who: "A", jobs: [{ job: "x" }] }, { who: "A extended", jobs: [{ job: "y" }] }];
    const snapshot = JSON.stringify(markets);
    collapseMarketsByWho(markets, (j) => j.job);
    expect(JSON.stringify(markets)).toBe(snapshot); // input array + members unchanged
  });
});

// ── Message band render: guard + dedupe together (the render IS the guard) ──
let perceptionState: { claims: Array<{ id: string; statement: string; topic: string | null; provenance: string }>; loading: boolean } = { claims: [], loading: false };
vi.mock("@/hooks/useOutsidePerception", () => ({ useOutsidePerception: () => perceptionState }));
vi.mock("@/hooks/useCompany", () => ({ useCompany: () => ({ activeCompany: { id: "c1" } }) }));
import OutsideMessageBand from "@/components/client-view/story/movement/OutsideMessageBand";

describe("V2-5b — Message band shows only outside voice, once each", () => {
  it("excludes ODI + analytic rows, dedupes the Teamsters pair, keeps clean rows", () => {
    perceptionState = {
      claims: [
        { id: "1", statement: ODI, topic: "unknown", provenance: "public_observed" },
        { id: "2", statement: ANALYTIC, topic: "job", provenance: "public_observed" },
        { id: "3", statement: TEAMSTERS_BARE, topic: "market", provenance: "public_observed" },
        { id: "4", statement: TEAMSTERS_FULL, topic: "market", provenance: "public_observed" },
        { id: "5", statement: CLEAN, topic: "market", provenance: "public_observed" },
      ],
      loading: false,
    };
    const { container } = render(<OutsideMessageBand />);
    const text = container.textContent || "";
    expect(text).not.toContain("ODI"); // framework token excluded
    expect(text).not.toContain("organization needs to"); // analytic excluded
    expect(text).toContain(CLEAN);
    expect(text).toContain("Teamsters shop steward"); // the fuller variant
    // exactly 2 rows survive (clean + fuller Teamsters); bare Teamsters deduped away
    expect(container.querySelectorAll(".cvs-ob-msg").length).toBe(2);
  });
});

describe("V2-5b — export follows (guard + dedupe via shared paths)", () => {
  const data = (perception: string[]): FirstReadExportData => ({
    company: { name: "Acme" }, session: { id: "s1", date: "2026-07-23", presenter: null },
    statedProblem: null, standard: null, mirror: { score: null, bet: null, findings: [] },
    perception, check: { items: [], tally: { confirmed: 0, corrected: 0, rejected: 0, not_important: 0 } },
    gap: [], proposal: null, exportedAt: "2026-07-23T00:00:00Z",
  });
  it("renders the perception list it is given (ExportButton pre-filters via the same guard)", () => {
    // ExportButton applies splitPerception+dedupe; here we assert the export renders what it's handed
    const kept = dedupeByContainment(
      splitPerception([ODI, ANALYTIC, TEAMSTERS_BARE, TEAMSTERS_FULL, CLEAN].map((t) => ({ t })), (r) => r.t).admitted,
      (r) => r.t,
    ).map((r) => r.t);
    const html = buildFirstReadExportHtml(data(kept));
    expect(html).not.toContain("in ODI");
    expect(html).toContain(CLEAN);
    expect(html).toContain("Teamsters shop steward");
    expect(kept).toHaveLength(2);
  });
});

describe("V2-5b — normalizeForContainment", () => {
  it("lowercases + collapses whitespace", () => {
    expect(normalizeForContainment("  Foo   BAR ")).toBe("foo bar");
  });
});

import { readFileSync } from "node:fs";

describe("V2-5b — bars off: swept Act 3 components carry no left-border rail", () => {
  it("cvs-oq / cvs-mv-deferred / cvs-mv-handoff / cvs-mv-posgroup / cvs-mv-optgroup have no border-left", () => {
    const css = readFileSync("src/styles/client-story.css", "utf8");
    // grab each selector's rule block and assert no border-left within it
    for (const sel of ["cvs-oq", "cvs-mv-deferred", "cvs-mv-handoff", "cvs-mv-posgroup", "cvs-mv-optgroup"]) {
      const re = new RegExp(`\\.${sel}\\s*\\{([^}]*)\\}`, "g");
      let m: RegExpExecArray | null;
      let found = false;
      while ((m = re.exec(css)) !== null) {
        found = true;
        // FALSIFICATION: re-adding border-left to any swept block fails this
        expect(m[1], `.${sel} must not carry a left-border`).not.toMatch(/border-left|border-inline-start/);
      }
      expect(found, `.${sel} rule should exist`).toBe(true);
    }
  });
});
