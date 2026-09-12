// (l) Home: seven page cards, each navigating to its page.
import { expect, test } from "playwright/test";
import { openWorkspace, wsPath } from "./helpers";

test("home renders seven cards that navigate", async ({ page }) => {
  await openWorkspace(page, "");
  const cards = page.getByTestId("home-card");
  await expect(cards).toHaveCount(7);
  const keys = await cards.evaluateAll((els) => els.map((e) => e.getAttribute("data-fr-card")!));
  expect(new Set(keys).size).toBe(7);
  // Exactly seven cells carry content; the grid itself paints no background (an empty trailing cell is
  // the page ground), so nothing else in the grid carries one.
  const grid = page.getByTestId("home-cards");
  expect(await grid.evaluate((el) => el.children.length)).toBe(7);
  const bg = await grid.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(bg).toMatch(/rgba\(0, 0, 0, 0\)|transparent/);
  for (const t of await cards.locator(".fr-ws-card-text").allInnerTexts()) expect(t.trim().length).toBeGreaterThan(0);
  // The Opportunities card's count is live (odi_needs), not baked into the string.
  await expect(page.getByTestId("home-card-count")).toHaveText(/^\d+$/);
  for (const key of keys) {
    await openWorkspace(page, "");
    await page.locator(`[data-fr-card='${key}']`).click();
    await expect(page).toHaveURL(new RegExp(`${wsPath(key)}$`));
    await expect(page.getByTestId("workspace-root")).toHaveAttribute("data-fr-page", key);
  }
});
