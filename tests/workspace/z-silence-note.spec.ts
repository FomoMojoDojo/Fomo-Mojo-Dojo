// IR6 (signed 2026-10-01) — the text-only note on the rendered surfaces.
//
// The note says what the read COVERS, beside every line that reports a silence about the COMPANY.
// It must appear ONCE per section that shows a silence, never per row, and never beside a line that
// reports our own collection state (nothing was read there, so "text only" is not the limitation).
//
// Surfaces asserted here:
//   /first-read/:companyId  — the PRESENTED read (FirstReadView → TheCheckAct → SayVsSeeExhibit).
//                             This is the only surface that renders the say-vs-see silence lines.
//   /preview/client-refine/first-read/:companyId — the PREVIEW read, which renders none of the
//                             signed note-taking strings and must therefore show no note.
// The exported HTML shares the predicate and the constant with the screen (groupShowsSilence /
// TEXT_ONLY_NOTE) and is covered by silenceNote.test.ts plus the guard's import check, rather than
// by driving a download here.
import { expect, test, type Page } from "playwright/test";
import { COMPANY_ID } from "../../playwright.config";
import { TEXT_ONLY_NOTE } from "../../src/lib/firstRead/sayVsSee";

const NOTE = "[data-text-only-note]";

async function openPresentedCheck(page: Page): Promise<void> {
  await page.addInitScript((id) => { try { localStorage.setItem("active_company_id", id); } catch { /* no storage */ } }, COMPANY_ID);
  await page.goto(`/first-read/${COMPANY_ID}`, { waitUntil: "networkidle", timeout: 120_000 });
  await page.getByRole("button", { name: "The Check" }).click();
  await expect(page.locator(".cvs-saysee-group").first()).toBeAttached({ timeout: 60_000 });
}

test("the presented read: every say-vs-see section showing a silence carries the note exactly once", async ({ page }) => {
  test.setTimeout(180_000);
  await openPresentedCheck(page);

  const groups = await page.locator(".cvs-saysee-group").evaluateAll((els) =>
    els.map((g) => ({
      heading: g.querySelector(".cvs-saysee-heading")?.textContent ?? "",
      silentRows: g.querySelectorAll(".cvs-delta-text.is-silent").length,
      notes: g.querySelectorAll("[data-text-only-note]").length,
    })),
  );
  expect(groups.length).toBeGreaterThan(0);

  for (const g of groups) {
    if (g.silentRows > 0 || g.heading === "What we haven't found yet") {
      // ONCE per section — not once per silent row.
      expect(g.notes, `section "${g.heading}" (${g.silentRows} silent rows)`).toBe(1);
    } else {
      // Nothing here reports a silence, so nothing to qualify.
      expect(g.notes, `section "${g.heading}" has no silence`).toBe(0);
    }
  }
});

test("the note carries the signed text, and is not markable (FM15)", async ({ page }) => {
  test.setTimeout(180_000);
  await openPresentedCheck(page);

  const note = page.locator(NOTE).first();
  await expect(note).toHaveText(TEXT_ONLY_NOTE);

  const markable = await page.locator(NOTE).evaluateAll((els) =>
    els.some((e) =>
      e.hasAttribute("data-fr-mark-kind") ||
      e.hasAttribute("data-fr-mark-key") ||
      e.classList.contains("fr-mark-target") ||
      !!e.querySelector("button")),
  );
  expect(markable, "the note must carry no mark anchor and no control").toBe(false);
});

test("the note never renders inside a row", async ({ page }) => {
  test.setTimeout(180_000);
  await openPresentedCheck(page);
  // A note inside .cvs-delta-item would repeat for every silent row in the section.
  await expect(page.locator(`.cvs-delta-item ${NOTE}`)).toHaveCount(0);
});

test("the existing signed strings are unchanged on the presented read", async ({ page }) => {
  test.setTimeout(180_000);
  await openPresentedCheck(page);
  const headings = await page.locator(".cvs-saysee-heading").allTextContents();
  expect(headings.map((h) => h.trim())).toEqual([
    "Where the outside echoes you",
    "Where the outside disagrees",
    "What we haven't found yet",
  ]);
  await expect(page.locator(".cvs-delta-text.is-silent").first())
    .toHaveText("Nothing we've read so far speaks to this.");
});

test("the preview read renders none of the signed note-taking strings, so it shows no note", async ({ page }) => {
  test.setTimeout(180_000);
  await page.addInitScript((id) => { try { localStorage.setItem("active_company_id", id); } catch { /* no storage */ } }, COMPANY_ID);
  await page.goto(`/preview/client-refine/first-read/${COMPANY_ID}`, { waitUntil: "networkidle", timeout: 120_000 });
  await expect(page.locator(".first-read")).toBeVisible({ timeout: 60_000 });
  // The preview carries its own *_LOOKED_NONE family (acts.tsx:196, :203, :256, :330), which is NOT
  // in the signed IR6 inventory — flagged for a ruling. Until then it takes no note, and this
  // assertion is the record of that state rather than an endorsement of it.
  await expect(page.locator(NOTE)).toHaveCount(0);
});
