// ── Synthesis JSON extraction (pure) — shared by public-baseline and its regression fixtures ────────
//
// The claude_websearch response is a sequence of content blocks (server_tool_use / web_search_tool_result
// / text). The JSON answer is in the FINAL text block, after the tool calls. This module isolates the two
// pure decisions so ONE implementation is exercised by both the edge function and the vitest guard:
//
//   selectFinalText          — pick the last text block's text (the answer follows the tool blocks).
//   parseJsonObjectDefensive — fence-strip → JSON.parse → first{/last} slice. NO repair (explicitly
//                              rejected 2026-09-01): a malformed object returns null so the caller fails
//                              loud and persists the raw, rather than silently reconstructing substance.
//   blockCensus              — a compact forensic summary persisted on parse failure.

/* eslint-disable @typescript-eslint/no-explicit-any */

/** The FINAL text block's text (empty string if the response carries no text block). */
export function selectFinalText(blocks: unknown): string {
  const arr = Array.isArray(blocks) ? blocks : [];
  const textBlocks = arr.filter((b: any) => b?.type === "text" && typeof b?.text === "string");
  return textBlocks.length > 0 ? String(textBlocks[textBlocks.length - 1].text) : "";
}

/** Defensive JSON-object parse. Returns the object, or null on any failure (never throws, never repairs). */
export function parseJsonObjectDefensive(text: string): Record<string, unknown> | null {
  if (!text) return null;
  let t = String(text).trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  try {
    const o = JSON.parse(t);
    if (o && typeof o === "object") return o as Record<string, unknown>;
  } catch (_) { /* fall through */ }
  const first = t.indexOf("{");
  const last = t.lastIndexOf("}");
  if (first >= 0 && last > first) {
    try {
      const o = JSON.parse(t.slice(first, last + 1));
      if (o && typeof o === "object") return o as Record<string, unknown>;
    } catch (_) { /* give up */ }
  }
  return null;
}

export type BlockCensus = {
  total_blocks: number;
  block_types: string[];
  text_block_count: number;
  text_block_lengths: number[];
};

/** Compact census of the response's content blocks — persisted alongside the raw on a parse failure. */
export function blockCensus(blocks: unknown): BlockCensus {
  const arr = Array.isArray(blocks) ? blocks : [];
  const textBlocks = arr.filter((b: any) => b?.type === "text" && typeof b?.text === "string");
  return {
    total_blocks: arr.length,
    block_types: arr.map((b: any) => String(b?.type ?? "")),
    text_block_count: textBlocks.length,
    text_block_lengths: textBlocks.map((b: any) => String(b?.text ?? "").length),
  };
}

// ── Parse-failure persistence + the ONE transport retry (probe 2026-09-01, operator-signed) ─────────

/** One synthesis call's outcome. `parsed` null ⇒ the final block failed parse. */
export type SynthAttempt = {
  parsed: Record<string, unknown> | null;
  finalText: string;
  blocks: unknown;
  stopReason: string;
  usage: unknown;
  data: unknown; // the raw response, for downstream normalization on success
};

export type ParseFailurePersistArgs = {
  companyId: string; ledgerRunId: string | null; attemptN: number; model: string;
  stopReason: string; blocks: unknown; rawFinalText: string; usage: unknown;
};

/** Persist ONE synthesis parse failure to baseline_synthesis_parse_failures, keyed to the failing
 *  ledger run (SELECT-queryable afterwards). Best-effort: a persist error is logged, NEVER allowed to
 *  mask the real synthesis error. Injected supabase keeps this unit-testable with a fake sink. */
export async function persistSynthesisParseFailure(
  supabase: { from: (t: string) => any },
  args: ParseFailurePersistArgs,
): Promise<void> {
  try {
    const { error } = await supabase.from("baseline_synthesis_parse_failures").insert({
      company_id: args.companyId,
      ledger_run_id: args.ledgerRunId,
      attempt_n: args.attemptN,
      model: args.model,
      stop_reason: args.stopReason,
      block_census: blockCensus(args.blocks),
      usage: args.usage ?? null,
      raw_final_text: args.rawFinalText,
    });
    if (error) console.error("[baseline] parse-failure persist error:", error.message);
    else console.log(`[baseline] persisted synthesis parse failure (attempt ${args.attemptN}, ledger ${args.ledgerRunId ?? "none"}, finalText.len=${args.rawFinalText.length})`);
  } catch (e) {
    console.error("[baseline] parse-failure persist threw:", String((e as any)?.message ?? e));
  }
}

/** Run the synthesis with ONE transport-level retry on PARSE failure only. `doAttempt` performs one
 *  call+parse and may throw (HTTP / max_tokens) — those propagate, never retried here. On parse-null:
 *  `persistFailure` captures the raw, then it retries once; a second parse-null fails loud (both raws
 *  persisted). NO JSON repair (explicitly rejected). Not the banned retry-until-pass — it re-issues the
 *  SAME call for a stochastic malformed emission, and never touches a judge/gate rejection. */
export async function runSynthesisWithParseRetry(cfg: {
  maxAttempts: number;
  doAttempt: (attempt: number) => Promise<SynthAttempt>;
  persistFailure: (attemptN: number, attempt: SynthAttempt) => Promise<void>;
}): Promise<{ parsed: Record<string, unknown>; data: unknown }> {
  let last: SynthAttempt | null = null;
  for (let attempt = 1; attempt <= cfg.maxAttempts; attempt++) {
    last = await cfg.doAttempt(attempt);
    if (last.parsed) return { parsed: last.parsed, data: last.data };
    await cfg.persistFailure(attempt, last);
    if (attempt >= cfg.maxAttempts) {
      const n = Array.isArray(last.blocks) ? last.blocks.length : 0;
      throw new Error(`Anthropic web-search: could not parse JSON from final text block (len=${last.finalText.length}, blocks=${n})`);
    }
    console.log(`[baseline] claude synthesis parse failure on attempt ${attempt} — persisted raw, retrying once`);
  }
  throw new Error("Anthropic web-search: no synthesis attempt ran"); // unreachable for maxAttempts >= 1
}
