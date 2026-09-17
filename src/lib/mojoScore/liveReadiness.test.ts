// Header readiness from the live score (2026-09-16). The empty company is the planted case: the
// stored-score anatomy path minted 48 / 64 / 64 / "Directional readiness" on a null mojo_score; the live
// path yields the home compass's own 0 / 45 / 84 and the score→tier word — and, on a "none" record,
// the workshop does not render it at all (source guard below). Non-empty: the three numbers equal the
// compass's (computeMojoScore → projections) exactly.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { computeMojoScore } from "./computeMojoScore";
import { computeReachableScore, computeUnlockableScore } from "./projections";
import { liveReadiness } from "./liveReadiness";
import { buildReadinessFromCompanySignals } from "@/lib/mojoScoreFromAnatomy";

const empty = computeMojoScore({ companyId: "co", claims: [], routes: [], needs: [], computedAt: "2026-09-16T00:00:00Z" });

describe("liveReadiness", () => {
  it("empty company: live 0 / 45 / 84 + Insufficient readiness — not the anatomy's 48 / 64 / 64 / Directional", () => {
    const before = buildReadinessFromCompanySignals({ mojoScore: null, evidenceStatus: null });
    expect([before.currentReadiness, before.nearTermPotential, before.structuralUpside, before.postureLabel]).toEqual([48, 64, 64, "Directional readiness"]);
    const after = liveReadiness(empty)!;
    expect([after.currentReadiness, after.nearTermPotential, after.structuralUpside, after.postureLabel]).toEqual([0, 45, 84, "Insufficient readiness"]);
    expect(after.ceilingReason).toBeNull();
  });
  it("binds to the compass's numbers exactly (same result → same projections)", () => {
    const r = computeMojoScore({
      companyId: "co", computedAt: "2026-09-16T00:00:00Z",
      claims: [{ id: "c1", state: "diagnose", claim_type: "positioning", topic: "t", outside_support_count: 2, organization_support_count: 1, customer_support_count: 0, updated_at: "2026-09-01T00:00:00Z" }],
      routes: [{ id: "r1", category: "fix", level: "route", parent_id: null, steps_json: null, evidence_json: null, why_this_matters_json: null, rejected_alternatives: null, what_would_have_to_be_true: null, linked_need_ids: null, updated_at: null }],
      needs: [{ id: "n1", desired_outcome: "x", importance: 8, satisfaction: 3, opportunity_score: 13, service_state: "underserved", updated_at: null }],
    });
    const lr = liveReadiness(r)!;
    expect(lr.currentReadiness).toBe(Math.round(r.total_score));
    expect(lr.nearTermPotential).toBe(computeReachableScore(r));
    expect(lr.structuralUpside).toBe(computeUnlockableScore(computeReachableScore(r), r));
    expect(lr.currentReadiness <= lr.nearTermPotential && lr.nearTermPotential <= lr.structuralUpside).toBe(true);
  });
  it("null score → null (no company)", () => { expect(liveReadiness(null)).toBeNull(); });
});

// ── Source guards: the three views that cannot be mounted cheaply ─────────────────────────────────
const src = (p: string) => readFileSync(p, "utf8");
describe("evidence-presence suppression — source guards", () => {
  it("workshop: header readiness is the live path; ScoreContextBar is withheld on a none record", () => {
    const s = src("src/views/client/ClientRefinePreviewWorkshopView.tsx");
    expect(s).not.toContain("buildReadinessFromCompanySignals");
    expect(s).toContain("useLiveMojoScore(companyId, workshopClaimsMap, routes, unscopedNeeds)");
    expect(s).toContain("liveReadiness(liveScore)");
    expect(s).toMatch(/evidencePresence === "none" \? \(\s*<p[^>]*data-testid="workshop-no-evidence-note"[^>]*>\{NOT_ENOUGH_SIGNAL_NOTE\}<\/p>\s*\) : readiness \? \(\s*<ScoreContextBar/);
  });
  it("preview routes view: ScoreContextBar is withheld on a none record", () => {
    const s = src("src/views/client/ClientRefinePreviewRoutesView.tsx");
    expect(s).toContain('useEvidencePresence(activeCompany?.id)');
    expect(s).toMatch(/evidencePresence === "none" \? \(\s*<p[^>]*data-testid="routesview-no-evidence-note"[^>]*>\{NOT_ENOUGH_SIGNAL_NOTE\}<\/p>\s*\) : \(\s*<ScoreContextBar/);
  });
  it("client score view: the score section is withheld on a none record", () => {
    const s = src("src/views/client/ClientScoreView.tsx");
    expect(s).toContain('useEvidencePresence(activeCompany?.id)');
    expect(s).toMatch(/evidencePresence === "none" \? \([\s\S]*?data-testid="scoreview-no-evidence-note"[^>]*>\{NOT_ENOUGH_SIGNAL_NOTE\}<\/p>[\s\S]*?\) : \(\s*<section id="client-what-this-means"/);
  });
  it("the note is the First Read's signed string, imported — never re-typed", () => {
    for (const p of ["src/components/client/HomepageHierarchyFR.tsx", "src/views/client/workspace/RoutesPage.tsx", "src/views/client/ClientRefinePreviewWorkshopView.tsx", "src/views/client/ClientRefinePreviewRoutesView.tsx", "src/views/client/ClientScoreView.tsx"]) {
      const s = src(p);
      expect(s, p).toContain('from "@/views/client/firstReadPreview/signedNotes"');
      expect(s, p).not.toContain("Not enough public signal to score yet.");
    }
    expect(src("src/views/client/firstReadPreview/acts.tsx")).toContain('import { NOT_ENOUGH_SIGNAL_NOTE } from "./signedNotes"');
  });
});
