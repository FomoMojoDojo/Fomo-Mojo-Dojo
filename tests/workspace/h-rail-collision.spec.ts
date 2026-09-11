// (h) Accepted ruling: on every workspace route, scrolled to the end, no text-bearing element
// intersects the cluster's box (every frame ends with the 92px inset), and the cluster surfaces are
// translucent (computed background alpha < 1) so content scrolling through beneath stays readable.
import { expect, test } from "playwright/test";
import { WS_PAGES, openWorkspace } from "./helpers";

type Box = { x: number; y: number; w: number; h: number };
const intersects = (a: Box, b: Box) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

async function textBoxes(page: import("playwright/test").Page): Promise<Box[]> {
  return page.locator(".fr-workspace-stage *").evaluateAll((els) =>
    els
      .filter((el) => Array.from(el.childNodes).some((n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? "").trim().length > 0))
      .map((el) => el.getBoundingClientRect())
      .filter((r) => r.width > 0 && r.height > 0)
      .map((r) => ({ x: r.x, y: r.y, w: r.width, h: r.height })),
  );
}

function alphaOf(bg: string): number {
  const m = bg.match(/rgba?\(([^)]+)\)/);
  if (!m) return 1;
  const parts = m[1].split(/[\s,\/]+/).filter(Boolean);
  return parts.length >= 4 ? parseFloat(parts[3]) : 1;
}

for (const seg of WS_PAGES) {
  test(`scrolled to end, no text under the cluster on /${seg || "(index)"}; cluster is translucent`, async ({ page }) => {
    await openWorkspace(page, seg);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(300);
    const c = await page.getByTestId("workspace-cluster").boundingBox();
    expect(c).not.toBeNull();
    const cluster: Box = { x: c!.x, y: c!.y, w: c!.width, h: c!.height };
    const hits = (await textBoxes(page)).filter((b) => intersects(b, cluster));
    expect(hits, `scrolled to end: ${JSON.stringify(hits)}`).toEqual([]);
    const alphas = await page.locator("[data-testid='workspace-cluster'] button").evaluateAll((els) => els.map((e) => getComputedStyle(e).backgroundColor));
    expect(alphas.length).toBeGreaterThan(0);
    for (const bg of alphas) expect(alphaOf(bg), bg).toBeLessThan(1);
  });
}
