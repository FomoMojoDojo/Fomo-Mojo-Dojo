// b-ii: per-step conditions ("what must be true") generator → judge → writer.
// LOCAL internal-layer only (qwen2.5:14b generator, llama3:70b executor-judge).
// Lifted from the accepted B-II-2a/2c harness — prompts, guards and judge here are
// exactly what those dry-runs proved.
//
// Pipeline per step: generate (strict: model CONTENT or loud fail) → reject canned
// (cannedConditionGuard, mirrors the b-i render gate) → reject org-named
// (buildOrgNameGuard — never name the company itself) → judge buyer/seller (drop
// seller). Then a cross-set de-dup pass (keep first occurrence, shared Jaccard
// helper) before writing kept buyer conditions to job_steps.conditions_json as
// status="best_guess", origin="generated". FIELD-MERGE: only origin="generated"
// entries are replaced; origin="operator" entries survive regeneration.
//
// B-II-2c texture fixes folded in: no count target (honest per-step variation;
// a step may have none → hide tier), step-specificity, no org-naming (prompt +
// deterministic guard), cross-set de-dup.
//
// Signed scope: best_guess only (real_source deferred); declared/internal_derived
// sets; conditions stay OUT of mojoScore. Production triggering is a later step.

import { judgeConditionPerspectives } from "./stepPerspectiveJudge.ts";
import { isCannedConditionString } from "./cannedConditionGuard.ts";
import { jaccardSimilarity } from "./opportunityTreeSemantics.ts";

export type StepInput = {
  id: string;
  step_number: number;
  step_label: string;
  description: string;
  evidence_basis?: string | null;
};

export type ConditionEntry = {
  condition: string;
  status: "best_guess";
  origin: "generated" | "operator";
  satisfied_flag?: boolean;
  basis?: string;
  evidence_refs?: string[];
  gen?: { model: string; run_id?: string; perspective: "buyer" | "seller"; at: string };
};

const GEN_TIMEOUT_MS = 180_000;
const DEFAULT_GEN_MODEL = "qwen2.5:14b-instruct";
// Cross-set near-duplicate threshold — matches the opps near_duplicate_similarity
// convention (opportunityTreeSemantics).
const NEAR_DUP_JACCARD = 0.72;

// Real brief-builder — mirrors local-jobmap-synthesis/index.ts:1318-1321.
export function buildExecutorBrief(
  marketDef: { job_executor?: string | null; jtbd?: string | null } | null,
): string {
  return [String(marketDef?.job_executor || "").trim(), String(marketDef?.jtbd || "").trim()]
    .filter(Boolean)
    .join(" — ") || "the buying-side job executor";
}

// Deterministic write-time org-name guard — parallel to the canned guard. Drops a
// condition that names the company itself (the "seller" in declared context).
// Matches the DISTINCTIVE name: the full multi-word phrase AND any distinctive
// (non-generic, ≥4-char) token — NEVER generic constituent words. So
// "Cafe Barra" / "Cafe Barra's" / bare "Barra" drop, while "cafe operators" and
// "the center" survive.
const ORG_GENERIC_WORDS = new Set([
  "the", "and", "of", "for", "a", "an", "cafe", "coffee", "center", "centre", "company",
  "co", "corp", "corporation", "inc", "incorporated", "llc", "ltd", "limited", "group",
  "services", "service", "solutions", "systems", "partners", "holdings", "enterprises",
  "studio", "shop", "store", "labs", "lab",
]);
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
export function buildOrgNameGuard(companyName: string): (s: string) => boolean {
  const words = String(companyName || "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  if (words.length === 0) return () => false;
  const patterns: RegExp[] = [];
  // Full phrase (+ optional possessive, straight or curly apostrophe).
  patterns.push(new RegExp(`\\b${words.map(escapeRegExp).join("\\s+")}(?:'s|’s)?\\b`, "i"));
  // Distinctive standalone tokens (skip generic constituent words).
  for (const w of words) {
    if (w.length >= 4 && !ORG_GENERIC_WORDS.has(w)) {
      patterns.push(new RegExp(`\\b${escapeRegExp(w)}(?:'s|’s)?\\b`, "i"));
    }
  }
  return (s: string) => {
    const str = String(s ?? "");
    return patterns.some((re) => re.test(str));
  };
}

// Cross-set de-dup: drop near-duplicate conditions across steps (keep first
// occurrence). step labels in `dropped` are 1-based positions over the input order.
export function dedupeConditionsAcrossSteps(
  perStepKept: string[][],
  threshold = NEAR_DUP_JACCARD,
): { surviving: string[][]; dropped: Array<{ step: number; condition: string; matchedStep: number; matched: string }> } {
  const seen: Array<{ step: number; condition: string }> = [];
  const surviving: string[][] = [];
  const dropped: Array<{ step: number; condition: string; matchedStep: number; matched: string }> = [];
  perStepKept.forEach((arr, idx) => {
    const stepNo = idx + 1;
    const keepHere: string[] = [];
    for (const c of arr) {
      const m = seen.find((x) => jaccardSimilarity(x.condition, c) >= threshold);
      if (m) dropped.push({ step: stepNo, condition: c, matchedStep: m.step, matched: m.condition });
      else {
        keepHere.push(c);
        seen.push({ step: stepNo, condition: c });
      }
    }
    surviving.push(keepHere);
  });
  return { surviving, dropped };
}

// Verbatim generation prompt from B-II-2c (accepted) — company-agnostic; the
// deterministic org-name guard closes naming the model misses.
const GEN_SYSTEM =
  "You generate the PRECONDITIONS for one step in a job map - what must already be true for the people doing this job to carry out THIS step in their own world. " +
  "VOICE (this is client-facing): write each condition in plain, human language, the way a real person would say it - NOT a consultant, analyst, or clinician. Refer to the people plainly by who they are (e.g. 'the family', 'the owner', 'the team'), taken from the people described below. NEVER use the word 'executor' or any ODI, business, or clinical jargon. Example of the target register: 'The family can clearly name what they - or their child - are actually dealing with.' " +
  "Each condition describes the people's OWN readiness, knowledge, or state. " +
  "Hard rules: " +
  "(1) NEVER name the company, its brand, or any specific vendor/supplier/provider. Describe their own experience even when it involves a supplier's offering - e.g. 'the family has compared a few options and knows which one fits', NOT 'the family received <Company>'s samples'. " +
  "(2) Each condition must be SPECIFIC to THIS step - not a generic precondition that would apply to many steps. Do not reuse a broad statement across steps; say what THIS step uniquely requires. " +
  "(3) Solution-agnostic; concrete everyday nouns; no abstract business filler. " +
  "(4) Each condition is a specific, testable statement of something that must hold - NOT a restatement of the step label. " +
  "(5) No canned filler ('X is established', 'is named and documented', 'is tracked and current', 'is written down, not assumed'). " +
  "Return ONLY the conditions that genuinely must be true for THIS step - a step may have 1, 2, or 3; some steps may legitimately have none. Do NOT pad to a count. Quality over count. " +
  "JSON only: {\"conditions\":[\"...\"]}.";

function buildGenUser(step: StepInput, executorBrief: string): string {
  return (
    `The people doing this job (refer to them plainly, e.g. "the family"/"the owner"): ${executorBrief}\n` +
    `Step label: ${step.step_label}\n` +
    `Step description: ${step.description}\n` +
    `Evidence basis: ${step.evidence_basis || "(none)"}\n` +
    `List only the preconditions that genuinely must be true for these people to carry out this step.`
  );
}

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

// Strict (model CONTENT, not just a call): unparseable / missing array throws with
// a named reason. An empty array is allowed (the step honestly has no conditions).
export async function generateStepConditions(args: {
  ollamaUrl: string;
  genModel: string;
  step: StepInput;
  executorBrief: string;
}): Promise<string[]> {
  const r = await callOllamaJson(args.ollamaUrl, args.genModel, GEN_SYSTEM, buildGenUser(args.step, args.executorBrief), GEN_TIMEOUT_MS);
  if (!r.ok) throw new Error(`conditions generator: model call failed for step ${args.step.step_number}: ${r.err}`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(r.content ?? "");
  } catch {
    throw new Error(`conditions generator: unparseable model output for step ${args.step.step_number} (strict): ${String(r.content).slice(0, 160)}`);
  }
  const arr = Array.isArray((parsed as { conditions?: unknown })?.conditions)
    ? ((parsed as { conditions: unknown[] }).conditions)
    : null;
  if (!arr) throw new Error(`conditions generator: no conditions array for step ${args.step.step_number} (strict: model CONTENT required)`);
  return arr.map((c) => String(c ?? "").trim()).filter(Boolean);
}

export type StepConditionsOutcome = {
  step_id: string;
  step_number: number;
  step_label: string;
  generated: string[];
  rejectedCanned: string[];
  rejectedOrgNamed: string[];
  droppedSeller: string[];
  droppedDuplicate: string[];
  kept: string[];
  written: ConditionEntry[] | null;
};

export type SynthesisResult = {
  perStep: StepConditionsOutcome[];
  totals: { generated: number; rejectedCanned: number; rejectedOrgNamed: number; droppedSeller: number; droppedDuplicate: number; kept: number; stepsWritten: number };
};

export async function synthesizeStepConditions(args: {
  supabase: { from: (t: string) => any };
  companyId: string;
  steps: StepInput[];
  marketDef: { job_executor?: string | null; jtbd?: string | null } | null;
  ollamaUrl: string;
  nowIso: string;
  genModel?: string;
  judgeModel?: string;
  runId?: string;
  write: boolean;
  persistVerdicts: boolean;
}): Promise<SynthesisResult> {
  const executorBrief = buildExecutorBrief(args.marketDef);
  const genModel = args.genModel ?? DEFAULT_GEN_MODEL;

  // Org-name guard from the company's own distinctive name.
  const { data: companyRow } = await args.supabase.from("companies").select("name").eq("id", args.companyId).maybeSingle();
  const orgGuard = buildOrgNameGuard(String((companyRow as { name?: unknown } | null)?.name ?? ""));

  // Phase 1: generate → drop canned → drop org-named → judge → keep buyer.
  const interim: Array<{
    step: StepInput; generated: string[]; rejectedCanned: string[]; rejectedOrgNamed: string[];
    keptBuyer: string[]; droppedSeller: string[];
  }> = [];
  for (const step of args.steps) {
    const generated = await generateStepConditions({ ollamaUrl: args.ollamaUrl, genModel, step, executorBrief });
    const rejectedCanned = generated.filter(isCannedConditionString);
    const afterCanned = generated.filter((c) => !isCannedConditionString(c));
    const rejectedOrgNamed = afterCanned.filter((c) => orgGuard(c));
    const afterOrg = afterCanned.filter((c) => !orgGuard(c));

    const verdicts = await judgeConditionPerspectives({
      supabase: args.supabase,
      companyId: args.companyId,
      stepLabel: step.step_label,
      conditions: afterOrg,
      executorBrief,
      ollamaUrl: args.ollamaUrl,
      judgeModel: args.judgeModel,
      persist: args.persistVerdicts,
    });
    const keptBuyer = verdicts.filter((v) => v.verdict === "buyer").map((v) => v.condition);
    const droppedSeller = verdicts.filter((v) => v.verdict === "seller").map((v) => v.condition);
    interim.push({ step, generated, rejectedCanned, rejectedOrgNamed, keptBuyer, droppedSeller });
  }

  // Phase 2: cross-set de-dup over kept buyer conditions (keep first occurrence).
  const { surviving, dropped } = dedupeConditionsAcrossSteps(interim.map((i) => i.keptBuyer));

  // Phase 3: field-merge write the surviving conditions per step.
  const perStep: StepConditionsOutcome[] = [];
  for (let i = 0; i < interim.length; i++) {
    const it = interim[i];
    const survivingHere = surviving[i];
    const droppedDuplicate = dropped.filter((d) => d.step === i + 1).map((d) => d.condition);

    let written: ConditionEntry[] | null = null;
    if (args.write) {
      const { data: row } = await args.supabase
        .from("job_steps")
        .select("conditions_json")
        .eq("id", it.step.id)
        .maybeSingle();
      const existing: ConditionEntry[] = Array.isArray(row?.conditions_json) ? row.conditions_json : [];
      const preserved = existing.filter((e) => e?.origin !== "generated");
      const fresh: ConditionEntry[] = survivingHere.map((condition) => ({
        condition,
        status: "best_guess",
        origin: "generated",
        gen: { model: genModel, run_id: args.runId, perspective: "buyer", at: args.nowIso },
      }));
      const merged = [...preserved, ...fresh];
      const next = merged.length ? merged : null; // honest empty → NULL (hide tier)
      const { error } = await args.supabase.from("job_steps").update({ conditions_json: next }).eq("id", it.step.id);
      if (error) throw new Error(`conditions write failed for step ${it.step.id}: ${error.message}`);
      written = next;
    }

    perStep.push({
      step_id: it.step.id,
      step_number: it.step.step_number,
      step_label: it.step.step_label,
      generated: it.generated,
      rejectedCanned: it.rejectedCanned,
      rejectedOrgNamed: it.rejectedOrgNamed,
      droppedSeller: it.droppedSeller,
      droppedDuplicate,
      kept: survivingHere,
      written,
    });
  }

  const totals = perStep.reduce(
    (acc, s) => ({
      generated: acc.generated + s.generated.length,
      rejectedCanned: acc.rejectedCanned + s.rejectedCanned.length,
      rejectedOrgNamed: acc.rejectedOrgNamed + s.rejectedOrgNamed.length,
      droppedSeller: acc.droppedSeller + s.droppedSeller.length,
      droppedDuplicate: acc.droppedDuplicate + s.droppedDuplicate.length,
      kept: acc.kept + s.kept.length,
      stepsWritten: acc.stepsWritten + (s.written && s.written.some((e) => e.origin === "generated") ? 1 : 0),
    }),
    { generated: 0, rejectedCanned: 0, rejectedOrgNamed: 0, droppedSeller: 0, droppedDuplicate: 0, kept: 0, stepsWritten: 0 },
  );

  return { perStep, totals };
}

// ── Set-level invocation (B-II-4a/4b shared core) ────────────────────────────
// The single entry point both the generate-step-conditions edge function and the
// bootstrap-gen hook call — loads a set's steps + market_def, enforces the frozen
// and writable-provenance guards, and runs synthesizeStepConditions (write+persist).

// Frozen reference fixtures — SELECT-only, never written. Mirror of the frontend
// guard (src/lib/frozenCompanies.ts). Remove when CB1/CB2 are retired.
export const FROZEN_COMPANY_IDS = new Set<string>([
  "58b2b15b-bada-4bcd-9c12-b7e66a37d0bc", // Cafe Barra (CB1)
  "fd3f7f63-968b-4698-b946-3d6b6450d79d", // Cafe Barra 2 (CB2)
]);

// Conditions are an internal-layer artifact — generated only for system-authored/
// derived sets (mirrors PROTECTED_PROVENANCE_TYPES in journeyProtection.ts).
const WRITABLE_PROVENANCE = new Set(["internal_derived", "internal_declared", "operator_authored"]);

export type SetConditionsResult =
  | { ok: true; totals: SynthesisResult["totals"] }
  | { ok: false; skipped: "frozen_company" | "no_steps" | "non_writable_provenance"; provenances?: string[] }
  | { ok: false; error: string };

// True if any step in the set already carries a condition — the bootstrap-gen
// creation gate (existing conditions are preserved; only NEW/empty sets auto-fill).
export async function setHasConditions(
  supabase: { from: (t: string) => any },
  companyId: string,
  journeyKey: string,
): Promise<boolean> {
  const { data } = await supabase.from("job_steps").select("conditions_json").eq("company_id", companyId).eq("journey_key", journeyKey);
  return ((data ?? []) as Array<{ conditions_json?: unknown }>).some((r) => Array.isArray(r.conditions_json) && r.conditions_json.length > 0);
}

export async function generateConditionsForSet(args: {
  supabase: { from: (t: string) => any };
  companyId: string;
  journeyKey: string;
  ollamaUrl: string;
  nowIso: string;
  genModel?: string;
  judgeModel?: string;
  runId?: string;
}): Promise<SetConditionsResult> {
  if (FROZEN_COMPANY_IDS.has(args.companyId)) return { ok: false, skipped: "frozen_company" };

  const { data: rows, error } = await args.supabase
    .from("job_steps")
    .select("id, step_number, step_label, description, evidence_basis, provenance_type")
    .eq("company_id", args.companyId)
    .eq("journey_key", args.journeyKey)
    .order("step_number", { ascending: true });
  if (error) return { ok: false, error: String(error.message || error) };
  const list = (rows ?? []) as Array<StepInput & { provenance_type?: string | null }>;
  if (list.length === 0) return { ok: false, skipped: "no_steps" };

  const provenances = [...new Set(list.map((r) => String(r.provenance_type ?? "")))];
  if (!provenances.every((p) => WRITABLE_PROVENANCE.has(p))) {
    return { ok: false, skipped: "non_writable_provenance", provenances };
  }

  let { data: md } = await args.supabase
    .from("odi_market_definitions").select("job_executor, jtbd")
    .eq("company_id", args.companyId).eq("journey_key", args.journeyKey).maybeSingle();
  if (!md) {
    const { data: anyMd } = await args.supabase
      .from("odi_market_definitions").select("job_executor, jtbd")
      .eq("company_id", args.companyId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    md = anyMd ?? null;
  }

  const steps: StepInput[] = list.map((r) => ({ id: r.id, step_number: r.step_number, step_label: r.step_label, description: r.description, evidence_basis: r.evidence_basis }));
  const result = await synthesizeStepConditions({
    supabase: args.supabase,
    companyId: args.companyId,
    steps,
    marketDef: md as { job_executor?: string | null; jtbd?: string | null } | null,
    ollamaUrl: args.ollamaUrl,
    nowIso: args.nowIso,
    genModel: args.genModel,
    judgeModel: args.judgeModel,
    runId: args.runId,
    write: true,
    persistVerdicts: true,
  });
  return { ok: true, totals: result.totals };
}
