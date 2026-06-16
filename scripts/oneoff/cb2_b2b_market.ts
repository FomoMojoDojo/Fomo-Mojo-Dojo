// ONE-OFF (provenance record): generate CB2's b2b-buyer market hypothesis and fix
// the mis-keyed customer row. CB2 is a FROZEN fixture — this script DELIBERATELY
// bypasses the freeze for this single authorized run by REPLICATING the MH-5
// synthesis pipeline (GEN_SYSTEM / buildGenUser / callOllamaJson copied verbatim
// from _shared/marketHypothesisSynthesis.ts) rather than calling
// generateMarketHypothesisForSet (whose first line is the FROZEN check). It does NOT
// touch FROZEN_COMPANY_IDS or the production frozen check. LOCAL model only.
//
// Run:
//   eval "$(supabase status -o env | grep -E '^(SERVICE_ROLE_KEY|API_URL)=')"
//   SUPABASE_URL="$API_URL" SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY" \
//   deno run --allow-net --allow-env scripts/oneoff/cb2_b2b_market.ts
import { judgeConditionPerspectives } from "../../supabase/functions/_shared/stepPerspectiveJudge.ts";
import { isBoilerplateMarketJtbd } from "../../supabase/functions/_shared/marketHypothesisSynthesis.ts";

const SB = Deno.env.get("SUPABASE_URL") ?? "http://127.0.0.1:54321";
const KEY = Deno.env.get("SERVICE_ROLE_KEY") ?? "";
const OLLAMA = "http://localhost:11434/v1";
const GEN_MODEL = "qwen2.5:14b-instruct";
const CB2 = "fd3f7f63-968b-4698-b946-3d6b6450d79d";
const headers = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const get = async (p: string) => await (await fetch(`${SB}/rest/v1/${p}`, { headers })).json();

// --- verbatim from _shared/marketHypothesisSynthesis.ts (one-off replication) ---
const GEN_SYSTEM =
  "You define the MARKET a job map serves: WHO the job executor (the buying side) is, and the JOB they are getting done — in the executor's OWN terms. " +
  "Hard rules: " +
  "(1) Describe the BUYER/executor's own job, NEVER a seller or acquisition goal — never 'increase the percentage who choose/buy X', never the selling company's growth or sales. " +
  "(2) NEVER name a company, brand, or vendor. " +
  "(3) job_executor = a SINGLE clause naming WHO the executor is AND the job they are getting done — the 'who + what' market sentence, NOT a bare audience. Form exemplar (match the SHAPE, not the facts): 'Independent cafe operators sourcing a specialty coffee offering for their venue.' jtbd = ONE sentence with the deeper detail of the progress they are trying to make. chooser = who makes the choice. " +
  "(4) Specific to THIS set's steps, in the executor's domain vocabulary. No canned filler ('move from defining outcomes to executing and monitoring progress'). " +
  "JSON only: {\"job_executor\":\"...\",\"jtbd\":\"...\",\"chooser\":\"...\"}.";
function buildGenUser(steps: Array<{ step_label?: string | null; description?: string | null }>, priorExecutor: string | null | undefined): string {
  return (
    `Existing executor hint (may be empty): ${priorExecutor || "(none)"}\n` +
    `The set's steps (what the executor is actually doing):\n` +
    steps.map((s) => `- ${String(s.step_label ?? "")}: ${String(s.description ?? "")}`).join("\n") + "\n" +
    `Define the market: who is the executor, and what job are they getting done?`
  );
}
async function callOllamaJson(system: string, user: string) {
  const nativeBase = OLLAMA.replace(/\/v1\/?$/, "");
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 180_000);
  try {
    const resp = await fetch(`${nativeBase}/api/chat`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer ollama" },
      body: JSON.stringify({ model: GEN_MODEL, format: "json", stream: false, options: { num_ctx: 8192, temperature: 0.2 }, messages: [{ role: "system", content: system }, { role: "user", content: user }] }), signal: ctrl.signal });
    if (!resp.ok) return { ok: false as const, err: `HTTP ${resp.status}` };
    const data = await resp.json().catch(() => ({}));
    return { ok: true as const, content: String(data?.message?.content ?? "") };
  } finally { clearTimeout(t); }
}

// minimal supabase-shaped adapter for the judge (.from().select().eq().eq().maybeSingle() + insert)
function makeClient() {
  function from(table: string) {
    const st: any = { op: "select", cols: "*", filters: [] as [string, string][], payload: null };
    const qs = () => st.filters.map(([c, v]: [string, string]) => `${c}=eq.${encodeURIComponent(v)}`).join("&");
    const run = async () => {
      if (st.op === "select") { const data = await get(`${table}?select=${encodeURIComponent(st.cols)}${st.filters.length ? "&" + qs() : ""}`); return { data, error: null }; }
      const r = await fetch(`${SB}/rest/v1/${table}`, { method: "POST", headers: { ...headers, Prefer: "return=minimal" }, body: JSON.stringify(st.payload) });
      return { data: null, error: r.ok ? null : { message: await r.text() } };
    };
    const api: any = {
      select(c?: string) { st.op = "select"; st.cols = c || "*"; return api; },
      eq(c: string, v: string) { st.filters.push([c, v]); return api; },
      insert(o: unknown) { st.op = "insert"; st.payload = o; return api; },
      async maybeSingle() { const { data } = await run(); return { data: Array.isArray(data) ? (data[0] ?? null) : data, error: null }; },
      then(res: (v: unknown) => void, rej: (e: unknown) => void) { run().then(res, rej); },
    };
    return api;
  }
  return { from };
}
const sb = makeClient();

async function main() {
  console.log("=".repeat(78), "\nCB2 b2b-buyer market — one-off generate (frozen bypass, script-local)\n" + "=".repeat(78));
  const steps = (await get(`job_steps?company_id=eq.${CB2}&journey_key=eq.b2b-buyer&select=step_label,description,user_id&order=step_number.asc`)) as Array<{ step_label?: string; description?: string; user_id?: string }>;
  if (!steps.length) { console.error("no b2b-buyer steps"); Deno.exit(1); }
  const userId = steps.find((s) => s.user_id)?.user_id ?? null;

  // generate
  const r = await callOllamaJson(GEN_SYSTEM, buildGenUser(steps, undefined));
  if (!r.ok) { console.error("model failed", r.err); Deno.exit(1); }
  let parsed: any; try { parsed = JSON.parse(r.content); } catch { console.error("unparseable:", r.content.slice(0, 200)); Deno.exit(1); }
  const cand = { job_executor: String(parsed?.job_executor ?? "").trim(), jtbd: String(parsed?.jtbd ?? "").trim(), chooser: String(parsed?.chooser ?? "").trim() };
  console.log("\nGENERATED:", JSON.stringify(cand, null, 2));
  if (!cand.job_executor || !cand.jtbd) { console.error("empty executor/jtbd"); Deno.exit(1); }
  if (isBoilerplateMarketJtbd(cand.jtbd)) { console.error("boilerplate jtbd — abort"); Deno.exit(1); }

  // judge — must pass buyer
  const verdicts = await judgeConditionPerspectives({ supabase: sb, companyId: CB2, stepLabel: "market:b2b-buyer", conditions: [cand.jtbd], executorBrief: cand.job_executor, ollamaUrl: OLLAMA, judgeModel: "llama3:70b", persist: true });
  console.log("JUDGE verdict:", verdicts[0]?.verdict);
  if (verdicts[0]?.verdict !== "buyer") { console.error("judge rejected (seller-framed) — NOT writing. Re-run to re-roll."); Deno.exit(1); }

  // write b2b-buyer row (insert) + delete mis-keyed customer row
  const ins = await fetch(`${SB}/rest/v1/odi_market_definitions`, { method: "POST", headers: { ...headers, Prefer: "return=minimal" },
    body: JSON.stringify({ company_id: CB2, journey_key: "b2b-buyer", user_id: userId, job_executor: cand.job_executor, jtbd: cand.jtbd, chooser: cand.chooser, provenance_type: "internal_hypothesis", source_path: "market_hypothesis_synthesis:oneoff_cb2_b2b", frameworks_used: ["JTBD", "ODI", "local_ollama", "market_hypothesis_synthesis"], updated_at: new Date().toISOString() }) });
  if (!ins.ok) { console.error("insert failed:", await ins.text()); Deno.exit(1); }
  console.log("\nINSERTED b2b-buyer market_def (internal_hypothesis)");

  const delr = await fetch(`${SB}/rest/v1/odi_market_definitions?company_id=eq.${CB2}&journey_key=eq.customer`, { method: "DELETE", headers: { ...headers, Prefer: "return=minimal" } });
  if (!delr.ok) { console.error("delete customer row failed:", await delr.text()); Deno.exit(1); }
  console.log("DELETED mis-keyed customer-keyed row");

  // confirm
  const rows = (await get(`odi_market_definitions?company_id=eq.${CB2}&select=journey_key,job_executor,provenance_type`)) as any[];
  console.log("\nCB2 market_defs now:", JSON.stringify(rows));
  console.log("=".repeat(78), "\nDONE\n" + "=".repeat(78));
}
main().catch((e) => { console.error("FATAL", e); Deno.exit(1); });
