// MH-5a: market-hypothesis generator. Synthesizes ONE market sentence (executor +
// the job they're getting done) for a declared set from its steps, judged the
// buyer's-OWN-job (not seller/acquisition framing — the b-ii executor judge), and
// written as a LABELED hypothesis (provenance_type='internal_hypothesis'). Sibling
// to stepConditionsSynthesis — same shape, lighter (one sentence per set). LOCAL
// only (qwen2.5:14b). Internal content never leaves the box.
//
// PROTECTION: generate/write ONLY for sets whose market_def is absent or boilerplate.
// A manual (operator-authored) market_def is NEVER overwritten; an existing
// non-boilerplate hypothesis is left as-is.

import { judgeConditionPerspectives } from "./stepPerspectiveJudge.ts";

const GEN_TIMEOUT_MS = 180_000;
const DEFAULT_GEN_MODEL = "qwen2.5:14b-instruct";

// Boilerplate market jtbd (research-company:3269 stem) — mirrors the MH-2 render
// guard (JobMapOrgPanel isBoilerplateJtbd). A boilerplate row is treated as
// "no honest market" → eligible for (re)generation, and routed to emptiness at render.
const BOILERPLATE_MARKERS: RegExp[] = [
  /when\s+trying\s+to\s+complete\s+this\s+job/i,
  /move\s+from\s+defining\s+outcomes\s+to\s+executing\s+and\s+monitoring\s+progress/i,
];
export function isBoilerplateMarketJtbd(jtbd: string | null | undefined): boolean {
  const s = String(jtbd ?? "");
  return BOILERPLATE_MARKERS.some((re) => re.test(s));
}

export type MarketHypothesis = { job_executor: string; jtbd: string; chooser: string };

export type MarketHypothesisResult =
  | { ok: true; written: MarketHypothesis }
  | { ok: false; skipped: "protected_manual" | "already_hypothesis" | "no_steps" }
  | { ok: false; rejected: "seller"; candidate: MarketHypothesis }
  | { ok: false; error: string };

async function callOllamaJson(ollamaUrl: string, model: string, system: string, user: string, timeoutMs: number, numCtx = 8192): Promise<{ ok: boolean; content?: string; err?: string }> {
  const nativeBase = ollamaUrl.replace(/\/v1\/?$/, "");
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const resp = await fetch(`${nativeBase}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer ollama" },
      body: JSON.stringify({ model, format: "json", stream: false, options: { num_ctx: numCtx, temperature: 0.2 },
        messages: [{ role: "system", content: system }, { role: "user", content: user }] }),
      signal: ctrl.signal,
    });
    if (!resp.ok) return { ok: false, err: `HTTP ${resp.status}` };
    const data = await resp.json().catch(() => ({}));
    return { ok: true, content: String(data?.message?.content ?? "") };
  } catch (e) {
    return { ok: false, err: String((e as Error)?.message || e) };
  } finally {
    clearTimeout(t);
  }
}

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

export async function generateMarketHypothesisForSet(args: {
  supabase: { from: (t: string) => any };
  companyId: string;
  journeyKey: string;
  ollamaUrl: string;
  nowIso: string;
  genModel?: string;
  judgeModel?: string;
  runId?: string;
  // Deliberate regenerate: overwrite an existing internal_hypothesis. Manual
  // (operator-authored) market_defs stay protected regardless.
  force?: boolean;
}): Promise<MarketHypothesisResult> {
  const genModel = args.genModel ?? DEFAULT_GEN_MODEL;

  // Existing market_def for this set + protection.
  const { data: existing } = await args.supabase
    .from("odi_market_definitions")
    .select("id, user_id, job_executor, jtbd, provenance_type")
    .eq("company_id", args.companyId)
    .eq("journey_key", args.journeyKey)
    .maybeSingle();
  const existingRow = existing as { id?: string; user_id?: string; job_executor?: string | null; jtbd?: string | null; provenance_type?: string | null } | null;
  if (existingRow && String(existingRow.provenance_type ?? "") === "manual") return { ok: false, skipped: "protected_manual" };
  if (!args.force && existingRow && existingRow.jtbd && !isBoilerplateMarketJtbd(existingRow.jtbd)) return { ok: false, skipped: "already_hypothesis" };

  // The set's steps (the executor's world).
  const { data: stepRows } = await args.supabase
    .from("job_steps")
    .select("step_label, description, user_id")
    .eq("company_id", args.companyId)
    .eq("journey_key", args.journeyKey)
    .order("step_number", { ascending: true });
  const steps = (stepRows ?? []) as Array<{ step_label?: string | null; description?: string | null; user_id?: string }>;
  if (steps.length === 0) return { ok: false, skipped: "no_steps" };

  // Generate (strict: model CONTENT or loud fail).
  const r = await callOllamaJson(args.ollamaUrl, genModel, GEN_SYSTEM, buildGenUser(steps, existingRow?.job_executor), GEN_TIMEOUT_MS);
  if (!r.ok) return { ok: false, error: `market generator: model call failed: ${r.err}` };
  let parsed: unknown;
  try { parsed = JSON.parse(r.content ?? ""); } catch { return { ok: false, error: `market generator: unparseable output (strict): ${String(r.content).slice(0, 160)}` }; }
  const p = parsed as { job_executor?: unknown; jtbd?: unknown; chooser?: unknown };
  const candidate: MarketHypothesis = {
    job_executor: String(p?.job_executor ?? "").trim(),
    jtbd: String(p?.jtbd ?? "").trim(),
    chooser: String(p?.chooser ?? "").trim(),
  };
  if (!candidate.job_executor || !candidate.jtbd) return { ok: false, error: "market generator: empty executor/jtbd (strict)" };
  if (isBoilerplateMarketJtbd(candidate.jtbd)) return { ok: false, error: "market generator: model returned boilerplate jtbd (strict)" };

  // Judge: the jtbd must be the executor's OWN job, not seller/acquisition framing.
  // Reuses the b-ii executor judge + verdict-by-content-identity store.
  const verdicts = await judgeConditionPerspectives({
    supabase: args.supabase,
    companyId: args.companyId,
    stepLabel: `market:${args.journeyKey}`,
    conditions: [candidate.jtbd],
    executorBrief: candidate.job_executor,
    ollamaUrl: args.ollamaUrl,
    judgeModel: args.judgeModel,
    persist: true,
  });
  if (verdicts[0]?.verdict !== "buyer") return { ok: false, rejected: "seller", candidate };

  // Write as a LABELED hypothesis (never 'manual'). Update the absent/boilerplate
  // row in place, or insert when absent.
  const payload = {
    job_executor: candidate.job_executor,
    jtbd: candidate.jtbd,
    chooser: candidate.chooser,
    provenance_type: "internal_hypothesis",
    source_path: "market_hypothesis_synthesis",
    frameworks_used: ["JTBD", "ODI", "local_ollama", "market_hypothesis_synthesis"],
    updated_at: args.nowIso,
  };
  if (existingRow?.id) {
    const { error } = await args.supabase.from("odi_market_definitions").update(payload).eq("id", existingRow.id);
    if (error) return { ok: false, error: `market_def update failed: ${error.message}` };
  } else {
    const userId = steps.find((s) => s.user_id)?.user_id ?? null;
    const { error } = await args.supabase.from("odi_market_definitions").insert({
      company_id: args.companyId, journey_key: args.journeyKey, user_id: userId, ...payload,
    });
    if (error) return { ok: false, error: `market_def insert failed: ${error.message}` };
  }
  return { ok: true, written: candidate };
}
