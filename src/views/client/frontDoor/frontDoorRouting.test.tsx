// FRONT DOOR ROUTING (2026-09-09) — where login lands, and where "Home" goes now.
//
// The bare path /preview/client-refine is the front door; the former landing (the MojoMap home)
// moved to /preview/client-refine/home. Two of these are render proofs (login, the sidebar link
// set); the rest are SOURCE assertions over App.tsx and the seven repointed call sites, because
// mounting those seven views would mount the whole workshop. The browser captures are the render
// proof for the routes themselves.
import { describe, expect, it, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, fireEvent, waitFor } from "@testing-library/react";
import {
  CLIENT_REFINE_PREVIEW_ROUTE,
  CLIENT_REFINE_PREVIEW_HOME_ROUTE,
  isClientRefinePreviewPath,
} from "@/lib/clientRefinePreview";

const src = (p: string) => readFileSync(resolve(__dirname, "../../..", p), "utf8");

const navigateSpy = vi.fn();
vi.mock("react-router-dom", async (orig) => ({
  ...(await orig<typeof import("react-router-dom")>()),
  useNavigate: () => navigateSpy,
}));

const signIn = vi.fn(async () => ({ error: null as Error | null }));
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ signIn, signUp: vi.fn(), resetPassword: vi.fn() }),
}));

import Login from "@/pages/Login";

beforeEach(() => { navigateSpy.mockClear(); signIn.mockClear(); });

describe("login lands on the front door", () => {
  it("a successful sign-in navigates to /preview/client-refine", async () => {
    const { container } = render(<Login />);
    fireEvent.change(container.querySelector('input[type="email"]')!, { target: { value: "a@b.co" } });
    fireEvent.change(container.querySelector('input[type="password"]')!, { target: { value: "pw" } });
    fireEvent.submit(container.querySelector("form")!);
    await waitFor(() => expect(navigateSpy).toHaveBeenCalledWith(CLIENT_REFINE_PREVIEW_ROUTE));
    expect(navigateSpy).not.toHaveBeenCalledWith("/admin/companies");
  });

  it("a failed sign-in navigates nowhere", async () => {
    signIn.mockResolvedValueOnce({ error: new Error("bad password") });
    const { container } = render(<Login />);
    fireEvent.change(container.querySelector('input[type="email"]')!, { target: { value: "a@b.co" } });
    fireEvent.change(container.querySelector('input[type="password"]')!, { target: { value: "pw" } });
    fireEvent.submit(container.querySelector("form")!);
    await waitFor(() => expect(signIn).toHaveBeenCalled());
    expect(navigateSpy).not.toHaveBeenCalled();
  });
});

describe("the two routes", () => {
  const app = src("App.tsx");

  it("the bare path mounts the front door and /home mounts the former landing", () => {
    expect(app).toContain("<Route path={CLIENT_REFINE_PREVIEW_ROUTE} element={<FrontDoorRoute />} />");
    expect(app).toContain("<Route path={CLIENT_REFINE_PREVIEW_HOME_ROUTE} element={<ClientRefinePreviewRoute />} />");
    // FrontDoorRoute renders FrontDoorView; ClientRefinePreviewRoute still renders the old landing
    expect(app).toMatch(/function FrontDoorRoute\(\)[\s\S]*?<FrontDoorView \/>/);
    expect(app).toMatch(/function ClientRefinePreviewRoute\(\)[\s\S]*?<ClientRefinePreviewView \/>/);
  });

  it("both keep the existing double gate", () => {
    for (const fn of ["FrontDoorRoute", "ClientRefinePreviewRoute"]) {
      const body = app.slice(app.indexOf(`function ${fn}()`));
      const upTo = body.slice(0, body.indexOf("\n}"));
      expect(upTo).toContain("<AdminModeRoute>");
      expect(upTo).toContain("<InternalViewOnlyRoute>");
    }
  });

  it("the paths are distinct and both count as client-refine surfaces", () => {
    expect(CLIENT_REFINE_PREVIEW_ROUTE).toBe("/preview/client-refine");
    expect(CLIENT_REFINE_PREVIEW_HOME_ROUTE).toBe("/preview/client-refine/home");
    expect(isClientRefinePreviewPath(CLIENT_REFINE_PREVIEW_ROUTE)).toBe(true);
    expect(isClientRefinePreviewPath(CLIENT_REFINE_PREVIEW_HOME_ROUTE)).toBe(true);
  });
});

describe("the seven 'home' links resolve to /home, not to the front door", () => {
  // file → the call site the census named
  const SITES: Array<[string, string]> = [
    ["components/layout/TopNav.tsx", "navigate(CLIENT_REFINE_PREVIEW_HOME_ROUTE)"],
    ["views/client/DriftInboxView.tsx", "onHome={() => navigate(CLIENT_REFINE_PREVIEW_HOME_ROUTE)}"],
    ["views/client/ClientRefinePreviewMembersView.tsx", "onHome={() => navigate(CLIENT_REFINE_PREVIEW_HOME_ROUTE)}"],
    ["views/client/ClientRefinePreviewExtractsView.tsx", "onHome={() => navigate(CLIENT_REFINE_PREVIEW_HOME_ROUTE)}"],
    ["views/client/ClientRefinePreviewCompanyView.tsx", "onHome={() => navigate(CLIENT_REFINE_PREVIEW_HOME_ROUTE)}"],
    ["views/client/ClientRefinePreviewWorkshopView.tsx", "navigate(CLIENT_REFINE_PREVIEW_HOME_ROUTE)"],
    ["views/client/ClientRefinePreviewRoutesView.tsx", "navigate(CLIENT_REFINE_PREVIEW_HOME_ROUTE)"],
  ];

  it.each(SITES)("%s points Home at /home", (file, needle) => {
    expect(src(file)).toContain(needle);
  });

  it("none of the seven still sends Home to the bare path", () => {
    for (const [file] of SITES) {
      expect(src(file)).not.toMatch(/onHome=\{\(\) => navigate\(CLIENT_REFINE_PREVIEW_ROUTE\)\}/);
      expect(src(file)).not.toMatch(/goToRefineHome = useCallback\(\(\) => navigate\(CLIENT_REFINE_PREVIEW_ROUTE\)/);
    }
  });
});

describe("every WorkshopSidebar mount passes the full link set", () => {
  // Routes and Path stay single-entry by ruling, so no mount gains a link TO them.
  const MOUNTS = [
    "views/client/ClientRefinePreviewView.tsx",
    "views/client/ClientRefinePreviewRoutesView.tsx",
    "views/client/ClientRefinePreviewWorkshopView.tsx",
    "views/client/ClientRefinePreviewCompanyView.tsx",
    "views/client/ClientRefinePreviewMembersView.tsx",
    "views/client/ClientRefinePreviewExtractsView.tsx",
    "views/client/DriftInboxView.tsx",
  ];

  it.each(MOUNTS)("%s passes onCompany, onMembers, onExtracts and onInbox", (file) => {
    const s = src(file);
    const at = s.indexOf("<WorkshopSidebar");
    expect(at).toBeGreaterThan(-1);
    const mount = s.slice(at, s.indexOf("/>", at));
    for (const prop of ["onTabClick", "onHome", "onCompany", "onMembers", "onExtracts", "onInbox"]) {
      expect(`${file}:${prop}:${mount.includes(prop)}`).toBe(`${file}:${prop}:true`);
    }
  });

  it("the Path view is not a sidebar page, so it carries the front-door link on its own top bar", () => {
    const s = src("views/client/ClientRefinePreviewPathView.tsx");
    expect(s).not.toContain("<WorkshopSidebar");
    expect(s).toContain("data-all-companies");
    expect(s).toContain("navigate(CLIENT_REFINE_PREVIEW_ROUTE)");
  });
});

describe("the legacy door's return leg", () => {
  it("both old 'Back to Map' links now read 'All companies' and target the front door explicitly", () => {
    const s = src("pages/AdminCompanies.tsx");
    expect(s).not.toContain("Back to Map");
    expect(s).toContain('onClick={() => navigate(CLIENT_REFINE_PREVIEW_ROUTE)}');
    expect(s).toContain("to={CLIENT_REFINE_PREVIEW_ROUTE}");
    expect(s).toContain('data-testid="admin-all-companies-top"');
    expect(s).toContain('data-testid="admin-all-companies-foot"');
  });
});
