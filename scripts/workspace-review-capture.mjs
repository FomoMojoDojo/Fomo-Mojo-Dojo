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
{
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
  }
  await context.close();
}

// ── 2. Reject, on a THROWAWAY company only ───────────────────────────────────────────────────────
{
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

await browser.close();
