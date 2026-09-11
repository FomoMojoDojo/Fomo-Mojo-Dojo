// (d) Job Map next sets data-fr-stage="fwd", prev sets "back", and the keyed wrapper remounts.
import { expect, test } from "playwright/test";
import { openWorkspace } from "./helpers";

test("job map stage direction and remount", async ({ page }) => {
  await openWorkspace(page, "job-map");
  const nav = page.getByTestId("jobmap-stage-nav");
  test.skip((await nav.count()) === 0, "fixture has fewer than two job steps in the viewed set");
  const wrapper = page.getByTestId("workspace-stage");
  const tag = async () => wrapper.evaluate((el) => { const w = el as HTMLElement & { __fr?: number }; if (!w.__fr) w.__fr = Math.random(); return w.__fr; });
  const before = await tag();
  const stepBefore = await page.getByTestId("jobmap-stage").getAttribute("data-fr-step");
  await page.locator("[data-fr-stage-nav='next']").click();
  await expect(wrapper).toHaveAttribute("data-fr-stage", "fwd");
  await expect(page.getByTestId("jobmap-stage")).not.toHaveAttribute("data-fr-step", stepBefore ?? "");
  expect(await tag()).not.toBe(before); // a new DOM node: the wrapper remounted
  const mid = await tag();
  await page.locator("[data-fr-stage-nav='prev']").click();
  await expect(wrapper).toHaveAttribute("data-fr-stage", "back");
  expect(await tag()).not.toBe(mid);
  await expect(page.getByTestId("jobmap-stage")).toHaveAttribute("data-fr-step", stepBefore ?? "");
});
