// (x2) Interview upload — Gate B commit 1 proofs (operator rulings A1–A5, R1–R8, signed 2026-09-19), NO real
// writes: every non-GET Supabase request is intercepted and answered synthetically (storage, input_files
// insert, record-interview-upload). The row's appearance is planted at the READ boundary (the input_files and
// interview_records GETs are augmented with the rows the door would have written). The fixture is a
// throwaway text written by this spec — never a real transcript.
//   (m) with the switch on: exactly ONE function request (record-interview-upload) with the A4 body shape and
//       the file's sha256; the input_files insert carries is_interview: true (A1); NO analyze-file, NO
//       classify-upload-voice, NO dify-analyze-file, NO odi_needs insert, NO tag PATCH; the row renders the
//       "Interview" chip, "Saved. Not yet parsed." and the market line (customer: "Market not inferred" +
//       Change market; stakeholder: "Market: per item, after parsing", no Change market); no Run analysis
//       chip on an interview row; Change market writes journey_key + market_state + the appended basis.
//   A normal upload in the same spec behaves as before: analyze-file + classify-upload-voice, is_interview false.
import { expect, test, type Page, type Route } from "playwright/test";
import { createHash } from "node:crypto";
import { COMPANY_ID } from "../../playwright.config";
import { openWorkspace } from "./helpers";

type Captured = { method: string; url: string; body: unknown };
const SUPABASE = /\/(rest|storage|functions)\/v1\//;
const FIXTURE_TEXT = "FIXTURE TRANSCRIPT (not a real interview).\nSpeaker A: a throwaway line.\nSpeaker B: another throwaway line.\n";
const FIXTURE_SHA = createHash("sha256").update(FIXTURE_TEXT).digest("hex");
type Planted = { file: Record<string, unknown> | null; record: Record<string, unknown> | null };

async function guard(page: Page, planted: Planted): Promise<Captured[]> {
  const captured: Captured[] = [];
  await page.route(SUPABASE, async (route: Route) => {
    const req = route.request(); const method = req.method(); const url = req.url();
    if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
      // A re-read can still be in flight when a test ends (the dialog invalidates queries after an upload):
      // a closed page makes route.fetch throw — ignored, the read is moot by then.
      try {
        if (planted.file && /\/rest\/v1\/input_files\?/.test(url) && !/archived_at=not\.is\.null/.test(url)) {
          const res = await route.fetch(); let rows: Array<Record<string, unknown>> = [];
          try { rows = JSON.parse(await res.text()); } catch { return route.fulfill({ response: res }); }
          return route.fulfill({ response: res, body: JSON.stringify([...rows, planted.file]), headers: { ...res.headers(), "content-type": "application/json" } });
        }
        if (planted.record && /\/rest\/v1\/interview_records\?/.test(url)) {
          const res = await route.fetch(); let rows: Array<Record<string, unknown>> = [];
          try { rows = JSON.parse(await res.text()); } catch { return route.fulfill({ response: res }); }
          return route.fulfill({ response: res, body: JSON.stringify([...rows, planted.record]), headers: { ...res.headers(), "content-type": "application/json" } });
        }
      } catch { return; }
      return route.continue();
    }
    let body: unknown = null; try { body = req.postDataJSON(); } catch { body = req.postData(); }
    captured.push({ method, url, body });
    if (/\/storage\/v1\/object\//.test(url)) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ Key: "input-files/synthetic" }) });
    if (/\/rest\/v1\/input_files/.test(url) && method === "POST") {
      const b = body as Record<string, unknown>;
      planted.file = { id: "fixture-file-1", input_id: b.input_id, file_name: b.file_name, file_type: b.file_type, file_path: b.file_path, tags: b.tags, uploaded_at: "2026-09-19T12:00:00Z", archived_at: null, archive_reason: null, archive_source: null, is_interview: b.is_interview };
      return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ id: "fixture-file-1", file_path: b.file_path, uploaded_at: "2026-09-19T12:00:00Z" }) });
    }
    if (/\/functions\/v1\/record-interview-upload/.test(url)) {
      const b = body as Record<string, unknown>;
      const marketState = b.speaker_role === "client_stakeholder" ? "per_item" : "unplaced";
      planted.record = { id: "fixture-rec-1", company_id: COMPANY_ID, input_file_id: b.input_file_id, speaker_role: b.speaker_role, market_state: marketState, journey_key: null, market_basis: [{ kind: "original", result: "none", at: "2026-09-19T12:00:00Z" }], review_state: "unreviewed", retracted_at: null };
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, record_id: "fixture-rec-1", input_file_id: b.input_file_id, speaker_role: b.speaker_role, market_state: marketState, file_sha256: b.file_sha256, file_bytes: FIXTURE_TEXT.length, text_sha256: "x", chars: 90, extraction_method: "local_text_reader", extraction_version: "edge-runtime-text-reader-2026-09-19" }) });
    }
    if (/\/rest\/v1\/interview_records\?/.test(url) && method === "PATCH") {
      const b = body as Record<string, unknown>;
      if (planted.record) planted.record = { ...planted.record, ...b };
      return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    }
    if (/\/functions\/v1\//.test(url)) return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    if (method === "POST" && /\/rest\/v1\//.test(url)) return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ id: "synthetic-row" }) });
    return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });
  return captured;
}
async function operatorOn(page: Page) {
  await page.locator("[data-fr-operator-switch]").click();
  await expect(page.locator("[data-fr-operator-switch]")).toHaveAttribute("data-fr-operator-switch", "on");
}
const fnCalls = (c: Captured[]) => c.filter((x) => /\/functions\/v1\//.test(x.url)).map((x) => x.url.replace(/^.*\/functions\/v1\//, "").replace(/\?.*$/, ""));
const shot = (page: Page, name: string) => page.screenshot({ path: `screenshots/item2/${name}.png`, fullPage: false });

async function uploadInterview(page: Page, who: "stakeholder" | "customer") {
  await page.getByTestId("inputs-upload-open").click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.locator("input[type=file]").setInputFiles({ name: `fixture-interview-${who}.txt`, mimeType: "text/plain", buffer: Buffer.from(FIXTURE_TEXT) });
  await expect(page.getByTestId("upload-interview-speaker")).toHaveCount(0);
  await page.getByTestId("upload-interview-switch").check();
  await expect(page.getByTestId("upload-interview-speaker")).toBeVisible();
  await expect(dialog.getByRole("button", { name: /^Upload/ })).toBeDisabled(); // the one choice is required
  await page.getByTestId(`upload-interview-${who}`).check({ force: true });
  await dialog.getByRole("button", { name: /^Upload/ }).click();
  await expect(page.getByTestId("upload-interview-saved")).toHaveText("Interview · Saved. Not yet parsed.", { timeout: 30_000 });
  // (x) R17: the result line carries the file name and the interview line only — no input name, no mapping word.
  await expect(dialog.getByTestId("upload-result-mapping")).toHaveCount(0);
  await expect(dialog.getByText(/mapped/i)).toHaveCount(0);
  await expect(dialog.getByText("Customer Research")).toHaveCount(0);
  return dialog;
}

test("(m) customer transcript: one function request, A1 flag, no analysis; the row with chip, S3, 'Market not inferred' + Change market; Change market appends", async ({ page }) => {
  const planted: Planted = { file: null, record: null };
  const captured = await guard(page, planted);
  await openWorkspace(page, "inputs");
  await operatorOn(page);
  const dialog = await uploadInterview(page, "customer");
  await shot(page, "80-interview-dialog-on");
  // exactly one function request, the A4 shape, the file's sha256
  expect(fnCalls(captured)).toEqual(["record-interview-upload"]);
  const call = captured.find((c) => /record-interview-upload/.test(c.url))!.body as Record<string, unknown>;
  expect(Object.keys(call).sort()).toEqual(["company_id", "file_sha256", "input_file_id", "speaker_role"]);
  expect(call).toMatchObject({ company_id: COMPANY_ID, input_file_id: "fixture-file-1", speaker_role: "market_participant", file_sha256: FIXTURE_SHA });
  // the insert carries the flag; nothing else was written
  const insert = captured.find((c) => /\/rest\/v1\/input_files/.test(c.url) && c.method === "POST")!.body as Record<string, unknown>;
  expect(insert.is_interview).toBe(true);
  expect(captured.filter((c) => /odi_needs/.test(c.url))).toHaveLength(0);
  expect(captured.filter((c) => /\/rest\/v1\/input_files/.test(c.url) && c.method === "PATCH")).toHaveLength(0);
  expect(captured.filter((c) => /analyze-file|classify-upload-voice|dify-analyze-file/.test(c.url))).toHaveLength(0);
  // close the dialog → the list re-reads: the planted row + record render
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  const row = page.locator('[data-testid=inputs-file-row][data-fr-file-id="fixture-file-1"]');
  await expect(row).toBeVisible({ timeout: 30_000 });
  await expect(row.locator("[data-testid=inputs-interview]")).toHaveAttribute("data-fr-speaker", "market_participant");
  await expect(row.locator("[data-testid=inputs-interview]")).toContainText("Interview");
  await expect(row.locator("[data-testid=inputs-interview-state]")).toHaveText("Saved. Not yet parsed.");
  await expect(row.locator("[data-testid=inputs-interview-market]")).toContainText("Market not inferred");
  await expect(row.locator("[data-testid=inputs-change-market]")).toHaveText("Change market");
  await expect(row.locator("[data-testid=inputs-run-analysis]")).toHaveCount(0);
  await expect(row.getByText("Run analysis")).toHaveCount(0);
  await shot(page, "81-interview-row-customer");
  // Change market: the listbox (S7), a choice → PATCH journey_key + market_state + appended basis, nothing else
  await row.locator("[data-testid=inputs-change-market]").click();
  const list = row.locator("[data-testid=inputs-market-list]");
  await expect(list).toHaveAttribute("aria-label", "Choose a market");
  await shot(page, "82-interview-change-market-open");
  const opt = row.locator("[data-testid=inputs-market-option]").first();
  const key = (await opt.getAttribute("data-fr-set-key"))!;
  const title = (await opt.textContent())!;
  await opt.click();
  await expect.poll(() => captured.some((c) => /interview_records\?/.test(c.url) && c.method === "PATCH")).toBe(true);
  const patch = captured.find((c) => /interview_records\?/.test(c.url) && c.method === "PATCH")!.body as Record<string, unknown>;
  expect(Object.keys(patch).sort()).toEqual(["journey_key", "market_basis", "market_state"]);
  expect(patch.journey_key).toBe(key); expect(patch.market_state).toBe("placed");
  const basis = patch.market_basis as Array<Record<string, unknown>>;
  expect(basis.length).toBe(2); expect(basis[0]).toMatchObject({ kind: "original", result: "none" }); expect(basis[1]).toMatchObject({ kind: "operator_override", journey_key: key });
  await expect(row.locator("[data-testid=inputs-interview-market]")).toContainText(title);
  await expect(row.getByText("Market inferred:")).toHaveCount(0); // nothing was inferred
  await expect(row.locator("[data-testid=inputs-change-market]")).toHaveText("Change market");
  expect(fnCalls(captured)).toEqual(["record-interview-upload"]);
});

test("(m) stakeholder transcript: 'Market: per item, after parsing', no Change market; no Run analysis chip", async ({ page }) => {
  const planted: Planted = { file: null, record: null };
  const captured = await guard(page, planted);
  await openWorkspace(page, "inputs");
  await operatorOn(page);
  const dialog = await uploadInterview(page, "stakeholder");
  expect(fnCalls(captured)).toEqual(["record-interview-upload"]);
  expect((captured.find((c) => /record-interview-upload/.test(c.url))!.body as Record<string, unknown>).speaker_role).toBe("client_stakeholder");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  const row = page.locator('[data-testid=inputs-file-row][data-fr-file-id="fixture-file-1"]');
  await expect(row).toBeVisible({ timeout: 30_000 });
  await expect(row.locator("[data-testid=inputs-interview]")).toHaveAttribute("data-fr-speaker", "client_stakeholder");
  await expect(row.locator("[data-testid=inputs-interview-market]")).toHaveText("Market: per item, after parsing");
  await expect(row.locator("[data-testid=inputs-change-market]")).toHaveCount(0);
  await expect(row.locator("[data-testid=inputs-run-analysis]")).toHaveCount(0);
  await shot(page, "83-interview-row-stakeholder");
});

test("a normal upload in the same door behaves as before: analyze-file + classify-upload-voice, is_interview false, no record call", async ({ page }) => {
  const planted: Planted = { file: null, record: null };
  const captured = await guard(page, planted);
  await openWorkspace(page, "inputs");
  await operatorOn(page);
  await page.getByTestId("inputs-upload-open").click();
  const dialog = page.getByRole("dialog");
  await dialog.locator("input[type=file]").setInputFiles({ name: "ordinary-fixture.txt", mimeType: "text/plain", buffer: Buffer.from("ordinary fixture (not a transcript)") });
  await expect(page.getByTestId("upload-interview-switch")).not.toBeChecked();
  await shot(page, "84-upload-dialog-off");
  await dialog.getByRole("button", { name: /^Upload/ }).click();
  await expect.poll(() => captured.some((c) => /\/rest\/v1\/input_files/.test(c.url) && c.method === "POST"), { timeout: 30_000 }).toBe(true);
  await expect.poll(() => captured.some((c) => /classify-upload-voice/.test(c.url)), { timeout: 30_000 }).toBe(true);
  const calls = fnCalls(captured);
  expect(calls).toContain("analyze-file"); expect(calls).toContain("classify-upload-voice"); expect(calls).not.toContain("record-interview-upload");
  const insert = captured.find((c) => /\/rest\/v1\/input_files/.test(c.url) && c.method === "POST")!.body as Record<string, unknown>;
  expect(insert.is_interview).toBe(false);
  // the ordinary result line is unchanged: "<input> (<sub group>) • <mapping word>"
  await expect(dialog.getByTestId("upload-result-mapping")).toHaveCount(1);
  await expect(dialog.getByTestId("upload-result-mapping")).toContainText(/mapped/i);
});

test("(x) R17: an interview named 'customer…' is inserted under the customer-research input, never target-aud", async ({ page }) => {
  const planted: Planted = { file: null, record: null };
  const captured = await guard(page, planted);
  await openWorkspace(page, "inputs");
  await operatorOn(page);
  const inputs = await page.evaluate(async ({ companyId }) => {
    const sb = (window as unknown as { supabase: { from: (t: string) => any } }).supabase;
    const { data } = await sb.from("inputs").select("id, input_key").eq("company_id", companyId);
    return (data ?? []) as Array<{ id: string; input_key: string }>;
  }, { companyId: COMPANY_ID });
  const home = inputs.find((i) => i.input_key === "customer-research")!;
  const audience = inputs.find((i) => i.input_key === "target-aud")!;
  expect(home && audience).toBeTruthy();
  await page.getByTestId("inputs-upload-open").click();
  const dialog = page.getByRole("dialog");
  await dialog.locator("input[type=file]").setInputFiles({ name: "fixture-customer-audience-interview.txt", mimeType: "text/plain", buffer: Buffer.from(FIXTURE_TEXT) });
  await page.getByTestId("upload-interview-switch").check();
  await page.getByTestId("upload-interview-customer").check({ force: true });
  await dialog.getByRole("button", { name: /^Upload/ }).click();
  await expect(page.getByTestId("upload-interview-saved")).toBeVisible({ timeout: 30_000 });
  const insert = captured.find((c) => /\/rest\/v1\/input_files/.test(c.url) && c.method === "POST")!.body as Record<string, unknown>;
  expect(insert.input_id).toBe(home.id);
  expect(insert.input_id).not.toBe(audience.id);
  expect(String(insert.file_path)).toContain("/customer-research/");
  expect(captured.filter((c) => /input_subitems/.test(c.url))).toHaveLength(0); // R15: no subitem toggle
});
