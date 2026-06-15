// Model-experiment gate (operator-approved 2026-06-12): the executor-perspective
// judge — band-judge pattern on llama3:70b. A declared job step must describe the
// BUYER's job (what the executor evaluates, requires, vets, confirms in their own
// world), never the seller's solution. Fail-safe direction: uncertain → 'seller'
// (the blocking verdict).
//
// Verdict-store law (step_perspective_verdicts): content-identity keying
// (sha256 of normalized label::description), first-verdict-wins insert-ignore,
// unresolved never persisted. Dry runs read the store but never write it
// (zero-DB-writes law for dry runs); write runs persist resolved verdicts.

import { normalizeForHash, sha256Hex } from "./contentIdentity.ts";

const JUDGE_TIMEOUT_MS = 120_000;

export type PerspectiveVerdict = {
  step_number: number;
  step_label: string;
  content_hash: string;
  verdict: "buyer" | "seller";
  from_store: boolean;
};

async function judgeOne(args: {
  ollamaUrl: string;
  judgeModel: string;
  stepLabel: string;
  description: string;
  executorBrief: string;
}): Promise<"buyer" | "seller"> {
  const nativeBase = args.ollamaUrl.replace(/\/v1\/?$/, "");
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), JUDGE_TIMEOUT_MS);
  try {
    const resp = await fetch(`${nativeBase}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer ollama" },
      body: JSON.stringify({
        model: args.judgeModel,
        format: "json",
        stream: false,
        options: { num_ctx: 4096 },
        messages: [
          {
            role: "system",
            content:
              "You judge whose job a process step describes. Answer with JSON only: {\"verdict\":\"buyer\"} or {\"verdict\":\"seller\"}. " +
              "'buyer' = the step describes what the JOB EXECUTOR (the buying side) evaluates, requires, vets, confirms or decides in their own world. " +
              "'seller' = the step describes the selling company's solution, offering, method, or what the seller does/delivers. " +
              "If a step is about the buyer assessing a named vendor's offering, that is still 'seller' framing — the buyer's job must be stated in the buyer's own terms. " +
              "If you are not sure, answer 'seller'.",
          },
          {
            role: "user",
            content:
              `Job executor (the buying side): ${args.executorBrief}\n` +
              `Step label: ${args.stepLabel}\n` +
              `Step description: ${args.description}\n` +
              `Whose job does this step describe?`,
          },
        ],
      }),
      signal: controller.signal,
    });
    if (!resp.ok) return "seller"; // fail-safe
    const data = await resp.json().catch(() => ({}));
    const content = String(data?.message?.content ?? "");
    const match = content.match(/"verdict"\s*:\s*"(buyer|seller)"/i);
    return match ? (match[1].toLowerCase() as "buyer" | "seller") : "seller";
  } catch {
    return "seller"; // fail-safe: uncertain blocks
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function judgeStepPerspectives(args: {
  supabase: { from: (t: string) => any };
  companyId: string;
  steps: Array<{ step_number: number; step_label: string; description: string }>;
  executorBrief: string;
  ollamaUrl: string;
  judgeModel?: string;
  // Dry runs: read the store, never write it.
  persist: boolean;
}): Promise<PerspectiveVerdict[]> {
  const judgeModel = args.judgeModel ?? "llama3:70b";
  const verdicts: PerspectiveVerdict[] = [];
  for (const step of args.steps) {
    const contentHash = await sha256Hex(
      `${normalizeForHash(step.step_label)}::${normalizeForHash(step.description)}`,
    );
    let verdict: "buyer" | "seller" | null = null;
    let fromStore = false;
    const { data: stored } = await args.supabase
      .from("step_perspective_verdicts")
      .select("verdict")
      .eq("company_id", args.companyId)
      .eq("content_hash", contentHash)
      .maybeSingle();
    if (stored && (stored.verdict === "buyer" || stored.verdict === "seller")) {
      verdict = stored.verdict;
      fromStore = true;
    }
    if (!verdict) {
      verdict = await judgeOne({
        ollamaUrl: args.ollamaUrl,
        judgeModel,
        stepLabel: step.step_label,
        description: step.description,
        executorBrief: args.executorBrief,
      });
      if (args.persist) {
        // First-verdict-wins: ignore conflicts; only resolved verdicts reach here.
        const { error } = await args.supabase.from("step_perspective_verdicts").insert({
          company_id: args.companyId,
          content_hash: contentHash,
          verdict,
          judge_model: judgeModel,
          step_label_excerpt: step.step_label.slice(0, 120),
        });
        if (error && !String(error.message || "").toLowerCase().includes("duplicate")) {
          console.warn("[step-perspective-judge] verdict persist failed (non-fatal)", String(error.message).slice(0, 120));
        }
      }
    }
    console.log(`[step-perspective-judge] step ${step.step_number} "${step.step_label.slice(0, 50)}" → ${verdict}${fromStore ? " (store)" : ""}`);
    verdicts.push({
      step_number: step.step_number,
      step_label: step.step_label,
      content_hash: contentHash,
      verdict,
      from_store: fromStore,
    });
  }
  return verdicts;
}

// b-ii: judge per-step CONDITIONS (preconditions) with the SAME executor lens,
// model, and verdict store as job steps — reuses judgeOne (no fork). A condition
// must describe the BUYER's job, never the seller's solution; uncertain → seller
// (dropped by the caller). Content-identity keys off the condition text alone (a
// condition is a standalone statement), so the same condition phrasing resolves
// once across steps/companies. First-verdict-wins; dry runs read but never persist.
export type ConditionVerdict = {
  condition: string;
  content_hash: string;
  verdict: "buyer" | "seller";
  from_store: boolean;
};

export async function judgeConditionPerspectives(args: {
  supabase: { from: (t: string) => any };
  companyId: string;
  stepLabel: string; // judge context only — NOT part of the content identity
  conditions: string[];
  executorBrief: string;
  ollamaUrl: string;
  judgeModel?: string;
  persist: boolean;
}): Promise<ConditionVerdict[]> {
  const judgeModel = args.judgeModel ?? "llama3:70b";
  const out: ConditionVerdict[] = [];
  for (const condition of args.conditions) {
    const contentHash = await sha256Hex(normalizeForHash(condition));
    let verdict: "buyer" | "seller" | null = null;
    let fromStore = false;
    const { data: stored } = await args.supabase
      .from("step_perspective_verdicts")
      .select("verdict")
      .eq("company_id", args.companyId)
      .eq("content_hash", contentHash)
      .maybeSingle();
    if (stored && (stored.verdict === "buyer" || stored.verdict === "seller")) {
      verdict = stored.verdict;
      fromStore = true;
    }
    if (!verdict) {
      verdict = await judgeOne({
        ollamaUrl: args.ollamaUrl,
        judgeModel,
        stepLabel: args.stepLabel,
        description: condition, // the condition is the statement under judgement
        executorBrief: args.executorBrief,
      });
      if (args.persist) {
        const { error } = await args.supabase.from("step_perspective_verdicts").insert({
          company_id: args.companyId,
          content_hash: contentHash,
          verdict,
          judge_model: judgeModel,
          step_label_excerpt: condition.slice(0, 120),
        });
        if (error && !String(error.message || "").toLowerCase().includes("duplicate")) {
          console.warn("[condition-judge] verdict persist failed (non-fatal)", String(error.message).slice(0, 120));
        }
      }
    }
    console.log(`[condition-judge] "${condition.slice(0, 50)}" → ${verdict}${fromStore ? " (store)" : ""}`);
    out.push({ condition, content_hash: contentHash, verdict, from_store: fromStore });
  }
  return out;
}
