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
import { contentIdentity } from "./contentIdentity.ts";

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
  // Coached-rewrite (CG-1): set on the 2nd-attempt candidate — the id of the
  // attempt-1 text this revision rewrites. Both attempts are recorded in `proposed`;
  // only a kept attempt is ever written to the route.
  revision_of?: string;
};

export type RouteConditionOutcome = {
  route_id: string;
  route_title: string;
  proposed: ProposedCondition[];   // every candidate, with judge verdict
  written_count: number | null;    // null on dry-run; final condition count on write
  preserved_operator: number;      // operator conditions kept verbatim on this route
  // Hole-close reconcile (piece #2): what the re-roll superseded and how legs reconciled.
  superseded_conditions?: number;  // generated conditions whose identity changed/vanished
  orphaned_legs?: number;          // legs declared orphaned (source condition gone)
  refused_preserved?: boolean;     // route write refused: a preserved-class leg would orphan
  error?: string;                  // per-route honest error (e.g. the preserved refusal)
};

export type RouteConditionResult =
  | { ok: true; perRoute: RouteConditionOutcome[]; totals: { routes: number; proposed: number; kept: number; dropped: number; written: number; preservedOperator: number; superseded: number; orphanedLegs: number; refusedPreserved: number } }
  | { ok: false; skipped: "frozen_company" | "no_routes" }
  | { ok: false; error: string };

// WF-3 plan manifest: the route worklist for the client's chunk loop. Zero model
// calls, zero writes — resume truth (a re-click re-plans and re-chunks only the
// routes not yet reconciled). Route-condition re-rolls are idempotent per route
// (origin-merge by contentIdentity), so a re-run over an already-done route
// converges without duplicating.
export type RouteConditionPlanResult =
  | { ok: true; plan: true; routes: Array<{ id: string; title: string; condition_count: number }> }
  | { ok: false; skipped: "frozen_company" | "no_routes" };

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
  "(7) FORWARD/TARGET FRAMING — each condition is the POSITIVE precondition that must HOLD for the route to win (the forward win, stated affirmatively). NEVER state the condition as the PRESENCE of a problem, pain, confusion, gap, or deficiency. If the route addresses a pain ('users hit frequent audio issues'), state the target that must be true instead ('users can resolve common audio issues on their own when given clear, specific guidance'). It must still be a GENUINE, falsifiable bet that could turn out false — asserting the forward precondition holds is NOT a truism; asserting a problem is present is deficiency framing and is forbidden. " +
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
  "(d) fabricated — it invents facts, numbers, or specifics not grounded in the route; " +
  "(e) DEFICIENCY-AS-THE-CONDITION — the thing the condition asserts MUST BE TRUE is the PRESENCE of a problem, pain, confusion, gap, or deficiency, rather than the positive/target precondition the route needs to hold. Judge the PROPOSITION the condition asserts, NOT vocabulary: do NOT reject merely because a problem is named as context — reject only when the asserted precondition ITSELF is that the deficiency exists (e.g. 'users encounter frequent issues …' asserts the problem is present, so any leg built on it bets the problem exists instead of betting on progress). A forward precondition the route depends on is acceptable. " +
  "Accept (keep=true) ONLY a falsifiable, on-point, solution-agnostic, forward/target-framed condition. Judge substance and honesty, not style. " +
  "JSON only: {\"keep\":true|false,\"reason\":\"<one short clause>\"}.";

function buildJudgeUser(route: RouteInput, condition: string): string {
  return (
    `Route: ${route.title}\n` +
    `Proposed condition: ${condition}\n` +
    `Is this a falsifiable, forward/target-framed precondition for the route that states WHAT MUST BE TRUE (the positive thing that must hold — NOT that a problem exists, NOT a solution/action to take), without fabricating?`
  );
}

export async function judgeRouteCondition(args: {
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

// ── Coached rewrite (CG-1): ONE revision cycle for a judge-rejected condition ──
// Mirrors the MO refinement pattern (marketOptionSynthesis.ts): the generator is
// handed the rejected condition plus the judge's NAMED reason as a targeted
// instruction, and produces ONE revised condition. The revision re-enters the FULL
// judge; one cycle only. Both attempts are recorded in `proposed`; only a kept
// attempt is written. require_model: the revision is MODEL output — nothing here
// patches or rewrites the condition in code. The most common rejection this exists
// to recover is (e) deficiency framing — restate the target the pain implies.
const REVISE_SYSTEM =
  "You REVISE a single strategic CONDITION that a strict reviewer rejected. " +
  "You are given the route, the rejected condition, and the reason it was rejected. " +
  "Produce ONE revised condition that fixes the failure while keeping the SAME underlying precondition the route depends on. " +
  "A condition states WHAT MUST BE TRUE for the route to win — never a solution or an action to take. " +
  "WHEN THE FAILURE IS DEFICIENCY FRAMING — the condition asserted that a problem, pain, confusion, gap, or deficiency is PRESENT — DO NOT reword the problem. Replace it: state the POSITIVE/TARGET precondition the route needs to HOLD instead. Ask what would be TRUE for these people if the route had succeeded, and write THAT as the condition ('users encounter frequent audio issues' → 'users can resolve common audio issues on their own when given clear, specific guidance'). Keeping the problem and softening its wording is the failure repeating itself, not a revision. " +
  "The revised condition must still be FALSIFIABLE (it could turn out false), a genuine precondition for THIS route, solution-agnostic, and must NOT name the company, brand, or any vendor. " +
  "One single short sentence. JSON only: {\"condition\":\"...\"}.";

function buildReviseUser(route: RouteInput, condition: string, judgeReason: string): string {
  return (
    `Route (the win we are trying to make true): ${route.title}\n` +
    `Route detail: ${route.short_description || "(none)"}\n` +
    `Rejected condition: ${condition}\n` +
    `Why it was rejected: ${judgeReason || "(no reason recorded)"}\n` +
    `Rewrite it as the forward/target precondition that must be TRUE for this route to win.`
  );
}

async function reviseRouteCondition(args: {
  ollamaUrl: string; genModel: string; route: RouteInput; condition: string; judgeReason: string;
}): Promise<string> {
  const r = await callOllamaJson(args.ollamaUrl, args.genModel, REVISE_SYSTEM, buildReviseUser(args.route, args.condition, args.judgeReason), GEN_TIMEOUT_MS);
  if (!r.ok) throw new Error(`route-condition reviser: model call failed for route ${args.route.id}: ${r.err}`);
  let parsed: unknown;
  try { parsed = JSON.parse(r.content ?? ""); }
  catch { throw new Error(`route-condition reviser: unparseable model output for route ${args.route.id} (strict): ${String(r.content).slice(0, 160)}`); }
  return String((parsed as { condition?: unknown })?.condition ?? "").trim();
}

const isGeneratedCondition = (c: WrapCondition) => String(c?.source ?? "").startsWith(`${CONDITION_SOURCE_PREFIX}:`);

// ── Leg (routes row level='leg') as loaded for reconcile ──────────────────────────
type ReconcileLeg = { id: string; source?: string | null; provenance_type?: string | null; what_would_have_to_be_true?: unknown };
// Preserved-class LEG — mirrors routeLegSynthesis.isOperatorLeg.
const isOperatorLeg = (l: ReconcileLeg) =>
  String(l.source ?? "").startsWith("manual_") || String(l.provenance_type ?? "") === "manual";
const legConditionText = (l: ReconcileLeg): string =>
  String((Array.isArray(l.what_would_have_to_be_true) ? (l.what_would_have_to_be_true as Array<Record<string, unknown>>)[0]?.condition : "") ?? "").trim();

export type RouteConditionReconcile = {
  refused: boolean;
  refusalReason?: string;
  supersededCount: number;
  orphanedLegCount: number;
  // Called AFTER the merged-array write lands — writes the condition_removals audit rows
  // and stamps each non-preserved orphaned leg. Absent when refused.
  apply?: () => Promise<void>;
};

// ── Hole-close reconcile (piece #2): a diff-and-audit LAYER over the merged write ──
// Diffs the route's OLD generated conditions against the NEW conditions by contentIdentity
// (the single authority — no new hash, no SQL hash). keep = identity survives → legs stay
// bound, no audit. supersede = a generated identity is gone → its legs orphan. Operator
// conditions are never in the diff (origin-merge keeps them verbatim). A PRESERVED-CLASS
// leg (operator leg, or a leg carrying a recorded-result / reasoned / manual test) that
// would orphan REFUSES this route's write (CH-0 per-route isolation); non-preserved orphans
// are declared WITH a reason stamped on the leg for an honest render. The merged-array WRITE
// itself is unchanged — this only decides refusal and records what happened.
export async function reconcileRouteConditionsOnReroll(args: {
  supabase: { from: (t: string) => any };
  companyId: string;
  route: RouteInput;
  merged: WrapCondition[];
  oldGenerated: WrapCondition[];
  nowIso: string;
  actor: string;
}): Promise<RouteConditionReconcile> {
  // Identities of the conditions that WILL exist after the write (generated + operator).
  const newAllIds = new Set<string>(await Promise.all(args.merged.map((c) => contentIdentity(String(c.condition ?? "")))));

  // Superseded = an old GENERATED condition whose identity is no longer present.
  const oldGenWithId = await Promise.all(
    args.oldGenerated
      .map((c) => String(c.condition ?? "").trim())
      .filter(Boolean)
      .map(async (text) => ({ text, id: await contentIdentity(text) })),
  );
  const superseded = oldGenWithId.filter((o) => !newAllIds.has(o.id));
  const supersededIds = new Set(superseded.map((o) => o.id));

  if (superseded.length === 0) {
    // Nothing left an identity behind → no orphan risk, no audit. (keep / add only.)
    return { refused: false, supersededCount: 0, orphanedLegCount: 0, apply: async () => {} };
  }

  // Load the route's legs and bucket the ones bound (by identity) to a superseded condition.
  const { data: legRows } = await args.supabase
    .from("routes").select("id, source, provenance_type, what_would_have_to_be_true")
    .eq("parent_id", args.route.id).eq("level", "leg");
  const legs = (legRows ?? []) as ReconcileLeg[];

  const orphaned: Array<{ leg: ReconcileLeg; bindingId: string }> = [];
  for (const leg of legs) {
    const text = legConditionText(leg);
    if (!text) continue;
    const bindingId = await contentIdentity(text);
    if (supersededIds.has(bindingId)) orphaned.push({ leg, bindingId });
  }

  if (orphaned.length === 0) {
    // Conditions changed but no leg was bound to the gone ones → audit only, no leg work.
    return {
      refused: false, supersededCount: superseded.length, orphanedLegCount: 0,
      apply: async () => { await writeRemovals(args, superseded, []); },
    };
  }

  // Preserved-class detection: operator legs, or legs carrying a preserved-class test.
  const operatorOrphanIds = new Set(orphaned.filter((o) => isOperatorLeg(o.leg)).map((o) => o.leg.id));
  const nonOperatorIds = orphaned.filter((o) => !isOperatorLeg(o.leg)).map((o) => o.leg.id);
  const preservedByTest = new Set<string>();
  if (nonOperatorIds.length > 0) {
    const { data: testRows } = await args.supabase
      .from("tests")
      .select("action_id, source, result, no_test_needed, no_test_needed_reason")
      .in("action_id", nonOperatorIds);
    for (const t of (testRows ?? []) as Array<Record<string, unknown>>) {
      const preserved =
        String(t.source ?? "").startsWith("manual_") ||
        t.result != null ||
        (t.no_test_needed === true && String(t.no_test_needed_reason ?? "").trim() !== "");
      if (preserved) preservedByTest.add(String(t.action_id));
    }
  }
  const preservedOrphans = orphaned.filter((o) => operatorOrphanIds.has(o.leg.id) || preservedByTest.has(o.leg.id));

  if (preservedOrphans.length > 0) {
    // CH-0-style refusal: this route's re-roll would strand a preserved-class leg. Refuse
    // the write for THIS route (conditions stay intact, the leg stays bound); other routes
    // in the batch continue. The operator resolves/re-points the leg first.
    return {
      refused: true,
      refusalReason:
        `route re-roll refused: would orphan ${preservedOrphans.length} preserved-class leg(s) ` +
        `(operator-authored, or carrying a recorded/reasoned test) whose source condition is being ` +
        `removed — resolve or re-point them first (test/leg-preservation law).`,
      supersededCount: superseded.length,
      orphanedLegCount: orphaned.length,
    };
  }

  // All orphans are non-preserved → declare each with a reason for an honest render.
  return {
    refused: false,
    supersededCount: superseded.length,
    orphanedLegCount: orphaned.length,
    apply: async () => {
      await writeRemovals(args, superseded, orphaned.map((o) => ({ legId: o.leg.id, bindingId: o.bindingId })));
      for (const o of orphaned) {
        const existing = Array.isArray(o.leg.what_would_have_to_be_true)
          ? (o.leg.what_would_have_to_be_true as Array<Record<string, unknown>>)
          : [];
        const head = existing[0] ?? {};
        const stamped = [{
          ...head,
          orphaned: true,
          orphaned_reason: `source condition re-rolled ${args.nowIso.slice(0, 10)} — this leg no longer maps to a live condition`,
          orphaned_at: args.nowIso,
          orphaned_from_identity: o.bindingId,
        }, ...existing.slice(1)];
        const { error: stampErr } = await args.supabase
          .from("routes").update({ what_would_have_to_be_true: stamped }).eq("id", o.leg.id);
        if (stampErr) throw new Error(`orphan-stamp failed for leg ${o.leg.id}: ${stampErr.message}`);
      }
    },
  };
}

// Write one condition_removals audit row per superseded generated condition, tagging each
// with the legs that orphaned from it. No CASCADE FK — the row outlives route/company teardown.
async function writeRemovals(
  args: { supabase: { from: (t: string) => any }; companyId: string; route: RouteInput; nowIso: string; actor: string },
  superseded: Array<{ text: string; id: string }>,
  orphanedLegs: Array<{ legId: string; bindingId: string }>,
): Promise<void> {
  if (superseded.length === 0) return;
  const rows = superseded.map((s) => ({
    company_id: args.companyId,
    route_id: args.route.id,
    condition_identity: s.id,
    condition_text: s.text,
    reason: "condition_rerolled",
    actor: args.actor,
    affected_leg_ids: orphanedLegs.filter((l) => l.bindingId === s.id).map((l) => l.legId),
    removed_at: args.nowIso,
  }));
  const { error } = await args.supabase.from("condition_removals").insert(rows);
  if (error) throw new Error(`condition_removals insert failed for route ${args.route.id}: ${error.message}`);
}

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

  // WF-3 model-phase batching: run ALL 14b generations for the chunk FIRST (keep the
  // gen model resident in VRAM), then ALL 70b judgments + per-route reconcile/write.
  // Origin-merge: operator conditions (NO generate-route-conditions source) are kept
  // verbatim; generated conditions are re-rolled. Don't duplicate an operator topic.
  type Prepared = { route: RouteInput; operatorConditions: WrapCondition[]; operatorTexts: Set<string>; candidates: string[]; genError?: string };
  const prepared: Prepared[] = [];
  for (const route of args.routes) {
    const operatorConditions = route.existing.filter((c) => !isGeneratedCondition(c) && String(c?.condition ?? "").trim());
    const operatorTexts = new Set(operatorConditions.map((c) => String(c.condition).trim().toLowerCase()));
    try {
      const candidates = await generateRouteConditions({ ollamaUrl: args.ollamaUrl, genModel, route });
      prepared.push({ route, operatorConditions, operatorTexts, candidates });
    } catch (e) {
      prepared.push({ route, operatorConditions, operatorTexts, candidates: [], genError: String((e as Error)?.message ?? e) });
    }
  }

  // Phase B — 70b judgments + per-route origin-merge / reconcile / write (unchanged).
  for (const p of prepared) {
    const { route, operatorConditions, operatorTexts, candidates } = p;
    if (p.genError) {
      // Surface a per-route generator failure without aborting the whole chunk.
      perRoute.push({ route_id: route.id, route_title: route.title, proposed: [{ condition: "", kept: false, judge_reason: p.genError }], written_count: null, preserved_operator: operatorConditions.length });
      continue;
    }

    const proposed: ProposedCondition[] = [];
    const keptGenerated: WrapCondition[] = [];
    // Deterministic org-name guard + operator-duplicate skip (no model needed).
    const guardFail = (c: string): string =>
      orgGuard(c) ? "names the company" : operatorTexts.has(c.toLowerCase()) ? "duplicates an operator condition" : "";
    for (const cond of candidates) {
      const condition = cond.trim();
      if (!condition) continue;
      const g = guardFail(condition);
      if (g) { proposed.push({ condition, kept: false, judge_reason: g }); continue; }
      // 70b judge on attempt 1.
      const v = await judgeRouteCondition({ ollamaUrl: args.ollamaUrl, judgeModel, route, condition });
      proposed.push({ condition, kept: v.keep, judge_reason: v.reason || (v.keep ? "ok" : "rejected") });
      if (v.keep) { keptGenerated.push({ condition, satisfied_flag: false, source }); continue; }
      // Coached-rewrite (CG-1): ONE revision cycle handed the judge's named reason.
      // The revision re-enters the FULL judge; both attempts recorded, only a kept one
      // is written. Mirrors the MO refinement pattern — refine the statement, never
      // loosen the judge.
      let revised = "";
      try {
        revised = await reviseRouteCondition({ ollamaUrl: args.ollamaUrl, genModel, route, condition, judgeReason: v.reason });
      } catch (e) {
        proposed.push({ condition: "", kept: false, judge_reason: `revision failed: ${String((e as Error)?.message ?? e)}`, revision_of: condition });
        continue;
      }
      if (!revised) { proposed.push({ condition: "", kept: false, judge_reason: "revision produced nothing", revision_of: condition }); continue; }
      const g2 = guardFail(revised);
      if (g2) { proposed.push({ condition: revised, kept: false, judge_reason: g2, revision_of: condition }); continue; }
      const alreadyKept = keptGenerated.some((k) => String(k.condition).trim().toLowerCase() === revised.toLowerCase());
      if (alreadyKept) { proposed.push({ condition: revised, kept: false, judge_reason: "duplicates a condition already kept on this route", revision_of: condition }); continue; }
      const v2 = await judgeRouteCondition({ ollamaUrl: args.ollamaUrl, judgeModel, route, condition: revised });
      proposed.push({ condition: revised, kept: v2.keep, judge_reason: v2.reason || (v2.keep ? "ok" : "rejected"), revision_of: condition });
      if (v2.keep) keptGenerated.push({ condition: revised, satisfied_flag: false, source });
    }

    // New array = operator conditions (verbatim) ∪ fresh kept-generated.
    const merged: WrapCondition[] = [...operatorConditions, ...keptGenerated];

    let written_count: number | null = null;
    let reconcileSummary = { superseded: 0, orphaned: 0 };
    if (args.write) {
      // Hole-close reconcile (piece #2): plan the diff + preserved-class refusal BEFORE the
      // write; the merged-array write itself is UNCHANGED; audit supersedes + declare
      // non-preserved orphans AFTER it lands.
      const reconcile = await reconcileRouteConditionsOnReroll({
        supabase: args.supabase,
        companyId: args.companyId,
        route,
        merged,
        oldGenerated: route.existing.filter(isGeneratedCondition),
        nowIso: args.nowIso,
        actor: CONDITION_SOURCE_PREFIX,
      });
      if (reconcile.refused) {
        // CH-0-style refusal: a preserved-class leg would orphan. Leave THIS route's
        // conditions intact (the leg stays bound) and surface the honest reason; the batch
        // continues with the other routes.
        perRoute.push({
          route_id: route.id,
          route_title: route.title,
          proposed,
          written_count: null,
          preserved_operator: operatorConditions.length,
          superseded_conditions: reconcile.supersededCount,
          orphaned_legs: reconcile.orphanedLegCount,
          refused_preserved: true,
          error: reconcile.refusalReason,
        });
        continue;
      }
      // Per-route UPDATE so a gateway/worker timeout never loses processed routes.
      const { error: upErr } = await args.supabase
        .from("routes").update({ what_would_have_to_be_true: merged }).eq("id", route.id);
      if (upErr) throw new Error(`route-condition update failed for route ${route.id}: ${upErr.message}`);
      written_count = merged.length;
      if (reconcile.apply) await reconcile.apply();
      reconcileSummary = { superseded: reconcile.supersededCount, orphaned: reconcile.orphanedLegCount };
    }

    perRoute.push({
      route_id: route.id,
      route_title: route.title,
      proposed,
      written_count,
      preserved_operator: operatorConditions.length,
      superseded_conditions: reconcileSummary.superseded,
      orphaned_legs: reconcileSummary.orphaned,
    });
  }

  return perRoute;
}

// ── Company-level entry point (frozen guard + load routes + synthesize) ─────────
// WF-3: `routeIds` scopes the run to a chunk of 1–2 routes (the client loops over
// the plan manifest). `plan:true` returns the manifest only (zero model calls,
// zero writes). Per-route reconcile + condition_removals audit is unchanged —
// each route is self-contained, so chunking never breaks the reconcile invariant.
export async function generateRouteConditionsForCompany(
  args: { supabase: { from: (t: string) => any }; companyId: string; ollamaUrl: string; nowIso: string; genModel?: string; judgeModel?: string; write: boolean; routeIds?: string[]; plan: true },
): Promise<RouteConditionPlanResult>;
export async function generateRouteConditionsForCompany(
  args: { supabase: { from: (t: string) => any }; companyId: string; ollamaUrl: string; nowIso: string; genModel?: string; judgeModel?: string; write: boolean; routeIds?: string[]; plan?: false | undefined },
): Promise<RouteConditionResult>;
export async function generateRouteConditionsForCompany(args: {
  supabase: { from: (t: string) => any };
  companyId: string;
  ollamaUrl: string;
  nowIso: string;
  genModel?: string;
  judgeModel?: string;
  write: boolean;
  routeIds?: string[];
  plan?: boolean;
}): Promise<RouteConditionResult | RouteConditionPlanResult> {
  if (FROZEN_COMPANY_IDS.has(args.companyId)) return { ok: false, skipped: "frozen_company" };

  const { data: companyRow } = await args.supabase.from("companies").select("name").eq("id", args.companyId).maybeSingle();
  const companyName = String((companyRow as { name?: unknown } | null)?.name ?? "");

  let query = args.supabase
    .from("routes")
    .select("id, title, short_description, category, what_would_have_to_be_true")
    .eq("company_id", args.companyId)
    .eq("level", "route")
    .eq("relevance_state", "active");
  if (Array.isArray(args.routeIds) && args.routeIds.length > 0) query = query.in("id", args.routeIds);
  const { data: routeRows, error } = await query.order("sort_order", { ascending: true });
  if (error) return { ok: false, error: String(error.message || error) };

  const routes: RouteInput[] = ((routeRows ?? []) as Array<Record<string, unknown>>).map((r) => ({
    id: String(r.id),
    title: String(r.title ?? ""),
    short_description: (r.short_description as string | null) ?? null,
    category: (r.category as string | null) ?? null,
    existing: Array.isArray(r.what_would_have_to_be_true) ? (r.what_would_have_to_be_true as WrapCondition[]) : [],
  }));

  if (routes.length === 0) return { ok: false, skipped: "no_routes" };

  // PLAN — the worklist manifest for the client's chunk loop. No model calls, no writes.
  if (args.plan) {
    return { ok: true, plan: true, routes: routes.map((r) => ({ id: r.id, title: r.title, condition_count: r.existing.length })) };
  }

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
      superseded: acc.superseded + (r.superseded_conditions ?? 0),
      orphanedLegs: acc.orphanedLegs + (r.orphaned_legs ?? 0),
      refusedPreserved: acc.refusedPreserved + (r.refused_preserved ? 1 : 0),
    }),
    { routes: 0, proposed: 0, kept: 0, dropped: 0, written: 0, preservedOperator: 0, superseded: 0, orphanedLegs: 0, refusedPreserved: 0 },
  );

  return { ok: true, perRoute, totals };
}
