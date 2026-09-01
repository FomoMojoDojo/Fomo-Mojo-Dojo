// Gate-C probe follow-up (2026-09-01) — the parse-failure PERSISTENCE + one-retry orchestration, tested
// mechanically with a fake supabase sink and injected attempts (no live API). Proves: the artifact row
// lands with the raw text; the retry fires exactly once; both attempts' raws persist on a double failure;
// and a thrown attempt (HTTP / max_tokens) is NOT retried and NOT persisted as a parse failure.
import { describe, it, expect, vi } from "vitest";
import {
  persistSynthesisParseFailure,
  runSynthesisWithParseRetry,
  type SynthAttempt,
} from "../../../supabase/functions/_shared/synthesisJsonExtract.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fakeSupabase(): { inserts: Record<string, any[]>; from: (t: string) => any } {
  const inserts: Record<string, any[]> = {}; // eslint-disable-line @typescript-eslint/no-explicit-any
  return {
    inserts,
    from(table: string) {
      return {
        insert(row: any) { (inserts[table] ??= []).push(row); return Promise.resolve({ error: null }); }, // eslint-disable-line @typescript-eslint/no-explicit-any
      };
    },
  };
}

const attempt = (over: Partial<SynthAttempt>): SynthAttempt => ({
  parsed: null, finalText: "", blocks: [], stopReason: "end_turn", usage: null, data: null, ...over,
});

describe("persistSynthesisParseFailure — the artifact row lands with the raw text", () => {
  it("inserts one row carrying company_id, ledger_run_id, attempt_n, raw_final_text, block_census", async () => {
    const sb = fakeSupabase();
    const RAW = '{"category_archetype":"x" MALFORMED no closing';
    await persistSynthesisParseFailure(sb, {
      companyId: "co-1", ledgerRunId: "ledger-9", attemptN: 1, model: "claude-sonnet-4-6",
      stopReason: "end_turn", blocks: [{ type: "server_tool_use" }, { type: "text", text: RAW }],
      rawFinalText: RAW, usage: { output_tokens: 5 },
    });
    const rows = sb.inserts["baseline_synthesis_parse_failures"];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      company_id: "co-1", ledger_run_id: "ledger-9", attempt_n: 1, model: "claude-sonnet-4-6",
      stop_reason: "end_turn", raw_final_text: RAW,
    });
    expect(rows[0].block_census).toMatchObject({ total_blocks: 2, text_block_count: 1, text_block_lengths: [RAW.length] });
  });

  it("a persist error is swallowed (never masks the real synthesis error)", async () => {
    const throwingSb = { from: () => ({ insert: () => Promise.resolve({ error: { message: "boom" } }) }) };
    await expect(persistSynthesisParseFailure(throwingSb, {
      companyId: "c", ledgerRunId: null, attemptN: 1, model: "m", stopReason: "end_turn",
      blocks: [], rawFinalText: "x", usage: null,
    })).resolves.toBeUndefined();
  });
});

describe("runSynthesisWithParseRetry — one retry on parse failure; both raws persisted", () => {
  it("parse fails then succeeds → retry fires ONCE, persist called ONCE with the failing raw, returns parsed", async () => {
    const persisted: Array<{ attemptN: number; raw: string }> = [];
    const RAW1 = "unparseable-attempt-1";
    const doAttempt = vi.fn(async (n: number): Promise<SynthAttempt> =>
      n === 1
        ? attempt({ parsed: null, finalText: RAW1, blocks: [{ type: "text", text: RAW1 }] })
        : attempt({ parsed: { category_archetype: "x" }, finalText: '{"category_archetype":"x"}', data: { ok: true } }));
    const out = await runSynthesisWithParseRetry({
      maxAttempts: 2,
      doAttempt,
      persistFailure: async (attemptN, a) => { persisted.push({ attemptN, raw: a.finalText }); },
    });
    expect(doAttempt).toHaveBeenCalledTimes(2);            // the retry fired exactly once
    expect(persisted).toEqual([{ attemptN: 1, raw: RAW1 }]); // exactly the first (failing) raw persisted
    expect(out.parsed).toEqual({ category_archetype: "x" });
    expect(out.data).toEqual({ ok: true });
  });

  it("parse fails twice → BOTH persisted, then throws the fail-loud error (same as today)", async () => {
    const persisted: number[] = [];
    const doAttempt = vi.fn(async (): Promise<SynthAttempt> =>
      attempt({ parsed: null, finalText: "still-bad", blocks: [1, 2, 3] }));
    await expect(runSynthesisWithParseRetry({
      maxAttempts: 2, doAttempt,
      persistFailure: async (attemptN) => { persisted.push(attemptN); },
    })).rejects.toThrow(/could not parse JSON from final text block/);
    expect(doAttempt).toHaveBeenCalledTimes(2);
    expect(persisted).toEqual([1, 2]); // both attempts' raws persisted before the loud failure
  });

  it("a thrown attempt (HTTP / max_tokens) propagates — NOT retried, NOT persisted as a parse failure", async () => {
    const doAttempt = vi.fn(async () => { throw new Error("Anthropic web-search: output hit the max_tokens cap"); });
    const persistFailure = vi.fn(async () => {});
    await expect(runSynthesisWithParseRetry({ maxAttempts: 2, doAttempt, persistFailure })).rejects.toThrow(/max_tokens cap/);
    expect(doAttempt).toHaveBeenCalledTimes(1);   // NOT retried
    expect(persistFailure).not.toHaveBeenCalled(); // a max_tokens error is not a parse failure
  });
});
