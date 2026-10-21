// ── THE WEB_SEARCH LEDGER (E3 brief ruling 1, 2026-10-21) — every Claude web_search call writes one model_calls row ─────
//
// The R53 pattern, for the Anthropic web_search tool: the ledger is REQUIRED (a call with none throws before any request
// is sent), one row is written PER CALL — per attempt — BEFORE the answer is parsed (the call cost whether or not its
// answer is usable), and a call whose row could not be written REFUSES: its answer is never used. The row carries the
// model, input tokens (input + cache write + cache read), output tokens, the billed search count, the USD cost
// (modelPricing.anthropicUsd — NULL for an unpriced model), the call site, the attempt and the prompt sha.
//
// Call sites (each passes its own call_site): public-baseline-search (callClaudeWebSearch — the domain plan AND the
// name-only lane), competitor-discovery, generate-normative-jobmap.
import { anthropicPriceFor, anthropicUsd, type AnthropicUsage } from "./modelPricing.ts";
import { recordModelCall, type ModelCallRecord } from "./recordModelCall.ts";

export type WebSearchLedgerEntry = { model: string; usage: AnthropicUsage | null; attempt: number; promptSha: string | null };
/** Resolves true when the row was written, false when it was not (never throws — the caller refuses). */
export type WebSearchLedger = (e: WebSearchLedgerEntry) => Promise<boolean>;

/** The persistable record for one web_search call. Tokens NULL (not 0) when the call returned no usage. */
export function webSearchRecord(model: string, usage: AnthropicUsage | null | undefined): ModelCallRecord {
  const has = !!usage;
  const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  return {
    provider: "anthropic",
    model,
    prompt_tokens: has ? num(usage!.input_tokens) + num(usage!.cache_creation_input_tokens) + num(usage!.cache_read_input_tokens) : null,
    completion_tokens: has ? num(usage!.output_tokens) : null,
    usd: anthropicUsd(model, usage ?? null),
    web_search_requests: has ? num(usage!.server_tool_use?.web_search_requests) : null,
  };
}

// deno-lint-ignore no-explicit-any
type SupabaseLike = { from: (t: string) => any };
/** The standard ledger: one model_calls row keyed to the company (and the long_runner_runs row, when the site has one). */
export function webSearchLedgerFor(supabase: SupabaseLike, args: { companyId: string; runId?: string | null; callSite: string }): WebSearchLedger {
  return (e) => recordModelCall(supabase, { companyId: args.companyId, runId: args.runId ?? null, callSite: args.callSite, usage: webSearchRecord(e.model, e.usage), attempt: e.attempt, promptSha: e.promptSha });
}

/** R53: no ledger, no call — thrown before any request is sent. */
export function requireWebSearchLedger(ledger: unknown, site: string): asserts ledger is WebSearchLedger {
  if (typeof ledger !== "function") throw new Error(`${site}: a web_search ledger is required (ruling 1, 2026-10-21) — no web_search call made`);
}

/** Write the row; a row that could not be written refuses the call (thrown — the answer is never used). */
export async function ledgerOrRefuse(ledger: WebSearchLedger, e: WebSearchLedgerEntry, site: string): Promise<void> {
  if (!(await ledger(e))) throw new Error(`${site}: web_search call not ledgered (model_calls write failed) — refused, answer not used`);
}

/** The fill's spend cap (enforced by its caller, next brief): a call whose cost cannot be computed — an unpriced model —
 *  refuses BEFORE it is made. */
export function priceableOrRefuse(model: string, site: string): void {
  if (!anthropicPriceFor(model)) throw new Error(`${site}: model ${model} has no price in modelPricing.ts — its cost cannot be computed, so under a spend cap the call is refused before it is made`);
}

export async function promptShaOf(text: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, "0")).join("");
}
