// R4–R7 through the HANDLER itself, against the real local database with a STUBBED model. Each test
// builds its own throwaway company and drops it, so the file leaves nothing behind and spends no
// model time. Skipped when the stack is not up.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { handleInterviewParse } from "./handler.ts";
import { PARSER_RULES_VERSION, SIDE_CHANGED_REASON, supersededReason } from "./rules.ts";
import { OURS_SIDE_REASON } from "../_shared/interviewItems.ts";
import { sha256Hex } from "../_shared/contentIdentity.ts";

const URL_ = Deno.env.get("SUPABASE_URL") ?? "";
const KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const OWNER = Deno.env.get("PARSER_TEST_USER") ?? "";
const live = URL_ !== "" && KEY !== "" && OWNER !== "";
const db = live ? createClient(URL_, KEY) : (null as never);

/** > WINDOW_CHARS, so toWindows cuts it into more than one window and a pass can leave work behind. */
const LONG_TRANSCRIPT = (() => {
  const lines: string[] = [];
  for (let t = 0; t < 60; t++) {
    lines.push(`Client ${t % 2 === 0 ? "One" : "Two"} | 00:${String(t).padStart(2, "0")}:00`);
    lines.push("We lose two whole days every month reconciling the intake spreadsheet by hand, and that is before the funder report.");
    lines.push("What I want is to see the entire waitlist in one place before the Monday meeting every single week without fail.");
    lines.push("");
  }
  return lines.join("\n");
})();

const TRANSCRIPT = [
  "Client One | 00:00:04",
  "We lose two whole days every month reconciling the intake spreadsheet by hand.",
  "",
  "Our Consultant | 00:01:12",
  "What we usually see at this stage is that the intake is the bottleneck for everyone.",
  "",
  "Client Two | 00:02:30",
  "What I want is to see the entire waitlist in one place before the Monday meeting.",
].join("\n");

/** A stub model: one item per passage, quoted verbatim, then a clean conversion and a pass. */
const stubbedDeps = (selfFires: string[]) => ({
  createClient,
  selfFire: (rid: string) => { selfFires.push(rid); return Promise.resolve(); },
});
// The handler calls Ollama directly, so these tests point OLLAMA_BASE_URL at a local stub server.
function startStubOllama(): { port: number; close: () => void } {
  const ac = new AbortController();
  const server = Deno.serve({ port: 0, hostname: "127.0.0.1", signal: ac.signal, onListen: () => {} }, async (req) => {
    const body = await req.json().catch(() => ({})) as { messages?: Array<{ role: string; content: string }> };
    const system = body.messages?.[0]?.content ?? "";
    const user = body.messages?.[1]?.content ?? "";
    let content = "{}";
    if (system.includes("THE ITEM TEST")) {
      const items = [...user.matchAll(/^\[(\d+)\] [^:]+: ([\s\S]*?)(?=\n\n\[|\n*$)/gm)]
        .map((m) => ({ passage_index: Number(m[1]), kind: "pain_point", raw_words: m[2].trim().slice(0, 300) }));
      content = JSON.stringify({ items });
    } else if (system.includes("strict ODI canonical form")) {
      content = JSON.stringify({ odi_canonical_statement: "Minimize the time spent on intake when reconciling records by hand" });
    } else if (system.includes("FAITHFUL IN SUBSTANCE")) {
      content = JSON.stringify({ ok: true, reason: "the statement keeps what the words were about" });
    }
    return new Response(JSON.stringify({ message: { content }, prompt_eval_count: 10, eval_count: 5 }), { headers: { "Content-Type": "application/json" } });
  });
  const port = (server.addr as Deno.NetAddr).port;
  return { port, close: () => { ac.abort(); } };
}

async function makeRecord(name: string, ourSpeakers: string[] = [], body: string = TRANSCRIPT) {
  const { data: c } = await db.from("companies").insert({ name, created_by: OWNER }).select("id").single();
  const { data: inp } = await db.from("inputs").insert({
    user_id: OWNER, company_id: c!.id, input_key: name, input_label: name, group_key: "market_evidence",
    group_label: "Market evidence", sub_group: "interviews", completeness: 0, status: "partial",
    score_impact: 0, impact_tier: "low", description: "t", why_it_matters: "t", frameworks_used: [],
  }).select("id").single();
  const { data: f } = await db.from("input_files").insert({
    input_id: inp!.id, file_name: `${name}.txt`, file_type: "text/plain", file_path: `zz/${name}.txt`, is_interview: true,
  }).select("id").single();
  const sha = await sha256Hex(body);
  const { data: r } = await db.from("interview_records").insert({
    company_id: c!.id, speaker_role: "client_stakeholder", person_name: "P", person_role: "R",
    interviewed_at: new Date().toISOString(), interviewer: "I", consent_basis: "verbal", created_by: OWNER,
    verbatim: body, input_file_id: f!.id, text_sha256: sha, file_sha256: sha,
    file_bytes: body.length, extraction_method: "local_text_reader", extraction_version: "test",
    our_speakers: ourSpeakers,
  }).select("id").single();
  return { companyId: c!.id as string, recordId: r!.id as string, inputId: inp!.id as string };
}
const drop = async (companyId: string, inputId: string) => {
  await db.from("companies").delete().eq("id", companyId);
  await db.from("inputs").delete().eq("id", inputId);
};
/** A failing assertion must NOT leave a throwaway company behind — the planted-failure runs of this
 *  file left five of them before this wrapper existed. */
async function withRecord(name: string, ours: string[], body: string, fn: (r: { companyId: string; recordId: string; inputId: string }) => Promise<void>) {
  const made = await makeRecord(name, ours, body);
  try { await fn(made); } finally { await drop(made.companyId, made.inputId); }
}
const post = (body: unknown) => new Request("http://local/interview-parser", {
  method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` }, body: JSON.stringify(body),
});
const items = async (recordId: string) => {
  const { data } = await db.from("interview_items")
    .select("id, kind, speaker_label, speaker_side, judge_state, judge_reason, rules_version, retracted_at, retracted_reason, content_identity")
    .eq("interview_record_id", recordId);
  return (data ?? []) as Array<Record<string, unknown>>;
};

async function withStub<T>(fn: () => Promise<T>): Promise<T> {
  const stub = startStubOllama();
  const prev = Deno.env.get("OLLAMA_BASE_URL");
  Deno.env.set("OLLAMA_BASE_URL", `http://127.0.0.1:${stub.port}`);
  try { return await fn(); } finally {
    if (prev === undefined) Deno.env.delete("OLLAMA_BASE_URL"); else Deno.env.set("OLLAMA_BASE_URL", prev);
    stub.close();
  }
}

Deno.test({ name: "R5: an OURS item lands with its words and NO derived statement, spending no model call", ignore: !live, sanitizeOps: false, sanitizeResources: false, fn: async () => {
  await withRecord("zz-4a-r5", ["Our Consultant"], TRANSCRIPT, async ({ companyId, recordId, inputId }) => {
  await withStub(async () => {
    const fired: string[] = [];
    const r = await handleInterviewParse(post({ record_id: recordId }), stubbedDeps(fired));
    assertEquals(r.status, 200);
  });
  const all = await items(recordId);
  const ours = all.filter((i) => i.speaker_side === "ours");
  const client = all.filter((i) => i.speaker_side === "client");
  assertEquals(ours.length, 1, `expected exactly the consultant's passage; sides were ${all.map((i) => i.speaker_side).join(",")}`);
  assertEquals(ours[0].speaker_label, "Our Consultant");
  assertEquals(ours[0].judge_state, "annotated");
  assertEquals(ours[0].judge_reason, OURS_SIDE_REASON);
  assertEquals(ours[0].framework_statement ?? null, null);
  assert(client.length >= 1, "the client passages must still convert");
  // no model call was spent on the ours item: the ledger has no judge call for it
  const { data: calls } = await db.from("model_calls").select("call_site").eq("company_id", companyId);
  const judges = (calls ?? []).filter((c) => String((c as { call_site: string }).call_site).endsWith(":judge")).length;
  assertEquals(judges, client.length, "one judge call per CLIENT item and none for ours");
  });
} });

Deno.test({ name: "R6: a SAME-version re-parse is idempotent — nothing retracted, nothing landed", ignore: !live, sanitizeOps: false, sanitizeResources: false, fn: async () => {
  await withRecord("zz-4a-r6-idem", [], TRANSCRIPT, async ({ companyId, recordId, inputId }) => {
  await withStub(async () => {
    await handleInterviewParse(post({ record_id: recordId }), stubbedDeps([]));
    const before = await items(recordId);
    const r = await handleInterviewParse(post({ record_id: recordId, resume: true }), stubbedDeps([]));
    const body = await r.json() as Record<string, unknown>;
    assertEquals(body.retracted_superseded, 0);
    assertEquals(body.retracted_side_changed, 0);
    const after = await items(recordId);
    assertEquals(after.length, before.length, "a same-version re-parse lands no new row");
    assertEquals(after.filter((i) => i.retracted_at !== null).length, 0, "and retracts none");
  });
  });
} });

Deno.test({ name: "R6: an OLDER-version parse retracts every live item first, then lands the new set", ignore: !live, sanitizeOps: false, sanitizeResources: false, fn: async () => {
  await withRecord("zz-4a-r6-supersede", [], TRANSCRIPT, async ({ companyId, recordId, inputId }) => {
  await withStub(async () => {
    await handleInterviewParse(post({ record_id: recordId }), stubbedDeps([]));
    const first = await items(recordId);
    assert(first.length > 0);
    // age them: the rules_version column is immutable by trigger, so the fixture is re-landed by hand
    // through a direct UPDATE of a column the trigger allows — instead, retract and re-insert as old.
    await db.from("interview_items").update({ retracted_at: new Date().toISOString(), retracted_reason: "fixture: aged" }).eq("interview_record_id", recordId);
    for (const i of first) {
      await db.from("interview_items").insert({
        company_id: companyId, interview_record_id: recordId, kind: i.kind, raw_words: `aged ${i.id}`,
        speaker_label: i.speaker_label, speaker_side: i.speaker_side, pointer: { turn_index: 0, line_start: 0, line_end: 0, passage_sha256: "a".repeat(64) },
        record_text_sha256: await sha256Hex(TRANSCRIPT), trace_state: "located", landing: "unplaced",
        judge_state: "annotated", judge_reason: "fixture", parse_level: "items",
        rules_version: "2026-09-22.1", content_identity: `aged-${i.id}`,
      });
    }
    const aged = (await items(recordId)).filter((i) => i.retracted_at === null);
    assertEquals(aged.length, first.length, "the aged set is what is live now");
    assert(aged.every((i) => i.rules_version === "2026-09-22.1"));

    const r = await handleInterviewParse(post({ record_id: recordId }), stubbedDeps([]));
    const body = await r.json() as Record<string, unknown>;
    assertEquals(r.status, 200, `supersession must be allowed past the already-parsed 409: ${JSON.stringify(body)}`);
    assertEquals(body.retracted_superseded, aged.length);

    const after = await items(recordId);
    const supersededRows = after.filter((i) => i.retracted_reason === supersededReason(PARSER_RULES_VERSION));
    assertEquals(supersededRows.length, aged.length, "every older item is retracted with the signed reason");
    const nowLive = after.filter((i) => i.retracted_at === null);
    assert(nowLive.length > 0, "and the new set lands");
    assert(nowLive.every((i) => i.rules_version === PARSER_RULES_VERSION));
    assert(after.length > aged.length, "retracted rows are KEPT, not replaced");
  });
  });
} });

Deno.test({ name: "R7: our_speakers changing under a SAME-version parse retracts and re-lands just those items", ignore: !live, sanitizeOps: false, sanitizeResources: false, fn: async () => {
  await withRecord("zz-4a-r7", [], TRANSCRIPT, async ({ companyId, recordId, inputId }) => {
  await withStub(async () => {
    await handleInterviewParse(post({ record_id: recordId }), stubbedDeps([]));
    const before = await items(recordId);
    assertEquals(before.filter((i) => i.speaker_side === "ours").length, 0, "nothing is ours yet");
    const target = before.find((i) => i.speaker_label === "Our Consultant")!;
    assert(target, "the consultant's item must exist");

    // R5's setting moves AFTER the parse — R7 says the items are not rewritten
    await db.from("interview_records").update({ our_speakers: ["Our Consultant"] }).eq("id", recordId);
    const untouched = await items(recordId);
    assertEquals(untouched.find((i) => i.id === target.id)!.speaker_side, "client", "R7: a setting change never rewrites a landed item");

    const r = await handleInterviewParse(post({ record_id: recordId }), stubbedDeps([]));
    const body = await r.json() as Record<string, unknown>;
    assertEquals(r.status, 200);
    assertEquals(body.retracted_side_changed, 1, "exactly the one item whose side moved");
    assertEquals(body.retracted_superseded, 0, "the version did not move");

    const after = await items(recordId);
    const retracted = after.find((i) => i.id === target.id)!;
    assertEquals(retracted.retracted_reason, SIDE_CHANGED_REASON);
    const relanded = after.filter((i) => i.retracted_at === null && i.speaker_label === "Our Consultant");
    assertEquals(relanded.length, 1);
    assertEquals(relanded[0].speaker_side, "ours");
    assertEquals(relanded[0].judge_reason, OURS_SIDE_REASON);
    assertEquals(relanded[0].content_identity, retracted.content_identity, "the SAME identity lands again — one item, two rows");
    // and the items whose side did NOT change were left alone
    assertEquals(after.filter((i) => i.retracted_at !== null).length, 1);
  });
  });
} });

Deno.test({ name: "R4: a pass with windows left self-fires and returns 200 done:false; a finished run does not", ignore: !live, sanitizeOps: false, sanitizeResources: false, fn: async () => {
  await withRecord("zz-4a-r4", [], TRANSCRIPT, async ({ companyId, recordId, inputId }) => {
  await withStub(async () => {
    // one window here, so the completing pass must NOT fire
    const fired: string[] = [];
    const r = await handleInterviewParse(post({ record_id: recordId }), stubbedDeps(fired));
    const body = await r.json() as Record<string, unknown>;
    assertEquals(body.done, true);
    assertEquals(body.self_fired, false, "a finished run never fires another pass");
    assertEquals(fired.length, 0);

    // a pass stopped by the budget has windows left, but did NO window — it must not fire either,
    // or an unproductive pass would fire itself forever.
    const base = Date.now(); let t = base;
    const r2 = await handleInterviewParse(post({ record_id: recordId, resume: true }), {
      ...stubbedDeps(fired), now: () => { const v = t; t = base + 400_000; return v; },
    });
    const b2 = await r2.json() as Record<string, unknown>;
    assertEquals(b2.windows_done, 0);
    assertEquals(b2.self_fired, false, "no progress means no fire");
    assertEquals(fired.length, 0);
  });
  });
} });

Deno.test({ name: "R4: every pass appends itself to the run row's pass log", ignore: !live, sanitizeOps: false, sanitizeResources: false, fn: async () => {
  await withRecord("zz-4a-r4-log", [], TRANSCRIPT, async ({ companyId, recordId, inputId }) => {
  await withStub(async () => {
    await handleInterviewParse(post({ record_id: recordId }), stubbedDeps([]));
    const { data } = await db.from("integrity_runs").select("excluded_by_rule, status")
      .eq("surface_id", recordId).eq("component", "interview_parse").single();
    const payload = (data!.excluded_by_rule ?? {}) as Record<string, unknown>;
    const passes = payload.passes as Array<Record<string, unknown>>;
    assert(Array.isArray(passes) && passes.length >= 1, "the run row carries a pass log");
    assertEquals(passes[0].n, 1);
    assertEquals(passes[0].via, "caller");
    assert(typeof passes[0].ms === "number");
    assert(typeof passes[0].windows_done === "number");
    assertEquals(data!.status, "completed");
  });
  });
} });

Deno.test({ name: "R4: a pass that leaves windows behind DOES self-fire, once, with the record id", ignore: !live, sanitizeOps: false, sanitizeResources: false, fn: async () => {
  await withRecord("zz-4a-r4-fires", [], LONG_TRANSCRIPT, async ({ companyId, recordId, inputId }) => {
  await withStub(async () => {
    const fired: string[] = [];
    // the clock is injected so the budget closes after the FIRST window: progress was made and work
    // remains, which is exactly the state R4 says must fire the next pass.
    const base = Date.now(); let calls = 0;
    const r = await handleInterviewParse(post({ record_id: recordId }), {
      ...stubbedDeps(fired),
      now: () => { calls++; return calls <= 2 ? base : base + 400_000; },
    });
    const body = await r.json() as Record<string, unknown>;
    assertEquals(r.status, 200, `body: ${JSON.stringify(body)}`);
    assert((body.windows as number) > 1, `the fixture must cut into more than one window, got ${body.windows}`);
    assertEquals(body.done, false, "work remains");
    assert((body.windows_done as number) >= 1, "and this pass made progress");
    assertEquals(body.self_fired, true, "so the next pass must be fired");
    assertEquals(fired, [recordId], "fired exactly once, for this record");
  });
  });
} });

Deno.test({ name: "R4: a SECOND pass appends to the log rather than replacing it — the per-window write carries it", ignore: !live, sanitizeOps: false, sanitizeResources: false, fn: async () => {
  // The first integration lost pass 1's entry: the per-window update rewrites excluded_by_rule
  // wholesale, so a pass that processed a window wiped whatever the previous pass had appended.
  await withRecord("zz-4a-r4-twopass", [], LONG_TRANSCRIPT, async ({ companyId, recordId, inputId }) => {
  await withStub(async () => {
    const base = Date.now(); let calls = 0;
    await handleInterviewParse(post({ record_id: recordId }), {
      ...stubbedDeps([]), now: () => { calls++; return calls <= 2 ? base : base + 400_000; },
    });
    const r2 = await handleInterviewParse(post({ record_id: recordId, resume: true }), stubbedDeps([]));
    const b2 = await r2.json() as Record<string, unknown>;
    assertEquals(b2.done, true, "the second pass finishes it");
    assertEquals(b2.passes, 2, "and it is the SECOND entry in the log");
    const { data } = await db.from("integrity_runs").select("excluded_by_rule")
      .eq("surface_id", recordId).eq("component", "interview_parse").single();
    const passes = ((data!.excluded_by_rule as Record<string, unknown>).passes ?? []) as Array<Record<string, unknown>>;
    assertEquals(passes.length, 2, "pass 1's entry must survive pass 2's window writes");
    assertEquals(passes[0].n, 1);
    assertEquals(passes[1].n, 2);
    assert((passes[0].windows_done as number) >= 1 && (passes[1].windows_done as number) >= 1);
  });
  });
} });
