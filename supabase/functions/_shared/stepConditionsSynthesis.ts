// b-ii: per-step conditions ("what must be true") generator → judge → writer.
// LOCAL internal-layer only (qwen2.5:14b generator, llama3:70b executor-judge).
// Lifted faithfully from the accepted B-II-2a attempt-2 harness — the prompts,
// guards and judge here are exactly what that dry-run proved (32/32 clean buyer
// conditions on a correctly-buyer-framed brief).
//
// Pipeline per step: generate (strict: model CONTENT or loud fail) → reject canned
// (cannedConditionGuard, mirrors the b-i render gate) → judge buyer/seller (drop
// seller) → write kept buyer conditions to job_steps.conditions_json as
// status="best_guess", origin="generated". FIELD-MERGE: only origin="generated"
// entries are replaced; origin="operator" entries survive regeneration.
//
// Signed scope: best_guess only (real_source deferred); declared/internal_derived
// sets; conditions stay OUT of mojoScore. Production triggering is a later step —
// this module is the reusable path the flow will call.

import { judgeConditionPerspectives } from "./stepPerspectiveJudge.ts";
import { isCannedConditionString } from "./cannedConditionGuard.ts";

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

// Real brief-builder — mirrors local-jobmap-synthesis/index.ts:1318-1321.
export function buildExecutorBrief(
  marketDef: { job_executor?: string | null; jtbd?: string | null } | null,
): string {
  return [String(marketDef?.job_executor || "").trim(), String(marketDef?.jtbd || "").trim()]
    .filter(Boolean)
    .join(" — ") || "the buying-side job executor";
}

// Verbatim from B-II-2a attempt-2 (accepted).
const GEN_SYSTEM =
  "You generate the PRECONDITIONS for one step in a job map - the things that must already be true about the JOB EXECUTOR (the buyer) themselves for them to carry out THIS step in their own world. " +
  "Each condition describes the executor's OWN readiness, knowledge, or state, in their own terms. " +
  "Hard rules: (1) NEVER name the selling company or any specific vendor/supplier; never reference the seller's product, offering, mechanisms, or sales - the condition is about the executor's side only. " +
  "(2) Solution-agnostic - no methods/programs/offerings named. " +
  "(3) Use the executor's domain vocabulary (concrete nouns), not abstract business filler. " +
  "(4) Each condition is a specific, testable statement of something that must hold - NOT a restatement of the step label. " +
  "(5) Do NOT use canned filler such as 'X is established', 'requirements are established', 'is named and documented', 'is tracked and current', 'is written down, not assumed'. " +
  "Return ONLY as many GENUINE buyer-side conditions as this step honestly carries (up to 4). Quality over count - do not pad. " +
  "JSON only: {\"conditions\":[\"...\"]}.";

function buildGenUser(step: StepInput, executorBrief: string): string {
  return (
    `Job executor (the buying side): ${executorBrief}\n` +
    `Step label: ${step.step_label}\n` +
    `Step description: ${step.description}\n` +
    `Evidence basis: ${step.evidence_basis || "(none)"}\n` +
    `List the preconditions that must be true for this executor to carry out this step.`
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
  // Native /api/chat (mirrors the declared path) — strip a trailing /v1.
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

// Strict (model CONTENT, not just a call): unparseable / empty output throws with
// a named reason — nothing silently degrades.
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
  const conditions = arr.map((c) => String(c ?? "").trim()).filter(Boolean);
  return conditions;
}

export type StepConditionsOutcome = {
  step_id: string;
  step_number: number;
  step_label: string;
  generated: string[];
  rejectedCanned: string[];
  kept: string[];
  droppedSeller: string[];
  written: ConditionEntry[] | null;
};

export type SynthesisResult = {
  perStep: StepConditionsOutcome[];
  totals: { generated: number; rejectedCanned: number; kept: number; droppedSeller: number; stepsWritten: number };
};

// Generate + judge + (optionally) write conditions for a set of steps.
// write=false → dry-run shape (no DB mutation); persistVerdicts=false → judge
// reads the store but never writes it (dry-run law).
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
  const perStep: StepConditionsOutcome[] = [];

  for (const step of args.steps) {
    const generated = await generateStepConditions({ ollamaUrl: args.ollamaUrl, genModel, step, executorBrief });

    // Write-time canned guard (mirrors the b-i render drop) — never persist canned.
    const rejectedCanned = generated.filter(isCannedConditionString);
    const nonCanned = generated.filter((c) => !isCannedConditionString(c));

    const verdicts = await judgeConditionPerspectives({
      supabase: args.supabase,
      companyId: args.companyId,
      stepLabel: step.step_label,
      conditions: nonCanned,
      executorBrief,
      ollamaUrl: args.ollamaUrl,
      judgeModel: args.judgeModel,
      persist: args.persistVerdicts,
    });
    const kept = verdicts.filter((v) => v.verdict === "buyer").map((v) => v.condition);
    const droppedSeller = verdicts.filter((v) => v.verdict === "seller").map((v) => v.condition);

    let written: ConditionEntry[] | null = null;
    if (args.write) {
      // FIELD-MERGE: operator-curated entries survive; only generated entries are
      // replaced by this run's kept conditions.
      const { data: row } = await args.supabase
        .from("job_steps")
        .select("conditions_json")
        .eq("id", step.id)
        .maybeSingle();
      const existing: ConditionEntry[] = Array.isArray(row?.conditions_json) ? row.conditions_json : [];
      const preserved = existing.filter((e) => e?.origin !== "generated");
      const fresh: ConditionEntry[] = kept.map((condition) => ({
        condition,
        status: "best_guess",
        origin: "generated",
        gen: { model: genModel, run_id: args.runId, perspective: "buyer", at: args.nowIso },
      }));
      const merged = [...preserved, ...fresh];
      const next = merged.length ? merged : null; // honest empty → NULL (hide tier)
      const { error } = await args.supabase.from("job_steps").update({ conditions_json: next }).eq("id", step.id);
      if (error) throw new Error(`conditions write failed for step ${step.id}: ${error.message}`);
      written = next;
    }

    perStep.push({
      step_id: step.id,
      step_number: step.step_number,
      step_label: step.step_label,
      generated,
      rejectedCanned,
      kept,
      droppedSeller,
      written,
    });
  }

  const totals = perStep.reduce(
    (acc, s) => ({
      generated: acc.generated + s.generated.length,
      rejectedCanned: acc.rejectedCanned + s.rejectedCanned.length,
      kept: acc.kept + s.kept.length,
      droppedSeller: acc.droppedSeller + s.droppedSeller.length,
      stepsWritten: acc.stepsWritten + (s.written && s.written.some((e) => e.origin === "generated") ? 1 : 0),
    }),
    { generated: 0, rejectedCanned: 0, kept: 0, droppedSeller: 0, stepsWritten: 0 },
  );

  return { perStep, totals };
}
