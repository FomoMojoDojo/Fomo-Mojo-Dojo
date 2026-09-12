// (n) Job Map Tier 1 controls — proofs with NO real writes: every non-GET Supabase request (REST,
// storage, functions) is intercepted and answered synthetically; the spec asserts the request shape the
// workspace issues, which is the same shape the old surfaces issue through the same lifted hooks /
// functions. Reads pass through to the real fixture (Edgewood), except the two reads the proofs must
// control: the operator's choice (operator_primary_selection, domain job_step_set — mocked per test so
// "chosen" is a known state) and, in (d), one need's dependency_state (planted into a review state).
import { expect, test, type Page, type Route } from "playwright/test";
import { COMPANY_ID } from "../../playwright.config";
import { openWorkspace } from "./helpers";

type Captured = { method: string; url: string; body: unknown };
const SUPABASE = /\/(rest|storage|functions)\/v1\//;
const CHOICE_READ = /\/rest\/v1\/operator_primary_selection\?.*domain=eq\.job_step_set/;
const ON_STRATEGY = "On strategy";
const SEED_NOTE = "Not chosen — showing the largest set";

type GuardState = {
  /** The choice the read answers with (null = nothing chosen); undefined = pass the read through. */
  chosen?: string | null;
  /** When set, the choice read waits on it before answering — proves the chip follows the read. */
  holdRead?: Promise<void>;
  /** Need ids the guard presents as reviewed (dependency_state fresh) after their PATCH. */
  reviewed: Set<string>;
  /** Plant: the first need of the viewed set is presented in a review state; its id is recorded here. */
  plantReviewOnFirstNeed?: boolean;
  plantedNeedId?: string;
};

async function guardWrites(page: Page, state: GuardState): Promise<Captured[]> {
  const captured: Captured[] = [];
  await page.route(SUPABASE, async (route: Route) => {
    const req = route.request();
    const method = req.method();
    const url = req.url();
    if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
      if (CHOICE_READ.test(url) && state.chosen !== undefined) {
        if (state.holdRead) await state.holdRead;
        const rows = state.chosen ? [{ item_key: state.chosen }] : [];
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(rows) });
      }
      if (/\/rest\/v1\/odi_needs\?/.test(url) && (state.plantReviewOnFirstNeed || state.reviewed.size > 0)) {
        const res = await route.fetch();
        let rows: Array<Record<string, unknown>> = [];
        try { rows = JSON.parse(await res.text()); } catch { return route.fulfill({ response: res }); }
        if (state.plantReviewOnFirstNeed && rows.length > 0 && !state.plantedNeedId) state.plantedNeedId = String(rows[0].id);
        const out = rows.map((r) => {
          if (state.reviewed.has(String(r.id))) return { ...r, dependency_state: "fresh" };
          if (state.plantedNeedId && String(r.id) === state.plantedNeedId) return { ...r, dependency_state: "needs_review" };
          return r;
        });
        return route.fulfill({ response: res, body: JSON.stringify(out), headers: { ...res.headers(), "content-type": "application/json" } });
      }
      return route.continue();
    }
    let body: unknown = null;
    try { body = req.postDataJSON(); } catch { body = req.postData(); }
    captured.push({ method, url, body });
    if (/\/rest\/v1\/operator_primary_selection\?/.test(url) && method === "POST") {
      state.chosen = String((body as Record<string, unknown>).item_key);
      return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify([body]) });
    }
    if (/\/rest\/v1\/odi_needs\?/.test(url) && method === "PATCH") {
      const id = new URL(url).searchParams.get("id")?.replace(/^eq\./, "");
      if (id) state.reviewed.add(id);
      return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    }
    if (/\/functions\/v1\/generate-step-conditions/.test(url)) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
    if (/\/functions\/v1\//.test(url)) return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    if (method === "POST" && /\/rest\/v1\//.test(url)) {
      const row = { id: "synthetic-row", ...(typeof body === "object" && body && !Array.isArray(body) ? (body as object) : {}) };
      return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify(Array.isArray(body) ? [row] : row) });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });
  return captured;
}

async function operatorOn(page: Page) {
  await page.locator("[data-fr-operator-switch]").click();
  await expect(page.locator("[data-fr-operator-switch]")).toHaveAttribute("data-fr-operator-switch", "on");
}
const lead = (page: Page) => page.locator(".fr-ws-setlead");
const stages = (page: Page) => page.locator("[data-fr-region=stages]");
const CONTROL_IDS = ["jobmap-switcher", "jobmap-switcher-open", "jobmap-choose", "jobmap-regenerate", "jobmap-evidence-toggle", "jobmap-evidence", "jobmap-mark-reviewed"];

test("e. default render: no operator nodes, none of the controls, the seed note when nothing is chosen", async ({ page }) => {
  await guardWrites(page, { chosen: null, reviewed: new Set() });
  await openWorkspace(page, "job-map");
  await expect(page.locator("[data-fr-operator]")).toHaveCount(0);
  for (const id of CONTROL_IDS) await expect(page.getByTestId(id)).toHaveCount(0);
  await expect(page.locator("[data-fr-seed-note]")).toHaveText(SEED_NOTE);
  await expect(lead(page)).not.toContainText(ON_STRATEGY);
  const text = await page.locator("[data-testid=workspace-stage]").innerText();
  expect(text).not.toMatch(/\bpin\b/i);
});

test("a. switcher: picking the other set changes the stage list and never shows ON STRATEGY", async ({ page }) => {
  // The fixture's real choice (customer) — the chip is on for the seeded view, then off for the other set.
  const captured = await guardWrites(page, { reviewed: new Set() });
  await openWorkspace(page, "job-map");
  await operatorOn(page);
  await expect(lead(page)).toContainText(ON_STRATEGY);
  const before = await stages(page).getAttribute("data-fr-set-key");
  const titleBefore = await page.locator(".fr-ws-stage-title").innerText();
  await page.getByTestId("jobmap-switcher-open").click();
  const list = page.getByTestId("jobmap-switcher-list");
  await expect(list).toBeVisible();
  await expect(list).toHaveAttribute("aria-label", "Switch market — viewing only");
  const options = page.getByTestId("jobmap-switcher-option");
  expect(await options.count()).toBeGreaterThan(1);
  await expect(page.locator(`[data-testid=jobmap-switcher-option][data-fr-set-key="${before}"]`)).toHaveAttribute("aria-selected", "true");
  const other = page.locator(`[data-testid=jobmap-switcher-option]:not([data-fr-set-key="${before}"])`).first();
  const otherKey = await other.getAttribute("data-fr-set-key");
  await other.click();
  await expect(list).toHaveCount(0);
  await expect(stages(page)).toHaveAttribute("data-fr-set-key", otherKey!);
  await expect(page.locator(".fr-ws-stage-title")).not.toHaveText(titleBefore);
  // The view moved; the choice did not: no chip, the seed note, and the Choose control for this set.
  await expect(lead(page)).not.toContainText(ON_STRATEGY);
  await expect(page.locator("[data-fr-seed-note]")).toHaveText(SEED_NOTE);
  await expect(page.getByTestId("jobmap-choose")).toHaveText("Choose this as the on-strategy set");
  // Switching is a view: nothing left the page.
  expect(captured).toHaveLength(0);
});

test("b. Choose: the click issues the operator_primary_selection upsert for the viewed key; the chip appears only after the read returns it", async ({ page }) => {
  let release!: () => void;
  const state: GuardState = { chosen: null, reviewed: new Set() };
  const captured = await guardWrites(page, state);
  await openWorkspace(page, "job-map");
  await operatorOn(page);
  await expect(lead(page)).not.toContainText(ON_STRATEGY);
  await expect(page.locator("[data-fr-seed-note]")).toHaveText(SEED_NOTE);
  const viewedKey = await stages(page).getAttribute("data-fr-set-key");
  const choose = page.getByTestId("jobmap-choose");
  await expect(choose).toHaveText("Choose this as the on-strategy set");
  expect(await choose.getAttribute("aria-label")).toBeNull();
  state.holdRead = new Promise<void>((r) => { release = r; });
  await choose.click();
  await expect.poll(() => captured.some((c) => /\/rest\/v1\/operator_primary_selection\?/.test(c.url) && c.method === "POST")).toBe(true);
  const upsert = captured.find((c) => /\/rest\/v1\/operator_primary_selection\?/.test(c.url) && c.method === "POST")!;
  const row = upsert.body as Record<string, unknown>;
  expect(row.item_key).toBe(viewedKey);
  expect(row.domain).toBe("job_step_set");
  expect(row.company_id).toBe(COMPANY_ID);
  expect(row.item_id).toBeNull();
  expect(typeof row.chosen_at).toBe("string");
  expect(new URL(upsert.url).searchParams.get("on_conflict")).toBe("company_id,domain");
  await expect.poll(() => captured.some((c) => /\/rest\/v1\/operator_primary_selection_audit/.test(c.url) && c.method === "POST")).toBe(true);
  const audit = captured.find((c) => /operator_primary_selection_audit/.test(c.url))!.body as Record<string, unknown>;
  expect(audit).toMatchObject({ company_id: COMPANY_ID, domain: "job_step_set", item_key: viewedKey, action: "set", reason: null });
  // The write is done but the read is held: no chip yet — the chip is the read's, not the click's.
  await page.waitForTimeout(400);
  await expect(lead(page)).not.toContainText(ON_STRATEGY);
  release();
  await expect(lead(page)).toContainText(ON_STRATEGY);
  await expect(page.locator("[data-fr-seed-note]")).toHaveCount(0);
  await expect(choose).toHaveCount(0);
  // Only the two rows the old pin wrote — nothing else left the page.
  expect(captured.map((c) => c.url.replace(/\?.*$/, "").replace(/^.*\/rest\/v1\//, ""))).toEqual(["operator_primary_selection", "operator_primary_selection_audit"]);
});

test("b2. Choose B while A is chosen: no set reads as chosen until the read confirms B (the old chip never outlives the write)", async ({ page }) => {
  let release!: () => void;
  const state: GuardState = { reviewed: new Set() };
  const captured = await guardWrites(page, state);
  await openWorkspace(page, "job-map");
  await operatorOn(page);
  // A = the fixture's chosen set (the seeded view carries the chip); present it through the mock from here on.
  const keyA = (await stages(page).getAttribute("data-fr-set-key"))!;
  await expect(lead(page)).toContainText(ON_STRATEGY);
  state.chosen = keyA;
  const pick = async (key: string) => {
    await page.getByTestId("jobmap-switcher-open").click();
    await page.locator(`[data-testid=jobmap-switcher-option][data-fr-set-key="${key}"]`).click();
    await expect(stages(page)).toHaveAttribute("data-fr-set-key", key);
  };
  await page.getByTestId("jobmap-switcher-open").click();
  const other = page.locator(`[data-testid=jobmap-switcher-option]:not([data-fr-set-key="${keyA}"])`).first();
  const b = (await other.getAttribute("data-fr-set-key"))!;
  await other.click();
  await expect(stages(page)).toHaveAttribute("data-fr-set-key", b);
  await expect(lead(page)).not.toContainText(ON_STRATEGY);
  // Choose B with the confirming read HELD.
  state.holdRead = new Promise<void>((r) => { release = r; });
  await page.getByTestId("jobmap-choose").click();
  await expect.poll(() => captured.some((c) => /\/rest\/v1\/operator_primary_selection\?/.test(c.url) && c.method === "POST")).toBe(true);
  expect((captured.find((c) => /operator_primary_selection\?/.test(c.url))!.body as Record<string, unknown>).item_key).toBe(b);
  // During the hold, look back at A: it must NOT read as chosen any more (the write is done; the read has not confirmed anything).
  await pick(keyA);
  await page.waitForTimeout(400);
  await expect(lead(page)).not.toContainText(ON_STRATEGY);
  await expect(page.locator("[data-fr-seed-note]")).toHaveText(SEED_NOTE);
  // The read returns B: A stays un-chosen; B carries the chip.
  release();
  await page.waitForTimeout(400);
  await expect(lead(page)).not.toContainText(ON_STRATEGY);
  await pick(b);
  await expect(lead(page)).toContainText(ON_STRATEGY);
  await expect(page.getByTestId("jobmap-choose")).toHaveCount(0);
});

test("c. Regenerate conditions: the invoke carries the set key and nothing else; no job_steps column is touched", async ({ page }) => {
  const captured = await guardWrites(page, { reviewed: new Set() });
  await openWorkspace(page, "job-map");
  await operatorOn(page);
  const viewedKey = await stages(page).getAttribute("data-fr-set-key");
  const btn = page.getByTestId("jobmap-regenerate");
  await expect(btn).toHaveText(/^(Regenerate|Generate) conditions$/);
  const conditionsBefore = await page.locator("[data-fr-block=conditions]").count();
  await btn.click();
  await expect.poll(() => captured.some((c) => /\/functions\/v1\/generate-step-conditions/.test(c.url))).toBe(true);
  const call = captured.find((c) => /generate-step-conditions/.test(c.url))!.body as Record<string, unknown>;
  expect(Object.keys(call).sort()).toEqual(["company_id", "journey_key"]);
  expect(call).toEqual({ company_id: COMPANY_ID, journey_key: viewedKey });
  for (const col of ["id", "journey_title", "step_number", "step_label", "designed", "item_key", "chosen_by"]) expect(call).not.toHaveProperty(col);
  await expect(btn).toHaveText(/^(Regenerate|Generate) conditions$/); // in-flight word gone once the run settles
  expect(captured.filter((c) => /\/rest\/v1\/job_steps/.test(c.url))).toHaveLength(0);
  expect(captured.filter((c) => /operator_primary_selection/.test(c.url))).toHaveLength(0);
  // The set is still the viewed set and the conditions still render through the gate.
  await expect(stages(page)).toHaveAttribute("data-fr-set-key", viewedKey!);
  expect(await page.locator("[data-fr-block=conditions]").count()).toBe(conditionsBefore);
});

test("d. evidence drawer opens and closes; Mark reviewed issues the odi_needs PATCH for that row's id and the row follows the read", async ({ page }) => {
  const state: GuardState = { reviewed: new Set(), plantReviewOnFirstNeed: true };
  const captured = await guardWrites(page, state);
  await openWorkspace(page, "job-map");
  await operatorOn(page);
  const toggle = page.getByTestId("jobmap-evidence-toggle");
  await expect(toggle).toHaveText("Show evidence");
  await expect(page.getByTestId("jobmap-evidence")).toHaveCount(0);
  await toggle.click();
  await expect(toggle).toHaveText("Hide evidence");
  const drawer = page.getByTestId("jobmap-evidence");
  await expect(drawer).toBeVisible();
  expect((await drawer.innerText()).trim().length).toBeGreaterThan(0);
  await toggle.click();
  await expect(toggle).toHaveText("Show evidence");
  await expect(drawer).toHaveCount(0);

  // The planted row (the viewed set's first need) sits on some stage: walk the stages until it renders.
  const plantedId = state.plantedNeedId!;
  expect(plantedId).toBeTruthy();
  const row = page.locator(`[data-fr-need-id="${plantedId}"]`);
  const stageButtons = page.locator("[data-fr-stage-index]");
  for (let i = 0; (await row.count()) === 0 && i < (await stageButtons.count()); i++) await stageButtons.nth(i).click();
  await expect(row).toHaveAttribute("data-fr-review", "pending");
  await expect(row).toContainText("review pending");
  await row.getByTestId("jobmap-mark-reviewed").click();
  await expect.poll(() => captured.some((c) => /\/rest\/v1\/odi_needs\?/.test(c.url) && c.method === "PATCH")).toBe(true);
  const patch = captured.find((c) => /\/rest\/v1\/odi_needs\?/.test(c.url) && c.method === "PATCH")!;
  expect(new URL(patch.url).searchParams.get("id")).toBe(`eq.${plantedId}`);
  const body = patch.body as Record<string, unknown>;
  expect(Object.keys(body).sort()).toEqual(["dependency_state", "last_reviewed_at", "stale_reason", "stale_since_event_id"]);
  expect(body).toMatchObject({ dependency_state: "fresh", stale_reason: null, stale_since_event_id: null });
  // The row leaves its review state through the re-read (the guard now presents it fresh).
  await expect(row).not.toHaveAttribute("data-fr-review", "pending");
  await expect(row).not.toContainText("review pending");
  expect(captured.filter((c) => c.method !== "PATCH" || !/odi_needs/.test(c.url))).toHaveLength(0);
});
