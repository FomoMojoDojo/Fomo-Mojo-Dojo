// ── D1 + the shell-height variable (operator rulings, 2026-10-16) ───────────────────────────────
//
// D1. The First Read header had ONE layout at every width: no media query touched any .fr-shell-*
// rule. At 390px the header's inner box is 342px (390 minus the two 24px pads) while the tick row
// alone is 344px — 6 act ticks at 22px, 11 gate ticks at 12px, 16 gaps at 5px. Because
// `.fr-shell-progress` was `flex: none` it could not shrink: it kept its 344px and ran 10px past the
// viewport edge, `.fr-shell-id` (min-width: 0, overflow visible) was crushed to zero, and
// `.fr-shell-title` (white-space: nowrap) went on painting its 86px of ink — so the dashes drew
// straight through "First read", 54px of overlap. The company name and domain were not hidden by any
// rule and not clipped by the viewport: at zero width the identity's own overflow:hidden suppressed
// them. Below 640px the header now wraps to three rows and the identity gets its own line.
//
// D2. Ten rules across eight selectors subtracted the sticky header from the viewport, each carrying
// the literal number — and the header measures 54px, so every one of them was three pixels wrong.
// They now read --fr-shell-h, which is 54px by default and 93px inside the ≤640px block. The
// min-height on .fr-screen--dark is DELIBERATE and kept: the dark ground fills the screen.
//
// The 93px is a FIXED number, so it holds only while the identity stays on one line. The widest
// identity in the fleet is asserted here for exactly that reason.
import { expect, test, type Page } from "playwright/test";
import { execFileSync } from "node:child_process";

const PGC = "supabase_db_dzlgyxcvuwiulgifbmew";
const psql = (sql: string) => execFileSync("docker", ["exec", "-i", PGC, "psql", "-U", "postgres", "-d", "postgres", "-At", "-q", "-v", "ON_ERROR_STOP=1", "-c", sql], { encoding: "utf8" }).trim().split("\n")[0];

/** Ids by query, never typed: the anchored read company, and the fleet's widest identity string. */
const anchoredCompany = () => psql(`select id from companies where name ilike '%Wasabi%' limit 1`);
const widestIdentity = () => psql(`
  with h as (select id, name, regexp_replace(regexp_replace(coalesce(website,''), '^https?://', ''), '^www\\.', '') as raw from companies),
       j as (select id, name, split_part(raw, '/', 1) as host from h)
  select id from j order by length(name || case when host <> '' then ' · ' || host else '' end) desc limit 1`);

const openRead = async (page: Page, cid: string) => {
  await page.goto(`/preview/client-refine/first-read/${cid}`, { waitUntil: "networkidle", timeout: 180_000 });
  await page.waitForSelector(".first-read", { timeout: 60_000 });
};

/** Everything the two rulings are about, measured off the live DOM in one pass. */
const probe = (page: Page) => page.evaluate(() => {
  const root = document.querySelector(".first-read") as HTMLElement;
  const hdr = document.querySelector(".fr-shell-header") as HTMLElement;
  const id = document.querySelector(".fr-shell-id") as HTMLElement;
  const title = document.querySelector(".fr-shell-title") as HTMLElement;
  const ident = document.querySelector(".fr-shell-identity") as HTMLElement | null;
  const prog = document.querySelector(".fr-shell-progress") as HTMLElement;
  const tb = title.getBoundingClientRect(), pb = prog.getBoundingClientRect();
  // TWO-AXIS intersection. An x-only compare reports a false overlap once the two sit on
  // different rows, which is exactly what the fix does to them below 640px.
  const intersects = !(tb.right <= pb.left || pb.right <= tb.left || tb.bottom <= pb.top || pb.bottom <= tb.top);
  const darks = Array.from(document.querySelectorAll(".fr-screen--dark")) as HTMLElement[];
  return {
    varValue: getComputedStyle(root).getPropertyValue("--fr-shell-h").trim(),
    header: Math.round(hdr.getBoundingClientRect().height),
    idW: Math.round(id.getBoundingClientRect().width),
    identW: ident ? Math.round(ident.getBoundingClientRect().width) : 0,
    identClientW: ident?.clientWidth ?? 0,
    identScrollW: ident?.scrollWidth ?? 0,
    identText: ident?.textContent ?? "",
    identRects: ident ? ident.getClientRects().length : 0,
    titleProgIntersect: intersects,
    progRight: Math.round(pb.right),
    innerWidth: window.innerWidth, innerHeight: window.innerHeight,
    tickCount: document.querySelectorAll(".fr-progress-tick").length,
    tickWidths: [...new Set(Array.from(document.querySelectorAll(".fr-progress-tick")).map((e) => Math.round(e.getBoundingClientRect().width)))].sort((a, b) => a - b),
    // ONE ROW: every tick shares a top edge. The count and the widths were already asserted and both
    // survived the wrap — 17 ticks at the right widths, with the last one on a row of its own — so
    // the row is the fact that has to be named.
    tickTops: [...new Set(Array.from(document.querySelectorAll(".fr-progress-tick")).map((e) => Math.round(e.getBoundingClientRect().top)))],
    segWidth: Math.round((document.querySelector(".fr-shell-segments") as HTMLElement).getBoundingClientRect().width),
    contentBox: (() => { const i = document.querySelector(".fr-shell-header-inner") as HTMLElement; const c = getComputedStyle(i);
      return Math.round(i.getBoundingClientRect().width - parseFloat(c.paddingLeft) - parseFloat(c.paddingRight)); })(),
    darkMinHeights: darks.map((d) => Math.round(parseFloat(getComputedStyle(d).minHeight))),
  };
});

const eyebrowOf = async (p: Page) => {
  const l = p.locator(".fr-eyebrow").first();
  if (await l.count() === 0) return "";
  return ((await l.textContent({ timeout: 2_000 }).catch(() => "")) ?? "").replace(/\s+/g, " ").trim();
};

// ── D1 at 390: no collision, no overflow, the identity shows ────────────────────────────────────

test("(D1) at 390 the dashes never cross the label, on any beat", async ({ page }) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await openRead(page, anchoredCompany());
  for (let i = 0; i < 17; i++) {
    const m = await probe(page);
    expect(m.titleProgIntersect, `beat ${i}: the title and the tick row overlap`).toBe(false);
    expect(m.progRight, `beat ${i}: the tick row runs past the viewport`).toBeLessThanOrEqual(m.innerWidth);
    expect(m.identClientW, `beat ${i}: the identity is suppressed`).toBeGreaterThan(0);
    // the dash geometry is untouched at every width — this is what "keep the design" means here
    expect(m.tickCount, `beat ${i}: tick count`).toBe(17);
    expect(m.tickWidths, `beat ${i}: tick widths`).toEqual([12, 22]);
    // 17 ticks at the standing gap are 344px against a 342px box, so the last one dropped to a row
    // of its own. The gap narrows to 4px below 640px — 6x22 + 11x12 + 16x4 = 328 — and the row is
    // asserted here rather than inferred from the width.
    expect(m.tickTops.length, `beat ${i}: the tick row wrapped onto ${m.tickTops.length} rows`).toBe(1);
    expect(m.segWidth, `beat ${i}: the tick row is wider than the box it sits in`).toBeLessThanOrEqual(m.contentBox);
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(320);
  }
});

test("(D1) at 390 the anchored company's full name AND domain are shown", async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await openRead(page, anchoredCompany());
  const m = await probe(page);
  expect(m.identText).toContain("·");                       // "{company} · {host}"
  expect(m.identScrollW, "the identity is ellipsised, so the domain is cut")
    .toBeLessThanOrEqual(m.identClientW + 1);
  expect(m.idW).toBe(342);                                   // the id takes the full inner width
});

// ── D1 regression at 1440: the look the ruling says must not move ───────────────────────────────

test("(D1 regression) at 1440 the header is byte-identical to the recorded look", async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openRead(page, anchoredCompany());
  const m = await probe(page);
  expect(m.header).toBe(54);
  expect(m.idW).toBe(393);
  expect(m.identW).toBe(295);
  expect(m.titleProgIntersect).toBe(false);
  expect(m.tickCount).toBe(17);
  expect(m.tickWidths).toEqual([12, 22]);
});

// ── D2: the variable IS the header, and the dark ground still fills the screen ──────────────────

for (const [vp, w, h, expected] of [["1440x900", 1440, 900, 54], ["390x844", 390, 844, 93]] as const) {
  test(`(D2) at ${vp} the header measures the variable, and every dark screen fills the rest`, async ({ page }) => {
    test.setTimeout(300_000);
    await page.setViewportSize({ width: w, height: h });
    await openRead(page, anchoredCompany());
    // walk to a beat that HAS a dark screen (the cold open is beat 1)
    let seenDark = 0;
    for (let i = 0; i < 17; i++) {
      const m = await probe(page);
      expect(m.varValue, `${vp}: the variable`).toBe(`${expected}px`);
      expect(m.header, `${vp}: the measured header must equal the variable`).toBe(expected);
      for (const mh of m.darkMinHeights) {
        seenDark++;
        // min-height is KEPT by ruling: the dark ground fills the viewport below the header
        expect(Math.abs(mh - (m.innerHeight - m.header)), `${vp}: dark min-height ${mh} vs ${m.innerHeight - m.header}`).toBeLessThanOrEqual(1);
      }
      await page.keyboard.press("ArrowRight");
      await page.waitForTimeout(320);
    }
    expect(seenDark, "no dark screen was measured").toBeGreaterThan(0);
  });
}

// ── the fixed 93px holds only while the identity stays one line ────────────────────────────────

test("(D1) the fleet's widest identity still fits on one line at 390", async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 390, height: 844 });
  const cid = widestIdentity();
  await openRead(page, cid);
  const m = await probe(page);
  // one line: a wrapped inline element reports more than one client rect
  expect(m.identRects, `"${m.identText}" wrapped onto ${m.identRects} lines`).toBe(1);
  expect(m.header, "a wrapped identity would make the fixed 93px wrong").toBe(93);
  expect(m.varValue).toBe("93px");
});

// ── the :has() scope: the Header's other consumers are untouched ───────────────────────────────
//
// Measured, not assumed: the front door's header is 57px (it has its own padding override) and the
// workspace's is 54px. NEITHER carries a progress tick, so :has(.fr-progress-tick) must never match
// them and the ≤640px block must never reach them. The front door is also the one surface whose
// header is not 54px — and none of the ten rules that read --fr-shell-h renders there, so the
// variable's 54px default is inert on it. The workspace DOES carry .fr-ws-oppaside, and its header
// is 54px, so that rule is now right where the old literal had it three pixels out.
for (const [label, url, headerPx] of [
  ["the front door", "/preview/client-refine", 57],
  ["the workspace", "/preview/client-refine/workspace/opportunities", 54],
] as const) {
  for (const [vp, w, h] of [["1440x900", 1440, 900], ["390x844", 390, 844]] as const) {
    test(`(scope) ${label}'s header is unchanged at ${vp}`, async ({ page }) => {
      test.setTimeout(240_000);
      await page.setViewportSize({ width: w, height: h });
      await page.goto(url, { waitUntil: "networkidle", timeout: 180_000 });
      await page.waitForSelector(".fr-shell-header-inner", { timeout: 60_000 });
      const m = await page.evaluate(() => {
        const hdr = document.querySelector(".fr-shell-header") as HTMLElement;
        const inner = document.querySelector(".fr-shell-header-inner") as HTMLElement;
        const id = document.querySelector(".fr-shell-id") as HTMLElement | null;
        return { header: Math.round(hdr.getBoundingClientRect().height),
          wrap: getComputedStyle(inner).flexWrap,
          idWrap: id ? getComputedStyle(id).flexWrap : null,
          ticks: document.querySelectorAll(".fr-progress-tick").length };
      });
      expect(m.ticks, "this surface passes no beats, so it carries no ticks").toBe(0);
      expect(m.wrap, "the ≤640 block leaked onto a header it does not name").toBe("nowrap");
      expect(m.idWrap, "the id's wrap leaked too").toBe("nowrap");
      expect(m.header, "the header height moved on a surface outside the ruling").toBe(headerPx);
    });
  }
}
