// Home reskin (2026-09-11) — COPY PARITY. HomepageHierarchyFR renders the First Read system, but every
// string the CRPV HomepageHierarchy rendered must still be there, byte-identical: the §5 inventory
// constants, and the same data-driven values for the same fixture. Two fixtures walk both paths of
// the Next Turn (insight three-beat; score-derived fallback with PTS), the 4/4 and the minimal
// foundation narratives, a research-backed top need and no need, directions and none.
//
// RED ON REVERT: the FR component does not exist before this gate.
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { HomepageHierarchy, type HomepageHierarchyProps } from "./HomepageHierarchy";
import { HomepageHierarchyFR, HOME_SIGNAL_CTA_HREF } from "./HomepageHierarchyFR";
import type { MojoScoreResult } from "@/lib/mojoScore/types";

const score = (total: number, raiser?: { action_description: string; estimated_points: number }): MojoScoreResult => ({
  company_id: "co", total_score: total, engagement_state: "diagnosing", methodology_version: "t", computed_at: "2026-09-11T00:00:00Z",
  contributors: [
    { key: "structural_completeness", label: "s", score: 20, weight: 0.3, weighted: 6, explanation: "" },
    { key: "customer_band_evidence", label: "c", score: 0, weight: 0.3, weighted: 0, explanation: "" },
  ],
  projected_raisers: raiser ? [{ ...raiser, key: "x", label: "x" } as unknown as MojoScoreResult["projected_raisers"][number]] : [],
});

const noop = () => {};
const base: Omit<HomepageHierarchyProps, "score"> = {
  dominantClaimState: "diagnose",
  foundationStatus: { positioningSet: true, strategyMapped: true, directionCount: 2, wrapPresent: true } as HomepageHierarchyProps["foundationStatus"],
  signalLandscape: { byBand: { outside: { count: 64 }, organization: { count: 3 }, customer: { count: 0 } } } as unknown as HomepageHierarchyProps["signalLandscape"],
  directionEvidence: { directions: [{ id: "r1", title: "Sharpen the promise", legCount: 3 }, { id: "r2", title: "Prove it with customers", legCount: 1 }], leaning: "r1" } as unknown as HomepageHierarchyProps["directionEvidence"],
  topNeed: { desired_outcome: "Know which price message lands before it ships", provenance_type: "manual" } as unknown as HomepageHierarchyProps["topNeed"],
  needCount: 7,
  companyCreatedAt: "2026-09-01T00:00:00Z",
  engagementDay: 12,
  insightNextTurn: { kind: "observation", observe: "You presented the package as a tripling of value", name_tension: "What would have to be true about your customers' views?", open: "What do your first conversations reveal — and what would change your mind?" },
  audienceShort: "New York sports fans",
  memberCount: 1,
  onGoToRoutes: noop, onGoToOpportunities: noop, onGoToWorkshop: noop,
};
const INSIGHT: HomepageHierarchyProps = { ...base, score: score(9) };
const FALLBACK: HomepageHierarchyProps = {
  ...base, score: score(41, { action_description: "Refresh the three stale claims. Then re-run the read.", estimated_points: 6 }),
  insightNextTurn: null, dominantClaimState: "focus",
  foundationStatus: { positioningSet: false, strategyMapped: false, directionCount: 0, wrapPresent: false } as HomepageHierarchyProps["foundationStatus"],
  topNeed: null, needCount: 0, directionEvidence: null, signalLandscape: null, engagementDay: null,
};

const text = (node: React.ReactElement) => render(<MemoryRouter>{node}</MemoryRouter>).container.textContent ?? "";
const norm = (s: string) => s.replace(/\s+/g, " ");

// The §5 constants, by fixture. Every one must appear in BOTH renders.
const CONSTANTS_INSIGHT = [
  "CURRENT", "REACHABLE", "DESTINATION", "NEXT: CUSTOMER EVIDENCE",    // compass + DETOUR badge (diagnose)
  "THE NEXT TURN",
  "01 · CONTEXT", "02 · SIGNAL", "03 · ROUTES",
  "The strategy reads well from inside. The next layer is hearing how New York sports fans see it — your foundation is MAPPED — that's the starting point for the conversation.",
  "DAY", "SCORE", "FOUNDATION", "MAPPED",
  "— TOP OPPORTUNITY · WHAT YOU MAPPED · 1 OF 7",
  "PUBLIC", "TEAM", "CUSTOMERS",
  "SEE ALL 7 UNADDRESSED OPPORTUNITIES →",
  "SEE ALL 2 ROUTES →",
];
const CONSTANTS_FALLBACK = [
  "NEXT: DIRECTION VALIDATION",                                        // DETOUR badge (focus)
  "THE NEXT TURN", "Refresh the three stale claims.", "Then re-run the read.", "+6 PTS",
  "The foundation work is underway. More to build, but a real start has been made.",
  "MINIMAL", "No customer input yet.", "No directions mapped yet.",
];
// …and, as before, the two CTAs are ABSENT when there is nothing to see all of.
const ABSENT_FALLBACK = ["UNADDRESSED OPPORTUNITIES", "ROUTES →"];

describe("home reskin — copy parity (HomepageHierarchyFR vs HomepageHierarchy)", () => {
  it("insight path: every inventory constant and every data value is in both renders", () => {
    const old = norm(text(<HomepageHierarchy {...INSIGHT} />));
    const fr = norm(text(<HomepageHierarchyFR {...INSIGHT} />));
    for (const s of CONSTANTS_INSIGHT) {
      expect(old, `old lacks: ${s}`).toContain(s);
      expect(fr, `fr lacks: ${s}`).toContain(s);
    }
    // data-driven values (the same fixture → the same strings)
    for (const s of [INSIGHT.insightNextTurn!.observe, INSIGHT.insightNextTurn!.name_tension, "→ What do your first conversations reveal", `"${(INSIGHT.topNeed as { desired_outcome: string }).desired_outcome}"`, "Sharpen the promise", "Prove it with customers", "64", "12"]) {
      expect(old).toContain(s);
      expect(fr).toContain(s);
    }
    // the compass numbers: CURRENT · 9 and the same reachable/unlockable in both
    const nums = (t: string) => [/CURRENT · (\d+)/, /REACHABLE · (\d+)/, /DESTINATION · (\d+)/].map((re) => t.match(re)?.[1]);
    expect(nums(fr)).toEqual(nums(old));
    expect(nums(fr)[0]).toBe("9");
  });

  it("fallback path: PTS line, minimal foundation, empties, zero-count CTAs — in both renders", () => {
    const old = norm(text(<HomepageHierarchy {...FALLBACK} />));
    const fr = norm(text(<HomepageHierarchyFR {...FALLBACK} />));
    for (const s of CONSTANTS_FALLBACK) {
      expect(old, `old lacks: ${s}`).toContain(s);
      expect(fr, `fr lacks: ${s}`).toContain(s);
    }
    for (const s of ABSENT_FALLBACK) {
      expect(old, `old shows: ${s}`).not.toContain(s);
      expect(fr, `fr shows: ${s}`).not.toContain(s);
    }
    expect(fr).toContain("DAY —");
    expect(old).toContain("DAY—"); // the old render puts DAY and — in separate nodes; textContent joins them
    const { container } = render(<MemoryRouter><HomepageHierarchyFR {...FALLBACK} /></MemoryRouter>);
    const hero = container.querySelector('[data-testid="home-hero"]')!;
    expect(hero.querySelector(".fr-home-hero-title")?.textContent).toBe("Refresh the three stale claims. Then re-run the read.");
    expect(hero.querySelector(".fr-home-pts")?.textContent).toBe("+6 PTS");
  });

  it("attribution variants render the same words in both", () => {
    const variants: Array<[string, string | null]> = [
      ["manual", "WHAT YOU MAPPED"], ["public_research", "OUR READ OF YOUR PUBLIC PRESENCE"],
      ["internal_declared", "A STARTING HYPOTHESIS"], ["odi_survey", "CONFIRMED WITH CUSTOMERS"], ["mystery", null],
    ];
    for (const [prov, label] of variants) {
      const props = { ...INSIGHT, topNeed: { desired_outcome: "x", provenance_type: prov } as unknown as HomepageHierarchyProps["topNeed"] };
      const old = norm(text(<HomepageHierarchy {...props} />));
      const fr = norm(text(<HomepageHierarchyFR {...props} />));
      if (label) { expect(old).toContain(label); expect(fr).toContain(label); }
      else { expect(old).toContain("— TOP OPPORTUNITY · 1 OF 7"); expect(fr).toContain("— TOP OPPORTUNITY · 1 OF 7"); }
    }
    // team language adapts identically
    const team = { ...INSIGHT, memberCount: 3, topNeed: { desired_outcome: "x", provenance_type: "manual" } as unknown as HomepageHierarchyProps["topNeed"] };
    expect(norm(text(<HomepageHierarchyFR {...team} />))).toContain("WHAT YOUR TEAM MAPPED");
  });

  it("(c) the SIGNAL CTA is a link to /workshop?tab=needs and nothing on the page starts with /legacy/", () => {
    const { container } = render(<MemoryRouter><HomepageHierarchyFR {...INSIGHT} /></MemoryRouter>);
    const cta = container.querySelector('[data-testid="home-signal-cta"]');
    expect(cta?.getAttribute("href")).toBe("/preview/client-refine/workshop?tab=needs");
    expect(HOME_SIGNAL_CTA_HREF).toBe("/preview/client-refine/workshop?tab=needs");
    const hrefs = [...container.querySelectorAll("a[href]")].map((a) => a.getAttribute("href") ?? "");
    expect(hrefs.filter((h) => h.startsWith("/legacy/"))).toEqual([]);
  });

  it("FR structure (layout correction): rail = company title + identity lede + 01 · CONTEXT aside; body = compass, hero at display scale, rows 02/03", () => {
    const { container } = render(<MemoryRouter><HomepageHierarchyFR {...INSIGHT} railTitle="Gotham Sports" railDay={12} railState="OUTSIDE SIGNALS" /></MemoryRouter>);
    const side = container.querySelector(".fr-spread-side")!;
    const main = container.querySelector(".fr-spread-main")!;
    expect(side.querySelector(".fr-spread-title")?.textContent).toBe("Gotham Sports");          // + the decoration stop (CSS content, never DOM text)
    expect(side.querySelector(".fr-home-identity")?.textContent).toBe("DAY 12 · OUTSIDE SIGNALS");
    expect(side.querySelector('[data-testid="home-context"] .fr-eyebrow')?.textContent).toBe("01 · CONTEXT");
    expect(side.textContent).toContain("DAY 12 · SCORE 9 → 51 · FOUNDATION MAPPED");
    expect(side.textContent).not.toContain("THE NEXT TURN");                                     // the hero left the rail
    // body order: compass → hero → rows
    const order = [...main.querySelectorAll('[data-testid="fr-hscale"], [data-testid="home-hero"], .fr-hanging-list')].map((e) => e.getAttribute("data-testid") ?? e.className);
    expect(order).toEqual(["fr-hscale", "home-hero", "fr-hanging-list"]);
    const hero = main.querySelector('[data-testid="home-hero"]')!;
    expect(hero.querySelector(".fr-eyebrow")?.textContent).toBe("THE NEXT TURN");
    // the hero headline IS the First Read statement headline (beat 3 "Winning aspiration"): same classes
    const h1 = hero.querySelector("h1")!;
    for (const c of ["fr-display", "fr-h-statement", "fr-h-statement--wide", "mt-4", "fr-home-hero-title"]) expect(h1.classList.contains(c), c).toBe(true);
    expect(h1.textContent).toBe(INSIGHT.insightNextTurn!.observe);
    expect(hero.querySelector(".fr-home-hero-statement")?.textContent).toBe(INSIGHT.insightNextTurn!.name_tension);
    expect(hero.querySelector(".fr-home-open")?.textContent).toBe("→ " + INSIGHT.insightNextTurn!.open);
    expect(container.querySelectorAll(".fr-hanging-list > .fr-hanging")).toHaveLength(2);
    expect([...container.querySelectorAll(".fr-hanging .fr-eyebrow")].map((e) => e.textContent)).toEqual(["02 · SIGNAL", "03 · ROUTES"]);
    expect(container.querySelector(".fr-spread")).toBeTruthy();
    expect(container.innerHTML).not.toMatch(/#ff5b29|255, 91, 41/i);   // the old orange, gone
    expect(container.querySelectorAll(".fr-home-accent").length).toBeGreaterThan(0);   // electric-sol via class, never a literal
  });
});
