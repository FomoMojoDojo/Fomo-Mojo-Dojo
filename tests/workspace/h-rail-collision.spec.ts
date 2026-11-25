// (h) On every workspace route, scrolled to the end, no text-bearing element intersects the bottom
// strip — every frame ends with the strip's height plus 24px. SP-679 (2026-11-25) replaced the ruling
// this spec first encoded (a floating cluster, translucent so content could be read through it): the
// cluster now sits in a strip whose ground is OPAQUE, so at any other scroll position content passes
// behind the strip and is not seen under the three squares.
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
  test(`scrolled to end, no text under the strip on /${seg || "(index)"}; the strip is opaque`, async ({ page }) => {
    await openWorkspace(page, seg);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(300);
    const c = await page.getByTestId("workspace-strip").boundingBox();
    expect(c).not.toBeNull();
    const strip: Box = { x: c!.x, y: c!.y, w: c!.width, h: c!.height };
    const boxes = await textBoxes(page);
    expect(boxes.length).toBeGreaterThan(0);
    const hits = boxes.filter((b) => intersects(b, strip));
    expect(hits, `scrolled to end: ${JSON.stringify(hits)}`).toEqual([]);
    // the last line of the page ends 24px or more above the strip. Rounded to the pixel: a page's
    // height is often a fraction of a pixel while a scroll position is whole, so the frame's exact
    // 24px can measure 23.8 at the end of the scroll.
    expect(Math.round(strip.y - Math.max(...boxes.map((b) => b.y + b.h)))).toBeGreaterThanOrEqual(24);
    // the strip's ground is a solid color under its tint: nothing shows through it
    const ground = await page.getByTestId("workspace-strip").evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(alphaOf(ground), ground).toBe(1);
    // and each square is the topmost thing where it stands
    const onTop = await page.locator("[data-testid='workspace-cluster'] button").evaluateAll((els) => els.map((e) => {
      const r = e.getBoundingClientRect();
      const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return !!top && (top === e || e.contains(top));
    }));
    expect(onTop).toEqual([true, true, true]);
  });
}
