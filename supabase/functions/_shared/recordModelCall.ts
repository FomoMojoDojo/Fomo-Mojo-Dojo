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
import { OPENAI_PRICE_PER_MTOK, openaiPriceFor, type OpenAIUsage } from "./modelPricing.ts";

export type ModelCallRecord = {
  provider: string;
  model: string;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  /** Null when the provider returned no usage — an honest gap, never a 0. */
  usd: number | null;
  /** Claude web_search calls only (migration 20261021030000): the billed search count. Absent ⇒ the column stays NULL. */
  web_search_requests?: number | null;
};

/** The same price table the six sites already use, so one number is computed one way. */
export function usdFromUsage(usage: OpenAIUsage | null | undefined): number | null {
  if (!usage) return null;
  const p = Number(usage.prompt_tokens);
  const cmp = Number(usage.completion_tokens);
  if (!Number.isFinite(p) || !Number.isFinite(cmp)) return null;
  return (p / 1e6) * OPENAI_PRICE_PER_MTOK.input + (cmp / 1e6) * OPENAI_PRICE_PER_MTOK.output;
}

/** Build the persistable record from a raw OpenAI usage object. A model with a signed per-model price (gpt-4.1, ruling
 *  2026-10-21) is priced at it; any other model keeps the Gate 3 table, exactly as before. */
export function openaiRecord(model: string, usage: OpenAIUsage | null | undefined): ModelCallRecord {
  const p = model === "gpt-4.1-mini" ? null : openaiPriceFor(model);
  const usd = p && usage && Number.isFinite(Number(usage.prompt_tokens)) && Number.isFinite(Number(usage.completion_tokens))
    ? (Number(usage.prompt_tokens) / 1e6) * p.input + (Number(usage.completion_tokens) / 1e6) * p.output
    : usdFromUsage(usage);
  return {
    provider: "openai",
    model,
    prompt_tokens: usage ? Number(usage.prompt_tokens) : null,
    completion_tokens: usage ? Number(usage.completion_tokens) : null,
    usd,
  };
}

/** Ruling 2 (2026-10-22): one record per model, each priced at that model's signed rate (openaiRecord → modelPricing,
 *  the one price table) — never one aggregate priced as gpt-4.1-mini. */
export function openaiRecordsByModel(usageByModel: ReadonlyMap<string, OpenAIUsage>): ModelCallRecord[] {
  return [...usageByModel.entries()].map(([model, u]) => openaiRecord(model, u));
}

// deno-lint-ignore no-explicit-any
type SupabaseLike = { from: (t: string) => any };

/**
 * SP-F9 / SP-177 (2026-11-13): model_calls.run_id is `uuid` and carries a FOREIGN KEY to
 * long_runner_runs(id). research-company passed `String(baselineRun.id)` — a
 * public_baseline_runs.id, which is a **bigint** — so every insert failed the uuid cast and the
 * function wrote NO ledger rows at all, silently, because this writer degrades to a log line by
 * design. The spend was real; the record was not.
 *
 * So the attribution field is validated HERE, at the one writer, and a value that cannot be a
 * run_id is dropped to NULL rather than taking the whole row down with it. That ordering is
 * deliberate and matches this module's standing rule: a gap in attribution is strictly better than
 * a missing cost row, and a missing cost row is what a rejected insert produces.
 */
export function normalizeRunId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!UUID_RE.test(trimmed)) return null;
  return trimmed;
}

// Canonical 8-4-4-4-12 hex form. Deliberately not accepting a braced or urn: spelling: the column is
// written by our own code, so a value in any other shape is a bug to surface, not a format to absorb.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Insert one model_calls row. Resolves to true on success, false on any failure — never throws.
 * `runId` is the long_runner_runs row that incurred the call, or null when the site has none. A
 * value that is not a uuid is stored as NULL and logged (SP-177) — never passed through to fail the
 * insert, and never silently turned into something it is not.
 */
export async function recordModelCall(
  supabase: SupabaseLike,
  args: {
    companyId: string; runId?: string | null; callSite: string; usage: ModelCallRecord;
    /** L1 (2026-10-15): which attempt of its kind incurred this call — 1 for the first answer, 2 for
     *  the one re-ask. Omitted by the sites that have no attempt concept, and stored NULL. */
    attempt?: number | null;
    /** L1: the sha of the EXACT prompt that produced this call, so spend joins to the prompt that
     *  caused it and to the attempt's own audit row. Omitted ⇒ NULL, never a guess. */
    promptSha?: string | null;
  },
): Promise<boolean> {
  try {
    if (!args.companyId) return false;
    const runId = normalizeRunId(args.runId);
    if (args.runId != null && runId === null) {
      // Loud, because this is the shape of the SP-F9 bug: the row still lands, with no attribution.
      console.warn(
        `[model-calls] ${args.callSite}: run_id is not a uuid, storing NULL (run_id must be a long_runner_runs id)`,
      );
    }
    const { error } = await supabase.from("model_calls").insert({
      company_id: args.companyId,
      run_id: runId,
      call_site: args.callSite,
      provider: args.usage.provider,
      model: args.usage.model,
      prompt_tokens: args.usage.prompt_tokens,
      completion_tokens: args.usage.completion_tokens,
      usd: args.usage.usd,
      attempt: args.attempt ?? null,
      prompt_sha: args.promptSha ?? null,
      ...(args.usage.web_search_requests !== undefined ? { web_search_requests: args.usage.web_search_requests } : {}),
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
