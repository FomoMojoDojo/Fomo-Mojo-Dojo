// (y) C3b (ruling 2026-09-18) — an own-words claim minted from a registry's self-reported span renders on beat 3
// "What you say" under the EXISTING own-words frame ("In your words" + Source: guidestar.org · read {crawl date}),
// quoted (fidelity verbatim) — and the C2 profile chip ("In your profile · …") never renders on it (it is an
// own_words / public_observed claim, not publicly_declared). Fixture claims STUBBED at the network layer on the
// Edgewood fixture (nothing written; the write-guard proves it).
import { expect, test, type Page } from "playwright/test";
import { COMPANY_ID } from "../../playwright.config";
import { open } from "./helpers";

const GS = "https://www.guidestar.org/profile/94-1186168";
const REGISTRY_QUOTE = {
  id: "aaaaaaaa-0000-4000-8000-00000000c3b1", company_id: COMPANY_ID, claim_type: "own_words", provenance: "public_observed", status: "active",
  statement: "We provide the people, place, and path for exceptional youth mental healthcare.", statement_kind: "positioning", declared_eligible: true,
  topic: "own_words", proof_category: "public_answerable", created_at: "2026-09-18T04:00:00Z", struck_reason: null, struck_at: null, struck_by: null,
  raw_payload: {
    content_identity: "fixture-ci-1", page_url: GS, verbatim_span: { offset: 8, length: 79, relative_to: "registry_span" }, fidelity: "verbatim", source: "own_words_extractor",
    read_at: "2026-09-14T14:52:51.890Z",
    registry_origin: { host: "guidestar.org", page_url: GS, snapshot_row_id: "bbbbbbbb-0000-4000-8000-000000000001", snapshot_sha: "7905f8a4", section: "self_reported", start: 311, end: 398, span_index: 0, signal_ids: [], verified_at: "2026-09-18T04:00:00Z" },
  },
};

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

test("beat 3: a registry span quote renders under the own-words frame (guidestar.org · read September 14, 2026), quoted; no profile chip", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const writes = await guardNoWrites(page);
  // the own-words read: claims?…claim_type=eq.own_words → the fixture row only
  await page.route(/\/rest\/v1\/claims\?/, (route) => {
    const url = route.request().url();
    return /claim_type=eq\.own_words/.test(url)
      ? route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([REGISTRY_QUOTE]) })
      : route.fallback();
  });
  await open(page, `/preview/client-refine/first-read/${COMPANY_ID}`);
  for (let i = 0; i < 3; i++) { await page.keyboard.press("ArrowRight"); await page.waitForTimeout(300); }
  await page.waitForLoadState("networkidle");
  const row = page.locator(".fr-hanging-row-title", { hasText: "We provide the people, place, and path for exceptional youth mental healthcare." }).first();
  await expect(row).toBeVisible({ timeout: 60_000 });
  const rowRoot = row.locator("xpath=ancestor::*[contains(@class,'fr-hanging-row-body')]").first();
  await expect(rowRoot.locator(".fr-quote-mark")).toHaveCount(1); // verbatim → quoted
  await expect(rowRoot.locator(".fr-tag")).toContainText("guidestar.org · read September 14, 2026"); // the own-words frame, dated by the registry crawl
  const bodyText = await page.locator("body").textContent();
  expect(bodyText).toContain("In your words");
  expect(bodyText).not.toMatch(/In your profile/); // the C2 profile chip never renders on an own_words claim
  await expect(page.getByTestId("claim-origin-chip")).toHaveCount(0);
  await row.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("beat3-registry-own-words.png"), fullPage: false });
  expect(writes, "fixture render wrote nothing").toEqual([]);
});
