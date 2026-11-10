// ── DIAGNOSE SLICE 1 — THE LAYOUT LAWS (f)–(j), signed Nov 7 2026 ───────────────────────────────
//
// WHY THESE EXIST. The string and render tests passed over a build whose layout had drifted from
// docs/diagnose-slice1-spec.md: the page root was a block rather than a full-height column, so the
// bar floated mid-page and the home strip was cut off at the fold; the futures cone was drawn but
// invisible and shrinkable; the Before cards were bare text. None of that is reachable from jsdom —
// it is all box geometry — so it is pinned here, in a real browser, at a real viewport.
//
// Every assertion below is a measurement, never a screenshot comparison: a number a future change
// either still satisfies or does not.
import { expect, test, type Page } from "playwright/test";
import { COMPANY_ID } from "../../playwright.config";

/** The clean company — every store empty but the few Wasabi actually has. The slice's honest
 *  empty states are only honest if they are exercised on a company that has nothing. */
const CLEAN_COMPANY_ID = process.env.FR_CLEAN_COMPANY_ID || "7d4d0202-9573-43e1-ad60-64948720ed7f";

const COMPANIES: Array<[string, string]> = [["edgewood", COMPANY_ID], ["clean", CLEAN_COMPANY_ID]];
/** The signed screen ids. There is no W3. */
const SCREENS = ["send", "welcome", "w1", "w2", "w4", "w5", "w6", "w7", "w8", "w9", "home"] as const;
/** The eight gather screens — the ones that carry the walk chrome's composer. */
const WALK = ["w1", "w2", "w4", "w5", "w6", "w7", "w8", "w9"] as const;

async function openDiagnose(page: Page, companyId: string, screen: string) {
  await page.addInitScript((id) => {
    try { localStorage.setItem("active_company_id", id); } catch { /* no storage */ }
  }, companyId);
  await page.goto(`/preview/client-refine/diagnose/${companyId}/${screen}`, {
    waitUntil: "networkidle", timeout: 120_000,
  });
  await expect(page.locator("[data-dg-screen]")).toBeVisible({ timeout: 60_000 });
}

const box = (page: Page, sel: string) => page.locator(sel).first().boundingBox();

/** The strip opens centred on Today, so anything in the Ahead zone is off-screen until it is
 *  scrolled to. `end` puts the cone's MOUTH in view — where the rings and the band's end are. */
async function scrollToAhead(page: Page, where: "start" | "end" = "end") {
  await page.evaluate((w) => {
    const strip = document.querySelector(".dg-strip") as HTMLElement;
    const el = document.querySelector('[data-dg-section="ahead"]') as HTMLElement;
    strip.scrollLeft = w === "end" ? strip.scrollWidth : el.offsetLeft;
  }, where);
  await page.waitForTimeout(250);
}

// ── (f) nothing is wider than the page ─────────────────────────────────────────────────────────
//
// The 1500px Ahead section lives inside the strip, which scrolls horizontally on purpose; the
// DOCUMENT must never scroll. 1456 is in here because that is the width the drift was caught at.
const OVERFLOW_CASES: Array<[string, string, number]> = [
  ...COMPANIES.map(([slug, id]) => [slug, id, 1440] as [string, string, number]),
  ["edgewood", COMPANY_ID, 1456],
];
for (const [slug, id, width] of OVERFLOW_CASES) {
  {
    test(`(f) ${slug} @${width}: no screen scrolls the document sideways`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      for (const screen of SCREENS) {
        await openDiagnose(page, id, screen);
        const m = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
          // the header's own buttons must be reachable, not pushed past the edge
          navRight: Math.round(
            (document.querySelector(".dg-header-right, .dg-nav") as HTMLElement).getBoundingClientRect().right,
          ),
        }));
        expect(m.scrollWidth, `${screen} overflows horizontally`).toBe(m.clientWidth);
        expect(m.navRight, `${screen} pushes its header controls off the edge`).toBeLessThanOrEqual(width);
      }
    });
  }
}

// ── (g) the bottom bar, on every walk screen ───────────────────────────────────────────────────
for (const [slug, id] of COMPANIES) {
  test(`(g) ${slug}: every walk screen carries one composer bar that ends at the viewport's bottom`, async ({ page }) => {
    for (const screen of WALK) {
      await openDiagnose(page, id, screen);
      await expect(page.locator("footer.dg-bottom"), screen).toHaveCount(1);
      // the three things the bar must hold
      await expect(page.locator("footer.dg-bottom .dg-composer-input"), screen).toHaveCount(1);
      await expect(page.locator("footer.dg-bottom .dg-noneyet"), screen).toHaveCount(1);
      await expect(page.locator("footer.dg-bottom [data-dg-score]"), screen).toHaveCount(1);

      // the score block runs to the page edge, full bar height
      const vw = page.viewportSize()!.width;
      const bar = (await box(page, "footer.dg-bottom"))!;
      const score = (await box(page, "footer.dg-bottom [data-dg-score]"))!;
      expect(Math.round(score.x + score.width), `${screen} score block stops short of the edge`).toBe(vw);
      expect(Math.round(score.height), `${screen} score block is not full bar height`)
        .toBeGreaterThanOrEqual(Math.round(bar.height) - 2);

      for (const where of ["first paint", "scrolled to the end"]) {
        if (where !== "first paint") {
          await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
          await page.waitForTimeout(150);
        }
        const b = (await box(page, "footer.dg-bottom"))!;
        const vh = page.viewportSize()!.height;
        expect(Math.round(b.y + b.height), `${screen} bar is not on the bottom edge (${where})`).toBe(vh);
      }
    }
  });
}

test("(g) Send and Welcome carry their own signed bar, not the composer", async ({ page }) => {
  await openDiagnose(page, COMPANY_ID, "send");
  await expect(page.locator("footer.dg-bottom [data-dg-score]")).toHaveCount(1);
  await expect(page.locator("footer.dg-bottom .dg-composer-input")).toHaveCount(0);

  await openDiagnose(page, COMPANY_ID, "welcome");
  await expect(page.locator("footer.dg-bottom [data-dg-score]")).toHaveCount(1);
  await expect(page.locator("footer.dg-bottom .dg-composer-input")).toHaveCount(0);
  await expect(page.locator("footer.dg-bottom .dg-ghost")).toHaveCount(1);
});

// ── (h) the home is one viewport tall, and the strip owns the slack ────────────────────────────
for (const [slug, id] of COMPANIES) {
  test(`(h) ${slug}: the map strip is at least 560 tall and the bar lands on the bottom at first paint`, async ({ page }) => {
    await openDiagnose(page, id, "home");
    const vh = page.viewportSize()!.height;
    const strip = (await box(page, ".dg-strip"))!;
    expect(Math.round(strip.height), "the strip is shorter than the spec's floor").toBeGreaterThanOrEqual(560);
    const bar = (await box(page, "footer.dg-bottom"))!;
    expect(Math.round(bar.y + bar.height), "the bar floats above the viewport's bottom").toBe(vh);
  });
}

// THE HOME FITS THE TALL VIEWPORT IN ONE PAGE. The port's strip grows to what its tallest section
// needs rather than clipping it the way the handoff's `overflow-hidden` home does, so at 900 the
// page scrolls — by design, with the bar pinned. 1332 is the height the whole map is read at, and
// there it must fit exactly: one viewport, no vertical scroll, nothing cut.
for (const [slug, id] of COMPANIES) {
  test(`(h) ${slug} @1440x1332: the whole map fits one viewport`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1332 });
    await openDiagnose(page, id, "home");
    const doc = await page.evaluate(() => ({
      h: document.documentElement.scrollHeight, c: document.documentElement.clientHeight,
    }));
    expect(doc.h, "the home does not fit the tall viewport").toBe(doc.c);
    const bar = (await box(page, "footer.dg-bottom"))!;
    expect(Math.round(bar.y + bar.height), "the bar floats above the viewport's bottom").toBe(1332);
  });
}

// ── (h2) THE STRIP'S FLOOR IS TALL ENOUGH FOR ITS TALLEST SECTION ──────────────────────────────
//
// At 1440x900 the strip is the flex row's leftover (611) and hides a floor that is too low. This
// runs SHORT, where the floor is what you get, because that is where the Today card's CTA was
// found cut off by the strip's bottom edge. Nothing inside the strip may be clipped by it at any
// height — the page may scroll, the content may not be cut.
for (const [slug, id] of COMPANIES) {
  for (const [w, h] of [[1456, 820], [1280, 720]] as Array<[number, number]>) {
    test(`(h2) ${slug} @${w}x${h}: the strip clips nothing it holds`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      await openDiagnose(page, id, "home");
      const r = await page.evaluate(() => {
        const st = document.querySelector(".dg-strip")!.getBoundingClientRect();
        const over = (sel: string) =>
          [...document.querySelectorAll(sel)]
            .map((e) => Math.round(Math.max(0, e.getBoundingClientRect().bottom - st.bottom)))
            .reduce((a, b) => Math.max(a, b), 0);
        return {
          strip: Math.round(st.height),
          card: over(".dg-card"), inset: over(".dg-inset"),
          cone: over(".dg-cone-box"), timeline: over(".dg-timeline"),
          // N8 moved both legends into swatch rows; O2 replaced the end dots with a band
          legend: over(".dg-cone-legend, .dg-focus-legend"),
          tags: over(".dg-cone-band, .dg-cone-end"), focus: over(".dg-focus-row"),
        };
      });
      expect(r.strip, "the strip fell below the spec's floor").toBeGreaterThanOrEqual(560);
      expect(r.card, "the Today card is cut off by the strip").toBe(0);
      expect(r.inset, "the Today panel is cut off by the strip").toBe(0);
      expect(r.cone, "the cone is cut off by the strip").toBe(0);
      expect(r.timeline, "the Before timeline is cut off by the strip").toBe(0);
      expect(r.legend, "a section's legend is cut off by the strip").toBe(0);
      expect(r.tags, "a route's stroke is cut off by the strip").toBe(0);
      expect(r.focus, "an In focus row is cut off by the strip").toBe(0);
      // the bar stays on the bottom edge even though the page now scrolls
      const bar = (await box(page, "footer.dg-bottom"))!;
      expect(Math.round(bar.y + bar.height), "the bar left the viewport's bottom").toBe(h);
    });
  }
}

// ── (i) nothing in the cone is clipped, and N4's strokes end INSIDE their zone's ring ─────────
for (const [slug, id] of COMPANIES) {
  test(`(i) ${slug}: every ellipse, the goal marker and every stroke sit inside the Ahead section`, async ({ page }) => {
    await openDiagnose(page, id, "home");
    await scrollToAhead(page, "start");

    const r = await page.evaluate(() => {
      const sec = document.querySelector('[data-dg-section="ahead"]')!.getBoundingClientRect();
      const inside = (b: DOMRect) =>
        b.left >= sec.left - 0.5 && b.right <= sec.right + 0.5 && b.top >= sec.top - 0.5 && b.bottom <= sec.bottom + 0.5;
      const rects = (sel: string) => [...document.querySelectorAll(sel)].map((e) => e.getBoundingClientRect());
      const strokes = rects(".dg-cone-band, .dg-cone-end");
      const goal = document.querySelector("[data-dg-goal]")!.getBoundingClientRect();
      return {
        ellipses: rects(".dg-cone-ell").length,
        ellipsesOutside: rects(".dg-cone-ell").filter((b) => !inside(b)).length,
        goalOutside: rects("[data-dg-goal]").filter((b) => !inside(b)).length,
        goalCount: rects("[data-dg-goal]").length,
        axis: rects(".dg-cone-axis").length,
        verticals: rects(".dg-cone-vert").length,
        ghosts: rects(".dg-cone-ghost").length,
        // M3: no name tag exists any more — a route's name lives on the rollover card
        pills: rects(".dg-cone-pill").length,
        strokes: strokes.length,
        strokesOutside: strokes.filter((b) => !inside(b)).length,
        // THE GOAL IS EMPTY (spec). Drawn in SVG, so this is geometry rather than containment:
        // nothing a route draws may overlap the marker before a goal is chosen.
        strokesInGoal: strokes.filter((b) =>
          b.right > goal.left && b.left < goal.right && b.bottom > goal.top && b.top < goal.bottom).length,
        // N4 — each zone's strokes end inside THAT zone's ring, not merely inside the cone
        mouthsOutsideTheirRing: (() => {
          let bad = 0;
          for (const key of ["possible", "plausible", "probable"]) {
            const ring = document.querySelector(`[data-dg-ell="${key}"]`)!.getBoundingClientRect();
            for (const e of document.querySelectorAll(`[data-dg-band="${key}"] .dg-cone-band`)) {
              const b = e.getBoundingClientRect();
              if (b.right < ring.left - 0.5 || b.right > ring.right + 0.5) bad += 1;
              if (b.top < ring.top - 0.5 || b.bottom > ring.bottom + 0.5) bad += 1;
            }
          }
          return bad;
        })(),
        wedge: rects(".dg-cone-wedge").length,
        ellLabels: rects(".dg-cone-ell-label").length,
        goalLabel: rects("[data-dg-goal-label]").length,
        probableEmpty: rects("[data-dg-probable-empty]").length,
      };
    });

    expect(r.ellipses, "the three nested ellipses").toBe(3);
    expect(r.ellipsesOutside, "an ellipse is clipped by the strip").toBe(0);
    expect(r.goalCount, "the goal marker").toBe(1);
    expect(r.goalOutside, "the goal marker is clipped by the strip").toBe(0);
    expect(r.axis, "the axis from Today").toBe(1);
    expect(r.verticals, "the Focus and Flow verticals").toBe(2);
    expect(r.ghosts, "the three ghost lines").toBe(3);
    expect(r.pills, "M3: a route name is drawn on the map at rest").toBe(0);
    expect(r.strokes, "the cone draws nothing for the routes").toBeGreaterThan(0);
    expect(r.strokesOutside, "a route's stroke is clipped by the strip").toBe(0);
    expect(r.strokesInGoal, "a route reaches into the goal before a goal is chosen").toBe(0);
    expect(r.mouthsOutsideTheirRing, "N4: a zone's band does not end inside its own ring").toBe(0);
    expect(r.wedge, "R5: a wedge to the goal is drawn while no goal is chosen").toBe(0);
    expect(r.ellLabels, "a label for each of the three rings").toBe(3);
    expect(r.goalLabel, "the goal marker's own label").toBe(1);
    expect(r.probableEmpty, "N1: Probable does not say what it is waiting for").toBe(1);
  });
}

// ── (j) the Before timeline is cards on an axis, not bare text ─────────────────────────────────
test("(j) Before: one card per event, each with a stem and a ring on the axis", async ({ page }) => {
  await openDiagnose(page, COMPANY_ID, "home");
  const r = await page.evaluate(() => {
    // the axis is the rendered hairline, not the block's midpoint: the handoff puts it at 170 of
    // a 330px block, which is deliberately not the centre
    const ax = document.querySelector(".dg-tl-axis")!.getBoundingClientRect();
    const axis = ax.top + ax.height / 2;
    const points = [...document.querySelectorAll(".dg-tl-point")];
    return {
      points: points.length,
      cards: document.querySelectorAll(".dg-tl-card").length,
      stems: document.querySelectorAll(".dg-tl-stem").length,
      rings: document.querySelectorAll(".dg-tl-ring").length,
      offAxis: points.filter((p) => {
        const b = p.querySelector(".dg-tl-ring")!.getBoundingClientRect();
        return Math.abs(b.top + b.height / 2 - axis) > 1;
      }).length,
      crossing: points.filter((p) => {
        const c = p.querySelector(".dg-tl-card")!.getBoundingClientRect();
        return c.top < axis && c.bottom > axis;
      }).length,
      sides: new Set(points.map((p) => (p as HTMLElement).dataset.side)).size,
      boxed: points.filter((p) => {
        const s = getComputedStyle(p.querySelector(".dg-tl-card") as HTMLElement);
        return s.borderTopWidth !== "0px" && s.backgroundColor !== "rgba(0, 0, 0, 0)";
      }).length,
      ringPx: Math.round((points[0].querySelector(".dg-tl-ring") as HTMLElement).getBoundingClientRect().height),
      cardPx: Math.round((points[0].querySelector(".dg-tl-card") as HTMLElement).getBoundingClientRect().width),
    };
  });
  expect(r.points, "Edgewood has a First Read date and an uploads date").toBe(2);
  expect(r.cards).toBe(r.points);
  expect(r.stems).toBe(r.points);
  expect(r.rings).toBe(r.points);
  expect(r.offAxis, "a ring is off the axis").toBe(0);
  expect(r.crossing, "a card lies across the axis").toBe(0);
  expect(r.sides, "the cards alternate above and below").toBe(2);
  expect(r.boxed, "a card is bare text rather than a box").toBe(r.points);
  expect(r.ringPx).toBe(18);
  expect(r.cardPx, "the handoff's timeline card is 190 wide").toBe(190);
});

// ── the item index is zero-padded wherever a row is numbered ───────────────────────────────────
test("every item index is zero-padded", async ({ page }) => {
  // N3 took W7's rows away (it renders its signed empty state), so it is no longer a fixture here.
  for (const screen of ["send", "w1", "w2", "w6"]) {
    await openDiagnose(page, COMPANY_ID, screen);
    const idx = await page.locator(".dg-row-index").allTextContents();
    expect(idx.length, `${screen} renders no numbered row`).toBeGreaterThan(0);
    for (const t of idx) expect(t, `${screen} index "${t}" is not zero-padded`).toMatch(/^\d{2,}$/);
  }
});

// ── the shape law: only dots, rings and the cone's ellipses are round ──────────────────────────
test("square corners everywhere but the dots, the rings and the cone's ellipses", async ({ page }) => {
  for (const screen of ["w6", "home"]) {
    await openDiagnose(page, COMPANY_ID, screen);
    const round = await page.evaluate(() => {
      // N1 TOOK dg-cone-goal OFF THIS LIST: the goal is an amber square marker now, so a future
      // change back to a round goal is caught here rather than waved through.
      const allowed = ["dg-dot", "dg-ring", "dg-ring96", "dg-tl-ring", "dg-outcome-ring", "dg-cone-ell"];
      return [...document.querySelectorAll(".dg-page *")]
        .filter((e) => {
          const r = getComputedStyle(e).borderTopLeftRadius;
          if (r === "0px") return false;
          if (allowed.some((c) => e.classList.contains(c))) return false;
          // the cone legend's ring swatch IS a ring, drawn small
          return !(e.classList.contains("dg-swatch") && e.getAttribute("data-kind") === "ring");
        })
        .map((e) => `${e.tagName.toLowerCase()}.${[...e.classList].join(".")}`);
    });
    expect(round, `${screen} rounds a corner the shape law keeps square`).toEqual([]);
  }
});

// ── (k) THE LOVABLE GEOMETRY, IN PIXELS ────────────────────────────────────────────────────────
//
// Every number below is read off docs/lovable-reference/mojomap-diagnose/src/. The string and count
// tests passed twice over a build whose LAYOUT had drifted, so the port is pinned the only way a
// layout can be: as measurements a future change either still satisfies or does not.
//
//   routes/index.tsx          canvas dot grid 28px · Today 1120 · the inset's 560/1fr grid, gap 80,
//                             padding 40/40/64 · the scrubber · the segmented group's 40px buttons
//   CardStack.tsx             520x470 · p-7 · gap-4 · pager top right · CTA bottom left · ‹ › bottom
//                             right · 14px/1.6°/0.97 per step · 500ms
//   FutureCone.tsx            AX 80 · EX 1760 · the four rings' rx/ry · the wedge
const INK = "rgb(36, 35, 35)";
const AMBER = "rgb(246, 175, 60)";
const DOT = "rgb(156, 190, 111)";
const TINTS = ["rgb(227, 237, 211)", "rgb(251, 227, 184)", "rgb(219, 228, 242)"];

for (const [slug, id] of COMPANIES) {
  test(`(k1) ${slug}: the Today panel fills the strip, content centred, on the 28px grid`, async ({ page }) => {
    await openDiagnose(page, id, "home");
    const r = await page.evaluate(() => {
      const rect = (s: string) => document.querySelector(s)!.getBoundingClientRect();
      const cs = (s: string) => getComputedStyle(document.querySelector(s) as HTMLElement);
      const inset = rect(".dg-inset");
      const panels = [...document.querySelectorAll(".dg-inset > .dg-panel")].map((e) => e.getBoundingClientRect());
      const i = cs(".dg-inset");
      return {
        strip: Math.round(rect(".dg-strip").height),
        band: Math.round(rect(".dg-sec--today .dg-band").height),
        inset: Math.round(inset.height),
        grid: i.gridTemplateColumns.split(" ")[0],
        gap: i.columnGap,
        pad: `${i.paddingTop} ${i.paddingRight} ${i.paddingBottom}`,
        grid28: cs(".dg-strip").backgroundSize,
        today: Math.round(rect('[data-dg-section="today"]').width),
        before: Math.round(rect('[data-dg-section="before"]').width),
        // the two columns are centred on the inset's CONTENT box, not top-aligned. The handoff's
        // padding is asymmetric (pt-10 pb-16), so the content centre sits 12px above the box's.
        offCentre: (() => {
          const content = (inset.top + parseFloat(i.paddingTop) + inset.bottom - parseFloat(i.paddingBottom)) / 2;
          return panels.map((p) => Math.round(Math.abs((p.top + p.bottom) / 2 - content)));
        })(),
        // N5 — the scrubber is withdrawn: the segmented group is the only control
        scrubber: document.querySelectorAll(".dg-scale, [data-dg-scale], [data-dg-thumb], .dg-scale-label").length,
        // M1 · the navigation sits in the bar, left to right, and the header keeps two links
        bar: [...document.querySelectorAll(".dg-bottom-nav .dg-bar-btn")]
          .map((e) => Math.round(e.getBoundingClientRect().left)),
        barCount: document.querySelectorAll(".dg-bottom-nav .dg-bar-btn").length,
        headerNav: document.querySelectorAll(".dg-header .dg-nav-btn").length,
        headerBar: document.querySelectorAll(".dg-header .dg-bar-btn").length,
        // What changed sits just left of the score, and the score keeps the page edge
        whatChangedRight: Math.round(rect(".dg-whatchanged").right),
        scoreLeft: Math.round(rect("[data-dg-score]").left),
        scoreRight: Math.round(rect("[data-dg-score]").right),
        vw: Math.round(document.documentElement.clientWidth),
        addMenuAtRest: document.querySelectorAll("[data-dg-add-menu]").length,
      };
    });
    expect(r.inset, "the Today panel does not fill its zone").toBe(r.band);
    expect(r.strip - r.inset, "the panel is a fixed box, not the strip's height").toBeLessThanOrEqual(120);
    expect(r.grid, "the handoff's 560px card column").toBe("560px");
    expect(r.gap, "the handoff's gap-20").toBe("80px");
    expect(r.pad, "the handoff's px-10 pt-10 pb-16").toBe("40px 40px 64px");
    expect(r.grid28, "the handoff's 28px dot grid").toBe("28px 28px");
    expect(r.today, "the handoff's TODAY_W").toBe(1120);
    expect(r.before, "the handoff's PAST_W").toBe(760);
    for (const d of r.offCentre) expect(d, "the panel's content is not vertically centred").toBeLessThanOrEqual(1);
    expect(r.scrubber, "N5: the bottom scrubber is back").toBe(0);
    // M1
    expect(r.barCount, "See all · Now · Dojo · + Add").toBe(4);
    expect(r.bar, "the bar's navigation is out of order").toEqual([...r.bar].sort((a, b) => a - b));
    expect(r.headerBar, "a bar button is still in the header").toBe(0);
    expect(r.headerNav, "the header keeps only its two destinations").toBe(2);
    expect(r.whatChangedRight, "What changed is not just left of the score")
      .toBeLessThanOrEqual(r.scoreLeft);
    expect(r.scoreRight, "the score block stops short of the page edge").toBe(r.vw);
    expect(r.addMenuAtRest, "the Add menu is open before anyone asked").toBe(0);
  });

  test(`(k1) ${slug}: the + Add menu opens upward, over the bar`, async ({ page }) => {
    await openDiagnose(page, id, "home");
    await page.locator(".dg-nav-add").click();
    await expect(page.locator("[data-dg-add-menu]")).toHaveCount(1);
    const menu = (await box(page, "[data-dg-add-menu]"))!;
    const btn = (await box(page, ".dg-nav-add"))!;
    expect(Math.round(menu.y + menu.height), "the menu opens downward, off the page")
      .toBeLessThanOrEqual(Math.round(btn.y));
    expect(Math.round(menu.width), "the handoff's w-[340px] menu").toBe(340);
    // its two targets are present and disabled — slice 1 has nowhere to send them
    await expect(page.locator("[data-dg-add-menu] .dg-add-item")).toHaveCount(2);
    expect(await page.locator("[data-dg-add-menu] .dg-add-item").first().isDisabled()).toBe(true);
    // and the whole menu is inside the viewport, which is the point of opening upward
    expect(menu.y, "the menu opens off the top of the page").toBeGreaterThanOrEqual(0);
  });

  test(`(k2) ${slug}: the card stack is the handoff's — 520x470, pager and ‹ › inside the card`, async ({ page }, testInfo) => {
    await openDiagnose(page, id, "home");
    const r = await page.evaluate(() => {
      const stack = document.querySelector(".dg-cardstack")!.getBoundingClientRect();
      const cards = [...document.querySelectorAll(".dg-card")] as HTMLElement[];
      const front = cards.find((c) => c.dataset.dgPos === "0")!;
      const fb = front.getBoundingClientRect();
      const inside = (e: Element | null) => {
        if (!e) return "missing";
        const b = e.getBoundingClientRect();
        return b.left >= fb.left - 0.5 && b.right <= fb.right + 0.5
            && b.top >= fb.top - 0.5 && b.bottom <= fb.bottom + 0.5 ? "in" : "out";
      };
      const cta = front.querySelector(".dg-card-cta")!.getBoundingClientRect();
      const btns = [...front.querySelectorAll(".dg-pager-btn")];
      const cs = getComputedStyle(front);
      return {
        stack: { w: Math.round(stack.width), h: Math.round(stack.height) },
        card: { w: Math.round(fb.width), h: Math.round(fb.height) },
        pad: cs.padding, gap: cs.rowGap, slide: cs.transitionDuration,
        pager: inside(front.querySelector(".dg-card-pager")),
        arrows: btns.map(inside),
        arrowCount: btns.length,
        ctaIn: inside(front.querySelector(".dg-card-cta")),
        // the CTA sits bottom LEFT, the arrows bottom RIGHT, both on the card's own padding
        ctaLeft: Math.round(cta.left - fb.left),
        arrowsRight: Math.round(fb.right - btns[btns.length - 1].getBoundingClientRect().right),
        arrowSize: Math.round(btns[0].getBoundingClientRect().width),
        // the back cards are offset and tinted, not hidden behind the front one
        offsets: cards.map((c) => c.style.transform === "" ? "none" : c.style.transform.slice(0, 20)),
        tones: cards.map((c) => getComputedStyle(c).backgroundColor),
        cards: cards.length,
      };
    });
    expect(r.stack, "the handoff's CardStack box").toEqual({ w: 520, h: 470 });
    expect(r.card, "a card fills the stack").toEqual({ w: 520, h: 470 });
    expect(r.pad, "the handoff's p-7").toBe("28px");
    expect(r.gap, "the handoff's gap-4").toBe("16px");
    // the reduced project asks for prefers-reduced-motion, and the slice honours it by killing
    // every transition — so the handoff's 500ms slide is only a claim where motion is allowed
    if (testInfo.project.name === "motion") {
      expect(r.slide, "the handoff's 500ms slide").toContain("0.5s");
    } else {
      expect(r.slide, "reduced motion must switch the slide off, not shorten it").toBe("0s");
    }
    expect(r.pager, "the pager is not inside the card").toBe("in");
    expect(r.arrowCount, "the ‹ › pair").toBe(2);
    for (const a of r.arrows) expect(a, "a ‹ › button is not inside the card").toBe("in");
    expect(r.ctaIn, "the CTA is not inside the card").toBe("in");
    // 29 = the handoff's p-7 plus the card's own 1px hairline
    expect(r.ctaLeft, "the CTA is not on the card's left padding").toBe(29);
    expect(r.arrowsRight, "the ‹ › pair is not on the card's right padding").toBe(29);
    expect(r.arrowSize, "the handoff's h-11 w-11 buttons").toBe(44);
    expect(new Set(r.offsets).size, "every card carries the same transform — the stack is flat")
      .toBe(r.cards);
    for (const t of r.tones) expect(TINTS, `a card is not tinted from the handoff's --tone-* set: ${t}`).toContain(t);
    expect(new Set(r.tones).size, "two cards share a tint").toBe(r.cards);
  });

  test(`(k3) ${slug}: the base rows carry a track whose fill is computed, never a typed percentage`, async ({ page }) => {
    await openDiagnose(page, id, "home");
    const r = await page.evaluate(() => {
      const rows = [...document.querySelectorAll('[data-dg-card="stands"] .dg-base-row')];
      return {
        rows: rows.length,
        tracks: rows.filter((x) => x.querySelector(".dg-base-track")).length,
        states: rows.filter((x) => (x.querySelector(".dg-base-state")?.textContent || "").trim().length > 0).length,
        // A part has two sides on the map, so the only fills it can produce are none, one and
        // both. Read the width the component ASKED for, not the pixels it got: a track 150.33px
        // wide renders a half as 0.49 of itself, and the law is about the number, not the rounding.
        widths: rows.map((x) => (x.querySelector(".dg-base-fill") as HTMLElement).style.width),
      };
    });
    expect(r.rows, "one row per base part").toBe(4);
    expect(r.tracks, "a row without a track").toBe(4);
    expect(r.states, "a row without its state").toBe(4);
    for (const w of r.widths) {
      expect(["0%", "50%", "100%"], `a base track is filled to ${w} — not a fraction of the part's two sides`)
        .toContain(w);
    }
  });

  test(`(k4) ${slug}: In focus is the handoff's row at the brief's measures`, async ({ page }) => {
    await openDiagnose(page, id, "home");
    const r = await page.evaluate(() => {
      const cs = (s: string) => getComputedStyle(document.querySelector(s) as HTMLElement);
      const chip = document.querySelector('.dg-focus-row[data-state="needs"] .dg-chip');
      return {
        pad: cs(".dg-focus-row").padding,
        title: cs(".dg-focus-label").fontSize,
        sub: cs(".dg-focus-notes").fontSize,
        gap: cs(".dg-focus-list").rowGap,
        rows: document.querySelectorAll(".dg-focus-row").length,
        dashed: getComputedStyle(document.querySelector('.dg-focus-row[data-state="notyet"]') as HTMLElement).borderTopStyle,
        chipBg: chip ? getComputedStyle(chip).backgroundColor : null,
      };
    });
    expect(r.pad, "the brief's 24px row padding").toBe("24px");
    expect(r.title, "the brief's 20px title").toBe("20px");
    expect(r.sub, "the brief's 16px sub").toBe("16px");
    expect(r.gap, "the brief's 16px gap").toBe("16px");
    expect(r.rows, "the five In focus rows").toBe(5);
    expect(r.dashed, "the not-yet row is not dashed").toBe("dashed");
    if (r.chipBg !== null) expect(r.chipBg, "the NEEDS chip is not dark").toBe(INK);
  });

  test(`(k5) ${slug}: the cone is the handoff's coordinate space, unscaled`, async ({ page }) => {
    await openDiagnose(page, id, "home");
    const r = await page.evaluate(() => {
      const at = (s: string, a: string) => document.querySelector(s)?.getAttribute(a) ?? null;
      const n = (s: string) => document.querySelectorAll(s).length;
      return {
        // the four rings, at the handoff's BASE radii, all centred on its EX
        possible: [at('[data-dg-ell="possible"]', "cx"), at('[data-dg-ell="possible"]', "rx"), at('[data-dg-ell="possible"]', "ry")],
        plausible: [at('[data-dg-ell="plausible"]', "cx"), at('[data-dg-ell="plausible"]', "rx"), at('[data-dg-ell="plausible"]', "ry")],
        probable: [at('[data-dg-ell="probable"]', "cx"), at('[data-dg-ell="probable"]', "rx"), at('[data-dg-ell="probable"]', "ry")],
        // N1 — the goal is a 16px amber SQUARE at the handoff's goal-ring centre, not a ring
        goal: [at("[data-dg-goal]", "x"), at("[data-dg-goal]", "y"), at("[data-dg-goal]", "width"), at("[data-dg-goal]", "height")],
        goalTag: document.querySelector("[data-dg-goal]")!.tagName.toLowerCase(),
        goalFill: getComputedStyle(document.querySelector("[data-dg-goal]") as SVGElement).fill,
        wedge: n(".dg-cone-wedge"), axis: n(".dg-cone-axis"), arrow: n(".dg-cone-arrow"),
        apex: n(".dg-cone-apex"), outlines: n(".dg-cone-outline"),
        box: (() => { const b = document.querySelector(".dg-cone-box")!.getBoundingClientRect();
          return { w: Math.round(b.width), h: Math.round(b.height) }; })(),
      };
    });
    expect(r.possible, "the handoff's possible ring").toEqual(["1760", "64", "250"]);
    expect(r.plausible, "the handoff's plausible ring").toEqual(["1760", "50", "190"]);
    expect(r.probable, "the handoff's probable ring").toEqual(["1760", "18", "44"]);
    expect(r.goalTag, "N1: the goal is still a ring").toBe("rect");
    expect(r.goal, "the goal marker is not the 16px square at the handoff's goal centre")
      .toEqual(["1752", "242", "16", "16"]);
    expect(r.goalFill, "the goal marker is not amber").toBe(AMBER);
    expect(r.wedge, "R5: a wedge to the goal is drawn while no goal is chosen").toBe(0);
    expect(r.axis, "the time axis").toBe(1);
    expect(r.arrow, "the axis arrow").toBe(1);
    expect(r.apex, "the apex, on the time line out of Today").toBe(1);
    // N1 took the goal out of the ring set — it is a marker now, with no cone of its own
    expect(r.outlines, "one outline pair per ZONE ring").toBe(3);
    expect(r.box.h, "the cone's box is the handoff's height").toBe(640);
  });

  // ── N1 · the rings nest, and the zone's NAME is the control its definition hangs off ─────────
  test(`(k5) ${slug}: the zones nest, and a zone's name answers when it is pointed at`, async ({ page }) => {
    await openDiagnose(page, id, "home");
    const r = await page.evaluate(() => {
      const num = (k: string, a: string) => Number(document.querySelector(`[data-dg-ell="${k}"]`)!.getAttribute(a));
      const keys = ["possible", "plausible", "probable"];
      return { rx: keys.map((k) => num(k, "rx")), ry: keys.map((k) => num(k, "ry")) };
    });
    expect(r.rx, "Possible ⊃ Plausible ⊃ Probable (rx)").toEqual([...r.rx].sort((a, b) => b - a));
    expect(r.ry, "Possible ⊃ Plausible ⊃ Probable (ry)").toEqual([...r.ry].sort((a, b) => b - a));
    expect(new Set(r.rx).size, "two rings share a horizontal radius").toBe(3);
    expect(new Set(r.ry).size, "two rings share a vertical radius").toBe(3);

    await expect(page.locator("[data-dg-zone-card]")).toHaveCount(0);
    for (const zone of ["possible", "plausible", "probable"]) {
      await page.locator(`[data-dg-ell-label="${zone}"]`).hover();
      await expect(page.locator(`[data-dg-zone-card="${zone}"]`)).toHaveCount(1);
      const text = (await page.locator(`[data-dg-zone-card="${zone}"]`).innerText()).trim();
      expect(text.length, `${zone} has no definition`).toBeGreaterThan(20);
      expect(await page.locator("[data-dg-zone-card]").count(), "two zone definitions at once").toBe(1);
      // and it sits inside the cone's box, like every other card
      const card = (await box(page, "[data-dg-zone-card]"))!;
      const cone = (await box(page, ".dg-cone-box"))!;
      expect(Math.round(card.x + card.width), `${zone}'s definition runs past the cone`)
        .toBeLessThanOrEqual(Math.round(cone.x + cone.width) + 1);
      expect(Math.round(card.y + card.height), `${zone}'s definition runs below the cone`)
        .toBeLessThanOrEqual(Math.round(cone.y + cone.height) + 1);
    }
    // the name is a keyboard control too, not a hover-only affordance
    await page.locator('[data-dg-ell-label="possible"]').focus();
    await expect(page.locator('[data-dg-zone-card="possible"]')).toHaveCount(1);
  });

  // ── N3 / M2 · every stroke is faint AND DASHED until it is pointed at ────────────────────────
  test(`(k5) ${slug}: a stroke is dashed ink at 45% / 1.25px, and full ink / 2px when pointed at`, async ({ page }) => {
    await openDiagnose(page, id, "home");
    const rest = await page.evaluate(() => {
      const l = document.querySelector(".dg-cone-band, .dg-cone-line") as SVGElement;
      const cs = getComputedStyle(l);
      return { stroke: cs.stroke, opacity: cs.strokeOpacity, width: cs.strokeWidth, dash: cs.strokeDasharray };
    });
    expect(rest.stroke, "a stroke is not ink").toBe(INK);
    expect(rest.opacity, "a stroke is not at 45%").toBe("0.45");
    expect(rest.width, "a stroke is not 1.25px").toBe("1.25px");
    expect(rest.dash, "N3: a generated route idea is not drawn dashed").not.toBe("none");

    await scrollToAhead(page);
    await page.locator("[data-dg-hit]").first().hover();
    await page.waitForTimeout(250);
    const on = await page.evaluate(() => {
      const g = document.querySelector('.dg-cone-lane[data-on="true"]');
      if (!g) return null;
      const cs = getComputedStyle(g.querySelector(".dg-cone-band, .dg-cone-line") as SVGElement);
      return { opacity: cs.strokeOpacity, width: cs.strokeWidth };
    });
    expect(on, "pointing at a stroke does not light it").not.toBeNull();
    expect(on!.opacity, "the pointed-at stroke is not full ink").toBe("1");
    expect(on!.width, "the pointed-at stroke is not 2px").toBe("2px");
  });

  // ── O2 · an undifferentiated zone is ONE BAND, and the band names what it counts ─────────────
  test(`(k5) ${slug}: the zone is one band, not a line per route, and nothing is named at rest`, async ({ page }) => {
    await openDiagnose(page, id, "home");
    const r = await page.evaluate(() => {
      const sec = document.querySelector('[data-dg-section="ahead"]')!;
      // every element in the zone whose OWN text is non-empty — what a reader sees at rest
      const texts: string[] = [];
      for (const e of sec.querySelectorAll("*")) {
        for (const nd of e.childNodes) {
          if (nd.nodeType === 3 && (nd.nodeValue || "").trim().length > 0) {
            texts.push([...e.classList].join("."));
            break;
          }
        }
      }
      const lanes = [...document.querySelectorAll(".dg-cone-lane")] as SVGElement[];
      const band = document.querySelector("[data-dg-band]");
      return {
        texts: texts.sort(),
        cards: document.querySelectorAll(".dg-cone-card").length,
        bands: document.querySelectorAll("[data-dg-band]").length,
        lines: document.querySelectorAll(".dg-cone-line").length,
        label: band?.getAttribute("aria-label") ?? "",
        lanes: lanes.length,
        labelled: lanes.filter((g) => (g.getAttribute("aria-label") || "").length > 0).length,
        tabbable: lanes.filter((g) => g.getAttribute("tabindex") === "0").length,
        // the a11y target: 44px is the floor, and a band is far larger than a dot
        smallHit: [...document.querySelectorAll("[data-dg-hit]")]
          .map((e) => { const b = e.getBoundingClientRect(); return Math.min(b.width, b.height); })
          .filter((d) => d < 44).length,
      };
    });
    // O2 — THE DOOR THAT STAYS SHUT: no route gets its own line while every count is equal.
    expect(r.lines, "a route has its own line while every evidence count is equal").toBe(0);
    expect(r.bands, "the zone's one band").toBe(1);
    // M3 / N8 — THE ONLY TEXT IN THE ZONE AT REST: the zone's own label, the three ring names,
    // Probable's empty note, Focus and Flow, the ghost lane, the goal marker — and five legend
    // swatch labels. No route is named until someone points at one.
    expect(r.texts, "unexpected text is drawn in the Ahead zone at rest").toEqual([
      "dg-cone-ell-label", "dg-cone-ell-label", "dg-cone-ell-label",
      "dg-cone-ell-note", "dg-cone-ghost-label", "dg-cone-goal-label",
      "dg-cone-time-label", "dg-cone-time-label",
      "dg-mono",
      "dg-small", "dg-small", "dg-small", "dg-small", "dg-small",
    ]);
    expect(r.cards, "a rollover card is showing before anyone pointed at anything").toBe(0);
    expect(r.labelled, "a stroke carries no name for a screen reader").toBe(r.lanes);
    expect(r.tabbable, "a stroke is not a tab stop").toBe(r.lanes);
    expect(r.smallHit, "a stroke's hit target is under 44px").toBe(0);

    const n = Number((r.label.match(/^\d+/) ?? ["0"])[0]);
    expect(n, "the band's label carries no count").toBeGreaterThan(0);

    // the card the band opens names exactly the routes it counted, one per line, sorted by title
    await scrollToAhead(page);
    await page.locator("[data-dg-band]").hover();
    await expect(page.locator(".dg-cone-card")).toHaveCount(1);
    const titles = await page.locator(".dg-cone-card .dg-cone-card-row").allInnerTexts();
    expect(titles.length, "the band counts routes its card does not name").toBe(n);
    expect(titles, "the band's card is not sorted by title")
      .toEqual([...titles].sort((a, b) => a.localeCompare(b)));
    const ids = await page
      .locator(".dg-cone-card [data-dg-card-route]")
      .evaluateAll((es) => es.map((e) => e.getAttribute("data-dg-card-route")));
    expect(new Set(ids).size, "the band names one route twice").toBe(n);
  });

  // ── N10 · one card: beside the pointer, following it; at the stroke's end on focus ───────────
  test(`(k5) ${slug}: the card follows the pointer, and anchors to the end on focus`, async ({ page }) => {
    await openDiagnose(page, id, "home");
    await scrollToAhead(page);
    const band = page.locator("[data-dg-band]");
    const bb = (await band.boundingBox())!;
    const cone = (await box(page, ".dg-cone-box"))!;
    const vw = page.viewportSize()!.width;

    /** The band's centre line is inside the band at every x, apex to mouth. */
    const y = bb.y + bb.height / 2;
    const x2 = Math.min(bb.x + bb.width - 24, vw - 24);
    const x1 = x2 - 150;
    const near = (c: { x: number; y: number; width: number; height: number }, p: { x: number; y: number }) =>
      Math.max(0, c.x - p.x, p.x - (c.x + c.width)) <= 40 && Math.max(0, c.y - p.y, p.y - (c.y + c.height)) <= 40;
    const insideCone = (c: { x: number; y: number; width: number; height: number }) =>
      c.x >= cone.x - 1 && c.x + c.width <= cone.x + cone.width + 1 &&
      c.y >= cone.y - 1 && c.y + c.height <= cone.y + cone.height + 1;

    await page.mouse.move(x1, y);
    await expect(page.locator(".dg-cone-card")).toHaveCount(1);
    const c1 = (await box(page, ".dg-cone-card"))!;
    await page.mouse.move(x2, y);
    await page.waitForTimeout(150);
    const c2 = (await box(page, ".dg-cone-card"))!;

    expect(near(c1, { x: x1, y }), "the card is not beside the pointer").toBe(true);
    expect(near(c2, { x: x2, y }), "the card did not follow the pointer").toBe(true);
    expect(Math.abs(c2.x - c1.x) + Math.abs(c2.y - c1.y), "the card did not move with the pointer")
      .toBeGreaterThan(40);
    expect(insideCone(c1), "the card left the cone").toBe(true);
    expect(insideCone(c2), "the card left the cone").toBe(true);

    // ON FOCUS it anchors to the stroke's END, wherever the mouse was left
    await page.mouse.move(cone.x + 4, cone.y + 4);
    await expect(page.locator(".dg-cone-card")).toHaveCount(0);
    await band.focus();
    await expect(page.locator(".dg-cone-card")).toHaveCount(1);
    const cf = (await box(page, ".dg-cone-card"))!;
    expect(near(cf, { x: bb.x + bb.width, y }), "a focused stroke's card is not at its end").toBe(true);
    expect(insideCone(cf), "the focused card left the cone").toBe(true);
  });

  test(`(k6) ${slug}: the zone control is the handoff's segmented group`, async ({ page }) => {
    await openDiagnose(page, id, "home");
    const r = await page.evaluate(() => {
      const btns = [...document.querySelectorAll(".dg-seg-btn")] as HTMLElement[];
      const on = btns.find((b) => b.getAttribute("aria-pressed") === "true")!;
      const g = getComputedStyle(document.querySelector(".dg-seg-group") as HTMLElement);
      const c = getComputedStyle(btns[0]);
      return {
        count: btns.length,
        minH: c.minHeight, padX: `${c.paddingLeft} ${c.paddingRight}`,
        size: c.fontSize,
        groupPad: g.padding, groupGap: g.columnGap,
        activeBg: getComputedStyle(on).backgroundColor,
        pressed: btns.filter((b) => b.getAttribute("aria-pressed") === "true").length,
      };
    });
    expect(r.count, "Before · Today · Ahead").toBe(3);
    expect(r.minH, "the handoff's min-h-10").toBe("40px");
    expect(r.padX, "the handoff's px-5").toBe("20px 20px");
    expect(r.size, "the handoff's text-[14px]").toBe("14px");
    expect(r.groupPad, "the handoff's p-1").toBe("4px");
    expect(r.groupGap, "the handoff's gap-1").toBe("4px");
    expect(r.pressed, "exactly one zone is active").toBe(1);
    expect(r.activeBg, "the handoff's active button is dark ink").toBe(INK);
  });
}

// ── O3 / N6 · THE SEE ALL OVERLAY ──────────────────────────────────────────────────────────────
//
// The point of the screen is that a card SAYS WHERE IT STANDS, so a card with no page yet still
// appears and reads its state. What must not happen is a card that looks like a destination and is
// not one: eleven of the thirteen have nowhere to go, so eleven are disabled, unfocusable, and not
// a link.
for (const [slug, id] of COMPANIES) {
  test(`(k7) ${slug}: See all opens the overlay, and only the two cards with a destination work`, async ({ page }) => {
    await openDiagnose(page, id, "home");
    await expect(page.locator("[data-dg-seeall]")).toHaveCount(0);
    await page.locator("[data-dg-seeall-open]").click();
    await expect(page.locator("[data-dg-seeall]")).toHaveCount(1);

    const r = await page.evaluate(() => {
      const cards = [...document.querySelectorAll("[data-dg-seeall-card]")] as HTMLButtonElement[];
      const ov = document.querySelector("[data-dg-seeall]") as HTMLElement;
      const cs = (s: string) => getComputedStyle(document.querySelector(s) as HTMLElement);
      const plain = cs('[data-dg-seeall-card="voices"]');
      const cur = cs('[data-dg-seeall-card="today"]');
      return {
        groups: document.querySelectorAll("[data-dg-seeall-group]").length,
        // R1 — four equal columns at gap 36, each a stack with 18px between its cards
        colWidths: [...document.querySelectorAll(".dg-seeall-col")]
          .map((e) => Math.round(e.getBoundingClientRect().width)),
        // FOUR columns means four ACROSS: equal widths alone would pass a 2x2 wrap
        colTops: [...document.querySelectorAll(".dg-seeall-col")]
          .map((e) => Math.round(e.getBoundingClientRect().top)),
        colGap: cs(".dg-seeall-cols").columnGap,
        cardGap: cs(".dg-seeall-col").rowGap,
        // R1 — the card's measures, read off a card that is NOT the current one
        cardPad: plain.padding,
        cardTitle: [cs(".dg-seeall-card-t").fontSize, cs(".dg-seeall-card-t").fontWeight],
        cardDesc: cs(".dg-seeall-card-d").fontSize,
        cardState: [cs(".dg-seeall-card-s").fontSize, cs(".dg-seeall-card-s").color,
                    cs(".dg-seeall-card-s").textTransform, cs(".dg-seeall-card-s").fontFamily.includes("mono")],
        groupLabel: [cs(".dg-seeall-group-label").fontSize, cs(".dg-seeall-group-label").borderBottomWidth],
        // R1 — the current card: dot-green 2px and a tinted fill. NOT `current`: the count of
        // current cards already owns that key further down, and the later one wins.
        currentCard: [cur.borderTopWidth, cur.borderTopColor, cur.backgroundColor],
        // the tint is a layer ON the card's fill, so it shows as a background IMAGE the plain
        // cards do not carry
        currentTinted: cur.backgroundImage !== plain.backgroundImage && /156, 190, 111/.test(cur.backgroundImage),
        plainBorder: [plain.borderTopWidth, plain.backgroundColor],
        // R1 — a SCRIM: the page is still there under it
        scrimTranslucent: /rgba\(.*0\.\d+\)/.test(getComputedStyle(ov).backgroundColor),
        // R1 — it fits 1440x900 with no scroll
        scrolls: ov.scrollHeight > ov.clientHeight,
        pageBehind: document.querySelector('[data-dg-screen="home"] .dg-strip') !== null,
        cards: cards.length,
        enabled: cards.filter((c) => !c.disabled).length,
        anchors: ov.querySelectorAll("a").length,
        statesEmpty: cards.filter((c) => (c.querySelector(".dg-seeall-card-s")?.textContent ?? "").trim() === "").length,
        current: document.querySelectorAll('[data-dg-seeall-card][data-current="true"]').length,
        title: (ov.querySelector(".dg-seeall-title")?.textContent ?? "").trim().length,
        round: [...ov.querySelectorAll("*")].filter((e) => getComputedStyle(e).borderTopLeftRadius !== "0px").length,
        // it covers the page it was opened from
        covers: (() => { const b = ov.getBoundingClientRect();
          return b.width === document.documentElement.clientWidth && b.height === document.documentElement.clientHeight; })(),
      };
    });
    expect(r.groups, "R2: the four columns").toBe(4);
    expect(new Set(r.colWidths).size, "the columns are not equal width").toBe(1);
    expect(new Set(r.colTops).size, "R2: the four columns are not side by side").toBe(1);
    expect(r.colGap, "R1: the 36px column gap").toBe("36px");
    expect(r.cardGap, "R1: 18px between cards").toBe("18px");
    expect(r.cardPad, "R1: ~24px card padding").toBe("24px");
    expect(r.cardTitle, "R1: a 22px bold card title").toEqual(["22px", "700"]);
    expect(r.cardDesc, "R1: a 16px description").toBe("16px");
    expect(r.cardState[0], "R1: a 12px state").toBe("12px");
    expect(r.cardState[1], "R1: the state is not dot green").toBe(DOT);
    expect(r.cardState[2], "R1: the state is not uppercase").toBe("uppercase");
    expect(r.cardState[3], "R1: the state is not mono").toBe(true);
    expect(r.groupLabel[0], "R1: an 11px group label").toBe("11px");
    expect(r.groupLabel[1], "R1: the group label has no hairline under it").toBe("1px");
    expect(r.currentCard[0], "R1: the current card is not 2px").toBe("2px");
    expect(r.currentCard[1], "R1: the current card is not dot green").toBe(DOT);
    expect(r.currentCard[2], "R1: the current card has no fill").not.toBe("rgba(0, 0, 0, 0)");
    expect(r.currentTinted, "R1: the current card carries no dot-green tint").toBe(true);
    expect(r.plainBorder[0], "R1: an ordinary card is not a hairline").toBe("1px");
    // A CARD IS FILLED AND THE SCRIM IS NOT: unfilled cards let the page's own headline read
    // through their text. The page stays visible BETWEEN them, which is what makes it a scrim.
    expect(r.plainBorder[1], "R1: a card is unfilled, so the page reads through its words")
      .not.toBe("rgba(0, 0, 0, 0)");
    expect(r.scrimTranslucent, "R1: the overlay is opaque, not a scrim").toBe(true);
    expect(r.scrolls, "R1: the overlay does not fit 1440x900").toBe(false);
    expect(r.pageBehind, "R1: the page is gone from under the scrim").toBe(true);
    expect(r.cards, "the thirteen cards").toBe(13);
    expect(r.enabled, "only Today and The long map have a destination").toBe(2);
    expect(r.anchors, "a card is rendered as a link").toBe(0);
    expect(r.statesEmpty, "a card shows no state — which is the whole point of the screen").toBe(0);

    expect(r.current, "Today is not marked as where the reader already is").toBe(1);
    expect(r.title, "the overlay has no title").toBeGreaterThan(0);
    expect(r.round, "the overlay rounds a corner the shape law keeps square").toBe(0);
    expect(r.covers, "the overlay does not cover the page").toBe(true);

    // a disabled card cannot take focus
    await page.locator('[data-dg-seeall-card="needs"]').focus();
    expect(
      await page.evaluate(() => document.activeElement?.getAttribute("data-dg-seeall-card") ?? null),
      "a card with nowhere to go took focus",
    ).not.toBe("needs");

    // Escape closes it
    await page.keyboard.press("Escape");
    await expect(page.locator("[data-dg-seeall]")).toHaveCount(0);
    // × closes it
    await page.locator("[data-dg-seeall-open]").click();
    await page.locator("[data-dg-seeall-close]").click();
    await expect(page.locator("[data-dg-seeall]")).toHaveCount(0);
    // and a card WITH a destination closes it and takes the canvas there
    await page.locator("[data-dg-seeall-open]").click();
    await page.locator('[data-dg-seeall-card="long-map"]').click();
    await expect(page.locator("[data-dg-seeall]")).toHaveCount(0);
    await page.waitForTimeout(700);
    expect(
      await page.evaluate(() => Math.round((document.querySelector(".dg-strip") as HTMLElement).scrollLeft)),
      "The long map did not take the canvas to Before",
    ).toBe(0);
  });
}

// ── N3 · W7 claims nothing is underway, because nothing in the data says otherwise ─────────────
for (const [slug, id] of COMPANIES) {
  test(`(k8) ${slug}: W7 lists no generated route and renders its signed empty state`, async ({ page }) => {
    await openDiagnose(page, id, "w7");
    await expect(page.locator('[data-dg-empty="w7"]')).toHaveCount(1);
    expect((await page.locator('[data-dg-empty="w7"]').innerText()).trim().length, "the empty state is blank")
      .toBeGreaterThan(0);
    await expect(page.locator(".dg-walk-right .dg-rows .dg-row"), "W7 still lists generated routes")
      .toHaveCount(0);
  });
}

// ── R5 · NO WEDGE WHILE NO GOAL IS CHOSEN ─────────────────────────────────────────────────────
//
// K5's wedge ran from Today to the goal. With the goal an empty marker it was the one thing on the
// screen claiming something the data does not hold, so it is withdrawn until a goal exists. This is
// the standing proof — the class is gone from the CSS too, so nothing can quietly render one.
for (const [slug, id] of COMPANIES) {
  test(`(k10) ${slug}: no wedge to the goal is drawn while no goal is chosen`, async ({ page }) => {
    await openDiagnose(page, id, "home");
    const r = await page.evaluate(() => ({
      wedges: document.querySelectorAll(".dg-cone-wedge, [data-dg-wedge]").length,
      // the marker itself is still there, and still empty
      goal: document.querySelectorAll("[data-dg-goal]").length,
      goalLabel: document.querySelectorAll("[data-dg-goal-label]").length,
    }));
    expect(r.wedges, "a wedge to an unchosen goal is back").toBe(0);
    expect(r.goal, "the goal marker").toBe(1);
    expect(r.goalLabel, "the goal marker's label").toBe(1);
  });
}

// ── N8 · both legends are swatches ─────────────────────────────────────────────────────────────
test("(k9) the In focus and cone legends are swatches, not sentences about them", async ({ page }) => {
  await openDiagnose(page, COMPANY_ID, "home");
  await expect(page.locator("[data-dg-focus-legend] .dg-swatch"), "In focus: underway · needs · not yet")
    .toHaveCount(3);
  await expect(page.locator("[data-dg-legend] .dg-swatch"), "the cone: the dashed line, the goal marker, three rings")
    .toHaveCount(5);
  const r = await page.evaluate(() => ({
    amber: getComputedStyle(document.querySelector('[data-dg-legend] [data-kind="amber"]') as HTMLElement).backgroundColor,
    dashed: getComputedStyle(document.querySelector('[data-dg-legend] [data-kind="dashed"]') as HTMLElement).borderTopStyle,
    labels: [...document.querySelectorAll("[data-dg-legend] .dg-leg")]
      .filter((e) => (e.textContent ?? "").trim().length === 0).length,
  }));
  expect(r.amber, "the goal's swatch is not amber").toBe(AMBER);
  expect(r.dashed, "the ideas swatch is not a dashed line").toBe("dashed");
  expect(r.labels, "a swatch carries no label").toBe(0);
});

// ── THE BAR PAINTS TO THE VIEWPORT'S BOTTOM EDGE, WITH NO SEAM ─────────────────────────────────
//
// Not a box measurement: a pixel one. The bar's top lands on a fractional pixel whenever the body
// above it does, so its painted box stopped one device row short of the viewport and the last line
// of the list bled through — invisible to every box assertion in this file, and plainly visible in
// a screenshot. This reads the pixels the reviewer would be looking at.
test("the sticky bar leaves no seam at the viewport's bottom", async ({ page }) => {
  await openDiagnose(page, COMPANY_ID, "w2");
  const vh = page.viewportSize()!.height;
  const shot = (await page.screenshot({ clip: { x: 300, y: vh - 6, width: 700, height: 6 } })).toString("base64");
  const ink = await page.evaluate(async (d) => {
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = `data:image/png;base64,${d}`; });
    const c = document.createElement("canvas");
    c.width = img.width; c.height = img.height;
    const g = c.getContext("2d")!;
    g.drawImage(img, 0, 0);
    const px = g.getImageData(0, 0, img.width, img.height).data;
    let dark = 0;
    for (let i = 0; i < px.length; i += 4) if (px[i] < 190 && px[i + 1] < 190) dark++;
    return dark;
  }, shot);
  expect(ink, "page content bleeds through the bar's bottom edge").toBe(0);
});
