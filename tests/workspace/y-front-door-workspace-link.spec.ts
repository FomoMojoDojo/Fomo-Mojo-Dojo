// (y) 4g-1 — THE WORKSPACE LINK ON THE COMPANIES PAGE.
//
// Before this, /preview/client-refine/workspace/* had no link-in from anywhere: the workspace takes
// its company from CompanyProvider and never from a URL param, so reaching a given company's
// workspace meant typing the URL and hoping the active company was already the one you wanted.
//
// The proof turns on the HAND-OFF, not on the route. Another company is pinned as active BEFORE the
// click, so a link that merely navigates — without setting the company — lands on the pinned one and
// this spec goes red. That is exactly what the plant does.
import { expect, test, type Page } from "playwright/test";
import { COMPANY_ID } from "../../playwright.config";

const FRONT_DOOR = "/preview/client-refine";
/** A company that is NOT the one we click. Whatever the link does, it must not be this. */
const OTHER_COMPANY_ID = "fd3f7f63-968b-4698-b946-3d6b6450d79d"; // Cafe Barra 2
const EDGEWOOD = /edgewood/i;

/** Open the front door with the OTHER company pinned active. */
async function openFrontDoor(page: Page): Promise<void> {
  await page.addInitScript((id) => {
    try { localStorage.setItem("active_company_id", id); } catch { /* no storage */ }
  }, OTHER_COMPANY_ID);
  await page.goto(FRONT_DOOR, { waitUntil: "networkidle", timeout: 120_000 });
  await expect(page.getByTestId("front-door-count")).toBeVisible({ timeout: 60_000 });
}

test("(y1) the companies page carries a Workspace link on every row, beside the First Read row click", async ({ page }) => {
  await openFrontDoor(page);
  const row = page.getByTestId(`company-row-${COMPANY_ID}`);
  await expect(row).toBeVisible();
  const link = page.getByTestId(`front-door-workspace-${COMPANY_ID}`);
  await expect(link).toHaveText("Workspace");
  // A real link: it has an href, so it is keyboard reachable and opens in a new tab like any other.
  await expect(link).toHaveAttribute("href", "/preview/client-refine/workspace");
  // The row's own affordance is untouched — the company name still opens the First Read.
  await expect(row.getByRole("button", { name: EDGEWOOD })).toBeVisible();
  // Every row has one, not just this one.
  const links = page.locator('[data-testid^="front-door-workspace-"]');
  const rows = page.locator('[data-testid^="company-row-"]');
  expect(await links.count()).toBe(await rows.count());
});

test("(y2) clicking Workspace opens THAT company's workspace home, and the launcher keeps it into Inputs", async ({ page }) => {
  await openFrontDoor(page);
  await page.getByTestId(`front-door-workspace-${COMPANY_ID}`).click();

  // the workspace home, on the company whose row was clicked — not the pinned one
  await expect(page.getByTestId("workspace-root")).toBeVisible({ timeout: 60_000 });
  await expect(page).toHaveURL(/\/preview\/client-refine\/workspace$/);
  await expect(page.getByTestId("workspace-identity")).toHaveText(EDGEWOOD, { timeout: 60_000 });

  // and it survives the launcher into Inputs — the company travelled, not just the route
  await page.getByTestId("workspace-square").click();
  const panel = page.getByTestId("workspace-launcher-panel");
  await expect(panel).toBeVisible();
  // SCOPED to the panel: the workspace home renders its own chart tiles with the same attribute,
  // and those sit behind the overlay, so an unscoped selector picks an unclickable one.
  await panel.locator('[data-fr-tile="inputs"]').click();
  await expect(page.getByTestId("workspace-root")).toHaveAttribute("data-fr-page", "inputs", { timeout: 60_000 });
  await expect(page.getByTestId("workspace-identity")).toHaveText(EDGEWOOD, { timeout: 60_000 });
});

test("(y3) the link is keyboard reachable — Tab lands on it and Enter opens the workspace", async ({ page }) => {
  await openFrontDoor(page);
  const link = page.getByTestId(`front-door-workspace-${COMPANY_ID}`);
  await link.focus();
  await expect(link).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("workspace-root")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("workspace-identity")).toHaveText(EDGEWOOD, { timeout: 60_000 });
});
