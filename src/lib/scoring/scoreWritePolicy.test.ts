import { describe, expect, it } from "vitest";
import { SCORE_COLUMNS, stripScoreColumns } from "./scoreWritePolicy";
import { computeMojoScore } from "../mojoScore/computeMojoScore";
import type { ClaimInput, NeedInput, RouteInput } from "../mojoScore/types";

// Mirrors scoreCompanyMojo's return shape in research-company (the gate-based
// market calibration read).
const gateScorerResult = {
  mojo_score: 42,
  potential_score: 60,
  projected_score: 74,
  evidence_status: "baseline_plus_artifacts",
  evidence_note: "ledger=10, avg_conf=72.7",
  area_scores_json: { gate_score: 54.1, outputs: { mojo_score: 42 } },
};

describe("SCORE-1 write policy — snapshotMojoScore is the sole score-column writer", () => {
  it("strips exactly the three canonical score columns from a calibration result", () => {
    const record = stripScoreColumns(gateScorerResult);

    for (const column of SCORE_COLUMNS) {
      expect(record).not.toHaveProperty(column);
    }
    expect(record.evidence_status).toBe("baseline_plus_artifacts");
    expect(record.evidence_note).toBe("ledger=10, avg_conf=72.7");
    expect(record.area_scores_json).toEqual(gateScorerResult.area_scores_json);
  });

  it("keeps the gate-based numbers recorded inside area_scores_json (calibration trail survives)", () => {
    const record = stripScoreColumns(gateScorerResult);
    expect((record.area_scores_json as { outputs: { mojo_score: number } }).outputs.mojo_score).toBe(42);
  });

  it("pins the canonical column trio", () => {
    expect([...SCORE_COLUMNS]).toEqual(["mojo_score", "potential_score", "projected_score"]);
  });
});

// ── Post-spine snapshot property ─────────────────────────────────────────────
// The FMD-1 birth persisted a v1.1.0 snapshot computed MID-birth (claims only,
// spine not yet inserted) — total 9, structural components all 0. SCORE-1 moves
// the snapshot to the END of research-company, after all artifacts land. This
// proves the property that placement relies on: the same computation, given the
// full spine, scores strictly higher than the claims-only mid-birth input.

function makeClaims(): ClaimInput[] {
  return Array.from({ length: 6 }, (_, i) => ({
    id: `claim-${i}`,
    state: i < 2 ? "diagnose" : "outside_view",
    claim_type: "inference",
    topic: "positioning",
    outside_support_count: 1,
    organization_support_count: 0,
    customer_support_count: 0,
    updated_at: new Date().toISOString(),
  }));
}

function makeSpineRoutes(): RouteInput[] {
  const leg = (id: string, category: string, parent: string): RouteInput => ({
    id,
    category,
    level: "leg",
    parent_id: parent,
    claim_id: "claim-0",
    steps_json: [
      { id: `${id}-s1`, title: "step one", status: "complete" },
      { id: `${id}-s2`, title: "step two", status: "in_progress" },
    ],
    evidence_json: [{ id: `${id}-e1`, title: "evidence", status: "complete" }],
    rejected_alternatives: [{ alternative_title: "alt", rejection_reason: "worse" }],
    what_would_have_to_be_true: [{ condition: "buyers respond", satisfied_flag: false }],
    linked_need_ids: ["need-0"],
    updated_at: new Date().toISOString(),
  });
  return [
    { id: "route-1", category: "fix", level: "route", updated_at: new Date().toISOString() },
    leg("leg-1", "fix", "route-1"),
    leg("leg-2", "improve", "route-1"),
    leg("leg-3", "create", "route-1"),
  ];
}

function makeNeeds(): NeedInput[] {
  return Array.from({ length: 4 }, (_, i) => ({
    id: `need-${i}`,
    desired_outcome: `outcome ${i}`,
    importance: 8,
    satisfaction: 4,
    opportunity_score: 12,
    service_state: "underserved",
    updated_at: new Date().toISOString(),
  }));
}

describe("SCORE-1 post-spine snapshot — full spine scores above the mid-birth input", () => {
  const computedAt = new Date().toISOString();

  it("claims-only (mid-birth) input scores strictly below the full-spine input", () => {
    const midBirth = computeMojoScore({
      companyId: "company-1",
      claims: makeClaims(),
      routes: [],
      needs: [],
      computedAt,
    });
    const postSpine = computeMojoScore({
      companyId: "company-1",
      claims: makeClaims(),
      routes: makeSpineRoutes(),
      needs: makeNeeds(),
      computedAt,
    });

    expect(postSpine.total_score).toBeGreaterThan(midBirth.total_score);
  });

  it("full-spine snapshot registers spine-fed contributors above zero", () => {
    const postSpine = computeMojoScore({
      companyId: "company-1",
      claims: makeClaims(),
      routes: makeSpineRoutes(),
      needs: makeNeeds(),
      computedAt,
    });
    const byKey = new Map(postSpine.contributors.map((c) => [c.key, c.score]));

    // structural_completeness / wrap_evidence are known-broken at HEAD (the 14
    // pre-existing red tests document it; restoring them is SCORE-2). Assert on
    // the spine-fed contributors that DO work today — enough to prove the
    // post-spine snapshot sees the spine, which the mid-birth snapshot did not.
    expect(byKey.get("customer_band_evidence") ?? 0).toBeGreaterThan(0);
    expect(byKey.get("action_portfolio_balance") ?? 0).toBeGreaterThan(0);
    expect(byKey.get("opportunity_route_coverage") ?? 0).toBeGreaterThan(0);
  });
});
