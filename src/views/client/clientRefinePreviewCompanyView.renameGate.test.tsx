// Edit-company-name relocation (operator ruling 2026-08-18) — the rename
// control mounts on the Company page (/preview/client-refine/company), the
// identity surface. Admin gating is route-level (AdminModeRoute wraps the
// route in App.tsx); this test asserts the mount itself: with an active
// company the control renders beside the identity header, and without an
// active company it does not render at all.

import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import ClientRefinePreviewCompanyView from "./ClientRefinePreviewCompanyView";
import { RENAME_LABEL } from "./workshop/CompanyRenameControl";

const activeCompanyRef: { value: Record<string, unknown> | null } = {
  value: {
    id: "e55ac325-2897-4d06-9fbd-d9ddd776be3b",
    name: "Acme",
    website: "https://acme.com",
    engagement_phase: null,
    engagement_phase_set: false,
    excluded_signals_json: [],
    public_source_filters_json: null,
  },
};

// N1 (2026-09-26): the view is mounted at /company/:companyId and reads the param. This mount
// exercises the NO-PARAM path, which is what it has always exercised — the page then falls back
// to the provider, exactly as before N1. The assertions below are untouched.
vi.mock("react-router-dom", () => ({ useNavigate: () => () => {}, useParams: () => ({}) }));
// Universal chainable query builder: every method returns the builder, and the
// builder is awaitable (thenable) resolving to an empty result — so any
// .select().eq().eq().order().limit().maybeSingle() chain works.
function chainable(): Record<string, unknown> {
  const target: Record<string, unknown> = {};
  const proxy: Record<string, unknown> = new Proxy(target, {
    get(_t, prop) {
      if (prop === "then") {
        return (resolve: (v: unknown) => void) => resolve({ data: null, error: null });
      }
      if (prop === "maybeSingle" || prop === "single") {
        return async () => ({ data: null, error: null });
      }
      return () => proxy;
    },
  });
  return proxy;
}
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => chainable(),
    functions: { invoke: async () => ({ data: null, error: null }) },
  },
}));
vi.mock("@/hooks/useCompany", () => ({
  // N1: the view now also reads companies/loading/fetchError (to tell "unknown id" from "not
  // loaded yet") and setActiveCompanyId. With no route param none of them is consulted for the
  // render under test; they are supplied so the destructure does not throw.
  useCompany: () => ({
    activeCompany: activeCompanyRef.value,
    companies: activeCompanyRef.value ? [activeCompanyRef.value] : [],
    loading: false,
    fetchError: null,
    setActiveCompanyId: () => {},
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

describe("Company page — rename control mount (relocated per operator ruling)", () => {
  it("renders the rename control beside the identity header for the active company", () => {
    activeCompanyRef.value = { ...activeCompanyRef.value! };
    const { container } = render(<ClientRefinePreviewCompanyView />);
    expect(container.querySelector(`[aria-label="${RENAME_LABEL}"]`)).toBeTruthy();
    expect(container.textContent).toContain("Acme");
  });

  it("does not render the control when no company is active", () => {
    activeCompanyRef.value = null;
    const { container } = render(<ClientRefinePreviewCompanyView />);
    expect(container.querySelector(`[aria-label="${RENAME_LABEL}"]`)).toBeNull();
  });
});
