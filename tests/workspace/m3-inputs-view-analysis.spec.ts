// (m3) Inputs — a completed (accepted) analysis is READABLE on both surfaces and re-decidable on neither
// (2026-09-13). Reads pass through to the real fixture (Edgewood); every non-GET Supabase request is
// intercepted and RECORDED — the proofs assert that opening a completed analysis issues none.
//   b. workspace: "View analysis →" on an accepted row → the panel shows the stored summary (read live from
//      file_proposals through the page's own GET) → zero non-GET requests for the whole interaction
//   c. old tab: an accepted row's link reads "View analysis →"; the open panel has NO Accept / Reject controls
//      (absent, not disabled) and carries the decision record; a pending row keeps "Review proposal →"
//   d. operator OFF: zero data-fr-operator nodes; no view-analysis control
// Vacuity (recorded in the brief's report): removing the decided branch of the panel footer fails c;
// removing the workspace control fails b; removing the old-tab string switch fails c.
import { expect, test, type Page, type Route } from "playwright/test";
import { openWorkspace, open } from "./helpers";

type Captured = { method: string; url: string; body: unknown };
const SUPABASE = /\/(rest|storage|functions)\/v1\//;
const ACCEPTED_FILE = "Edgewood Strategy Review.md";

async function recordWrites(page: Page): Promise<Captured[]> {
  const captured: Captured[] = [];
  await page.route(SUPABASE, async (route: Route) => {
    const req = route.request(); const method = req.method();
    if (method === "GET" || method === "HEAD" || method === "OPTIONS") return route.continue();
    let body: unknown = null;
    try { body = req.postDataJSON(); } catch { body = req.postData(); }
    captured.push({ method, url: req.url(), body });
    return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });
  return captured;
}
async function operatorOn(page: Page) {
  await page.locator("[data-fr-operator-switch]").click();
  await expect(page.locator("[data-fr-operator-switch]")).toHaveAttribute("data-fr-operator-switch", "on");
}
/** The accepted proposal's stored summary, read through the page's own session (a GET). */
async function storedSummary(page: Page, fileName: string): Promise<string> {
  return page.evaluate(async (name) => {
    const mod = await import("/src/integrations/supabase/client.ts");
    const { data } = await mod.supabase.from("file_proposals").select("summary,status,processing_state").eq("file_name", name).eq("status", "accepted").eq("processing_state", "ready").limit(1);
    return String((data as Array<{ summary: string }> | null)?.[0]?.summary ?? "");
  }, fileName);
}

test("b. workspace: View analysis → opens the completed analysis; zero non-GET requests", async ({ page }) => {
  const captured = await recordWrites(page);
  await openWorkspace(page, "inputs");
  await operatorOn(page);
  const row = page.locator("tr[data-testid=inputs-file-row]", { hasText: ACCEPTED_FILE });
  await expect(row).toHaveCount(1);
  const view = row.getByTestId("inputs-view-analysis");
  await expect(view).toHaveText("View analysis →");
  expect(await view.getAttribute("data-fr-operator")).toBe("view-analysis");
  await expect(row.getByTestId("inputs-review-proposal")).toHaveCount(0);
  const summary = await storedSummary(page, ACCEPTED_FILE);
  expect(summary.length).toBeGreaterThan(80);
  await view.click();
  const record = page.getByTestId("proposal-decision-record");
  await expect(record).toBeVisible();
  await expect(record).toContainText(/accepted Jul 16, 2026/);
  await expect(page.getByText(summary.slice(0, 80))).toBeVisible();
  const buttons = await page.locator("tr:has([data-testid=proposal-decision-record]) button").allInnerTexts();
  expect(buttons.some((t) => /^Accept/i.test(t.trim()))).toBe(false);
  expect(buttons.map((t) => t.trim())).not.toContain("Reject");
  await page.getByTestId("proposal-close").click();
  await expect(record).toHaveCount(0);
  expect(captured).toEqual([]); // the whole interaction: no POST / PATCH / DELETE / RPC
});

test("c. old tab: an accepted row reads View analysis →; the panel has no Accept / Reject; pending keeps Review proposal →", async ({ page }) => {
  const captured = await recordWrites(page);
  await open(page, "/preview/client-refine/workshop?tab=inputs");
  const row = page.locator("tr", { hasText: ACCEPTED_FILE }).first();
  await expect(row).toBeVisible({ timeout: 60_000 });
  const link = row.getByRole("button", { name: /^View analysis →/ });
  await expect(link).toBeVisible();
  await expect(row.getByRole("button", { name: /^Review proposal →/ })).toHaveCount(0);
  await link.click();
  const record = page.getByTestId("proposal-decision-record");
  await expect(record).toBeVisible();
  await expect(record).toContainText(/accepted Jul 16, 2026/);
  const panelRow = page.locator("tr:has([data-testid=proposal-decision-record])");
  const buttons = (await panelRow.locator("button").allInnerTexts()).map((t) => t.trim().toLowerCase()); // innerText carries the CSS uppercase
  expect(buttons.some((t) => /^accept/.test(t))).toBe(false);
  expect(buttons).not.toContain("reject");
  expect(buttons).toContain("close");
  expect(await panelRow.locator("input[type=checkbox]").count()).toBe(0);
  // a pending row (if the fixture has one) still offers the review link — behaviour unchanged
  const pending = page.locator("tr", { has: page.getByRole("button", { name: /^Review proposal →/ }) });
  if ((await pending.count()) > 0) await expect(pending.first().getByRole("button", { name: /^Review proposal →/ })).toBeVisible();
  // The tab's own background poll for a proposal that is queued/running (handleSyncProposal / the 5 s sync
  // loop: dify-analyze-file {mode:"sync"}) is pre-existing and independent of this panel — while the
  // fixture has a running proposal it fires on load. Everything else must be absent: no accept, no reject,
  // no analyze, no table write.
  const notSync = captured.filter((c) => !(/dify-analyze-file/.test(c.url) && (c.body as Record<string, unknown> | null)?.mode === "sync"));
  expect(notSync).toEqual([]);
});

test("d. operator OFF: no view-analysis control, zero operator nodes; the accepted row shows the badge", async ({ page }) => {
  await recordWrites(page);
  await openWorkspace(page, "inputs");
  await expect(page.locator("[data-fr-operator]")).toHaveCount(0);
  await expect(page.getByTestId("inputs-view-analysis")).toHaveCount(0);
  const row = page.locator("tr[data-testid=inputs-file-row]", { hasText: ACCEPTED_FILE });
  // Ruling 9 (2026-09-14): the cell also carries Dify's proposal-level confidence ("{confidence} confidence"), ungated.
  await expect(row.locator(".fr-ws-table-analysis > *").first()).toHaveText("Analysis ready");
  await expect(row.getByTestId("inputs-analysis-confidence")).toHaveText(/^(high|medium|low) confidence$/);
  expect(await row.locator(".fr-ws-table-analysis > *").first().evaluate((el) => el.tagName)).toBe("SPAN");
});
