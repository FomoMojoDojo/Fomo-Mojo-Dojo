// Stage-0 — generate-route-conditions synthesis core.
//
// A CONDITION = one of the falsifiable things that MUST BE TRUE for a route to win
// (the route's `what_would_have_to_be_true` / WRAP preconditions). This is the
// upstream layer the leg generator consumes (one condition → one leg). Generation
// rule (operator-signed): per route, produce 2–3 conditions — testable claims,
// satisfied_flag=false (unvalidated assumptions), stored on the parent route's
// what_would_have_to_be_true jsonb. This NEVER re-authors the route and never
// touches legs/tests/other content — additive metadata only.
//
// LOCAL ONLY (Option B privacy): qwen2.5:14b-instruct generates, llama3:70b judges.
// ZERO OpenAI anywhere in this path. The judge is SOLUTION-AGNOSTIC: it rejects a
// "condition" that prescribes a solution or an action (that is a leg, not a
// condition — a condition states WHAT MUST BE TRUE, never HOW), that is not
// falsifiable / restates the route, that is not a genuine precondition, or that
// fabricates.
//
// Mirrors routeLegSynthesis.ts: local Ollama call, deterministic org-name guard,
// frozen-fixture hard-exclude (imported — no 5th list), origin-merge preserve
// (operator conditions kept verbatim, generated re-rolled), write:false dry-run,
// per-route persistence (survives the Kong gateway timeout).

import { buildOrgNameGuard, FROZEN_COMPANY_IDS } from "./stepConditionsSynthesis.ts";

const DEFAULT_GEN_MODEL = "qwen2.5:14b-instruct";
const DEFAULT_JUDGE_MODEL = "llama3:70b";
const GEN_TIMEOUT_MS = 180_000;
const JUDGE_TIMEOUT_MS = 180_000;

const CONDITION_SOURCE_PREFIX = "generate-route-conditions";

export type WrapCondition = { condition: string; satisfied_flag?: boolean; source?: string | null; [k: string]: unknown };

export type RouteInput = {
  id: string;
  title: string;
  short_description?: string | null;
  category?: string | null;
  existing: WrapCondition[]; // current what_would_have_to_be_true array (verbatim)
};

export type ProposedCondition = {
  condition: string;
  kept: boolean;        // judge verdict — false ⇒ dropped, not written
  judge_reason: string;
};

export type RouteConditionOutcome = {
  route_id: string;
  route_title: string;
  proposed: ProposedCondition[];   // every candidate, with judge verdict
  written_count: number | null;    // null on dry-run; final condition count on write
  preserved_operator: number;      // operator conditions kept verbatim on this route
};

export type RouteConditionResult =
  | { ok: true; perRoute: RouteConditionOutcome[]; totals: { routes: number; proposed: number; kept: number; dropped: number; written: number; preservedOperator: number } }
  | { ok: false; skipped: "frozen_company" | "no_routes" }
  | { ok: false; error: string };

// ── Local Ollama call (copied from routeLegSynthesis — native /api/chat, JSON) ──
async function callOllamaJson(
  ollamaUrl: string,
  model: string,
  system: string,
  user: string,
  timeoutMs: number,
  numCtx = 8192,
): Promise<{ ok: boolean; content?: string; err?: string }> {
  const nativeBase = ollamaUrl.replace(/\/v1\/?$/, "");
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const resp = await fetch(`${nativeBase}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer ollama" },
      body: JSON.stringify({
        model,
        format: "json",
        stream: false,
        options: { num_ctx: numCtx, temperature: 0.2 },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
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

// ── Generator (qwen): ONE route → 2–3 falsifiable CONDITIONS ─────────────────────
const GEN_SYSTEM =
  "You state the CONDITIONS that must be TRUE for a strategic route to win — the falsifiable preconditions, NOT the actions to take. " +
  "For the given route, produce 2 or 3 conditions. Each condition is a testable claim that must hold for this route to succeed. " +
  "VOICE (client-facing): plain, human language — a falsifiable claim (\"Customers value X enough to Y\"; \"The team can build capability W within timeframe V\"). " +
  "Hard rules: " +
  "(1) State a CONDITION (what must be TRUE), NEVER a solution or an action to take — a move like 'build/launch/create X' is a leg, not a condition. " +
  "(2) Each condition must be FALSIFIABLE: it could turn out false; not a truism, not a restatement of the route title. " +
  "(3) Each condition must be a genuine precondition for THIS route specifically. " +
  "(4) NEVER name the company, its brand, or any specific vendor/supplier. " +
  "(5) Do NOT invent facts, numbers, or specifics not grounded in the route. " +
  "(6) Solution-agnostic; concrete everyday nouns; no abstract business filler. " +
  "Each condition is a single short sentence. " +
  "JSON only: {\"conditions\":[\"...\",\"...\"]}.";

function buildGenUser(route: RouteInput): string {
  return (
    `Route (the win we are trying to make true): ${route.title}\n` +
    `Route detail: ${route.short_description || "(none)"}\n` +
    `Route category: ${route.category || "(none)"}\n` +
    `Give the 2-3 conditions that MUST BE TRUE for this route to win. State conditions (what must be true), not actions.`
  );
}

async function generateRouteConditions(args: {
  ollamaUrl: string; genModel: string; route: RouteInput;
}): Promise<string[]> {
  const r = await callOllamaJson(args.ollamaUrl, args.genModel, GEN_SYSTEM, buildGenUser(args.route), GEN_TIMEOUT_MS);
  if (!r.ok) throw new Error(`route-condition generator: model call failed for route ${args.route.id}: ${r.err}`);
  let parsed: unknown;
  try { parsed = JSON.parse(r.content ?? ""); }
  catch { throw new Error(`route-condition generator: unparseable model output for route ${args.route.id} (strict): ${String(r.content).slice(0, 160)}`); }
  const arr = (parsed as { conditions?: unknown })?.conditions;
  if (!Array.isArray(arr)) throw new Error(`route-condition generator: no conditions array for route ${args.route.id}`);
  // Take at most 3, non-empty, de-duped by normalized text.
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of arr) {
    const s = String(c ?? "").trim();
    const key = s.toLowerCase();
    if (s && !seen.has(key)) { seen.add(key); out.push(s); }
    if (out.length >= 3) break;
  }
  return out;
}

// ── Judge (llama3:70b): SOLUTION-AGNOSTIC gate — falsifiable · precondition · not-a-move ──
const JUDGE_SYSTEM =
  "You are a strict reviewer. You are given a strategic ROUTE and one proposed CONDITION that must be true for that route to win. " +
  "Decide if the condition is acceptable. Reject (keep=false) if the condition is ANY of: " +
  "(a) it PRESCRIBES A SOLUTION OR AN ACTION (e.g. 'build a portal', 'launch a program', 'create X', 'implement Y') — that is a move, NOT a condition; a condition states WHAT MUST BE TRUE, never HOW to do it; " +
  "(b) not falsifiable, vague, or a restatement of the route; " +
  "(c) not a genuine precondition for THIS route; " +
  "(d) fabricated — it invents facts, numbers, or specifics not grounded in the route. " +
  "Accept (keep=true) ONLY a falsifiable, on-point, solution-agnostic condition. Judge substance and honesty, not style. " +
  "JSON only: {\"keep\":true|false,\"reason\":\"<one short clause>\"}.";

function buildJudgeUser(route: RouteInput, condition: string): string {
  return (
    `Route: ${route.title}\n` +
    `Proposed condition: ${condition}\n` +
    `Is this a falsifiable precondition for the route that states WHAT MUST BE TRUE (not a solution/action to take), without fabricating?`
  );
}

async function judgeRouteCondition(args: {
  ollamaUrl: string; judgeModel: string; route: RouteInput; condition: string;
}): Promise<{ keep: boolean; reason: string }> {
  const r = await callOllamaJson(args.ollamaUrl, args.judgeModel, JUDGE_SYSTEM, buildJudgeUser(args.route, args.condition), JUDGE_TIMEOUT_MS);
  if (!r.ok) throw new Error(`route-condition judge: model call failed for route ${args.route.id}: ${r.err}`);
  let parsed: unknown;
  try { parsed = JSON.parse(r.content ?? ""); }
  catch { throw new Error(`route-condition judge: unparseable model output for route ${args.route.id} (strict): ${String(r.content).slice(0, 160)}`); }
  const keep = (parsed as { keep?: unknown })?.keep === true;
  const reason = String((parsed as { reason?: unknown })?.reason ?? "").trim();
  return { keep, reason };
}

const isGeneratedCondition = (c: WrapCondition) => String(c?.source ?? "").startsWith(`${CONDITION_SOURCE_PREFIX}:`);

// ── Synthesize: per route → gen 2–3 → judge each → origin-merge → (write | dry) ──
export async function synthesizeRouteConditions(args: {
  supabase: { from: (t: string) => any };
  companyId: string;
  companyName: string;
  routes: RouteInput[];
  ollamaUrl: string;
  nowIso: string;
  genModel?: string;
  judgeModel?: string;
  write: boolean;
}): Promise<RouteConditionOutcome[]> {
  const genModel = args.genModel ?? DEFAULT_GEN_MODEL;
  const judgeModel = args.judgeModel ?? DEFAULT_JUDGE_MODEL;
  const orgGuard = buildOrgNameGuard(args.companyName);
  const source = `${CONDITION_SOURCE_PREFIX}:${args.nowIso.slice(0, 10)}`;
  const perRoute: RouteConditionOutcome[] = [];

  for (const route of args.routes) {
    // Origin-merge: operator conditions (NO generate-route-conditions source) are kept
    // verbatim; generated conditions are re-rolled. Don't duplicate an operator topic.
    const operatorConditions = route.existing.filter((c) => !isGeneratedCondition(c) && String(c?.condition ?? "").trim());
    const operatorTexts = new Set(operatorConditions.map((c) => String(c.condition).trim().toLowerCase()));

    let candidates: string[] = [];
    try {
      candidates = await generateRouteConditions({ ollamaUrl: args.ollamaUrl, genModel, route });
    } catch (e) {
      // Surface a per-route generator failure without aborting the whole run.
      perRoute.push({ route_id: route.id, route_title: route.title, proposed: [{ condition: "", kept: false, judge_reason: String((e as Error)?.message ?? e) }], written_count: null, preserved_operator: operatorConditions.length });
      continue;
    }

    const proposed: ProposedCondition[] = [];
    const keptGenerated: WrapCondition[] = [];
    for (const cond of candidates) {
      const condition = cond.trim();
      if (!condition) continue;
      // Deterministic org-name guard + operator-duplicate skip, then the 70b judge.
      let keep = !orgGuard(condition) && !operatorTexts.has(condition.toLowerCase());
      let reason = orgGuard(condition) ? "names the company" : operatorTexts.has(condition.toLowerCase()) ? "duplicates an operator condition" : "";
      if (keep) {
        const v = await judgeRouteCondition({ ollamaUrl: args.ollamaUrl, judgeModel, route, condition });
        keep = v.keep; reason = v.reason || (v.keep ? "ok" : "rejected");
      }
      proposed.push({ condition, kept: keep, judge_reason: reason });
      if (keep) keptGenerated.push({ condition, satisfied_flag: false, source });
    }

    // New array = operator conditions (verbatim) ∪ fresh kept-generated.
    const merged: WrapCondition[] = [...operatorConditions, ...keptGenerated];

    let written_count: number | null = null;
    if (args.write) {
      // Per-route UPDATE so a gateway/worker timeout never loses processed routes.
      const { error: upErr } = await args.supabase
        .from("routes").update({ what_would_have_to_be_true: merged }).eq("id", route.id);
      if (upErr) throw new Error(`route-condition update failed for route ${route.id}: ${upErr.message}`);
      written_count = merged.length;
    }

    perRoute.push({
      route_id: route.id,
      route_title: route.title,
      proposed,
      written_count,
      preserved_operator: operatorConditions.length,
    });
  }

  return perRoute;
}

// ── Company-level entry point (frozen guard + load routes + synthesize) ─────────
export async function generateRouteConditionsForCompany(args: {
  supabase: { from: (t: string) => any };
  companyId: string;
  ollamaUrl: string;
  nowIso: string;
  genModel?: string;
  judgeModel?: string;
  write: boolean;
}): Promise<RouteConditionResult> {
  if (FROZEN_COMPANY_IDS.has(args.companyId)) return { ok: false, skipped: "frozen_company" };

  const { data: companyRow } = await args.supabase.from("companies").select("name").eq("id", args.companyId).maybeSingle();
  const companyName = String((companyRow as { name?: unknown } | null)?.name ?? "");

  const { data: routeRows, error } = await args.supabase
    .from("routes")
    .select("id, title, short_description, category, what_would_have_to_be_true")
    .eq("company_id", args.companyId)
    .eq("level", "route")
    .eq("relevance_state", "active")
    .order("sort_order", { ascending: true });
  if (error) return { ok: false, error: String(error.message || error) };

  const routes: RouteInput[] = ((routeRows ?? []) as Array<Record<string, unknown>>).map((r) => ({
    id: String(r.id),
    title: String(r.title ?? ""),
    short_description: (r.short_description as string | null) ?? null,
    category: (r.category as string | null) ?? null,
    existing: Array.isArray(r.what_would_have_to_be_true) ? (r.what_would_have_to_be_true as WrapCondition[]) : [],
  }));

  if (routes.length === 0) return { ok: false, skipped: "no_routes" };

  const perRoute = await synthesizeRouteConditions({
    supabase: args.supabase,
    companyId: args.companyId,
    companyName,
    routes,
    ollamaUrl: args.ollamaUrl,
    nowIso: args.nowIso,
    genModel: args.genModel,
    judgeModel: args.judgeModel,
    write: args.write,
  });

  const totals = perRoute.reduce(
    (acc, r) => ({
      routes: acc.routes + 1,
      proposed: acc.proposed + r.proposed.length,
      kept: acc.kept + r.proposed.filter((p) => p.kept).length,
      dropped: acc.dropped + r.proposed.filter((p) => !p.kept).length,
      written: acc.written + (r.written_count ?? 0),
      preservedOperator: acc.preservedOperator + r.preserved_operator,
    }),
    { routes: 0, proposed: 0, kept: 0, dropped: 0, written: 0, preservedOperator: 0 },
  );

  return { ok: true, perRoute, totals };
}
