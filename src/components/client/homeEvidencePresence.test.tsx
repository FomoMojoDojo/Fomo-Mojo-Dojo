// Evidence presence — the home (2026-09-16). On a persisted "none" record HomepageHierarchyFR shows no
// score, no projection and no progress narrative: no compass (CURRENT / REACHABLE / DESTINATION, the
// NEXT badge), no "SCORE a → b · FOUNDATION label" meta, no foundation sentence, no "+n PTS" — the
// signed note in their place. "present" and null (unknown) are byte-identical to the render before
// the prop existed. Fixtures are the parity suite's.
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { HomepageHierarchyFR } from "./HomepageHierarchyFR";
import type { HomepageHierarchyProps } from "./HomepageHierarchy";
import type { MojoScoreResult } from "@/lib/mojoScore/types";
import { NOT_ENOUGH_SIGNAL_NOTE } from "@/views/client/firstReadPreview/signedNotes";

const score = (total: number, raiser?: { action_description: string; estimated_points: number }): MojoScoreResult => ({
  company_id: "co", total_score: total, engagement_state: "diagnosing", methodology_version: "t", computed_at: "2026-09-11T00:00:00Z",
  contributors: [
    { key: "structural_completeness", label: "s", score: 20, weight: 0.3, weighted: 6, explanation: "" },
    { key: "customer_band_evidence", label: "c", score: 0, weight: 0.3, weighted: 0, explanation: "" },
  ],
  projected_raisers: raiser ? [{ ...raiser, key: "x", label: "x" } as unknown as MojoScoreResult["projected_raisers"][number]] : [],
});
const noop = () => {};
// The empty company's shape: score 0, no insight, a score-derived raiser (the projection), minimal foundation.
const EMPTY: HomepageHierarchyProps = {
  score: score(0, { action_description: "Refresh the three stale claims. Then re-run the read.", estimated_points: 6 }),
  dominantClaimState: null, engagementPhase: "outside_view",
  foundationStatus: { positioningSet: false, strategyMapped: false, directionCount: 0, wrapPresent: false } as HomepageHierarchyProps["foundationStatus"],
  signalLandscape: null, directionEvidence: null, topNeed: null, needCount: 0, companyCreatedAt: "2026-09-01T00:00:00Z", engagementDay: 3,
  insightNextTurn: null, audienceShort: null, memberCount: 1, onGoToRoutes: noop, onGoToOpportunities: noop, onGoToWorkshop: noop,
};
const html = (node: React.ReactElement) => render(<MemoryRouter>{node}</MemoryRouter>).container.innerHTML;
const text = (node: React.ReactElement) => render(<MemoryRouter>{node}</MemoryRouter>).container.textContent ?? "";

describe("HomepageHierarchyFR — evidence presence", () => {
  it("present / unknown: the render is byte-identical to the pre-prop render", () => {
    const before = html(<HomepageHierarchyFR {...EMPTY} />);
    expect(html(<HomepageHierarchyFR {...EMPTY} evidencePresence="present" />)).toBe(before);
    expect(html(<HomepageHierarchyFR {...EMPTY} evidencePresence={null} />)).toBe(before);
    // …and that render carries the numbers this brief suppresses (so the "none" case below is not vacuous)
    for (const s of ["CURRENT", "REACHABLE", "DESTINATION", "NEXT:", "SCORE 0 →", "FOUNDATION MINIMAL", "+6 PTS", "The foundation work is underway"]) {
      expect(before.replace(/<[^>]+>/g, ""), `present lacks: ${s}`).toContain(s);
    }
  });

  it("none: no compass, no SCORE meta, no NEXT label, no foundation sentence or label, no PTS — the signed note", () => {
    const { container } = render(<MemoryRouter><HomepageHierarchyFR {...EMPTY} evidencePresence="none" /></MemoryRouter>);
    const t = (container.textContent ?? "").replace(/\s+/g, " ");
    for (const s of ["CURRENT", "REACHABLE", "DESTINATION", "NEXT:", "SCORE", "FOUNDATION", "MINIMAL", "PTS", "The foundation work is underway", "THE NEXT TURN"]) {
      expect(t, `none still shows: ${s}`).not.toContain(s);
    }
    expect(container.querySelector("[data-testid=fr-hscale]")).toBeNull();
    expect(container.querySelector("[data-testid=home-compass-note]")?.textContent).toBe(NOT_ENOUGH_SIGNAL_NOTE);
    expect(container.querySelector("[data-testid=home-no-evidence-note]")?.textContent).toBe(NOT_ENOUGH_SIGNAL_NOTE);
    expect(t).toContain("DAY 3");            // the day survives; only the score / foundation segments go
    expect(t).toContain("01 · CONTEXT");     // the sections stay
    expect(t).toContain("02 · SIGNAL");
    expect(t).toContain("03 · ROUTES");
    expect(container.querySelector("[data-testid=home-fr]")?.getAttribute("data-evidence-presence")).toBe("none");
  });

  it("none: no new client string — the note is the First Read's signed one", () => {
    expect(NOT_ENOUGH_SIGNAL_NOTE).toBe("Not enough public signal to score yet.");
    expect(text(<HomepageHierarchyFR {...EMPTY} evidencePresence="none" />).split(NOT_ENOUGH_SIGNAL_NOTE).length - 1).toBe(2);
  });
});
