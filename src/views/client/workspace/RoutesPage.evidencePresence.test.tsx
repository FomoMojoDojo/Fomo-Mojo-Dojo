// Evidence presence — workspace Routes (2026-09-16), component level. On a persisted "none" record the
// score band (Now / Reachable / Ceiling) is not rendered and the signed note sits in its place;
// "present" and null (unknown) render the band exactly as before.
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import RoutesPage from "./RoutesPage";
import { WORKSPACE_STRINGS } from "./workspaceNav";
import { NOT_ENOUGH_SIGNAL_NOTE } from "@/views/client/firstReadPreview/signedNotes";

const presence = vi.hoisted(() => ({ value: null as "none" | "present" | null }));
vi.mock("@/hooks/useEvidencePresence", () => ({ useEvidencePresence: () => presence.value }));
vi.mock("@/integrations/supabase/client", () => {
  const empty = { data: null, error: null };
  const builder: Record<string, unknown> = {};
  const handler: ProxyHandler<Record<string, unknown>> = { get: (_t, prop) => (prop === "then" ? (resolve: (v: unknown) => void) => resolve(empty) : () => new Proxy(builder, handler)) };
  return { supabase: { from: () => new Proxy(builder, handler), functions: { invoke: async () => empty }, rpc: async () => empty } };
});
vi.mock("@/hooks/useCompany", () => ({ useCompany: () => ({ activeCompany: { id: "c1", name: "Mithun", selected_route_id: null }, refetch: async () => {} }) }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ isAdmin: false }) }));
vi.mock("@/hooks/useCapability", () => ({ useCapability: () => false }));
vi.mock("@/hooks/useRoutes", () => ({ useRoutes: () => ({ items: [], loading: false }) }));
vi.mock("@/hooks/useOdiNeeds", () => ({ useOdiNeeds: () => ({ needs: [] }) }));
vi.mock("@/lib/claims/useCompanyClaims", () => ({ useCompanyClaims: () => ({ claims: new Map() }) }));
vi.mock("@/hooks/useRouteDecision", () => ({ useRouteDecision: () => ({ chooseRoute: async () => {}, clearRoute: async () => {} }) }));
vi.mock("@/hooks/useRouteProposalHandlers", () => ({ useRouteProposalHandlers: () => ({ handleGenerateRouteProposal: async () => {} }) }));
vi.mock("@/hooks/useDriftScan", () => ({ useDriftScan: () => ({ checkingSurfaceId: null, checkSurfaceGated: () => {} }) }));
vi.mock("@/components/drift/DriftBadge", () => ({ default: () => null }));
vi.mock("@/components/drift/DriftDetailPanel", () => ({ default: () => null }));
vi.mock("@/views/client/routes/components", () => ({ LegTestPanel: () => null }));

const mount = () => render(<MemoryRouter><RoutesPage /></MemoryRouter>);

describe("workspace Routes — evidence presence", () => {
  it("present / unknown: the score band renders (Now / Reachable / Ceiling), no note", () => {
    for (const v of ["present", null] as const) {
      presence.value = v;
      const { container, unmount } = mount();
      const strip = container.querySelector("[data-testid=routes-scorestrip]");
      expect(strip, `band missing for ${String(v)}`).not.toBeNull();
      for (const s of [WORKSPACE_STRINGS.scoreNow, WORKSPACE_STRINGS.scoreReachable, WORKSPACE_STRINGS.scoreCeiling]) expect(strip!.textContent).toContain(s);
      expect(container.querySelector("[data-testid=routes-no-evidence-note]")).toBeNull();
      expect(container.textContent).not.toContain(NOT_ENOUGH_SIGNAL_NOTE);
      unmount();
    }
  });
  it("none: no band, no Now / Reachable / Ceiling — the signed note", () => {
    presence.value = "none";
    const { container } = mount();
    expect(container.querySelector("[data-testid=routes-scorestrip]")).toBeNull();
    for (const s of [WORKSPACE_STRINGS.scoreNow, WORKSPACE_STRINGS.scoreReachable, WORKSPACE_STRINGS.scoreCeiling]) expect(container.textContent).not.toContain(s);
    expect(container.querySelector("[data-testid=routes-no-evidence-note]")?.textContent).toBe(NOT_ENOUGH_SIGNAL_NOTE);
  });
});
