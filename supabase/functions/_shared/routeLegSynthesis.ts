// Gate 2 — generate-route-legs synthesis core.
//
// A LEG = a route's supporting move: a concrete action that establishes or tests
// one of the conditions that must be true for the route to win. Generation rule
// (operator-signed): read a route's `what_would_have_to_be_true` and turn EVERY
// condition into ONE leg (one condition → one leg). An UNMET condition
// (satisfied_flag=false) → a live "Starting hypothesis" leg; a SATISFIED condition
// (satisfied_flag=true) → its leg is still generated but rendered struck-and-done
// ("✓ Condition met") — never dropped. A leg is a `routes` row with level='leg',
// parent_id=the parent route, provenance_type='internal_hypothesis'.
//
// LOCAL ONLY (Option B privacy): qwen2.5:14b-instruct generates, llama3:70b judges.
// ZERO OpenAI anywhere in this path — route conditions are internal/declared content.
// The judge is HONESTY-ONLY: it drops a move that is vague/not a concrete action,
// not genuinely tied to its condition, or fabricated. "Satisfied" is NOT a drop
// reason — it is a done-render. No count target: a route's leg count = its condition
// count (0 valid, N valid). Validation is FIDELITY only, never a shape.
//
// Mirrors stepConditionsSynthesis.ts: local Ollama call, deterministic org-name
// guard, frozen-fixture hard-exclude, origin-merge preserve (operator legs kept,
// generated legs re-rolled), write:false dry-run.

import { buildOrgNameGuard } from "./stepConditionsSynthesis.ts";

// Frozen reference fixtures — SELECT-only, never written. Mirror of the frontend
// guard (src/lib/frozenCompanies.ts). Remove when CB1/CB2 are retired.
export const FROZEN_COMPANY_IDS = new Set<string>([
  "58b2b15b-bada-4bcd-9c12-b7e66a37d0bc", // Cafe Barra (CB1)
  // CB2 (Cafe Barra 2, fd3f7f63…) UNFROZEN — now a normal writable, regenerable fixture.
]);

const DEFAULT_GEN_MODEL = "qwen2.5:14b-instruct";
const DEFAULT_JUDGE_MODEL = "llama3:70b";
const GEN_TIMEOUT_MS = 180_000;
const JUDGE_TIMEOUT_MS = 180_000;

const LEG_SOURCE_PREFIX = "generate-route-legs";
const LEG_PROVENANCE = "internal_hypothesis";

export type RouteCondition = { condition: string; satisfied_flag: boolean; evidence_refs?: string[] };

export type RouteInput = {
  id: string;
  user_id?: string | null;
  title: string;
  short_description?: string | null;
  category?: string | null;
  type?: string | null;
  conditions: RouteCondition[];
};

export type LegClass = "test" | "build";

export type ProposedLeg = {
  parent_route_id: string;
  route_title: string;
  condition: string;
  satisfied_flag: boolean;
  move: string;
  effort: "low" | "medium" | "high";
  leg_class: LegClass;    // test = goes and finds out; build = constructs the thing. NOT a drop reason.
  kept: boolean;          // judge verdict — false ⇒ dropped, not written/shown
  judge_reason: string;
};

export type RouteLegOutcome = {
  route_id: string;
  route_title: string;
  proposed: ProposedLeg[];      // every condition's candidate, with judge verdict
  written_count: number | null; // null on dry-run
  preserved_operator: number;   // operator legs kept on this route
};

export type RouteLegResult =
  | { ok: true; perRoute: RouteLegOutcome[]; totals: { routes: number; conditions: number; kept: number; dropped: number; written: number; preservedOperator: number } }
  | { ok: false; skipped: "frozen_company" | "no_routes" | "no_conditions" }
  | { ok: false; error: string };

// ── Local Ollama call (copied from stepConditionsSynthesis — native /api/chat, JSON) ──
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

// ── Generator (qwen): ONE condition → ONE concrete supporting move ──────────────
const GEN_SYSTEM =
  "You turn ONE condition that must be true for a strategic route to win into ONE concrete supporting MOVE — a specific action the team can take that would ESTABLISH or TEST whether that condition holds. " +
  "VOICE (client-facing): plain, human language — the kind of thing an owner or team would actually DO, not a consultant's phrasing. " +
  "Hard rules: " +
  "(1) Exactly ONE move, concrete and specific: a thing you DO, not a restatement of the condition and not an aspiration. " +
  "(2) The move must directly establish or test THIS condition — nothing broader. " +
  "(3) NEVER name the company, its brand, or any specific vendor/supplier. " +
  "(4) No canned filler ('is established', 'is documented', 'is tracked'). " +
  "(5) Solution-agnostic; concrete everyday nouns; no abstract business filler. " +
  "Keep the move short (a single imperative line). " +
  "JSON only: {\"move\":\"...\",\"effort\":\"low|medium|high\"}.";

function buildGenUser(route: RouteInput, condition: string): string {
  return (
    `Route (the win we are trying to make true): ${route.title}\n` +
    `Route detail: ${route.short_description || "(none)"}\n` +
    `Condition that must be true for this route to win: ${condition}\n` +
    `Give the ONE concrete move that would establish or test whether this condition holds.`
  );
}

async function generateLegMove(args: {
  ollamaUrl: string; genModel: string; route: RouteInput; condition: string;
}): Promise<{ move: string; effort: "low" | "medium" | "high" }> {
  const r = await callOllamaJson(args.ollamaUrl, args.genModel, GEN_SYSTEM, buildGenUser(args.route, args.condition), GEN_TIMEOUT_MS);
  if (!r.ok) throw new Error(`leg generator: model call failed for route ${args.route.id}: ${r.err}`);
  let parsed: unknown;
  try { parsed = JSON.parse(r.content ?? ""); }
  catch { throw new Error(`leg generator: unparseable model output for route ${args.route.id} (strict): ${String(r.content).slice(0, 160)}`); }
  const move = String((parsed as { move?: unknown })?.move ?? "").trim();
  const effortRaw = String((parsed as { effort?: unknown })?.effort ?? "medium").trim().toLowerCase();
  const effort = (["low", "medium", "high"].includes(effortRaw) ? effortRaw : "medium") as "low" | "medium" | "high";
  return { move, effort };
}

// ── Judge (llama3:70b): honesty gate — concrete · tied · non-fabricated ─────────
const JUDGE_SYSTEM =
  "You are a strict reviewer. You are given a strategic ROUTE, one CONDITION that must be true for that route to win, and a proposed supporting MOVE. " +
  "Decide if the move is acceptable. Reject (keep=false) if the move is ANY of: " +
  "(a) vague or not a concrete action (a restatement, an aspiration, a feeling); " +
  "(b) not genuinely an action that would establish or test THIS condition; " +
  "(c) fabricated — it invents facts, numbers, or specifics not grounded in the route and condition. " +
  "Accept (keep=true) ONLY a concrete, on-point, non-fabricated move. Judge honesty and fit, not style. " +
  "Also CLASSIFY the move: \"test\" if it goes and finds out whether the condition is true (gathers evidence — a survey, pilot, interview, audit, comparison, prototype-to-learn), or \"build\" if it constructs the thing the condition describes (creates, develops, integrates, sets up the capability). Classification is NOT a drop reason — both classes are valid legs. " +
  "JSON only: {\"keep\":true|false,\"reason\":\"<one short clause>\",\"class\":\"test|build\"}.";

function buildJudgeUser(route: RouteInput, condition: string, move: string): string {
  return (
    `Route: ${route.title}\n` +
    `Condition: ${condition}\n` +
    `Proposed move: ${move}\n` +
    `Is this move a concrete action that genuinely establishes or tests the condition, without fabricating?`
  );
}

async function judgeLegMove(args: {
  ollamaUrl: string; judgeModel: string; route: RouteInput; condition: string; move: string;
}): Promise<{ keep: boolean; reason: string; leg_class: LegClass }> {
  const r = await callOllamaJson(args.ollamaUrl, args.judgeModel, JUDGE_SYSTEM, buildJudgeUser(args.route, args.condition, args.move), JUDGE_TIMEOUT_MS);
  if (!r.ok) throw new Error(`leg judge: model call failed for route ${args.route.id}: ${r.err}`);
  let parsed: unknown;
  try { parsed = JSON.parse(r.content ?? ""); }
  catch { throw new Error(`leg judge: unparseable model output for route ${args.route.id} (strict): ${String(r.content).slice(0, 160)}`); }
  const keep = (parsed as { keep?: unknown })?.keep === true;
  const reason = String((parsed as { reason?: unknown })?.reason ?? "").trim();
  // Conservative default: only "test" when the judge clearly says so; otherwise "build".
  const leg_class: LegClass = String((parsed as { class?: unknown })?.class ?? "").trim().toLowerCase() === "test" ? "test" : "build";
  return { keep, reason, leg_class };
}

// ── Synthesize: per route → per condition → gen → judge → (write+preserve | dry) ─
export async function synthesizeRouteLegs(args: {
  supabase: { from: (t: string) => any };
  companyId: string;
  companyName: string;
  routes: RouteInput[];
  ollamaUrl: string;
  nowIso: string;
  genModel?: string;
  judgeModel?: string;
  runId?: string;
  write: boolean;
}): Promise<RouteLegOutcome[]> {
  const genModel = args.genModel ?? DEFAULT_GEN_MODEL;
  const judgeModel = args.judgeModel ?? DEFAULT_JUDGE_MODEL;
  const orgGuard = buildOrgNameGuard(args.companyName);
  const source = `${LEG_SOURCE_PREFIX}:${args.nowIso.slice(0, 10)}`;
  const perRoute: RouteLegOutcome[] = [];

  for (const route of args.routes) {
    // Load existing legs up front: so we can (a) SKIP generating for a condition an operator
    // already authored a leg for (no operator+generated duplicate on the same condition), and
    // (b) preserve operator legs while re-rolling generated ones.
    type ExistingLeg = { id: string; source?: string | null; provenance_type?: string | null; what_would_have_to_be_true?: unknown };
    let existingLegs: ExistingLeg[] = [];
    if (args.write) {
      const { data: existing } = await args.supabase
        .from("routes").select("id, source, provenance_type, what_would_have_to_be_true")
        .eq("parent_id", route.id).eq("level", "leg");
      existingLegs = (existing ?? []) as ExistingLeg[];
    }
    const isOperatorLeg = (l: ExistingLeg) =>
      String(l.source ?? "").startsWith("manual_") || String(l.provenance_type ?? "") === "manual";
    const operatorConditions = new Set(
      existingLegs.filter(isOperatorLeg)
        .map((l) => String((Array.isArray(l.what_would_have_to_be_true) ? (l.what_would_have_to_be_true as Array<Record<string, unknown>>)[0]?.condition : "") ?? "").trim())
        .filter(Boolean),
    );

    const proposed: ProposedLeg[] = [];
    // SWAP-BATCHING (isolate-timeout fix, option d): run ALL 14b generations for
    // this route first, THEN all 70b judgments — the interleaved gen→judge→gen…
    // order forced an Ollama VRAM model swap on nearly every call (only one of
    // the two models stays resident), which dominated the measured ≥28.6s per
    // condition-pair. Judge inputs are UNCHANGED: each generation depends only
    // on (route, condition) and each judgment only on (route, condition, move),
    // so phase order cannot alter what any call sees. Guards, prompts, and
    // origin-merge semantics are untouched.
    type GennedMove = { condition: string; satisfied_flag: boolean; move: string; effort: "low" | "medium" | "high" };
    const genned: GennedMove[] = [];
    for (const c of route.conditions) {
      const condition = String(c.condition || "").trim();
      if (!condition) continue;
      if (operatorConditions.has(condition)) continue; // an operator leg already covers this condition — keep it, don't double-generate
      const { move, effort } = await generateLegMove({ ollamaUrl: args.ollamaUrl, genModel, route, condition });
      genned.push({ condition, satisfied_flag: !!c.satisfied_flag, move, effort });
    }
    for (const g of genned) {
      // Deterministic org-name guard + empty/restatement rejection, then the 70b honesty judge.
      let keep = !!g.move && !orgGuard(g.move);
      let reason = !g.move ? "empty move" : orgGuard(g.move) ? "names the company" : "";
      let leg_class: LegClass = "build";
      if (keep) {
        const v = await judgeLegMove({ ollamaUrl: args.ollamaUrl, judgeModel, route, condition: g.condition, move: g.move });
        keep = v.keep; reason = v.reason || (v.keep ? "ok" : "rejected"); leg_class = v.leg_class;
      }
      proposed.push({
        parent_route_id: route.id,
        route_title: route.title,
        condition: g.condition,
        satisfied_flag: g.satisfied_flag,
        move: g.move,
        effort: g.effort,
        leg_class,
        kept: keep,
        judge_reason: reason,
      });
    }

    let written_count: number | null = null;
    const preserved_operator = existingLegs.filter(isOperatorLeg).length;

    if (args.write) {
      // Origin-merge preserve: keep operator-edited legs, re-roll generated ones.
      const generatedLegIds = existingLegs.filter((l) => !isOperatorLeg(l)).map((l) => l.id);
      if (generatedLegIds.length > 0) {
        const { error: delErr } = await args.supabase.from("routes").delete().in("id", generatedLegIds);
        if (delErr) throw new Error(`leg preserve-delete failed for route ${route.id}: ${delErr.message}`);
      }

      const keptLegs = proposed.filter((p) => p.kept);
      const rows = keptLegs.map((p, i) => ({
        company_id: args.companyId,
        user_id: route.user_id ?? null,
        parent_id: route.id,
        level: "leg",
        category: route.category ?? "improve",
        type: route.type ?? null,
        provenance_type: LEG_PROVENANCE,
        source,
        title: p.move,
        short_description: "",
        effort: p.effort,
        pts_value: 1,
        sort_order: i + 1,
        // Carry the source condition + done-state + class so the live LegRow can render
        // the derivation line, strike satisfied legs, and show the "Test" marker. The
        // leg_class is also Gate 3's on-ramp (it attaches a test to the test-class legs).
        what_would_have_to_be_true: [{ condition: p.condition, satisfied_flag: p.satisfied_flag, leg_class: p.leg_class }],
      }));
      if (rows.length > 0) {
        const { error: insErr } = await args.supabase.from("routes").insert(rows);
        if (insErr) throw new Error(`leg insert failed for route ${route.id}: ${insErr.message}`);
      }
      written_count = rows.length;
    }

    perRoute.push({ route_id: route.id, route_title: route.title, proposed, written_count, preserved_operator });
  }

  return perRoute;
}

// ── Company-level entry point (frozen guard + load routes + synthesize) ─────────
export async function generateLegsForCompany(args: {
  supabase: { from: (t: string) => any };
  companyId: string;
  ollamaUrl: string;
  nowIso: string;
  genModel?: string;
  judgeModel?: string;
  runId?: string;
  write: boolean;
  // CHUNKED INVOCATION (isolate-timeout fix, option a): when provided, scope the
  // run to these route ids so one request stays well under the 400s isolate
  // wall-clock. Absent ⇒ full-company behavior (harness/back-compat). Write
  // semantics are IDENTICAL either way — origin-merge is already per-route.
  routeIds?: string[];
}): Promise<RouteLegResult> {
  if (FROZEN_COMPANY_IDS.has(args.companyId)) return { ok: false, skipped: "frozen_company" };

  const { data: companyRow } = await args.supabase.from("companies").select("name").eq("id", args.companyId).maybeSingle();
  const companyName = String((companyRow as { name?: unknown } | null)?.name ?? "");

  let routeQuery = args.supabase
    .from("routes")
    .select("id, user_id, title, short_description, category, type, what_would_have_to_be_true")
    .eq("company_id", args.companyId)
    .eq("level", "route")
    .eq("relevance_state", "active");
  if (args.routeIds && args.routeIds.length > 0) {
    routeQuery = routeQuery.in("id", args.routeIds);
  }
  const { data: routeRows, error } = await routeQuery
    .order("sort_order", { ascending: true });
  if (error) return { ok: false, error: String(error.message || error) };

  const routes: RouteInput[] = ((routeRows ?? []) as Array<Record<string, unknown>>).map((r) => ({
    id: String(r.id),
    user_id: (r.user_id as string | null) ?? null,
    title: String(r.title ?? ""),
    short_description: (r.short_description as string | null) ?? null,
    category: (r.category as string | null) ?? null,
    type: (r.type as string | null) ?? null,
    conditions: Array.isArray(r.what_would_have_to_be_true)
      ? (r.what_would_have_to_be_true as Array<Record<string, unknown>>)
          .map((c) => ({ condition: String(c?.condition ?? "").trim(), satisfied_flag: c?.satisfied_flag === true }))
          .filter((c) => c.condition)
      : [],
  }));

  if (routes.length === 0) return { ok: false, skipped: "no_routes" };
  if (routes.every((r) => r.conditions.length === 0)) return { ok: false, skipped: "no_conditions" };

  const perRoute = await synthesizeRouteLegs({
    supabase: args.supabase,
    companyId: args.companyId,
    companyName,
    routes: routes.filter((r) => r.conditions.length > 0),
    ollamaUrl: args.ollamaUrl,
    nowIso: args.nowIso,
    genModel: args.genModel,
    judgeModel: args.judgeModel,
    runId: args.runId,
    write: args.write,
  });

  const totals = perRoute.reduce(
    (acc, r) => ({
      routes: acc.routes + 1,
      conditions: acc.conditions + r.proposed.length,
      kept: acc.kept + r.proposed.filter((p) => p.kept).length,
      dropped: acc.dropped + r.proposed.filter((p) => !p.kept).length,
      written: acc.written + (r.written_count ?? 0),
      preservedOperator: acc.preservedOperator + r.preserved_operator,
    }),
    { routes: 0, conditions: 0, kept: 0, dropped: 0, written: 0, preservedOperator: 0 },
  );

  return { ok: true, perRoute, totals };
}
