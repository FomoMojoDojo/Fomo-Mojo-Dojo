// (m4) Inputs — the workspace COMPLETES a running proposal while watched (2026-09-13). The fixture's
// file_proposals read is planted: the first GETs return one Edgewood row as a RUNNING proposal for a
// real file; the page's sync poll (useProposalSync, gated) posts dify-analyze-file {mode:"sync"} — which
// the write guard answers {"state":"ready"} without touching the server — and every GET after that
// returns the row as ready + pending, so the cell moves from "Analyzing" to REVIEW PROPOSAL.
//   a. operator ON: the sync post is issued for exactly the running row's id; the cell follows to
//      REVIEW PROPOSAL; no other non-GET request is made
//   b. operator OFF: the chip reads "Analyzing", zero operator nodes, and NO sync post is ever issued —
//      the page-side poll is gated; the server-side sweep is what completes an unwatched run
// Vacuity: with the hook's `enabled` forced false on the page, a fails (no post, no transition).
import { expect, test, type Page, type Route } from "playwright/test";
import { openWorkspace } from "./helpers";

type Captured = { method: string; url: string; body: unknown };
const SUPABASE = /\/(rest|storage|functions)\/v1\//;
const TARGET_FILE = "Edgewood Alternatives-14b55a57.pdf"; // a fixture file with no proposal of its own
const PLANT_ID = "00000000-0000-4000-8000-00000000d0d0";

async function plant(page: Page): Promise<{ captured: Captured[]; state: { synced: boolean } }> {
  const captured: Captured[] = [];
  const state = { synced: false };
  await page.route(SUPABASE, async (route: Route) => {
    const req = route.request(); const method = req.method(); const url = req.url();
    if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
      if (/\/rest\/v1\/file_proposals\?/.test(url)) {
        const res = await route.fetch();
        let rows: Array<Record<string, unknown>> = [];
        try { rows = JSON.parse(await res.text()); } catch { return route.fulfill({ response: res }); }
        const filesRes = await page.request.get(url.replace(/\/file_proposals\?.*$/, `/input_files?select=id,file_name&file_name=eq.${encodeURIComponent(TARGET_FILE)}`), { headers: req.headers() });
        const files = (await filesRes.json()) as Array<{ id: string }>;
        const fileId = files[0]?.id;
        const base = rows[0] ?? {};
        const planted = { ...base, id: PLANT_ID, file_id: fileId, file_name: TARGET_FILE, status: "pending", summary: "Planted analysis summary for the completion proof.", evidence: [], framework_results: [], suggested_areas: [], candidate_positioning_updates: [], candidate_job_steps: [], candidate_needs: [], candidate_outcomes: [], possible_gaps: [], possible_routes: [], experiments_to_run: [], contradictions: [], questions_to_verify: [], confidence: "medium", applied_areas: [], reviewed_at: null, processing_error: null, dify_workflow_run_id: "planted-run", processing_state: state.synced ? "ready" : "running", processing_started_at: new Date(Date.now() - 60_000).toISOString(), processing_completed_at: state.synced ? new Date().toISOString() : null, created_at: new Date(Date.now() - 60_000).toISOString() };
        return route.fulfill({ response: res, body: JSON.stringify([planted, ...rows]), headers: { ...res.headers(), "content-type": "application/json" } });
      }
      return route.continue();
    }
    let body: unknown = null;
    try { body = req.postDataJSON(); } catch { body = req.postData(); }
    captured.push({ method, url, body });
    if (/\/functions\/v1\/dify-analyze-file/.test(url) && (body as Record<string, unknown> | null)?.mode === "sync") {
      state.synced = true;
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ state: "ready" }) });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });
  return { captured, state };
}
async function operatorOn(page: Page) {
  await page.locator("[data-fr-operator-switch]").click();
  await expect(page.locator("[data-fr-operator-switch]")).toHaveAttribute("data-fr-operator-switch", "on");
}

test("a. operator ON: the page syncs the running row and it completes to REVIEW PROPOSAL", async ({ page }) => {
  const { captured } = await plant(page);
  await openWorkspace(page, "inputs");
  const row = page.locator("tr[data-testid=inputs-file-row]", { hasText: TARGET_FILE });
  await expect(row.locator(".fr-ws-table-analysis")).toHaveText("Analyzing");
  await operatorOn(page);
  await expect.poll(() => captured.filter((c) => /dify-analyze-file/.test(c.url)).length, { timeout: 20_000 }).toBeGreaterThan(0);
  const syncs = captured.filter((c) => /dify-analyze-file/.test(c.url));
  expect(syncs.every((c) => JSON.stringify(c.body) === JSON.stringify({ mode: "sync", proposalId: PLANT_ID }))).toBe(true);
  await expect(row.getByTestId("inputs-review-proposal")).toBeVisible({ timeout: 20_000 });
  expect(captured.filter((c) => !/dify-analyze-file/.test(c.url))).toEqual([]);
});

test("b. operator OFF: 'Analyzing' chip, zero operator nodes, and no sync post at all", async ({ page }) => {
  const { captured } = await plant(page);
  await openWorkspace(page, "inputs");
  const row = page.locator("tr[data-testid=inputs-file-row]", { hasText: TARGET_FILE });
  await expect(row.locator(".fr-ws-table-analysis")).toHaveText("Analyzing");
  await expect(page.locator("[data-fr-operator]")).toHaveCount(0);
  await page.waitForTimeout(7_000); // longer than the poll's 5 s cadence
  expect(captured).toEqual([]);
  await expect(row.locator(".fr-ws-table-analysis")).toHaveText("Analyzing");
});
