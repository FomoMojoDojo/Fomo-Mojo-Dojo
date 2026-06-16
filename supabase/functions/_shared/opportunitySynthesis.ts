// DECL-OPP-A2: declared-opportunity generator → likelihood judge → (later) writer.
// LOCAL internal-layer only (qwen2.5:14b generator, llama3:70b likelihood judge).
// Sibling of stepConditionsSynthesis.ts (b-ii) and marketHypothesisSynthesis.ts
// (MH-5) — same local-Ollama discipline, same frozen/writable guards, same
// dry-run-then-write order. Reuses buildExecutorBrief + buildOrgNameGuard +
// FROZEN_COMPANY_IDS from the b-ii core (no fork).
//
// Pipeline per step: generate ODI desired-outcomes (strict: model CONTENT or loud
// fail; 0-N honest, never padded) → reject weak/jargon outcomes (isWeakOpportunity,
// mirrors local-jobmap-synthesis isWeakNeedLanguage) → reject org-named (the buyer's
// outcome never names the provider) → judge per-opportunity likelihood band
// (Low/Medium/High; the judge ANNOTATES, it does not drop). Buyer-framing is handled
// by the likelihood judge (seller-framed → Low), per the signed design.
//
// A2-1 scope: dry-run ONLY (write:false). The reconcile/insert writer to odi_needs
// under internal_declared is A2-2. No route to OpenAI / mojo_opps_v1 (local only).

import { buildExecutorBrief, buildOrgNameGuard, FROZEN_COMPANY_IDS } from "./stepConditionsSynthesis.ts";
import { judgeOpportunityLikelihood, type LikelihoodBand } from "./opportunityLikelihoodJudge.ts";

export type OppStepInput = {
  id: string;
  step_number: number;
  step_label: string;
  description: string;
  evidence_basis?: string | null;
};

export type GeneratedOpportunity = {
  outcome: string; // ODI desired-outcome, verb-start (this becomes desired_outcome)
  odi_canonical_statement: string;
};

export type JudgedOpportunity = GeneratedOpportunity & { band: LikelihoodBand };

const GEN_TIMEOUT_MS = 180_000;
const DEFAULT_GEN_MODEL = "qwen2.5:14b-instruct";

// Declared opportunities are an internal-layer artifact — generated only for
// system-authored/derived sets (mirrors WRITABLE_PROVENANCE in the b-ii core /
// PROTECTED_PROVENANCE_TYPES in journeyProtection.ts).
const WRITABLE_PROVENANCE = new Set(["internal_derived", "internal_declared", "operator_authored"]);

// ODI outcome shape guard — mirrors isWeakNeedLanguage (local-jobmap-synthesis:248):
// must start with an ODI verb, be measurable-length (>=7 words), and carry no
// consulting/jargon filler. An outcome failing this is dropped (not padded).
const WEAK_OPP_TERMS = /\b(strategic alignment|operational excellence|synergy|leverage|holistic|transformation|best practice|framework|optimization|optimisation)\b/i;
const ODI_VERB_START = /^(minimize|minimise|reduce|increase|improve|maximize|maximise|avoid)\b/i;

export function isWeakOpportunity(value: string): boolean {
  const text = String(value ?? "").trim().toLowerCase();
  if (!text) return true;
  if (WEAK_OPP_TERMS.test(text)) return true;
  if (text.split(/\s+/).length < 7) return true;
  if (!ODI_VERB_START.test(text)) return true;
  return false;
}

const GEN_SYSTEM =
  "You generate the customer OPPORTUNITIES (desired outcomes) for ONE step in a job map — the measurable outcomes the people doing this job want to achieve at THIS step, in their own world. " +
  "Each opportunity is an ODI desired-outcome statement: it MUST start with one of Minimize, Reduce, Increase, Improve, Maximize, Avoid, then a measurable dimension (time, number, likelihood, frequency, effort, risk) + the object + the context. " +
  "Example: 'Minimize the time it takes to confirm a program actually fits the child's needs.' " +
  "Hard rules: " +
  "(1) BUYER-FRAMED — the outcome is what the PEOPLE DOING THE JOB want for themselves, never the provider's solution, offering, method, or what a provider delivers. " +
  "(2) NEVER name the company, its brand, or any vendor/provider/supplier. Describe the people's own outcome even when a provider is involved. " +
  "(3) SPECIFIC to THIS step — not a generic outcome that would apply to many steps. " +
  "(4) Plain, human language — no business, consulting, or clinical jargon (no 'strategic alignment', 'operational excellence', 'synergy', 'leverage', 'optimization', 'framework'). " +
  "(5) MEASURABLE — a real metric a person could feel or count. " +
  "Return ONLY the genuine outcomes for THIS step — a step may have 0, 1, 2, or 3; some steps legitimately have none. Do NOT pad to a count. Quality over count. " +
  "JSON only: {\"opportunities\":[{\"outcome\":\"Minimize ...\",\"odi_canonical_statement\":\"Minimize the [dimension] of [object] when [context]\"}]}.";

function buildGenUser(step: OppStepInput, executorBrief: string): string {
  return (
    `The people doing this job (refer to them plainly, e.g. "the family"/"the owner"): ${executorBrief}\n` +
    `Step label: ${step.step_label}\n` +
    `Step description: ${step.description}\n` +
    `Evidence basis: ${step.evidence_basis || "(none)"}\n` +
    `List only the desired outcomes these people genuinely want at THIS step.`
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

// Strict (model CONTENT): unparseable / missing array throws with a named reason.
// An empty array is allowed (the step honestly has no opportunities).
export async function generateStepOpportunities(args: {
  ollamaUrl: string;
  genModel: string;
  step: OppStepInput;
  executorBrief: string;
}): Promise<GeneratedOpportunity[]> {
  const r = await callOllamaJson(args.ollamaUrl, args.genModel, GEN_SYSTEM, buildGenUser(args.step, args.executorBrief), GEN_TIMEOUT_MS);
  if (!r.ok) throw new Error(`opportunity generator: model call failed for step ${args.step.step_number}: ${r.err}`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(r.content ?? "");
  } catch {
    throw new Error(`opportunity generator: unparseable model output for step ${args.step.step_number} (strict): ${String(r.content).slice(0, 160)}`);
  }
  const arr = Array.isArray((parsed as { opportunities?: unknown })?.opportunities)
    ? ((parsed as { opportunities: unknown[] }).opportunities)
    : null;
  if (!arr) throw new Error(`opportunity generator: no opportunities array for step ${args.step.step_number} (strict: model CONTENT required)`);
  return arr
    .map((o) => {
      const obj = (o ?? {}) as { outcome?: unknown; odi_canonical_statement?: unknown };
      return {
        outcome: String(obj.outcome ?? "").trim(),
        odi_canonical_statement: String(obj.odi_canonical_statement ?? "").trim(),
      };
    })
    .filter((o) => o.outcome.length > 0);
}

export type StepOpportunitiesOutcome = {
  step_id: string;
  step_number: number;
  step_label: string;
  journey_key: string;
  generated: GeneratedOpportunity[];
  rejectedWeak: string[];
  rejectedOrgNamed: string[];
  kept: JudgedOpportunity[];
};

export type OppSynthesisResult = {
  perStep: StepOpportunitiesOutcome[];
  totals: {
    generated: number;
    rejectedWeak: number;
    rejectedOrgNamed: number;
    kept: number;
    bandHigh: number;
    bandMedium: number;
    bandLow: number;
    stepsWithOpps: number;
  };
};

export async function synthesizeOpportunities(args: {
  companyName: string;
  journeyKey: string;
  steps: OppStepInput[];
  marketDef: { job_executor?: string | null; jtbd?: string | null } | null;
  ollamaUrl: string;
  genModel?: string;
  judgeModel?: string;
}): Promise<OppSynthesisResult> {
  const executorBrief = buildExecutorBrief(args.marketDef);
  const genModel = args.genModel ?? DEFAULT_GEN_MODEL;
  const orgGuard = buildOrgNameGuard(String(args.companyName ?? ""));

  const perStep: StepOpportunitiesOutcome[] = [];
  for (const step of args.steps) {
    const generated = await generateStepOpportunities({ ollamaUrl: args.ollamaUrl, genModel, step, executorBrief });

    const rejectedWeak = generated.filter((o) => isWeakOpportunity(o.outcome)).map((o) => o.outcome);
    const afterWeak = generated.filter((o) => !isWeakOpportunity(o.outcome));

    const rejectedOrgNamed = afterWeak.filter((o) => orgGuard(o.outcome) || orgGuard(o.odi_canonical_statement)).map((o) => o.outcome);
    const afterOrg = afterWeak.filter((o) => !orgGuard(o.outcome) && !orgGuard(o.odi_canonical_statement));

    // Likelihood judge ANNOTATES each surviving opportunity with a band (no drop).
    const verdicts = await judgeOpportunityLikelihood({
      opportunities: afterOrg.map((o) => ({ outcome: o.outcome, stepLabel: step.step_label })),
      executorBrief,
      ollamaUrl: args.ollamaUrl,
      judgeModel: args.judgeModel,
    });
    const bandByOutcome = new Map(verdicts.map((v) => [v.outcome, v.band]));
    const kept: JudgedOpportunity[] = afterOrg.map((o) => ({ ...o, band: bandByOutcome.get(o.outcome) ?? "Medium" }));

    perStep.push({
      step_id: step.id,
      step_number: step.step_number,
      step_label: step.step_label,
      journey_key: args.journeyKey,
      generated,
      rejectedWeak,
      rejectedOrgNamed,
      kept,
    });
  }

  const totals = perStep.reduce(
    (acc, s) => ({
      generated: acc.generated + s.generated.length,
      rejectedWeak: acc.rejectedWeak + s.rejectedWeak.length,
      rejectedOrgNamed: acc.rejectedOrgNamed + s.rejectedOrgNamed.length,
      kept: acc.kept + s.kept.length,
      bandHigh: acc.bandHigh + s.kept.filter((o) => o.band === "High").length,
      bandMedium: acc.bandMedium + s.kept.filter((o) => o.band === "Medium").length,
      bandLow: acc.bandLow + s.kept.filter((o) => o.band === "Low").length,
      stepsWithOpps: acc.stepsWithOpps + (s.kept.length > 0 ? 1 : 0),
    }),
    { generated: 0, rejectedWeak: 0, rejectedOrgNamed: 0, kept: 0, bandHigh: 0, bandMedium: 0, bandLow: 0, stepsWithOpps: 0 },
  );

  return { perStep, totals };
}

// ── Set-level invocation (mirrors generateConditionsForSet) ──────────────────────
// Loads a chosen set's steps + market_def + company name, enforces frozen and
// writable-provenance guards, and runs synthesizeOpportunities. A2-1: dry-run only
// (the result carries the candidates; NO write path exists yet — that is A2-2).

export type SetOpportunitiesResult =
  | { ok: true; result: OppSynthesisResult }
  | { ok: false; skipped: "frozen_company" | "no_steps" | "non_writable_provenance"; provenances?: string[] }
  | { ok: false; error: string };

export async function generateOpportunitiesForSet(args: {
  supabase: { from: (t: string) => any };
  companyId: string;
  journeyKey: string;
  ollamaUrl: string;
  genModel?: string;
  judgeModel?: string;
}): Promise<SetOpportunitiesResult> {
  if (FROZEN_COMPANY_IDS.has(args.companyId)) return { ok: false, skipped: "frozen_company" };

  const { data: rows, error } = await args.supabase
    .from("job_steps")
    .select("id, step_number, step_label, description, evidence_basis, provenance_type")
    .eq("company_id", args.companyId)
    .eq("journey_key", args.journeyKey)
    .order("step_number", { ascending: true });
  if (error) return { ok: false, error: String(error.message || error) };
  const list = (rows ?? []) as Array<OppStepInput & { provenance_type?: string | null }>;
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

  const { data: companyRow } = await args.supabase.from("companies").select("name").eq("id", args.companyId).maybeSingle();

  const steps: OppStepInput[] = list.map((r) => ({
    id: r.id, step_number: r.step_number, step_label: r.step_label, description: r.description, evidence_basis: r.evidence_basis,
  }));
  const result = await synthesizeOpportunities({
    companyName: String((companyRow as { name?: unknown } | null)?.name ?? ""),
    journeyKey: args.journeyKey,
    steps,
    marketDef: md as { job_executor?: string | null; jtbd?: string | null } | null,
    ollamaUrl: args.ollamaUrl,
    genModel: args.genModel,
    judgeModel: args.judgeModel,
  });
  return { ok: true, result };
}
