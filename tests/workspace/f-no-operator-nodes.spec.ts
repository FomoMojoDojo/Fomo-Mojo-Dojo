// (f) The default render of every workspace route has zero [data-fr-operator] nodes — including the
// open launcher (no Admin disclosure) and the header (no Scan-all-surfaces control).
import { expect, test } from "playwright/test";
import { WS_PAGES, open, openWorkspace } from "./helpers";
import { COMPANY_ID } from "../../playwright.config";

for (const seg of WS_PAGES) {
  test(`default render of /${seg || "(index)"} carries no operator node`, async ({ page }) => {
    await openWorkspace(page, seg);
    await expect(page.locator("[data-fr-operator]")).toHaveCount(0);
    await expect(page.locator("[data-fr-operator-switch]")).toHaveAttribute("data-fr-operator-switch", "off");
    await expect(page.getByText("Scan all surfaces")).toHaveCount(0);
    await page.getByTestId("workspace-square").click();
    await expect(page.getByTestId("workspace-launcher")).toBeVisible();
    await expect(page.locator("[data-fr-operator]")).toHaveCount(0);
    await expect(page.getByText("Admin", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Workspace controls")).toHaveCount(0);
    // Port 2a's operator-only controls never appear on the default render either.
    for (const t of ["Create route", "Regenerate conditions", "Draft tests"]) await expect(page.getByText(t)).toHaveCount(0);
  });
}

// FM9 (2026-09-22): the first-read route gained the ?mark= link-back carrier. The carrier navigates the read —
// it buys no affordance: the default render is the client render with the param exactly as without it.
for (const search of ["", `?mark=${encodeURIComponent("question|f-no-operator-nodes")}`]) {
  test(`default render of the first read ${search ? "with ?mark=" : "with no param"} carries no operator node`, async ({ page }) => {
    await open(page, `/preview/client-refine/first-read/${COMPANY_ID}${search}`);
    await expect(page.locator(".first-read")).toBeVisible({ timeout: 60_000 });
    await expect(page.locator("[data-fr-operator]")).toHaveCount(0);
    await expect(page.locator("[data-fr-operator-switch]")).toHaveAttribute("data-fr-operator-switch", "off");
    await expect(page.getByText("All companies", { exact: true })).toHaveCount(0);
  });
}
