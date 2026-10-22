// MODEL PRICING (Gate 3, 2026-09-10) — the price table, and nothing else.
//
// Extracted from modelRouter.ts so BOTH the edge router and the cost recorder can share one source
// of truth without dragging Deno globals into the browser type graph: modelRouter reads Deno.env,
// and the admin page's tests import the recorder, so a recorder that imported the router made
// `Deno` unresolvable under tsc. This module is pure — no imports, no globals.
export type OpenAIUsage = { prompt_tokens: number; completion_tokens: number };

/** GPT-4.1-mini pricing, USD per 1M tokens. */
export const OPENAI_PRICE_PER_MTOK = { input: 0.40, output: 1.60 } as const;

// ── OPENAI BY MODEL (re-run brief ruling 3, 2026-10-21) ─────────────────────────────────────────────────────────────────
// Source: OpenAI's model page for gpt-4.1, read 2026-10-21 — $2.00/MTok input, $0.50/MTok cached input, $8.00/MTok output.
// gpt-4.1-mini is the Gate 3 table above (OPENAI_PRICE_PER_MTOK). Keyed by EXACT model id; a model not named has no
// price here (a capped run refuses it before the call). Cached input is not separated in the usage we read, so a call is
// priced at the full input rate — an over-estimate, never an under-estimate.
export type OpenAIPrice = { input: number; cached_input: number | null; output: number };
export const OPENAI_PRICE_BY_MODEL: Readonly<Record<string, OpenAIPrice>> = {
  "gpt-4.1": { input: 2.00, cached_input: 0.50, output: 8.00 },
  "gpt-4.1-mini": { input: OPENAI_PRICE_PER_MTOK.input, cached_input: null, output: OPENAI_PRICE_PER_MTOK.output },
};
export function openaiPriceFor(model: string): OpenAIPrice | null {
  return Object.prototype.hasOwnProperty.call(OPENAI_PRICE_BY_MODEL, model) ? OPENAI_PRICE_BY_MODEL[model] : null;
}

export function usdCost(usage: OpenAIUsage): number {
  return (usage.prompt_tokens / 1e6) * OPENAI_PRICE_PER_MTOK.input
    + (usage.completion_tokens / 1e6) * OPENAI_PRICE_PER_MTOK.output;
}

// ── ANTHROPIC (E3 brief ruling 1, 2026-10-21) — the Claude web_search calls' price table ────────────────────────────
// Source: Anthropic pricing page, platform.claude.com/docs/en/about-claude/pricing, read 2026-10-21 — Sonnet 4.6
// $3/MTok in, $15/MTok out, 5m cache write 1.25x, cache read 0.1x; web search $10 per 1,000 (errored searches not
// billed, so the count priced is usage.server_tool_use.web_search_requests, the billed count). Keyed by EXACT model id:
// an unknown model has no price, its usd is NULL (an honest gap), and a capped run refuses the call before it is made.
export type AnthropicPrice = { input: number; output: number; cache_write_5m: number; cache_read: number; web_search_per_1k: number };
export const ANTHROPIC_PRICE_PER_MTOK: Readonly<Record<string, AnthropicPrice>> = {
  "claude-sonnet-4-6": { input: 3, output: 15, cache_write_5m: 3 * 1.25, cache_read: 3 * 0.1, web_search_per_1k: 10 },
};
/** The model's price, or null when the table does not name it (exact id — no family guessing). */
export function anthropicPriceFor(model: string): AnthropicPrice | null {
  return Object.prototype.hasOwnProperty.call(ANTHROPIC_PRICE_PER_MTOK, model) ? ANTHROPIC_PRICE_PER_MTOK[model] : null;
}
/** The Messages API usage block (the fields priced). */
export type AnthropicUsage = {
  input_tokens?: number | null; output_tokens?: number | null;
  cache_creation_input_tokens?: number | null; cache_read_input_tokens?: number | null;
  server_tool_use?: { web_search_requests?: number | null } | null;
};
const n0 = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
/** USD for one call: tokens (input, 5m cache write, cache read, output) + billed searches. null when the model has no
 *  price or the call returned no usage. */
export function anthropicUsd(model: string, usage: AnthropicUsage | null | undefined): number | null {
  const p = anthropicPriceFor(model);
  if (!p || !usage) return null;
  return (n0(usage.input_tokens) * p.input + n0(usage.cache_creation_input_tokens) * p.cache_write_5m
    + n0(usage.cache_read_input_tokens) * p.cache_read + n0(usage.output_tokens) * p.output) / 1e6
    + (n0(usage.server_tool_use?.web_search_requests) * p.web_search_per_1k) / 1000;
}
