// Stage 3e — beat 12 tag geometry: no UNTESTED tag (its paper backing box) may intersect a ring
// stroke, and no two tags may sit within TAG_NEAR of each other. Pure geometry over the same layout
// the component renders (layoutPairs / ELEMENTS / TODAY_R / tagBox), so a layout change that lets a
// tag drift onto a ring fails here before it reaches the screen.
import { describe, expect, it } from "vitest";
import { ELEMENTS, TAG_NEAR, TODAY_R, allUntestedPairs, layoutPairs, tagBox } from "./BaseAlignment";

const STROKE_HALF = 3; // ring stroke + inner ring tolerance, viewBox units

function rectRingRelation(box: { x: number; y: number; width: number; height: number }, c: { x: number; y: number }, r: number) {
  // Nearest and farthest points of the rect from the ring centre.
  const nx = Math.max(box.x, Math.min(c.x, box.x + box.width));
  const ny = Math.max(box.y, Math.min(c.y, box.y + box.height));
  const near = Math.hypot(nx - c.x, ny - c.y);
  const corners = [
    [box.x, box.y], [box.x + box.width, box.y], [box.x, box.y + box.height], [box.x + box.width, box.y + box.height],
  ];
  const far = Math.max(...corners.map(([x, y]) => Math.hypot(x - c.x, y - c.y)));
  return { near, far };
}

describe("beat 12 — UNTESTED tags never touch a ring stroke", () => {
  const laid = layoutPairs(allUntestedPairs("test"));

  it("lays out all six pairs", () => {
    expect(laid).toHaveLength(6);
  });

  it("every tag box is wholly outside every ring's stroke band", () => {
    for (const { pair, tag } of laid) {
      const box = tagBox("UNTESTED", tag);
      for (const el of ELEMENTS) {
        const { near, far } = rectRingRelation(box, el.today, TODAY_R);
        const straddles = near <= TODAY_R + STROKE_HALF && far >= TODAY_R - STROKE_HALF;
        expect(straddles, `${pair.a}–${pair.b} tag intersects the ${el.key} ring`).toBe(false);
      }
    }
  });

  it("no two tags sit within TAG_NEAR of each other", () => {
    for (let i = 0; i < laid.length; i++) {
      for (let j = i + 1; j < laid.length; j++) {
        const a = laid[i].tag, b = laid[j].tag;
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(TAG_NEAR);
      }
    }
  });
});
