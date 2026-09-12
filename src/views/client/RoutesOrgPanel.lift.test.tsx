// LIFT PARITY (Routes Tier 1, 2026-09-12) — choose / clear moved out of RoutesOrgPanel into
// @/hooks/useRouteDecision, the generate-proposal handler into @/hooks/useRouteProposalHandlers, and
// the view's ungated drift check replaced by useDriftScan.checkSurfaceGated (ruling 1). This mounts the
// real panel in the hierarchy layout (the Edgewood layout: one route + one test-class leg) and proves:
//   Choose this path → calls chooseRoute(route) and the marker reads CHOSEN PATH; Deselect calls clearRoute
//   Check for drift (route and leg) → checkSurfaceGated("route", id); drift.scan false ⇒ zero invokes
//   the per-leg Generate test invokes generate-leg-tests with leg_ids:[legId] (ruling 4)
//   the drift panel's Propose route changes → handleGenerateRouteProposal(routeId)
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { RoutesOrgPanel } from "./ClientRefinePreviewRoutesView";
import type { RouteRow } from "@/hooks/useRoutes";
import type { Company } from "@/hooks/useCompany";

const caps = vi.hoisted(() => ({ scan: true }));
vi.mock("@/hooks/useCapability", () => ({ useCapability: (cap: string) => (cap === "governance.drift.scan" ? caps.scan : true) }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "u1" }, isAdmin: true }) }));
vi.mock("@/lib/frozenCompanies", () => ({ isFrozenCompany: () => false, FROZEN_COMPANY_IDS: new Set() }));
const decision = vi.hoisted(() => ({
  selectedRouteId: null as string | null,
  chooseRoute: vi.fn(async (_r: unknown) => {}),
  clearRoute: vi.fn(async () => {}),
}));
vi.mock("@/hooks/useRouteDecision", () => ({
  useRouteDecision: () => ({ selectedRouteId: decision.selectedRouteId, savedAt: null, chooseRoute: decision.chooseRoute, clearRoute: decision.clearRoute }),
}));
const proposals = vi.hoisted(() => ({ handleGenerateRouteProposal: vi.fn(async (_id: string) => {}) }));
vi.mock("@/hooks/useRouteProposalHandlers", () => ({
  useRouteProposalHandlers: () => ({ canGenRoute: true, routeProposalsMap: new Map(), generateLoadingRouteId: null, handleGenerateRouteProposal: proposals.handleGenerateRouteProposal, bumpProposals: () => {} }),
}));
const drift = vi.hoisted(() => ({ checkSurfaceGated: vi.fn((_t: string, _id: string) => {}), gate: null as null | { canScan: boolean } }));
vi.mock("@/hooks/useDriftScan", () => ({
  useDriftScan: (_c: unknown, gate: { canScan: boolean }) => { drift.gate = gate; return { scanningAll: false, checkingSurfaceId: null, scanAllSurfaces: () => {}, checkSurface: () => {}, scanAllGated: () => {}, checkSurfaceGated: (t: string, id: string) => { if (!gate.canScan) return; drift.checkSurfaceGated(t, id); } }; },
}));
vi.mock("@/hooks/useDriftAssessment", () => ({ useDriftAssessment: () => ({ assessment: null, isLoading: false, error: null, markSeen: async () => {}, acceptAsAligned: async () => {}, setAssessment: () => {} }) }));
vi.mock("@/hooks/useIntegrityRecord", () => ({ useIntegrityRecord: () => ({ record: null, loading: false, error: null }) }));
vi.mock("@/hooks/useStrategicHypotheses", () => ({ useStrategicHypotheses: () => ({ data: [] }), useRouteHypothesisDependencies: () => ({ data: [] }) }));
vi.mock("@/hooks/useSignalLandscape", () => ({ useSignalLandscape: () => ({ landscape: null }) }));
vi.mock("@/lib/desiredOutcomes", () => ({ useDesiredOutcomes: () => ({ primary: null }) }));
vi.mock("@/lib/claims/useCompanyClaims", () => ({ useCompanyClaims: () => ({ claims: new Map(), loading: false }) }));
vi.mock("@/hooks/useRouteProposals", () => ({ useRouteProposals: () => ({ proposals: new Map(), loading: false }) }));
vi.mock("@/hooks/useDriftInbox", () => ({ useDriftInboxCount: () => ({ totalUnresolved: 0, newCount: 0 }) }));
vi.mock("@/hooks/useSurfaceEducation", () => ({ useSurfaceEducation: () => ({ rows: [], loading: false }) }));
const invoke = vi.hoisted(() => vi.fn(async (_fn: string, _opts: unknown) => ({ data: { ok: true }, error: null })));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: { invoke },
    // LegTestPanel's `tests` read (no row) — every other table access is a write the panel must not make.
    from: (table: string) => {
      if (table !== "tests") throw new Error(`unexpected write/read on ${table}`);
      const b: Record<string, unknown> = {};
      for (const op of ["select", "eq", "order", "limit"]) b[op] = () => b;
      b.maybeSingle = async () => ({ data: null, error: null });
      return b;
    },
  },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), loading: vi.fn() } }));

const COMPANY = { id: "c1", name: "Edgewood", engagement_phase: "diagnose", selected_route_id: null, selected_route_updated_at: null, selected_route_summary_json: null, excluded_signals_json: [] } as unknown as Company;
const ROUTE: RouteRow = { id: "route-1", company_id: "c1", title: "Clarify eligibility criteria before funding", short_description: "Families search blind.", category: "fix", level: "route", parent_id: null, relevance_state: "active", provenance_type: "public_research", what_would_have_to_be_true: [{ condition: "Families value clear eligibility information", satisfied_flag: false }], steps_json: [], evidence_json: [], why_this_matters_json: ["Search delays cost families weeks."] } as unknown as RouteRow;
const LEG: RouteRow = { id: "leg-1", company_id: "c1", title: "Survey families on how unclear rules affect their search", short_description: "The move.", category: "fix", level: "leg", parent_id: "route-1", relevance_state: "active", provenance_type: "internal_hypothesis", what_would_have_to_be_true: [{ condition: "Families value clear eligibility information", satisfied_flag: false, leg_class: "test" }], steps_json: [], evidence_json: [] } as unknown as RouteRow;
const button = (c: HTMLElement, text: string) => Array.from(c.querySelectorAll("button")).filter((b) => (b.textContent || "").trim() === text);

function mount(over: Partial<React.ComponentProps<typeof RoutesOrgPanel>> = {}) {
  return render(
    <MemoryRouter>
      <RoutesOrgPanel routes={[ROUTE, LEG]} loading={false} activeCompany={COMPANY} needs={[]} {...over} />
    </MemoryRouter>,
  );
}

beforeEach(() => { caps.scan = true; decision.selectedRouteId = null; decision.chooseRoute.mockClear(); decision.clearRoute.mockClear(); drift.checkSurfaceGated.mockClear(); invoke.mockClear(); proposals.handleGenerateRouteProposal.mockClear(); });

describe("RoutesOrgPanel after the Routes Tier 1 lift (hierarchy layout)", () => {
  it("Choose this path → calls chooseRoute(route); with a chosen id the marker reads CHOSEN PATH and the control reads Deselect → clearRoute", async () => {
    const { container, unmount } = mount();
    const [choose] = button(container, "Choose this path →");
    expect(choose).toBeTruthy();
    fireEvent.click(choose);
    await waitFor(() => expect(decision.chooseRoute).toHaveBeenCalledWith(expect.objectContaining({ id: "route-1" })));
    unmount();
    decision.selectedRouteId = "route-1";
    const { container: c2 } = mount();
    expect(c2.textContent).toContain("CHOSEN PATH");
    const [deselect] = button(c2, "Deselect");
    fireEvent.click(deselect);
    await waitFor(() => expect(decision.clearRoute).toHaveBeenCalledTimes(1));
    expect(decision.chooseRoute).toHaveBeenCalledTimes(1); // the second mount did not choose again
  });

  it("Check for drift on the route and on the leg → checkSurfaceGated('route', id) through the gated wrapper", () => {
    const { container } = mount();
    const checks = button(container, "Check for drift");
    expect(checks.length).toBe(2);
    checks.forEach((b) => fireEvent.click(b));
    expect(drift.gate?.canScan).toBe(true);
    expect(drift.checkSurfaceGated.mock.calls.map((c) => c[1]).sort()).toEqual(["leg-1", "route-1"]);
    expect(drift.checkSurfaceGated.mock.calls.every((c) => c[0] === "route")).toBe(true);
  });

  it("ruling 1: governance.drift.scan false ⇒ the wrapper is gated off — zero checks reach the invoke", () => {
    caps.scan = false;
    const { container } = mount();
    button(container, "Check for drift").forEach((b) => fireEvent.click(b));
    expect(drift.gate?.canScan).toBe(false);
    expect(drift.checkSurfaceGated).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
  });

  it("ruling 4: the per-leg Generate test invokes generate-leg-tests with leg_ids:[legId]", async () => {
    const { container } = mount();
    let gen: HTMLButtonElement[] = [];
    await waitFor(() => { gen = button(container, "Generate test"); expect(gen.length).toBe(1); });
    fireEvent.click(gen[0]);
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("generate-leg-tests", { body: { company_id: "c1", write: true, leg_ids: ["leg-1"] } }));
  });
});
