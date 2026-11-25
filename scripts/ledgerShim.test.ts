// ── SP-570: a call that threw is ledgered under the model that was REQUESTED, and marked ─────────
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { modelSentFor, noResponseLedgerRow, REQUESTED_NO_RESPONSE } from "./ledgerShim.ts";
import { recordModelCall } from "../supabase/functions/_shared/recordModelCall.ts";

Deno.test("SP-570: the model SENT is the override, else the layer default, else the lane's", () => {
  // RUN 7's CASE: no --judge-model, the layer default (SP-555) is what was sent. The old expression
  // ignored it and returned "", which is the empty `model` on run 7's 11 rows.
  assertEquals(modelSentFor("judge", { judgeDefault: "qwen3.6:35b", laneModel: "llama3:70b" }), "qwen3.6:35b");
  assertEquals(modelSentFor("judge", { judgeOverride: "llama3:70b", judgeDefault: "qwen3.6:35b", laneModel: "x" }), "llama3:70b");
  assertEquals(modelSentFor("judge", { laneModel: "llama3:70b" }), "llama3:70b");
  assertEquals(modelSentFor("generator", { genDefault: "qwen3.6:35b", laneModel: "qwen2.5:14b-instruct" }), "qwen3.6:35b");
  assertEquals(modelSentFor("generator", { genOverride: "g", genDefault: "d", laneModel: "l" }), "g");
  // a role never borrows the other role's model
  assertEquals(modelSentFor("judge", { genDefault: "g", laneModel: "l" }), "l");
});

Deno.test("SP-570: the row names the requested model and is marked requested-with-no-response", () => {
  const row = noResponseLedgerRow({ callSite: "need-patterns:judge", requestedModel: "qwen3.6:35b" });
  assertEquals(row.usage.model, "qwen3.6:35b");                       // the bare name — groups with its model
  assertEquals(row.callSite, "need-patterns:judge:requested-no-response");
  assertEquals(row.callSite.endsWith(`:${REQUESTED_NO_RESPONSE}`), true);
  assertEquals(row.usage.usd, 0);                                      // a local call is priced 0 — a record
  assertEquals(row.usage.provider, "local_ollama");
  // NEVER an empty model: an unknown requested model says so
  assertEquals(noResponseLedgerRow({ callSite: "s", requestedModel: "" }).usage.model, "unknown");
  assertEquals(noResponseLedgerRow({ callSite: "s", requestedModel: "   " }).usage.model, "unknown");
});

Deno.test("SP-570: through the ONE ledger writer, the stored row carries both — existing columns only", async () => {
  const inserted: Array<{ table: string; row: Record<string, unknown> }> = [];
  const sb = { from: (table: string) => ({ insert: (row: Record<string, unknown>) => { inserted.push({ table, row }); return Promise.resolve({ error: null }); } }) };
  const nr = noResponseLedgerRow({
    callSite: "need-patterns:judge",
    requestedModel: modelSentFor("judge", { judgeDefault: "qwen3.6:35b", laneModel: "llama3:70b" }),
  });
  const ok = await recordModelCall(sb as never, { companyId: "dd40ce2f-ff67-4111-bd3c-67943dde6717", callSite: nr.callSite, usage: nr.usage, promptSha: "abc" });
  assertEquals(ok, true);
  assertEquals(inserted.length, 1);
  assertEquals(inserted[0].table, "model_calls");
  assertEquals(inserted[0].row.model, "qwen3.6:35b");
  assertEquals(inserted[0].row.call_site, "need-patterns:judge:requested-no-response");
  assertEquals(inserted[0].row.usd, 0);
  // no column that model_calls does not already have
  const COLUMNS = ["company_id", "run_id", "call_site", "provider", "model", "prompt_tokens", "completion_tokens", "usd", "attempt", "prompt_sha", "web_search_requests"];
  assertEquals(Object.keys(inserted[0].row).filter((k) => !COLUMNS.includes(k)), []);
});
