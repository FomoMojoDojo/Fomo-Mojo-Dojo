// (w) Interview capture on the Job Map — gate 4 proofs (signed 2026-09-16), NO real writes. The function
// is stubbed at the boundary (no Ollama in CI): propose (dry_run) returns a statement; save returns ids.
// The row's appearance is proven at the READ boundary the gate-3 spec uses: after the stubbed save, the
// keyed odi_needs re-read is augmented with the row the function would have written (its ids, the
// operator's edited statement, the record) — nothing is inserted into the DB. Also: the funder-market
// refusal path — the stub answers the function's own 422 no_step and the form renders it inline with the
// link to the Generate job map control. Every write the page attempts is captured; the only allowed one is
// the function call itself.
import { expect, test, type Page, type Route } from "playwright/test";
import { COMPANY_ID } from "../../playwright.config";
import { openWorkspace } from "./helpers";

const SUPABASE = /\/(rest|storage|functions)\/v1\//;
const FN = /\/functions\/v1\/record-interview-finding/;
const KEYED_NEEDS = /\/rest\/v1\/odi_needs\?.*journey_key=eq\./;
const QUOTE = "FIXTURE QUOTE (not a real interview): the first call back takes a week and families give up.";
const PROPOSED = "Minimize the time before a family hears back after the first form";
const EDITED = "Reduce the time before a family hears back after the first form";
const NO_STEP_MESSAGE = (key: string) => `'${key}' has no job step 1. A market with only a normative (industry) map, or no map at all, has no job_steps rows to attach a finding to — generate its job map first. Nothing was written.`;

type State = { fnCalls: Array<Record<string, unknown>>; writes: string[]; saved: boolean; key: string | null; step: number | null; noStepKey: string | null };

function savedRow(s: State) {
  return { id: "fixture-need-saved", company_id: COMPANY_ID, user_id: null, tier: "need", journey_key: s.key, step_number: s.step, step_label: "", desired_outcome: EDITED, importance: 0, satisfaction: 0, opportunity_score: 0, service_state: "served", source_path: "interview", frameworks_used: ["interview"], created_at: "2026-09-16T00:00:00Z", updated_at: "2026-09-16T00:00:00Z", dependency_state: "fresh", validation_state: "unvalidated", evidence_state: "partial", status: "active", sort_order: 999, confidence: null, odi_canonical_statement: null, provenance_type: "client_attested", interview_record_id: "fixture-rec-saved",
    interview_records: { id: "fixture-rec-saved", speaker_role: "client_stakeholder", person_name: "Fixture Stakeholder", interviewed_at: "2026-09-16T00:00:00Z", verbatim: QUOTE, retracted_at: null } };
}

async function guard(page: Page, s: State) {
  await page.route(SUPABASE, async (route: Route) => {
    const req = route.request(); const method = req.method(); const url = req.url();
    if (FN.test(url) && method === "POST") {
      const body = req.postDataJSON() as Record<string, unknown>;
      s.fnCalls.push(body);
      if (s.noStepKey && body.journey_key === s.noStepKey) return route.fulfill({ status: 422, contentType: "application/json", body: JSON.stringify({ ok: false, error: "no_step", journey_key: body.journey_key, step_number: body.step_number, message: NO_STEP_MESSAGE(s.noStepKey) }) });
      if (body.dry_run) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, dry_run: true, proposed_statement: PROPOSED, model: "qwen2.5:14b-instruct", definition_id: "fixture-def-live", journey_key: body.journey_key, step_number: body.step_number, step_label: "", speaker_role: "client_stakeholder", would_reuse_record: false }) });
      s.saved = true; s.key = String(body.journey_key); s.step = Number(body.step_number);
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, record_id: "fixture-rec-saved", need_id: "fixture-need-saved", reused_record: false, proposed_statement: body.statement, statement_source: "operator", model: null, journey_key: body.journey_key, step_number: body.step_number }) });
    }
    if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
      if (s.saved && KEYED_NEEDS.test(url) && method === "GET") {
        const res = await route.fetch();
        let rows: Array<Record<string, unknown>> = [];
        try { rows = JSON.parse(await res.text()); } catch { return route.fulfill({ response: res }); }
        return route.fulfill({ response: res, body: JSON.stringify([...rows, savedRow(s)]), headers: { ...res.headers(), "content-type": "application/json" } });
      }
      return route.continue();
    }
    s.writes.push(`${method} ${url}`);
    return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });
}
async function operatorOn(page: Page) {
  await page.locator("[data-fr-operator-switch]").click();
  await expect(page.locator("[data-fr-operator-switch]")).toHaveAttribute("data-fr-operator-switch", "on");
}
const shot = (page: Page, name: string) => page.screenshot({ path: `screenshots/item2/${name}.png`, fullPage: false });

test("glyph on → form → propose (stub) → edit → save (stub) → the row appears with its chip; the record stays for the next finding", async ({ page }) => {
  const s: State = { fnCalls: [], writes: [], saved: false, key: null, step: null, noStepKey: null };
  await guard(page, s);
  await openWorkspace(page, "job-map");
  await expect(page.getByTestId("jobmap-capture-toggle")).toHaveCount(0);           // off by default
  await operatorOn(page);
  const toggle = page.getByTestId("jobmap-capture-toggle");
  await expect(toggle).toHaveAttribute("data-fr-operator", "record-interview-finding");
  await expect(toggle).toHaveText("Record interview finding");
  await toggle.click();
  const form = page.getByTestId("interview-capture");
  await expect(form).toBeVisible();
  await expect(page.getByTestId("capture-propose")).toBeDisabled();
  await expect(page.getByTestId("capture-save")).toBeDisabled();
  const viewedKey = (await page.locator("[data-fr-region=stages]").getAttribute("data-fr-set-key"))!;
  const stepNumber = Number(await page.getByTestId("jobmap-stage").getAttribute("data-fr-step"));
  await expect(page.getByTestId("capture-placement-step")).toContainText(`${String(stepNumber).padStart(2, "0")} · `);
  await shot(page, "60-capture-form-empty");
  await page.getByTestId("capture-person").fill("Fixture Stakeholder");
  await page.getByTestId("capture-consent").fill("verbal (fixture)");
  await page.getByTestId("capture-verbatim").fill(QUOTE);
  await expect(page.getByTestId("capture-missing")).toHaveCount(0);
  await page.getByTestId("capture-propose").click();
  await expect(page.getByTestId("capture-statement")).toHaveValue(PROPOSED);
  await expect(page.getByTestId("capture-model")).toHaveText("Proposed by qwen2.5:14b-instruct");
  expect(s.fnCalls).toHaveLength(1);
  expect(s.fnCalls[0]).toMatchObject({ company_id: COMPANY_ID, journey_key: viewedKey, step_number: stepNumber, dry_run: true, interview_record_id: null, record: { speaker_role: "client_stakeholder", person_name: "Fixture Stakeholder", consent_basis: "verbal (fixture)", verbatim: QUOTE } });
  expect(s.fnCalls[0]).not.toHaveProperty("statement");
  await shot(page, "61-capture-proposal");
  await page.getByTestId("capture-statement").fill(EDITED);
  await page.getByTestId("capture-save").click();
  const row = page.locator("[data-fr-need-id=fixture-need-saved]");
  await expect(row).toBeVisible();
  await expect(row.locator(".fr-ws-opp-text")).toContainText(EDITED);
  await expect(row.locator("[data-testid=need-origin]")).toHaveAttribute("data-fr-origin", "client_attested");
  await expect(row.locator("[data-testid=need-origin-chip]")).toHaveText("You told us · Fixture Stakeholder · Sep 16");
  await expect(row.locator(".fr-ws-opp-band")).toHaveCount(0);
  expect(s.fnCalls).toHaveLength(2);
  expect(s.fnCalls[1]).toMatchObject({ company_id: COMPANY_ID, journey_key: viewedKey, step_number: stepNumber, dry_run: false, statement: EDITED, expected_definition_id: "fixture-def-live", record: { verbatim: QUOTE } }); // fold 2: the dry run's definition rides on the save
  expect(s.fnCalls[0]).not.toHaveProperty("expected_definition_id");
  // post-save: the record stays selected (the block collapsed), the statement cleared, Save disabled again
  await expect(page.getByTestId("capture-saved")).toBeVisible();
  await expect(page.getByTestId("capture-record")).toHaveCount(0);
  await expect(page.getByTestId("capture-reuse")).toHaveValue("fixture-rec-saved");
  await expect(page.getByTestId("capture-statement")).toHaveValue("");
  await expect(page.getByTestId("capture-save")).toBeDisabled();
  await shot(page, "62-capture-saved-row");
  await page.getByTestId("capture-done").click();
  await expect(form).toHaveCount(0);
  expect(s.writes).toEqual([]); // the function call was the page's only non-GET
});

test("funder market (no steps): the function's own 422 no_step renders inline with the Generate job map link", async ({ page }) => {
  const s: State = { fnCalls: [], writes: [], saved: false, key: null, step: null, noStepKey: null };
  await guard(page, s);
  await openWorkspace(page, "job-map");
  await operatorOn(page);
  await page.getByTestId("jobmap-switcher-open").click();
  const opt = page.locator('[data-testid=jobmap-switcher-option][data-fr-mapped="false"]').first();
  const key = (await opt.getAttribute("data-fr-set-key"))!;
  s.noStepKey = key;
  await opt.click();
  await expect(page.getByTestId("jobmap-stage")).toHaveCount(0);
  await expect(page.getByTestId("jobmap-generate")).toBeVisible();
  await page.getByTestId("jobmap-capture-toggle").click();
  await expect(page.getByTestId("capture-placement-step")).toHaveText("No step — this market has no job map yet");
  await page.getByTestId("capture-speaker-market").check();
  await page.getByTestId("capture-person").fill("Fixture Donor");
  await page.getByTestId("capture-consent").fill("verbal (fixture)");
  await page.getByTestId("capture-verbatim").fill("FIXTURE QUOTE (not a real donor): I give where the outcome numbers are visible within the year.");
  await page.getByTestId("capture-propose").click();
  const refusal = page.getByTestId("capture-refusal");
  await expect(refusal).toHaveAttribute("data-fr-error", "no_step");
  await expect(refusal.locator(".fr-ws-generate-failed-note")).toHaveText(NO_STEP_MESSAGE(key));
  await expect(page.getByTestId("capture-refusal-code")).toHaveText("422 no_step");
  const link = page.getByTestId("capture-generate-link");
  await expect(link).toHaveText("Generate job map");
  await expect(link).toHaveAttribute("href", "#jobmap-generate");
  expect(s.fnCalls).toHaveLength(1);
  expect(s.fnCalls[0]).toMatchObject({ journey_key: key, step_number: 1, dry_run: true, record: { speaker_role: "market_participant", journey_key: key } });
  await expect(page.getByTestId("capture-save")).toBeDisabled();
  await shot(page, "63-capture-funder-refusal");
  expect(s.writes).toEqual([]);
});
