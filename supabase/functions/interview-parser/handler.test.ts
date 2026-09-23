// The served run's REFUSALS and its BUDGET RULE (parser commit 3). These run against the real local
// database through the handler itself — every case below returns BEFORE a model call, so the file
// needs no Ollama and costs nothing. The record ids are read from the environment the proof sets up.
//
// Skipped automatically when PARSER_TEST_RECORD is unset, so the suite stays green on a machine with
// no stack up.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handleInterviewParse, MIN_SLOWEST_MS, TIME_BUDGET_MS } from "./handler.ts";

const KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const RECORD = Deno.env.get("PARSER_TEST_RECORD") ?? "";
const WITHDRAWN = Deno.env.get("PARSER_TEST_WITHDRAWN") ?? "";
const HANDENTERED = Deno.env.get("PARSER_TEST_HANDENTERED") ?? "";
const live = KEY !== "" && RECORD !== "";

const post = (body: unknown, auth = KEY) => new Request("http://local/interview-parser", {
  method: "POST", headers: { "Content-Type": "application/json", ...(auth ? { Authorization: `Bearer ${auth}` } : {}) },
  body: JSON.stringify(body),
});
const call = async (body: unknown, auth = KEY) => {
  const r = await handleInterviewParse(post(body, auth));
  return { status: r.status, body: await r.json() as Record<string, unknown> };
};

Deno.test({ name: "refusal: no record_id is a 400", ignore: !live, fn: async () => {
  const r = await call({});
  assertEquals(r.status, 400);
  assertEquals(r.body.error, "record_id required");
} });

Deno.test({ name: "refusal: no caller is a 401 and nothing is parsed", ignore: !live, fn: async () => {
  const r = await call({ record_id: RECORD }, "");
  assertEquals(r.status, 401);
  assertEquals(r.body.error, "no_authenticated_caller");
} });

Deno.test({ name: "refusal: an unknown record is a 404", ignore: !live, fn: async () => {
  const r = await call({ record_id: "00000000-0000-0000-0000-000000000000" });
  assertEquals(r.status, 404);
  assertEquals(r.body.error, "no_record");
} });

Deno.test({ name: "refusal: a WITHDRAWN record is a 409", ignore: !live || !WITHDRAWN, fn: async () => {
  const r = await call({ record_id: WITHDRAWN });
  assertEquals(r.status, 409);
  assertEquals(r.body.error, "record_withdrawn");
} });

Deno.test({ name: "refusal: a HAND-ENTERED record is a 409 — there is no saved transcript to point into", ignore: !live || !HANDENTERED, fn: async () => {
  const r = await call({ record_id: HANDENTERED });
  assertEquals(r.status, 409);
  assertEquals(r.body.error, "not_upload_record");
} });

Deno.test({ name: "refusal: an already-parsed record is a 409 unless resume", ignore: !live, fn: async () => {
  const r = await call({ record_id: RECORD });
  assertEquals(r.status, 409);
  assertEquals(r.body.error, "already_parsed");
  assert(typeof r.body.parsed_at === "string");
} });

// ── the budget rule ──────────────────────────────────────────────────────────────────────────────
// The clock is injected, so this is deterministic and spends nothing: `now` jumps straight past the
// point where the next window could not finish. The rule is
//   elapsed + max(slowestSeen, MIN_SLOWEST_MS) > TIME_BUDGET_MS  ->  stop the pass
// and with no window yet timed, slowestSeen is 0, so MIN_SLOWEST_MS is what floors it. A pass that
// stops this way must NOT be `done` and must NOT set parsed_at.
Deno.test({ name: "budget: a pass that cannot fit another window stops, resumable, without finishing", ignore: !live, fn: async () => {
  const base = Date.now();
  // one tick past the floor: the very first window is already unaffordable
  let t = base;
  const r = await handleInterviewParse(post({ record_id: RECORD, resume: true }), {
    createClient: (await import("https://esm.sh/@supabase/supabase-js@2.57.4")).createClient,
    now: () => { const v = t; t = base + (TIME_BUDGET_MS - MIN_SLOWEST_MS) + 1000; return v; },
  });
  const body = await r.json() as Record<string, unknown>;
  assertEquals(r.status, 200);
  assertEquals(body.done, false, "the pass must not claim completion");
  assertEquals(body.windows_done, 0, "no window may be processed once the budget is gone");
  assertEquals(body.model_calls, 0, "and no model call may be spent");
} });

Deno.test("budget: the rule's constants are the ones the run is designed around", () => {
  assertEquals(TIME_BUDGET_MS, 300_000);
  assertEquals(MIN_SLOWEST_MS, 30_000);
  assert(MIN_SLOWEST_MS < TIME_BUDGET_MS);
});
