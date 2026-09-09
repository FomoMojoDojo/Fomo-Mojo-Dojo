// First Read acceptance captures — Playwright, writes PNGs to screenshots/first-read/.
//
// The preview route is admin-gated, so the script needs a Playwright storage state exported from a
// signed-in browser (FR_STORAGE_STATE=path/to/state.json). Without one it lands on the login page and
// says so. It never handles credentials itself.
//
//   FR_STORAGE_STATE=~/fr-state.json node scripts/first-read-capture.mjs
//   FR_BASE_URL   (default http://localhost:8080)
//   FR_COMPANY_ID (default the CB2 preview company)
//   FR_BEATS      (default "3,4,5,6,11,12,14,15,16"; 1-based beat numbers)
//   FR_OPERATOR_BEAT (default 5 — also captured with the operator toggle on)
//
// Each beat is captured after a hard reload (page.goto) so the operator toggle is off by default,
// then navigated by clicking the progress tick (index = beat − 1). Viewport 1440 wide, full page.

import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { chromium } from "playwright";

const baseUrl = process.env.FR_BASE_URL || "http://localhost:8080";
const companyId = process.env.FR_COMPANY_ID || "fd3f7f63-968b-4698-b946-3d6b6450d79d";
const beats = (process.env.FR_BEATS || "3,4,5,6,11,12,14,15,16").split(",").map((s) => Number(s.trim())).filter(Boolean);
const operatorBeat = Number(process.env.FR_OPERATOR_BEAT || "5");
const stateRaw = process.env.FR_STORAGE_STATE;
const storageState = stateRaw ? stateRaw.replace(/^~/, os.homedir()) : undefined;
const outDir = path.resolve("screenshots/first-read");
await fs.mkdir(outDir, { recursive: true });

const url = `${baseUrl}/preview/client-refine/first-read/${companyId}`;
const browser = await chromium.launch({ headless: true });
// E5 (2026-09-09) — REDUCED MOTION, set before any screenshot.
// The CSS no-animation style below only stops CSS animations and transitions. The score numeral is
// counted up in JavaScript (CountUp, a 900ms requestAnimationFrame ease), so a capture taken mid-ease
// records a number that was never the score: Brand AI's beat 15 was captured reading "5" while the
// stored score was 20. CountUp honours prefers-reduced-motion and sets the final value immediately,
// so emulating it makes every numeral in a capture the settled one.
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  deviceScaleFactor: 1,
  storageState,
  reducedMotion: "reduce",
});
await context.addInitScript(() => {
  // Belt and braces: some components read the media query once at mount.
  try {
    const mm = window.matchMedia.bind(window);
    window.matchMedia = (q) => (String(q).includes("prefers-reduced-motion") ? { matches: true, media: q, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false } : mm(q));
  } catch { /* non-fatal */ }
});
const page = await context.newPage();
await page.emulateMedia({ reducedMotion: "reduce" });

// The CSS half of the freeze: no CSS animation, no transition, nothing staggered mid-fade.
const CAPTURE_STYLE = `.fr-act-enter,.fr-stagger,.fr-stagger>*{animation:none!important;opacity:1!important;transform:none!important}
.first-read *{transition:none!important;animation:none!important}`;

async function open() {
  await page.goto(url, { waitUntil: "networkidle", timeout: 120000 });
  const ticks = page.locator(".fr-progress-tick");
  try {
    await ticks.first().waitFor({ timeout: 30000 });
  } catch {
    const text = (await page.locator("body").innerText()).slice(0, 200).replace(/\s+/g, " ");
    throw new Error(`First Read did not render (no progress ticks). Page says: "${text}". Is FR_STORAGE_STATE a signed-in admin state?`);
  }
  await page.addStyleTag({ content: CAPTURE_STYLE });
  await page.waitForTimeout(600);
  return ticks;
}

const written = [];
for (const beat of beats) {
  const ticks = await open();
  await ticks.nth(beat - 1).click();
  await page.waitForTimeout(700);
  const file = path.join(outDir, `s3-beat-${String(beat).padStart(2, "0")}.png`);
  await page.screenshot({ path: file, fullPage: true });
  written.push(file);
}

if (operatorBeat) {
  const ticks = await open();
  await ticks.nth(operatorBeat - 1).click();
  await page.waitForTimeout(500);
  await page.locator("[data-fr-operator-switch]").click();
  await page.waitForTimeout(500);
  const ops = await page.locator("[data-fr-operator]").count();
  const file = path.join(outDir, `s3-beat-${String(operatorBeat).padStart(2, "0")}-operator-on.png`);
  await page.screenshot({ path: file, fullPage: true });
  written.push(`${file}  ([data-fr-operator] = ${ops})`);
}

await browser.close();
console.log(written.join("\n"));
