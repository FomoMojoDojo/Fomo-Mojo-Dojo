// COMPANY-VIEW NAVIGATION (N1–N4, 2026-09-26).
//
// Before this, /preview/client-refine/company named no company: it showed whichever one the browser
// last selected, so a bookmark or a pasted link opened someone else's company, and neither "All
// companies" mount linked to it at all. These are the guards for the four rulings that fix it.
//
// The route RULES are tested through their pure helpers (bareCompanyRedirect,
// routeCompanyToActivate) plus a source assertion that App.tsx and the First Read actually call
// them — the repo's existing idiom for behaviour that would otherwise need the whole app mounted
// (see frontDoorRouting.test.tsx). The Company VIEW is rendered for real.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  CLIENT_REFINE_PREVIEW_ROUTE,
  CLIENT_REFINE_PREVIEW_COMPANY_ROUTE,
  CLIENT_REFINE_PREVIEW_COMPANY_ID_ROUTE,
  bareCompanyRedirect,
  clientRefineCompanyPath,
  isClientRefinePreviewPath,
  routeCompanyToActivate,
} from "@/lib/clientRefinePreview";
import { pickDefaultCompanyId } from "@/hooks/useCompany";
import type { Company } from "@/hooks/useCompany";

const src = (p: string) => readFileSync(resolve(__dirname, "../../..", p), "utf8");

const EDGEWOOD = "3dd2cfbb-0792-4bf1-9cd4-15db9646874b";
const CB2 = "fd3f7f63-968b-4698-b946-3d6b6450d79d";
const UNKNOWN = "00000000-0000-0000-0000-0000000000ff";

// ── N1: the address names the company ────────────────────────────────────────────────────────────
describe("N1 — the Company route carries the company id", () => {
  it("builds /company/<id>, and the bare path when there is no id", () => {
    expect(clientRefineCompanyPath(EDGEWOOD)).toBe(`/preview/client-refine/company/${EDGEWOOD}`);
    expect(clientRefineCompanyPath(null)).toBe(CLIENT_REFINE_PREVIEW_COMPANY_ROUTE);
    expect(CLIENT_REFINE_PREVIEW_COMPANY_ID_ROUTE).toBe("/preview/client-refine/company/:companyId");
  });

  it("a company-scoped Company path is still a client-refine surface", () => {
    // isClientRefinePreviewPath drives the boot class sync; a path it does not recognise renders
    // the legacy cream body for a frame.
    expect(isClientRefinePreviewPath(clientRefineCompanyPath(EDGEWOOD))).toBe(true);
    expect(isClientRefinePreviewPath(CLIENT_REFINE_PREVIEW_COMPANY_ROUTE)).toBe(true);
  });

  it("App.tsx mounts the parameterised route on the view and the bare route on the redirect", () => {
    const app = src("src/App.tsx");
    expect(app).toContain(
      "<Route path={CLIENT_REFINE_PREVIEW_COMPANY_ID_ROUTE} element={<ClientRefinePreviewCompanyRoute />} />",
    );
    expect(app).toContain(
      "<Route path={CLIENT_REFINE_PREVIEW_COMPANY_ROUTE} element={<ClientRefinePreviewCompanyBareRoute />} />",
    );
    // the redirect is behind the same double gate as the view it replaces
    const bare = app.slice(app.indexOf("function ClientRefinePreviewCompanyBareRoute"));
    expect(bare.slice(0, 260)).toContain("AdminModeRoute");
    expect(bare.slice(0, 260)).toContain("InternalViewOnlyRoute");
    // and it asks the helper, rather than deciding inline where the rule cannot be tested
    expect(app).toContain("bareCompanyRedirect({ loading, activeCompanyId: activeCompany?.id, search: location.search })");
  });
});

describe("N1 — the bare route redirects", () => {
  it("to the active company, keeping the query string", () => {
    expect(bareCompanyRedirect({ loading: false, activeCompanyId: EDGEWOOD, search: "" }))
      .toBe(`/preview/client-refine/company/${EDGEWOOD}`);
    // the Workshop's phase banner arrives as ?advance=diagnose and the far side reads it
    expect(bareCompanyRedirect({ loading: false, activeCompanyId: EDGEWOOD, search: "?advance=diagnose" }))
      .toBe(`/preview/client-refine/company/${EDGEWOOD}?advance=diagnose`);
  });

  it("to the FRONT DOOR when no company is active — never a guessed company", () => {
    expect(bareCompanyRedirect({ loading: false, activeCompanyId: null, search: "" }))
      .toBe(CLIENT_REFINE_PREVIEW_ROUTE);
    expect(bareCompanyRedirect({ loading: false, activeCompanyId: undefined, search: "?advance=diagnose" }))
      .toBe(CLIENT_REFINE_PREVIEW_ROUTE);
  });

  it("nowhere at all while the company list is still loading", () => {
    // activeCompany is null during the first fetch; redirecting then would send every arrival to
    // the front door on a race.
    expect(bareCompanyRedirect({ loading: true, activeCompanyId: null, search: "" })).toBeNull();
    expect(bareCompanyRedirect({ loading: true, activeCompanyId: EDGEWOOD, search: "" })).toBeNull();
  });
});

// ── N3: a company-parameterised route points the provider at its own company ─────────────────────
describe("N3 — the route's company becomes the active one", () => {
  const known = [EDGEWOOD, CB2];

  it("returns the route's id when the provider holds a different company", () => {
    expect(routeCompanyToActivate({ routeCompanyId: EDGEWOOD, activeCompanyId: CB2, knownCompanyIds: known }))
      .toBe(EDGEWOOD);
    expect(routeCompanyToActivate({ routeCompanyId: EDGEWOOD, activeCompanyId: null, knownCompanyIds: known }))
      .toBe(EDGEWOOD);
  });

  it("writes nothing when the provider already holds it — the effect cannot loop", () => {
    expect(routeCompanyToActivate({ routeCompanyId: EDGEWOOD, activeCompanyId: EDGEWOOD, knownCompanyIds: known }))
      .toBeNull();
  });

  it("writes nothing for an id the operator does not hold", () => {
    // An unknown id written here is persisted to localStorage and follows the operator onto every
    // other surface, long after the bad link that produced it.
    expect(routeCompanyToActivate({ routeCompanyId: UNKNOWN, activeCompanyId: CB2, knownCompanyIds: known }))
      .toBeNull();
    expect(routeCompanyToActivate({ routeCompanyId: undefined, activeCompanyId: CB2, knownCompanyIds: known }))
      .toBeNull();
  });

  it("the preview First Read calls it on load and adds no operator node", () => {
    const view = src("src/views/client/firstReadPreview/FirstReadPreviewView.tsx");
    expect(view).toContain("routeCompanyToActivate({");
    expect(view).toContain("if (next) setActiveCompanyId(next);");
    // N3 is invisible: the write sits in an effect, and the block that performs it renders nothing.
    const block = view.slice(view.indexOf("const next = routeCompanyToActivate"), view.indexOf("if (next) setActiveCompanyId(next);"));
    expect(block).not.toContain("data-fr-operator");
    expect(block).not.toContain("OPERATOR_MARK");
    expect(block).not.toContain("<");
  });
});

// ── N4: the default skips frozen companies ───────────────────────────────────────────────────────
describe("N4 — the default company is never a frozen one", () => {
  const co = (id: string, name: string, frozen: boolean): Company =>
    ({ id, name, frozen, website: null, created_by: "t", created_at: "2026-01-01",
       mojo_score: null, potential_score: null, projected_score: null,
       evidence_status: null, evidence_note: null, last_scored_at: null,
       area_scores_json: null, engagement_phase: "outside_signals" } as Company);

  it("skips the name-preferred company when it is frozen, and takes the next unfrozen row", () => {
    // The live shape: CB1 is named "Cafe Barra" AND is frozen AND sorts first.
    const list = [co("cb1", "Cafe Barra", true), co("edge", "Edgewood", false), co("cb2", "Cafe Barra 2", false)];
    expect(pickDefaultCompanyId(list)).toBe("edge");
  });

  it("still prefers the name when THAT company is not frozen", () => {
    const list = [co("frozen-other", "Zed", true), co("cb", "Cafe Barra", false), co("edge", "Edgewood", false)];
    expect(pickDefaultCompanyId(list)).toBe("cb");
  });

  it("keeps today's answer when every company is frozen", () => {
    // A fleet with nothing writable still has to resolve to something.
    const all = [co("edge", "Edgewood", true), co("cb1", "Cafe Barra", true)];
    expect(pickDefaultCompanyId(all)).toBe("cb1"); // the preferred name, as before
    expect(pickDefaultCompanyId([co("a", "Alpha", true), co("b", "Beta", true)])).toBe("a"); // else the first
  });

  it("an empty fleet still resolves to nothing", () => {
    expect(pickDefaultCompanyId([])).toBeNull();
  });
});

// ── N5: no cross-tab syncing was introduced ──────────────────────────────────────────────────────
describe("N5 — no cross-tab sync", () => {
  it("the provider listens for no storage event and opens no BroadcastChannel", () => {
    const hook = src("src/hooks/useCompany.tsx");
    expect(hook).not.toContain("BroadcastChannel");
    expect(hook).not.toMatch(/addEventListener\(\s*["']storage["']/);
  });
});

// ── N1: the Company view itself, rendered ────────────────────────────────────────────────────────
const routeParams: { value: Record<string, string | undefined> } = { value: {} };
const setActiveCompanyId = vi.fn();
const companiesRef: { value: Record<string, unknown>[] } = { value: [] };
const activeRef: { value: Record<string, unknown> | null } = { value: null };
const stateRef: { loading: boolean; fetchError: string | null } = { loading: false, fetchError: null };

vi.mock("react-router-dom", () => ({
  useNavigate: () => () => {},
  useParams: () => routeParams.value,
}));
function chainable(): Record<string, unknown> {
  const target: Record<string, unknown> = {};
  const proxy: Record<string, unknown> = new Proxy(target, {
    get(_t, prop) {
      if (prop === "then") return (r: (v: unknown) => void) => r({ data: null, error: null });
      if (prop === "maybeSingle" || prop === "single") return async () => ({ data: null, error: null });
      return () => proxy;
    },
  });
  return proxy;
}
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => chainable(), functions: { invoke: async () => ({ data: null, error: null }) } },
}));
vi.mock("@/hooks/useCompany", async (orig) => ({
  ...(await orig<typeof import("@/hooks/useCompany")>()),
  useCompany: () => ({
    activeCompany: activeRef.value,
    companies: companiesRef.value,
    loading: stateRef.loading,
    fetchError: stateRef.fetchError,
    setActiveCompanyId,
    refetch: async () => {},
  }),
  useCompanyIfAvailable: () => ({ refetch: async () => {} }),
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "u-1" }, isAdmin: true }) }));
vi.mock("@/hooks/usePositioningCanvas", () => ({ usePositioningCanvas: () => ({ item: null, loading: false }) }));
vi.mock("@/hooks/useStrategyCascade", () => ({ useStrategyCascade: () => ({ item: null, loading: false }) }));
vi.mock("@/hooks/useRoutes", () => ({ useRoutes: () => ({ items: [], loading: false, error: null, lensRouteState: {} }) }));
vi.mock("@/hooks/useSignalLandscape", () => ({ useSignalLandscape: () => ({ landscape: null, loading: false }) }));
vi.mock("@/hooks/useDirectionEvidence", () => ({ useDirectionEvidence: () => null }));
vi.mock("@/hooks/useFoundationStatus", () => ({ useFoundationStatus: () => null }));
vi.mock("@/components/client/WorkshopSidebar", () => ({ WorkshopSidebar: () => null }));
vi.mock("sonner", () => ({ toast: Object.assign(() => {}, { loading: () => {}, success: () => {}, error: () => {}, message: () => {} }) }));

import ClientRefinePreviewCompanyView from "./ClientRefinePreviewCompanyView";

const company = (id: string, name: string) => ({
  id, name, website: `https://${name.toLowerCase().replace(/\s+/g, "")}.com`,
  engagement_phase: "diagnose", engagement_phase_set: true,
  excluded_signals_json: [], public_source_filters_json: null, frozen: false,
});

beforeEach(() => {
  setActiveCompanyId.mockClear();
  routeParams.value = {};
  companiesRef.value = [company(EDGEWOOD, "Edgewood"), company(CB2, "Cafe Barra 2")];
  activeRef.value = companiesRef.value[1]; // the PREVIOUSLY selected company
  stateRef.loading = false;
  stateRef.fetchError = null;
});

describe("N1 — the Company page opened by URL", () => {
  it("shows the URL's company, not the previously active one, and writes the provider", () => {
    routeParams.value = { companyId: EDGEWOOD };
    const { container } = render(<ClientRefinePreviewCompanyView />);
    // the page it renders is the one the address names, from the FIRST render
    expect(container.textContent).toContain("Edgewood");
    expect(container.textContent).not.toContain("Cafe Barra 2");
    // ...and the session follows it, so the sidebar links out of here stay on this company
    expect(setActiveCompanyId).toHaveBeenCalledWith(EDGEWOOD);
  });

  it("writes nothing when the URL already names the active company", () => {
    routeParams.value = { companyId: CB2 };
    render(<ClientRefinePreviewCompanyView />);
    expect(setActiveCompanyId).not.toHaveBeenCalled();
  });

  it("an id the operator does not hold renders the estate's existing not-found answer, and writes nothing", () => {
    routeParams.value = { companyId: UNKNOWN };
    const { container, getByTestId } = render(<ClientRefinePreviewCompanyView />);
    expect(getByTestId("company-not-found")).toBeTruthy();
    // byte-exact reuse of AdminCompanyDetail.tsx:73,76 — no new string was minted
    expect(container.textContent).toContain("Company not found");
    expect(container.textContent).toContain("This company may have been deleted or the link is no longer valid.");
    expect(setActiveCompanyId).not.toHaveBeenCalled();
  });

  it("does NOT claim 'not found' while the company list is loading, or when it failed to load", () => {
    // "not found" would be a guess in both states.
    routeParams.value = { companyId: UNKNOWN };
    stateRef.loading = true;
    const a = render(<ClientRefinePreviewCompanyView />);
    expect(a.container.querySelector('[data-testid="company-not-found"]')).toBeNull();
    a.unmount();

    stateRef.loading = false;
    stateRef.fetchError = "companies fetch failed";
    const b = render(<ClientRefinePreviewCompanyView />);
    expect(b.container.querySelector('[data-testid="company-not-found"]')).toBeNull();
  });
});
