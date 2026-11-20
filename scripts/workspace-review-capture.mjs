// Acceptance captures for SP-441 (the review group) and SP-442/445/449 (the Brief) — Playwright.
//
// TWO THINGS THAT MADE EARLIER CAPTURES LAND ON THE LOGIN PAGE, both avoided here:
//   - the ORIGIN must match the storage state's (http://localhost:8080, not 127.0.0.1);
//   - nothing non-GET may be blocked — that blocks Supabase's own auth refresh.
// The active company is pinned the way tests/workspace/global-setup.ts pins it: localStorage
// active_company_id, set before any script runs.
//
//   FR_STORAGE_STATE=backups/fr-state.json node scripts/workspace-review-capture.mjs
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { chromium } from "playwright";

const BASE = process.env.FR_BASE_URL || "http://localhost:8080";
const OUT = (process.env.FR_OUT || `${os.homedir()}/dev/_diagnose-shots/2026-11-19/built`).replace(/^~/, os.homedir());
const STATE = (process.env.FR_STORAGE_STATE || "backups/fr-state.json").replace(/^~/, os.homedir());
const CHARTER = "dd40ce2f-ff67-4111-bd3c-67943dde6717";
const THROWAWAY = process.env.FR_THROWAWAY || "72df7061-93d0-4358-883c-f04fd3850d2f";
await fs.mkdir(OUT, { recursive: true });

const ONLY = process.env.FR_ONLY || "";
const want = (k) => !ONLY || ONLY.split(",").includes(k);
const browser = await chromium.launch({ headless: true });

async function session(companyId, { width = 1440, height = 1000 } = {}) {
  const context = await browser.newContext({
    viewport: { width, height }, deviceScaleFactor: 1, storageState: STATE, reducedMotion: "reduce",
  });
  await context.addInitScript((id) => { try { localStorage.setItem("active_company_id", id); } catch { /* private mode */ } }, companyId);
  const page = await context.newPage();
  page.on("console", (m) => { if (m.type() === "error") console.log("  [console]", m.text().slice(0, 160)); });
  return { context, page };
}

async function openWorkspace(page, seg, { operator = true } = {}) {
  await page.goto(`${BASE}/preview/client-refine/workspace/${seg}`, { waitUntil: "domcontentloaded" });
  const root = page.getByTestId("workspace-root");
  await root.waitFor({ timeout: 60_000 });
  if (operator) {
    const sw = page.locator("[data-fr-operator-switch]");
    await sw.waitFor({ timeout: 30_000 });
    if ((await sw.getAttribute("data-fr-operator-switch")) === "off") await sw.click();
    await page.waitForTimeout(400);
  }
  await page.waitForTimeout(2500);
}

const shot = async (page, name, full = true) => {
  const f = path.join(OUT, name);
  await page.screenshot({ path: f, fullPage: full });
  console.log("wrote", f);
};

// ── 1. the review group on Charter: closed, then one card open ───────────────────────────────────
if (want("r")) {
  const { context, page } = await session(CHARTER);
  await openWorkspace(page, "inputs");
  const group = page.getByTestId("inputs-review-group");
  if (!(await group.count())) { console.log("!! the review group did not render — is the page gated?"); }
  else {
    const cards = page.getByTestId("review-card");
    console.log(`review group: ${await cards.count()} card(s), ${await page.getByTestId("outside-voice-mark").count()} admin-queue marks`);
    // Scroll so the section LABEL clears the sticky shell header, not just the first card.
    await group.evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 140));
    await page.waitForTimeout(400);
    await shot(page, "r1-inputs-review-group-closed.png");
    // open the card that sits AT THE BAR, so the capture shows the mark and the quotes together
    const bar = page.locator('[data-testid="review-card"]:has([data-testid="review-card-bar"])').first();
    const target = (await bar.count()) ? bar : cards.first();
    await target.locator('[data-testid="review-card-open"]').click();
    await page.waitForTimeout(600);
    await target.evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 140));
    await page.waitForTimeout(400);
    await shot(page, "r2-inputs-review-group-open.png");
    // close it again, then open the card with the MOST quotes (P1, 43) and scroll to its quotes
    await target.locator('[data-testid="review-card-open"]').click();
    await page.waitForTimeout(300);
    const labels = await cards.locator('[data-testid="review-card-open"]').allTextContents();
    let best = 0, bestN = -1;
    labels.forEach((t, i) => { const n = Number((t.match(/^(\d+)/) ?? [])[1] ?? -1); if (n > bestN) { bestN = n; best = i; } });
    const biggest = page.locator('[data-testid="review-card"]:has([data-testid="review-card-open"])').nth(best);
    await biggest.locator('[data-testid="review-card-open"]').click();
    await page.waitForTimeout(700);
    console.log(`opened the card with the most quotes: ${labels[best]}`);
    await biggest.evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 140));
    await page.waitForTimeout(400);
    await shot(page, "r5-inputs-most-quotes-open.png");
    // SP-455b: reveal EVERY remaining quote through the First Read's control
    const more = biggest.locator('[data-testid="quote-show-all"]');
    console.log(`reveal control reads: ${JSON.stringify((await more.textContent())?.trim())}`);
    await more.click();
    await page.waitForTimeout(900);
    const shownAll = await biggest.locator('[data-testid="quote"]').count();
    console.log(`P1 expanded: ${shownAll} quote(s) on screen`);
    await biggest.evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 140));
    await page.waitForTimeout(400);
    await shot(page, "r6-inputs-most-quotes-expanded.png");
  }
  await context.close();
}

// ── 2. Reject, on a THROWAWAY company only ───────────────────────────────────────────────────────
if (want("reject")) {
  const { context, page } = await session(THROWAWAY);
  await openWorkspace(page, "inputs");
  const group = page.getByTestId("inputs-review-group");
  if (!(await group.count())) console.log("!! no review group on the throwaway");
  else {
    const before = await page.getByTestId("review-card").count();
    await group.evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 140));
    await page.waitForTimeout(300);
    await shot(page, "r3-reject-throwaway-before.png");
    const first = page.getByTestId("review-card").first();
    const headline = (await first.locator(".fr-ws-review-headline").textContent())?.trim();
    await first.locator('[data-testid="review-card-reject"]').click();
    await page.waitForTimeout(2500);
    const after = await page.getByTestId("review-card").count();
    console.log(`reject on throwaway: ${before} card(s) -> ${after}; rejected headline: ${JSON.stringify(headline?.slice(0, 70))}`);
    await group.evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 140));
    await page.waitForTimeout(300);
    await shot(page, "r4-reject-throwaway-after.png");
    await fs.writeFile(path.join(OUT, "r4-reject-note.txt"), `before=${before}\nafter=${after}\nheadline=${headline}\n`);
  }
  await context.close();
}

// ── 3. the Brief and the launcher: both supported sizes x both views (SP-456 item 6) ─────────────
const SIZES = [[1440, 900], [1280, 720]];
for (const [w, h] of (want("b") ? SIZES : [])) {
  for (const operator of [true, false]) {
    const view = operator ? "operator" : "non-admin";
    const { context, page } = await session(CHARTER, { width: w, height: h });
    await openWorkspace(page, "brief", { operator });
    if (operator) {
      await page.locator('[data-fr-region="hotspots"] [data-testid="brief-need"]').first().waitFor({ timeout: 90_000 });
      await page.waitForTimeout(1200);
    } else {
      await page.waitForTimeout(2000);
    }
    console.log(`brief ${w}x${h} ${view}: <title>=${JSON.stringify(await page.title())} regions=${JSON.stringify(await page.locator("[data-fr-region]").evaluateAll((e) => e.map((x) => x.getAttribute("data-fr-region"))))} operatorNodes=${await page.locator("[data-fr-operator]").count()} absent=${await page.locator("[data-fr-absent]").count()}`);
    await shot(page, `b-brief-${w}x${h}-${view}.png`);

    if (operator) {
      const row = page.locator('[data-fr-region="hotspots"] [data-testid="brief-need"]').first();
      await row.locator('[data-testid="review-card-open"]').click();
      await page.waitForTimeout(700);
      await row.evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 120));
      await page.waitForTimeout(400);
      await shot(page, `b-brief-count-open-${w}x${h}.png`);
      // and every live question revealed
      const qbtn = page.locator('[data-testid="brief-questions-show-all"]');
      if (await qbtn.count()) {
        await qbtn.scrollIntoViewIfNeeded();
        await qbtn.click();
        await page.waitForTimeout(600);
        console.log(`  questions revealed: ${await page.locator('[data-testid="brief-question"]').count()}`);
        await shot(page, `b-brief-questions-open-${w}x${h}.png`);
      }
      await page.goto(`${BASE}/preview/client-refine/workspace/brief`, { waitUntil: "domcontentloaded" });
      await page.getByTestId("workspace-root").waitFor({ timeout: 60_000 });
      const sw2 = page.locator("[data-fr-operator-switch]");
      await sw2.waitFor();
      if ((await sw2.getAttribute("data-fr-operator-switch")) === "off") await sw2.click();
      await page.waitForTimeout(1500);
    }

    // the launcher, measured on the settled layout
    await page.getByTestId("workspace-square").click();
    await page.waitForTimeout(2500);
    const m = await page.evaluate(() => {
      const r = (e) => e.getBoundingClientRect();
      const panel = document.querySelector(".fr-launcher-panel"), foot = document.querySelector(".fr-launcher-foot");
      const blocks = [...document.querySelectorAll(".fr-launcher-group, .fr-launcher-tools")];
      const tiles = [...document.querySelectorAll(".fr-launcher-tile")];
      const tools = [...document.querySelectorAll(".fr-launcher-tool")];
      return {
        tools: tools.length,
        blockRights: [...new Set(blocks.map((e) => Math.round(r(e).right)))],
        tileOverflow: Math.max(...tiles.map((e) => Math.round(r(e).right))) - Math.max(...blocks.map((e) => Math.round(r(e).right))),
        square: tiles.every((e) => Math.abs(r(e).width - r(e).height) <= 2),
        panelOverflows: panel.scrollHeight > panel.clientHeight + 1,
        footVisible: r(foot).bottom <= window.innerHeight + 1,
        clipped: tools.filter((t) => t.scrollWidth > t.clientWidth + 1 || t.scrollHeight > t.clientHeight + 1).map((t) => t.textContent.trim().slice(0, 24)),
      };
    });
    console.log(`launcher ${w}x${h} ${view}:`, JSON.stringify(m));
    await shot(page, `b-launcher-${w}x${h}-${view}.png`, false);
    await context.close();
  }
}

await browser.close();
