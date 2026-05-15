// Smoke tests for the pure helper functions exported from runner.ts.
//
// Full Phase 1 DB integration tests are deferred pending a DB fixture strategy
// (the runner requires a live Supabase client; mocking all insert paths would
// duplicate the runner logic without adding signal). The tests here cover every
// pure-function path so the stateful integration is the only gap.

import { describe, it, expect } from "vitest";
import {
  deterministicClaimId,
  inferOdiNeedState,
  inferRouteState,
  type RouteRow,
} from "./runner";

// ── deterministicClaimId ──────────────────────────────────────────────────────

describe("deterministicClaimId", () => {
  it("returns a valid UUID-format string", () => {
    const id = deterministicClaimId("company-1", "odi_need", "need-abc");
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it("is deterministic — same inputs produce the same UUID", () => {
    const a = deterministicClaimId("company-1", "odi_need", "need-abc");
    const b = deterministicClaimId("company-1", "odi_need", "need-abc");
    expect(a).toBe(b);
  });

  it("different companyId → different UUID", () => {
    const a = deterministicClaimId("company-1", "odi_need", "need-abc");
    const b = deterministicClaimId("company-2", "odi_need", "need-abc");
    expect(a).not.toBe(b);
  });

  it("different sourceType → different UUID", () => {
    const a = deterministicClaimId("company-1", "odi_need", "key");
    const b = deterministicClaimId("company-1", "route", "key");
    expect(a).not.toBe(b);
  });

  it("different sourceKey → different UUID", () => {
    const a = deterministicClaimId("company-1", "odi_need", "key-1");
    const b = deterministicClaimId("company-1", "odi_need", "key-2");
    expect(a).not.toBe(b);
  });

  it("sets UUID version bits to 5", () => {
    // Version is encoded in the 13th hex char (first char of 3rd group)
    const id = deterministicClaimId("company-1", "canvas", "value_for_customer");
    const thirdGroup = id.split("-")[2];
    expect(thirdGroup[0]).toBe("5");
  });

  it("sets RFC 4122 variant bits correctly (8, 9, a, or b in 4th group first char)", () => {
    const id = deterministicClaimId("company-1", "canvas", "value_for_customer");
    const fourthGroup = id.split("-")[3];
    expect(["8", "9", "a", "b"]).toContain(fourthGroup[0]);
  });
});

// ── inferOdiNeedState ─────────────────────────────────────────────────────────

describe("inferOdiNeedState", () => {
  it("returns flow when linked to selected route, regardless of source path", () => {
    expect(inferOdiNeedState("public_research", 0, null, true)).toBe("flow");
    expect(inferOdiNeedState("interview", 8, 2, true)).toBe("flow");
  });

  // public paths

  it("public path + importance=0 → outside_view", () => {
    expect(inferOdiNeedState("public_research", 0, null, false)).toBe("outside_view");
    expect(inferOdiNeedState("baseline", 0, 5, false)).toBe("outside_view");
  });

  it("public path + importance>0 → diagnose", () => {
    expect(inferOdiNeedState("public_research", 5, 2, false)).toBe("diagnose");
    expect(inferOdiNeedState("baseline", 1, null, false)).toBe("diagnose");
  });

  // primary paths

  it("primary path + importance≥1 → focus", () => {
    expect(inferOdiNeedState("interview", 7, 3, false)).toBe("focus");
    expect(inferOdiNeedState("survey", 1, 0, false)).toBe("focus");
    expect(inferOdiNeedState("primary", 5, null, false)).toBe("focus");
  });

  it("primary path + importance=0 → outside_view", () => {
    expect(inferOdiNeedState("interview", 0, null, false)).toBe("outside_view");
    expect(inferOdiNeedState("survey", 0, 5, false)).toBe("outside_view");
  });

  // uncovered paths (org-internal or unknown)

  it("uncovered path + importance≥1 → diagnose", () => {
    expect(inferOdiNeedState("reconstructed_from_prior_screenshots", 5, 2, false)).toBe("diagnose");
    expect(inferOdiNeedState("evidence_derived_78e", 3, null, false)).toBe("diagnose");
    expect(inferOdiNeedState("unknown_source", 1, 0, false)).toBe("diagnose");
  });

  it("uncovered path + importance=0 → outside_view", () => {
    expect(inferOdiNeedState("reconstructed_from_prior_screenshots", 0, null, false)).toBe("outside_view");
    expect(inferOdiNeedState("unknown_source", 0, 5, false)).toBe("outside_view");
  });
});

// ── inferRouteState ───────────────────────────────────────────────────────────

function route(overrides: Partial<RouteRow> = {}): RouteRow {
  return {
    id: "route-1",
    title: null,
    short_description: null,
    category: null,
    claim_id: null,
    steps_json: [],
    evidence_json: [],
    ...overrides,
  };
}

describe("inferRouteState", () => {
  it("returns flow when route id matches selectedRouteId", () => {
    expect(inferRouteState(route({ id: "route-1" }), "route-1")).toBe("flow");
  });

  it("does not return flow when selectedRouteId is null", () => {
    expect(inferRouteState(route({ id: "route-1" }), null)).not.toBe("flow");
  });

  it("does not return flow when selectedRouteId is a different route", () => {
    expect(inferRouteState(route({ id: "route-1" }), "route-2")).not.toBe("flow");
  });

  it("returns focus when route has an in_progress step", () => {
    expect(
      inferRouteState(
        route({ steps_json: [{ status: "in_progress" }] }),
        null,
      ),
    ).toBe("focus");
  });

  it("returns focus when route has a complete step", () => {
    expect(
      inferRouteState(
        route({ steps_json: [{ status: "complete" }] }),
        null,
      ),
    ).toBe("focus");
  });

  it("does not count pending steps toward focus", () => {
    // all pending + no evidence → diagnose
    expect(
      inferRouteState(
        route({ steps_json: [{ status: "pending" }], evidence_json: [] }),
        null,
      ),
    ).toBe("diagnose");
  });

  it("returns focus when route has non-missing evidence (no started steps)", () => {
    expect(
      inferRouteState(
        route({ steps_json: [], evidence_json: [{ status: "complete" }] }),
        null,
      ),
    ).toBe("focus");
  });

  it("returns focus when evidence status is in_progress", () => {
    expect(
      inferRouteState(
        route({ steps_json: [], evidence_json: [{ status: "in_progress" }] }),
        null,
      ),
    ).toBe("focus");
  });

  it("returns diagnose when all evidence is missing", () => {
    expect(
      inferRouteState(
        route({
          steps_json: [{ status: "pending" }],
          evidence_json: [{ status: "missing" }, { status: "missing" }],
        }),
        null,
      ),
    ).toBe("diagnose");
  });

  it("returns diagnose when steps_json and evidence_json are null", () => {
    expect(
      inferRouteState(
        route({ steps_json: null, evidence_json: null }),
        null,
      ),
    ).toBe("diagnose");
  });

  it("returns diagnose when steps_json and evidence_json are empty", () => {
    expect(inferRouteState(route(), null)).toBe("diagnose");
  });

  it("flow takes priority over started steps", () => {
    expect(
      inferRouteState(
        route({ id: "route-1", steps_json: [{ status: "in_progress" }] }),
        "route-1",
      ),
    ).toBe("flow");
  });
});
