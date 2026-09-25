// ── N8, N10 and N11 THROUGH THE HANDLER (4e-2) ──────────────────────────────────────────────────
//
// Real local database, throwaway company per test, STUBBED Ollama so no model time is spent. Skipped
// when the stack is not up. Same shape as handler4a/handler4e.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { COMPONENT, RUN_REF, handleInterviewParse } from "./handler.ts";
import { OUTPUT_CAP_REASON, PARSER_RULES_VERSION } from "./rules.ts";
import { sha256Hex } from "../_shared/contentIdentity.ts";

const URL_ = Deno.env.get("SUPABASE_URL") ?? "";
const KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const OWNER = Deno.env.get("PARSER_TEST_USER") ?? "";
const live = URL_ !== "" && KEY !== "" && OWNER !== "";
const db = live ? createClient(URL_, KEY) : (null as never);

const TRANSCRIPT = [
  "Ada Lovelace | 00:00:04",
  "Reconciling the intake spreadsheet by hand costs us whole days every single month.",
  "",
  "Grace Hopper | 00:02:30",
  "What we want is the waitlist visible in one place before the Monday meeting.",
].join("\n");

/** `capAt` names the stage whose answer reports done_reason "length". `capOnlyFirstN` limits the cap
 *  to the first N calls of that stage, so N15's split can be watched: cap once, split, then succeed. */
function stub(capAt: string | null, capOnlyFirstN = Infinity): { port: number; close: () => void } {
  let capsSoFar = 0;
  const ac = new AbortController();
  const server = Deno.serve({ port: 0, hostname: "127.0.0.1", signal: ac.signal, onListen: () => {} }, async (req) => {
    const body = await req.json().catch(() => ({})) as { messages?: Array<{ role: string; content: string }>; options?: Record<string, unknown> };
    const system = body.messages?.[0]?.content ?? "";
    const user = body.messages?.[1]?.content ?? "";
    let content = "{}", stage = "";
    if (system.includes("WORK IN TWO STEPS")) {
      stage = "finder";
      const items = user.split("\n\n").flatMap((block) => {
        const head = block.trim().match(/^\[(\d+)\]\s+\[(?:client|ours)\][^:]*:\s*([\s\S]+)$/);
        if (!head) return [];
        const sentence = head[2].trim();
        const object = sentence.replace(/[^\p{L}\p{N}\s]/gu, " ").trim().split(/\s+/).slice(0, 3).join(" ");
        return [{ passage_index: Number(head[1]), kind: "pain_point", scope: "market", object, raw_words: sentence }];
      });
      content = JSON.stringify({ items });
    } else if (system.includes("strict ODI canonical form")) {
      stage = "convert:need";
      const quote = (user.match(/desired_outcome:\s*([\s\S]*?)(?:\njob_executor:|$)/)?.[1] ?? "").trim();
      const object = quote.replace(/[^\p{L}\p{N}\s]/gu, " ").trim().split(/\s+/).slice(2, 7).join(" ").toLowerCase();
      content = JSON.stringify({ odi_canonical_statement: `Minimize the time of ${object}` });
    } else if (system.includes("FAITHFUL IN SUBSTANCE")) {
      stage = "judge";
      // one objection whose term IS in the passage, so N3 drops it: proves `dropped` is recorded
      content = JSON.stringify({ ok: false, objections: [{ type: "added_object", term: "intake spreadsheet" }] });
    }
    let capped = capAt !== null && stage === capAt;
    if (capped) { capsSoFar++; if (capsSoFar > capOnlyFirstN) capped = false; }
    return new Response(JSON.stringify({
      message: { content }, prompt_eval_count: 10, eval_count: 5,
      done_reason: capped ? "length" : "stop",
      _num_predict_seen: (body.options ?? {}).num_predict ?? null,
    }), { headers: { "Content-Type": "application/json" } });
  });
  return { port: (server.addr as Deno.NetAddr).port, close: () => ac.abort() };
}

async function makeRecord(name: string) {
  const { data: c } = await db.from("companies").insert({ name, created_by: OWNER }).select("id").single();
  const { data: inp } = await db.from("inputs").insert({
    user_id: OWNER, company_id: c!.id, input_key: name, input_label: name, group_key: "market_evidence",
    group_label: "Market evidence", sub_group: "interviews", completeness: 0, status: "partial",
    score_impact: 0, impact_tier: "low", description: "t", why_it_matters: "t", frameworks_used: [],
  }).select("id").single();
  const { data: f } = await db.from("input_files").insert({
    input_id: inp!.id, file_name: `${name}.txt`, file_type: "text/plain", file_path: `zz/${name}.txt`, is_interview: true,
  }).select("id").single();
  const sha = await sha256Hex(TRANSCRIPT);
  const { data: r } = await db.from("interview_records").insert({
    company_id: c!.id, speaker_role: "client_stakeholder", person_name: "P", person_role: "R",
    interviewed_at: new Date().toISOString(), interviewer: "I", consent_basis: "verbal", created_by: OWNER,
    verbatim: TRANSCRIPT, input_file_id: f!.id, text_sha256: sha, file_sha256: sha,
    file_bytes: TRANSCRIPT.length, extraction_method: "local_text_reader", extraction_version: "test",
    our_speakers: [],
  }).select("id").single();
  return { companyId: c!.id as string, recordId: r!.id as string, inputId: inp!.id as string };
}
const drop = async (m: { companyId: string; inputId: string }) => {
  await db.from("public_reads").delete().eq("company_id", m.companyId);
  await db.from("companies").delete().eq("id", m.companyId);
  await db.from("inputs").delete().eq("id", m.inputId);
};
const post = (b: unknown) => new Request("http://local/interview-parser", {
  method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` }, body: JSON.stringify(b),
});

async function run(name: string, capAt: string | null, body: unknown, fn: (m: { companyId: string; recordId: string }, res: Response, json: Record<string, unknown>) => Promise<void>) {
  const made = await makeRecord(name);
  try {
    const s = stub(capAt);
    const prev = Deno.env.get("OLLAMA_BASE_URL");
    Deno.env.set("OLLAMA_BASE_URL", `http://127.0.0.1:${s.port}`);
    try {
      const res = await handleInterviewParse(post({ record_id: made.recordId, ...(body as object) }), { createClient, selfFire: () => Promise.resolve() });
      const j = await res.json();
      await fn(made, res, j);
    } finally {
      if (prev === undefined) Deno.env.delete("OLLAMA_BASE_URL"); else Deno.env.set("OLLAMA_BASE_URL", prev);
      s.close();
    }
  } finally { await drop(made); }
}
const items = async (recordId: string) => {
  const { data } = await db.from("interview_items")
    .select("id, kind, speaker_side, judge_state, judge_reason, judge_objections, framework_statement")
    .eq("interview_record_id", recordId).is("retracted_at", null);
  return (data ?? []) as Array<Record<string, unknown>>;
};
const T = (name: string, fn: () => Promise<void>) => Deno.test({ name, ignore: !live, sanitizeOps: false, sanitizeResources: false, fn });

// ── N8 ───────────────────────────────────────────────────────────────────────────────────────────
T("N15: the FIRST finder cap SPLITS the unit in two — it does not fail the run", async () => {
  // capOnlyFirstN=1: the window caps once, is cut in two, and both halves then answer normally.
  const made = await makeRecord("zz-4e3-split");
  try {
    const s = stub("finder", 1);
    const prev = Deno.env.get("OLLAMA_BASE_URL");
    Deno.env.set("OLLAMA_BASE_URL", `http://127.0.0.1:${s.port}`);
    try {
      const res = await handleInterviewParse(post({ record_id: made.recordId }), { createClient, selfFire: () => Promise.resolve() });
      const j = await res.json();
      assertEquals(res.status, 200, `a first cap must not fail the run; body ${JSON.stringify(j)}`);
      assertEquals(Number(j.splits), 1, "the unit was cut in two, once");
      assertEquals(Number(j.windows), 2, "one window became two units");
      assertEquals(j.done, true, "and both halves ran to the end");
      assertEquals((j.capped as Record<string, number>).finder, 1, "the cap is still counted");
    } finally { if (prev === undefined) Deno.env.delete("OLLAMA_BASE_URL"); else Deno.env.set("OLLAMA_BASE_URL", prev); s.close(); }
  } finally { await drop(made); }
});

T("N15: a HALF that caps again fails the run, with the cursor kept and nothing landed", async () => {
  // every finder call caps, so the split happens once and then the first half caps at depth 1.
  await run("zz-4e3-splitfail", "finder", {}, async (m, res, j) => {
    assertEquals(res.status, 500, `body ${JSON.stringify(j)}`);
    assertEquals(j.error, "finder_output_cap");
    assertEquals(j.cursor, 0, "the cursor is KEPT so a later pass retries");
    assertEquals(Number(j.splits), 1, "it split once and then refused to split again");
    assertEquals((await items(m.recordId)).length, 0, "no item from a capped unit lands");
    const { data: runs } = await db.from("integrity_runs").select("status, excluded_by_rule")
      .eq("company_id", m.companyId).eq("component", COMPONENT).eq("run_ref", RUN_REF);
    const r = (runs ?? [])[0] as Record<string, unknown>;
    assertEquals(r.status, "failed");
    const payload = r.excluded_by_rule as Record<string, unknown>;
    assertEquals((payload.capped as Record<string, number>).finder, 2, "both caps counted");
    assertEquals(Number(payload.splits), 1);
    assertEquals(payload.lease, null, "a failed pass releases the lease");
  });
});

T("N8: a JUDGE that hits its cap annotates only ITS item; the window and the others are unaffected", async () => {
  await run("zz-4e2-judgecap", "judge", {}, async (m, res, j) => {
    assertEquals(res.status, 200, `body ${JSON.stringify(j)}`);
    assertEquals(j.done, true, "the window still completes");
    const rows = await items(m.recordId);
    assert(rows.length >= 1, "items still land");
    const cappedRows = rows.filter((r) => String(r.judge_reason).startsWith(OUTPUT_CAP_REASON));
    assert(cappedRows.length >= 1, "the capped item is annotated");
    assertEquals(cappedRows[0].judge_state, "annotated");
    assertEquals(cappedRows[0].judge_objections, null, "no verdict returned, so no objections are recorded");
    assertEquals((j.capped as Record<string, number>).judge, cappedRows.length);
  });
});

T("N8: every call the handler makes carries num_predict", async () => {
  // the stub echoes back the num_predict it was sent; a call without one would echo null
  const seen: Array<number | null> = [];
  const made = await makeRecord("zz-4e2-numpredict");
  try {
    const ac = new AbortController();
    const server = Deno.serve({ port: 0, hostname: "127.0.0.1", signal: ac.signal, onListen: () => {} }, async (req) => {
      const b = await req.json().catch(() => ({})) as { options?: Record<string, unknown>; messages?: Array<{ content: string }> };
      seen.push((b.options ?? {}).num_predict as number ?? null);
      const system = b.messages?.[0]?.content ?? "";
      let content = "{}";
      if (system.includes("WORK IN TWO STEPS")) content = JSON.stringify({ items: [] });
      return new Response(JSON.stringify({ message: { content }, done_reason: "stop", prompt_eval_count: 1, eval_count: 1 }), { headers: { "Content-Type": "application/json" } });
    });
    const prev = Deno.env.get("OLLAMA_BASE_URL");
    Deno.env.set("OLLAMA_BASE_URL", `http://127.0.0.1:${(server.addr as Deno.NetAddr).port}`);
    try { await handleInterviewParse(post({ record_id: made.recordId }), { createClient, selfFire: () => Promise.resolve() }); }
    finally { if (prev === undefined) Deno.env.delete("OLLAMA_BASE_URL"); else Deno.env.set("OLLAMA_BASE_URL", prev); ac.abort(); }
    assert(seen.length >= 1, "at least one call was made");
    assertEquals(seen.filter((v) => v === null).length, 0, `every call must send num_predict; got ${JSON.stringify(seen)}`);
    assertEquals(seen[0], 2048, "the finder's cap");
  } finally { await drop(made); }
});

// ── N10 ──────────────────────────────────────────────────────────────────────────────────────────
T("N10: a RESUME is refused while another pass's lease heartbeat is fresh", async () => {
  const made = await makeRecord("zz-4e2-lease-fresh");
  try {
    await db.from("integrity_runs").insert({
      company_id: made.companyId, component: COMPONENT, surface_type: "interview_records",
      surface_id: made.recordId, ran_at: new Date(Date.now() - 60_000).toISOString(), status: "planned",
      examined: 0, admitted: 0, run_ref: RUN_REF,
      excluded_by_rule: { cursor: 0, lease: { pass_id: "someone-else", heartbeat: new Date().toISOString() } },
    });
    const res = await handleInterviewParse(post({ record_id: made.recordId, resume: true }), { createClient, selfFire: () => Promise.resolve() });
    const j = await res.json();
    assertEquals(res.status, 409, `resume must be refused too; body ${JSON.stringify(j)}`);
    assertEquals(j.error, "parse_in_flight");
    assertEquals(j.lease_pass_id, "someone-else", "the refusal names who holds it");
  } finally { await drop(made); }
});

T("N10: a resume ADOPTS once the lease heartbeat is older than STALE_AFTER_MS", async () => {
  const made = await makeRecord("zz-4e2-lease-stale");
  try {
    const { data: opened } = await db.from("integrity_runs").insert({
      company_id: made.companyId, component: COMPONENT, surface_type: "interview_records",
      surface_id: made.recordId, ran_at: new Date(Date.now() - 10 * 60_000).toISOString(), status: "planned",
      examined: 0, admitted: 0, run_ref: RUN_REF,
      excluded_by_rule: { cursor: 0, lease: { pass_id: "dead-pass", heartbeat: new Date(Date.now() - 10 * 60_000).toISOString() } },
    }).select("id").single();
    const s = stub(null);
    const prev = Deno.env.get("OLLAMA_BASE_URL");
    Deno.env.set("OLLAMA_BASE_URL", `http://127.0.0.1:${s.port}`);
    try {
      const res = await handleInterviewParse(post({ record_id: made.recordId, resume: true }), { createClient, selfFire: () => Promise.resolve() });
      const j = await res.json();
      assertEquals(res.status, 200, `body ${JSON.stringify(j)}`);
      assertEquals(j.run_id, opened!.id, "it adopted the abandoned run rather than opening a new one");
      assert(String(j.lease_pass_id ?? "").length > 0, "and took the lease under its own pass id");
      assert(j.lease_pass_id !== "dead-pass");
    } finally { if (prev === undefined) Deno.env.delete("OLLAMA_BASE_URL"); else Deno.env.set("OLLAMA_BASE_URL", prev); s.close(); }
  } finally { await drop(made); }
});

// ── N11 ──────────────────────────────────────────────────────────────────────────────────────────
T("N11: a judged item stores kept AND dropped objections; an unjudged one stores NULL", async () => {
  await run("zz-4e2-objections", null, {}, async (m, res, j) => {
    assertEquals(res.status, 200, `body ${JSON.stringify(j)}`);
    const rows = await items(m.recordId);
    const judged = rows.filter((r) => r.judge_objections !== null);
    assert(judged.length >= 1, "a judged item must carry its objections");
    for (const r of judged) {
      const o = r.judge_objections as { kept: unknown[]; dropped: unknown[] };
      assert(Array.isArray(o.kept) && Array.isArray(o.dropped), "both lists are present on every judged row");
    }
    // The stub objects to the SAME term on every item, but only one passage contains it — so exactly
    // one row drops the objection (N3's term check) and the others keep it. Both halves are stored.
    const dropped = judged.flatMap((r) => (r.judge_objections as { dropped: Array<Record<string, unknown>> }).dropped);
    const kept = judged.flatMap((r) => (r.judge_objections as { kept: Array<Record<string, unknown>> }).kept);
    assertEquals(dropped.length, 1, "the dropped objection is STORED on its row, not only counted");
    assertEquals(dropped[0].type, "added_object");
    assertEquals(dropped[0].why, "the term occurs in the passage");
    assert(kept.length >= 1, "and a surviving objection is stored on the row whose passage lacks the term");
    assertEquals(kept[0].type, "added_object");
    assertEquals(Number(j.objections_dropped), 1, "the run row still counts the drop");
    assertEquals(Number(j.objections_kept), kept.length, "and the keeps");
  });
});

T("N11: judge_objections is fixed at landing — an UPDATE is refused", async () => {
  await run("zz-4e2-objections-immutable", null, {}, async (m) => {
    const rows = await items(m.recordId);
    const target = rows.find((r) => r.judge_objections !== null)!;
    const { error } = await db.from("interview_items")
      .update({ judge_objections: { kept: [], dropped: [] } }).eq("id", target.id as string);
    assert(error !== null, "the trigger must refuse it");
    assert(String(error?.message ?? "").includes("judge objections"), `the refusal names the column: ${error?.message}`);
  });
});

T("4e-2: rows land under the moved version", async () => {
  await run("zz-4e2-version", null, {}, async (m) => {
    const { data } = await db.from("interview_items").select("rules_version").eq("interview_record_id", m.recordId).limit(1);
    assertEquals((data ?? [])[0]?.rules_version, PARSER_RULES_VERSION);
    assertEquals(PARSER_RULES_VERSION, "2026-09-24.4");
  });
});
