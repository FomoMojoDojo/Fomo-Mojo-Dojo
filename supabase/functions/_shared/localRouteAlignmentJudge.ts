// LOCAL LANE Phase 3b — route strategy-alignment judge.
//
// Restores the strategy_alignment verdict for INTERNAL (declared/NULL-provenance)
// routes LOCALLY (llama3:70b, direct Ollama) — internal text NEVER reaches OpenAI.
// The local mirror of evaluate-route-alignment's external gate, which declines
// internal routes (leaving strategy_alignment NULL). Reuses the shared verdict-judge
// core (localVerdictJudge): the 70b call, closed verdict set, required cited reason,
// fail-closed throw. Imports NO OpenAI client — zero-OpenAI is structural. Only the
// rubric + the route input shape are route-specific.
//
// Rubric localized from evaluate-route-alignment (the external route rubric): does
// this route serve the chosen cascade's Where-to-Play and reinforce its How-to-Win?
// Cascade-only context (routes have no journey_key; the route rubric uses only the
// market_read cascade, not market_def). Input fed whole — title/desc/category +
// what_would_have_to_be_true + rejected_alternatives + cascade (measured to fit 4096).

import { recordIntegrityRun } from "./integrity.ts";
import {
  type AlignmentVerdict,
  DEFAULT_JUDGE_MODEL,
  runVerdictJudge,
  type SupabaseLike,
} from "./localVerdictJudge.ts";

// Framework-grounded route rubric (Playing-to-Win Where-to-Play / How-to-Win), with
// the direct-beneficiary two-step test. Localized verbatim-in-spirit from the OpenAI
// evaluate-route-alignment systemText so the local verdict matches the external one.
const ROUTE_ALIGNMENT_SYSTEM =
  "You are a strategy alignment classifier. Given a company's strategy cascade and a candidate " +
  "ROUTE (a recommended action area), classify whether the route is aligned with the cascade's " +
  "WHERE-TO-PLAY (chosen customer/market) and HOW-TO-WIN (chosen mechanism).\n\n" +
  "Answer with JSON ONLY: {\"classification\":\"aligned\"|\"off_strategy\"|\"unknown\",\"reason\":\"...\"}.\n" +
  "- \"aligned\": the route directly serves the SAME customer segment and winning mechanism the " +
  "cascade specifies — the company wins by pursuing it within the chosen arena.\n" +
  "- \"off_strategy\": the route targets a DIFFERENT customer segment or a DIFFERENT winning " +
  "mechanism than the cascade specifies (e.g. aimed at end consumers when the cascade targets " +
  "B2B operators; building B2C touchpoints when the cascade wins through B2B partnership). Do NOT " +
  "let indirect downstream benefits rescue a route fundamentally aimed at a different customer — " +
  "classify by who DIRECTLY benefits.\n" +
  "- \"unknown\": the route or cascade is too vague to classify, or the fit is genuinely ambiguous. " +
  "Use this honestly — NEVER force a verdict the cascade cannot support.\n\n" +
  "TWO-STEP TEST before classifying: (1) Who is the DIRECT beneficiary of this route — compare to " +
  "the cascade's Where-to-Play segment. (2) What must the company BUILD/DO to execute it — does " +
  "that capability match the cascade's How-to-Win?\n" +
  "The reason MUST be 1-2 sentences and MUST cite WHICH strategy element drove the verdict (the " +
  "Where-to-Play customer or the How-to-Win mechanism).";

type RouteShape = {
  title?: string | null;
  short_description?: string | null;
  category?: string | null;
  rejected_alternatives?: Array<{ alternative_title?: string; rejection_reason?: string }> | null;
  what_would_have_to_be_true?: Array<{ condition?: string; satisfied_flag?: boolean }> | null;
};

type CascadeCtx = { winningAspiration: string; whereToPlay: string; howToWin: string };

// Cascade-only context (the market_read cascade). Read-only; internal content stays local.
async function fetchCascadeContext(
  supabase: SupabaseLike,
  companyId: string,
): Promise<CascadeCtx | null> {
  const { data: cascade } = await supabase
    .from("strategy_cascades")
    .select("winning_aspiration, where_to_play, how_to_win, created_at")
    .eq("company_id", companyId)
    .eq("artifact_role", "market_read")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!cascade) return null;
  const c = cascade as Record<string, string | null>;
  return {
    winningAspiration: String(c.winning_aspiration ?? ""),
    whereToPlay: String(c.where_to_play ?? ""),
    howToWin: String(c.how_to_win ?? ""),
  };
}

export function buildRouteUser(ctx: CascadeCtx, route: RouteShape): string {
  const raText = Array.isArray(route.rejected_alternatives) && route.rejected_alternatives.length > 0
    ? route.rejected_alternatives
        .map((r, i) => `${i + 1}. ${r.alternative_title ? `${r.alternative_title} — ` : ""}${r.rejection_reason ?? ""}`)
        .join("\n")
    : "None documented.";
  const wwhtbtText = Array.isArray(route.what_would_have_to_be_true) && route.what_would_have_to_be_true.length > 0
    ? route.what_would_have_to_be_true
        .map((c, i) => `${i + 1}. ${c.condition ?? ""}${c.satisfied_flag ? " [satisfied]" : " [unproven]"}`)
        .join("\n")
    : "None documented.";
  return (
    `CASCADE:\n` +
    `Winning aspiration: ${ctx.winningAspiration || "(not set)"}\n` +
    `Where to play (chosen customer/market): ${ctx.whereToPlay || "(not set)"}\n` +
    `How to win (chosen mechanism): ${ctx.howToWin || "(not set)"}\n\n` +
    `ROUTE:\n` +
    `Title: ${route.title ?? "(none)"}\n` +
    `Category: ${route.category ?? "(none)"}\n` +
    `Description: ${route.short_description ?? "(none)"}\n\n` +
    `Rejected alternatives (why other approaches were ruled out):\n${raText}\n\n` +
    `What would have to be true for this route to succeed:\n${wwhtbtText}\n\n` +
    `Is this route aligned with the strategy above?`
  );
}

// Judge one route's strategy alignment LOCALLY. Records exactly one integrity_runs row
// (completed with the verdict, or failed with the error) and, on failure, THROWS so the
// caller surfaces it without writing or falling back.
export async function judgeRouteAlignmentLocal(args: {
  supabase: SupabaseLike;
  companyId: string;
  routeId: string;
  route: RouteShape;
  ollamaUrl: string;
  judgeModel?: string;
}): Promise<{ classification: AlignmentVerdict; reason: string }> {
  const judgeModel = args.judgeModel ?? DEFAULT_JUDGE_MODEL;
  try {
    const ctx = await fetchCascadeContext(args.supabase, args.companyId);
    if (!ctx) throw new Error("no market_read strategy cascade for company");
    const userText = buildRouteUser(ctx, args.route);
    const verdict = await runVerdictJudge({ ollamaUrl: args.ollamaUrl, judgeModel, system: ROUTE_ALIGNMENT_SYSTEM, userText });
    console.log(`[local-route-alignment] ${args.routeId} → ${verdict.classification}`);
    await recordIntegrityRun(args.supabase, {
      company_id: args.companyId,
      component: "local_route_alignment",
      surface_type: "route",
      surface_id: args.routeId,
      status: "completed",
      examined: 1,
      admitted: 1,
      excluded_by_rule: { verdict: verdict.classification, model: judgeModel },
      run_ref: "local-route-alignment",
    });
    return verdict;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[local-route-alignment] ${args.routeId}: FAILED (fail-closed): ${message}`);
    await recordIntegrityRun(args.supabase, {
      company_id: args.companyId,
      component: "local_route_alignment",
      surface_type: "route",
      surface_id: args.routeId,
      status: "failed",
      examined: 1,
      error: `local route alignment: ${message}`,
      run_ref: "local-route-alignment",
    });
    throw err; // fail-closed: surface, never fabricate, never fall back to OpenAI
  }
}
