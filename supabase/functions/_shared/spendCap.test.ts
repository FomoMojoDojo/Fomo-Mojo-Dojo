// Spend cap (2026-10-21): before every paid call on a capped run — refuse when the cost cannot be computed, when the
// window holds a paid row without usd, or when ledgered + projected > cap. Local calls are never checked.
import { assert, assertAlmostEquals, assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { assertSpendable, makeSpendCap, projectOpenAIUsd, projectWebSearchUsd, SpendCapRefused } from "./spendCap.ts";
import { defaultBeatsRoutedModel } from "./findingBeats.ts";

const ledger = (rows: Array<{ provider: string; usd: number | null }>) => ({ from: () => ({ select: () => ({ eq: () => ({ gte: () => Promise.resolve({ data: rows, error: null }) }) }) }) });
const cap = (rows: Array<{ provider: string; usd: number | null }>, capUsd = 1.5) => makeSpendCap({ capUsd, companyId: "co", since: "2026-10-21T00:00:00Z", supabase: ledger(rows) });

Deno.test("projection: web_search = prompt/4 + uses×10k input, max_tokens output, uses searches; gpt-4.1-mini only for OpenAI", () => {
  // 4000 chars → 1000 + 12×10000 = 121000 in × $3 = 0.363; 32000 × $15 = 0.48; 12 × $0.01 = 0.12 → 0.963
  assertAlmostEquals(projectWebSearchUsd("claude-sonnet-4-6", { promptChars: 4000, maxUses: 12, maxTokens: 32000 })!, 0.963, 1e-9);
  assertEquals(projectWebSearchUsd("claude-unknown", { promptChars: 1, maxUses: 1, maxTokens: 1 }), null);
  assert(projectOpenAIUsd("gpt-4.1-mini", { promptChars: 4000, maxOutputTokens: 4096 })! > 0);
  assertEquals(projectOpenAIUsd("gpt-4.1", { promptChars: 4000, maxOutputTokens: 4096 }), null, "no signed gpt-4.1 price");
});

Deno.test("refusals: unpriced, an unpriced paid row in the window, over the cap; fits ⇒ passes; local rows never count", async () => {
  const c1 = cap([]);
  await assertRejects(() => assertSpendable(c1, { site: "s", model: "gpt-4.1", projectedUsd: null }), SpendCapRefused, "cannot be computed");
  await assertRejects(() => assertSpendable(cap([{ provider: "anthropic", usd: null }]), { site: "s", model: "m", projectedUsd: 0.1 }), SpendCapRefused, "without usd");
  await assertRejects(() => assertSpendable(cap([{ provider: "anthropic", usd: 0.9 }]), { site: "s", model: "m", projectedUsd: 0.7 }), SpendCapRefused, "> cap");
  await assertSpendable(cap([{ provider: "anthropic", usd: 0.5 }, { provider: "ollama", usd: null }, { provider: "local_ollama", usd: null }]), { site: "s", model: "m", projectedUsd: 0.9 });
  await assertSpendable(null, { site: "s", model: "m", projectedUsd: null }); // uncapped ⇒ no-op
  assertEquals(c1.refusals.length, 1);
});

Deno.test("the routed external branch: under a cap an unpriced model (gpt-4.1) is refused BEFORE the request — no fetch", async () => {
  const orig = globalThis.fetch; let calls = 0;
  globalThis.fetch = (() => { calls++; return Promise.resolve(new Response(JSON.stringify({ choices: [{ message: { content: "{}" } }], usage: { prompt_tokens: 1, completion_tokens: 1 } }))); }) as typeof fetch;
  try {
    const routed = defaultBeatsRoutedModel("sk-test", undefined, cap([]));
    await assertRejects(() => routed({ role: "generator", provenances: ["public_observed"], system: "s", user: "u" }), SpendCapRefused);
    assertEquals(calls, 0);
    const uncapped = defaultBeatsRoutedModel("sk-test");
    await uncapped({ role: "generator", provenances: ["public_observed"], system: "s", user: "u" });
    assertEquals(calls, 1, "uncapped ⇒ unchanged");
  } finally { globalThis.fetch = orig; }
});
