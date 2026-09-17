// (w) publicly_declared (C2, signed 2026-09-17) — the company's own words arriving through a registry render on the
// SAY side under the two signed frames and never on an outside surface. Fixture claims/deltas are STUBBED at the
// network layer on the Edgewood fixture (nothing written; the write-guard proves it):
//   Extracts (Declared-vs-Observed): a filing-frame claim and a profile-frame claim each wear their chip;
//   First Read act 3 ("What the Outside Shows"): a publicly_declared row handed back on the perception read is
//   NOT rendered (isPublicProvenance allowlist).
import { expect, test, type Page } from "playwright/test";
import { COMPANY_ID } from "../../playwright.config";
import { open } from "./helpers";

const FILING = { id: "aaaaaaaa-0000-4000-8000-000000000001", statement: "Revenue $32,169,637 and net assets $27,326,581 for the fiscal year ending June 2025.", provenance: "publicly_declared", status: "active",
  raw_payload: { origin: "registry_filing", host: "projects.propublica.org", page_type: "filing_data", section: "filing_data", fiscal_year: "FY2025", snapshot_read_at: "2026-09-14T14:52:50.812Z" } };
const PROFILE = { id: "aaaaaaaa-0000-4000-8000-000000000002", statement: "Edgewood CSU is the only crisis stabilization unit serving youth under 12 in the Bay Area.", provenance: "publicly_declared", status: "active",
  raw_payload: { origin: "registry_filing", host: "guidestar.org", page_type: "profile", section: "self_reported", snapshot_read_at: "2026-09-14T14:52:51.890Z" } };
const PUBLIC = { id: "aaaaaaaa-0000-4000-8000-000000000003", statement: "Kaiser Permanente lists Edgewood as an affiliated provider for residential treatment.", provenance: "public_observed", status: "active", raw_payload: {} };
const claimRow = (c: typeof FILING) => ({ ...c, company_id: COMPANY_ID, struck_reason: null, struck_at: null, struck_by: null, proof_category: null, topic: "market", claim_type: "inference", created_at: "2026-09-17T00:00:00Z" });
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

test("Extracts: filing + profile frames on the declared side; act 3 never shows a publicly_declared row", async ({ page }) => {
  test.setTimeout(180_000);
  const writes = await guardNoWrites(page);
  // Extracts reads claim_deltas (internal_vs_public) + claims — stub both with the fixtures
  await page.route(/\/rest\/v1\/claim_deltas\?/, (route) => {
    const url = route.request().url();
    return /pairing_kind=eq\.internal_vs_public/.test(url)
      ? route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([deltaRow("dddddddd-0000-4000-8000-000000000001", FILING.id), deltaRow("dddddddd-0000-4000-8000-000000000002", PROFILE.id)]) })
      : route.fallback();
  });
  await page.route(/\/rest\/v1\/claims\?/, (route) => {
    const url = route.request().url();
    // the perception read asks for provenance=eq.public_observed — hand back a publicly_declared row anyway (the negative)
    const rows = /provenance=eq\.public_observed/.test(url) ? [claimRow(PUBLIC), claimRow(PROFILE)] : [claimRow(FILING), claimRow(PROFILE), claimRow(PUBLIC)];
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(rows) });
  });

  await open(page, "/preview/client-refine/extracts");
  const chips = page.getByTestId("claim-origin-chip");
  await expect(chips).toHaveCount(2, { timeout: 60_000 });
  await expect(chips.filter({ hasText: "In your filing · projects.propublica.org · FY2025" })).toHaveCount(1);
  await expect(chips.filter({ hasText: "In your profile · guidestar.org · Sep 14" })).toHaveCount(1);
  await expect(page.locator("[data-fr-origin=filing]")).toHaveCount(2);
  const body = await page.locator("body").innerText();
  expect(body).toMatch(/you declare/i); // the label renders uppercase via CSS
  expect(body).not.toMatch(/\bverdict\b/i);

  // act 3 — the outside surface: the publicly_declared row handed back by the read is NOT rendered
  await open(page, `/first-read/${COMPANY_ID}`);
  await page.keyboard.press("ArrowRight"); await page.keyboard.press("ArrowRight");
  await expect(page.getByText(PUBLIC.statement)).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(PROFILE.statement)).toHaveCount(0);
  expect(writes).toEqual([]);
});
