// (c) ←/→ move within the page's own group and wrap; a Base page never reaches an Outputs route.
import { expect, test } from "playwright/test";
import { openWorkspace, wsPath } from "./helpers";

test("ArrowRight on /job-map lands on /opportunities", async ({ page }) => {
  await openWorkspace(page, "job-map");
  await page.keyboard.press("ArrowRight");
  await expect(page).toHaveURL(new RegExp(`${wsPath("opportunities")}$`));
});

test("ArrowRight on /routes wraps to /job-map", async ({ page }) => {
  await openWorkspace(page, "routes");
  await page.keyboard.press("ArrowRight");
  await expect(page).toHaveURL(new RegExp(`${wsPath("job-map")}$`));
});

test("ArrowRight from /strategy cycles Base only, never an Outputs route", async ({ page }) => {
  await openWorkspace(page, "strategy");
  const seen: string[] = [];
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(150);
    seen.push(new URL(page.url()).pathname);
  }
  for (const p of seen) expect(p).toMatch(/\/workspace\/(strategy|positioning|market)$/);
  expect(seen).toEqual([wsPath("positioning"), wsPath("market"), wsPath("strategy"), wsPath("positioning"), wsPath("market"), wsPath("strategy")]);
});

test("arrows are disabled on Tools pages", async ({ page }) => {
  await openWorkspace(page, "inputs");
  await expect(page.locator("[data-fr-arrow='prev']")).toHaveAttribute("aria-disabled", "true");
  await expect(page.locator("[data-fr-arrow='next']")).toHaveAttribute("aria-disabled", "true");
  await page.keyboard.press("ArrowRight");
  await expect(page).toHaveURL(new RegExp(`${wsPath("inputs")}$`));
});
