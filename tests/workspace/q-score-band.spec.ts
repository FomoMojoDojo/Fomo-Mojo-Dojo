// (q) Score band honesty (operator ruling 3, 2026-09-12): both client-visible "+N PTS" banners are gone —
// the EVIDENCE UNLOCK banner on /workspace/routes and the KEY MOVE stripe on the older routes view —
// and the three-number band on BOTH surfaces is byte-identical to before the removal (Edgewood:
// 28 NOW · 47 REACHABLE · 84 CEILING / UNLOCKABLE), operator ON and OFF. Reads only — no writes occur
// on either page load, and the guard proves it.
import { expect, test, type Page } from "playwright/test";
import { open, openWorkspace } from "./helpers";

const EXPECTED = { now: "28", reachable: "47", ceiling: "84" };

async function guardNoWrites(page: Page): Promise<string[]> {
  const writes: string[] = [];
  await page.route(/\/(rest|storage|functions)\/v1\//, async (route) => {
    const m = route.request().method();
    if (m === "GET" || m === "HEAD" || m === "OPTIONS") return route.continue();
    writes.push(`${m} ${route.request().url()}`);
    return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });
  return writes;
}
async function operatorOn(page: Page) {
  await page.locator("[data-fr-operator-switch]").click();
  await expect(page.locator("[data-fr-operator-switch]")).toHaveAttribute("data-fr-operator-switch", "on");
}

for (const operator of [false, true]) {
  test(`workspace /routes — no EVIDENCE UNLOCK banner; band 28 / 47 / 84 (operator ${operator ? "ON" : "OFF"})`, async ({ page }) => {
    const writes = await guardNoWrites(page);
    await openWorkspace(page, "routes");
    if (operator) await operatorOn(page);
    const strip = page.getByTestId("routes-scorestrip");
    await expect(strip).toBeVisible();
    const cells = strip.locator(".fr-ws-scorecell");
    await expect(cells).toHaveCount(3);
    await expect(cells.nth(0).locator(".fr-ws-scorecell-value")).toHaveText(EXPECTED.now);
    await expect(cells.nth(0).locator(".fr-ws-scorecell-label")).toHaveText("Now");
    await expect(cells.nth(1).locator(".fr-ws-scorecell-value")).toHaveText(EXPECTED.reachable);
    await expect(cells.nth(1).locator(".fr-ws-scorecell-label")).toHaveText("Reachable");
    await expect(cells.nth(2).locator(".fr-ws-scorecell-value")).toHaveText(EXPECTED.ceiling);
    await expect(cells.nth(2).locator(".fr-ws-scorecell-label")).toHaveText("Ceiling");
    await expect(page.getByTestId("routes-unlock")).toHaveCount(0);
    await expect(page.locator("[data-fr-region=evidence-unlock]")).toHaveCount(0);
    await expect(page.getByText(/\+\d+ PTS/)).toHaveCount(0);
    expect(writes).toEqual([]);
  });
}

test("older routes view — no KEY MOVE stripe; strip NOW 28 · REACHABLE 47 · UNLOCKABLE 84", async ({ page }) => {
  const writes = await guardNoWrites(page);
  await open(page, "/preview/client-refine/routes");
  // The hierarchy strip renders three ScoreChips (value span above a label span) NOW / REACHABLE / UNLOCKABLE.
  await expect(page.getByText("UNLOCKABLE", { exact: true }).first()).toBeVisible({ timeout: 60_000 });
  const value = async (label: string) =>
    (await page.getByText(label, { exact: true }).first().locator("xpath=preceding-sibling::span[1]").innerText()).trim();
  expect(await value("NOW")).toBe(EXPECTED.now);
  expect(await value("REACHABLE")).toBe(EXPECTED.reachable);
  expect(await value("UNLOCKABLE")).toBe(EXPECTED.ceiling);
  await expect(page.getByText(/PTS REACHABLE/)).toHaveCount(0);
  await expect(page.getByText(/KEY MOVE/i)).toHaveCount(0);
  expect(writes).toEqual([]);
});
