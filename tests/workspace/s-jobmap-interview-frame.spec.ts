// (s) Interview origin frame — gate 3 proofs (signed 2026-09-16), NO real writes: the keyed odi_needs
// read is augmented at the READ boundary with two fixture rows on the viewed set's step 1 — one
// client_attested (with its embedded record) and one market_interviewed — nothing is inserted into
// the DB. Asserts: chip text exact, data-fr-origin present, band absent on the market row, the
// person's name absent from the market row's DOM, the quote on expand, and every other row untouched.
import { expect, test, type Page, type Route } from "playwright/test";
import { COMPANY_ID } from "../../playwright.config";
import { openWorkspace } from "./helpers";

const SUPABASE = /\/(rest|storage|functions)\/v1\//;
const CHOICE_READ = /\/rest\/v1\/operator_primary_selection\?.*domain=eq\.job_step_set/;
const KEYED_NEEDS = /\/rest\/v1\/odi_needs\?.*journey_key=eq\./;
const STAKEHOLDER_QUOTE = "FIXTURE QUOTE (not a real interview): families wait days before anyone calls them back after the first form.";
const MARKET_QUOTE = "FIXTURE QUOTE (not a real donor): I give where I can see the outcome numbers within the year.";
// The market fixture row belongs to a FUNDER market (its own lens title), served on the viewed set's
// read so it renders on step 1 — proving the chip resolves the ROW's key, never the viewed step title.
const FUNDER_KEY = "mkt-funders-looking-to-support-impactful-you";

function fixtureRows(key: string) {
  const base = { company_id: COMPANY_ID, user_id: null, tier: "need", journey_key: key, step_number: 1, step_label: "", importance: 0, satisfaction: 0, opportunity_score: 0, service_state: "served", source_path: "interview", frameworks_used: ["interview"], created_at: "2026-09-16T00:00:00Z", updated_at: "2026-09-16T00:00:00Z", dependency_state: "fresh", validation_state: "unvalidated", evidence_state: "partial", status: "active", sort_order: 999, confidence: null, odi_canonical_statement: null };
  return [
    { ...base, id: "fixture-need-stakeholder", desired_outcome: "Minimize the wait before a family hears back after intake (fixture)", provenance_type: "client_attested", interview_record_id: "fixture-rec-s",
      interview_records: { id: "fixture-rec-s", speaker_role: "client_stakeholder", person_name: "Fixture Stakeholder", interviewed_at: "2026-09-16T17:00:00Z", verbatim: STAKEHOLDER_QUOTE, retracted_at: null } },
    { ...base, id: "fixture-need-market", journey_key: FUNDER_KEY, desired_outcome: "Minimize the time until a donor can see outcome numbers (fixture)", provenance_type: "market_interviewed", interview_record_id: "fixture-rec-m",
      interview_records: { id: "fixture-rec-m", speaker_role: "market_participant", person_name: "Fixture Donor Name", interviewed_at: "2026-09-16T17:00:00Z", verbatim: MARKET_QUOTE, retracted_at: null } },
  ];
}

async function guard(page: Page, state: { captured: string[] }) {
  await page.route(SUPABASE, async (route: Route) => {
    const req = route.request(); const method = req.method(); const url = req.url();
    if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
      if (CHOICE_READ.test(url)) return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
      if (KEYED_NEEDS.test(url) && method === "GET") {
        const res = await route.fetch();
        let rows: Array<Record<string, unknown>> = [];
        try { rows = JSON.parse(await res.text()); } catch { return route.fulfill({ response: res }); }
        const key = new URL(url).searchParams.get("journey_key")!.replace(/^eq\./, "");
        return route.fulfill({ response: res, body: JSON.stringify([...rows, ...fixtureRows(key)]), headers: { ...res.headers(), "content-type": "application/json" } });
      }
      return route.continue();
    }
    state.captured.push(`${method} ${url}`);
    if (/\/functions\/v1\//.test(url)) return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });
}
const shot = (page: Page, name: string) => page.screenshot({ path: `screenshots/item2/${name}.png`, fullPage: false });

test("job-map: both chips exact, origin attributes, no band and no name on the market row, quotes on expand, other rows untouched", async ({ page }) => {
  const state = { captured: [] as string[] };
  await guard(page, state);
  // P1 (2026-09-19): the customer map explicitly through ?view=customer (FLIP) — never the seed view.
  await openWorkspace(page, "job-map", "?view=customer");
  await expect(page.locator("[data-fr-region=stages]")).toHaveAttribute("data-fr-set-key", "customer");
  const marketLabel = (await page.locator(".fr-ws-setlead .fr-eyebrow, .fr-ws-setlead [class*=eyebrow]").first().innerText().catch(() => "")) || "";
  const s = page.locator("[data-fr-need-id=fixture-need-stakeholder]");
  const m = page.locator("[data-fr-need-id=fixture-need-market]");
  await expect(s).toBeVisible(); await expect(m).toBeVisible();
  // stakeholder: chip exact; NO value band (gate 3 delta, ruling 2)
  await expect(s.locator("[data-testid=need-origin]")).toHaveAttribute("data-fr-origin", "client_attested");
  await expect(s.locator("[data-testid=need-origin-chip]")).toHaveText("You told us · Fixture Stakeholder · Sep 16");
  await expect(s.locator(".fr-ws-opp-band")).toHaveCount(0);
  // market
  await expect(m.locator("[data-testid=need-origin]")).toHaveAttribute("data-fr-origin", "market_interviewed");
  // market: the label is market_lens.title for the row's key (never the step title), then the key
  const lensTitle = await page.evaluate(async ({ companyId, key }) => {
    const sb = (window as unknown as { supabase: { from: (t: string) => any } }).supabase;
    const { data } = await sb.from("market_lens").select("title").eq("company_id", companyId).eq("journey_key", key).maybeSingle();
    return String(data?.title ?? "").trim();
  }, { companyId: COMPANY_ID, key: FUNDER_KEY });
  expect(lensTitle.length).toBeGreaterThan(0);
  const viewedStepTitle = ((await page.locator(".fr-ws-setlead").textContent()) ?? "").trim();
  const chip = (await m.locator("[data-testid=need-origin-chip]").textContent()) ?? "";
  expect(chip).toBe(`${lensTitle} told us · Sep 16`);
  expect(chip.startsWith("You told us")).toBe(false);
  expect(viewedStepTitle).not.toContain(lensTitle); // the viewed set's (step-title) label is a different string — it never won
  const expectedLabel = lensTitle;
  await expect(m.locator(".fr-ws-opp-band")).toHaveCount(0);
  expect(await m.innerHTML()).not.toContain("Fixture Donor Name");
  // expand: the quotes, attributed to the person / the market label
  await s.locator("[data-testid=need-origin-chip]").click();
  await expect(s.locator("[data-testid=need-origin-quote] p")).toHaveText(STAKEHOLDER_QUOTE);
  await expect(s.locator("[data-testid=need-origin-quote] cite")).toHaveText("Fixture Stakeholder");
  await m.locator("[data-testid=need-origin-chip]").click();
  await expect(m.locator("[data-testid=need-origin-quote] p")).toHaveText(MARKET_QUOTE);
  const cite = (await m.locator("[data-testid=need-origin-quote] cite").textContent()) ?? "";
  expect(cite.length).toBeGreaterThan(0); expect(cite).not.toContain("Fixture Donor Name");
  expect(cite).toBe(expectedLabel); // the quote is attributed to the market label, never the person
  await m.scrollIntoViewIfNeeded();
  await shot(page, "12-market-row-fixture");
  await s.scrollIntoViewIfNeeded();
  await shot(page, "14-stakeholder-row-fixture-no-band");
  // every other row: no origin node, a band present
  const others = page.locator("[data-fr-need-id]:not([data-fr-need-id^=fixture-])");
  expect(await others.count()).toBeGreaterThan(0);
  await expect(others.locator("[data-testid=need-origin]")).toHaveCount(0);
  await expect(others.first().locator(".fr-ws-opp-band")).toHaveCount(1);
  expect(state.captured).toEqual([]);
  void marketLabel;
});

test("opportunities: neither interview row has a band in the list nor Potential in the aside; stakeholder row chipped", async ({ page }) => {
  const state = { captured: [] as string[] };
  await guard(page, state);
  await openWorkspace(page, "opportunities");
  const m = page.locator("[data-testid=opps-row][data-fr-need-id=fixture-need-market]");
  const s = page.locator("[data-testid=opps-row][data-fr-need-id=fixture-need-stakeholder]");
  await expect(m).toBeVisible(); await expect(s).toBeVisible();
  await expect(m.locator(".fr-ws-opprow-band")).toHaveCount(0);
  await expect(s.locator(".fr-ws-opprow-band")).toHaveCount(0);
  await expect(s.locator("[data-testid=need-origin-chip]")).toHaveText("You told us · Fixture Stakeholder · Sep 16");
  expect(await m.innerHTML()).not.toContain("Fixture Donor Name");
  const aside = page.locator("[data-testid=opps-aside]");
  for (const row of [m, s]) {
    await row.click();
    await expect(aside).toBeVisible();
    await expect(aside.locator("dt", { hasText: "Potential" })).toHaveCount(0);
  }
  expect(state.captured).toEqual([]);
});
