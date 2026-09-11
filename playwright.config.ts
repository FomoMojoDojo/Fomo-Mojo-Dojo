// Playwright — the workspace shell's acceptance specs (signed 2026-09-11, ruling 8). Encodes the
// scripts/first-read-capture.mjs discipline: the dev server at localhost:8080, an admin storage state
// from FR_STORAGE_STATE (minted by tests/workspace/global-setup.ts through the app's own DEV
// window.supabase — credentials only ever come from env), every spec hard-reloads with
// page.goto(url, { waitUntil: "networkidle" }), and captures run under reduced motion.
//
// Two projects: `reduced` (prefers-reduced-motion: reduce — the capture discipline) and `motion`
// (animations on — the launcher unfold/fold and stage checks that need an animation end).
import { defineConfig, devices } from "playwright/test";
import path from "node:path";

export const BASE_URL = process.env.FR_BASE_URL || "http://localhost:8080";
/** Where the admin storage state lives. backups/ is gitignored. */
export const STORAGE_STATE = path.resolve(process.env.FR_STORAGE_STATE || "backups/fr-state.json");
/** The Edgewood fixture — the company the specs read. Overridable. */
export const COMPANY_ID = process.env.FR_COMPANY_ID || "3dd2cfbb-0792-4bf1-9cd4-15db9646874b";
/** Pre-change DOM-text capture of /preview/client-refine/home (spec g). */
export const HOME_DOM_BASELINE = path.resolve(process.env.FR_HOME_DOM_BASELINE || "backups/home-dom-before_20260911.txt");

export default defineConfig({
  testDir: "tests/workspace",
  globalSetup: "tests/workspace/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  outputDir: "backups/playwright-results",
  timeout: 120_000,
  expect: { timeout: 30_000 },
  use: {
    baseURL: BASE_URL,
    storageState: STORAGE_STATE,
    viewport: { width: 1440, height: 900 },
    trace: "retain-on-failure",
  },
  projects: [
    // The device preset carries its own 1280×720 viewport; the capture discipline is 1440 wide, so it is
    // re-pinned after the spread.
    { name: "reduced", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 }, contextOptions: { reducedMotion: "reduce" } } },
    { name: "motion", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 }, contextOptions: { reducedMotion: "no-preference" } } },
  ],
  webServer: {
    command: "npm run dev",
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
