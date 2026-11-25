// SP-652 (2026-11-24): the judge replay — every refusal, and the happy path.
import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { JudgeReplay, LedgerProof, ReplayRefusal, applyNeedSql, bindingTexts, type NeedBinding, type ReplayRefusalKind, type SavedPair } from "./judgeReplay.ts";

const CTX = { judgeSystemMd5: "J", genSystemMd5: "G", rubricVersion: "need-pattern-rubric-v3", rubricMd5: "R", judgeModel: "qwen3.6:35b" };
const pair = (o: Partial<SavedPair> & { states?: boolean; span?: string; rejected?: string }): SavedPair => ({
  need: "N15", pattern: "Monthly rates increase without notice", pattern_identity: "id-1", signal_id: "aaaaaaaa-1", quote: "They raised my price and never told me.",
  ordinal: 1, part: "the monthly bill increases without warning",
  judge_of_record: { model: "qwen3.6:35b", states: o.states ?? true, span: o.span ?? "never told me", reason: "says it", rejected: o.rejected ?? "" },
  belongs_to_this_need: true, belongs_field: "true", belongs_reason: "an unexpected charge",
  ...o,
});
const file = (pairs: SavedPair[], head: Record<string, unknown> = {}) => JSON.stringify({
  judge_of_record: "qwen3.6:35b", judge_system_md5: "J", gen_system_md5: "G", rubric_version: "need-pattern-rubric-v3", rubric_md5: "R", pairs, ...head });
const open = (text: string, given = "m", actual = "m", ctx = CTX) => new JudgeReplay(text, given, actual, ctx);
const ASK = { need: "N15", identity: "id-1", signalId: "aaaaaaaa-1", claim: "Monthly rates increase without notice", parts: ["the monthly bill increases without warning"], quote: "They raised my price and never told me." };
const refuses = (fn: () => unknown, kind: ReplayRefusalKind) => {
  const e = assertThrows(fn, ReplayRefusal);
  assertEquals(e.kind, kind, e.message);
};

Deno.test("SP-652 happy path: a saved verdict comes back as the runner's own verdict shape, computed from the part rows", () => {
  const two = [pair({}), pair({ signal_id: "bbbbbbbb-2", quote: "Sudden increase.", states: false, span: "", rejected: "span_missing", belongs_to_this_need: false, belongs_field: "false", belongs_reason: "not this need" })];
  const r = open(file(two));
  assertEquals(r.pairCount, 2);
  const a = r.verdict(ASK);
  assertEquals(a.voided, false);
  assertEquals(a.verdict, { supports: true, parts: [{ ordinal: 1, states: true, span: "never told me", reason: "says it", rejected: "" }],
    belongsToNeed: true, belongsField: "true", reason: "an unexpected charge", notStated: [] });
  const b = r.verdict({ ...ASK, signalId: "bbbbbbbb-2", quote: "Sudden increase." });
  // supports and notStated are COMPUTED from the part rows; the belongs answer is the saved one
  assertEquals([b.verdict.supports, b.verdict.notStated, b.verdict.belongsToNeed, b.verdict.belongsField, b.verdict.parts[0].rejected],
    [false, ["the monthly bill increases without warning"], false, "false", "span_missing"]);
  r.assertStorable("N15", "id-1", "aaaaaaaa-1");
  r.assertAllUsed("N15");
});

Deno.test("SP-652: the pairs file's md5 must be given on the command line, and must be the file's", () => {
  refuses(() => open(file([pair({})]), "", "abc"), "file_md5_missing");
  refuses(() => open(file([pair({})]), "abd", "abc"), "file_md5");
  assertEquals(open(file([pair({})]), "ABC", "abc").pairCount, 1);   // case is not a difference
  refuses(() => open("{not json", "m", "m"), "unreadable");
  refuses(() => open(file([]), "m", "m"), "no_pairs");
});

Deno.test("SP-652: a file judged or generated under another prompt, rubric or judge is refused", () => {
  refuses(() => open(file([pair({})], { judge_system_md5: "OTHER" })), "prompt_md5");
  refuses(() => open(file([pair({})], { gen_system_md5: "OTHER" })), "prompt_md5");
  refuses(() => open(file([pair({})], { rubric_md5: "OTHER" })), "rubric");
  refuses(() => open(file([pair({})], { rubric_version: "need-pattern-rubric-v2" })), "rubric");
  refuses(() => open(file([pair({})], { judge_of_record: "llama3:70b" })), "judge_model");
});

Deno.test("SP-652: a missing key refuses — by need, by pattern identity and by quote", () => {
  const r = open(file([pair({})]));
  refuses(() => r.verdict({ ...ASK, need: "N14" }), "missing_key");
  refuses(() => r.verdict({ ...ASK, identity: "id-2" }), "missing_key");
  refuses(() => r.verdict({ ...ASK, signalId: "cccccccc-3" }), "missing_key");
  // the same (need, identity, quote, part) twice in the file is not a key
  refuses(() => open(file([pair({}), pair({})])), "duplicate_key");
});

Deno.test("SP-652: a mismatch of claim text, part text or quote text refuses", () => {
  const r = open(file([pair({})]));
  refuses(() => r.verdict({ ...ASK, claim: "Monthly rates increase with no notice" }), "claim_text");
  refuses(() => r.verdict({ ...ASK, parts: ["the monthly bill increases with no warning"] }), "part_text");
  refuses(() => r.verdict({ ...ASK, parts: [...ASK.parts, "a second part"] }), "part_text");
  refuses(() => r.verdict({ ...ASK, quote: "They raised my price and never told me!" }), "quote_text");
  // nothing refused above counted as used
  refuses(() => r.assertAllUsed("N15"), "unused_pairs");
});

Deno.test("SP-652: a pair marked as a voided nomination is replayed as voided and is never storable", () => {
  const r = open(file([pair({ nomination_voided: true, belongs_to_this_need: false, belongs_field: "false" }), pair({ signal_id: "bbbbbbbb-2" })]));
  const v = r.verdict(ASK);
  assertEquals([v.voided, v.verdict.belongsToNeed], [true, false]);
  refuses(() => r.assertStorable("N15", "id-1", "aaaaaaaa-1"), "voided_stored");
  r.assertStorable("N15", "id-1", "bbbbbbbb-2");
});

Deno.test("SP-652: every saved verdict of a need must be asked for", () => {
  const r = open(file([pair({}), pair({ signal_id: "bbbbbbbb-2" }), pair({ need: "N14", signal_id: "dddddddd-4" })]));
  r.verdict(ASK);
  assertEquals(r.unused("N15").map((x) => x.signal_id), ["bbbbbbbb-2"]);
  refuses(() => r.assertAllUsed("N15"), "unused_pairs");
  r.verdict({ ...ASK, signalId: "bbbbbbbb-2" });
  r.assertAllUsed("N15");
  // another need's pairs are not this need's to use
  refuses(() => r.assertAllUsed("N14"), "unused_pairs");
});

Deno.test("SP-652 binding: a file's binding must match today's need row, wording and ORDERED counted quotes", () => {
  const today: NeedBinding = { need_id: "need-1", wording_md5: "w1", counted_md5: "c1", counted: 41 };
  const bound = open(file([pair({})], { bindings: { N15: today } }));
  assertEquals(bound.checkBinding("N15", today), "file");
  refuses(() => bound.checkBinding("N15", { ...today, wording_md5: "w2" }), "binding");
  refuses(() => bound.checkBinding("N15", { ...today, counted_md5: "c2" }), "binding");
  refuses(() => bound.checkBinding("N15", { ...today, counted: 40 }), "binding");
  refuses(() => bound.checkBinding("N15", { ...today, need_id: "need-2" }), "binding");
  // a file written before bindings existed says so, and the caller must have another proof
  assertEquals(open(file([pair({})])).checkBinding("N15", today), "absent");
  assertEquals(bound.checkBinding("N14", today), "absent");
  // the binding text is ORDER-sensitive: the labels q1, q2 … are positions
  const q = (id: string, text: string) => ({ signalId: id, polarity: "not working", site: "s", eventDate: "2026-07-01", quote: text });
  const ab = bindingTexts("W", [q("a", "one"), q("b", "two")]), ba = bindingTexts("W", [q("b", "two"), q("a", "one")]);
  assertEquals(ab.counted === ba.counted, false);
  assertEquals(bindingTexts("W", [q("a", "one"), q("b", "two!")]).counted === ab.counted, false);
  assertEquals(ab.wording, "W");
});

Deno.test("SP-652 ledger proof: each replayed prompt consumes one ledger row of the saved run, by role and md5", () => {
  const p = new LedgerProof([{ role: "generator", sha: "g1" }, { role: "judge", sha: "j1" }, { role: "judge", sha: "j1" }, { role: "judge", sha: "j2" }], "the window");
  assertEquals(p.rows, 4);
  p.consume("generator", "g1", "N15/not working#gen-1");
  p.consume("judge", "j1", "pair 1");
  p.consume("judge", "j1", "pair 2");
  assertEquals([p.matched.generator, p.matched.judge, p.rows], [1, 2, 4]);
  // a third prompt with the same md5 has no row left; a prompt no call of the saved run carried has none at all
  refuses(() => p.consume("judge", "j1", "pair 3"), "ledger_prompt");
  refuses(() => p.consume("judge", "changed-wording", "pair 4"), "ledger_prompt");
  // a generator prompt is not proven by a judge row of the same md5
  refuses(() => p.consume("generator", "j2", "x"), "ledger_prompt");
});

Deno.test("SP-652 in the runner: the replay is wired where the judge call was, makes no live call, and checks before the write", () => {
  const src = Deno.readTextFileSync(new URL("./run-need-patterns.ts", import.meta.url));
  for (const needle of [
    'REFUSED (SP-652): --judge-from needs --gen-from',
    'REFUSED (SP-652): --judge-from needs --gen-from-md5',
    // a replay flag without its file never falls through to a live run
    'REFUSED (SP-652): --judge-from-md5 was given with no --judge-from',
    'REFUSED (SP-652): --gen-from-md5 was given with no --gen-from',
    'REFUSED (SP-652): --bind-by-ledger is only read with --judge-from',
    'new ReplayRefusal("live_call"',
    'new ReplayRefusal("binding_absent"',
    "judgeReplay.verdict({ need: need.key, identity: p.identity, signalId: qt.signalId, claim: p.name, parts: p.parts, quote: qt.quote })",
    "judgeReplay.assertStorable(need.key, p.identity, qt.signalId)",
    "judge_replayed_from: JUDGE_FROM || null",
    "bindings: runBindings",
  ]) assertEquals(src.includes(needle), true, needle);
  // every saved verdict is accounted for BEFORE the need's rows are written
  assertEquals(src.indexOf("judgeReplay.assertAllUsed(need.key)") < src.indexOf("await psql(applyNeedSql(retire, writes))"), true);
  // the live-call refusal sits before the routed call, after the generator replay branch
  assertEquals(src.indexOf('new ReplayRefusal("live_call"') < src.indexOf("r = await routed({ role, provenances: [provenance], system, user });"), true);
});

Deno.test("SP-656: the retire and the inserts of a need are ONE transaction, retire first", () => {
  const retire = "update public.need_patterns set superseded_at = now() where company_id = 'c' and need_id = 'n' and superseded_at is null";
  const sql = applyNeedSql(retire, ["with ins as (insert into public.need_patterns (name) values ('a') returning id) select 1", "insert into public.need_patterns (name) values ('b');"]);
  const parts = sql.split(";\n");
  assertEquals(parts[0], "begin");
  assertEquals(parts[1], retire);
  assertEquals(parts.length, 5);
  assertEquals(parts[4], "commit;");
  // exactly one begin and one commit, and nothing after the commit
  assertEquals([(sql.match(/^begin;$/gm) ?? []).length, (sql.match(/^commit;$/gm) ?? []).length, sql.endsWith("commit;")], [1, 1, true]);
  // a need that keeps nothing still retires inside a transaction of its own
  assertEquals(applyNeedSql(retire, []), `begin;\n${retire};\ncommit;`);
  // the retire must be the retire: a statement that is not limited to live rows is refused
  assertThrows(() => applyNeedSql("update public.need_patterns set superseded_at = now() where need_id = 'n'", []));
  assertThrows(() => applyNeedSql("delete from public.need_patterns where superseded_at is null", []));
});

Deno.test("SP-656 in the runner: nothing of a need's live set moves before the need is judged and checked", () => {
  const src = Deno.readTextFileSync(new URL("./run-need-patterns.ts", import.meta.url));
  // one retire statement in the whole runner, and it is the one handed to applyNeedSql
  assertEquals((src.match(/set superseded_at = now\(\)/g) ?? []).length, 1);
  const retireAt = src.indexOf("set superseded_at = now()");
  const judgeLoopAt = src.indexOf("for (let qi = 0; qi < queue.length; qi++)");
  const allUsedAt = src.indexOf("judgeReplay.assertAllUsed(need.key)");
  const applyAt = src.indexOf("await psql(applyNeedSql(retire, writes))");
  assertEquals(judgeLoopAt > 0 && allUsedAt > judgeLoopAt && retireAt > allUsedAt && applyAt > retireAt, true);
  // the old separate transaction for the inserts is gone
  assertEquals(src.includes('await psql("begin;'), false);
  // psql stops at the first error, so a failed statement never reaches commit
  const shim = Deno.readTextFileSync(new URL("./ledgerShim.ts", import.meta.url));
  assertEquals(shim.includes('"ON_ERROR_STOP=1"'), true);
});
