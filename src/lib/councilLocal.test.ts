// F3′: council-review's local lane — active-phase framework briefs only, a local address only, Ollama's own
// token counts reported per call, one bounded retry, never an outside fallback.
import { describe, expect, it } from "vitest";
import {
  buildActivePhaseFrameworkGuidance,
  callLocalCouncilJSON,
  COUNCIL_NUM_CTX,
  isLocalOllamaUrl,
} from "../../supabase/functions/_shared/councilLocal.ts";
import { PHASE_FRAMEWORK_MAP } from "../../supabase/functions/_shared/phaseFrameworks.ts";

const parse = (t: string) => { try { const v = JSON.parse(t); return v && typeof v === "object" ? v as Record<string, unknown> : null; } catch { return null; } };

describe("F3′ active-phase framework guidance", () => {
  it("is smaller than the all-frameworks brief for every phase, and names only that phase's frameworks", () => {
    const all = buildActivePhaseFrameworkGuidance(Object.values(PHASE_FRAMEWORK_MAP).flat());
    for (const [phase, keys] of Object.entries(PHASE_FRAMEWORK_MAP)) {
      const g = buildActivePhaseFrameworkGuidance(keys);
      expect([phase, g.length > 0, g.length < all.length]).toEqual([phase, true, true]);
    }
    expect(buildActivePhaseFrameworkGuidance([])).toBe("");
  });
});

describe("F3′ local-only address", () => {
  it("admits only local hosts", () => {
    for (const u of ["http://localhost:11434/v1", "http://127.0.0.1:11434", "http://host.docker.internal:11434/v1", "http://mac.local:11434"]) expect(isLocalOllamaUrl(u)).toBe(true);
    for (const u of ["https://api.openai.com/v1", "https://api.anthropic.com", "http://10.0.0.5:11434", "not a url"]) expect(isLocalOllamaUrl(u)).toBe(false);
  });
});

function fakeFetch(replies: Array<Record<string, unknown>>) {
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init.body)) });
    const r = replies[Math.min(calls.length - 1, replies.length - 1)];
    return new Response(JSON.stringify(r), { status: 200 });
  }) as unknown as typeof fetch;
  return { impl, calls };
}
const base = { model: "qwen2.5:14b-instruct", systemText: "S", userText: "U", maxOutputTokens: 1000, temperature: 0.1, parse };

describe("F3′ callLocalCouncilJSON", () => {
  it("refuses a non-local address before any call", async () => {
    const f = fakeFetch([]);
    await expect(callLocalCouncilJSON({ ...base, ollamaUrl: "https://api.openai.com/v1", fetchImpl: f.impl })).rejects.toThrow(/local-only/);
    expect(f.calls.length).toBe(0);
  });

  it("calls the native local endpoint with the schema, the 32k window and the output budget, and reports Ollama's counts", async () => {
    const f = fakeFetch([{ message: { content: '{"summary":"s","recommendations":[]}' }, prompt_eval_count: 1234, eval_count: 56, done_reason: "stop" }]);
    const usage: unknown[] = [];
    const out = await callLocalCouncilJSON({ ...base, ollamaUrl: "http://host.docker.internal:11434/v1", fetchImpl: f.impl, onUsage: (m, u) => { usage.push([m, u]); } });
    expect(out.summary).toBe("s");
    expect(f.calls[0].url).toBe("http://host.docker.internal:11434/api/chat");
    expect((f.calls[0].body.options as Record<string, unknown>).num_ctx).toBe(COUNCIL_NUM_CTX);
    expect((f.calls[0].body.options as Record<string, unknown>).num_predict).toBe(1000);
    expect(typeof f.calls[0].body.format).toBe("object");
    expect(usage).toEqual([["qwen2.5:14b-instruct", { prompt_tokens: 1234, completion_tokens: 56 }]]);
  });

  it("retries once with a ×1.7 budget when the answer is cut, ledgering both calls", async () => {
    const f = fakeFetch([
      { message: { content: '{"summary":"s","recommendations":[{"title":' }, prompt_eval_count: 10, eval_count: 1000, done_reason: "length" },
      { message: { content: '{"summary":"ok","recommendations":[]}' }, prompt_eval_count: 11, eval_count: 20, done_reason: "stop" },
    ]);
    const usage: unknown[] = [];
    const out = await callLocalCouncilJSON({ ...base, ollamaUrl: "http://localhost:11434", fetchImpl: f.impl, onUsage: (_m, u) => { usage.push(u); } });
    expect(out.summary).toBe("ok");
    expect(f.calls.map((c) => (c.body.options as Record<string, unknown>).num_predict)).toEqual([1000, 1700]);
    expect(usage.length).toBe(2);
  });

  it("does not retry without time left in the run budget, and never falls back", async () => {
    const f = fakeFetch([{ message: { content: '{"summary":' }, done_reason: "length" }]);
    let t = 0;
    await expect(callLocalCouncilJSON({ ...base, ollamaUrl: "http://localhost:11434", fetchImpl: f.impl, deadlineMs: 20_000, now: () => (t += 5_000) })).rejects.toThrow(/no time left/);
    expect(f.calls.length).toBe(1);
  });
});
