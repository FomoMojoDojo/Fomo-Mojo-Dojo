// (n2) Job Map market door — item 2 proofs (signed 2026-09-15), NO real writes: every non-GET Supabase
// request is intercepted (same guard shape as n-jobmap-actions). local-jobmap-synthesis is answered by a
// per-test stub; the "steps appeared" outcome is planted at the READ boundary (the job_steps GET is
// augmented with fixture rows for the key) — never inserted into the DB. DB row counts are read through
// the app's own DEV client (window.supabase → the real PostgREST, GETs pass through), not the UI.
import { expect, test, type Page, type Route } from "playwright/test";
import { COMPANY_ID } from "../../playwright.config";
import { openWorkspace } from "./helpers";

const SUPABASE = /\/(rest|storage|functions)\/v1\//;
const CHOICE_READ = /\/rest\/v1\/operator_primary_selection\?.*domain=eq\.job_step_set/;
const GENERATE = /\/functions\/v1\/local-jobmap-synthesis/;
const NOTE = "Generation did not complete — no steps were written for this market.";

type Mode = "refuse422" | "ok" | "abort";
type State = {
  mode: Mode;
  /** When set, the job_steps GET is augmented with 8 fixture rows for this key. */
  plantKey?: string;
  captured: Array<{ method: string; url: string; body: unknown }>;
};

const fixtureRows = (key: string) => Array.from({ length: 8 }, (_, i) => ({
  id: `fixture-${key}-${i + 1}`, company_id: COMPANY_ID, user_id: null, journey_key: key, journey_title: `Fixture map: ${key}`, journey_subtitle: "",
  step_number: i + 1, step_label: `Fixture step ${i + 1}`, description: "planted at the read boundary", designed: true, has_gap: false,
  evidence_status: "unclear", evidence_basis: null, evidence_confidence: null, gap_note: null, created_at: "2026-09-15T00:00:00Z", conditions_json: null,
}));

async function guard(page: Page, state: State) {
  await page.route(SUPABASE, async (route: Route) => {
    const req = route.request();
    const method = req.method();
    const url = req.url();
    if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
      if (CHOICE_READ.test(url)) return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
      if (state.plantKey && /\/rest\/v1\/job_steps\?/.test(url) && method === "GET") {
        const res = await route.fetch();
        let rows: Array<Record<string, unknown>> = [];
        try { rows = JSON.parse(await res.text()); } catch { return route.fulfill({ response: res }); }
        // The page's company-wide read (no journey_key filter) and the hook's keyed poll for THIS key get
        // the fixture rows; a keyed read for any other key is untouched.
        const keyFilter = new URL(url).searchParams.get("journey_key");
        const plant = !keyFilter || keyFilter === `eq.${state.plantKey}`;
        const out = plant ? [...rows, ...fixtureRows(state.plantKey)] : rows;
        return route.fulfill({ response: res, body: JSON.stringify(out), headers: { ...res.headers(), "content-type": "application/json" } });
      }
      return route.continue();
    }
    let body: unknown = null;
    try { body = req.postDataJSON(); } catch { body = req.postData(); }
    state.captured.push({ method, url, body });
    if (GENERATE.test(url)) {
      if (state.mode === "refuse422") return route.fulfill({ status: 422, contentType: "application/json", body: JSON.stringify({ ok: false, error: "no_market_definition", missing_journey_keys: ["x"], message: "No live market definition for journey 'x'." }) });
      if (state.mode === "ok") { state.plantKey = String((body as { selected_job_maps: Array<{ journey_key: string }> }).selected_job_maps[0].journey_key); return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "ok", summary: { steps_inserted: 8, market_definition: "untouched" } }) }); }
      return route.abort("timedout");
    }
    if (/\/functions\/v1\//.test(url)) return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });
}

async function operatorOn(page: Page) {
  await page.locator("[data-fr-operator-switch]").click();
  await expect(page.locator("[data-fr-operator-switch]")).toHaveAttribute("data-fr-operator-switch", "on");
}
/** Real DB count of job_steps for the key, through the app's DEV client (bypasses nothing: the GET goes to PostgREST). */
async function dbStepCount(page: Page, key: string): Promise<number> {
  return page.evaluate(async ({ companyId, key }) => {
    const sb = (window as unknown as { supabase: { from: (t: string) => any } }).supabase;
    const { count } = await sb.from("job_steps").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("journey_key", key);
    return Number(count ?? 0);
  }, { companyId: COMPANY_ID, key });
}
async function viewFirstUnmapped(page: Page): Promise<string> {
  await page.getByTestId("jobmap-switcher-open").click();
  const opt = page.locator('[data-testid=jobmap-switcher-option][data-fr-mapped="false"]').first();
  await expect(opt.locator("[data-testid=jobmap-switcher-state]")).toHaveText("Not mapped");
  const key = (await opt.getAttribute("data-fr-set-key"))!;
  await opt.click();
  await expect(page.getByTestId("jobmap-switcher-list")).toHaveCount(0);
  return key;
}
const shot = (page: Page, name: string) => page.screenshot({ path: `screenshots/item2/${name}.png`, fullPage: false });

test("switcher: the union — unmapped entries carry the state word; Edgewood shows 19; default view stays mapped", async ({ page }) => {
  const state: State = { mode: "refuse422", captured: [] };
  await guard(page, state);
  await openWorkspace(page, "job-map");
  await operatorOn(page);
  const viewed = await page.locator("[data-fr-region=stages]").getAttribute("data-fr-set-key");
  await page.getByTestId("jobmap-switcher-open").click();
  const options = page.getByTestId("jobmap-switcher-option");
  await expect(options).toHaveCount(19);
  await expect(page.locator('[data-testid=jobmap-switcher-option][data-fr-mapped="true"]')).toHaveCount(2);
  await expect(page.locator('[data-testid=jobmap-switcher-state]')).toHaveCount(17);
  await expect(page.locator(`[data-testid=jobmap-switcher-option][data-fr-set-key="${viewed}"]`)).toHaveAttribute("data-fr-mapped", "true");
  await shot(page, "01-switcher-union");
  expect(state.captured).toHaveLength(0);
});

test("unmapped market viewed: executor band, wordless Absent, the ONE control (glyph on) — and nothing with the glyph off", async ({ page }) => {
  const state: State = { mode: "refuse422", captured: [] };
  await guard(page, state);
  await openWorkspace(page, "job-map");
  // glyph off first: the unmapped market cannot even be viewed (no switcher) — the client never sees the door
  await expect(page.getByTestId("jobmap-switcher-open")).toHaveCount(0);
  await expect(page.locator("[data-fr-operator]")).toHaveCount(0);
  await operatorOn(page);
  const key = await viewFirstUnmapped(page);
  // The executor band is THIS market's definition (keyed read), never the spine's.
  const executor = await page.evaluate(async ({ companyId, key }) => {
    const sb = (window as unknown as { supabase: { from: (t: string) => any } }).supabase;
    const { data } = await sb.from("odi_market_definitions").select("job_executor").eq("company_id", companyId).eq("journey_key", key).is("retracted_at", null).maybeSingle();
    return String(data?.job_executor ?? "");
  }, { companyId: COMPANY_ID, key });
  expect(executor.length).toBeGreaterThan(0);
  await expect(page.getByTestId("jobmap-hypothesis").locator(".fr-ws-band-text")).toHaveText(executor);
  await expect(page.locator("[data-fr-absent=job-steps]")).toHaveCount(1);
  await expect(page.locator("[data-fr-region=stages]")).toHaveCount(0);
  const control = page.getByTestId("jobmap-generate");
  await expect(control).toHaveText("Generate job map");
  await expect(control).toHaveAttribute("data-fr-operator", "generate-jobmap");
  await expect(page.getByTestId("jobmap-choose")).toHaveCount(0);
  await expect(page.getByTestId("jobmap-regenerate")).toHaveCount(0);
  await expect(page.locator("[data-fr-seed-note]")).toHaveCount(1);
  await shot(page, "02-unmapped-glyph-on");
  // glyph off: the view stays (state), the control and every operator node vanish, the Absent stays wordless
  await page.locator("[data-fr-operator-switch]").click();
  await expect(page.locator("[data-fr-operator]")).toHaveCount(0);
  await expect(page.getByTestId("jobmap-generate")).toHaveCount(0);
  await expect(page.locator("[data-fr-absent=job-steps]")).toHaveText("");
  await shot(page, "03-unmapped-glyph-off");
  expect(await dbStepCount(page, key)).toBe(0);
  expect(state.captured).toHaveLength(0);
});

test("a. stub 422 no_market_definition → the failure note now; DB job_steps count for the key unchanged", async ({ page }) => {
  const state: State = { mode: "refuse422", captured: [] };
  await guard(page, state);
  await openWorkspace(page, "job-map");
  await operatorOn(page);
  const key = await viewFirstUnmapped(page);
  const before = await dbStepCount(page, key);
  await page.getByTestId("jobmap-generate").click();
  const note = page.getByTestId("jobmap-generate-failed");
  await expect(note).toBeVisible();
  await expect(note.locator(".fr-ws-generate-failed-note")).toHaveText(NOTE);
  await expect(page.getByTestId("jobmap-generate-failed-detail")).toHaveText("422 no_market_definition — No live market definition for journey 'x'.");
  await expect(page.getByTestId("jobmap-generate")).toHaveText("Generate job map");
  await expect(page.getByTestId("jobmap-generate")).toBeEnabled();
  await shot(page, "05-failure-note");
  // the request was the exact scoped shape, one key
  const gen = state.captured.filter((c) => GENERATE.test(c.url));
  expect(gen).toHaveLength(1);
  const body = gen[0].body as Record<string, unknown>;
  expect(Object.keys(body).sort()).toEqual(["company_id", "require_model", "selected_job_maps", "selected_maps_only", "trigger"]);
  expect(body).toMatchObject({ company_id: COMPANY_ID, selected_maps_only: true, require_model: true, trigger: `workspace_jobmap_generate:${key}` });
  expect(body.selected_job_maps).toEqual([{ journey_key: key, journey_title: expect.any(String), journey_subtitle: "" }]);
  expect(await dbStepCount(page, key)).toBe(before);
  expect(state.captured.filter((c) => !GENERATE.test(c.url))).toHaveLength(0);
});

test("b. stub 200 with fixture rows at the read boundary → entry flips to mapped, steps render, the view stays on the key", async ({ page }) => {
  const state: State = { mode: "ok", captured: [] };
  await guard(page, state);
  await openWorkspace(page, "job-map");
  await operatorOn(page);
  const key = await viewFirstUnmapped(page);
  await page.getByTestId("jobmap-generate").click();
  await expect(page.locator("[data-fr-region=stages]")).toHaveAttribute("data-fr-set-key", key);
  await expect(page.locator(".fr-ws-stage-title").first()).toContainText("Fixture step 1");
  await expect(page.getByTestId("jobmap-generate")).toHaveCount(0);
  await expect(page.getByTestId("jobmap-generate-failed")).toHaveCount(0);
  await expect(page.getByTestId("jobmap-regenerate")).toHaveCount(1);
  await page.getByTestId("jobmap-switcher-open").click();
  const entry = page.locator(`[data-testid=jobmap-switcher-option][data-fr-set-key="${key}"]`);
  await expect(entry).toHaveAttribute("data-fr-mapped", "true");
  await expect(entry).toHaveAttribute("aria-selected", "true");
  await expect(entry.locator("[data-testid=jobmap-switcher-state]")).toHaveCount(0);
  await shot(page, "06-post-success-mapped");
  expect(state.captured.filter((c) => !GENERATE.test(c.url))).toHaveLength(0);
});

test("c1. transport timeout → Working… holds; the poll finds rows planted at +12 s → done", async ({ page }) => {
  const state: State = { mode: "abort", captured: [] };
  await guard(page, state);
  await openWorkspace(page, "job-map");
  await operatorOn(page);
  const key = await viewFirstUnmapped(page);
  await page.getByTestId("jobmap-generate").click();
  const control = page.getByTestId("jobmap-generate");
  await expect(control).toHaveText("Working…");
  await expect(control).toBeDisabled();
  await shot(page, "04-working");
  await page.waitForTimeout(8_000);
  await expect(control).toHaveText("Working…"); // one poll has run and found nothing
  state.plantKey = key;                        // rows "land" at +12 s
  await expect(page.locator("[data-fr-region=stages]")).toHaveAttribute("data-fr-set-key", key, { timeout: 20_000 });
  await expect(page.getByTestId("jobmap-generate-failed")).toHaveCount(0);
  expect(state.captured.filter((c) => !GENERATE.test(c.url))).toHaveLength(0);
});

test("c2. transport timeout and nothing lands by the bound → the failure note at the bound (bound shortened to 15 s via window.__FR_JOBMAP_GEN_BOUND_MS)", async ({ page }) => {
  const state: State = { mode: "abort", captured: [] };
  await guard(page, state);
  await page.addInitScript(() => { (window as unknown as { __FR_JOBMAP_GEN_BOUND_MS: number }).__FR_JOBMAP_GEN_BOUND_MS = 15_000; });
  await openWorkspace(page, "job-map");
  await operatorOn(page);
  const key = await viewFirstUnmapped(page);
  const before = await dbStepCount(page, key);
  await page.getByTestId("jobmap-generate").click();
  await expect(page.getByTestId("jobmap-generate")).toHaveText("Working…");
  await page.waitForTimeout(10_000);
  await expect(page.getByTestId("jobmap-generate")).toHaveText("Working…");
  await expect(page.getByTestId("jobmap-generate-failed")).toBeVisible({ timeout: 15_000 });
  await expect(page.locator(".fr-ws-generate-failed-note")).toHaveText(NOTE);
  await expect(page.getByTestId("jobmap-generate-failed-detail")).toContainText("within 15 s of the click");
  await expect(page.getByTestId("jobmap-generate")).toHaveText("Generate job map");
  expect(await dbStepCount(page, key)).toBe(before);
  expect(state.captured.filter((c) => !GENERATE.test(c.url))).toHaveLength(0);
});
