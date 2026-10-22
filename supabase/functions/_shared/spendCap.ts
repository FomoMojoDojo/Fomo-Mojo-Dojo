// ── THE SPEND CAP (operator ruling 2026-10-21, fill brief step 2) — a capped run refuses a paid call it cannot afford ────
//
// Before every PAID call on a capped run: project the call's cost, read the run's cumulative ledgered usd (model_calls rows
// of this company since the run started), and REFUSE — before the request is sent — when
//   * the call's cost cannot be computed (no price for the model: modelPricing has exact-id tables only), or
//   * any paid row already ledgered in the window has usd NULL (the cumulative cannot be computed), or
//   * cumulative + projected > the cap.
// Local calls (Ollama) are not paid and are never checked. Every refusal is kept on the cap (cap.refusals) for the run
// ledger. Paid sites wired: the Claude web_search calls (public-baseline-search, the seed-host lane), the OpenAI synthesis,
// and the routed external branch (finding beats, frontier) via makeRoutedModel's beforeExternal hook.
//
// PROJECTION (an upper estimate, not a guarantee — the actual is ledgered and re-read before the next call):
//   web_search: input = prompt chars / 4 + max_uses × WEB_SEARCH_INPUT_TOKENS_PER_SEARCH; output = max_tokens; + max_uses
//               searches. OpenAI: input = prompt chars / 4; output = max output tokens.
import { anthropicPriceFor, openaiPriceFor } from "./modelPricing.ts";

/** Ruling 4 (2026-10-21): 40k input tokens per search — run 83 measured ~38k (414,908 input over 11 searches); the old
 *  10k let a $1.46 call through on a $0.96 projection. */
export const WEB_SEARCH_INPUT_TOKENS_PER_SEARCH = 40_000;
/** Ruling 4 + the operator's answer (2026-10-21): a requested spend_cap_usd is clamped to this ceiling. A run called with
 *  no spend_cap_usd stays uncapped (filed: ledger the OpenAI synthesis path, then cap every run). */
export const SPEND_CAP_CEILING_USD = 2.25;
export function clampSpendCap(requested: unknown): number | null {
  const n = typeof requested === "number" && Number.isFinite(requested) && requested > 0 ? requested : null;
  return n == null ? null : Math.min(n, SPEND_CAP_CEILING_USD);
}

export type SpendCap = {
  capUsd: number;
  companyId: string;
  /** ISO time the capped run started — the window cumulative spend is read over */
  since: string;
  // deno-lint-ignore no-explicit-any
  supabase: { from: (t: string) => any };
  refusals: Array<{ site: string; model: string; reason: string; projected_usd: number | null; spent_usd: number | null }>;
};
export function makeSpendCap(args: Omit<SpendCap, "refusals">): SpendCap {
  return { ...args, refusals: [] };
}

export class SpendCapRefused extends Error {
  readonly code = "spend_cap_refused";
}

export function projectWebSearchUsd(model: string, o: { promptChars: number; maxUses: number; maxTokens: number }): number | null {
  const p = anthropicPriceFor(model);
  if (!p) return null;
  const input = Math.ceil(o.promptChars / 4) + o.maxUses * WEB_SEARCH_INPUT_TOKENS_PER_SEARCH;
  return (input * p.input + o.maxTokens * p.output) / 1e6 + (o.maxUses * p.web_search_per_1k) / 1000;
}

export function projectOpenAIUsd(model: string, o: { promptChars: number; maxOutputTokens: number }): number | null {
  const p = openaiPriceFor(model); // signed prices only (modelPricing.ts): gpt-4.1, gpt-4.1-mini
  if (!p) return null;
  return (Math.ceil(o.promptChars / 4) * p.input + o.maxOutputTokens * p.output) / 1e6;
}

const PAID_PROVIDERS = ["anthropic", "openai", "external_openai"];

/** The window's ledgered spend: summed usd of paid rows, and how many paid rows carry no usd (cannot be computed). */
export async function ledgeredSpend(cap: SpendCap): Promise<{ usd: number; unpriced: number }> {
  const { data, error } = await cap.supabase.from("model_calls").select("provider, usd").eq("company_id", cap.companyId).gte("created_at", cap.since);
  if (error) throw new SpendCapRefused(`spend cap: the ledger could not be read (${error.message}) — refused`);
  let usd = 0, unpriced = 0;
  for (const r of (Array.isArray(data) ? data : []) as Array<{ provider: string; usd: number | string | null }>) {
    if (!PAID_PROVIDERS.includes(String(r.provider))) continue;
    if (r.usd == null) unpriced++;
    else usd += Number(r.usd);
  }
  return { usd, unpriced };
}

/** Refuse (throw SpendCapRefused, recorded on the cap) unless this paid call fits. A null cap ⇒ no-op. */
export async function assertSpendable(cap: SpendCap | null | undefined, call: { site: string; model: string; projectedUsd: number | null }): Promise<void> {
  if (!cap) return;
  const refuse = (reason: string, spent: number | null): never => {
    cap.refusals.push({ site: call.site, model: call.model, reason, projected_usd: call.projectedUsd, spent_usd: spent });
    throw new SpendCapRefused(`spend cap $${cap.capUsd.toFixed(2)}: ${call.site} (${call.model}) refused — ${reason}`);
  };
  if (call.projectedUsd == null) refuse(`model ${call.model} has no price, so its cost cannot be computed`, null);
  const spent = await ledgeredSpend(cap);
  if (spent.unpriced > 0) refuse(`${spent.unpriced} paid call(s) already ledgered without usd — the cumulative cannot be computed`, spent.usd);
  if (spent.usd + call.projectedUsd! > cap.capUsd) refuse(`ledgered $${spent.usd.toFixed(4)} + projected $${call.projectedUsd!.toFixed(4)} > cap $${cap.capUsd.toFixed(2)}`, spent.usd);
}
