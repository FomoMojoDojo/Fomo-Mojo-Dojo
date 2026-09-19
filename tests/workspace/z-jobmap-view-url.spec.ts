// (z) FLIP + M3 (operator rulings, signed 2026-09-19) — the viewed market lives in the URL. Guard (d):
// switch to a funder market (a mapped non-customer set), click stage 3, reload — the executor band, the
// title and the URL still name the funder market; the switcher button shows its name; Choose / ON
// STRATEGY absent; the seed note absent. Planted failure: revert the view to component state
// (JobMapPage viewKey in useState) → the stage remount drops the view and the reload lands on the seed.
// Reads only — every non-GET Supabase request is captured and refused.
import { expect, test, type Page, type Route } from "playwright/test";
import { COMPANY_ID } from "../../playwright.config";
import { openWorkspace, wsPath } from "./helpers";

const SUPABASE = /\/(rest|storage|functions)\/v1\//;
const CHOICE_READ = /\/rest\/v1\/operator_primary_selection\?.*domain=eq\.job_step_set/;

async function guard(page: Page, captured: string[]) {
  await page.route(SUPABASE, async (route: Route) => {
    const req = route.request(); const method = req.method(); const url = req.url();
    if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
      if (CHOICE_READ.test(url)) return route.fulfill({ status: 200, contentType: "application/json", body: "[]" }); // no chosen set
      return route.continue();
    }
    captured.push(`${method} ${url}`);
    return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });
}
async function operatorOn(page: Page) {
  await page.locator("[data-fr-operator-switch]").click();
  await expect(page.locator("[data-fr-operator-switch]")).toHaveAttribute("data-fr-operator-switch", "on");
}
/** A mapped, non-customer, non-internal set with its executor and lens title, from the DB through the app's DEV client. */
async function funderMarket(page: Page): Promise<{ key: string; executor: string; lensTitle: string } | null> {
  return page.evaluate(async ({ companyId }) => {
    const sb = (window as unknown as { supabase: { from: (t: string) => any } }).supabase;
    const { data: steps } = await sb.from("job_steps").select("journey_key").eq("company_id", companyId).limit(400);
    const keys = Array.from(new Set(((steps ?? []) as Array<{ journey_key: string }>).map((r) => r.journey_key))).filter((k) => k !== "customer" && !k.startsWith("customer-") && k !== "internal").sort();
    if (!keys.length) return null;
    const key = keys[0];
    const [{ data: def }, { data: lens }] = await Promise.all([
      sb.from("odi_market_definitions").select("job_executor").eq("company_id", companyId).eq("journey_key", key).is("retracted_at", null).maybeSingle(),
      sb.from("market_lens").select("title").eq("company_id", companyId).eq("journey_key", key).maybeSingle(),
    ]);
    return { key, executor: String(def?.job_executor ?? ""), lensTitle: String(lens?.title ?? "") };
  }, { companyId: COMPANY_ID });
}
const shot = (page: Page, name: string) => page.screenshot({ path: `screenshots/item2/${name}.png`, fullPage: false });

async function expectFunderView(page: Page, m: { key: string; executor: string; lensTitle: string }) {
  await expect(page.locator("[data-fr-region=stages]")).toHaveAttribute("data-fr-set-key", m.key);
  await expect(page.getByTestId("jobmap-hypothesis").locator(".fr-ws-band-text")).toHaveText(m.executor);
  await expect(page.locator("h1.fr-ws-working-title")).toContainText(m.lensTitle);
  await expect(page.locator("h1.fr-ws-working-title")).not.toContainText("The customer job");
  expect(new URL(page.url()).searchParams.get("view")).toBe(m.key);
  await expect(page.getByTestId("jobmap-choose")).toHaveCount(0);
  await expect(page.locator(".fr-ws-setlead").getByText("On strategy", { exact: true })).toHaveCount(0);
  await expect(page.locator("[data-fr-seed-note]")).toHaveCount(0);
}

test("(d) switch to a funder market → stage 3 → reload: band, title and URL still name the funder market", async ({ page }) => {
  const captured: string[] = [];
  await guard(page, captured);
  await openWorkspace(page, "job-map");
  const m = await funderMarket(page);
  test.skip(!m, "no mapped funder market in the DB — nothing to switch to");
  if (!m) return;
  expect(m.executor.length).toBeGreaterThan(0);
  expect(m.lensTitle.length).toBeGreaterThan(0);
  // default: the customer set, no ?view=
  await expect(page.locator("[data-fr-region=stages]")).toHaveAttribute("data-fr-set-key", "customer");
  await expect(page.locator("h1.fr-ws-working-title")).toContainText("The customer job");
  expect(new URL(page.url()).searchParams.get("view")).toBeNull();
  await operatorOn(page);
  await page.getByTestId("jobmap-switcher-open").click();
  await page.locator(`[data-testid=jobmap-switcher-option][data-fr-set-key="${m.key}"]`).click();
  await expectFunderView(page, m);
  await expect(page.getByTestId("jobmap-switcher-open")).toHaveText(m.lensTitle); // the switcher shows the viewed market
  await shot(page, "70-funder-view");
  // stage 3 — the page remounts; the view holds
  await page.locator("[data-fr-stage-index='2']").click();
  await expect(page.getByTestId("jobmap-stage")).toHaveAttribute("data-fr-step", "3");
  await expectFunderView(page, m);
  await shot(page, "71-funder-view-stage-3");
  // reload — the URL carries the view
  await page.reload({ waitUntil: "networkidle" });
  await expect(page.getByTestId("workspace-root")).toBeVisible({ timeout: 60_000 });
  await expectFunderView(page, m);
  await shot(page, "72-funder-view-reloaded");
  expect(captured).toEqual([]);
});

test("(d) a direct ?view=<funder> link opens on the funder market; steps 2–8 keep it", async ({ page }) => {
  const captured: string[] = [];
  await guard(page, captured);
  await openWorkspace(page, "job-map");
  const m = await funderMarket(page);
  test.skip(!m, "no mapped funder market in the DB");
  if (!m) return;
  await openWorkspace(page, "job-map", `?view=${m.key}`);
  await expectFunderView(page, m);
  const n = await page.locator("[data-fr-stage-index]").count();
  for (let i = 1; i < n; i++) {
    await page.locator(`[data-fr-stage-index='${i}']`).click();
    await expect(page.getByTestId("jobmap-stage")).toHaveAttribute("data-fr-step", String(i + 1));
    await expect(page.locator("[data-fr-region=stages]")).toHaveAttribute("data-fr-set-key", m.key);
    expect(new URL(page.url()).searchParams.get("view")).toBe(m.key);
  }
  expect(captured).toEqual([]);
});

// ── T1 + T4 (operator, 2026-09-19): a long title (> 40 chars) renders at 3rem on the wide measure — the
// funder lens title is 3 lines at 1440; a short title (the customer set) keeps the 3.75rem display size.
// Plant: drop the [data-fr-long-title] font-size rule → 60px and 5 lines.
async function titleMetrics(page: Page) {
  return page.evaluate(() => {
    const h = document.querySelector("h1.fr-ws-working-title") as HTMLElement;
    const cs = getComputedStyle(h);
    return { fontSize: cs.fontSize, lines: Math.round(h.getBoundingClientRect().height / parseFloat(cs.lineHeight)), long: h.hasAttribute("data-fr-long-title"), text: h.textContent ?? "" };
  });
}
test("(T4) a funder lens title renders at 48px in 3 lines at 1440, in full; the customer title stays 60px", async ({ page }) => {
  const captured: string[] = [];
  await guard(page, captured);
  await openWorkspace(page, "job-map");
  const m = await funderMarket(page);
  test.skip(!m, "no mapped funder market in the DB");
  if (!m) return;
  expect(page.viewportSize()).toEqual({ width: 1440, height: 900 });
  const customer = await titleMetrics(page);
  expect(customer).toMatchObject({ fontSize: "60px", long: false });
  expect(customer.text).toContain("The customer job");
  await openWorkspace(page, "job-map", `?view=${m.key}`);
  const funder = await titleMetrics(page);
  expect(funder.long).toBe(true);
  expect(funder.fontSize).toBe("48px");
  expect(funder.text).toContain(m.lensTitle); // never truncated
  expect(funder.lines).toBe(3);
  expect(captured).toEqual([]);
});
