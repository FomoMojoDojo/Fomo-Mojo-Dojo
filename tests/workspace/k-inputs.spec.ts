// (k) Inputs: the table has exactly one row per active input_files row the page read (useCompanyFiles),
// and every status chip is one of the signed InputsTab words (three + "Analyzing", signed 2026-09-13).
// R13 (2026-09-19): the "Evidence files" counter counts evidence files only — interview rows (is_interview)
// stay in the table but are outside the number; their chip is the signed "Interview".
import { expect, test } from "playwright/test";
import { openWorkspace, wsPath } from "./helpers";

test("inputs table rows equal the files read; status chips are the signed vocabulary", async ({ page }) => {
  let filesFromRead: number | null = null;
  let interviewFromRead = 0;
  page.on("response", async (res) => {
    if (/\/rest\/v1\/input_files\?/.test(res.url()) && res.request().method() === "GET") {
      try { const rows = await res.json(); if (Array.isArray(rows)) { const active = rows.filter((r) => r.archived_at == null); filesFromRead = active.length; interviewFromRead = active.filter((r) => r.is_interview === true).length; } } catch { /* not json */ }
    }
  });
  await openWorkspace(page, "inputs");
  await page.waitForTimeout(800);
  const rows = page.getByTestId("inputs-file-row");
  const n = await rows.count();
  expect(filesFromRead, "the page made the input_files read").not.toBeNull();
  expect(n).toBe(filesFromRead);
  await expect(page.getByTestId("inputs-evidence-files")).toHaveText(String(n - interviewFromRead)); // R13: the counter = the same read minus interview rows
  const chips = await rows.locator(".fr-chip").allInnerTexts();
  // "Analyzing" signed 2026-09-13 (ruling 4): a queued/running proposal renders the tab's processing badge; "Interview" signed 2026-09-19.
  for (const c of chips) expect(["ANALYSIS READY", "REVIEW PROPOSAL", "RUN ANALYSIS", "ANALYZING", "INTERVIEW"]).toContain(c.trim().toUpperCase());
  expect(page.url()).toContain(wsPath("inputs"));
});
