// (g) /preview/client-refine/home DOM text is byte-identical to the pre-change capture
// (backups/home-dom-before_<date>.txt, taken with the first-read-capture discipline before any edit).
import fs from "node:fs";
import { expect, test } from "playwright/test";
import { HOME_DOM_BASELINE } from "../../playwright.config";
import { open } from "./helpers";

test("home DOM text is byte-identical before and after", async ({ page }) => {
  test.skip(!fs.existsSync(HOME_DOM_BASELINE), `no baseline at ${HOME_DOM_BASELINE}`);
  const before = fs.readFileSync(HOME_DOM_BASELINE, "utf8");
  await open(page, "/preview/client-refine/home");
  await expect(page.getByTestId("home-fr-root")).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(1500);
  const after = await page.locator("body").innerText();
  expect(after).toBe(before);
});
