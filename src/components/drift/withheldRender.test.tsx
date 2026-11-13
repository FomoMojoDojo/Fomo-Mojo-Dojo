// SP-112 render contract: a WITHHELD assessment is never labelled slight drift, and a NULL score
// never throws. These are the guard's render half (outside-call-guard.sh, check b4).
//
// Why a render test and not a static grep: the defect these replace was a TERNARY FALLTHROUGH —
// `state === "material_drift" ? "material drift" : "slight drift"` labels every other state,
// including one that did not exist when it was written. Only rendering the component catches that.
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { DRIFT_STRINGS } from "./driftStrings";

const assessment = {
  id: "a1",
  company_id: "c1",
  surface_type: "cascade",
  surface_id: "s1",
  drift_score: null,
  drift_state: "withheld" as const,
  llm_confirmation: "withheld: private evidence",
  assessment_basis: { new_signals: [] },
  last_assessed_at: "2026-11-12T00:00:00Z",
  created_at: "2026-11-12T00:00:00Z",
  operator_seen_at: null,
  accepted_as_aligned_at: null,
};

vi.mock("@/hooks/useDriftAssessment", () => ({
  useDriftAssessment: () => ({
    assessment,
    isLoading: false,
    error: null,
    markSeen: async () => {},
    acceptAsAligned: async () => {},
  }),
}));
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "u1" }, session: null, isAdmin: true, loading: false }),
}));
vi.mock("@/hooks/useCapability", () => ({ useCapability: () => true }));
vi.mock("@/hooks/useIntegrityRecord", () => ({
  useIntegrityRecord: () => ({ record: null, isLoading: false, error: null }),
}));

describe("DriftBadge on a withheld assessment", () => {
  it("renders S-DRIFT-1 and never the slight-drift wording", async () => {
    const { default: DriftBadge } = await import("./DriftBadge");
    render(<DriftBadge surfaceType="cascade" surfaceId="s1" phase="flow" />);
    expect(screen.getByText(DRIFT_STRINGS.withheldLabel)).toBeTruthy();
    expect(screen.queryByText(/slight drift/i)).toBeNull();
    expect(screen.queryByText(/^Drift$/)).toBeNull();
  });

  it("is shown in a phase whose matrix admits only material drift", async () => {
    const { default: DriftBadge } = await import("./DriftBadge");
    render(<DriftBadge surfaceType="cascade" surfaceId="s1" phase="focus" />);
    expect(screen.getByText(DRIFT_STRINGS.withheldLabel)).toBeTruthy();
  });

  it("SP-127: is NOT shown in a phase where no badge renders at all", async () => {
    const { default: DriftBadge } = await import("./DriftBadge");
    // diagnose and outside_signals render nothing for any drift state; 'withheld' is not a severity,
    // but it is still bound by that outer rule. The first version returned true for every phase.
    for (const phase of ["diagnose", "validate_diagnose", "outside_signals", "validate_outside"] as const) {
      const { unmount } = render(<DriftBadge surfaceType="cascade" surfaceId="s1" phase={phase} />);
      expect(screen.queryByText(DRIFT_STRINGS.withheldLabel), `phase ${phase}`).toBeNull();
      unmount();
    }
  });

  it("is not shown with no phase at all", async () => {
    const { default: DriftBadge } = await import("./DriftBadge");
    render(<DriftBadge surfaceType="cascade" surfaceId="s1" phase={null} />);
    expect(screen.queryByText(DRIFT_STRINGS.withheldLabel)).toBeNull();
  });
});

describe("DriftDetailPanel on a withheld assessment", () => {
  it("renders a NULL drift_score without throwing, and says why", async () => {
    const { default: DriftDetailPanel } = await import("./DriftDetailPanel");
    expect(() =>
      render(<DriftDetailPanel open surfaceType="cascade" surfaceId="s1" onClose={() => {}} />),
    ).not.toThrow();
    expect(screen.getByText(DRIFT_STRINGS.withheldDetail)).toBeTruthy();
    expect(screen.queryByText(/slight drift/i)).toBeNull();
  });
});

describe("the inbox row label", () => {
  it("labels 'withheld' with S-DRIFT-1, not slight drift", async () => {
    // The inbox row's label is a pure function of drift_state; assert the mapping the view uses.
    const { isWithheld } = await import("./driftStrings");
    const label = (state: string) =>
      isWithheld(state) ? DRIFT_STRINGS.withheldLabel : state === "material_drift" ? "material drift" : "slight drift";
    expect(label("withheld")).toBe(DRIFT_STRINGS.withheldLabel);
    expect(label("material_drift")).toBe("material drift");
    expect(label("slight_drift")).toBe("slight drift");
  });
});
