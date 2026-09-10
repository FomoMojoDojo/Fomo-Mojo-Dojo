// recordModelCall (Gate 3, 2026-09-10) — persist one billable call.
//
// Six functions computed a USD cost and returned it in an HTTP body that no caller parsed. Every
// run's spend vanished with the response. This is the one writer; the six sites and the own-words
// judge call it.
//
// IT MUST NEVER FAIL THE CALL IT MEASURES. Cost capture is observability: a broken insert, a missing
// table, a revoked policy must all degrade to a log line and let the model call's own result stand.
// The alternative — an accounting failure taking down a public read — is strictly worse than a gap
// in the ledger, and the coverage label already tells an operator the ledger is partial.
import { OPENAI_PRICE_PER_MTOK, type OpenAIUsage } from "./modelPricing.ts";

export type ModelCallRecord = {
  provider: string;
  model: string;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  /** Null when the provider returned no usage — an honest gap, never a 0. */
  usd: number | null;
};

/** The same price table the six sites already use, so one number is computed one way. */
export function usdFromUsage(usage: OpenAIUsage | null | undefined): number | null {
  if (!usage) return null;
  const p = Number(usage.prompt_tokens);
  const cmp = Number(usage.completion_tokens);
  if (!Number.isFinite(p) || !Number.isFinite(cmp)) return null;
  return (p / 1e6) * OPENAI_PRICE_PER_MTOK.input + (cmp / 1e6) * OPENAI_PRICE_PER_MTOK.output;
}

/** Build the persistable record from a raw OpenAI usage object. */
export function openaiRecord(model: string, usage: OpenAIUsage | null | undefined): ModelCallRecord {
  return {
    provider: "openai",
    model,
    prompt_tokens: usage ? Number(usage.prompt_tokens) : null,
    completion_tokens: usage ? Number(usage.completion_tokens) : null,
    usd: usdFromUsage(usage),
  };
}

// deno-lint-ignore no-explicit-any
type SupabaseLike = { from: (t: string) => any };

/**
 * Insert one model_calls row. Resolves to true on success, false on any failure — never throws.
 * `runId` is the long_runner_runs row that incurred the call, or null when the site has none.
 */
export async function recordModelCall(
  supabase: SupabaseLike,
  args: { companyId: string; runId?: string | null; callSite: string; usage: ModelCallRecord },
): Promise<boolean> {
  try {
    if (!args.companyId) return false;
    const { error } = await supabase.from("model_calls").insert({
      company_id: args.companyId,
      run_id: args.runId ?? null,
      call_site: args.callSite,
      provider: args.usage.provider,
      model: args.usage.model,
      prompt_tokens: args.usage.prompt_tokens,
      completion_tokens: args.usage.completion_tokens,
      usd: args.usage.usd,
    });
    if (error) {
      console.warn(`[model-calls] insert failed for ${args.callSite} (non-fatal): ${error.message}`);
      return false;
    }
    return true;
  } catch (e) {
    console.warn(`[model-calls] insert threw for ${args.callSite} (non-fatal): ${(e as Error).message}`);
    return false;
  }
}
