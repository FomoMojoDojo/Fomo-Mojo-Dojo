// ADMIN GUARD — the non-admin bounce must TERMINATE (2026-09-09).
//
// The front-door gate repointed login from /admin/companies to /preview/client-refine. The route
// census predicted that would end the "Access Denied" dead end for free, because AdminGuard bounces
// non-/admin paths to "/". It does not: in INTERNAL mode "/" redirects to /preview/client-refine,
// which is behind this same guard, so the bounce is a loop. The rule is now mode-aware — bounce only
// where "/" actually renders something.
import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter, Route, Routes, Navigate } from "react-router-dom";
import { CLIENT_REFINE_PREVIEW_ROUTE } from "@/lib/clientRefinePreview";

let isAdmin = false;
let mode: "internal" | "client" = "internal";
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "u1" }, isAdmin, loading: false }),
}));
// This jsdom run has no localStorage, so the mode comes from the hook directly rather than from the
// provider reading storage. The guard only ever reads `mode`.
vi.mock("@/hooks/usePresentationMode", () => ({
  usePresentationMode: () => ({ mode, isClientView: mode === "client", isInternalView: mode === "internal" }),
}));

import AdminGuard from "./AdminGuard";

/** The real shape of the app: "/" redirects onward in internal mode, and the front door is guarded. */
function harness(initial: string, m: "internal" | "client") {
  mode = m;
  return render(
    <>
      <MemoryRouter initialEntries={[initial]}>
        <Routes>
          <Route
            path="/"
            element={m === "client" ? <p>client decision screen</p> : <Navigate to={CLIENT_REFINE_PREVIEW_ROUTE} replace />}
          />
          <Route path={CLIENT_REFINE_PREVIEW_ROUTE} element={<AdminGuard><p>front door</p></AdminGuard>} />
          <Route path="/admin/companies" element={<AdminGuard><p>admin companies</p></AdminGuard>} />
        </Routes>
      </MemoryRouter>
    </>,
  );
}

describe("a non-admin landing on the front door", () => {
  it("gets the refusal page, NOT a bounce that comes straight back (internal mode)", () => {
    isAdmin = false;
    const { container } = harness(CLIENT_REFINE_PREVIEW_ROUTE, "internal");
    expect(container.textContent).toContain("Access Denied");
    expect(container.textContent).not.toContain("front door");
  });

  it("in CLIENT mode the bounce is safe, so it still bounces to the client screen", () => {
    isAdmin = false;
    const { container } = harness(CLIENT_REFINE_PREVIEW_ROUTE, "client");
    expect(container.textContent).toContain("client decision screen");
    expect(container.textContent).not.toContain("Access Denied");
  });

  it("/admin is unchanged — it never bounced and still refuses in place", () => {
    isAdmin = false;
    const { container } = harness("/admin/companies", "internal");
    expect(container.textContent).toContain("Access Denied");
  });
});

describe("an admin", () => {
  it("reaches the front door in internal mode", () => {
    isAdmin = true;
    const { container } = harness(CLIENT_REFINE_PREVIEW_ROUTE, "internal");
    expect(container.textContent).toContain("front door");
  });
});
