// (d) Job Map: choosing a later stage sets data-fr-stage="fwd", an earlier one "back", and the keyed
// wrapper remounts; the stage list marks the current stage.
import { expect, test } from "playwright/test";
import { openWorkspace } from "./helpers";

test("job map stage direction and remount", async ({ page }) => {
  await openWorkspace(page, "job-map");
  const nav = page.getByTestId("jobmap-stage-nav");
  test.skip((await nav.count()) === 0, "fixture has no job steps in the viewed set");
  const buttons = nav.locator("button");
  test.skip((await buttons.count()) < 2, "fixture has fewer than two stages");
  const wrapper = page.getByTestId("workspace-stage");
  const tag = async () => wrapper.evaluate((el) => { const w = el as HTMLElement & { __fr?: number }; if (!w.__fr) w.__fr = Math.random(); return w.__fr; });
  const before = await tag();
  const stepBefore = await page.getByTestId("jobmap-stage").getAttribute("data-fr-step");
  await expect(buttons.nth(0)).toHaveAttribute("aria-current", "step");
  await buttons.nth(2).click();
  await expect(wrapper).toHaveAttribute("data-fr-stage", "fwd");
  await expect(nav.locator("button").nth(2)).toHaveAttribute("aria-current", "step");
  await expect(page.getByTestId("jobmap-stage")).not.toHaveAttribute("data-fr-step", stepBefore ?? "");
  expect(await tag()).not.toBe(before); // a new DOM node: the wrapper remounted
  const mid = await tag();
  await nav.locator("button").nth(1).click();
  await expect(wrapper).toHaveAttribute("data-fr-stage", "back");
  expect(await tag()).not.toBe(mid);
  await expect(nav.locator("button").nth(1)).toHaveAttribute("aria-current", "step");
});

// Step 3 (port 2a fix): the "N High" count on the current stage moves when a row in that stage is
// planted to a non-High band (odi_needs REST rewritten in flight — never a DB write).
test("job map 'N High' count drops by one for a planted non-High row in the current stage", async ({ page }) => {
  await openWorkspace(page, "job-map");
  const count = page.getByTestId("jobmap-high-count");
  test.skip((await count.count()) === 0, "fixture has no High rows on the first stage");
  const before = parseInt((await count.innerText()).trim(), 10);
  const currentStep = await page.getByTestId("jobmap-stage").getAttribute("data-fr-step");
  // Plant: the first public_research row of the CURRENT stage scores 3.
  let plantedId: string | null = null;
  await page.route(/\/rest\/v1\/odi_needs/, async (route) => {
    const res = await route.fetch();
    let rows: unknown = null;
    try { rows = JSON.parse(await res.text()); } catch { /* not json */ }
    if (Array.isArray(rows)) {
      type R = { id: string; step_number: number; provenance_type?: string | null; opportunity_score?: number | null };
      const t = (rows as R[]).find((r) => r.id === plantedId) ?? (rows as R[]).find((r) => String(r.step_number) === String(currentStep) && r.provenance_type === "public_research" && (r.opportunity_score ?? 0) >= 10);
      if (t) { plantedId = t.id; rows = (rows as R[]).map((r) => (r.id === t.id ? { ...r, opportunity_score: 3 } : r)); }
    }
    await route.fulfill({ response: res, body: JSON.stringify(rows), headers: { ...res.headers(), "content-type": "application/json" } });
  });
  await openWorkspace(page, "job-map");
  test.skip(plantedId === null, "no public_research High row on the current stage to plant");
  const after = parseInt((await page.getByTestId("jobmap-high-count").innerText()).trim(), 10);
  expect(after).toBe(before - 1);
});
