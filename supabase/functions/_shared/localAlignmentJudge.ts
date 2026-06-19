// LOCAL LANE Phase 1 — declared-opportunity strategy-alignment judge.
//
// Restores the strategy_alignment verdict for INTERNAL (declared) opportunities
// LOCALLY (llama3:70b, direct Ollama, native /api/chat) — internal text NEVER
// reaches OpenAI. This module imports NO OpenAI client, so the Option-B guarantee
// is structural, not just procedural.
//
// Four properties (single-sourced HERE — the template canonical/cascade slices
// inherit):
//  • Not a black box — closed verdict set + a REQUIRED reason citing the strategy
//    element that drove the call + one integrity_runs audit record per eval.
//  • Framework-grounded — Playing-to-Win (Where-to-Play / How-to-Win / Winning
//    Aspiration) + ODI (job executor + JTBD). Rubric + verdict set + the
//    strategy-context builder all live in this one file.
//  • Adjudicated against hallucination — verdict ∈ {aligned, off_strategy,
//    unknown}; "unknown" is the honest escape when the cascade can't support a
//    call; no second judge-of-judge.
//  • Robust/fail-closed — on model error or unparseable/invalid output: record an
//    integrity row and THROW. NEVER fall back to OpenAI, NEVER fabricate a verdict,
//    NEVER write a row on failure.

import { recordIntegrityRun } from "./integrity.ts";

const JUDGE_TIMEOUT_MS = 120_000;
const DEFAULT_JUDGE_MODEL = "llama3:70b";

export const ALIGNMENT_VERDICTS = ["aligned", "off_strategy", "unknown"] as const;
export type AlignmentVerdict = (typeof ALIGNMENT_VERDICTS)[number];

// Framework-grounded rubric (Playing-to-Win + ODI). Single source of truth.
const ALIGNMENT_SYSTEM =
  "You judge whether a proposed CUSTOMER OPPORTUNITY is ALIGNED with the company's chosen " +
  "strategy, using Playing-to-Win and Outcome-Driven Innovation. You are given the strategy as: " +
  "WINNING ASPIRATION, WHERE TO PLAY (the chosen customer/market), HOW TO WIN (the chosen " +
  "mechanism), and the JOB EXECUTOR plus their JOB-TO-BE-DONE.\n\n" +
  "Decide: does pursuing this opportunity serve the SAME customer named in Where-to-Play AND " +
  "reinforce the How-to-Win mechanism, moving the company toward its Winning Aspiration?\n" +
  "- \"aligned\": serves the Where-to-Play customer and reinforces the How-to-Win mechanism.\n" +
  "- \"off_strategy\": targets a DIFFERENT customer than Where-to-Play, or requires building " +
  "capabilities outside How-to-Win, or pulls toward a different market position.\n" +
  "- \"unknown\": the cascade is too vague or empty to judge, or the fit is genuinely ambiguous " +
  "on the information given. Use this honestly — NEVER force a verdict the cascade cannot support.\n\n" +
  "Answer with JSON ONLY: {\"classification\":\"aligned\"|\"off_strategy\"|\"unknown\",\"reason\":\"...\"}. " +
  "The reason MUST be 1-2 sentences and MUST cite WHICH strategy element drove the verdict " +
  "(the Where-to-Play customer, the How-to-Win mechanism, the Winning Aspiration, or the JTBD).";

export type StrategyContext = {
  winningAspiration: string;
  whereToPlay: string;
  howToWin: string;
  jobExecutor: string;
  jtbd: string;
};

// The one strategy-context builder. Compact by construction (cascade 3 fields +
// executor + JTBD) so it fits the 70b num_ctx 4096 ceiling without trimming.
export function buildStrategyContextUser(ctx: StrategyContext, outcome: string): string {
  return (
    `WINNING ASPIRATION: ${ctx.winningAspiration || "(not set)"}\n` +
    `WHERE TO PLAY (chosen customer/market): ${ctx.whereToPlay || "(not set)"}\n` +
    `HOW TO WIN (chosen mechanism): ${ctx.howToWin || "(not set)"}\n` +
    `JOB EXECUTOR (who is doing the job): ${ctx.jobExecutor || "(not set)"}\n` +
    `JOB TO BE DONE: ${ctx.jtbd || "(not set)"}\n\n` +
    `PROPOSED OPPORTUNITY (a desired outcome): ${outcome}\n` +
    `Is pursuing this opportunity aligned with the strategy above?`
  );
}

type SupabaseLike = { from: (t: string) => any };

// Fetch the chosen strategy context for a (company, journey): the market_read
// cascade + the journey's market definition. Read-only; internal content stays local.
async function fetchStrategyContext(
  supabase: SupabaseLike,
  companyId: string,
  journeyKey: string,
): Promise<StrategyContext | null> {
  const { data: cascade } = await supabase
    .from("strategy_cascades")
    .select("winning_aspiration, where_to_play, how_to_win, created_at")
    .eq("company_id", companyId)
    .eq("artifact_role", "market_read")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!cascade) return null;

  const { data: marketDef } = await supabase
    .from("odi_market_definitions")
    .select("job_executor, jtbd")
    .eq("company_id", companyId)
    .eq("journey_key", journeyKey)
    .maybeSingle();

  const c = cascade as Record<string, string | null>;
  const m = (marketDef ?? {}) as Record<string, string | null>;
  return {
    winningAspiration: String(c.winning_aspiration ?? ""),
    whereToPlay: String(c.where_to_play ?? ""),
    howToWin: String(c.how_to_win ?? ""),
    jobExecutor: String(m.job_executor ?? ""),
    jtbd: String(m.jtbd ?? ""),
  };
}

// The fail-closed 70b call. Mirrors opportunityLikelihoodJudge's HTTP skeleton
// (native /api/chat, format:json, num_ctx:4096, abort timeout) — but where that
// judge FAIL-SAFEs to Medium, this one FAILS CLOSED: any failure throws.
async function judgeOnce(
  ollamaUrl: string,
  judgeModel: string,
  userText: string,
): Promise<{ classification: AlignmentVerdict; reason: string }> {
  const nativeBase = ollamaUrl.replace(/\/v1\/?$/, "");
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), JUDGE_TIMEOUT_MS);
  try {
    const resp = await fetch(`${nativeBase}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer ollama" },
      body: JSON.stringify({
        model: judgeModel,
        format: "json",
        stream: false,
        options: { num_ctx: 4096 },
        messages: [
          { role: "system", content: ALIGNMENT_SYSTEM },
          { role: "user", content: userText },
        ],
      }),
      signal: controller.signal,
    });
    if (!resp.ok) {
      throw new Error(`ollama HTTP ${resp.status}: ${(await resp.text().catch(() => "")).slice(0, 200)}`);
    }
    const data = await resp.json().catch(() => null);
    const content = String(data?.message?.content ?? "");
    let parsed: { classification?: string; reason?: string };
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new Error(`unparseable judge output: ${content.slice(0, 200)}`);
    }
    const classification = String(parsed.classification ?? "").toLowerCase().trim();
    const reason = String(parsed.reason ?? "").trim();
    if (!(ALIGNMENT_VERDICTS as readonly string[]).includes(classification)) {
      throw new Error(`invalid verdict from judge: ${JSON.stringify(parsed.classification)}`);
    }
    if (!reason) {
      throw new Error("judge returned empty reason (a cited reason is required)");
    }
    return { classification: classification as AlignmentVerdict, reason };
  } finally {
    clearTimeout(timeoutId);
  }
}

// Judge one declared opportunity's strategy alignment LOCALLY. Records exactly one
// integrity_runs row (completed with the verdict, or failed with the error) and,
// on failure, THROWS so the caller surfaces it without writing or falling back.
export async function judgeOpportunityAlignmentLocal(args: {
  supabase: SupabaseLike;
  companyId: string;
  journeyKey: string;
  needId: string;
  outcome: string;
  ollamaUrl: string;
  judgeModel?: string;
}): Promise<{ classification: AlignmentVerdict; reason: string }> {
  const judgeModel = args.judgeModel ?? DEFAULT_JUDGE_MODEL;
  try {
    const ctx = await fetchStrategyContext(args.supabase, args.companyId, args.journeyKey);
    if (!ctx) throw new Error("no market_read strategy cascade for company");
    const userText = buildStrategyContextUser(ctx, args.outcome);
    const verdict = await judgeOnce(args.ollamaUrl, judgeModel, userText);
    console.log(`[local-alignment-judge] ${args.needId} → ${verdict.classification}`);
    await recordIntegrityRun(args.supabase, {
      company_id: args.companyId,
      component: "local_alignment_judge",
      surface_type: "opportunity",
      surface_id: args.needId,
      status: "completed",
      examined: 1,
      admitted: 1,
      excluded_by_rule: { verdict: verdict.classification, model: judgeModel },
      run_ref: "local-alignment",
    });
    return verdict;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[local-alignment-judge] ${args.needId}: FAILED (fail-closed): ${message}`);
    await recordIntegrityRun(args.supabase, {
      company_id: args.companyId,
      component: "local_alignment_judge",
      surface_type: "opportunity",
      surface_id: args.needId,
      status: "failed",
      examined: 1,
      error: `local alignment: ${message}`,
      run_ref: "local-alignment",
    });
    throw err; // fail-closed: surface, never fabricate, never fall back to OpenAI
  }
}
