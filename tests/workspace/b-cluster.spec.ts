// (b) The cluster is bottom-centre (S:89): three 48px squares, centred on the viewport and clear of the
// operator glyph at bottom-left. SP-679 (2026-11-25): it sits in a fixed strip across the bottom of the
// window — 76px tall, flush with the bottom and both sides — 14px above the bottom edge (it floated
// 20px up before).
import { expect, test } from "playwright/test";
import { openWorkspace } from "./helpers";

test("cluster geometry: bottom-centre, 48px squares, clear of the glyph", async ({ page }) => {
  await openWorkspace(page, "strategy");
  const cluster = page.getByTestId("workspace-cluster");
  const box = await cluster.boundingBox();
  expect(box).not.toBeNull();
  const viewport = page.viewportSize()!;
  expect(Math.abs(box!.x + box!.width / 2 - viewport.width / 2)).toBeLessThanOrEqual(1);
  expect(Math.round(viewport.height - (box!.y + box!.height))).toBe(14);
  // the strip the cluster sits in: full width, 76px, flush with the bottom, and the cluster inside it
  const strip = await page.getByTestId("workspace-strip").boundingBox();
  expect(strip).not.toBeNull();
  expect([Math.round(strip!.x), Math.round(strip!.width), Math.round(strip!.height)]).toEqual([0, viewport.width, 76]);
  expect(Math.round(strip!.y + strip!.height)).toBe(viewport.height);
  expect(box!.y).toBeGreaterThan(strip!.y);
  await expect(page.getByRole("navigation", { name: "Workspace navigation" })).toHaveCount(1);
  const controls = cluster.locator("button");
  await expect(controls).toHaveCount(3);
  const rects = await controls.evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => ({ x: r.x, y: r.y, w: r.width, h: r.height })));
  for (const r of rects) { expect(Math.round(r.w)).toBe(48); expect(Math.round(r.h)).toBe(48); }
  expect(Math.round(rects[1].x - (rects[0].x + rects[0].w))).toBe(12);
  const glyph = await page.locator("[data-fr-operator-switch]").boundingBox();
  expect(glyph).not.toBeNull();
  expect(glyph!.x + glyph!.width).toBeLessThan(box!.x);
});

test("arrows are disabled on the home and Tools pages", async ({ page }) => {
  for (const seg of ["", "inputs", "council"]) {
    await openWorkspace(page, seg);
    await expect(page.locator("[data-fr-arrow='prev']")).toHaveAttribute("aria-disabled", "true");
    await expect(page.locator("[data-fr-arrow='next']")).toHaveAttribute("aria-disabled", "true");
  }
});
