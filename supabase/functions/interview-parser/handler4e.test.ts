// ── N4, N5 and N6 THROUGH THE HANDLER (4e) ───────────────────────────────────────────────────────
//
// The three rulings that only exist once the handler wires them together: N4 needs the company's
// current first-read text out of public_reads, N5 needs the located span cut from the record, and N6
// needs the finder's other entries to survive while the story itself does not.
//
// Same shape as handler4a.test.ts: the real local database, a throwaway company per test that is
// always dropped, and a STUBBED Ollama so no model time is spent. Skipped when the stack is not up.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { handleInterviewParse } from "./handler.ts";
import { READ_FEEDBACK_STATEMENT_PREFIX } from "./rules.ts";
import { sha256Hex } from "../_shared/contentIdentity.ts";

const URL_ = Deno.env.get("SUPABASE_URL") ?? "";
const KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const OWNER = Deno.env.get("PARSER_TEST_USER") ?? "";
const live = URL_ !== "" && KEY !== "" && OWNER !== "";
const db = live ? createClient(URL_, KEY) : (null as never);

/** Our own strategy prose. The read-feedback turn below quotes four words of it back at us. */
const READ_PROSE = "a kinship programme with high family-placement retention and strong payer relationships";

const TRANSCRIPT = [
  // 0 — the client reads OUR sentence aloud and reacts to it. The finder calls it a pain_point.
  "Ada Lovelace | 00:00:04",
  "High family placement retention. That is not a thing for us anymore, honestly.",
  "",
  // 1 — a story: a narrative anchor and past-tense verbs.
  "Ada Lovelace | 00:01:10",
  "Last week a family called us and we told them to wait until the Monday after.",
  "",
  // 2 — an ordinary present-tense complaint, which must be untouched by N4 and N6.
  "Grace Hopper | 00:02:30",
  "Reconciling the intake spreadsheet by hand costs us whole days every single month.",
].join("\n");

/** What the finder "returns": one pain_point per passage, quoted with ONE SUBSTITUTED LETTER in the
 *  last passage so the fuzzy rung has to find it and N5 has to put the record's spelling back. */
function startStubOllama(): { port: number; close: () => void } {
  const ac = new AbortController();
  const server = Deno.serve({ port: 0, hostname: "127.0.0.1", signal: ac.signal, onListen: () => {} }, async (req) => {
    const body = await req.json().catch(() => ({})) as { messages?: Array<{ role: string; content: string }> };
    const system = body.messages?.[0]?.content ?? "";
    const user = body.messages?.[1]?.content ?? "";
    let content = "{}";
    if (system.includes("WORK IN TWO STEPS")) {
      const items = user.split("\n\n").flatMap((block) => {
        const head = block.trim().match(/^\[(\d+)\]\s+\[(?:client|ours)\][^:]*:\s*([\s\S]+)$/);
        if (!head) return [];
        const sentence = head[2].trim();
        // The OBJECT is drawn from the passage, as the finder is told to draw it. The QUOTE is where
        // the model slips: one substituted letter, which only the fuzzy rung survives.
        const object = sentence.replace(/[^\p{L}\p{N}\s]/gu, " ").trim().split(/\s+/).slice(0, 3).join(" ");
        const quote = sentence.replace("spreadsheet", "spreadsheat");
        return [{ passage_index: Number(head[1]), kind: "pain_point", scope: "market", object, raw_words: quote }];
      });
      content = JSON.stringify({ items });
    } else if (system.includes("strict ODI canonical form")) {
      const quote = (user.match(/desired_outcome:\s*([\s\S]*?)(?:\njob_executor:|$)/)?.[1] ?? "").trim();
      const object = quote.replace(/[^\p{L}\p{N}\s]/gu, " ").trim().split(/\s+/)
        .filter((w) => !/^(when|whenever|interviewee|interviewer)$/i.test(w)).slice(2, 7).join(" ").toLowerCase();
      content = JSON.stringify({ odi_canonical_statement: `Minimize the time of ${object}` });
    } else if (system.includes("FAITHFUL IN SUBSTANCE")) {
      content = JSON.stringify({ ok: true, objections: [] });
    }
    return new Response(JSON.stringify({ message: { content }, prompt_eval_count: 10, eval_count: 5 }), { headers: { "Content-Type": "application/json" } });
  });
  return { port: (server.addr as Deno.NetAddr).port, close: () => ac.abort() };
}

async function makeRecord(name: string, withRead: boolean) {
  const { data: c } = await db.from("companies").insert({ name, created_by: OWNER }).select("id").single();
  if (withRead) {
    // input_ledger is NOT NULL with no default; an insert that omits it fails SILENTLY through
    // PostgREST and the index comes back empty, which reads exactly like N4 not firing. Assert it.
    const { error: readErr } = await db.from("public_reads").insert({
      company_id: c!.id, kind: "strategy", is_current: true, input_ledger: {},
      payload: { how_to_win: READ_PROSE, how_to_win_citations: ["not prose"], cascade_source: { how_to_win: READ_PROSE } },
    });
    assertEquals(readErr, null, `the fixture read must exist: ${readErr?.message ?? ""}`);
  }
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

async function run(name: string, withRead: boolean, fn: (rows: Array<Record<string, unknown>>, body: Record<string, unknown>) => void) {
  const made = await makeRecord(name, withRead);
  try {
    const stub = startStubOllama();
    const prev = Deno.env.get("OLLAMA_BASE_URL");
    Deno.env.set("OLLAMA_BASE_URL", `http://127.0.0.1:${stub.port}`);
    let body: Record<string, unknown> = {};
    try {
      const res = await handleInterviewParse(
        new Request("http://local/interview-parser", {
          method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
          body: JSON.stringify({ record_id: made.recordId }),
        }),
        { createClient, selfFire: () => Promise.resolve() },
      );
      assertEquals(res.status, 200);
      body = await res.json();
    } finally {
      if (prev === undefined) Deno.env.delete("OLLAMA_BASE_URL"); else Deno.env.set("OLLAMA_BASE_URL", prev);
      stub.close();
    }
    const { data } = await db.from("interview_items")
      .select("id, kind, raw_words, speaker_label, judge_state, judge_reason, pointer, trace_state, framework_statement")
      .eq("interview_record_id", made.recordId).is("retracted_at", null);
    fn((data ?? []) as Array<Record<string, unknown>>, body);
  } finally {
    // public_reads.company_id has NO on-delete rule, so the read must go first or the company delete
    // is refused and the throwaway is left behind. It was, eight times, before this line existed.
    await db.from("public_reads").delete().eq("company_id", made.companyId);
    await db.from("companies").delete().eq("id", made.companyId);
    await db.from("inputs").delete().eq("id", made.inputId);
  }
}

const T = (name: string, fn: () => Promise<void>) =>
  Deno.test({ name, ignore: !live, sanitizeOps: false, sanitizeResources: false, fn });

// ── N4 ───────────────────────────────────────────────────────────────────────────────────────────
T("N4: a turn quoting four words of our current read lands as ASK, not pain_point", async () => {
  await run("zz-4e-n4", true, (rows, body) => {
    // 4e-4: N21 may also capture this passage, so the FINDER's own row is the one under test here —
    // identified by NOT carrying N21's rung. Without that, the plant that disables N4's relabel goes
    // unnoticed because N21's ask is found instead.
    const quoting = rows.find((r) => String(r.raw_words).includes("High family placement retention")
      && (r.pointer as Record<string, unknown> | null)?.locate_rung !== "code_capture");
    assert(quoting, "the read-quoting turn must land a finder item");
    assertEquals(quoting!.kind, "ask", "the deterministic match WINS over the model's kind");
    assert(String(quoting!.judge_reason).startsWith(READ_FEEDBACK_STATEMENT_PREFIX));
    assert(Number(body.read_feedback) >= 1);
    // and the ordinary complaint in the same transcript is untouched by it
    const plain = rows.find((r) => String(r.raw_words).includes("Reconciling the intake"));
    assert(plain, "the ordinary complaint must still land");
    assertEquals(plain!.kind, "pain_point");
  });
});

T("N4: with NO current read the same turn keeps the model's kind — the rule needs our words", async () => {
  await run("zz-4e-n4-noread", false, (rows, body) => {
    const quoting = rows.find((r) => String(r.raw_words).includes("High family placement retention"));
    assert(quoting, "the turn still lands");
    assertEquals(quoting!.kind, "pain_point", "nothing to compare against means nothing to override");
    assertEquals(Number(body.read_index_rows ?? 0), 0);
  });
});

// ── N5 ───────────────────────────────────────────────────────────────────────────────────────────
T("N5: the row carries the RECORD's spelling, not the model's misquote, and names its rung", async () => {
  await run("zz-4e-n5", true, (rows, body) => {
    const cut = rows.find((r) => String(r.raw_words).includes("Reconciling the intake"));
    assert(cut, "the misquoted turn must still land (rule 1)");
    assert(String(cut!.raw_words).includes("spreadsheet"), "the record spells it correctly");
    assert(!String(cut!.raw_words).includes("spreadsheat"), "the model's misquote never reaches the row");
    assertEquals(cut!.trace_state, "located");
    assertEquals((cut!.pointer as Record<string, unknown>).locate_rung, "fuzzy");
    assert(Number(body.recut_from_record) >= 1, "the recut is counted on the run row");
    // every row names a rung, and every row's words are the record's
    for (const r of rows) {
      const rung = (r.pointer as Record<string, unknown>).locate_rung;
      assert(typeof rung === "string" && rung.length > 0, `row ${r.id} has no locate_rung`);
      assert(TRANSCRIPT.includes(String(r.raw_words)), `row ${r.id} stores words the record does not contain`);
    }
    const rungs = body.locate_rungs as Record<string, number>;
    assertEquals(Object.values(rungs).reduce((a, b) => a + Number(b), 0), rows.length + Number(body.stories_refused ?? 0));
  });
});

T("N5: no stored quote ever carries a speaker header or crosses a turn", async () => {
  await run("zz-4e-n5-turn", true, (rows) => {
    for (const r of rows) {
      const w = String(r.raw_words);
      assert(!/\|\s*\d{2}:\d{2}/.test(w), `row ${r.id} swallowed a speaker header`);
      assertEquals(w.split("\n").filter((l) => /\|\s*\d{2}:\d{2}/.test(l)).length, 0);
    }
  });
});

T("N5 x rule 1: a quote found NOWHERE still lands under keep_and_mark, marked not_located", async () => {
  // N5 says the words are the record's. When the locator finds no span at all there is nothing to cut,
  // and rule 1 still says the item lands rather than going missing — so it lands on the model's words
  // with trace_state not_located, which is the row saying whose words they are. An earlier wiring of
  // N5 dropped these, which is rule 1 broken by a rule that never meant to touch it.
  const made = await makeRecord("zz-4e-n5-nowhere", true);
  try {
    const stub = startStubOllamaNowhere();
    const prev = Deno.env.get("OLLAMA_BASE_URL");
    Deno.env.set("OLLAMA_BASE_URL", `http://127.0.0.1:${stub.port}`);
    try {
      const res = await handleInterviewParse(
        new Request("http://local/interview-parser", {
          method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
          body: JSON.stringify({ record_id: made.recordId }),
        }),
        { createClient, selfFire: () => Promise.resolve() },
      );
      assertEquals(res.status, 200);
      const body = await res.json();
      assert(Number(body.not_located) >= 1, "the quote was found nowhere");
    } finally {
      if (prev === undefined) Deno.env.delete("OLLAMA_BASE_URL"); else Deno.env.set("OLLAMA_BASE_URL", prev);
      stub.close();
    }
    const { data } = await db.from("interview_items").select("id, raw_words, trace_state, pointer")
      .eq("interview_record_id", made.recordId).is("retracted_at", null);
    const rows = (data ?? []) as Array<Record<string, unknown>>;
    assert(rows.length >= 1, "rule 1: a candidate the locator could not place still lands");
    // 4e-4: N21 also captures this passage as a code read-reaction (its turn quotes the read), so the
    // not_located row is no longer the only one. What rule 1 asserts is that it is STILL THERE.
    const nl = rows.filter((r) => r.trace_state === "not_located");
    assertEquals(nl.length, 1, "the unplaceable candidate lands, marked");
    assertEquals((nl[0].pointer as Record<string, unknown>).locate_rung, null, "no rung matched, and the row says so");
    // identified by its rung: this select does not carry judge_reason, and the rung says it plainly
    const n21 = rows.filter((r) => (r.pointer as Record<string, unknown>).locate_rung === "code_capture");
    assertEquals(n21.length, rows.length - 1, "every other row here is an N21 capture");
  } finally {
    await db.from("public_reads").delete().eq("company_id", made.companyId);
    await db.from("companies").delete().eq("id", made.companyId);
    await db.from("inputs").delete().eq("id", made.inputId);
  }
});

/** A finder that quotes words the transcript does not contain at all — no rung can place them. */
function startStubOllamaNowhere(): { port: number; close: () => void } {
  const ac = new AbortController();
  const server = Deno.serve({ port: 0, hostname: "127.0.0.1", signal: ac.signal, onListen: () => {} }, async (req) => {
    const body = await req.json().catch(() => ({})) as { messages?: Array<{ role: string; content: string }> };
    const system = body.messages?.[0]?.content ?? "";
    let content = "{}";
    if (system.includes("WORK IN TWO STEPS")) {
      // the object IS in the passage (so the two-step check admits it); the QUOTE is invented
      content = JSON.stringify({ items: [{
        passage_index: 0, kind: "pain_point", scope: "market", object: "family placement retention",
        raw_words: "High family placement retention is measured by a completely different yardstick elsewhere entirely.",
      }] });
    } else if (system.includes("strict ODI canonical form")) {
      content = JSON.stringify({ odi_canonical_statement: "Minimize the effort of family placement retention" });
    } else if (system.includes("FAITHFUL IN SUBSTANCE")) {
      content = JSON.stringify({ ok: true, objections: [] });
    }
    return new Response(JSON.stringify({ message: { content }, prompt_eval_count: 1, eval_count: 1 }), { headers: { "Content-Type": "application/json" } });
  });
  return { port: (server.addr as Deno.NetAddr).port, close: () => ac.abort() };
}

// ── N6 ───────────────────────────────────────────────────────────────────────────────────────────
T("N6: the narrated story does not land as a pain point, and the refusal is counted", async () => {
  await run("zz-4e-n6", true, (rows, body) => {
    const story = rows.find((r) => String(r.raw_words).includes("Last week a family called"));
    assertEquals(story, undefined, "a story is never a pain_point — it yields only what it implies");
    assertEquals(Number(body.stories_refused), 1, "and the refusal is on the run row, never silent");
    // the other two passages are untouched: the rule is narrow
    assertEquals(rows.length, 2);
  });
});
