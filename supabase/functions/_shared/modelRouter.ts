// Model router (operator ruling 2026-08-22) — the Deno wrapper over the pure decision core
// (src/lib/modelRouter/resolveModel.ts). It re-exports resolveModel/signalProvenance/modelStamp and
// adds the EXTERNAL provider call (OpenAI) plus bounded parallelism + 429 backoff.
//
// Each function keeps its EXISTING local call byte-for-byte (the "Local-only policy violation"
// refusal stays as defense in depth on the local branch). At the model-call site a function does:
//     const choice = resolveModel({ role, inputs });               // inputs carry provenance ONLY
//     const out = choice.provider === "external_openai"
//       ? await callOpenAIJson({ model: choice.model, system, user, ... })   // public work → OpenAI
//       : await <the existing local Ollama call>(choice.model, ...);          // anything else → local
//     stamp the verdict with modelStamp(choice).
//
// The router NEVER sees content for its decision — only the provenance of every input row. One
// non-public/unknown/NULL input forces the whole call local.

export {
  resolveModel, isPublicProvenance, signalProvenance, modelStamp,
  PUBLIC_PROVENANCES, EXTERNAL_MODEL, LOCAL_GENERATOR, LOCAL_JUDGE,
  type ModelRole, type ModelProvider, type ModelChoice,
} from "../../../src/lib/modelRouter/resolveModel.ts";

import { resolveModel as _resolveModel, type ModelProvider as _MP, type ModelRole as _MR } from "../../../src/lib/modelRouter/resolveModel.ts";

export type OpenAIUsage = { prompt_tokens: number; completion_tokens: number };

/** A judge call routed by the provenance of its inputs. Returns the raw JSON content string plus
 *  the provider/model that produced it (for verdict stamping). Injected into shared computes that
 *  forbid external imports (claimDeltaSynthesis), so the router decision is made HERE, at the edge
 *  function, and the compute only calls the injected fn. */
export type RoutedJudge = (args: {
  provenances: Array<string | null | undefined>;
  system: string;
  user: string;
}) => Promise<{ content: string; provider: _MP; model: string }>;

/** Build a routed judge. `callLocal` is the function's EXISTING local Ollama judge (kept byte-identical,
 *  incl. its "Local-only policy violation" defense). All-public inputs → external OpenAI; anything
 *  non-public/unknown/NULL → callLocal. `onUsage` accumulates external token usage for cost logging. */
export function makeRoutedJudge(opts: {
  callLocal: (model: string, system: string, user: string) => Promise<string>;
  openaiKey?: string;
  onUsage?: (u: OpenAIUsage) => void;
}): RoutedJudge {
  return async ({ provenances, system, user }) => {
    const choice = _resolveModel({ role: "judge", inputs: provenances.map((p) => ({ provenance: p })) });
    if (choice.provider === "external_openai") {
      const r = await withRetry429(() => callOpenAIJson({ model: choice.model, system, user, apiKey: opts.openaiKey }));
      opts.onUsage?.(r.usage);
      return { content: r.content, provider: choice.provider, model: choice.model };
    }
    const content = await opts.callLocal(choice.model, system, user);
    return { content, provider: choice.provider, model: choice.model };
  };
}

/** A model call routed by input provenance, for BOTH roles (deltas: qwen proposer + llama judge).
 *  Returns content + provider/model for stamping. */
export type RoutedModel = (args: {
  role: _MR;
  provenances: Array<string | null | undefined>;
  system: string;
  user: string;
}) => Promise<{ content: string; provider: _MP; model: string }>;

/** Build a role-aware routed caller. `callLocalGenerator` / `callLocalJudge` are the function's
 *  EXISTING local Ollama calls (kept byte-identical, incl. timeouts/determinism). All-public inputs
 *  → external OpenAI; anything non-public/unknown/NULL → the matching local caller. */
export function makeRoutedModel(opts: {
  callLocalGenerator: (model: string, system: string, user: string) => Promise<string>;
  callLocalJudge: (model: string, system: string, user: string) => Promise<string>;
  openaiKey?: string;
  onUsage?: (u: OpenAIUsage) => void;
}): RoutedModel {
  return async ({ role, provenances, system, user }) => {
    const choice = _resolveModel({ role, inputs: provenances.map((p) => ({ provenance: p })) });
    if (choice.provider === "external_openai") {
      const r = await withRetry429(() => callOpenAIJson({ model: choice.model, system, user, apiKey: opts.openaiKey }));
      opts.onUsage?.(r.usage);
      return { content: r.content, provider: choice.provider, model: choice.model };
    }
    const callLocal = role === "judge" ? opts.callLocalJudge : opts.callLocalGenerator;
    return { content: await callLocal(choice.model, system, user), provider: choice.provider, model: choice.model };
  };
}

/** OpenAI chat/completions with JSON output. Returns the content string + token usage (for cost
 *  logging). Loud failure (require_model discipline) — never a silent fallback. */
export async function callOpenAIJson(opts: {
  model: string;
  system: string;
  user: string;
  temperature?: number;
  timeoutMs?: number;
  apiKey?: string;
}): Promise<{ content: string; usage: OpenAIUsage }> {
  const apiKey = opts.apiKey ?? Deno.env.get("OPENAI_API_KEY") ?? "";
  if (!apiKey) throw new Error("model router: external chosen but OPENAI_API_KEY is missing");
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 60_000);
  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: opts.model,
        temperature: opts.temperature ?? 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: opts.system },
          { role: "user", content: opts.user },
        ],
      }),
      signal: ctrl.signal,
    });
    if (resp.status === 429) {
      const e = new Error(`openai 429 rate_limited (${opts.model})`) as Error & { status?: number };
      e.status = 429;
      throw e;
    }
    if (!resp.ok) throw new Error(`openai ${opts.model} ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
    const data = await resp.json();
    const content = String(data?.choices?.[0]?.message?.content ?? "");
    if (!content) throw new Error(`openai ${opts.model} returned empty content`);
    const u = data?.usage ?? {};
    return { content, usage: { prompt_tokens: Number(u.prompt_tokens ?? 0), completion_tokens: Number(u.completion_tokens ?? 0) } };
  } finally {
    clearTimeout(t);
  }
}

/** 429-aware retry (exponential backoff with jitter). Non-429 errors propagate immediately. */
export async function withRetry429<T>(fn: () => Promise<T>, tries = 5): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < tries; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if ((e as { status?: number })?.status !== 429) throw e;
      const backoff = Math.min(30_000, 500 * 2 ** attempt) + Math.floor(Math.random() * 250);
      await new Promise((r) => setTimeout(r, backoff));
    }
  }
  throw lastErr;
}

/** Run `fn` over `items` with at most `limit` concurrent — bounded parallelism for the external
 *  branch (local judge stays sequential, single-GPU). Order of results matches input order. */
export async function mapWithConcurrency<A, B>(items: readonly A[], limit: number, fn: (a: A, i: number) => Promise<B>): Promise<B[]> {
  const out: B[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

/** GPT-4.1-mini pricing (USD per 1M tokens) — for per-run cost logging into the fill ledger. */
export const OPENAI_PRICE_PER_MTOK = { input: 0.40, output: 1.60 } as const;
export function usdCost(usage: OpenAIUsage): number {
  return (usage.prompt_tokens / 1e6) * OPENAI_PRICE_PER_MTOK.input + (usage.completion_tokens / 1e6) * OPENAI_PRICE_PER_MTOK.output;
}
