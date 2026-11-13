// SP-F9 / SP-177 (2026-11-13): the one spend writer never puts a non-uuid in model_calls.run_id.
//
// WHY THIS TEST EXISTS. model_calls.run_id is `uuid` with a FOREIGN KEY to long_runner_runs(id).
// research-company passed String(baselineRun.id) — a public_baseline_runs.id, a BIGINT — so every
// insert failed the uuid cast. Because this writer degrades to a log line by design, the failure was
// invisible: the OpenAI spend was real and the ledger row simply never existed. Zero of the 33,000+
// model_calls rows on this stack carry a run_id, and research-company appears in the table not once.
//
// The rule being held: a value that cannot be a run_id becomes NULL, and the COST ROW STILL LANDS.
// A gap in attribution is strictly better than a missing cost row, and a rejected insert is exactly
// a missing cost row.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { normalizeRunId, recordModelCall, openaiRecord } from "./recordModelCall.ts";

const UUID = "7f2cfb01-ab6c-4b6c-9ffc-0c99b678dcae";

Deno.test("normalizeRunId keeps a canonical uuid", () => {
  assertEquals(normalizeRunId(UUID), UUID);
  assertEquals(normalizeRunId(UUID.toUpperCase()), UUID.toUpperCase());
  assertEquals(normalizeRunId(`  ${UUID}  `), UUID);
});

Deno.test("normalizeRunId refuses the SP-F9 value: a stringified bigint", () => {
  // public_baseline_runs.id is a bigint; this is the exact shape research-company sent.
  assertEquals(normalizeRunId("18657"), null);
  assertEquals(normalizeRunId(String(18657)), null);
  assertEquals(normalizeRunId("0"), null);
});

Deno.test("normalizeRunId refuses everything else that is not a uuid", () => {
  for (const bad of [null, undefined, "", "   ", 18657, {}, [], true, "not-a-uuid"]) {
    assertEquals(normalizeRunId(bad), null, `expected null for ${JSON.stringify(bad)}`);
  }
  // a near-miss: right length, wrong alphabet
  assertEquals(normalizeRunId("7f2cfb01-ab6c-4b6c-9ffc-0c99b678dcaz"), null);
  // right alphabet, wrong grouping
  assertEquals(normalizeRunId("7f2cfb01ab6c4b6c9ffc0c99b678dcae"), null);
  // a braced/urn spelling is a bug to surface, not a format to absorb
  assertEquals(normalizeRunId(`{${UUID}}`), null);
  assertEquals(normalizeRunId(`urn:uuid:${UUID}`), null);
});

// ── the writer itself, against a fake that records what it was handed ────────────────────────────
function fakeSupabase() {
  const rows: Record<string, unknown>[] = [];
  return {
    rows,
    client: {
      from: (_table: string) => ({
        insert: (row: Record<string, unknown>) => {
          rows.push(row);
          return Promise.resolve({ error: null });
        },
      }),
    },
  };
}
const usage = openaiRecord("gpt-4.1", { prompt_tokens: 1000, completion_tokens: 500 });

Deno.test("recordModelCall: a bigint run_id is stored as NULL and the cost row STILL lands", async () => {
  const fake = fakeSupabase();
  const ok = await recordModelCall(fake.client, {
    companyId: "3dd2cfbb-0792-4bf1-9cd4-15db9646874b",
    runId: "18657",
    callSite: "research-company:inputs",
    usage,
  });
  assert(ok, "the insert must still succeed — the spend was real");
  assertEquals(fake.rows.length, 1);
  assertEquals(fake.rows[0].run_id, null);
  // the parts that matter for accounting are untouched
  assertEquals(fake.rows[0].call_site, "research-company:inputs");
  assertEquals(fake.rows[0].prompt_tokens, 1000);
  assertEquals(fake.rows[0].completion_tokens, 500);
  assert(Number(fake.rows[0].usd) > 0, "a priced model must carry a usd figure");
});

Deno.test("recordModelCall: a real uuid run_id is passed through unchanged", async () => {
  const fake = fakeSupabase();
  await recordModelCall(fake.client, {
    companyId: "3dd2cfbb-0792-4bf1-9cd4-15db9646874b",
    runId: UUID,
    callSite: "first-read-fill:beats",
    usage,
  });
  assertEquals(fake.rows[0].run_id, UUID);
});

Deno.test("recordModelCall: an absent run_id is NULL, and no row is written without a company", async () => {
  const fake = fakeSupabase();
  await recordModelCall(fake.client, {
    companyId: "3dd2cfbb-0792-4bf1-9cd4-15db9646874b",
    callSite: "own-words-judge",
    usage,
  });
  assertEquals(fake.rows[0].run_id, null);

  const none = fakeSupabase();
  const ok = await recordModelCall(none.client, { companyId: "", callSite: "x", usage });
  assertEquals(ok, false);
  assertEquals(none.rows.length, 0);
});

Deno.test("a non-vacuity check: the fake would catch a run_id that got through", async () => {
  const fake = fakeSupabase();
  await recordModelCall(fake.client, {
    companyId: "3dd2cfbb-0792-4bf1-9cd4-15db9646874b",
    runId: UUID,
    callSite: "x",
    usage,
  });
  assert(fake.rows[0].run_id !== null, "the fake does observe a passed-through run_id");
});
