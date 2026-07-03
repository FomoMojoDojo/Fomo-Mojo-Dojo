// Gate 3 — generate-leg-tests synthesis core.
//
// A TEST = a belief-only artifact on a test-class LEG. A test-class leg is a leg
// (routes row level='leg', provenance_type='internal_hypothesis') whose source
// condition was classified leg_class='test' by Gate 2 — a move that GOES AND FINDS
// OUT whether a condition holds. Generation rule (operator-signed): for each
// test-class leg, draft ONE belief-only test — the HYPOTHESIS the leg is betting
// is true, plus the two SIGNALS the team would expect to observe (one if the bet
// is right, one if it is wrong). result is ALWAYS left NULL — the honest
// not-yet-run state. This path NEVER writes a result and invents no outcome.
//
// LOCAL ONLY (Option B privacy): qwen2.5:14b-instruct generates, llama3:70b judges.
// ZERO OpenAI anywhere in this path — leg conditions are internal/declared content.
// The judge is HONESTY-ONLY: it drops a hypothesis that is fabricated, seller-framed
// (a foregone conclusion rather than a real bet), ungrounded, or whose signals are
// not concrete observables. Validation is FIDELITY only, never a shape.
//
// Mirrors routeLegSynthesis.ts (Gate 2): local Ollama call, deterministic org-name
// guard, frozen-fixture hard-exclude, origin-merge preserve (operator-edited test
// rows kept via source LIKE 'manual_%', generated rows re-rolled), write:false
// dry-run. One primary test per leg, keyed by tests.action_id = leg.id.

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

const TEST_SOURCE_PREFIX = "generate-leg-tests";

export type LegInput = {
  id: string;
  user_id?: string | null;
  move: string;                      // the leg's title — the concrete move
  condition: string;                 // the leg's source condition (what_would_have_to_be_true[0].condition)
  route_title: string;               // parent route, for grounding
  route_description?: string | null;
};

export type ProposedTest = {
  leg_id: string;
  move: string;
  condition: string;
  hypothesis: string;
  expected_positive_signal: string;
  expected_negative_signal: string;
  kept: boolean;          // judge verdict — false ⇒ dropped, not written/shown
  judge_reason: string;
};

export type LegTestOutcome = {
  leg_id: string;
  move: string;
  proposed: ProposedTest | null;   // null ⇒ operator-preserved (no generation ran for this leg)
  written: boolean;
  preserved_operator: boolean;
};

export type LegTestResult =
  | { ok: true; perLeg: LegTestOutcome[]; totals: { legs: number; proposed: number; kept: number; dropped: number; written: number; preservedOperator: number } }
  | { ok: false; skipped: "frozen_company" | "no_test_legs" }
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

// ── Generator (qwen): ONE test-class leg → ONE belief-only test ─────────────────
const GEN_SYSTEM =
  "You turn ONE test-class leg into a belief-only TEST. A test-class leg is a concrete move that GOES AND FINDS OUT whether a condition holds. " +
  "State the HYPOTHESIS the leg is betting is true, and the two SIGNALS the team would expect to observe — one if the bet is right, one if it is wrong. " +
  "VOICE (client-facing): plain, human language an owner or team would actually use — not consultant phrasing. " +
  "Hard rules: " +
  "(1) hypothesis = ONE falsifiable belief this leg is testing, grounded in the condition and route. It must be a genuine bet that could turn out FALSE — never a foregone conclusion, never seller-framed ('customers will love it'). " +
  "(2) expected_positive_signal = the concrete, observable thing you would actually SEE if the hypothesis is TRUE. " +
  "(3) expected_negative_signal = the concrete, observable thing you would actually SEE if the hypothesis is FALSE. " +
  "(4) NEVER name the company, its brand, or any specific vendor/supplier. " +
  "(5) Do NOT invent facts, numbers, or specifics not grounded in the leg, condition, or route. " +
  "(6) Solution-agnostic; concrete everyday nouns; no abstract business filler. " +
  "Keep each field to a single short line. " +
  "JSON only: {\"hypothesis\":\"...\",\"expected_positive_signal\":\"...\",\"expected_negative_signal\":\"...\"}.";

function buildGenUser(leg: LegInput): string {
  return (
    `Route (the win this supports): ${leg.route_title}\n` +
    `Route detail: ${leg.route_description || "(none)"}\n` +
    `Condition this leg tests: ${leg.condition}\n` +
    `The move (what the team will actually do to find out): ${leg.move}\n` +
    `State the hypothesis this leg is betting is true, and the positive and negative signals you'd expect.`
  );
}

async function generateLegTest(args: {
  ollamaUrl: string; genModel: string; leg: LegInput;
}): Promise<{ hypothesis: string; expected_positive_signal: string; expected_negative_signal: string }> {
  const r = await callOllamaJson(args.ollamaUrl, args.genModel, GEN_SYSTEM, buildGenUser(args.leg), GEN_TIMEOUT_MS);
  if (!r.ok) throw new Error(`leg-test generator: model call failed for leg ${args.leg.id}: ${r.err}`);
  let parsed: unknown;
  try { parsed = JSON.parse(r.content ?? ""); }
  catch { throw new Error(`leg-test generator: unparseable model output for leg ${args.leg.id} (strict): ${String(r.content).slice(0, 160)}`); }
  const hypothesis = String((parsed as { hypothesis?: unknown })?.hypothesis ?? "").trim();
  const expected_positive_signal = String((parsed as { expected_positive_signal?: unknown })?.expected_positive_signal ?? "").trim();
  const expected_negative_signal = String((parsed as { expected_negative_signal?: unknown })?.expected_negative_signal ?? "").trim();
  return { hypothesis, expected_positive_signal, expected_negative_signal };
}

// ── Judge (llama3:70b): honesty gate — grounded · falsifiable · non-fabricated ──
const JUDGE_SYSTEM =
  "You are a strict reviewer. You are given a strategic ROUTE, a CONDITION, the test-class MOVE, and a proposed belief-only TEST (a hypothesis plus a positive and a negative expected signal). " +
  "Decide if the test is acceptable. Reject (keep=false) if the test is ANY of: " +
  "(a) fabricated — the hypothesis invents facts, numbers, or specifics not grounded in the route, condition, or move; " +
  "(b) seller-framed or a foregone conclusion — the hypothesis assumes the win instead of being a genuine bet that could be false; " +
  "(c) ungrounded — the hypothesis is not genuinely tied to THIS condition and move; " +
  "(d) either signal is not a concrete observable — it merely restates the hypothesis or is vague. " +
  "Accept (keep=true) ONLY a grounded, falsifiable, honestly-framed hypothesis with two concrete observable signals. Judge honesty and fit, not style. " +
  "JSON only: {\"keep\":true|false,\"reason\":\"<one short clause>\"}.";

function buildJudgeUser(leg: LegInput, test: { hypothesis: string; expected_positive_signal: string; expected_negative_signal: string }): string {
  return (
    `Route: ${leg.route_title}\n` +
    `Condition: ${leg.condition}\n` +
    `Move: ${leg.move}\n` +
    `Hypothesis: ${test.hypothesis}\n` +
    `If it's working, we'd see: ${test.expected_positive_signal}\n` +
    `If it's not, we'd see: ${test.expected_negative_signal}\n` +
    `Is the hypothesis grounded, falsifiable, and honestly framed, with two concrete observable signals?`
  );
}

async function judgeLegTest(args: {
  ollamaUrl: string; judgeModel: string; leg: LegInput;
  test: { hypothesis: string; expected_positive_signal: string; expected_negative_signal: string };
}): Promise<{ keep: boolean; reason: string }> {
  const r = await callOllamaJson(args.ollamaUrl, args.judgeModel, JUDGE_SYSTEM, buildJudgeUser(args.leg, args.test), JUDGE_TIMEOUT_MS);
  if (!r.ok) throw new Error(`leg-test judge: model call failed for leg ${args.leg.id}: ${r.err}`);
  let parsed: unknown;
  try { parsed = JSON.parse(r.content ?? ""); }
  catch { throw new Error(`leg-test judge: unparseable model output for leg ${args.leg.id} (strict): ${String(r.content).slice(0, 160)}`); }
  const keep = (parsed as { keep?: unknown })?.keep === true;
  const reason = String((parsed as { reason?: unknown })?.reason ?? "").trim();
  return { keep, reason };
}

// ── Synthesize: per test-leg → gen → judge → (write+preserve | dry) ─────────────
export async function synthesizeLegTests(args: {
  supabase: { from: (t: string) => any };
  companyId: string;
  companyName: string;
  legs: LegInput[];
  ollamaUrl: string;
  nowIso: string;
  genModel?: string;
  judgeModel?: string;
  runId?: string;
  write: boolean;
}): Promise<LegTestOutcome[]> {
  const genModel = args.genModel ?? DEFAULT_GEN_MODEL;
  const judgeModel = args.judgeModel ?? DEFAULT_JUDGE_MODEL;
  const orgGuard = buildOrgNameGuard(args.companyName);
  const source = `${TEST_SOURCE_PREFIX}:${args.nowIso.slice(0, 10)}`;

  // Load existing tests for these legs up front: so we can (a) SKIP generating for a
  // leg an operator already authored a test for (no operator+generated duplicate on
  // the same leg), and (b) preserve operator tests while re-rolling generated ones.
  type ExistingTest = { id: string; action_id: string; source?: string | null };
  let existingTests: ExistingTest[] = [];
  if (args.write && args.legs.length > 0) {
    const { data: existing } = await args.supabase
      .from("tests").select("id, action_id, source")
      .eq("company_id", args.companyId)
      .in("action_id", args.legs.map((l) => l.id));
    existingTests = (existing ?? []) as ExistingTest[];
  }
  // Exact Gate-2 origin-merge predicate, ported verbatim: operator edits carry a
  // source LIKE 'manual_%'; generated rows do not and are re-rolled.
  const isOperatorTest = (t: ExistingTest) => String(t.source ?? "").startsWith("manual_");
  const operatorLegIds = new Set(
    existingTests.filter(isOperatorTest).map((t) => String(t.action_id)),
  );
  // Per-leg map of the generated (non-operator) test rows to re-roll for that leg.
  const generatedIdsByLeg = new Map<string, string[]>();
  for (const t of existingTests) {
    if (isOperatorTest(t)) continue;
    const list = generatedIdsByLeg.get(String(t.action_id)) ?? [];
    list.push(t.id);
    generatedIdsByLeg.set(String(t.action_id), list);
  }

  const perLeg: LegTestOutcome[] = [];

  for (const leg of args.legs) {
    if (operatorLegIds.has(leg.id)) {
      // An operator-edited test already covers this leg — keep it, don't regenerate.
      perLeg.push({ leg_id: leg.id, move: leg.move, proposed: null, written: false, preserved_operator: true });
      continue;
    }
    const gen = await generateLegTest({ ollamaUrl: args.ollamaUrl, genModel, leg });
    // Deterministic org-name guard + empty rejection, then the 70b honesty judge.
    const hasAll = !!gen.hypothesis && !!gen.expected_positive_signal && !!gen.expected_negative_signal;
    const namesOrg = orgGuard(gen.hypothesis) || orgGuard(gen.expected_positive_signal) || orgGuard(gen.expected_negative_signal);
    let keep = hasAll && !namesOrg;
    let reason = !hasAll ? "incomplete test" : namesOrg ? "names the company" : "";
    if (keep) {
      const v = await judgeLegTest({ ollamaUrl: args.ollamaUrl, judgeModel, leg, test: gen });
      keep = v.keep; reason = v.reason || (v.keep ? "ok" : "rejected");
    }
    const proposed: ProposedTest = {
      leg_id: leg.id,
      move: leg.move,
      condition: leg.condition,
      hypothesis: gen.hypothesis,
      expected_positive_signal: gen.expected_positive_signal,
      expected_negative_signal: gen.expected_negative_signal,
      kept: keep,
      judge_reason: reason,
    };

    let written = false;
    if (args.write) {
      // Origin-merge preserve, applied PER LEG (mirrors Gate-2's per-route write so
      // each completed test persists immediately and a gateway/worker timeout never
      // loses the legs already processed): re-roll this leg's generated test rows,
      // then insert the fresh one if the judge kept it. Operator rows are never here.
      const toReroll = generatedIdsByLeg.get(leg.id) ?? [];
      if (toReroll.length > 0) {
        const { error: delErr } = await args.supabase.from("tests").delete().in("id", toReroll);
        if (delErr) throw new Error(`leg-test preserve-delete failed for leg ${leg.id}: ${delErr.message}`);
      }
      if (keep) {
        const { error: insErr } = await args.supabase.from("tests").insert({
          company_id: args.companyId,
          action_id: leg.id,
          hypothesis: gen.hypothesis,
          expected_positive_signal: gen.expected_positive_signal,
          expected_negative_signal: gen.expected_negative_signal,
          result: null,            // NEVER write a result — honest not-yet-run state
          no_test_needed: false,
          source,
        });
        if (insErr) throw new Error(`leg-test insert failed for leg ${leg.id}: ${insErr.message}`);
        written = true;
      }
    }

    perLeg.push({ leg_id: leg.id, move: leg.move, proposed, written, preserved_operator: false });
  }

  return perLeg;
}

// ── Company-level entry point (frozen guard + load test-legs + synthesize) ───────
export async function generateLegTestsForCompany(args: {
  supabase: { from: (t: string) => any };
  companyId: string;
  ollamaUrl: string;
  nowIso: string;
  genModel?: string;
  judgeModel?: string;
  runId?: string;
  write: boolean;
}): Promise<LegTestResult> {
  if (FROZEN_COMPANY_IDS.has(args.companyId)) return { ok: false, skipped: "frozen_company" };

  const { data: companyRow } = await args.supabase.from("companies").select("name").eq("id", args.companyId).maybeSingle();
  const companyName = String((companyRow as { name?: unknown } | null)?.name ?? "");

  // Load all legs for the company; keep only the test-class ones.
  const { data: legRows, error } = await args.supabase
    .from("routes")
    .select("id, user_id, parent_id, title, short_description, what_would_have_to_be_true")
    .eq("company_id", args.companyId)
    .eq("level", "leg")
    .eq("provenance_type", "internal_hypothesis");
  if (error) return { ok: false, error: String(error.message || error) };

  const firstWwhtbt = (r: Record<string, unknown>): Record<string, unknown> =>
    (Array.isArray(r.what_would_have_to_be_true) ? (r.what_would_have_to_be_true as Array<Record<string, unknown>>)[0] : undefined) ?? {};

  const testLegRows = ((legRows ?? []) as Array<Record<string, unknown>>).filter(
    (r) => String(firstWwhtbt(r)?.leg_class ?? "").trim() === "test",
  );

  if (testLegRows.length === 0) return { ok: false, skipped: "no_test_legs" };

  // Grounding needs the parent route (title + detail). Load them once, map by id.
  const parentIds = Array.from(new Set(testLegRows.map((r) => String(r.parent_id ?? "")).filter(Boolean)));
  const routeById = new Map<string, { title: string; short_description: string | null }>();
  if (parentIds.length > 0) {
    const { data: routeRows } = await args.supabase
      .from("routes").select("id, title, short_description").in("id", parentIds);
    for (const r of ((routeRows ?? []) as Array<Record<string, unknown>>)) {
      routeById.set(String(r.id), { title: String(r.title ?? ""), short_description: (r.short_description as string | null) ?? null });
    }
  }

  const legs: LegInput[] = testLegRows.map((r) => {
    const parent = routeById.get(String(r.parent_id ?? "")) ?? { title: "", short_description: null };
    return {
      id: String(r.id),
      user_id: (r.user_id as string | null) ?? null,
      move: String(r.title ?? ""),
      condition: String(firstWwhtbt(r)?.condition ?? "").trim(),
      route_title: parent.title,
      route_description: parent.short_description,
    };
  }).filter((l) => l.move && l.condition);

  if (legs.length === 0) return { ok: false, skipped: "no_test_legs" };

  const perLeg = await synthesizeLegTests({
    supabase: args.supabase,
    companyId: args.companyId,
    companyName,
    legs,
    ollamaUrl: args.ollamaUrl,
    nowIso: args.nowIso,
    genModel: args.genModel,
    judgeModel: args.judgeModel,
    runId: args.runId,
    write: args.write,
  });

  const totals = perLeg.reduce(
    (acc, l) => ({
      legs: acc.legs + 1,
      proposed: acc.proposed + (l.proposed ? 1 : 0),
      kept: acc.kept + (l.proposed?.kept ? 1 : 0),
      dropped: acc.dropped + (l.proposed && !l.proposed.kept ? 1 : 0),
      written: acc.written + (l.written ? 1 : 0),
      preservedOperator: acc.preservedOperator + (l.preserved_operator ? 1 : 0),
    }),
    { legs: 0, proposed: 0, kept: 0, dropped: 0, written: 0, preservedOperator: 0 },
  );

  return { ok: true, perLeg, totals };
}
