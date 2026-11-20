// (m) SP-456: the LAUNCHER fits, and its three rows share one width.
//
// Two defects this pins, both found by eye on a screenshot and neither catchable by any existing
// spec — (e) checks regions, (f) operator nodes, (h) the cluster, (l) tile counts:
//
//   * the nav is border-box, so `max-width: 3*tile + 2` was the PADDED width. The content box came
//     out 80px narrower than the tile grid's three fixed columns, so the third column (Routes,
//     Market) hung 79px outside the frame while both bars and the Tools row read narrower than the
//     tiles. Measured on 1b3bce8c too: it predates the Brief.
//   * a fourth Tools cell wrapped to a second row, and the launcher's vertical budget is calculated
//     for ONE (81px): the panel went into overflow (746 > 672 at 1280x720) and the footer off screen.
//
// Both views at both supported sizes, because the operator's fourth cell is what loads the strip.
import { expect, test } from "playwright/test";
import { openWorkspace } from "./helpers";

const SIZES = [
  { w: 1440, h: 900 },
  { w: 1280, h: 720 },
] as const;

for (const { w, h } of SIZES) {
  for (const operator of [false, true]) {
    test(`launcher at ${w}x${h}, ${operator ? "operator" : "default"}: one width, square tiles, nothing clipped, footer on screen`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      await openWorkspace(page, "job-map");
      if (operator) {
        await page.locator("[data-fr-operator-switch]").click();
        await expect(page.locator("[data-fr-operator-switch]")).toHaveAttribute("data-fr-operator-switch", "on");
      }
      await page.getByTestId("workspace-square").click();
      await expect(page.getByTestId("workspace-launcher")).toBeVisible();
      // the panel unfolds; measure the settled layout, never the animation
      await page.waitForTimeout(2000);

      const m = await page.evaluate(() => {
        const r = (e: Element) => e.getBoundingClientRect();
        const panel = document.querySelector(".fr-launcher-panel")!;
        const foot = document.querySelector(".fr-launcher-foot")!;
        const blocks = [...document.querySelectorAll(".fr-launcher-group, .fr-launcher-tools")];
        const tiles = [...document.querySelectorAll(".fr-launcher-tile")];
        const tools = [...document.querySelectorAll(".fr-launcher-tool")];
        // the TOOL is where white-space/overflow live, so it is the element that clips
        const clipped = tools
          .filter((t) => t.scrollWidth > t.clientWidth + 1 || t.scrollHeight > t.clientHeight + 1)
          .map((t) => (t.textContent ?? "").trim().slice(0, 24));
        const outside: string[] = [];
        for (const t of tools) {
          const cs = getComputedStyle(t), tr = r(t);
          const left = tr.left + parseFloat(cs.paddingLeft), right = tr.right - parseFloat(cs.paddingRight);
          for (const s of t.querySelectorAll(".fr-launcher-tool-eyebrow, .fr-launcher-tool-title")) {
            const sr = r(s);
            if (sr.right > right + 1 || sr.left < left - 1) outside.push(s.textContent ?? "");
          }
        }
        return {
          blockRights: [...new Set(blocks.map((e) => Math.round(r(e).right)))],
          blockLefts: [...new Set(blocks.map((e) => Math.round(r(e).left)))],
          tileOverflow: Math.max(...tiles.map((e) => Math.round(r(e).right))) - Math.max(...blocks.map((e) => Math.round(r(e).right))),
          notSquare: tiles.filter((e) => Math.abs(r(e).width - r(e).height) > 2).length,
          panelOverflows: panel.scrollHeight > panel.clientHeight + 1,
          footVisible: r(foot).bottom <= window.innerHeight + 1,
          toolCount: tools.length,
          clipped, outside,
        };
      });

      // one width: the two bars and the Tools row begin and end at the same x
      expect(m.blockLefts, `bars/tools left edges: ${JSON.stringify(m.blockLefts)}`).toHaveLength(1);
      expect(m.blockRights, `bars/tools right edges: ${JSON.stringify(m.blockRights)}`).toHaveLength(1);
      // and no tile reaches past them
      expect(m.tileOverflow, `tiles overflow the frame by ${m.tileOverflow}px`).toBeLessThanOrEqual(0);
      // the signed fit-the-viewport rule
      expect(m.notSquare, "tiles must stay square").toBe(0);
      expect(m.panelOverflows, "the launcher panel must not scroll").toBe(false);
      expect(m.footVisible, "the launcher footer must be on screen").toBe(true);
      // nothing cut
      expect(m.clipped, `clipped tool cell(s): ${JSON.stringify(m.clipped)}`).toEqual([]);
      expect(m.outside, `text outside its cell: ${JSON.stringify(m.outside)}`).toEqual([]);
      // non-vacuity: the operator really does load the strip with a fourth cell
      expect(m.toolCount).toBe(operator ? 4 : 2);
    });
  }
}
