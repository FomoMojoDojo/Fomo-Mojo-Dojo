// FRONT DOOR (2026-09-09) — the post-login landing at /preview/client-refine.
//
// Proves, on DOM structure and on spies (each fails if its branch is removed):
//   (a) the table renders one row per inventory row, and rendering the page selects NOTHING —
//       neither setActiveCompanyId nor localStorage is touched (the census found the old landing's
//       auto-select made "no active company" unreachable; the front door must not inherit that);
//   (b) a row click sets the active company, THEN navigates to that company's First Read;
//   (c) a failed companies query renders the banner over an EMPTY table, selects nothing and writes
//       nothing — an empty read is not a selection;
//   (d) the legacy door is present and points at /admin/companies;
//   (e) the header carries the two signed strings and the count, and no action column is drawn.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { buildInventory, type CompanyInventoryRow } from "@/lib/admin/companiesInventory";

const navigateSpy = vi.fn();
vi.mock("react-router-dom", async (orig) => ({
  ...(await orig<typeof import("react-router-dom")>()),
  useNavigate: () => navigateSpy,
}));

const setActiveCompanyIdSpy = vi.fn();
vi.mock("@/hooks/useCompany", () => ({
  useCompany: () => ({ setActiveCompanyId: setActiveCompanyIdSpy }),
}));

let fetchResult: { rows: CompanyInventoryRow[]; error: string | null } = { rows: [], error: null };
vi.mock("@/lib/admin/companiesInventory", async (orig) => ({
  ...(await orig<typeof import("@/lib/admin/companiesInventory")>()),
  fetchCompaniesInventoryResult: () => Promise.resolve(fetchResult),
}));

import FrontDoorView, { LEGACY_SITE_ROUTE } from "./FrontDoorView";

const CB1 = "58b2b15b-bada-4bcd-9c12-b7e66a37d0bc";

const invRow = (id: string, name: string, frozen = false): CompanyInventoryRow =>
  buildInventory({
    companies: [{ id, name, website: null, frozen }],
    mojoScores: [], integrity: [], ownWords: [], deltas: [], reads: [],
    recurrence: [], baselines: [], ledger: [],
  })[0];

const THREE = [invRow("live1", "Riverlane"), invRow("live2", "Brand AI"), invRow(CB1, "Cafe Barra", true)];

let setItemSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  navigateSpy.mockClear();
  setActiveCompanyIdSpy.mockClear();
  setItemSpy = vi.spyOn(Storage.prototype, "setItem");
  fetchResult = { rows: THREE, error: null };
});
afterEach(() => vi.restoreAllMocks());

const mount = () => render(<MemoryRouter><FrontDoorView /></MemoryRouter>);

describe("(a) the inventory renders, and rendering it selects nothing", () => {
  it("one row per inventory row, and no active-company write on load", async () => {
    const { getByTestId, container } = mount();
    await waitFor(() => expect(getByTestId("company-row-live1")).toBeTruthy());
    expect(getByTestId("company-row-live2")).toBeTruthy();
    expect(getByTestId(`company-row-${CB1}`)).toBeTruthy();
    expect(container.querySelectorAll("[data-testid^='company-row-']")).toHaveLength(3);

    // the page reports; it does not select
    expect(setActiveCompanyIdSpy).not.toHaveBeenCalled();
    expect(navigateSpy).not.toHaveBeenCalled();
    expect(setItemSpy).not.toHaveBeenCalledWith("active_company_id", expect.anything());
  });

  it("the count in the header is the number of rows, and the frozen row is still marked", async () => {
    const { getByTestId } = mount();
    await waitFor(() => expect(getByTestId("front-door-count").textContent).toBe("3 companies"));
    expect(getByTestId(`company-row-${CB1}`).getAttribute("data-frozen")).toBe("true");
  });

  it("a single company reads 'company', not 'companys'", async () => {
    fetchResult = { rows: [invRow("live1", "Riverlane")], error: null };
    const { getByTestId } = mount();
    await waitFor(() => expect(getByTestId("front-door-count").textContent).toBe("1 company"));
  });
});

describe("(b) a row click hands off to that company's First Read", () => {
  it("sets the active company, then navigates to the First Read URL", async () => {
    const { getByText } = mount();
    await waitFor(() => expect(getByText("Brand AI")).toBeTruthy());
    fireEvent.click(getByText("Brand AI"));
    expect(setActiveCompanyIdSpy).toHaveBeenCalledWith("live2");
    expect(navigateSpy).toHaveBeenCalledWith("/preview/client-refine/first-read/live2");
    // and the selection happened BEFORE the navigation
    expect(setActiveCompanyIdSpy.mock.invocationCallOrder[0])
      .toBeLessThan(navigateSpy.mock.invocationCallOrder[0]);
  });

  it("a frozen company is viewable — the click is a read, not a write to it", async () => {
    const { getByText } = mount();
    await waitFor(() => expect(getByText("Cafe Barra")).toBeTruthy());
    fireEvent.click(getByText("Cafe Barra"));
    expect(navigateSpy).toHaveBeenCalledWith(`/preview/client-refine/first-read/${CB1}`);
  });
});

describe("(c) a failed load is a banner over an empty table, never a fallback selection", () => {
  it("banner, zero rows, no auto-select, no localStorage write", async () => {
    fetchResult = { rows: THREE, error: "permission denied for table companies" };
    const { getByTestId, container } = mount();
    await waitFor(() => expect(getByTestId("front-door-banner")).toBeTruthy());
    expect(getByTestId("front-door-banner").textContent)
      .toContain("Couldn't load companies — try reloading.");
    // the rows the failed fetch happened to carry are NOT rendered as if they were a good read
    expect(container.querySelectorAll("[data-testid^='company-row-']")).toHaveLength(0);
    expect(getByTestId("front-door-count").textContent).toBe("0 companies");
    expect(setActiveCompanyIdSpy).not.toHaveBeenCalled();
    expect(setItemSpy).not.toHaveBeenCalledWith("active_company_id", expect.anything());
  });

  it("a healthy load renders NO banner", async () => {
    const { queryByTestId, getByTestId } = mount();
    await waitFor(() => expect(getByTestId("company-row-live1")).toBeTruthy());
    expect(queryByTestId("front-door-banner")).toBeNull();
  });
});

describe("(d) the legacy door", () => {
  it("is present and points at the old companies page", async () => {
    const { getByTestId } = mount();
    await waitFor(() => expect(getByTestId("legacy-door")).toBeTruthy());
    const door = getByTestId("legacy-door");
    expect(door.textContent).toBe("Legacy site");
    expect(door.getAttribute("href")).toBe(LEGACY_SITE_ROUTE);
    expect(LEGACY_SITE_ROUTE).toBe("/admin/companies");
  });
});

describe("(e) the front door acts on nothing", () => {
  it("carries the two signed strings, the First Read ground, and no action column", async () => {
    const { container, getByTestId } = mount();
    await waitFor(() => expect(getByTestId("company-row-live1")).toBeTruthy());
    expect(container.textContent).toContain("All companies");
    expect(container.textContent).toContain("Legacy site");
    expect(container.querySelector(".first-read")).toBeTruthy();
    expect(container.querySelector(".fr-front-door")).toBeTruthy();

    expect(container.textContent).not.toContain("Actions");
    expect(container.textContent).not.toContain("Delete");
    for (const banned of ["baseline + research", "ai research", "web baseline", "re-enter", "refresh"]) {
      expect((container.textContent ?? "").toLowerCase()).not.toContain(banned);
    }
    expect(container.querySelectorAll("button[disabled]")).toHaveLength(0);
  });
});
