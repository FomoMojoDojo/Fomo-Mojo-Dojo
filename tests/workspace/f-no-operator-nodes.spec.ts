// (f) The default render of every workspace route has zero [data-fr-operator] nodes — including the
// open launcher (no Admin disclosure) and the header (no Scan-all-surfaces control).
import { expect, test } from "playwright/test";
import { WS_PAGES, openWorkspace } from "./helpers";

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
  });
}
