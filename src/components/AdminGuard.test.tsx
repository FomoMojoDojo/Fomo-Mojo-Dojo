// ADMIN GUARD — the role refusal happens IN PLACE, in every mode (U6-69, 2026-11-11).
//
// HISTORY. This file was written on 2026-09-09 as "the non-admin bounce must TERMINATE": AdminGuard
// bounced non-/admin paths to "/", and in internal mode "/" redirects to /preview/client-refine,
// which is behind this same guard — a loop. The answer then was to make the bounce MODE-AWARE and
// bounce only where "/" renders something.
//
// WHY THAT IS SUPERSEDED. The landing build (U6 part 1) makes a non-admin ALWAYS client presentation,
// derived from isAdmin and not from storage. A mode-aware bounce therefore fires for every member on
// every gated route — so the role refusal became unreachable, and the distinction U6-56 signed (no
// session is a redirect; a session without an admin row is a refusal in words) collapsed into one
// answer. Measured 2026-11-11: with the bounce in place a signed-in non-admin on /legacy/routes
// ended at /start.
//
// Both of the bounce's premises are also now false. "/" no longer loops for a non-admin — it sends
// them to /start, which resolves a real destination — and "Access Denied" is no longer a dead end,
// because a member has somewhere of their own to be. So the bounce is gone and the refusal is in
// place, in both modes. Where a member IS sent home instead, it is the ROUTE's decision and not this
// guard's: "/" and the Front Door (U6-50), which zz-admin-gate (v1) asserts.
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

  it("in CLIENT mode it ALSO refuses in place — the mode does not change the answer (U6-69)", () => {
    isAdmin = false;
    const { container } = harness(CLIENT_REFINE_PREVIEW_ROUTE, "client");
    expect(container.textContent).toContain("Access Denied");
    // the bounce is what this asserts is gone: reaching "/" here would render the client screen
    expect(container.textContent).not.toContain("client decision screen");
    expect(container.textContent).not.toContain("front door");
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
