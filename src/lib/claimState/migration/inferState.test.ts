import { describe, it, expect } from "vitest";
import { inferClaimState, type ClaimInferenceInput } from "./inferState";

function base(overrides: Partial<ClaimInferenceInput> = {}): ClaimInferenceInput {
  return {
    claimType: "market_hypothesis",
    signalRefs: [],
    linkedRoute: null,
    linkedOdiNeed: null,
    positioningCanvas: null,
    ...overrides,
  };
}

describe("inferClaimState", () => {
  // ── flow ──────────────────────────────────────────────────────────────────

  it("infers flow when linked route has an in_progress step", () => {
    expect(
      inferClaimState(
        base({ linkedRoute: { steps_json: [{ status: "in_progress" }] } }),
      ),
    ).toBe("flow");
  });

  it("infers flow when linked route has a complete step", () => {
    expect(
      inferClaimState(
        base({ linkedRoute: { steps_json: [{ status: "complete" }] } }),
      ),
    ).toBe("flow");
  });

  it("does not infer flow from a route with only pending steps", () => {
    expect(
      inferClaimState(
        base({ linkedRoute: { steps_json: [{ status: "pending" }] } }),
      ),
    ).not.toBe("flow");
  });

  it("does not infer flow from a route with null steps_json", () => {
    expect(
      inferClaimState(
        base({ linkedRoute: { steps_json: null } }),
      ),
    ).not.toBe("flow");
  });

  // ── focus ─────────────────────────────────────────────────────────────────

  it("infers focus from odi_need with importance≥1 and satisfaction>0", () => {
    expect(
      inferClaimState(
        base({ linkedOdiNeed: { importance: 7, satisfaction: 3 } }),
      ),
    ).toBe("focus");
  });

  it("does not infer focus when importance=0", () => {
    const result = inferClaimState(
      base({ linkedOdiNeed: { importance: 0, satisfaction: 5 } }),
    );
    expect(result).not.toBe("focus");
  });

  it("does not infer focus when satisfaction=0", () => {
    const result = inferClaimState(
      base({ linkedOdiNeed: { importance: 5, satisfaction: 0 } }),
    );
    expect(result).not.toBe("focus");
  });

  it("infers focus for positioning claim with non-empty canvas field", () => {
    expect(
      inferClaimState(
        base({
          claimType: "positioning",
          positioningCanvas: { category: "B2B SaaS", buyer: null, value: null },
        }),
      ),
    ).toBe("focus");
  });

  it("does not infer focus for positioning claim with all-empty canvas", () => {
    const result = inferClaimState(
      base({
        claimType: "positioning",
        positioningCanvas: { category: "", buyer: "  ", value: null },
      }),
    );
    expect(result).not.toBe("focus");
  });

  it("does not infer focus for non-positioning claim from canvas data", () => {
    const result = inferClaimState(
      base({
        claimType: "market_hypothesis",
        positioningCanvas: { category: "B2B SaaS", buyer: "CFO", value: "saves time" },
      }),
    );
    // positioning canvas doesn't apply to non-positioning claim types
    expect(result).not.toBe("focus");
  });

  // ── diagnose ──────────────────────────────────────────────────────────────

  it("infers diagnose from a single org-band signal ref", () => {
    expect(
      inferClaimState(
        base({
          signalRefs: [{ relationship: "supports", signal_band: "organization" }],
        }),
      ),
    ).toBe("diagnose");
  });

  it("infers diagnose from ≥2 signal refs of any band", () => {
    expect(
      inferClaimState(
        base({
          signalRefs: [
            { relationship: "supports", signal_band: "outside" },
            { relationship: "supports", signal_band: "customer" },
          ],
        }),
      ),
    ).toBe("diagnose");
  });

  it("does not infer diagnose from a single outside-band signal", () => {
    expect(
      inferClaimState(
        base({
          signalRefs: [{ relationship: "supports", signal_band: "outside" }],
        }),
      ),
    ).toBe("outside_view");
  });

  // ── outside_view ──────────────────────────────────────────────────────────

  it("infers outside_view when no evidence available", () => {
    expect(inferClaimState(base())).toBe("outside_view");
  });

  // ── priority: flow > focus > diagnose > outside_view ─────────────────────

  it("infers flow even when odiNeed would give focus", () => {
    expect(
      inferClaimState(
        base({
          linkedRoute: { steps_json: [{ status: "complete" }] },
          linkedOdiNeed: { importance: 8, satisfaction: 2 },
        }),
      ),
    ).toBe("flow");
  });

  it("infers focus even when org signal would give diagnose", () => {
    expect(
      inferClaimState(
        base({
          linkedOdiNeed: { importance: 5, satisfaction: 3 },
          signalRefs: [{ relationship: "supports", signal_band: "organization" }],
        }),
      ),
    ).toBe("focus");
  });
});
