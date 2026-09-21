// (x3) Withdraw + Change speaker on the workspace Inputs page — Gate B commit 2a (R11 / R14 / R22, signed
// 2026-09-20), NO real writes: every non-GET Supabase request is intercepted; the two RPCs are stubbed at the
// boundary (withdraw_interview_upload, correct_interview_speaker). Two interview rows and their records are
// PLANTED at the read boundary (the input_files and interview_records GETs are augmented) so the spec holds
// whatever the live list holds; ordinary rows are Edgewood's real files. Proves: W1 only on interview rows and Archive × only on ordinary rows;
// the confirm flow (W2 / W3 / Cancel) → exactly ONE RPC request with {p_record_id}; P1 → listbox P3 → ONE RPC
// request with {p_record_id, p_speaker_role}; a stubbed collision (409 / speaker_identity_collision) → P2.
// Interview-row count (2026-09-21): planted rows + the LIVE interview rows read from the database at test time
// (active input_files.is_interview rows whose record is not retracted) — the 2026-09-20 run passed with a hardcoded
// 2 only because Edgewood's five TEST-* interview files were archived at that moment (restored 15:19 UTC that day).
import { expect, test, type Page, type Route } from "playwright/test";
import { COMPANY_ID } from "../../playwright.config";
import { openWorkspace } from "./helpers";

const PLANTED_FILES = [
  { id: "fixture-iv-1", file_name: "fixture-interview-customer.txt", file_type: "text/plain", file_path: "x/fixture-interview-customer.txt", tags: [], uploaded_at: "2026-09-20T12:00:00Z", archived_at: null, archive_reason: null, archive_source: null, is_interview: true },
  { id: "fixture-iv-2", file_name: "fixture-interview-stakeholder.txt", file_type: "text/plain", file_path: "x/fixture-interview-stakeholder.txt", tags: [], uploaded_at: "2026-09-20T12:00:00Z", archived_at: null, archive_reason: null, archive_source: null, is_interview: true },
];
const PLANTED_RECORDS = [
  { id: "fixture-rec-1", company_id: COMPANY_ID, input_file_id: "fixture-iv-1", speaker_role: "market_participant", market_state: "unplaced", journey_key: null, market_basis: [{ kind: "original", result: "none" }], review_state: "unreviewed", retracted_at: null, parsed_at: null, speaker_history: [] },
  { id: "fixture-rec-2", company_id: COMPANY_ID, input_file_id: "fixture-iv-2", speaker_role: "client_stakeholder", market_state: "per_item", journey_key: null, market_basis: [{ kind: "original", result: "none" }], review_state: "unreviewed", retracted_at: null, parsed_at: null, speaker_history: [] },
];

type Captured = { method: string; url: string; body: unknown };
type Live = { interviewFiles: Set<string>; retractedFileIds: Set<string> };
/** Live interview rows the page will render: active is_interview files minus those named by a retracted record. */
const liveInterviewRows = (live: Live) => [...live.interviewFiles].filter((id) => !live.retractedFileIds.has(id)).length;
const SUPABASE = /\/(rest|storage|functions)\/v1\//;
async function guard(page: Page, opts: { collision?: boolean } = {}): Promise<Captured[] & { live: Live }> {
  const live: Live = { interviewFiles: new Set(), retractedFileIds: new Set() };
  const captured = Object.assign([] as Captured[], { live });
  await page.route(SUPABASE, async (route: Route) => {
    const req = route.request(); const method = req.method(); const url = req.url();
    if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
      try {
        if (/\/rest\/v1\/input_files\?/.test(url) && !/archived_at=not\.is\.null/.test(url)) {
          const res = await route.fetch(); let rows: Array<Record<string, unknown>> = [];
          try { rows = JSON.parse(await res.text()); } catch { return route.fulfill({ response: res }); }
          const inputId = String(rows[0]?.input_id ?? "");
          for (const r of rows) if (r.archived_at == null && r.is_interview === true) live.interviewFiles.add(String(r.id));
          return route.fulfill({ response: res, body: JSON.stringify([...PLANTED_FILES.map((f) => ({ ...f, input_id: inputId })), ...rows]), headers: { ...res.headers(), "content-type": "application/json" } });
        }
        if (/\/rest\/v1\/interview_records\?/.test(url)) {
          const res = await route.fetch(); let rows: Array<Record<string, unknown>> = [];
          try { rows = JSON.parse(await res.text()); } catch { return route.fulfill({ response: res }); }
          for (const r of rows) if (r.retracted_at != null && r.input_file_id != null) live.retractedFileIds.add(String(r.input_file_id));
          return route.fulfill({ response: res, body: JSON.stringify([...rows, ...PLANTED_RECORDS]), headers: { ...res.headers(), "content-type": "application/json" } });
        }
      } catch { return; }
      return route.continue();
    }
    let body: unknown = null; try { body = req.postDataJSON(); } catch { body = req.postData(); }
    captured.push({ method, url, body });
    if (/\/rest\/v1\/rpc\/withdraw_interview_upload/.test(url)) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, record_id: (body as Record<string, unknown>).p_record_id, audit_id: 0 }) });
    if (/\/rest\/v1\/rpc\/correct_interview_speaker/.test(url)) {
      if (opts.collision) return route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ code: "23505", message: "speaker_identity_collision", details: "This transcript is already recorded with that speaker.", hint: null }) });
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, record_id: (body as Record<string, unknown>).p_record_id, speaker_role: (body as Record<string, unknown>).p_speaker_role }) });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });
  return captured;
}
async function operatorOn(page: Page) {
  await page.locator("[data-fr-operator-switch]").click();
  await expect(page.locator("[data-fr-operator-switch]")).toHaveAttribute("data-fr-operator-switch", "on");
}
const rpcCalls = (c: Captured[]) => c.filter((x) => /\/rest\/v1\/rpc\//.test(x.url)).map((x) => ({ fn: x.url.replace(/^.*\/rpc\//, "").replace(/\?.*$/, ""), body: x.body as Record<string, unknown> }));
const shot = async (page: Page, name: string) => { await page.evaluate(() => window.scrollBy(0, 260)); await page.screenshot({ path: `screenshots/item2/${name}.png`, fullPage: false }); };

test("(o) W1 on interview rows only, Archive × on ordinary rows only; confirm → one withdraw RPC; Cancel closes", async ({ page }) => {
  const captured = await guard(page);
  await openWorkspace(page, "inputs");
  await operatorOn(page);
  await page.locator("[data-testid=inputs-interview]").first().waitFor({ timeout: 30_000 });
  const interviewRows = page.locator("[data-testid=inputs-file-row]:has([data-testid=inputs-interview])");
  const ordinaryRows = page.locator("[data-testid=inputs-file-row]:not(:has([data-testid=inputs-interview]))");
  const nI = await interviewRows.count(); const nO = await ordinaryRows.count();
  const expectedInterview = PLANTED_FILES.length + liveInterviewRows(captured.live); // planted + live, read from the DB at test time
  expect(nI).toBe(expectedInterview); expect(nO).toBeGreaterThan(0);
  await expect(interviewRows.locator("[data-testid=inputs-withdraw]")).toHaveCount(nI);
  await expect(interviewRows.locator("[data-testid=inputs-archive]")).toHaveCount(0);
  await expect(ordinaryRows.locator("[data-testid=inputs-archive]")).toHaveCount(nO);
  await expect(ordinaryRows.locator("[data-testid=inputs-withdraw]")).toHaveCount(0);
  const row = page.locator('[data-testid=inputs-file-row][data-fr-file-id="fixture-iv-1"]');
  await expect(row.locator("[data-testid=inputs-withdraw]")).toHaveText("Withdraw interview (permanent)");
  await expect(row.locator("[data-testid=inputs-change-speaker]")).toHaveText("Change speaker");
  await row.scrollIntoViewIfNeeded();
  await shot(page, "100-interview-row-w1-p1");
  await row.locator("[data-testid=inputs-withdraw]").click();
  const confirm = page.getByTestId("inputs-withdraw-confirm");
  await expect(confirm).toBeVisible();
  await expect(confirm).toContainText("Withdraw this interview? This can't be undone. The file is archived and nothing from it is used.");
  await expect(confirm.getByTestId("inputs-withdraw-go")).toHaveText("Withdraw");
  await expect(confirm.getByTestId("inputs-withdraw-cancel")).toHaveText("Cancel");
  await confirm.scrollIntoViewIfNeeded();
  await shot(page, "101-interview-withdraw-confirm");
  await confirm.getByTestId("inputs-withdraw-cancel").click();
  await expect(confirm).toHaveCount(0);
  expect(rpcCalls(captured)).toEqual([]);
  await row.locator("[data-testid=inputs-withdraw]").click();
  await page.getByTestId("inputs-withdraw-go").click();
  await expect.poll(() => rpcCalls(captured).length).toBe(1);
  const call = rpcCalls(captured)[0];
  expect(call.fn).toBe("withdraw_interview_upload");
  expect(Object.keys(call.body)).toEqual(["p_record_id"]);
  expect(call.body.p_record_id).toBe("fixture-rec-1");
  expect(captured.filter((c) => !/\/rpc\//.test(c.url))).toHaveLength(0);
});

test("(o) P1 → listbox P3 (Stakeholder / Customer) → one correct_interview_speaker RPC; a stubbed collision → P2", async ({ page }) => {
  const captured = await guard(page, { collision: true });
  await openWorkspace(page, "inputs");
  await operatorOn(page);
  const row = page.locator('[data-testid=inputs-file-row][data-fr-file-id="fixture-iv-1"]');
  await row.locator("[data-testid=inputs-change-speaker]").waitFor({ timeout: 30_000 });
  await row.locator("[data-testid=inputs-change-speaker]").click();
  const list = row.locator("[data-testid=inputs-speaker-list]");
  await expect(list).toHaveAttribute("aria-label", "Choose the speaker");
  await expect(list.locator("[data-testid=inputs-speaker-option]")).toHaveText(["Stakeholder", "Customer"]);
  await list.scrollIntoViewIfNeeded();
  await shot(page, "102-interview-speaker-listbox");
  const other = "client_stakeholder"; // fixture-rec-1 is a customer record
  await list.locator(`[data-fr-speaker-role="${other}"]`).click();
  await expect.poll(() => rpcCalls(captured).length).toBe(1);
  const call = rpcCalls(captured)[0];
  expect(call.fn).toBe("correct_interview_speaker");
  expect(Object.keys(call.body).sort()).toEqual(["p_record_id", "p_speaker_role"]);
  expect(call.body).toEqual({ p_record_id: "fixture-rec-1", p_speaker_role: other });
  await expect(row.locator("[data-testid=inputs-speaker-collision]")).toHaveText("This transcript is already recorded with that speaker.");
  await shot(page, "103-interview-speaker-collision");
  expect(captured.filter((c) => !/\/rpc\//.test(c.url))).toHaveLength(0);
});
