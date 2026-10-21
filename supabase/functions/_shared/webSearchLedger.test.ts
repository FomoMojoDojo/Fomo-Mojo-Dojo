// Ruling 1 (2026-10-21): every Claude web_search call is ledgered — model, tokens, billed searches, usd, call site — and a
// call that cannot be ledgered refuses. Prices: Anthropic pricing page, read 2026-10-21 (modelPricing.ts).
import { assert, assertAlmostEquals, assertEquals, assertRejects, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { anthropicPriceFor, anthropicUsd } from "./modelPricing.ts";
import { ledgerOrRefuse, priceableOrRefuse, requireWebSearchLedger, webSearchLedgerFor, webSearchRecord } from "./webSearchLedger.ts";

const USAGE = { input_tokens: 40_000, output_tokens: 6_000, cache_creation_input_tokens: 2_000, cache_read_input_tokens: 10_000, server_tool_use: { web_search_requests: 9 } };

Deno.test("price: Sonnet 4.6 $3 in / $15 out, cache write 1.25x, read 0.1x, $10 per 1,000 searches; unknown model ⇒ null", () => {
  // 40k×3 + 2k×3.75 + 10k×0.3 + 6k×15 = 120000+7500+3000+90000 = 220500 → $0.2205; + 9 × $0.01 = $0.09
  assertAlmostEquals(anthropicUsd("claude-sonnet-4-6", USAGE)!, 0.3105, 1e-9);
  assertEquals(anthropicUsd("claude-unknown-9", USAGE), null);
  assertEquals(anthropicUsd("claude-sonnet-4-6", null), null);
  assertEquals(anthropicPriceFor("claude-sonnet-4"), null, "exact id only — no family guessing");
});

Deno.test("record: input = input + cache write + cache read; billed searches; NULL (not 0) when no usage", () => {
  assertEquals(webSearchRecord("claude-sonnet-4-6", USAGE), { provider: "anthropic", model: "claude-sonnet-4-6", prompt_tokens: 52_000, completion_tokens: 6_000, usd: anthropicUsd("claude-sonnet-4-6", USAGE), web_search_requests: 9 });
  assertEquals(webSearchRecord("claude-sonnet-4-6", null), { provider: "anthropic", model: "claude-sonnet-4-6", prompt_tokens: null, completion_tokens: null, usd: null, web_search_requests: null });
});

Deno.test("the ledger writes one model_calls row with the call site; a failed write refuses; no ledger ⇒ no call; unpriced ⇒ refused under a cap", async () => {
  const rows: Record<string, unknown>[] = [];
  const ok = { from: () => ({ insert: (r: Record<string, unknown>) => { rows.push(r); return Promise.resolve({ error: null }); } }) };
  const l = webSearchLedgerFor(ok, { companyId: "co1", runId: "run1", callSite: "public-baseline-search" });
  await ledgerOrRefuse(l, { model: "claude-sonnet-4-6", usage: USAGE, attempt: 2, promptSha: "sha" }, "public-baseline-search");
  assertEquals(rows.length, 1);
  assertEquals([rows[0].call_site, rows[0].provider, rows[0].model, rows[0].prompt_tokens, rows[0].completion_tokens, rows[0].web_search_requests, rows[0].attempt, rows[0].prompt_sha, rows[0].run_id], ["public-baseline-search", "anthropic", "claude-sonnet-4-6", 52_000, 6_000, 9, 2, "sha", "run1"]);
  const warn = console.warn; console.warn = () => {};
  const bad = { from: () => ({ insert: () => Promise.resolve({ error: { message: "column does not exist" } }) }) };
  await assertRejects(() => ledgerOrRefuse(webSearchLedgerFor(bad, { companyId: "co1", callSite: "s" }), { model: "m", usage: USAGE, attempt: 1, promptSha: null }, "s"), Error, "refused");
  console.warn = warn;
  assertThrows(() => requireWebSearchLedger(undefined, "s"), Error, "no web_search call made");
  assertThrows(() => priceableOrRefuse("claude-unknown-9", "s"), Error, "refused before it is made");
  priceableOrRefuse("claude-sonnet-4-6", "s");
  assert(true);
});
