// (j) Routes: the accordion expands/collapses (first route open by default); Regenerate conditions /
// Draft tests are absent on the default render.
import { expect, test } from "playwright/test";
import { openWorkspace } from "./helpers";

test("accordion and operator controls on /routes", async ({ page }) => {
  await openWorkspace(page, "routes");
  const items = page.getByTestId("routes-item");
  const n = await items.count();
  test.skip(n < 2, "fixture has fewer than two routes");
  await expect(items.nth(0)).toHaveAttribute("data-expanded", "true");
  await expect(items.nth(1)).not.toHaveAttribute("data-expanded", "true");
  await items.nth(1).locator("button").click();
  await expect(items.nth(1)).toHaveAttribute("data-expanded", "true");
  await expect(items.nth(0)).not.toHaveAttribute("data-expanded", "true");
  await items.nth(1).locator("button").click();
  await expect(items.nth(1)).not.toHaveAttribute("data-expanded", "true");
  await expect(page.getByText("Regenerate conditions")).toHaveCount(0);
  await expect(page.getByText("Draft tests")).toHaveCount(0);
  await expect(page.locator("[data-fr-operator]")).toHaveCount(0);
});
