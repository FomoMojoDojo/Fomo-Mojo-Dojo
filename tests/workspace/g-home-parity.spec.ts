// (g) /preview/client-refine/home DOM text is byte-identical to the pre-change capture
// (HOME_DOM_BASELINE, taken with the first-read-capture discipline before any edit).
// Re-pinned 2026-09-17 after C0+C1 audited data acts (integrity_runs 1220–1226): 7 public rows
// superseded/held/restamped — PUBLIC 137 → 130 on Edgewood; the baseline now lives at
// tests/workspace/fixtures/home-dom-before_20260917.txt.
import fs from "node:fs";
import { expect, test } from "playwright/test";
import { HOME_DOM_BASELINE } from "../../playwright.config";
import { open } from "./helpers";

test("home DOM text is byte-identical before and after", async ({ page }) => {
  test.skip(!fs.existsSync(HOME_DOM_BASELINE), `no baseline at ${HOME_DOM_BASELINE}`);
  const before = fs.readFileSync(HOME_DOM_BASELINE, "utf8");
  await open(page, "/preview/client-refine/home");
  await expect(page.getByTestId("home-fr-root")).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(1500);
  const after = await page.locator("body").innerText();
  // The home's score numerals (the live computation now shared with the workspace Routes page).
  const numerals = (t: string) => ({
    score: t.match(/SCORE\s+(\d+)\s*→\s*(\d+)/)?.slice(1, 3) ?? null,
    compass: t.match(/CURRENT\s*·\s*(\d+)[\s\S]*?REACHABLE\s*·\s*(\d+)[\s\S]*?DESTINATION\s*·\s*(\d+)/)?.slice(1, 4) ?? null,
  });
  expect(numerals(before).score).not.toBeNull();
  expect(numerals(after)).toEqual(numerals(before));
  // The DAY counter is the calendar (engagementDayFrom: days since engagement_started_at), not copy —
  // it moves at midnight UTC between the baseline capture and a run. Everything else is byte-exact.
  const maskDay = (t: string) => t.replace(/DAY \d+/g, "DAY N");
  expect(maskDay(after)).toBe(maskDay(before));
});
