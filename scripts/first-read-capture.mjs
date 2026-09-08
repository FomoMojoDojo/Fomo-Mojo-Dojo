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
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1, storageState });
const page = await context.newPage();

async function open() {
  await page.goto(url, { waitUntil: "networkidle", timeout: 120000 });
  const ticks = page.locator(".fr-progress-tick");
  try {
    await ticks.first().waitFor({ timeout: 30000 });
  } catch {
    const text = (await page.locator("body").innerText()).slice(0, 200).replace(/\s+/g, " ");
    throw new Error(`First Read did not render (no progress ticks). Page says: "${text}". Is FR_STORAGE_STATE a signed-in admin state?`);
  }
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
