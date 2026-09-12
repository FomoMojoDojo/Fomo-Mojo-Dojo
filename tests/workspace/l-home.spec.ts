// (l) Home is the element chart: three rows (Outputs, Base, Tools), nine tiles by default (ten with the
// operator's Admin), each tile navigates, Admin absent by default, and all rows fit the viewport at
// 1440×900 and 1280×720.
import { expect, test } from "playwright/test";
import { openWorkspace, wsPath } from "./helpers";

test("home chart: rows, tiles, navigation, no Admin by default", async ({ page }) => {
  await openWorkspace(page, "");
  const chart = page.getByTestId("home-chart");
  await expect(chart.locator(".fr-launcher-group")).toHaveCount(2);
  await expect(chart.locator(".fr-launcher-tools")).toHaveCount(1);
  const tiles = chart.locator("[data-fr-tile]");
  await expect(tiles).toHaveCount(8); // six square tiles + two tools cells (Admin would be the ninth/tenth)
  await expect(chart.getByText("Admin", { exact: true })).toHaveCount(0);
  await expect(page.locator("[data-fr-operator]")).toHaveCount(0);
  const keys = await tiles.evaluateAll((els) => els.map((e) => e.getAttribute("data-fr-tile")!));
  expect(keys).toEqual(["job-map", "opportunities", "routes", "strategy", "positioning", "market", "inputs", "council"]);
  expect(new Set(keys).size).toBe(keys.length);
  // Square tiles.
  const boxes = await chart.locator(".fr-launcher-tile").evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }));
  for (const [w, h] of boxes) expect(Math.abs(w - h)).toBeLessThanOrEqual(1);
  for (const key of keys) {
    await openWorkspace(page, "");
    await page.getByTestId("home-chart").locator(`[data-fr-tile='${key}']`).click();
    await expect(page).toHaveURL(new RegExp(`${wsPath(key)}$`));
    await expect(page.getByTestId("workspace-root")).toHaveAttribute("data-fr-page", key);
  }
});

for (const size of [{ width: 1440, height: 900 }, { width: 1280, height: 720 }]) {
  test(`home chart spans the hero column at ${size.width}×${size.height}`, async ({ page }) => {
    await page.setViewportSize(size);
    await openWorkspace(page, "");
    await page.waitForTimeout(600);
    const chart = (await page.getByTestId("home-chart").boundingBox())!;
    const column = (await page.locator(".fr-ws-hero-main").boundingBox())!;
    expect(Math.abs(chart.width - column.width)).toBeLessThanOrEqual(2);
    expect(Math.abs(chart.x - column.x)).toBeLessThanOrEqual(2);
    const boxes = await page.getByTestId("home-chart").locator(".fr-launcher-tile").evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }));
    for (const [w, h] of boxes) expect(Math.abs(w - h)).toBeLessThanOrEqual(1);
  });
}
