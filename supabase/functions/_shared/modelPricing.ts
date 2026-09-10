// MODEL PRICING (Gate 3, 2026-09-10) — the price table, and nothing else.
//
// Extracted from modelRouter.ts so BOTH the edge router and the cost recorder can share one source
// of truth without dragging Deno globals into the browser type graph: modelRouter reads Deno.env,
// and the admin page's tests import the recorder, so a recorder that imported the router made
// `Deno` unresolvable under tsc. This module is pure — no imports, no globals.
export type OpenAIUsage = { prompt_tokens: number; completion_tokens: number };

/** GPT-4.1-mini pricing, USD per 1M tokens. */
export const OPENAI_PRICE_PER_MTOK = { input: 0.40, output: 1.60 } as const;

export function usdCost(usage: OpenAIUsage): number {
  return (usage.prompt_tokens / 1e6) * OPENAI_PRICE_PER_MTOK.input
    + (usage.completion_tokens / 1e6) * OPENAI_PRICE_PER_MTOK.output;
}
