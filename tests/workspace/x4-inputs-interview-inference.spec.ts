// (x4) "Infer market" on the workspace Inputs page — Gate B commit 2b (R19–R35, M1–M4, S6, signed 2026-09-21),
// NO real writes: every non-GET Supabase request is intercepted; infer-interview-market is stubbed at the
// boundary; three interview rows and their records are PLANTED at the read boundary (input_files and
// interview_records GETs augmented); the in-flight rows are planted on the integrity_runs GET. Fixtures are
// throwaway strings written here — never a real transcript. Proves:
//   (u1) M1 only on an unplaced CUSTOMER row — none on a stakeholder row, none on an operator-placed row;
//   (u2) M1 → exactly ONE function request {company_id, interview_record_id} (nothing about the actor); M2 while
//        it answers with "Change speaker" hidden; a placed answer → the M3 line "Market inferred: <title>", no M1;
//   (u3) a failed answer → M4 + M1 again; the stub's reason text never reaches the screen (R35);
//   (u4) a run in flight elsewhere (a fresh planned integrity row) → M2, no M1, no "Change speaker"; a stale row
//        (> 5 minutes) → M1 and "Change speaker" offered again;
//   (u5) S6 "That didn't save. Try again." when a withdraw, a speaker change or a market change fails;
//   (u6) a customer upload whose inference call fails still shows "Interview · Saved. Not yet parsed." — the
//        upload never fails or rolls back with the inference.
//   Added after the operator's reload check (2026-09-21, ~17:50 UTC):
//   (u7) M1 answered 409 inference_in_flight → M2 (never M4), no M1, no "Change speaker"; the poll follows the
//        planned row and M1 returns once it is stale;
//   (u8) M5 "Market not inferred · last run found no majority" on a row whose LAST basis entry is an inference
//        that found no majority; a row that never ran keeps the bare "Market not inferred";
//   (u9) a page load never offers M1 before its first planned-rows read has answered (a slow read → no M1, then M1).
import { expect, test, type Page, type Route } from "playwright/test";
import { COMPANY_ID } from "../../playwright.config";
import { openWorkspace } from "./helpers";

const FIXTURE_TEXT = "FIXTURE TRANSCRIPT (not a real interview).\nSpeaker A: a throwaway line.\nSpeaker B: another throwaway line.\n";
const REASON = "FIXTURE-REASON-NEVER-ON-SCREEN";
const AT = "2026-09-21T12:00:00Z";
const PLANTED_FILES = [
  { id: "fx-cust", file_name: "fixture-customer.txt", is_interview: true },
  { id: "fx-stake", file_name: "fixture-stakeholder.txt", is_interview: true },
  { id: "fx-placed", file_name: "fixture-operator-placed.txt", is_interview: true },
].map((f) => ({ ...f, file_type: "text/plain", file_path: `x/${f.file_name}`, tags: [], uploaded_at: AT, archived_at: null, archive_reason: null, archive_source: null, restored_at: null }));
const baseRecord = (id: string, input_file_id: string, extra: Record<string, unknown>) => ({ id, company_id: COMPANY_ID, input_file_id, speaker_role: "market_participant", market_state: "unplaced", journey_key: null, market_basis: [{ kind: "original", result: "none", at: AT }], review_state: "unreviewed", retracted_at: null, parsed_at: null, speaker_history: [], ...extra });
type Planted = { records: Array<Record<string, unknown>>; runs: Array<Record<string, unknown>> };
type Captured = { method: string; url: string; body: unknown };
const SUPABASE = /\/(rest|storage|functions)\/v1\//;
type InferStub = { status: number; body: Record<string, unknown>; delayMs?: number; then?: (planted: Planted) => void };

async function guard(page: Page, planted: Planted, infer: InferStub, opts: { failWithdraw?: boolean; failSpeaker?: boolean; failMarket?: boolean; runsDelayMs?: number } = {}): Promise<Captured[]> {
  const captured: Captured[] = [];
  await page.route(SUPABASE, async (route: Route) => {
    const req = route.request(); const method = req.method(); const url = req.url();
    if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
      try {
        if (/\/rest\/v1\/input_files\?/.test(url) && !/archived_at=not\.is\.null/.test(url)) {
          const res = await route.fetch(); let rows: Array<Record<string, unknown>> = [];
          try { rows = JSON.parse(await res.text()); } catch { return route.fulfill({ response: res }); }
          const inputId = String(rows[0]?.input_id ?? "");
          return route.fulfill({ response: res, body: JSON.stringify([...PLANTED_FILES.map((f) => ({ ...f, input_id: inputId })), ...rows]), headers: { ...res.headers(), "content-type": "application/json" } });
        }
        if (/\/rest\/v1\/interview_records\?/.test(url)) {
          const res = await route.fetch(); let rows: Array<Record<string, unknown>> = [];
          try { rows = JSON.parse(await res.text()); } catch { return route.fulfill({ response: res }); }
          return route.fulfill({ response: res, body: JSON.stringify([...rows, ...planted.records]), headers: { ...res.headers(), "content-type": "application/json" } });
        }
        if (/\/rest\/v1\/integrity_runs\?/.test(url) && /component=eq\.interview_market_inference/.test(url)) {
          if (opts.runsDelayMs) { await new Promise((r) => setTimeout(r, opts.runsDelayMs)); opts.runsDelayMs = 0; } // only the FIRST read is slow
          return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(planted.runs) });
        }
      } catch { return; }
      return route.continue();
    }
    let body: unknown = null; try { body = req.postDataJSON(); } catch { body = req.postData(); }
    captured.push({ method, url, body });
    if (/\/functions\/v1\/infer-interview-market/.test(url)) {
      if (infer.delayMs) await new Promise((r) => setTimeout(r, infer.delayMs));
      infer.then?.(planted);
      return route.fulfill({ status: infer.status, contentType: "application/json", body: JSON.stringify(infer.body) });
    }
    if (/\/rest\/v1\/rpc\/withdraw_interview_upload/.test(url)) return opts.failWithdraw ? route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ message: "planted failure" }) }) : route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
    if (/\/rest\/v1\/rpc\/correct_interview_speaker/.test(url)) return opts.failSpeaker ? route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ message: "planted failure" }) }) : route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
    if (/\/rest\/v1\/interview_records\?/.test(url) && method === "PATCH") return opts.failMarket ? route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ message: "planted failure" }) }) : route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    if (/\/storage\/v1\/object\//.test(url)) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ Key: "input-files/synthetic" }) });
    if (/\/rest\/v1\/input_files/.test(url) && method === "POST") { const b = body as Record<string, unknown>; return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ id: "fixture-file-up", file_path: b.file_path, uploaded_at: AT }) }); }
    if (/\/functions\/v1\/record-interview-upload/.test(url)) { const b = body as Record<string, unknown>; return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, record_id: "fixture-rec-up", input_file_id: b.input_file_id, speaker_role: b.speaker_role, market_state: "unplaced" }) }); }
    if (/\/functions\/v1\//.test(url)) return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    if (method === "POST" && /\/rest\/v1\//.test(url)) return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ id: "synthetic-row" }) });
    return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });
  return captured;
}
function plantedDefault(): Planted {
  return {
    records: [
      baseRecord("rec-cust", "fx-cust", {}),
      baseRecord("rec-stake", "fx-stake", { speaker_role: "client_stakeholder", market_state: "per_item" }),
      baseRecord("rec-placed", "fx-placed", { market_state: "placed", journey_key: "mkt-schools-seeking-partnerships-for-integra", market_basis: [{ kind: "original", result: "none", at: AT }, { kind: "operator_override", journey_key: "mkt-schools-seeking-partnerships-for-integra", by: "x", at: AT }] }),
    ],
    runs: [],
  };
}
async function operatorOn(page: Page) {
  await page.locator("[data-fr-operator-switch]").click();
  await expect(page.locator("[data-fr-operator-switch]")).toHaveAttribute("data-fr-operator-switch", "on");
}
const row = (page: Page, fileId: string) => page.locator(`[data-testid=inputs-file-row][data-fr-file-id="${fileId}"]`);
const fnCalls = (c: Captured[]) => c.filter((x) => /\/functions\/v1\//.test(x.url)).map((x) => x.url.replace(/^.*\/functions\/v1\//, "").replace(/\?.*$/, ""));
const shot = async (page: Page, name: string) => { await page.evaluate(() => window.scrollBy(0, 260)); await page.screenshot({ path: `screenshots/item2/${name}.png`, fullPage: false }); };

test("(u1) M1 only on an unplaced customer row; none on a stakeholder row; none on an operator-placed row", async ({ page }) => {
  const planted = plantedDefault();
  await guard(page, planted, { status: 200, body: { ok: true, result: "not_inferred" } });
  await openWorkspace(page, "inputs");
  await operatorOn(page);
  await expect(row(page, "fx-cust").locator("[data-testid=inputs-infer-market]")).toHaveText("Infer market");
  await expect(row(page, "fx-cust").locator("[data-testid=inputs-interview-market]")).toContainText("Market not inferred");
  await expect(row(page, "fx-stake").locator("[data-testid=inputs-infer-market]")).toHaveCount(0);
  await expect(row(page, "fx-stake").locator("[data-testid=inputs-interview-market]")).toHaveText("Market: per item, after parsing");
  await expect(row(page, "fx-placed").locator("[data-testid=inputs-infer-market]")).toHaveCount(0);
  await expect(row(page, "fx-placed").getByText("Market inferred:")).toHaveCount(0); // the operator placed it — the title alone
  await shot(page, "110-infer-market-m1");
});

test("(u2) M1 → one request with the two ids; M2 while pending, 'Change speaker' hidden; a placed answer → the M3 line, no M1", async ({ page }) => {
  const planted = plantedDefault();
  const captured = await guard(page, planted, {
    status: 200, delayMs: 2500,
    body: { ok: true, result: "placed", run_id: 9999, journey_key: "mkt-schools-seeking-partnerships-for-integra", market_title: "Schools seeking partnerships for integrated mental health services", windows_total: 1, windows_run: 1, named: 1, votes: { "mkt-schools-seeking-partnerships-for-integra": 1 } },
    then: (p) => { p.records[0] = { ...p.records[0], market_state: "placed", journey_key: "mkt-schools-seeking-partnerships-for-integra", market_basis: [...(p.records[0].market_basis as unknown[]), { kind: "inference", result: "placed", journey_key: "mkt-schools-seeking-partnerships-for-integra", at: AT, windows: [{ index: 0, market_key: "mkt-schools-seeking-partnerships-for-integra", reason: REASON }] }] }; },
  });
  await openWorkspace(page, "inputs");
  await operatorOn(page);
  const r = row(page, "fx-cust");
  await expect(r.locator("[data-testid=inputs-change-speaker]")).toHaveCount(1);
  await r.locator("[data-testid=inputs-infer-market]").click();
  await expect(r.locator("[data-testid=inputs-interview-market]")).toContainText("Inferring market…");
  await expect(r.locator("[data-testid=inputs-infer-market]")).toHaveCount(0);
  await expect(r.locator("[data-testid=inputs-change-speaker]")).toHaveCount(0); // hidden while in flight
  await shot(page, "111-infer-market-m2");
  await expect(r.locator("[data-testid=inputs-interview-market]")).toContainText("Market inferred: Schools seeking partnerships for integrated mental health services", { timeout: 15_000 });
  await expect(r.locator("[data-testid=inputs-infer-market]")).toHaveCount(0);
  await expect(r.locator("[data-testid=inputs-infer-failed]")).toHaveCount(0);
  await expect(page.getByText(REASON)).toHaveCount(0); // R35
  expect(fnCalls(captured)).toEqual(["infer-interview-market"]);
  const body = captured.find((c) => /infer-interview-market/.test(c.url))!.body as Record<string, unknown>;
  expect(body).toEqual({ company_id: COMPANY_ID, interview_record_id: "rec-cust" });
  expect(captured.filter((c) => /interview_records\?/.test(c.url) && c.method === "PATCH")).toHaveLength(0); // the browser writes nothing itself
  await shot(page, "112-infer-market-m3");
});

test("(u3) a failed run → M4 and M1 again; the reason never reaches the screen (R35)", async ({ page }) => {
  const planted = plantedDefault();
  const captured = await guard(page, planted, { status: 422, body: { ok: false, error: "window_error", message: `window 1 of 1: ${REASON}`, run_id: 9998 } });
  await openWorkspace(page, "inputs");
  await operatorOn(page);
  const r = row(page, "fx-cust");
  await r.locator("[data-testid=inputs-infer-market]").click();
  await expect(r.locator("[data-testid=inputs-infer-failed]")).toHaveText("Market inference failed", { timeout: 15_000 });
  await expect(r.locator("[data-testid=inputs-infer-market]")).toHaveText("Infer market");
  await expect(r.locator("[data-testid=inputs-interview-market]")).toContainText("Market not inferred");
  await expect(page.getByText(REASON)).toHaveCount(0);
  expect(fnCalls(captured)).toEqual(["infer-interview-market"]);
  await shot(page, "113-infer-market-m4");
});

test("(u4) a run in flight elsewhere (fresh planned row) → M2, no M1, no 'Change speaker'; a stale row (> 5 min) → both offered", async ({ page }) => {
  const planted = plantedDefault();
  planted.runs = [{ surface_id: "rec-cust", ran_at: new Date(Date.now() - 60_000).toISOString() }];
  await guard(page, planted, { status: 200, body: { ok: true, result: "not_inferred" } });
  await openWorkspace(page, "inputs");
  await operatorOn(page);
  const r = row(page, "fx-cust");
  await expect(r.locator("[data-testid=inputs-interview-market]")).toContainText("Inferring market…");
  await expect(r.locator("[data-testid=inputs-infer-market]")).toHaveCount(0);
  await expect(r.locator("[data-testid=inputs-change-speaker]")).toHaveCount(0);
  await expect(row(page, "fx-stake").locator("[data-testid=inputs-change-speaker]")).toHaveCount(1); // only the record in flight
  // the run goes stale: the next poll (≤ 5 s) reads a row bumped 6 minutes ago
  planted.runs = [{ surface_id: "rec-cust", ran_at: new Date(Date.now() - 6 * 60_000).toISOString() }];
  await expect(r.locator("[data-testid=inputs-infer-market]")).toHaveText("Infer market", { timeout: 15_000 });
  await expect(r.locator("[data-testid=inputs-change-speaker]")).toHaveCount(1);
  await expect(r.locator("[data-testid=inputs-interview-market]")).toContainText("Market not inferred");
});

test("(u5) S6 when a withdraw, a speaker change or a market change fails", async ({ page }) => {
  const planted = plantedDefault();
  await guard(page, planted, { status: 200, body: { ok: true, result: "not_inferred" } }, { failWithdraw: true, failSpeaker: true, failMarket: true });
  await openWorkspace(page, "inputs");
  await operatorOn(page);
  const r = row(page, "fx-cust");
  // market change
  await r.locator("[data-testid=inputs-change-market]").click();
  await r.locator("[data-testid=inputs-market-option]").first().click();
  await expect(r.locator("[data-testid=inputs-save-failed]")).toHaveText("That didn't save. Try again.");
  // speaker change (not a collision)
  await r.locator("[data-testid=inputs-change-speaker]").click();
  await r.locator('[data-testid=inputs-speaker-option][data-fr-speaker-role="client_stakeholder"]').click();
  await expect(r.locator("[data-testid=inputs-save-failed]")).toHaveText("That didn't save. Try again.");
  await expect(r.locator("[data-testid=inputs-speaker-collision]")).toHaveCount(0);
  // withdraw
  await r.locator("[data-testid=inputs-withdraw]").click();
  await page.getByTestId("inputs-withdraw-confirm").getByTestId("inputs-withdraw-go").click();
  await expect(r.locator("[data-testid=inputs-save-failed]")).toHaveText("That didn't save. Try again.");
  await shot(page, "114-save-failed-s6");
});

test("(u6) a customer upload whose inference call fails still reads 'Interview · Saved. Not yet parsed.'; calls = upload then inference", async ({ page }) => {
  const planted = plantedDefault();
  const captured = await guard(page, planted, { status: 500, body: { ok: false, error: "planted" } });
  await openWorkspace(page, "inputs");
  await operatorOn(page);
  await page.getByTestId("inputs-upload-open").click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.locator("input[type=file]").setInputFiles({ name: "fixture-interview-customer.txt", mimeType: "text/plain", buffer: Buffer.from(FIXTURE_TEXT) });
  await page.getByTestId("upload-interview-switch").check();
  await page.getByTestId("upload-interview-customer").check({ force: true });
  await dialog.getByRole("button", { name: /^Upload/ }).click();
  await expect(page.getByTestId("upload-interview-saved")).toHaveText("Interview · Saved. Not yet parsed.", { timeout: 30_000 });
  await expect.poll(() => fnCalls(captured)).toEqual(["record-interview-upload", "infer-interview-market"]);
  await expect(page.getByTestId("upload-interview-saved")).toHaveText("Interview · Saved. Not yet parsed."); // still there after the failed inference
  expect(captured.filter((c) => c.method === "DELETE")).toHaveLength(0); // nothing rolled back
  const infer = captured.find((c) => /infer-interview-market/.test(c.url))!.body as Record<string, unknown>;
  expect(infer).toEqual({ company_id: COMPANY_ID, interview_record_id: "fixture-rec-up" });
});

test("(u7) M1 answered 409 inference_in_flight → M2, never M4; no M1, no 'Change speaker'; M1 returns once the planned row is stale", async ({ page }) => {
  const planted = plantedDefault();
  const captured = await guard(page, planted, {
    status: 409, body: { ok: false, error: "inference_in_flight", message: "A market inference is already running for this record.", run_id: 9997 },
    then: (p) => { p.runs = [{ surface_id: "rec-cust", ran_at: new Date().toISOString() }]; }, // the server's planned row, as the next poll reads it
  });
  await openWorkspace(page, "inputs");
  await operatorOn(page);
  const r = row(page, "fx-cust");
  await r.locator("[data-testid=inputs-infer-market]").click();
  await expect(r.locator("[data-testid=inputs-interview-market]")).toContainText("Inferring market…");
  await expect(r.locator("[data-testid=inputs-infer-failed]")).toHaveCount(0);
  await expect(r.locator("[data-testid=inputs-infer-market]")).toHaveCount(0);
  await expect(r.locator("[data-testid=inputs-change-speaker]")).toHaveCount(0);
  await page.waitForTimeout(6000); // one poll later it is still M2, still not M4
  await expect(r.locator("[data-testid=inputs-interview-market]")).toContainText("Inferring market…");
  await expect(r.locator("[data-testid=inputs-infer-failed]")).toHaveCount(0);
  expect(fnCalls(captured)).toEqual(["infer-interview-market"]);
  planted.runs = [{ surface_id: "rec-cust", ran_at: new Date(Date.now() - 6 * 60_000).toISOString() }];
  await expect(r.locator("[data-testid=inputs-infer-market]")).toHaveText("Infer market", { timeout: 15_000 });
  await expect(r.locator("[data-testid=inputs-change-speaker]")).toHaveCount(1);
  await expect(r.locator("[data-testid=inputs-infer-failed]")).toHaveCount(0);
});

test("(u8) M5 beside M1 after a run without a majority; a row that never ran keeps the bare 'Market not inferred'", async ({ page }) => {
  const planted = plantedDefault();
  planted.records.push(baseRecord("rec-nomaj", "fx-nomaj", { market_basis: [{ kind: "original", result: "none", at: AT }, { kind: "inference", result: "not_inferred", at: AT, votes: { "mkt-a": 1, "mkt-b": 1 }, named: 2, windows: [{ index: 0, market_key: "mkt-a", reason: REASON }, { index: 1, market_key: "mkt-b", reason: REASON }] }] }));
  PLANTED_FILES.push({ id: "fx-nomaj", file_name: "fixture-no-majority.txt", is_interview: true, file_type: "text/plain", file_path: "x/fixture-no-majority.txt", tags: [], uploaded_at: AT, archived_at: null, archive_reason: null, archive_source: null, restored_at: null });
  try {
    await guard(page, planted, { status: 200, body: { ok: true, result: "not_inferred" } });
    await openWorkspace(page, "inputs");
    await operatorOn(page);
    const nomaj = row(page, "fx-nomaj");
    await expect(nomaj.locator("[data-testid=inputs-interview-market]")).toContainText("Market not inferred · last run found no majority");
    await expect(nomaj.locator("[data-testid=inputs-infer-market]")).toHaveText("Infer market");
    await expect(page.getByText(REASON)).toHaveCount(0); // R35
    const never = row(page, "fx-cust");
    await expect(never.locator("[data-testid=inputs-interview-market]")).toContainText("Market not inferred");
    await expect(never.locator("[data-testid=inputs-interview-market]")).not.toContainText("last run found no majority");
    await expect(never.locator("[data-testid=inputs-infer-market]")).toHaveText("Infer market");
    await shot(page, "115-m5-no-majority");
  } finally { PLANTED_FILES.pop(); }
});

test("(u9) a page load offers M1 only after its first planned-rows read has answered — a slow read shows no M1, then M1", async ({ page }) => {
  const planted = plantedDefault();
  await guard(page, planted, { status: 200, body: { ok: true, result: "not_inferred" } }, { runsDelayMs: 6000 });
  // openWorkspace waits for network idle, which the slow read would satisfy first — navigate on "load" instead
  await page.addInitScript((id) => { try { localStorage.setItem("active_company_id", id); } catch { /* no storage */ } }, COMPANY_ID);
  await page.goto("/preview/client-refine/workspace/inputs", { waitUntil: "load", timeout: 120_000 });
  await expect(page.getByTestId("workspace-root")).toBeVisible({ timeout: 60_000 });
  await operatorOn(page);
  const r = row(page, "fx-cust");
  await expect(r.locator("[data-testid=inputs-interview-market]")).toContainText("Market not inferred"); // the row is there…
  await expect(r.locator("[data-testid=inputs-infer-market]")).toHaveCount(0); // …but M1 waits for the read
  await page.waitForTimeout(1500);
  await expect(r.locator("[data-testid=inputs-infer-market]")).toHaveCount(0);
  await expect(r.locator("[data-testid=inputs-infer-market]")).toHaveText("Infer market", { timeout: 15_000 });
});
