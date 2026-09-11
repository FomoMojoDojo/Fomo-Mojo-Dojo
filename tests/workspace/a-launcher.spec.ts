// (a) The launcher opens with data-state="open" and closes through "closing" to unmounted; the fold
// phases are present on the panel; the cluster arrows hide while the map is open. Motion project only
// — the fold ends on an animation end, which reduced motion never fires.
import { expect, test } from "playwright/test";
import { openWorkspace } from "./helpers";

test("launcher unfolds to open and folds back to unmounted; arrows hide while open", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "motion", "needs animations on");
  await openWorkspace(page, "strategy");
  await expect(page.locator("[data-fr-arrow]")).toHaveCount(2);
  await page.getByTestId("workspace-square").click();
  const launcher = page.getByTestId("workspace-launcher");
  const panel = page.getByTestId("workspace-launcher-panel");
  await expect(launcher).toHaveAttribute("data-state", "open");
  await expect(panel).toHaveAttribute("role", "dialog");
  // Fold phases: the panel unfolds from its bottom-left corner (two-phase keyframes), the scrim fades.
  expect(await panel.evaluate((el) => getComputedStyle(el).animationName)).toBe("fr-launcher-unfold");
  expect(await panel.evaluate((el) => getComputedStyle(el).transformOrigin)).toMatch(/^0px \d+(\.\d+)?px$/);
  expect(await launcher.evaluate((el) => getComputedStyle(el).animationName)).toBe("fr-launcher-scrim-in");
  await expect(page.locator("[data-fr-arrow]")).toHaveCount(0);
  await page.getByRole("button", { name: "Close workspace map" }).click();
  await expect(launcher).toHaveAttribute("data-state", "closing");
  expect(await panel.evaluate((el) => getComputedStyle(el).animationName)).toBe("fr-launcher-fold");
  await expect(launcher).toHaveCount(0);
  await expect(page.locator("[data-fr-arrow]")).toHaveCount(2);
});

test("Escape folds the launcher back", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "motion", "needs animations on");
  await openWorkspace(page, "strategy");
  await page.getByTestId("workspace-square").click();
  await expect(page.getByTestId("workspace-launcher")).toHaveAttribute("data-state", "open");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("workspace-launcher")).toHaveCount(0);
});

// Accepted fix 2: the launcher panel never scrolls — all three rows fit — at 1440×900 and 1280×720.
for (const size of [{ width: 1440, height: 900 }, { width: 1280, height: 720 }]) {
  test(`launcher panel fits the viewport without scrolling at ${size.width}×${size.height}`, async ({ page }) => {
    await page.setViewportSize(size);
    await openWorkspace(page, "");
    await page.getByTestId("workspace-square").click();
    const panel = page.getByTestId("workspace-launcher-panel");
    await expect(panel).toBeVisible();
    // Measure at rest: wait for every entrance animation inside the panel to finish (motion project).
    await panel.evaluate((el) => Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished.catch(() => undefined))));
    const m = await panel.evaluate((el) => ({ scroll: el.scrollHeight, client: el.clientHeight }));
    expect(m.scroll).toBe(m.client);
    // Every tile, the tools strip and the footer are inside the panel box.
    const pb = (await panel.boundingBox())!;
    for (const sel of [".fr-launcher-tile", ".fr-launcher-tool", ".fr-launcher-foot"]) {
      const boxes = await page.locator(sel).evaluateAll((els) => els.map((e) => e.getBoundingClientRect().bottom));
      for (const b of boxes) expect(b).toBeLessThanOrEqual(pb.y + pb.height + 0.5);
    }
  });
}
