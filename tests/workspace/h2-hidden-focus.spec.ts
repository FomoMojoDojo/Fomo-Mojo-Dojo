// (h2) SP-679 (2026-11-25): Tab never leaves a focused control hidden under the bottom strip or the
// sticky header. When focus moves, the browser scrolls the control "into view" — and without scroll
// padding the area under a fixed bar counts as in view, so a control could take focus behind the
// strip. The window is made short here so every page must scroll for focus to travel down it; the
// test fails if nothing scrolled, because then it would have proved nothing.
import { expect, test } from "playwright/test";
import { openWorkspace } from "./helpers";

test("Tab through a paper page and a slate page: no focused control sits under the strip or the header", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 420 });
  // Two paper pages (Working, Hero) and a slate one (Read). The Brief is the slate page with controls
  // of its own, and it renders them only with the operator switch on.
  for (const seg of ["routes", "inputs", "brief"]) {
    await openWorkspace(page, seg);
    if (seg === "brief") {
      await page.locator("[data-fr-operator-switch]").click();
      await expect(page.getByTestId("brief-tabs")).toBeVisible({ timeout: 60_000 });
    }
    let inPage = 0, scrolled = 0;
    for (let i = 0; i < 80; i++) {
      await page.keyboard.press("Tab");
      const f = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return null;
        // the strip's own squares, the header's own controls and the operator glyph are fixed: not page content
        if (el.closest(".fr-ws-strip, .fr-shell-header, [data-fr-operator-switch]")) return { fixed: true };
        const r = el.getBoundingClientRect();
        const strip = document.querySelector("[data-testid='workspace-strip']")!.getBoundingClientRect();
        const header = document.querySelector(".fr-shell-header")!.getBoundingClientRect();
        return {
          fixed: false, tag: el.tagName, text: (el.textContent ?? "").trim().slice(0, 40),
          top: Math.round(r.top), bottom: Math.round(r.bottom), stripTop: Math.round(strip.top), headerBottom: Math.round(header.bottom),
          scrollY: Math.round(window.scrollY),
        };
      });
      if (!f || f.fixed) continue;
      inPage += 1;
      scrolled = Math.max(scrolled, f.scrollY!);
      expect(f.bottom!, `/${seg}: under the strip — ${JSON.stringify(f)}`).toBeLessThanOrEqual(f.stripTop!);
      expect(f.top!, `/${seg}: under the header — ${JSON.stringify(f)}`).toBeGreaterThanOrEqual(f.headerBottom!);
    }
    expect(inPage, `/${seg}: no page control took focus`).toBeGreaterThan(0);
    expect(scrolled, `/${seg}: focus never made the page scroll, so nothing was tested`).toBeGreaterThan(0);
  }
});
