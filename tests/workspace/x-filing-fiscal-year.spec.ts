// (x) C3a (ruling 2026-09-18) — the filing frame carries the fiscal year the row's figures came from. The three
// Edgewood ProPublica rows are superseded and mint nothing, so the frame is rendered from STUBBED claims/deltas on
// the Edgewood fixture (nothing written; the write-guard proves it):
//   basis.fiscal_year "FYE June 2022" → "In your filing · projects.propublica.org · FYE June 2022"
//   no fiscal year                    → "In your filing · projects.propublica.org" — no trailing separator
import { expect, test, type Page } from "playwright/test";
import { COMPANY_ID } from "../../playwright.config";
import { open } from "./helpers";

const WITH_YEAR = { id: "aaaaaaaa-0000-4000-8000-00000000c3a1", statement: "FY 990: Revenue $31,008,000; Expenses $26,697,319; Net Income $4,310,681; Net Assets -$2,098,877.", provenance: "publicly_declared", status: "active",
  raw_payload: { origin: "registry_filing", host: "projects.propublica.org", page_type: "filing_data", section: "filing_data", fiscal_year: "FYE June 2022", snapshot_read_at: "2026-09-14T14:52:50.812Z" } };
const NO_YEAR = { id: "aaaaaaaa-0000-4000-8000-00000000c3a2", statement: "Net loss of -$1.87M then net income of +$4.3M with cumulative negative net assets of -$2.1M.", provenance: "publicly_declared", status: "active",
  raw_payload: { origin: "registry_filing", host: "projects.propublica.org", page_type: "filing_data", section: "filing_data", snapshot_read_at: "2026-09-14T14:52:50.812Z" } };
const PUBLIC = { id: "aaaaaaaa-0000-4000-8000-00000000c3a3", statement: "Kaiser Permanente lists Edgewood as an affiliated provider for residential treatment.", provenance: "public_observed", status: "active", raw_payload: {} };
const claimRow = (c: typeof WITH_YEAR) => ({ ...c, company_id: COMPANY_ID, struck_reason: null, struck_at: null, struck_by: null, proof_category: null, topic: "market", claim_type: "inference", created_at: "2026-09-18T00:00:00Z" });
const deltaRow = (id: string, declared: string) => ({ id, company_id: COMPANY_ID, delta_type: "echoed", pairing_basis: "judge_confirmed", judge_reason: "fixture", operator_disposition: null, declared_claim_id: declared, public_claim_id: PUBLIC.id, pairing_kind: "internal_vs_public" });

async function guardNoWrites(page: Page): Promise<string[]> {
  const writes: string[] = [];
  await page.route(/\/(rest|storage|functions)\/v1\//, async (route) => {
    const m = route.request().method();
    if (m === "GET" || m === "HEAD" || m === "OPTIONS") return route.fallback();
    if (/\/rest\/v1\/rpc\/find_primary_finding/.test(route.request().url())) return route.fallback();
    writes.push(`${m} ${route.request().url()}`);
    return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });
  return writes;
}

test("filing chip: FYE June 2022 renders as the trailing segment; a row without a year renders no trailing separator", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const writes = await guardNoWrites(page);
  await page.route(/\/rest\/v1\/claim_deltas\?/, (route) => {
    const url = route.request().url();
    return /pairing_kind=eq\.internal_vs_public/.test(url)
      ? route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([deltaRow("dddddddd-0000-4000-8000-00000000c3a1", WITH_YEAR.id), deltaRow("dddddddd-0000-4000-8000-00000000c3a2", NO_YEAR.id)]) })
      : route.fallback();
  });
  await page.route(/\/rest\/v1\/claims\?/, (route) => {
    const url = route.request().url();
    const rows = /provenance=eq\.public_observed/.test(url) ? [claimRow(PUBLIC)] : [claimRow(WITH_YEAR), claimRow(NO_YEAR), claimRow(PUBLIC)];
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(rows) });
  });

  await open(page, "/preview/client-refine/extracts");
  const chips = page.getByTestId("claim-origin-chip");
  await expect(chips).toHaveCount(2, { timeout: 60_000 });
  const texts = (await chips.allTextContents()).map((t) => t.trim()); // textContent: innerText carries the CSS uppercase
  expect(texts).toContain("In your filing · projects.propublica.org · FYE June 2022");
  expect(texts).toContain("In your filing · projects.propublica.org"); // exact: no " ·" tail when the year is absent
  for (const t of texts) expect(t).not.toMatch(/[·\s]$/);
  await expect(page.locator("[data-fr-origin=filing]")).toHaveCount(2);
  await chips.first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("filing-chip-fiscal-year.png"), fullPage: false });
  expect(writes, "fixture render wrote nothing").toEqual([]);
});
