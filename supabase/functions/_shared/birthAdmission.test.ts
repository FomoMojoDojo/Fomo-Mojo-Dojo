// Birth admission (2026-09-16) — the rule research-company / run-agent-flow / public-baseline share.
// (a) no_public_site → refused by name; (b) no baseline row AND no uploads → refused (an absent baseline
// used to read as "ok"); (c) a baseline row admits; (d) uploads admit; (e) the skipped birth is ledgered
// with status 'skipped'. Plus source guards that each function actually wires the rule: research-company
// maps absent → weak and refuses no_public_site with 422; public-baseline refuses no_public_site with 422
// BEFORE its website 400; run-agent-flow skips before the guard and ledgers.
import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { fakeDb } from "./fakeSupabaseForTests.ts";
import { birthAdmission, ledgerSkippedBirth, readNoPublicSite } from "./birthAdmission.ts";

const CO = "co-admission";
const seed = (o: { noSite?: boolean; baseline?: boolean } = {}) => fakeDb({
  companies: [{ id: CO, name: "Proof", website: o.noSite ? null : "https://x.example", no_public_site: Boolean(o.noSite) }],
  public_baseline_runs: o.baseline ? [{ id: "b1", company_id: CO, result_json: { status: "ok" } }] : [],
  long_runner_runs: [],
});

Deno.test("(a) no_public_site → refused by name, even with a baseline row", async () => {
  const db = seed({ noSite: true, baseline: true });
  const r = await birthAdmission(db, CO, { hasUploadedEvidence: async () => true });
  assert(!r.ok); assertEquals(r.reason, "no_public_site"); assertStringIncludes(r.message, "no public site");
  assertEquals(await readNoPublicSite(db, CO), true);
});
Deno.test("(b) no baseline row + no uploads → refused (absent is not ok)", async () => {
  const r = await birthAdmission(seed(), CO, { hasUploadedEvidence: async () => false });
  assert(!r.ok); assertEquals(r.reason, "no_baseline"); assertStringIncludes(r.message, "name alone");
});
Deno.test("(c) a baseline row admits; (d) uploads admit without a baseline", async () => {
  assertEquals((await birthAdmission(seed({ baseline: true }), CO, { hasUploadedEvidence: async () => false })).ok, true);
  assertEquals((await birthAdmission(seed(), CO, { hasUploadedEvidence: async () => true })).ok, true);
});
Deno.test("(e) the skipped birth is ledgered: run_kind birth, status skipped, error_text = reason", async () => {
  const db = seed({ noSite: true });
  await ledgerSkippedBirth(db, CO, "no_public_site");
  assertEquals(db.tables.long_runner_runs.length, 1);
  const row = db.tables.long_runner_runs[0];
  assertEquals(row.run_kind, "birth"); assertEquals(row.status, "skipped"); assertEquals(row.error_text, "no_public_site"); assertEquals(row.company_id, CO);
});

const read = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));
Deno.test("research-company: absent baseline is weak, and no_public_site refuses with 422 before the lock", async () => {
  const src = await read("../research-company/index.ts");
  assertStringIncludes(src, 'run ? String((run?.result_json as { status?: string } | null)?.status || "ok") : "absent"');
  assertStringIncludes(src, '|| status === "absent"');
  assertStringIncludes(src, 'const hasWeakBaselineStatus = isWeakBaselineStatus(baselineStatus);');
  assertStringIncludes(src, 'if (await readNoPublicSite(supabase, String(company_id))) {\n      return jsonResponse({ error: "no_public_site", message: NO_PUBLIC_SITE_MESSAGE }, 422);');
  assert(src.indexOf('error: "no_public_site"') < src.indexOf("acquireCompanyRunLock({"), "the refusal precedes the run lock");
});
Deno.test("public-baseline: no_public_site refuses with 422 by name, before the website 400", async () => {
  const src = await read("../public-baseline/index.ts");
  const refuse = src.indexOf('return json({ error: "no_public_site", message: NO_PUBLIC_SITE_MESSAGE }, 422);');
  const door = src.indexOf('company_name and website are required');
  assert(refuse > 0 && door > 0 && refuse < door, "422 no_public_site precedes the 400 door");
  assertStringIncludes(src, 'select("name,website,public_source_filters_json,no_public_site")');
});
Deno.test("run-agent-flow: skips before the guard and ledgers the skip", async () => {
  const src = await read("../run-agent-flow/index.ts");
  const skip = src.indexOf("const admission = await birthAdmission(supabase, String(companyId), {");
  const invoke = src.indexOf("const requestBody: Record<string, unknown> = {");
  assert(skip > 0 && invoke > 0 && skip < invoke, "admission precedes the research-company request body");
  assertStringIncludes(src, "await ledgerSkippedBirth(supabase, String(companyId), admission.reason);");
  assertStringIncludes(src, "return { status: `skipped_${admission.reason}`");
  // no_public_site is refused at the DOOR, before a flow row is opened — the skip ledger row is the only row
  const door = src.indexOf('.no_public_site === true) {\n    await ledgerSkippedBirth(supabase, String(companyId), "no_public_site");');
  const flowRow = src.indexOf('.from("agent_flow_runs")\n    .insert({');
  assert(door > 0 && flowRow > 0 && door < flowRow, "door refusal precedes the agent_flow_runs insert");
});
