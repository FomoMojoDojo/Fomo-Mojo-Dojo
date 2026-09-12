// (k) Inputs: the table has exactly one row per active input_files row the page read (useCompanyFiles),
// and every status chip is one of the three signed InputsTab words.
import { expect, test } from "playwright/test";
import { openWorkspace, wsPath } from "./helpers";

test("inputs table rows equal the files read; status chips are the signed vocabulary", async ({ page }) => {
  let filesFromRead: number | null = null;
  page.on("response", async (res) => {
    if (/\/rest\/v1\/input_files\?/.test(res.url()) && res.request().method() === "GET") {
      try { const rows = await res.json(); if (Array.isArray(rows)) filesFromRead = rows.filter((r) => r.archived_at == null).length; } catch { /* not json */ }
    }
  });
  await openWorkspace(page, "inputs");
  await page.waitForTimeout(800);
  const rows = page.getByTestId("inputs-file-row");
  const n = await rows.count();
  expect(filesFromRead, "the page made the input_files read").not.toBeNull();
  expect(n).toBe(filesFromRead);
  const counter = await page.getByTestId("inputs-counters").innerText();
  expect(counter).toContain(String(n)); // Evidence files counter = the same read
  const chips = await rows.locator(".fr-chip").allInnerTexts();
  for (const c of chips) expect(["ANALYSIS READY", "REVIEW PROPOSAL", "RUN ANALYSIS"]).toContain(c.trim().toUpperCase());
  expect(page.url()).toContain(wsPath("inputs"));
});
