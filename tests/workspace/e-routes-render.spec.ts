// (e) Each route renders inside .first-read with the shell header, its comp regions are present
// (data-fr-region) and every region present has non-empty content.
import { expect, test } from "playwright/test";
import { WS_PAGES, openWorkspace } from "./helpers";

/** Regions the Edgewood fixture is expected to render on each page (conditional ones are not listed). */
const EXPECTED: Record<string, string[]> = {
  "": ["chart"],
  inputs: ["signal-basis", "counters", "files"],
  "job-map": ["hypothesis", "stages"],
  positioning: ["what-holds-it-up", "who-this-is-for", "instead-of"],
  strategy: ["choices", "management-systems"],
  market: ["hiring-for", "tensions-count"],
  opportunities: ["filters", "list", "aside"],
  routes: ["score-strip", "workbench", "accordion"],
  council: ["recommendations"],
};

for (const seg of WS_PAGES) {
  test(`renders /${seg || "(index)"} inside .first-read with its regions filled`, async ({ page }) => {
    await openWorkspace(page, seg);
    const root = page.getByTestId("workspace-root");
    await expect(root).toHaveClass(/\bfirst-read\b/);
    await expect(root.locator("header.fr-shell-header")).toHaveCount(1);
    await expect(root.locator(".fr-shell-title")).toHaveText("MojoMap");
    await expect(page.getByTestId("workspace-identity")).toContainText("DAY");
    await page.waitForTimeout(600);
    const regions = await page.locator("[data-fr-region]").evaluateAll((els) =>
      els.map((el) => ({ name: el.getAttribute("data-fr-region")!, text: (el as HTMLElement).innerText.trim() })),
    );
    const names = regions.map((r) => r.name);
    for (const expected of EXPECTED[seg] ?? []) expect(names, `missing region ${expected}`).toContain(expected);
    for (const r of regions) expect(r.text.length, `empty region ${r.name}`).toBeGreaterThan(0);
  });
}
