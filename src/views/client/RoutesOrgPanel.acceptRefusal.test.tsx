// Proposal-accept refusal is SURFACED (display honesty, 2026-09-12). handleAcceptRouteProposal used to
// swallow a refused routes write as a silent no-op; a proposed condition array now goes through the
// sanctioned writer (replace_route_conditions), and a refusal — the writer protecting a stamped
// (checked) condition — renders as toast.error with the exception text on the surfaces that host the
// panel (/routes and the workshop Routes tab, both RoutesOrgPanel). The legacy columns are the layout
// that carries RouteProposalSection, so this mounts a non-hierarchy route with a pending proposal.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { RoutesOrgPanel } from "./ClientRefinePreviewRoutesView";
import type { RouteRow } from "@/hooks/useRoutes";
import type { Company } from "@/hooks/useCompany";
import type { RouteProposalRow } from "@/hooks/useRouteProposals";

vi.mock("@/hooks/useCapability", () => ({ useCapability: () => true }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "u1" }, isAdmin: true }) }));
vi.mock("@/lib/frozenCompanies", () => ({ isFrozenCompany: () => false, FROZEN_COMPANY_IDS: new Set() }));
vi.mock("@/hooks/useRouteDecision", () => ({ useRouteDecision: () => ({ selectedRouteId: null, savedAt: null, chooseRoute: async () => {}, clearRoute: async () => {} }) }));
const PROPOSAL: RouteProposalRow = {
  id: "prop-1", surface_id: "route-1", company_id: "c1", status: "pending", reason: "Evidence moved.", created_at: "2026-09-01T00:00:00Z",
  current_state: { what_would_have_to_be_true: [{ condition: "Families value clear eligibility information", satisfied_flag: false, checked_at: "2026-09-12T10:00:00Z" }] },
  proposed_state: { what_would_have_to_be_true: [{ condition: "Families want a funding concierge", satisfied_flag: false }] },
} as unknown as RouteProposalRow;
vi.mock("@/hooks/useRouteProposalHandlers", () => ({
  useRouteProposalHandlers: () => ({ canGenRoute: true, routeProposalsMap: new Map([["route-1", PROPOSAL]]), generateLoadingRouteId: null, handleGenerateRouteProposal: async () => {}, bumpProposals: () => {} }),
}));
vi.mock("@/hooks/useDriftScan", () => ({ useDriftScan: () => ({ scanningAll: false, checkingSurfaceId: null, scanAllSurfaces: () => {}, checkSurface: () => {}, scanAllGated: () => {}, checkSurfaceGated: () => {} }) }));
vi.mock("@/hooks/useDriftAssessment", () => ({ useDriftAssessment: () => ({ assessment: null, isLoading: false, error: null, markSeen: async () => {}, acceptAsAligned: async () => {}, setAssessment: () => {} }) }));
vi.mock("@/hooks/useIntegrityRecord", () => ({ useIntegrityRecord: () => ({ record: null, loading: false, error: null }) }));
vi.mock("@/hooks/useStrategicHypotheses", () => ({ useStrategicHypotheses: () => ({ data: [] }), useRouteHypothesisDependencies: () => ({ data: [] }) }));
vi.mock("@/hooks/useSignalLandscape", () => ({ useSignalLandscape: () => ({ landscape: null }) }));
vi.mock("@/lib/desiredOutcomes", () => ({ useDesiredOutcomes: () => ({ primary: null }) }));
vi.mock("@/lib/claims/useCompanyClaims", () => ({ useCompanyClaims: () => ({ claims: new Map(), loading: false }) }));
vi.mock("@/hooks/useRouteProposals", () => ({ useRouteProposals: () => ({ proposals: new Map(), loading: false }) }));
vi.mock("@/hooks/useDriftInbox", () => ({ useDriftInboxCount: () => ({ totalUnresolved: 0, newCount: 0 }) }));
vi.mock("@/hooks/useSurfaceEducation", () => ({ useSurfaceEducation: () => ({ rows: [], loading: false }) }));
vi.mock("@/lib/baselineCapture", () => ({ captureBaseline: vi.fn(async () => {}) }));
const rpc = vi.hoisted(() => vi.fn(async (_fn: string, _args: unknown) => ({ data: null, error: { message: "replace_route_conditions refused: would drop 1 checked condition(s) [Families value clear eligibility information] — a recorded check is preserved-class (checked_at set); carry the element verbatim or declare the drop (check-outcome preservation law)" } })));
const calls = vi.hoisted(() => [] as Array<{ table: string; op: string; args: unknown[] }>);
vi.mock("@/integrations/supabase/client", () => {
  const make = (table: string) => {
    const b: Record<string, unknown> = {};
    for (const op of ["select", "eq", "update", "order", "limit", "in"]) b[op] = (...args: unknown[]) => { calls.push({ table, op, args }); return b; };
    b.maybeSingle = async () => ({ data: null, error: null });
    b.then = (resolve: (v: unknown) => void) => resolve({ data: null, error: null });
    return b;
  };
  return { supabase: { from: (t: string) => make(t), rpc, functions: { invoke: vi.fn(async () => ({ data: {}, error: null })) } } };
});
const toasts = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), loading: vi.fn() }));
vi.mock("sonner", () => ({ toast: toasts }));

const COMPANY = { id: "c1", name: "Edgewood", engagement_phase: "diagnose", selected_route_id: null, excluded_signals_json: [] } as unknown as Company;
const LEGACY_ROUTE: RouteRow = { id: "route-1", company_id: "c1", title: "Clarify eligibility criteria", short_description: "x", category: "fix", level: null, parent_id: null, relevance_state: "active", what_would_have_to_be_true: [{ condition: "Families value clear eligibility information", satisfied_flag: false, checked_at: "2026-09-12T10:00:00Z" }], steps_json: [], evidence_json: [], why_this_matters_json: [] } as unknown as RouteRow;
const button = (c: HTMLElement, re: RegExp) => Array.from(c.querySelectorAll("button")).find((b) => re.test((b.textContent || "").trim()));
/** The legacy card body (with the proposal section) renders only when the card is expanded. */
function mountExpanded() {
  const utils = render(<MemoryRouter><RoutesOrgPanel routes={[LEGACY_ROUTE]} loading={false} activeCompany={COMPANY} needs={[]} /></MemoryRouter>);
  const trigger = utils.container.querySelector(".crpv-r-card-trigger") as HTMLElement | null;
  if (!trigger) throw new Error("legacy card trigger not rendered");
  fireEvent.click(trigger);
  return utils;
}

beforeEach(() => { rpc.mockClear(); toasts.error.mockClear(); calls.length = 0; });

describe("handleAcceptRouteProposal — refused condition write is surfaced", () => {
  it("Apply → replace_route_conditions refuses → toast.error with the exception text; no routes UPDATE, no acceptance", async () => {
    const { container } = mountExpanded();
    const apply = button(container, /^Apply 1 of 1 change/);
    expect(apply).toBeTruthy();
    fireEvent.click(apply!);
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("replace_route_conditions", expect.objectContaining({ p_route_id: "route-1", p_actor: "proposal_accept:prop-1" })));
    await waitFor(() => expect(toasts.error).toHaveBeenCalledTimes(1));
    expect(String(toasts.error.mock.calls[0][0])).toMatch(/^Proposal not applied — replace_route_conditions refused: would drop 1 checked condition/);
    expect(calls.filter((c) => c.table === "routes" && c.op === "update")).toHaveLength(0);
    expect(calls.filter((c) => c.table === "surface_proposals" && c.op === "update")).toHaveLength(0);
  });
  it("Apply → the writer accepts → no error toast, the accept continues to the routes patch and the proposal update", async () => {
    rpc.mockResolvedValueOnce({ data: { written: 1 }, error: null } as never);
    const { container } = mountExpanded();
    fireEvent.click(button(container, /^Apply 1 of 1 change/)!);
    await waitFor(() => expect(calls.filter((c) => c.table === "surface_proposals" && c.op === "update")).toHaveLength(1));
    expect(toasts.error).not.toHaveBeenCalled();
    const routePatch = calls.find((c) => c.table === "routes" && c.op === "update")!.args[0] as Record<string, unknown>;
    expect(routePatch).toEqual({ source: "manual_prop-1" }); // the condition array went through the RPC, not the raw patch
  });
});
