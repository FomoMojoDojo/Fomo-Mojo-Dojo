// (r) The old JobSteps surface's add-map control — item 2 gate 2 proofs (signed 2026-09-15, R4), NO real
// writes: every non-GET Supabase request is intercepted; local-jobmap-synthesis is answered by a stub.
// Add-map must reach local-jobmap-synthesis with the scoped body (one key, both flags); a refusal
// surfaces as failure and writes NOTHING (no job_steps POST — the draft-row fallback is gone); DB row
// counts are read through the app's DEV client, not the UI.
import { expect, test, type Page, type Route } from "playwright/test";
import { COMPANY_ID } from "../../playwright.config";
import { open } from "./helpers";

const SUPABASE = /\/(rest|storage|functions)\/v1\//;
const GENERATE = /\/functions\/v1\/local-jobmap-synthesis/;
const KEY = "pmk-gate2-proof-market";
type State = { mode: "refuse422" | "ok"; captured: Array<{ method: string; url: string; body: unknown }> };

async function guard(page: Page, state: State) {
  await page.route(SUPABASE, async (route: Route) => {
    const req = route.request();
    const method = req.method();
    const url = req.url();
    if (method === "GET" || method === "HEAD" || method === "OPTIONS") return route.continue();
    let body: unknown = null;
    try { body = req.postDataJSON(); } catch { body = req.postData(); }
    state.captured.push({ method, url, body });
    if (GENERATE.test(url)) {
      if (state.mode === "refuse422") return route.fulfill({ status: 422, contentType: "application/json", body: JSON.stringify({ ok: false, error: "no_market_definition", missing_journey_keys: [KEY], message: `No live market definition for journey '${KEY}'. Define the market for this set (generate-market-hypothesis, or a declared definition) before generating its job map — nothing was written.` }) });
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "ok", summary: { selected_maps: 1, journeys_generated: 1, steps_inserted: 8, affected_artifacts_marked: 0, market_definition: "untouched" }, artifacts: { journeys: [{ journey_key: KEY, journey_title: "Gate 2 proof market", step_count: 8 }] } }) });
    }
    if (/\/functions\/v1\//.test(url)) return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    if (method === "POST" && /\/rest\/v1\//.test(url)) return route.fulfill({ status: 201, contentType: "application/json", body: "[]" });
    return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });
}
async function dbStepCount(page: Page, key: string): Promise<number> {
  return page.evaluate(async ({ companyId, key }) => {
    const sb = (window as unknown as { supabase: { from: (t: string) => any } }).supabase;
    const { count } = await sb.from("job_steps").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("journey_key", key);
    return Number(count ?? 0);
  }, { companyId: COMPANY_ID, key });
}
async function addCustomMap(page: Page) {
  await open(page, "/legacy/job-steps");
  await page.getByRole("button", { name: "Add Custom" }).click();
  await page.getByPlaceholder("Map key (optional, e.g. cafe-owner)").fill(KEY);
  await page.getByPlaceholder("Map title (e.g. Checkpoint Map: Cafe Owner Buying)").fill("Gate 2 proof market");
  await page.getByRole("button", { name: "Add Custom Map" }).click();
}
const shot = (page: Page, name: string) => page.screenshot({ path: `screenshots/item2/${name}.png`, fullPage: false });

test("add-map reaches local-jobmap-synthesis with the scoped body: the NEW key only, both flags", async ({ page }) => {
  const state: State = { mode: "ok", captured: [] };
  await guard(page, state);
  await addCustomMap(page);
  await expect(page.getByText(/map generated from local synthesis/)).toBeVisible({ timeout: 30_000 });
  await shot(page, "07-jobsteps-add-map-success");
  const gen = state.captured.filter((c) => GENERATE.test(c.url));
  expect(gen).toHaveLength(1);
  const body = gen[0].body as Record<string, unknown>;
  expect(Object.keys(body).sort()).toEqual(["company_id", "require_model", "selected_job_maps", "selected_maps_only", "trigger"]);
  expect(body).toMatchObject({ company_id: COMPANY_ID, selected_maps_only: true, require_model: true, trigger: `jobsteps_add_map:${KEY}` });
  expect((body.selected_job_maps as Array<{ journey_key: string }>).map((m) => m.journey_key)).toEqual([KEY]); // never customer as support
  expect(state.captured.filter((c) => /\/rest\/v1\/job_steps/.test(c.url))).toHaveLength(0);
});

test("a stubbed refusal surfaces as failure and writes nothing: no job_steps POST, DB count for the key unchanged", async ({ page }) => {
  const state: State = { mode: "refuse422", captured: [] };
  await guard(page, state);
  await addCustomMap(page);
  await expect(page.getByText(/No live market definition for journey/)).toBeVisible({ timeout: 30_000 });
  await shot(page, "08-jobsteps-add-map-refusal");
  expect(state.captured.filter((c) => GENERATE.test(c.url))).toHaveLength(1);
  expect(state.captured.filter((c) => /\/rest\/v1\/job_steps/.test(c.url))).toHaveLength(0);
  expect(await dbStepCount(page, KEY)).toBe(0);
  await expect(page.getByRole("button", { name: "Add Custom Map" })).toBeEnabled();
});
