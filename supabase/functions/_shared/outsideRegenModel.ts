// R4 (operator ruling, 2026-10-18) — THE REGEN PATH'S MODEL STEP, LEDGERED.
//
// extract-outside-evidence made two gpt-4.1-mini calls per page (generator, judge) through a
// hand-rolled fetch that never read data.usage; the registry carried the gap as
// `captured: false` and eight r3 runs (36 admitted rows) left zero model_calls rows. b3 regenerates
// ~293 URLs, so its first step is a ledger that cannot be skipped.
//
// The step is factored here with TWO seams the function fills and a test can fake:
//   transport — one attempt against one model, returning content + usage (production: callOpenAIJson)
//   ledger    — one model_calls row per attempt (production: recordModelCall)
// RULES (the same shape generate-public-read uses at index.ts:488):
//   * every attempt is ledgered — a failed attempt lands with NULL usage (an honest gap, never 0);
//   * the row is written BEFORE the answer is parsed — a refused answer still cost;
//   * attempt 1 is the primary model, attempt 2 the fallback; the model loop is otherwise unchanged;
//   * promptSha is sha256Hex(`${system}\n\n${user}`) — byte-identical to the generator's hash shape, so
//     the same prompt hashes the same way at every site.
import { sha256Hex } from "./contentIdentity.ts";
import { type ModelCallRecord, openaiRecord } from "./recordModelCall.ts";
import type { OpenAIUsage } from "./modelPricing.ts";

export type RegenRole = "generator" | "judge";
export const REGEN_CALL_SITE = "extract-outside-evidence";
/** The model_calls.call_site for a role — the registry's site id, suffixed like generate-public-read's. */
export function regenCallSite(role: RegenRole): string {
  return `${REGEN_CALL_SITE}:${role}`;
}

/** One attempt against one model. Throws on a non-ok answer (the loop moves to the next model). */
export type RegenTransport = (args: { model: string; system: string; user: string }) => Promise<{ content: string; usage: OpenAIUsage | null }>;

export type RegenLedgerEntry = {
  role: RegenRole;
  callSite: string;
  usage: ModelCallRecord;
  /** 1 for the primary model, 2 for the fallback. */
  attempt: number;
  promptSha: string;
};
/** Persist one attempt. Resolves false when the write failed (recordModelCall never throws). */
export type RegenLedger = (entry: RegenLedgerEntry) => Promise<boolean>;

/** The per-run tally the function writes into its integrity row (excluded_by_rule.model_calls). */
export type RegenTally = { generator: number; judge: number; usd: number; ledger_failed: number };
export function emptyTally(): RegenTally {
  return { generator: 0, judge: 0, usd: 0, ledger_failed: 0 };
}
export function addToTally(t: RegenTally, e: RegenLedgerEntry, written: boolean): RegenTally {
  t[e.role] += 1;
  t.usd += e.usage.usd ?? 0;
  if (!written) t.ledger_failed += 1;
  return t;
}
/** Wrap a ledger so every entry it writes is also counted. */
export function tallyingLedger(write: RegenLedger, tally: RegenTally): RegenLedger {
  return async (e) => {
    const ok = await write(e);
    addToTally(tally, e, ok);
    return ok;
  };
}

export type RegenCallArgs = {
  system: string;
  user: string;
  /** [primary, fallback, …] — tried in order; attempt numbers follow the order. */
  models: readonly string[];
  transport: RegenTransport;
  ledger: RegenLedger;
};

/** THE model step: try each model in order, ledger EVERY attempt before parsing, return the first JSON answer. */
export async function callRegenModel(args: RegenCallArgs & { role: RegenRole }): Promise<{ json: Record<string, unknown>; model: string; attempt: number }> {
  const promptSha = await sha256Hex(`${args.system}\n\n${args.user}`);
  const callSite = regenCallSite(args.role);
  let lastErr: unknown = null;
  let attempt = 0;
  for (const model of args.models) {
    attempt += 1;
    let r: { content: string; usage: OpenAIUsage | null };
    try {
      r = await args.transport({ model, system: args.system, user: args.user });
    } catch (e) {
      // The attempt was made; what it cost is unknown. Nulls are the honest value — never a 0.
      await args.ledger({ role: args.role, callSite, usage: openaiRecord(model, null), attempt, promptSha });
      lastErr = e;
      continue;
    }
    // LEDGER BEFORE PARSE: the call was billed whether or not its answer is usable.
    await args.ledger({ role: args.role, callSite, usage: openaiRecord(model, r.usage), attempt, promptSha });
    const m = r.content.match(/\{[\s\S]*\}/);
    if (!m) { lastErr = new Error(`${model} returned no JSON`); continue; }
    try {
      return { json: JSON.parse(m[0]) as Record<string, unknown>, model, attempt };
    } catch (e) {
      lastErr = e;
      continue;
    }
  }
  throw lastErr ?? new Error("all models failed");
}

/** The generator call of one page (candidates lifted from the snapshot). */
export function regenGenerate(a: RegenCallArgs) {
  return callRegenModel({ ...a, role: "generator" });
}
/** The judge call of one page (keep / drop per candidate). */
export function regenJudge(a: RegenCallArgs) {
  return callRegenModel({ ...a, role: "judge" });
}
