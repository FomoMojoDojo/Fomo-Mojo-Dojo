// (g) /preview/client-refine/home DOM text is byte-identical to the pre-change capture
// (HOME_DOM_BASELINE, taken with the first-read-capture discipline before any edit).
// Re-pinned 2026-09-17 after C0+C1 audited data acts (integrity_runs 1220–1226): 7 public rows
// superseded/held/restamped — PUBLIC 137 → 130 on Edgewood.
// Re-pinned 2026-09-18 after S2 (integrity_runs 1448–1452): Edgewood's NULL-voice synthesis row 6bc22c8b
// (raw_payload.hypothesis, no URL) restamped 'analysis' — the legacy null→outside fallback had counted it as
// outside voice — PUBLIC 130 → 129; every other line byte-identical. The baseline now lives at
// tests/workspace/fixtures/home-dom-before_20260918.txt.
// Re-pinned 2026-09-18 (later) after the operator's resolve of Edgewood's frontier bet c7bfc5cc (integrity_runs 1538,
// 23:01 UTC — after the pin above): find_primary_finding now returns observation f0fff520, so the three THE NEXT TURN
// lines changed; every other line byte-identical (PUBLIC 129 · TEAM 42 unchanged).
import fs from "node:fs";
import { expect, test } from "playwright/test";
import { HOME_DOM_BASELINE } from "../../playwright.config";
import { open } from "./helpers";
import { freezeScoreClock } from "./frozenScoreTime";

test("home DOM text is byte-identical before and after", async ({ page }) => {
  test.skip(!fs.existsSync(HOME_DOM_BASELINE), `no baseline at ${HOME_DOM_BASELINE}`);
  const before = fs.readFileSync(HOME_DOM_BASELINE, "utf8");
  await freezeScoreClock(page);
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
