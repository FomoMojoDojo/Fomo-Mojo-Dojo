// F3′ (operator ruling, 2026-11-14): council-review runs on the LOCAL model only — there is no outside lane.
//
// What it replaces. council-review carried its own OpenAI client and sent every company's council context
// (job steps, opportunities, routes, market definitions — client-declared markets included) to
// OpenAI unconditionally (SP-350 §1 site 9). This module is the local lane that replaces it:
//   • the call goes ONLY to a local Ollama base URL (isLocalOllamaUrl refuses anything else);
//   • nothing here reads an outside key;
//   • the framework guidance is ONLY the active engagement phase's frameworks — all five briefs were
//     51,231 chars (~12.8k tokens) whatever the phase, which put the strategy council past a 32k context;
//   • every attempt reports Ollama's own token counts (prompt_eval_count / eval_count) to onUsage, so the
//     caller writes one local model_calls row per call.
import { buildFrameworkBrief, getFrameworkRoutingPlan, type FrameworkArtifact } from "./frameworkLibrary.ts";

export const COUNCIL_LOCAL_DEFAULT_MODEL = "qwen2.5:14b-instruct";
/** qwen2.5:14b-instruct's native window. The trimmed strategy council is ≤ ~26k tokens in + 2.2k out. */
export const COUNCIL_NUM_CTX = 32_768;
/** One attempt may run this long; the whole run must finish inside the edge worker's 400 s wall clock. */
export const COUNCIL_ATTEMPT_TIMEOUT_MS = 330_000;
export const COUNCIL_RUN_BUDGET_MS = 360_000;
export const COUNCIL_FRAMEWORK_ARTIFACTS: readonly FrameworkArtifact[] = ["inputs", "journeys", "positioning", "opportunities", "routes"];

/** The local-only address rule, as the generate-step-* functions apply it. */
export function isLocalOllamaUrl(u: string): boolean {
  try {
    const h = new URL(u).hostname;
    return h === "localhost" || h === "127.0.0.1" || h === "host.docker.internal" || h.endsWith(".local");
  } catch {
    return false;
  }
}

/** The framework guidance for the ACTIVE phase only: each artifact's routing plan filtered to the phase's frameworks. */
export function buildActivePhaseFrameworkGuidance(activeFrameworks: readonly string[]): string {
  const active = new Set(activeFrameworks);
  return COUNCIL_FRAMEWORK_ARTIFACTS
    .map((a) => buildFrameworkBrief(a, getFrameworkRoutingPlan(a).filter((f) => active.has(f.key))))
    .filter((s) => s.trim().length > 0)
    .join("\n\n");
}

/** The council answer's shape — the schema the OpenAI client sent, now passed to Ollama's structured output. */
export const COUNCIL_RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: true,
  required: ["summary", "recommendations"],
  properties: {
    summary: { type: "string" },
    panel_discussion: { anyOf: [{ type: "string" }, { type: "array", items: { type: "string" } }, { type: "null" }] },
    recommendations: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: true,
        required: ["title", "recommendation"],
        properties: {
          title: { type: "string" },
          recommendation: { type: "string" },
          rationale: { type: "string" },
          category: { type: "string" },
          priority: { type: "string" },
          confidence: { type: "number" },
          source_basis: { type: "string" },
          references: { type: "array", items: { type: "string" } },
        },
      },
    },
  },
} as const;

export type LocalUsage = { prompt_tokens: number | null; completion_tokens: number | null };

export const COUNCIL_RETRY_NOTE =
  "Your previous response was truncated or invalid. Return one complete JSON object that exactly matches the schema.";

/**
 * One council generation on the local model (Ollama native /api/chat, structured output). Retries ONCE with a
 * ×1.7 output budget when the answer is cut or not JSON, and only while the run budget allows a fresh attempt.
 * Throws on a non-local address, an HTTP error, a timeout, or a second unusable answer — never falls back to an
 * outside model.
 */
export async function callLocalCouncilJSON(opts: {
  ollamaUrl: string;
  model: string;
  systemText: string;
  userText: string;
  maxOutputTokens: number;
  temperature: number;
  parse: (text: string) => Record<string, unknown> | null;
  numCtx?: number;
  attemptTimeoutMs?: number;
  /** Epoch ms after which no new attempt starts (the caller's wall-clock budget). */
  deadlineMs?: number;
  onUsage?: (model: string, usage: LocalUsage) => void | Promise<void>;
  fetchImpl?: typeof fetch;
  now?: () => number;
}): Promise<Record<string, unknown>> {
  if (!isLocalOllamaUrl(opts.ollamaUrl)) throw new Error(`local-only: refusing non-local model address ${opts.ollamaUrl}`);
  const doFetch = opts.fetchImpl ?? fetch;
  const now = opts.now ?? Date.now;
  const base = opts.ollamaUrl.replace(/\/v1\/?$/, "").replace(/\/$/, "");
  const budgets = [opts.maxOutputTokens, Math.round(opts.maxOutputTokens * 1.7)];
  for (let attempt = 0; attempt < budgets.length; attempt++) {
    const left = opts.deadlineMs != null ? opts.deadlineMs - now() : Infinity;
    if (attempt > 0 && left < 30_000) throw new Error("local council model: no time left for a retry inside the run budget");
    const timeoutMs = Math.max(1_000, Math.min(opts.attemptTimeoutMs ?? COUNCIL_ATTEMPT_TIMEOUT_MS, left));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let data: { message?: { content?: unknown }; prompt_eval_count?: unknown; eval_count?: unknown; done_reason?: unknown };
    try {
      const res = await doFetch(`${base}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          model: opts.model,
          stream: false,
          format: COUNCIL_RESPONSE_SCHEMA,
          options: { num_ctx: opts.numCtx ?? COUNCIL_NUM_CTX, num_predict: budgets[attempt], temperature: opts.temperature },
          messages: [
            { role: "system", content: attempt === 0 ? opts.systemText : `${opts.systemText}\n\n${COUNCIL_RETRY_NOTE}` },
            { role: "user", content: opts.userText },
          ],
        }),
      });
      if (!res.ok) throw new Error(`local council model ${opts.model} HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
      data = await res.json();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.toLowerCase().includes("abort")) throw new Error(`local council model timed out after ${Math.round(timeoutMs / 1000)}s`);
      throw e;
    } finally {
      clearTimeout(timer);
    }
    // ledger BEFORE parsing — the call ran whether or not its JSON is usable
    if (opts.onUsage) {
      const pt = Number(data?.prompt_eval_count), ct = Number(data?.eval_count);
      try {
        await opts.onUsage(opts.model, { prompt_tokens: Number.isFinite(pt) ? pt : null, completion_tokens: Number.isFinite(ct) ? ct : null });
      } catch (_e) { /* observability must not fail the call it measures */ }
    }
    const text = String(data?.message?.content ?? "");
    const parsed = opts.parse(text);
    if (parsed) return parsed;
    const cut = data?.done_reason === "length" || /unterminated|unexpected end/i.test(text) || !text.trim().endsWith("}");
    if (attempt < budgets.length - 1 && cut) continue;
    throw new Error("local council model returned non-JSON output");
  }
  throw new Error("local council JSON generation failed after retries");
}
