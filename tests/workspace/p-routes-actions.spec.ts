// (p) Routes Tier 1 controls — proofs with NO real writes: every non-GET Supabase request (REST, storage,
// functions) is intercepted and answered synthetically; the spec asserts the request shape the workspace
// issues, which is the same shape the Workshop Routes tab issues through the same hooks (useRouteDecision,
// useDriftScan.checkSurfaceGated, useRouteProposalHandlers) and the same component (LegTestPanel). Reads
// pass through to the real fixture (Edgewood: 7 routes · 14 legs, 11 test-class · 1 declined leg · a real
// slight_drift assessment on one route · selected_route_id null · program_phase diagnose), except the reads
// a proof must control — each a PLANT the vacuity tests show is load-bearing:
//   choice   companies GET selected_route_id echoes the guard's chosen id (the workspace marker follows the
//            READ, never the click); a planted id gives the "changed" / "cleared" starting states
//   phase    companies GET program_phase → flow (the DriftBadge phase matrix hides drift in diagnose)
// Capability-false negatives are NOT drivable here (local admin bypass) — see RoutesOrgPanel.lift.test.tsx.
import { expect, test, type Page, type Route } from "playwright/test";
import { COMPANY_ID } from "../../playwright.config";
import { openWorkspace } from "./helpers";

type Captured = { method: string; url: string; body: unknown };
const SUPABASE = /\/(rest|storage|functions)\/v1\//;

type Plants = {
  /** The choice the companies read answers with; undefined = pass the real row through (no echo). */
  chosen?: string | null;
  /** Plant program_phase flow on the companies read. */
  phaseFlow?: boolean;
};
type Guard = { captured: Captured[]; state: { chosen?: string | null; assessmentIds: Map<string, string> } };

async function guardWrites(page: Page, plants: Plants = {}): Promise<Guard> {
  const captured: Captured[] = [];
  const state: Guard["state"] = { chosen: plants.chosen, assessmentIds: new Map() };
  // The echo is armed only by the plant: a PATCH updates the echoed value, it never turns the echo on.
  const echo = plants.chosen !== undefined;
  await page.route(SUPABASE, async (route: Route) => {
    const req = route.request();
    const method = req.method();
    const url = req.url();
    if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
      if (/\/rest\/v1\/companies\?/.test(url) && (echo || plants.phaseFlow)) {
        const res = await route.fetch();
        let rows: unknown;
        try { rows = JSON.parse(await res.text()); } catch { return route.fulfill({ response: res }); }
        const patch = (r: Record<string, unknown>) => {
          if (r.id !== COMPANY_ID) return r;
          const out = { ...r };
          if (plants.phaseFlow) out.program_phase = "flow";
          if (echo) {
            out.selected_route_id = state.chosen ?? null;
            out.selected_route_updated_at = state.chosen ? "2026-09-12T12:00:00.000Z" : null;
            out.selected_route_summary_json = state.chosen ? { bullets: ["planted"], route_title: "Planted", route_category: "fix" } : {};
          }
          return out;
        };
        const out = Array.isArray(rows) ? rows.map((r) => patch(r as Record<string, unknown>)) : patch(rows as Record<string, unknown>);
        return route.fulfill({ response: res, body: JSON.stringify(out), headers: { ...res.headers(), "content-type": "application/json" } });
      }
      if (/\/rest\/v1\/surface_drift_assessments\?/.test(url)) {
        // Record the real assessment id per surface so the Accept proof can name it. A read still in
        // flight when the test ends (badges re-read on teardown) is simply dropped.
        try {
          const res = await route.fetch();
          const text = await res.text();
          try {
            const row = JSON.parse(text) as { id?: string; surface_id?: string } | Array<{ id?: string; surface_id?: string }>;
            const first = Array.isArray(row) ? row[0] : row;
            if (first?.id && first.surface_id) state.assessmentIds.set(first.surface_id, first.id);
          } catch { /* 406 no-row */ }
          return await route.fulfill({ response: res, body: text });
        } catch (err) {
          if (/closed/i.test(String(err))) return;
          throw err;
        }
      }
      return route.continue();
    }
    let body: unknown = null;
    try { body = req.postDataJSON(); } catch { body = req.postData(); }
    captured.push({ method, url, body });
    if (/\/rest\/v1\/companies\?/.test(url) && method === "PATCH") {
      const b = body as Record<string, unknown>;
      if ("selected_route_id" in b) state.chosen = (b.selected_route_id as string | null) ?? null;
      return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    }
    if (/\/rest\/v1\/surface_drift_assessments\?/.test(url) && method === "PATCH") {
      const id = new URL(url).searchParams.get("id")?.replace(/^eq\./, "");
      const sid = [...state.assessmentIds.entries()].find(([, aid]) => aid === id)?.[0];
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id, surface_type: "route", surface_id: sid, drift_state: "slight_drift", ...(body as object) }) });
    }
    if (/\/functions\/v1\/assess-surface-drift/.test(url)) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ assessed: 1, aligned: 1, slight_drift: 0, material_drift: 0 }) });
    if (/\/functions\/v1\/generate-leg-tests/.test(url)) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, perLeg: [] }) });
    if (/\/functions\/v1\//.test(url)) return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    if (method === "POST" && /\/rest\/v1\//.test(url)) {
      const row = { id: "synthetic-row", ...(typeof body === "object" && body && !Array.isArray(body) ? (body as object) : {}) };
      return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify(Array.isArray(body) ? [row] : row) });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });
  return { captured, state };
}

async function operatorOn(page: Page) {
  await page.locator("[data-fr-operator-switch]").click();
  await expect(page.locator("[data-fr-operator-switch]")).toHaveAttribute("data-fr-operator-switch", "on");
}
/** Expand the route at `index` (the first is open by default) and return its article + id. */
async function expandRoute(page: Page, index: number) {
  const item = page.getByTestId("routes-item").nth(index);
  if ((await item.getAttribute("data-expanded")) !== "true") await item.locator(".fr-ws-route-head").click();
  await expect(item).toHaveAttribute("data-expanded", "true");
  return { item, id: (await item.getAttribute("data-fr-route-id"))! };
}
const q = (c: Captured) => new URL(c.url).searchParams;
const CONTROL_IDS = ["routes-actions", "routes-choose", "routes-choose-btn", "routes-check-drift-route", "routes-drift-badge-route", "routes-legs", "routes-leg", "routes-check-drift-leg", "routes-leg-test"];
const DRIFT_ROUTE = "c3c9b9c2-7804-4d7a-909d-61987d4a030b"; // the fixture's real slight_drift assessment lives on this route

test("e. default render: zero operator nodes and none of the controls; the accordion still reads", async ({ page }) => {
  const g = await guardWrites(page, { chosen: "planted", phaseFlow: true });
  await openWorkspace(page, "routes");
  await expect(page.getByTestId("routes-item").first()).toBeVisible();
  await expect(page.locator("[data-fr-operator]")).toHaveCount(0);
  for (const id of CONTROL_IDS) await expect(page.getByTestId(id)).toHaveCount(0);
  await expect(page.getByTestId("routes-item-body").first()).toBeVisible(); // conditions still render for the reader
  expect(g.captured).toHaveLength(0);
});

test("a. Choose this path →: companies PATCH (selection columns, by id) + route_decision_events 'selected'; the CHOSEN PATH marker appears only once the read echoes the choice", async ({ page }) => {
  const g = await guardWrites(page, { chosen: null });
  await openWorkspace(page, "routes");
  await operatorOn(page);
  const { item, id } = await expandRoute(page, 0);
  await expect(item.getByTestId("routes-chosen-marker")).toHaveCount(0);
  await expect(item.getByTestId("routes-choose-btn")).toHaveText("Choose this path →");
  await item.getByTestId("routes-choose-btn").click();
  await expect.poll(() => g.captured.length).toBe(2);
  const [patch, event] = g.captured;
  expect(patch.method).toBe("PATCH");
  expect(/\/rest\/v1\/companies\?/.test(patch.url)).toBe(true);
  expect(q(patch).get("id")).toBe(`eq.${COMPANY_ID}`);
  expect(Object.keys(patch.body as object).sort()).toEqual(["selected_route_id", "selected_route_summary_json", "selected_route_updated_at"]);
  expect((patch.body as { selected_route_id: string }).selected_route_id).toBe(id);
  const summary = (patch.body as { selected_route_summary_json: { route_title: string; route_category: string; bullets: string[] } }).selected_route_summary_json;
  expect(summary.route_title).toBe((await item.locator(".fr-ws-route-title").first().innerText()).trim());
  expect(Array.isArray(summary.bullets)).toBe(true);
  expect(event.method).toBe("POST");
  expect(/\/rest\/v1\/route_decision_events/.test(event.url)).toBe(true);
  expect(event.body).toMatchObject({ company_id: COMPANY_ID, route_id: id, event_type: "selected", summary_json: summary });
  // The guard now echoes the choice on the companies read: the marker follows it.
  await expect(item.getByTestId("routes-chosen-marker")).toHaveText("CHOSEN PATH");
  await expect(item).toHaveAttribute("data-fr-chosen", "true");
  await expect(item.getByTestId("routes-choose-btn")).toHaveText("Deselect");
  // A second route reads as the working hypothesis, not chosen.
  const second = await expandRoute(page, 1);
  await expect(second.item.getByTestId("routes-chosen-marker")).toHaveText("Working hypothesis");
  await expect(second.item.getByTestId("routes-choose-btn")).toHaveText("Choose this path →");
});

test("a2. Choose while another route is chosen (planted): event_type 'changed'", async ({ page }) => {
  const g = await guardWrites(page, { chosen: DRIFT_ROUTE });
  await openWorkspace(page, "routes");
  await operatorOn(page);
  const { item, id } = await expandRoute(page, 0);
  test.skip(id === DRIFT_ROUTE, "the first route is the planted one — pick another");
  await expect(item.getByTestId("routes-chosen-marker")).toHaveText("Working hypothesis");
  await item.getByTestId("routes-choose-btn").click();
  await expect.poll(() => g.captured.length).toBe(2);
  expect((g.captured[0].body as { selected_route_id: string }).selected_route_id).toBe(id);
  expect(g.captured[1].body).toMatchObject({ route_id: id, event_type: "changed" });
  await expect(item.getByTestId("routes-chosen-marker")).toHaveText("CHOSEN PATH");
});

test("c. Deselect (planted chosen route): nulling companies PATCH + 'cleared' carrying the prior summary; the marker leaves on the read", async ({ page }) => {
  const g = await guardWrites(page, { chosen: DRIFT_ROUTE });
  await openWorkspace(page, "routes");
  await operatorOn(page);
  const idx = await page.getByTestId("routes-item").evaluateAll((els, want) => els.findIndex((e) => e.getAttribute("data-fr-route-id") === want), DRIFT_ROUTE);
  expect(idx).toBeGreaterThanOrEqual(0);
  const { item } = await expandRoute(page, idx);
  await expect(item.getByTestId("routes-chosen-marker")).toHaveText("CHOSEN PATH");
  await expect(item.getByTestId("routes-choose-btn")).toHaveText("Deselect");
  await item.getByTestId("routes-choose-btn").click();
  await expect.poll(() => g.captured.length).toBe(2);
  const [patch, event] = g.captured;
  expect(patch.method).toBe("PATCH");
  expect(q(patch).get("id")).toBe(`eq.${COMPANY_ID}`);
  expect(patch.body).toEqual({ selected_route_id: null, selected_route_summary_json: {}, selected_route_updated_at: null });
  expect(event.body).toMatchObject({ company_id: COMPANY_ID, route_id: DRIFT_ROUTE, event_type: "cleared", summary_json: { route_title: "Planted" } });
  await expect(item.getByTestId("routes-chosen-marker")).toHaveCount(0);
  await expect(item.getByTestId("routes-choose-btn")).toHaveText("Choose this path →");
});

test("d. Check for drift on the route and on a leg: assess-surface-drift {company_id, surface_type:'route', surface_id}; the view's toast renders", async ({ page }) => {
  const g = await guardWrites(page);
  await openWorkspace(page, "routes");
  await operatorOn(page);
  const { item, id } = await expandRoute(page, 0);
  await item.getByTestId("routes-check-drift-route").click();
  await expect.poll(() => g.captured.length).toBe(1);
  expect(/\/functions\/v1\/assess-surface-drift/.test(g.captured[0].url)).toBe(true);
  expect(g.captured[0].body).toEqual({ company_id: COMPANY_ID, surface_type: "route", surface_id: id });
  await expect(page.getByText("Checked route · aligned").first()).toBeVisible();
  const leg = item.getByTestId("routes-leg").first();
  const legId = await leg.getAttribute("data-fr-leg-id");
  await leg.getByTestId("routes-check-drift-leg").click();
  await expect.poll(() => g.captured.length).toBe(2);
  expect(g.captured[1].body).toEqual({ company_id: COMPANY_ID, surface_type: "route", surface_id: legId });
});

test("f. Generate test (per leg): generate-leg-tests carries leg_ids:[that leg] — never the company-wide body", async ({ page }) => {
  const g = await guardWrites(page);
  await openWorkspace(page, "routes");
  await operatorOn(page);
  // Find a test-class leg that is not the declined residual.
  let target: { legId: string } | null = null;
  const n = await page.getByTestId("routes-item").count();
  for (let i = 0; i < n && !target; i++) {
    const { item } = await expandRoute(page, i);
    const leg = item.locator('[data-testid=routes-leg][data-fr-test-leg="true"]:not([data-fr-declined])').first();
    if (await leg.count()) target = { legId: (await leg.getAttribute("data-fr-leg-id"))! };
  }
  expect(target).not.toBeNull();
  const panel = page.locator(`[data-testid=routes-leg][data-fr-leg-id="${target!.legId}"]`).getByTestId("routes-leg-test");
  await expect(panel).toBeVisible();
  const gen = panel.getByRole("button", { name: /Generate test|Regenerate test/ });
  await expect(gen).toBeVisible();
  await gen.click();
  await expect.poll(() => g.captured.length).toBe(1);
  expect(/\/functions\/v1\/generate-leg-tests/.test(g.captured[0].url)).toBe(true);
  expect(g.captured[0].body).toEqual({ company_id: COMPANY_ID, write: true, leg_ids: [target!.legId] });
  await expect(page.getByText("Tests drafted — hypotheses only, no results invented")).toBeVisible();
});

test("f2. negative: the declined leg shows its stored reason and NO Generate test control", async ({ page }) => {
  const g = await guardWrites(page);
  await openWorkspace(page, "routes");
  await operatorOn(page);
  let declined = page.locator("[data-testid=routes-leg][data-fr-declined]");
  const n = await page.getByTestId("routes-item").count();
  for (let i = 0; i < n && (await declined.count()) === 0; i++) {
    await expandRoute(page, i);
    declined = page.locator("[data-testid=routes-leg][data-fr-declined]");
  }
  await expect(declined.first()).toBeVisible();
  const panel = declined.first().getByTestId("routes-leg-test");
  await expect(panel).toContainText("The honesty check declined this test.");
  await expect(panel.getByRole("button", { name: /Generate test|Regenerate test/ })).toHaveCount(0);
  expect(g.captured).toHaveLength(0);
});

test("g. Drift badge (real slight_drift row + planted flow phase) → panel: Accept as aligned PATCHes the assessment by id; Propose route changes invokes propose-route-changes {route_id, company_id}", async ({ page }) => {
  const g = await guardWrites(page, { phaseFlow: true });
  await openWorkspace(page, "routes");
  await operatorOn(page);
  const idx = await page.getByTestId("routes-item").evaluateAll((els, want) => els.findIndex((e) => e.getAttribute("data-fr-route-id") === want), DRIFT_ROUTE);
  expect(idx).toBeGreaterThanOrEqual(0);
  const { item } = await expandRoute(page, idx);
  const badge = item.getByTestId("routes-drift-badge-route").getByRole("button");
  await expect(badge).toBeVisible();
  await badge.click();
  const propose = page.getByRole("button", { name: "Propose route changes from current evidence" });
  await expect(propose).toBeVisible();
  await propose.click();
  const proposes = () => g.captured.filter((c) => /\/functions\/v1\/propose-route-changes/.test(c.url));
  await expect.poll(() => proposes().length).toBe(1);
  expect(proposes()[0].body).toEqual({ route_id: DRIFT_ROUTE, company_id: COMPANY_ID });
  await expect(propose).toHaveCount(0); // the panel closes after proposing
  // Reopen and accept. (Opening the panel also stamps operator_seen_at on the real row — a PATCH the
  // guard swallows; it is the old tab's behaviour, not a Tier 1 write, so it is excluded below.)
  await badge.click();
  const accept = page.getByTestId("drift-accept-aligned");
  await expect(accept).toBeEnabled();
  await accept.click();
  const accepts = () => g.captured.filter((c) => c.method === "PATCH" && /\/rest\/v1\/surface_drift_assessments\?/.test(c.url) && "accepted_as_aligned_at" in (c.body as object));
  await expect.poll(() => accepts().length).toBe(1);
  const patch = accepts()[0];
  const others = g.captured.filter((c) => !proposes().includes(c) && !accepts().includes(c));
  expect(others.every((c) => c.method === "PATCH" && /surface_drift_assessments/.test(c.url) && Object.keys(c.body as object).join() === "operator_seen_at")).toBe(true);
  expect(patch.method).toBe("PATCH");
  expect(/\/rest\/v1\/surface_drift_assessments\?/.test(patch.url)).toBe(true);
  expect(q(patch).get("id")).toBe(`eq.${g.state.assessmentIds.get(DRIFT_ROUTE)}`);
  expect(Object.keys(patch.body as object)).toEqual(["accepted_as_aligned_at"]);
  await expect(accept).toHaveCount(0);
});

// ── Vacuity (7d): each plant is load-bearing. ──
test("v1. without the choice echo, the marker never appears — the write alone does not make a route read as chosen", async ({ page }) => {
  const g = await guardWrites(page); // real companies row (selected_route_id null), no echo
  await openWorkspace(page, "routes");
  await operatorOn(page);
  const { item } = await expandRoute(page, 0);
  await item.getByTestId("routes-choose-btn").click();
  await expect.poll(() => g.captured.length).toBe(2);
  await expect(item.getByTestId("routes-choose-btn")).toHaveText("Choose this path →");
  await expect(item.getByTestId("routes-chosen-marker")).toHaveCount(0);
});

test("v2. without the phase plant (real diagnose), the real drift row renders no badge — proof g depends on the plant", async ({ page }) => {
  await guardWrites(page);
  await openWorkspace(page, "routes");
  await operatorOn(page);
  const idx = await page.getByTestId("routes-item").evaluateAll((els, want) => els.findIndex((e) => e.getAttribute("data-fr-route-id") === want), DRIFT_ROUTE);
  const { item } = await expandRoute(page, idx);
  await expect(item.getByTestId("routes-check-drift-route")).toBeVisible();
  await expect(item.getByTestId("routes-drift-badge-route").getByRole("button")).toHaveCount(0);
});
