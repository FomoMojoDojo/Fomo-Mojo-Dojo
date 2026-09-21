// (x5) The in-flight row against the REAL stack — no stub on integrity_runs or interview_records (R40, R41, R42,
// signed 2026-09-21). Fixture: bob2 (admin) creates a throwaway company with one customer-research input, one
// interview file row and one customer interview record through the DEV window.supabase; the spec writes the
// planned integrity row, the run's end state and the failed entry with psql in the DB container (the browser has
// no INSERT policy on integrity_runs, and the record's basis is append-only through the trigger); the real
// workspace Inputs page is loaded as the admin. Everything is deleted by company cascade — never CB1 / CB2 /
// Edgewood data. The verbatim is a throwaway string.
//   (R40) a fresh planned row → M2, no M1, no "Change speaker"; aged past 5 minutes → M1 and "Change speaker" back.
//         Plant: the page's M2 condition ignoring the polled in-flight set.
//   (R41) a fresh planned row → M2; the run ends (row completed, record placed by an inference entry) → the page
//         re-reads the records and shows M3 with the market title, no M1, without a reload.
//         Plant: the refetch on leaving the in-flight set removed (hook).
//   (R42) the LAST basis entry is a failed inference and nothing is in flight → M4 beside M1 on load; an operator
//         override after it → not M4. Plant: lastRunFailed always false (hook).
import { execFileSync } from "node:child_process";
import { expect, test, type Page } from "playwright/test";

type Sb = { from: (t: string) => any; auth: { getUser: () => Promise<{ data: { user: { id: string } | null } }> } };
const FIXTURE = "FIXTURE (not a transcript) — x5 real-stack proof.\nSpeaker A: a throwaway line.\n";
const PGC = process.env.PGC || "supabase_db_dzlgyxcvuwiulgifbmew";
const MARKET_KEY = "mkt-fixture"; const MARKET_TITLE = "Fixture market title (x5)";
const psql = (sql: string) => execFileSync("docker", ["exec", "-i", PGC, "psql", "-U", "postgres", "-d", "postgres", "-At", "-q", "-v", "ON_ERROR_STOP=1", "-c", sql], { encoding: "utf8" }).trim().split("\n")[0]; // first line: the value, not the command tag

async function openAs(page: Page, companyId: string, path: string) {
  await page.addInitScript((id) => { try { localStorage.setItem("active_company_id", id); } catch { /* no storage */ } }, companyId);
  await page.goto(path, { waitUntil: "networkidle", timeout: 120_000 });
}
type Planted = { cid: string; fileId: string; recId: string; adminId: string };
/** The throwaway: company + customer-research input + interview file row + customer record (browser, admin), one live market definition (psql). */
async function plant(page: Page, tag: string): Promise<Planted> {
  await openAs(page, "", "/preview/client-refine/workshop");
  const planted = await page.evaluate(async (args) => {
    const s = (window as unknown as { supabase: Sb }).supabase;
    const { data: { user } } = await s.auth.getUser();
    const { data: co, error: cErr } = await s.from("companies").insert({ name: args.name, created_by: user!.id, no_public_site: true }).select("id").single();
    if (cErr) return { error: `company: ${cErr.message}` };
    const cid = (co as { id: string }).id;
    const bail = async (why: string) => { await s.from("companies").delete().eq("id", cid); return { error: why }; };
    const { data: inp, error: iErr } = await s.from("inputs").insert({ company_id: cid, user_id: user!.id, input_key: "customer-research", input_label: "Customer Research", group_key: "foundation", group_label: "P", sub_group: "P", completeness: 0, status: "not_started", score_impact: 1.0, impact_tier: "low" }).select("id").single();
    if (iErr) return bail(`input: ${iErr.message}`);
    const { data: file, error: fErr } = await s.from("input_files").insert({ input_id: (inp as { id: string }).id, file_name: `fixture-${args.tag}.txt`, file_type: "text/plain", file_path: `${user!.id}/zz-x5/${Date.now()}/fixture-${args.tag}.txt`, tags: [], is_interview: true }).select("id").single();
    if (fErr) return bail(`input_files: ${fErr.message}`);
    const { data: rec, error: rErr } = await s.from("interview_records").insert({ company_id: cid, speaker_role: "market_participant", verbatim: args.fixture, created_by: user!.id, input_file_id: (file as { id: string }).id, file_sha256: "a".repeat(64), file_bytes: args.fixture.length, text_sha256: "b".repeat(64), extraction_method: "local_text_reader", extraction_version: "v", market_state: "unplaced", market_basis: [{ kind: "original", result: "none" }] }).select("id").single();
    if (rErr) return bail(`record: ${rErr.message}`);
    return { cid, fileId: (file as { id: string }).id, recId: (rec as { id: string }).id, adminId: user!.id };
  }, { name: `zz-x5-${tag}-${Date.now()}`, fixture: FIXTURE, tag });
  expect(planted.error ?? null).toBeNull();
  const p = planted as Planted;
  psql(`insert into odi_market_definitions (company_id, user_id, journey_key, job_executor, jtbd, market_register) values ('${p.cid}', '${p.adminId}', '${MARKET_KEY}', 'Fixture executor', 'Fixture job', 'internal_declared')`);
  psql(`insert into market_lens (company_id, journey_key, title) values ('${p.cid}', '${MARKET_KEY}', '${MARKET_TITLE}')`);
  return p;
}
async function cleanup(page: Page, cid: string, runId: string) {
  const gone = await page.evaluate(async (c) => {
    const s = (window as unknown as { supabase: Sb }).supabase;
    const { error } = await s.from("companies").delete().eq("id", c);
    const { data } = await s.from("companies").select("id").eq("id", c).maybeSingle();
    return { error: error?.message ?? null, stillThere: Boolean(data) };
  }, cid);
  expect(gone).toEqual({ error: null, stillThere: false });
  if (runId) expect(psql(`select count(*) from integrity_runs where id = ${runId}`)).toBe("0"); // cascaded with the company
}
const plannedRow = (cid: string, recId: string) => psql(`insert into integrity_runs (company_id, component, surface_type, surface_id, ran_at, status, examined, admitted, excluded_by_rule, run_ref) values ('${cid}', 'interview_market_inference', 'interview_records', '${recId}', now(), 'planned', 1, 0, '{"windows_total":1,"windows_done":0}', 'x5-spec') returning id`);
async function openInputs(page: Page, cid: string, fileId: string) {
  await openAs(page, cid, "/preview/client-refine/workspace/inputs");
  await expect(page.getByTestId("workspace-root")).toBeVisible({ timeout: 60_000 });
  await page.locator("[data-fr-operator-switch]").click();
  await expect(page.locator("[data-fr-operator-switch]")).toHaveAttribute("data-fr-operator-switch", "on");
  const row = page.locator(`[data-testid=inputs-file-row][data-fr-file-id="${fileId}"]`);
  await expect(row).toBeVisible({ timeout: 30_000 });
  return row;
}

test("(R40) a real planned row → M2, no M1, no 'Change speaker'; aged past 5 minutes → M1 and 'Change speaker' return", async ({ page }) => {
  test.setTimeout(240_000);
  const { cid, fileId, recId } = await plant(page, "r40");
  let runId = "";
  try {
    runId = plannedRow(cid, recId);
    expect(runId).toMatch(/^\d+$/);
    expect(psql(`select interview_inference_in_flight('${recId}')`)).toBe("t");
    const row = await openInputs(page, cid, fileId);
    await expect(row.locator("[data-testid=inputs-interview-market]")).toContainText("Inferring market…", { timeout: 15_000 });
    await expect(row.locator("[data-testid=inputs-infer-market]")).toHaveCount(0);
    await expect(row.locator("[data-testid=inputs-change-speaker]")).toHaveCount(0);
    await expect(row.locator("[data-testid=inputs-infer-failed]")).toHaveCount(0);
    // stopped: 5 minutes without a bump — the next poll (≤ 5 s) offers M1 and "Change speaker" again
    psql(`update integrity_runs set ran_at = now() - interval '6 minutes' where id = ${runId}`);
    expect(psql(`select interview_inference_in_flight('${recId}')`)).toBe("f");
    await expect(row.locator("[data-testid=inputs-infer-market]")).toHaveText("Infer market", { timeout: 20_000 });
    await expect(row.locator("[data-testid=inputs-change-speaker]")).toHaveCount(1);
    await expect(row.locator("[data-testid=inputs-interview-market]")).toContainText("Market not inferred");
    await expect(row.locator("[data-testid=inputs-interview-market]")).not.toContainText("Inferring market…");
  } finally { await cleanup(page, cid, runId); }
});

test("(R41) the run ends while the page is open → the records are re-read: M3 with the market title, no M1, no reload", async ({ page }) => {
  test.setTimeout(240_000);
  const { cid, fileId, recId } = await plant(page, "r41");
  let runId = "";
  try {
    runId = plannedRow(cid, recId);
    const row = await openInputs(page, cid, fileId);
    await expect(row.locator("[data-testid=inputs-interview-market]")).toContainText("Inferring market…", { timeout: 15_000 });
    // the run ends exactly as infer-interview-market ends it: the record placed by an APPENDED inference entry, then the row completed
    psql(`update interview_records set journey_key = '${MARKET_KEY}', market_state = 'placed', market_basis = market_basis || '[{"kind":"inference","result":"placed","journey_key":"${MARKET_KEY}","run_id":${runId},"windows_total":1,"windows_run":1,"named":1,"votes":{"${MARKET_KEY}":1}}]'::jsonb where id = '${recId}'`);
    psql(`update integrity_runs set status = 'completed', admitted = 1, ran_at = now() where id = ${runId}`);
    await expect(row.locator("[data-testid=inputs-interview-market]")).toContainText(`Market inferred: ${MARKET_TITLE}`, { timeout: 20_000 });
    await expect(row.locator("[data-testid=inputs-infer-market]")).toHaveCount(0);
    await expect(row.locator("[data-testid=inputs-infer-failed]")).toHaveCount(0);
    await expect(row.locator("[data-testid=inputs-interview-market]")).not.toContainText("Inferring market…");
  } finally { await cleanup(page, cid, runId); }
});

test("(R42) a persisted failed last run → M4 beside M1 on load; an operator override after it → not M4", async ({ page }) => {
  test.setTimeout(240_000);
  const { cid, fileId, recId } = await plant(page, "r42");
  try {
    psql(`update interview_records set market_basis = market_basis || '[{"kind":"inference","result":"failed","failure_reason":"context_overflow","windows_total":1,"windows_run":1,"named":0,"votes":{}}]'::jsonb where id = '${recId}'`);
    const row = await openInputs(page, cid, fileId);
    await expect(row.locator("[data-testid=inputs-infer-failed]")).toHaveText("Market inference failed", { timeout: 15_000 });
    await expect(row.locator("[data-testid=inputs-infer-market]")).toHaveText("Infer market");
    await expect(row.locator("[data-testid=inputs-interview-market]")).toContainText("Market not inferred");
    await expect(row.locator("[data-testid=inputs-interview-market]")).not.toContainText("last run found no majority");
    // the operator places it after the failure → the title alone, no M4, no M1
    await row.locator("[data-testid=inputs-change-market]").click();
    await row.locator(`[data-testid=inputs-market-option][data-fr-set-key="${MARKET_KEY}"]`).click();
    await expect(row.locator("[data-testid=inputs-interview-market]")).toContainText(MARKET_TITLE, { timeout: 15_000 });
    await expect(row.locator("[data-testid=inputs-infer-failed]")).toHaveCount(0);
    await expect(row.locator("[data-testid=inputs-infer-market]")).toHaveCount(0);
    await expect(row.getByText("Market inferred:")).toHaveCount(0);
  } finally { await cleanup(page, cid, ""); }
});
