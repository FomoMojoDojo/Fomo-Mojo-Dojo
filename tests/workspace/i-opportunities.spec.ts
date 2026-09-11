// (i) Opportunities: filter, search and selection — with a PLANTED non-High row so the High-value
// filter is proven non-vacuous (Edgewood's 28 needs all read High by the system's own band: 14 by
// opportunity_score ≥ 10, 14 declared at confidence 0.95). The plant is a test-only path: the
// odi_needs REST response is rewritten in flight (page.route) — never a DB write.
import { expect, test, type Page } from "playwright/test";
import { openWorkspace } from "./helpers";

type NeedRow = { id: string; desired_outcome: string; provenance_type?: string | null; opportunity_score?: number | null };

/** Rewrites every odi_needs response so the first public_research row scores 3 (band Low). */
async function plantLowRow(page: Page): Promise<{ planted: () => NeedRow | null }> {
  let planted: NeedRow | null = null;
  await page.route(/\/rest\/v1\/odi_needs/, async (route) => {
    const res = await route.fetch();
    const body = await res.text();
    let rows: unknown;
    try { rows = JSON.parse(body); } catch { return route.fulfill({ response: res, body }); }
    if (Array.isArray(rows)) {
      const target = planted ?? (rows as NeedRow[]).find((r) => r.provenance_type === "public_research" && (r.opportunity_score ?? 0) >= 10) ?? null;
      if (target) {
        planted = { ...target, opportunity_score: 3 };
        rows = (rows as NeedRow[]).map((r) => (r.id === target.id ? { ...r, opportunity_score: 3 } : r));
      }
    }
    await route.fulfill({ response: res, body: JSON.stringify(rows), headers: { ...res.headers(), "content-type": "application/json" } });
  });
  return { planted: () => planted };
}

test("filter, search and selection on /opportunities (real fixture)", async ({ page }) => {
  await openWorkspace(page, "opportunities");
  const rows = page.getByTestId("opps-row");
  const all = await rows.count();
  test.skip(all < 2, "fixture has fewer than two opportunities");
  const firstText = (await rows.nth(0).locator(".fr-ws-opprow-text").innerText()).trim();
  await expect(page.getByTestId("opps-aside-title")).toHaveText(firstText);
  const secondText = (await rows.nth(1).locator(".fr-ws-opprow-text").innerText()).trim();
  await rows.nth(1).click();
  await expect(page.getByTestId("opps-aside-title")).toHaveText(secondText);
  await expect(rows.nth(1)).toHaveAttribute("aria-pressed", "true");
  // The real fixture's High-value count is whatever the system's band says (Edgewood: all 28).
  await page.getByTestId("opps-filters").getByRole("button", { name: "High value" }).click();
  const highReal = await rows.count();
  expect(highReal).toBe(all); // Edgewood: 28 of 28 read High
  await page.getByTestId("opps-filters").getByRole("button", { name: "All", exact: true }).click();
  await expect(rows).toHaveCount(all);
  const needle = firstText.split(" ").find((w) => w.length > 5) ?? firstText.slice(0, 6);
  await page.getByTestId("opps-search").fill(needle);
  const narrowed = await rows.count();
  expect(narrowed).toBeGreaterThan(0);
  expect(narrowed).toBeLessThanOrEqual(all);
  for (const t of await rows.locator(".fr-ws-opprow-text").allInnerTexts()) expect(t.toLowerCase()).toContain(needle.toLowerCase());
});

test("High-value filter drops a planted non-High row", async ({ page }) => {
  const plant = await plantLowRow(page);
  await openWorkspace(page, "opportunities");
  const rows = page.getByTestId("opps-row");
  const all = await rows.count();
  test.skip(all < 2 || !plant.planted(), "fixture has no public_research row to plant");
  const plantedText = plant.planted()!.desired_outcome;
  await expect(page.getByTestId("opps-list")).toContainText(plantedText);
  await page.getByTestId("opps-filters").getByRole("button", { name: "High value" }).click();
  await expect(rows).toHaveCount(all - 1); // exactly the planted row is gone
  await expect(page.getByTestId("opps-list")).not.toContainText(plantedText);
  await page.getByTestId("opps-filters").getByRole("button", { name: "All", exact: true }).click();
  await expect(rows).toHaveCount(all);
});
