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
  // CG-2: the leg's raw what_would_have_to_be_true (verbatim) — so a judge DECLINE can
  // be stamped durably onto wwhtbt[0], and a subsequent KEPT test can clear that stamp.
  wwhtbt?: Array<Record<string, unknown>>;
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
  // CH-0b: set when the declared re-roll RPC refused this leg (preserved-class
  // floor) — an HONEST per-leg failure, never a silent skip, never a success.
  error?: string;
};

export type LegTestResult =
  | { ok: true; perLeg: LegTestOutcome[]; totals: { legs: number; proposed: number; kept: number; dropped: number; written: number; preservedOperator: number; failed: number } }
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
  "(1) hypothesis = the POSITIVE / TARGET condition the route needs to be TRUE to succeed — the forward win, stated affirmatively. NEVER frame the bet as a problem, pain, confusion, gap, or deficiency being present. If the source condition is pain-framed ('customers are confused by the hours'), restate the target it implies ('customers clearly understand the hours, so they can plan their visit'). It must still be a GENUINE bet that could turn out FALSE — betting that the forward condition holds is NOT seller-framing; a foregone conclusion ('customers will love it') is. " +
  "(2) POLARITY CONTRACT — expected_positive_signal = the concrete, observable thing you would actually SEE if that target condition HOLDS and the route is progressing (the hypothesis TRUE). " +
  "(3) expected_negative_signal = the concrete, observable thing you would actually SEE if that target condition FAILS (the hypothesis FALSE). " +
  "(4) NEVER name the company, its brand, or any specific vendor/supplier. " +
  "(5) Do NOT invent facts, numbers, or specifics not grounded in the leg, condition, or route. " +
  "(6) Solution-agnostic; concrete everyday nouns; no abstract business filler. " +
  "Keep each field to a single short line. " +
  "JSON only: {\"hypothesis\":\"...\",\"expected_positive_signal\":\"...\",\"expected_negative_signal\":\"...\"}.";

function buildGenUser(leg: LegInput): string {
  return (
    `Route (the win this supports): ${leg.route_title}\n` +
    `Route detail: ${leg.route_description || "(none)"}\n` +
    `Target condition this leg tests FOR (the forward win the route needs true — restate affirmatively if it reads as a problem): ${leg.condition}\n` +
    `The move (what the team will actually do to find out): ${leg.move}\n` +
    `State the hypothesis as that positive/target condition holding, and the signals you'd see if it holds (positive) vs. fails (negative).`
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
  "(d) either signal is not a concrete observable — it merely restates the hypothesis or is vague; " +
  "(e) deficiency-as-the-bet — the proposition the hypothesis bets is TRUE is the PRESENCE of a problem, pain, confusion, gap, or deficiency, rather than the positive/target condition the route needs to hold. Judge the PROPOSITION being bet, not vocabulary: do NOT reject merely because a problem is named as context — reject only when the bet ITSELF is that the deficiency exists. A discovery leg framed as the positive precondition the route depends on is acceptable; " +
  "(f) polarity — 'if it's working, we'd see' must describe the route SUCCEEDING (the target condition holding) and 'if it's not' its failing. REJECT if the positive signal points at OBSERVING THE PROBLEM rather than the route working. " +
  "Accept (keep=true) ONLY a grounded, falsifiable, forward/target-framed hypothesis with two concrete observable signals in the correct polarity. Judge honesty and fit, not style. " +
  "JSON only: {\"keep\":true|false,\"reason\":\"<one short clause>\"}.";

function buildJudgeUser(leg: LegInput, test: { hypothesis: string; expected_positive_signal: string; expected_negative_signal: string }): string {
  return (
    `Route: ${leg.route_title}\n` +
    `Condition: ${leg.condition}\n` +
    `Move: ${leg.move}\n` +
    `Hypothesis: ${test.hypothesis}\n` +
    `If it's working, we'd see: ${test.expected_positive_signal}\n` +
    `If it's not, we'd see: ${test.expected_negative_signal}\n` +
    `Is the hypothesis grounded, falsifiable, and forward/target-framed (betting the positive condition the route needs holds — NOT that a problem exists), with two concrete observable signals in the correct polarity ('working' = route succeeding)?`
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

// The declared re-roll actor — greppable, matches the source prefix this
// pipeline writes on its inserts.
const RE_ROLL_ACTOR = "generate-leg-tests";

// ── CG-2: durable decline stamp on the leg's wwhtbt[0] ──────────────────────────
// When the honesty judge DECLINES a fresh test, no `tests` row is written (hypothesis
// et al. are NOT NULL, and a declined bet is not a belief-only artifact) — so the
// refusal would vanish and the render could not tell attempted-and-declined from
// never-attempted. We persist it exactly like the hole-close orphan stamp: a marker
// merged into wwhtbt[0], carrying the JUDGE'S VERBATIM reason. No new table/column.
// A subsequently KEPT test clears it (an honest test supersedes the decline). The
// merge preserves every other head key (condition, leg_class, satisfied_flag, orphan
// stamp, …). Non-fatal: a stamp failure never aborts the leg's outcome.
const DECLINE_KEYS = ["test_declined", "test_declined_reason", "test_declined_at"] as const;

async function stampLegDeclined(
  supabase: { from: (t: string) => any },
  leg: LegInput,
  reason: string,
  nowIso: string,
): Promise<void> {
  const existing = Array.isArray(leg.wwhtbt) ? leg.wwhtbt : [];
  const head = { ...(existing[0] ?? {}) };
  const stampedHead = { ...head, test_declined: true, test_declined_reason: reason, test_declined_at: nowIso };
  const next = [stampedHead, ...existing.slice(1)];
  const { error } = await supabase.from("routes").update({ what_would_have_to_be_true: next }).eq("id", leg.id);
  if (error) console.log(`[leg-tests] decline-stamp failed for leg ${leg.id}: ${String(error.message ?? error)}`);
  else leg.wwhtbt = next; // keep the in-memory copy consistent for any later touch this run
}

async function clearLegDeclined(
  supabase: { from: (t: string) => any },
  leg: LegInput,
): Promise<void> {
  const existing = Array.isArray(leg.wwhtbt) ? leg.wwhtbt : [];
  const head = existing[0] ?? {};
  if (!DECLINE_KEYS.some((k) => k in head)) return; // nothing to clear — no write
  const cleanedHead: Record<string, unknown> = { ...head };
  for (const k of DECLINE_KEYS) delete cleanedHead[k];
  const next = [cleanedHead, ...existing.slice(1)];
  const { error } = await supabase.from("routes").update({ what_would_have_to_be_true: next }).eq("id", leg.id);
  if (error) console.log(`[leg-tests] decline-clear failed for leg ${leg.id}: ${String(error.message ?? error)}`);
  else leg.wwhtbt = next;
}

// ── Synthesize: per test-leg → gen → judge → (write+preserve | dry) ─────────────
export async function synthesizeLegTests(args: {
  supabase: { from: (t: string) => any; rpc: (fn: string, params?: Record<string, unknown>) => any };
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

  // SWAP-BATCHING (CH-1, mirrors routeLegSynthesis option d): ALL 14b generations
  // for this chunk run first, THEN guards + all 70b judgments (GGGJJJ) — the
  // interleaved gen→judge order forced an Ollama VRAM model swap on nearly every
  // call (only one of the two models stays resident; the swap dominated the
  // measured ~26.8s judge calls). Judge inputs are UNCHANGED: generation depends
  // only on the leg (+its route grounding), judgment only on (leg, generated
  // test), so phase order cannot alter what any call sees — equivalence-tested
  // at the fetch boundary (legTestBatching.test.ts). The per-leg origin-merge
  // write STILL happens per leg right after its judgment, so a mid-chunk death
  // loses nothing already written. Operator-covered legs are skipped up front,
  // before any generation — guard order unchanged.
  type GennedTest = {
    leg: LegInput;
    gen: { hypothesis: string; expected_positive_signal: string; expected_negative_signal: string };
  };
  const genned: GennedTest[] = [];
  for (const leg of args.legs) {
    if (operatorLegIds.has(leg.id)) {
      // An operator-edited test already covers this leg — keep it, don't regenerate.
      perLeg.push({ leg_id: leg.id, move: leg.move, proposed: null, written: false, preserved_operator: true });
      continue;
    }
    genned.push({ leg, gen: await generateLegTest({ ollamaUrl: args.ollamaUrl, genModel, leg }) });
  }

  for (const { leg, gen } of genned) {
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
      // loses the legs already processed): re-roll this leg's generated test rows
      // THROUGH THE DECLARED PATH (CH-0b), then insert the fresh one if the judge
      // kept it. remove_tests_for_leg_reroll deletes with a declared
      // reason_category='leg_rerolled' (the CH-0a trigger writes the test_removals
      // row, leg context captured while the leg is alive) and PRE-REFUSES if any
      // PRESERVED-CLASS test rides the leg (operator-authored, recorded result, or
      // reasoned no-test-needed). The reroll set is generated-only by construction
      // (operator tests skip the leg upstream) and this pipeline never writes
      // result/no_test_needed — so the refusal is a floor, not a normal path. A
      // refusal surfaces as an HONEST per-leg error (never a silent skip, never a
      // success); the OTHER legs continue — per-leg isolation, same as the write.
      const toReroll = generatedIdsByLeg.get(leg.id) ?? [];
      if (toReroll.length > 0) {
        const { error: rerollErr } = await args.supabase.rpc("remove_tests_for_leg_reroll", {
          p_leg_ids: [leg.id],
          p_actor: RE_ROLL_ACTOR,
        });
        if (rerollErr) {
          perLeg.push({
            leg_id: leg.id,
            move: leg.move,
            proposed,
            written: false,
            preserved_operator: false,
            error: `leg-test re-roll refused for leg ${leg.id}: ${String(rerollErr.message ?? rerollErr)}`,
          });
          continue;
        }
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
        // CG-2: an honest test now exists — clear any prior decline stamp on the leg.
        await clearLegDeclined(args.supabase, leg);
      } else {
        // CG-2: the honesty judge (or a deterministic guard) declined this test. Persist
        // the VERBATIM reason on the leg so the render shows attempted-and-declined
        // distinctly from never-attempted. Mirrors the hole-close orphan stamp.
        await stampLegDeclined(args.supabase, leg, reason, args.nowIso);
      }
    }

    perLeg.push({ leg_id: leg.id, move: leg.move, proposed, written, preserved_operator: false });
  }

  // Two-pass assembly pushes operator-preserved outcomes before judged ones —
  // restore the caller's leg order so the report reads route-by-route.
  const orderIndex = new Map(args.legs.map((l, i) => [l.id, i]));
  perLeg.sort((a, b) => (orderIndex.get(a.leg_id) ?? 0) - (orderIndex.get(b.leg_id) ?? 0));
  return perLeg;
}

// ── Company-level entry point (frozen guard + load test-legs + synthesize) ───────
export async function generateLegTestsForCompany(args: {
  supabase: { from: (t: string) => any; rpc: (fn: string, params?: Record<string, unknown>) => any };
  companyId: string;
  ollamaUrl: string;
  nowIso: string;
  genModel?: string;
  judgeModel?: string;
  runId?: string;
  write: boolean;
  // CHUNKED INVOCATION (CH-1, 508145f pattern): when provided, scope the run to
  // these leg ids so one request stays well under the 400s isolate wall-clock.
  // Absent/empty ⇒ full-company behavior (harness back-compat). Write semantics
  // are IDENTICAL either way — the origin-merge is already per-leg.
  legIds?: string[];
}): Promise<LegTestResult> {
  if (FROZEN_COMPANY_IDS.has(args.companyId)) return { ok: false, skipped: "frozen_company" };

  const { data: companyRow } = await args.supabase.from("companies").select("name").eq("id", args.companyId).maybeSingle();
  const companyName = String((companyRow as { name?: unknown } | null)?.name ?? "");

  // Load all legs for the company (or the requested chunk); keep only the
  // test-class ones.
  let legQuery = args.supabase
    .from("routes")
    .select("id, user_id, parent_id, title, short_description, what_would_have_to_be_true")
    .eq("company_id", args.companyId)
    .eq("level", "leg")
    .eq("provenance_type", "internal_hypothesis");
  if (args.legIds && args.legIds.length > 0) {
    legQuery = legQuery.in("id", args.legIds);
  }
  const { data: legRows, error } = await legQuery;
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
      wwhtbt: Array.isArray(r.what_would_have_to_be_true) ? (r.what_would_have_to_be_true as Array<Record<string, unknown>>) : [],
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
      failed: acc.failed + (l.error ? 1 : 0),
    }),
    { legs: 0, proposed: 0, kept: 0, dropped: 0, written: 0, preservedOperator: 0, failed: 0 },
  );

  return { ok: true, perLeg, totals };
}
