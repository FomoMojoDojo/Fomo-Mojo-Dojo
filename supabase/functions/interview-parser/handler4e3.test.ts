// ── N17(a) and the counter carry-forward THROUGH THE HANDLER (4e-3) ─────────────────────────────
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { COMPONENT, RUN_REF, handleInterviewParse, newTally } from "./handler.ts";
import { READ_FEEDBACK_STATEMENT_PREFIX } from "./rules.ts";
import { sha256Hex } from "../_shared/contentIdentity.ts";

const URL_ = Deno.env.get("SUPABASE_URL") ?? "";
const KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const OWNER = Deno.env.get("PARSER_TEST_USER") ?? "";
const live = URL_ !== "" && KEY !== "" && OWNER !== "";
const db = live ? createClient(URL_, KEY) : (null as never);

/** Our strategy prose. OUR turn quotes it; the client's answer shares NOTHING with it — which is
 *  exactly the case N4's overlap test cannot see and N17(a) exists for. */
const READ_PROSE = "a kinship programme with high family-placement retention and strong payer relationships";
const TRANSCRIPT = [
  "Bob Skubic | 00:00:04",                                   // OURS, reading the line aloud
  "A kinship programme with high family-placement retention and strong payer relationships.",
  "",
  "Ada Lovelace | 00:00:30",                                 // CLIENT, answering it in her own words
  "That framing lands wrong for us and it is not where the work actually sits now.",
  "",
  "Ada Lovelace | 00:00:50",                                 // CLIENT, back-channel: under N21's floor
  "Yeah, right.",
  "",
  "Ada Lovelace | 00:01:10",                                 // CLIENT, a spacer: N17(a) reaches TWO
  "Anyway, that is a separate matter from what I was going to raise with you today.",
  "",
  "Grace Hopper | 00:02:30",                                 // CLIENT, now three turns from our read
  "Reconciling the intake spreadsheet by hand costs us whole days every single month.",
].join("\n");

function stub(): { port: number; close: () => void } {
  const ac = new AbortController();
  const server = Deno.serve({ port: 0, hostname: "127.0.0.1", signal: ac.signal, onListen: () => {} }, async (req) => {
    const b = await req.json().catch(() => ({})) as { messages?: Array<{ content: string }> };
    const system = b.messages?.[0]?.content ?? "", user = b.messages?.[1]?.content ?? "";
    let content = "{}";
    if (system.includes("WORK IN TWO STEPS")) {
      const items = user.split("\n\n").flatMap((block) => {
        const head = block.trim().match(/^\[(\d+)\]\s+\[(?:client|ours)\][^:]*:\s*([\s\S]+)$/);
        if (!head) return [];
        const sentence = head[2].trim();
        const object = sentence.replace(/[^\p{L}\p{N}\s]/gu, " ").trim().split(/\s+/).slice(0, 3).join(" ");
        // deliberately NOT an ask: N17(a) must override the model's kind
        return [{ passage_index: Number(head[1]), kind: "pain_point", scope: "market", object, raw_words: sentence }];
      });
      content = JSON.stringify({ items });
    } else if (system.includes("strict ODI canonical form")) {
      const quote = (user.match(/desired_outcome:\s*([\s\S]*?)(?:\njob_executor:|$)/)?.[1] ?? "").trim();
      const object = quote.replace(/[^\p{L}\p{N}\s]/gu, " ").trim().split(/\s+/).slice(2, 7).join(" ").toLowerCase();
      content = JSON.stringify({ odi_canonical_statement: `Minimize the time of ${object}` });
    } else if (system.includes("FAITHFUL IN SUBSTANCE")) {
      content = JSON.stringify({ ok: true, objections: [] });
    }
    return new Response(JSON.stringify({ message: { content }, done_reason: "stop", prompt_eval_count: 10, eval_count: 5 }), { headers: { "Content-Type": "application/json" } });
  });
  return { port: (server.addr as Deno.NetAddr).port, close: () => ac.abort() };
}

async function makeRecord(name: string) {
  const { data: c } = await db.from("companies").insert({ name, created_by: OWNER }).select("id").single();
  const { error: readErr } = await db.from("public_reads").insert({
    company_id: c!.id, kind: "strategy", is_current: true, input_ledger: {}, payload: { how_to_win: READ_PROSE },
  });
  assertEquals(readErr, null, `the fixture read must exist: ${readErr?.message ?? ""}`);
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
    our_speakers: ["Bob Skubic"],
  }).select("id").single();
  return { companyId: c!.id as string, recordId: r!.id as string, inputId: inp!.id as string };
}
const drop = async (m: { companyId: string; inputId: string }) => {
  await db.from("public_reads").delete().eq("company_id", m.companyId);
  await db.from("companies").delete().eq("id", m.companyId);
  await db.from("inputs").delete().eq("id", m.inputId);
};
const T = (name: string, fn: () => Promise<void>) => Deno.test({ name, ignore: !live, sanitizeOps: false, sanitizeResources: false, fn });

T("N17(a): a client turn AFTER our read-quoting turn is an ask, though its own words share nothing", async () => {
  const made = await makeRecord("zz-4e3-n17a");
  try {
    const s = stub();
    const prev = Deno.env.get("OLLAMA_BASE_URL");
    Deno.env.set("OLLAMA_BASE_URL", `http://127.0.0.1:${s.port}`);
    let body: Record<string, unknown> = {};
    try {
      const res = await handleInterviewParse(new Request("http://local/interview-parser", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
        body: JSON.stringify({ record_id: made.recordId }),
      }), { createClient, selfFire: () => Promise.resolve() });
      assertEquals(res.status, 200);
      body = await res.json();
    } finally { if (prev === undefined) Deno.env.delete("OLLAMA_BASE_URL"); else Deno.env.set("OLLAMA_BASE_URL", prev); s.close(); }

    const { data } = await db.from("interview_items").select("kind, raw_words, judge_reason, speaker_side")
      .eq("interview_record_id", made.recordId).is("retracted_at", null);
    const rows = (data ?? []) as Array<Record<string, unknown>>;
    const reaction = rows.find((r) => String(r.raw_words).includes("lands wrong"));
    assert(reaction, "the client's answer must land");
    assertEquals(reaction!.kind, "ask", "N17(a): the deterministic match wins over the model's pain_point");
    assert(String(reaction!.judge_reason).startsWith(READ_FEEDBACK_STATEMENT_PREFIX));
    // and the far-away client turn is untouched by it
    const plain = rows.find((r) => String(r.raw_words).includes("Reconciling the intake"));
    assert(plain, "the unrelated complaint must still land");
    assertEquals(plain!.kind, "pain_point", "N17(a) must not fire on a turn our read never preceded");
    // the trigger is recorded, and it is the N17 code route, not N4's overlap
    const by = body.read_feedback_by as Record<string, number>;
    assert(by.n17_code >= 1, `N17(a) must have fired: ${JSON.stringify(by)}`);
    assertEquals(by.n4_overlap, 0, "the client's own words share nothing with the read");
  } finally { await drop(made); }
});

T("4e-3: every counter is carried across a pass boundary", async () => {
  // The bug the replay caught: the mid-pass write omitted finder_drops and read_feedback, so a
  // two-pass run reported only the last pass's numbers. Pass 1 is forced to stop after one unit.
  const made = await makeRecord("zz-4e3-carry");
  try {
    const s = stub();
    const prev = Deno.env.get("OLLAMA_BASE_URL");
    Deno.env.set("OLLAMA_BASE_URL", `http://127.0.0.1:${s.port}`);
    try {
      const base = Date.now(); let n = 0;
      await handleInterviewParse(new Request("http://local/interview-parser", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
        body: JSON.stringify({ record_id: made.recordId }),
      }), { createClient, selfFire: () => Promise.resolve(), now: () => { n++; return n <= 2 ? base : base + 400_000; } });
    } finally { if (prev === undefined) Deno.env.delete("OLLAMA_BASE_URL"); else Deno.env.set("OLLAMA_BASE_URL", prev); s.close(); }
    const { data: runs } = await db.from("integrity_runs").select("excluded_by_rule")
      .eq("company_id", made.companyId).eq("component", COMPONENT).eq("run_ref", RUN_REF);
    const payload = ((runs ?? [])[0] as Record<string, unknown>).excluded_by_rule as Record<string, unknown>;
    // the mid-pass write must carry every counter, not just the ones it used to
    for (const k of ["finder_drops", "read_feedback", "read_feedback_by", "splits", "capped",
                     "objections_dropped", "objections_kept", "locate_rungs", "units"]) {
      assert(payload[k] !== undefined, `the mid-pass write dropped ${k}`);
    }
  } finally { await drop(made); }
});

// ── N15 depth: a fixture big enough that a half COULD split again ───────────────────────────────
/** Eight client turns: one window, which halves into four passages, which could halve again. The
 *  depth guard — not an un-splittable single passage — is what has to stop it. */
const DEEP = (() => {
  const l: string[] = [];
  for (let i = 0; i < 8; i++) {
    l.push(`Ada Lovelace | 00:0${i}:00`);
    l.push(`Reconciling the intake spreadsheet by hand costs whole days in month number ${i} of the year.`);
    l.push("");
  }
  return l.join("\n");
})();

function capAlwaysStub(): { port: number; close: () => void } {
  const ac = new AbortController();
  const server = Deno.serve({ port: 0, hostname: "127.0.0.1", signal: ac.signal, onListen: () => {} }, async (req) => {
    const b = await req.json().catch(() => ({})) as { messages?: Array<{ content: string }> };
    const system = b.messages?.[0]?.content ?? "";
    const finder = system.includes("WORK IN TWO STEPS");
    return new Response(JSON.stringify({
      message: { content: finder ? JSON.stringify({ items: [] }) : "{}" },
      done_reason: finder ? "length" : "stop", prompt_eval_count: 10, eval_count: 2048,
    }), { headers: { "Content-Type": "application/json" } });
  });
  return { port: (server.addr as Deno.NetAddr).port, close: () => ac.abort() };
}

async function makeDeep(name: string) {
  const { data: c } = await db.from("companies").insert({ name, created_by: OWNER }).select("id").single();
  const { data: inp } = await db.from("inputs").insert({
    user_id: OWNER, company_id: c!.id, input_key: name, input_label: name, group_key: "market_evidence",
    group_label: "Market evidence", sub_group: "interviews", completeness: 0, status: "partial",
    score_impact: 0, impact_tier: "low", description: "t", why_it_matters: "t", frameworks_used: [],
  }).select("id").single();
  const { data: f } = await db.from("input_files").insert({
    input_id: inp!.id, file_name: `${name}.txt`, file_type: "text/plain", file_path: `zz/${name}.txt`, is_interview: true,
  }).select("id").single();
  const sha = await sha256Hex(DEEP);
  const { data: r } = await db.from("interview_records").insert({
    company_id: c!.id, speaker_role: "client_stakeholder", person_name: "P", person_role: "R",
    interviewed_at: new Date().toISOString(), interviewer: "I", consent_basis: "verbal", created_by: OWNER,
    verbatim: DEEP, input_file_id: f!.id, text_sha256: sha, file_sha256: sha,
    file_bytes: DEEP.length, extraction_method: "local_text_reader", extraction_version: "test",
    our_speakers: [],
  }).select("id").single();
  return { companyId: c!.id as string, recordId: r!.id as string, inputId: inp!.id as string };
}

T("N15 depth: a half that caps again FAILS — it is never split a second time", async () => {
  const made = await makeDeep("zz-4e3-depth");
  try {
    const s = capAlwaysStub();
    const prev = Deno.env.get("OLLAMA_BASE_URL");
    Deno.env.set("OLLAMA_BASE_URL", `http://127.0.0.1:${s.port}`);
    try {
      const res = await handleInterviewParse(new Request("http://local/interview-parser", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
        body: JSON.stringify({ record_id: made.recordId }),
      }), { createClient, selfFire: () => Promise.resolve() });
      const j = await res.json();
      assertEquals(res.status, 500, `body ${JSON.stringify(j)}`);
      assertEquals(j.error, "finder_output_cap");
      assertEquals(Number(j.splits), 1, "EXACTLY ONE split: the half is not split again");
      assertEquals(Number(j.windows), 2, "one window became two units and stopped there");
      assertEquals(j.cursor, 0, "the cursor is kept");
      assertEquals((j.capped as Record<string, number>).finder, 2, "the whole capped, then the half capped");
    } finally { if (prev === undefined) Deno.env.delete("OLLAMA_BASE_URL"); else Deno.env.set("OLLAMA_BASE_URL", prev); s.close(); }
  } finally { await drop(made); }
});

// ── N21 through the handler ─────────────────────────────────────────────────────────────────────
/** A finder that returns NOTHING, so N21 is the only source of items and can be seen on its own.
 *  With the ordinary stub the finder's item on the same turn is relabelled to `ask` over the same
 *  recut words and passage — an IDENTICAL content identity — and the unique index refuses N21's row.
 *  That is the ruling working ("content identity prevents duplicates"), but it hides N21 from view. */
function emptyFinderStub(): { port: number; close: () => void } {
  const ac = new AbortController();
  const server = Deno.serve({ port: 0, hostname: "127.0.0.1", signal: ac.signal, onListen: () => {} }, async (req) => {
    const b = await req.json().catch(() => ({})) as { messages?: Array<{ content: string }> };
    const finder = (b.messages?.[0]?.content ?? "").includes("WORK IN TWO STEPS");
    return new Response(JSON.stringify({
      message: { content: finder ? JSON.stringify({ items: [] }) : "{}" },
      done_reason: "stop", prompt_eval_count: 1, eval_count: 1,
    }), { headers: { "Content-Type": "application/json" } });
  });
  return { port: (server.addr as Deno.NetAddr).port, close: () => ac.abort() };
}

T("N21: the code capture lands the reaction by route (b), and the floor keeps back-channel out", async () => {
  const made = await makeRecord("zz-4e4-n21");
  try {
    const s = emptyFinderStub();
    const prev = Deno.env.get("OLLAMA_BASE_URL");
    Deno.env.set("OLLAMA_BASE_URL", `http://127.0.0.1:${s.port}`);
    let body: Record<string, unknown> = {};
    try {
      const res = await handleInterviewParse(new Request("http://local/interview-parser", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
        body: JSON.stringify({ record_id: made.recordId }),
      }), { createClient, selfFire: () => Promise.resolve() });
      assertEquals(res.status, 200);
      body = await res.json();
    } finally { if (prev === undefined) Deno.env.delete("OLLAMA_BASE_URL"); else Deno.env.set("OLLAMA_BASE_URL", prev); s.close(); }

    const { data } = await db.from("interview_items")
      .select("kind, raw_words, judge_reason, speaker_side, trace_state, pointer")
      .eq("interview_record_id", made.recordId).is("retracted_at", null);
    const rows = (data ?? []) as Array<Record<string, unknown>>;
    const captures = rows.filter((r) => (r.pointer as Record<string, unknown>).locate_rung === "code_capture");
    assert(captures.length >= 1, "the reaction must be captured by code");
    for (const c of captures) {
      assertEquals(c.kind, "ask");
      assertEquals(c.speaker_side, "client", "N21 never captures our own side");
      assertEquals(c.trace_state, "located");
      assert(String(c.judge_reason).startsWith("read feedback:"), String(c.judge_reason));
      assert(String(c.judge_reason).includes("read reaction captured by code"));
      assert(!/\|\s*\d{2}:\d{2}/.test(String(c.raw_words)), "the speaker header is not part of the words");
    }
    // the back-channel turn is under the six-word floor and must NOT be captured
    assertEquals(captures.filter((c) => String(c.raw_words).includes("Yeah, right")).length, 0, "the floor holds");
    // the route is recorded, and the run row counts it
    const routes = captures.map((c) => (c.pointer as Record<string, unknown>).n21_route);
    assert(routes.includes("b_preceded_by_our_read_turn"), `routes seen: ${JSON.stringify(routes)}`);
    assertEquals(Number(body.read_feedback_code_capture), captures.length);
    assertEquals(captures.length, 1, "exactly the one qualifying turn, once per passage");
    const by = body.read_feedback_by as Record<string, number>;
    assert(by.n21_route_b >= 1, JSON.stringify(by));
  } finally { await drop(made); }
});

// ── The speaker header, guarded ────────────────────────────────────────────────────────────────
// A turn's text carries its own header line ("Ada Lovelace | 00:00:50"). That header is five words
// the speaker never said. It let a TWO-WORD back-channel clear N21's six-word floor, and it would sit
// inside raw_words if it were ever stored. Both halves are pinned here, each with its own plant.

/** One our-side turn that quotes the read, then a two-word client back-channel, and nothing else. The
 *  back-channel is the whole point: with the header counted it is seven words and clears the floor. */
const HEADER_FIXTURE = [
  "Bob Skubic | 00:00:04",
  "A kinship programme with high family-placement retention and strong payer relationships.",
  "",
  "Ada Lovelace | 00:00:50",
  "Yeah, right.",
].join("\n");

async function makeHeaderRecord(name: string) {
  const { data: c } = await db.from("companies").insert({ name, created_by: OWNER }).select("id").single();
  const { error: readErr } = await db.from("public_reads").insert({
    company_id: c!.id, kind: "strategy", is_current: true, input_ledger: {}, payload: { how_to_win: READ_PROSE },
  });
  assertEquals(readErr, null, `the fixture read must exist: ${readErr?.message ?? ""}`);
  const { data: inp } = await db.from("inputs").insert({
    user_id: OWNER, company_id: c!.id, input_key: name, input_label: name, group_key: "market_evidence",
    group_label: "Market evidence", sub_group: "interviews", completeness: 0, status: "partial",
    score_impact: 0, impact_tier: "low", description: "t", why_it_matters: "t", frameworks_used: [],
  }).select("id").single();
  const { data: f } = await db.from("input_files").insert({
    input_id: inp!.id, file_name: `${name}.txt`, file_type: "text/plain", file_path: `zz/${name}.txt`, is_interview: true,
  }).select("id").single();
  const sha = await sha256Hex(HEADER_FIXTURE);
  const { data: r } = await db.from("interview_records").insert({
    company_id: c!.id, speaker_role: "client_stakeholder", person_name: "P", person_role: "R",
    interviewed_at: new Date().toISOString(), interviewer: "I", consent_basis: "verbal", created_by: OWNER,
    verbatim: HEADER_FIXTURE, input_file_id: f!.id, text_sha256: sha, file_sha256: sha,
    file_bytes: HEADER_FIXTURE.length, extraction_method: "local_text_reader", extraction_version: "test",
    our_speakers: ["Bob Skubic"],
  }).select("id").single();
  return { companyId: c!.id as string, recordId: r!.id as string, inputId: inp!.id as string };
}

async function runHeaderFixture(name: string) {
  const made = await makeHeaderRecord(name);
  const s = emptyFinderStub();
  const prev = Deno.env.get("OLLAMA_BASE_URL");
  Deno.env.set("OLLAMA_BASE_URL", `http://127.0.0.1:${s.port}`);
  try {
    const res = await handleInterviewParse(new Request("http://local/interview-parser", {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
      body: JSON.stringify({ record_id: made.recordId }),
    }), { createClient, selfFire: () => Promise.resolve() });
    assertEquals(res.status, 200);
    const { data } = await db.from("interview_items").select("kind, raw_words, pointer")
      .eq("interview_record_id", made.recordId).is("retracted_at", null);
    return { made, rows: (data ?? []) as Array<Record<string, unknown>> };
  } finally {
    if (prev === undefined) Deno.env.delete("OLLAMA_BASE_URL"); else Deno.env.set("OLLAMA_BASE_URL", prev);
    s.close();
  }
}

T("header guard: a two-word back-channel after our read turn is NOT captured, header notwithstanding", async () => {
  const { made, rows } = await runHeaderFixture("zz-4e4-hdr-floor");
  try {
    const captures = rows.filter((r) => (r.pointer as Record<string, unknown>).locate_rung === "code_capture");
    assertEquals(captures.length, 0,
      `the only client turn is two words; counting its header makes it seven and it wrongly clears the floor. captured: ${JSON.stringify(captures.map((c) => c.raw_words))}`);
  } finally { await drop(made); }
});

T("header guard: raw_words never contains the speaker header", async () => {
  // The same fixture with a client turn long enough to BE captured, so there is a row to inspect.
  const made = await makeRecord("zz-4e4-hdr-rawwords");
  try {
    const s = emptyFinderStub();
    const prev = Deno.env.get("OLLAMA_BASE_URL");
    Deno.env.set("OLLAMA_BASE_URL", `http://127.0.0.1:${s.port}`);
    try {
      const res = await handleInterviewParse(new Request("http://local/interview-parser", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
        body: JSON.stringify({ record_id: made.recordId }),
      }), { createClient, selfFire: () => Promise.resolve() });
      assertEquals(res.status, 200);
    } finally { if (prev === undefined) Deno.env.delete("OLLAMA_BASE_URL"); else Deno.env.set("OLLAMA_BASE_URL", prev); s.close(); }
    const { data } = await db.from("interview_items").select("raw_words, pointer")
      .eq("interview_record_id", made.recordId).is("retracted_at", null);
    const rows = (data ?? []) as Array<Record<string, unknown>>;
    const captures = rows.filter((r) => (r.pointer as Record<string, unknown>).locate_rung === "code_capture");
    assert(captures.length >= 1, "there must be a capture to inspect");
    for (const r of rows) {
      const w = String(r.raw_words);
      assert(!/\|\s*\d{1,2}:\d{2}/.test(w), `raw_words carries a speaker header: ${w.slice(0, 40)}`);
      assert(!/^[A-Z][a-z]+ [A-Z][a-z]+ \|/.test(w), "raw_words starts with a speaker label");
    }
  } finally { await drop(made); }
});

// ── read_feedback_by across a pass boundary ────────────────────────────────────────────────────
// Run 4367 reported read_feedback_by all-zero while four N21 captures sat on the rows: the counter was
// not in the carry-forward block, so pass 2 overwrote pass 1's tally with its own empty one — the same
// class of bug the finder_drops fix was written for, and missed by it.
/** Two windows' worth: our read-quoting turn and the client's reaction sit in UNIT 0, and enough
 *  filler follows to push toWindows past one window. The capture must therefore land in PASS 1 while
 *  pass 2 still has work — which is the only shape in which a non-carried counter is lost. */
const CARRY_FIXTURE = (() => {
  const l: string[] = [
    "Bob Skubic | 00:00:04",
    "A kinship programme with high family-placement retention and strong payer relationships.",
    "",
    "Ada Lovelace | 00:00:30",
    "That framing lands wrong for us and it is not where the work actually sits now, honestly.",
    "",
  ];
  for (let i = 0; i < 90; i++) {
    l.push(`Grace Hopper | 00:${String(10 + Math.floor(i / 60)).padStart(2, "0")}:${String(i % 60).padStart(2, "0")}`);
    l.push(`Reconciling the intake spreadsheet by hand costs whole days in month number ${i} of the year, every single time without fail.`);
    l.push("");
  }
  return l.join("\n");
})();

async function makeCarryRecord(name: string) {
  const { data: c } = await db.from("companies").insert({ name, created_by: OWNER }).select("id").single();
  const { error: readErr } = await db.from("public_reads").insert({
    company_id: c!.id, kind: "strategy", is_current: true, input_ledger: {}, payload: { how_to_win: READ_PROSE },
  });
  assertEquals(readErr, null, `the fixture read must exist: ${readErr?.message ?? ""}`);
  const { data: inp } = await db.from("inputs").insert({
    user_id: OWNER, company_id: c!.id, input_key: name, input_label: name, group_key: "market_evidence",
    group_label: "Market evidence", sub_group: "interviews", completeness: 0, status: "partial",
    score_impact: 0, impact_tier: "low", description: "t", why_it_matters: "t", frameworks_used: [],
  }).select("id").single();
  const { data: f } = await db.from("input_files").insert({
    input_id: inp!.id, file_name: `${name}.txt`, file_type: "text/plain", file_path: `zz/${name}.txt`, is_interview: true,
  }).select("id").single();
  const sha = await sha256Hex(CARRY_FIXTURE);
  const { data: r } = await db.from("interview_records").insert({
    company_id: c!.id, speaker_role: "client_stakeholder", person_name: "P", person_role: "R",
    interviewed_at: new Date().toISOString(), interviewer: "I", consent_basis: "verbal", created_by: OWNER,
    verbatim: CARRY_FIXTURE, input_file_id: f!.id, text_sha256: sha, file_sha256: sha,
    file_bytes: CARRY_FIXTURE.length, extraction_method: "local_text_reader", extraction_version: "test",
    our_speakers: ["Bob Skubic"],
  }).select("id").single();
  return { companyId: c!.id as string, recordId: r!.id as string, inputId: inp!.id as string };
}

T("read_feedback_by survives a pass boundary, by route", async () => {
  const made = await makeCarryRecord("zz-4e4-rfby-carry");
  try {
    const s = emptyFinderStub();
    const prev = Deno.env.get("OLLAMA_BASE_URL");
    Deno.env.set("OLLAMA_BASE_URL", `http://127.0.0.1:${s.port}`);
    let p1: Record<string, unknown> = {};
    try {
      // pass 1: the clock opens the budget for the first unit and closes it after, so the N21 capture
      // in unit 0 lands in pass 1 and units 1+ are left for pass 2.
      const base = Date.now(); let n = 0;
      const r1 = await handleInterviewParse(new Request("http://local/interview-parser", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
        body: JSON.stringify({ record_id: made.recordId }),
      }), { createClient, selfFire: () => Promise.resolve(), now: () => { n++; return n <= 4 ? base : base + 400_000; } });
      p1 = await r1.json();
      assertEquals(Number(p1.windows_done), 1, `pass 1 must do exactly one unit: ${JSON.stringify(p1)}`);
      assertEquals(p1.done, false, "and leave work behind");
      assert(Number((p1.read_feedback_by as Record<string, number>).n21_route_b) >= 1,
        `pass 1 must carry the capture: ${JSON.stringify(p1.read_feedback_by)}`);
      // pass 2, resuming: it has no capture of its own
      const r2 = await handleInterviewParse(new Request("http://local/interview-parser", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
        body: JSON.stringify({ record_id: made.recordId, resume: true }),
      }), { createClient, selfFire: () => Promise.resolve() });
      await r2.json();
    } finally { if (prev === undefined) Deno.env.delete("OLLAMA_BASE_URL"); else Deno.env.set("OLLAMA_BASE_URL", prev); s.close(); }

    const { data: runs } = await db.from("integrity_runs").select("excluded_by_rule")
      .eq("company_id", made.companyId).eq("component", COMPONENT).eq("run_ref", RUN_REF);
    const payload = ((runs ?? [])[0] as Record<string, unknown>).excluded_by_rule as Record<string, unknown>;
    const by = (payload.read_feedback_by ?? {}) as Record<string, number>;
    const captures = Number(payload.read_feedback_code_capture ?? 0);
    assert(captures >= 1, `the run must record the capture; got ${captures}`);
    const byTotal = Object.values(by).reduce((a, b) => a + Number(b), 0);
    assertEquals(byTotal, captures,
      `read_feedback_by must survive the pass boundary: by=${JSON.stringify(by)} vs code_capture=${captures}`);
    assert(Number(by.n21_route_b ?? 0) >= 1, `the route must survive too: ${JSON.stringify(by)}`);
  } finally { await drop(made); }
});

/** 4e-4c: a finder that offers exactly one item, on OUR side, and only in the unit that holds it.
 *  Every other unit gets an empty list, so pass 2 lands nothing of ours and the run row's ours_landed
 *  can only be right if pass 1's count was carried. */
function oursOnlyFinderStub(): { port: number; close: () => void } {
  const ac = new AbortController();
  const server = Deno.serve({ port: 0, hostname: "127.0.0.1", signal: ac.signal, onListen: () => {} }, async (req) => {
    const b = await req.json().catch(() => ({})) as { messages?: Array<{ content: string }> };
    const system = b.messages?.[0]?.content ?? "", user = b.messages?.[1]?.content ?? "";
    let content = "{}";
    if (system.includes("WORK IN TWO STEPS")) {
      const items = user.split("\n\n").flatMap((block) => {
        const head = block.trim().match(/^\[(\d+)\]\s+\[ours\][^:]*:\s*([\s\S]+)$/);
        if (!head || !head[2].includes("kinship programme")) return [];
        return [{ passage_index: Number(head[1]), kind: "pain_point", scope: "market", object: "kinship programme", raw_words: head[2].trim() }];
      });
      content = JSON.stringify({ items });
    }
    return new Response(JSON.stringify({ message: { content }, done_reason: "stop", prompt_eval_count: 10, eval_count: 5 }), { headers: { "Content-Type": "application/json" } });
  });
  return { port: (server.addr as Deno.NetAddr).port, close: () => ac.abort() };
}

/** Pass 1 does one unit under a clock that expires after it; pass 2 resumes with a normal clock. */
async function twoPasses(recordId: string, port: number) {
  const prev = Deno.env.get("OLLAMA_BASE_URL");
  Deno.env.set("OLLAMA_BASE_URL", `http://127.0.0.1:${port}`);
  try {
    const base = Date.now(); let n = 0;
    const r1 = await handleInterviewParse(new Request("http://local/interview-parser", {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
      body: JSON.stringify({ record_id: recordId }),
    }), { createClient, selfFire: () => Promise.resolve(), now: () => { n++; return n <= 4 ? base : base + 400_000; } });
    const p1 = await r1.json() as Record<string, unknown>;
    assertEquals(Number(p1.windows_done), 1, `pass 1 must do exactly one unit: ${JSON.stringify(p1)}`);
    assertEquals(p1.done, false, "and leave work behind");
    return { p1, pass2: async () => {
      const r2 = await handleInterviewParse(new Request("http://local/interview-parser", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
        body: JSON.stringify({ record_id: recordId, resume: true }),
      }), { createClient, selfFire: () => Promise.resolve() });
      return await r2.json() as Record<string, unknown>;
    } };
  } finally { if (prev === undefined) Deno.env.delete("OLLAMA_BASE_URL"); else Deno.env.set("OLLAMA_BASE_URL", prev); }
}

const runPayload = async (companyId: string) => {
  const { data } = await db.from("integrity_runs").select("excluded_by_rule")
    .eq("company_id", companyId).eq("component", COMPONENT).eq("run_ref", RUN_REF);
  return ((data ?? [])[0] as Record<string, unknown>).excluded_by_rule as Record<string, unknown>;
};

T("ours_landed survives a pass boundary", async () => {
  const made = await makeCarryRecord("zz-4e4c-ours-carry");
  const s = oursOnlyFinderStub();
  try {
    const { pass2 } = await twoPasses(made.recordId, s.port);
    await pass2();
    s.close();

    const { data: rows } = await db.from("interview_items").select("speaker_side")
      .eq("company_id", made.companyId).is("retracted_at", null);
    const oursRows = (rows ?? []).filter((r) => (r as { speaker_side: string }).speaker_side === "ours").length;
    assert(oursRows >= 1, `the fixture must land at least one of our items; got ${oursRows}`);

    const payload = await runPayload(made.companyId);
    assertEquals(Number(payload.ours_landed ?? 0), oursRows,
      `ours_landed must survive the pass boundary: row says ${payload.ours_landed} against ${oursRows} of our items`);
    // 4e-4c: finder_raw must CLOSE the ledger that every review sheet so far had to derive by hand —
    // every item the finder offered ends either landed or in one of the five gate counters. (The item
    // is offered twice: unit 2 is shown unit 1's turn as context, and the second offer is dropped as a
    // duplicate. Both halves are counted, which is the point.) Summed across the two passes, so it is
    // only right if pass 2 carried pass 1's.
    const dropped = Object.entries((payload.finder_drops ?? {}) as Record<string, number>)
      .filter(([k]) => k !== "object_in_other_passage").reduce((a, [, v]) => a + Number(v), 0);
    assertEquals(Number(payload.stories_refused ?? 0), 0, "the fixture refuses no story");
    assertEquals(Number(payload.cross_turn_refused ?? 0), 0, "and refuses nothing cross-turn");
    const fromFinder = Number(payload.landed ?? 0) - Number(payload.read_feedback_code_capture ?? 0);
    assertEquals(Number(payload.finder_raw ?? -1), fromFinder + dropped,
      `finder_raw must close: ${payload.finder_raw} vs ${fromFinder} landed + ${dropped} dropped`);
    assert(Number(payload.finder_raw ?? 0) > 0, "and must not be zero");
  } finally { s.close(); await drop(made); }
});

T("every counter in the tally survives a pass boundary, by enumeration", async () => {
  const made = await makeCarryRecord("zz-4e4c-tally-carry");
  const s = emptyFinderStub();
  try {
    const { pass2 } = await twoPasses(made.recordId, s.port);

    // Seed EVERY key of the tally, enumerated at run time from the handler's own factory — so a
    // counter added later is covered by this test the day it is added, without editing it. Maps get
    // a synthetic sub-key too: a map can gain a key at run time (locate_rungs gains code_capture only
    // when N21 fires), and a carry that walks only the fresh object's keys silently drops it.
    const shape = newTally() as unknown as Record<string, unknown>;
    const seed: Record<string, unknown> = {};
    let v = 7000;
    for (const k of Object.keys(shape)) {
      if (typeof shape[k] === "number") seed[k] = ++v;
      else {
        const m: Record<string, number> = {};
        for (const kk of Object.keys(shape[k] as Record<string, number>)) m[kk] = ++v;
        m["zz_probe"] = ++v;                       // the key that exists only in the stored row
        seed[k] = m;
      }
    }
    const before = await runPayload(made.companyId);
    const { data: run } = await db.from("integrity_runs").select("id")
      .eq("company_id", made.companyId).eq("component", COMPONENT).eq("run_ref", RUN_REF).limit(1);
    const runId = (run ?? [])[0] as { id: number };
    const { error: seedErr } = await db.from("integrity_runs")
      .update({ excluded_by_rule: { ...before, ...seed } }).eq("id", runId.id);
    assertEquals(seedErr, null, `the seed must be written: ${seedErr?.message ?? ""}`);

    await pass2();
    s.close();

    const after = await runPayload(made.companyId);
    const missing: string[] = [];
    for (const k of Object.keys(shape)) {
      if (typeof shape[k] === "number") {
        const was = Number(seed[k]), now = Number(after[k] ?? -1);
        if (!(now >= was)) missing.push(`${k}: ${now} < seeded ${was}`);
      } else {
        const wasM = seed[k] as Record<string, number>;
        const nowM = (after[k] ?? {}) as Record<string, number>;
        for (const kk of Object.keys(wasM)) {
          const now = Number(nowM[kk] ?? -1);
          if (!(now >= wasM[kk])) missing.push(`${k}.${kk}: ${now} < seeded ${wasM[kk]}`);
        }
      }
    }
    assertEquals(missing, [], `every counter must survive pass 2; lost: ${missing.join(" | ")}`);
    assert(Object.keys(shape).includes("finder_raw"), "finder_raw must be part of the tally");
    assert(Number(after.finder_raw ?? 0) >= Number(seed.finder_raw), "and must be on the run row");
  } finally { s.close(); await drop(made); }
});
