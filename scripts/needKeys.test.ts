// ── SP-565: a need is found by id or label, never by sentence; the loader never overwrites a row
//    that is no longer its own ───────────────────────────────────────────────────────────────────
//
// Tests 1–4 are pure. Tests 5–7 read the local database and write NOTHING that survives: test 5 and 6
// are dry runs, and test 7 runs inside one transaction that it rolls back, then proves the table's
// md5 is what it was.
import { assert, assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { DEFAULT_NEED_KEYS, loadNeedKeys, NeedKeys } from "./needKeys.ts";
import { upsertSql } from "./needEvidenceUpsert.ts";

const DB = "supabase_db_dzlgyxcvuwiulgifbmew";
const CHARTER = "dd40ce2f-ff67-4111-bd3c-67943dde6717";
const N13 = "ee245737-38e2-4573-a815-191b04a7ceae";
const CORPUS = "/Users/fomomojodojo/dev/_diagnose-shots/2026-11-18/charter-need-labels-full.json";
const HERE = new URL(".", import.meta.url).pathname;
const SCRIPTS = [
  "run-need-patterns.ts", "pattern-reference-compare.ts", "load-need-evidence.ts",
  "sp541-gen-capability.ts", "verify-need-evidence-counting.ts", "verify-brief-sections.ts",
];

async function psql(sql: string): Promise<string> {
  const cmd = new Deno.Command("docker", {
    args: ["exec", "-i", DB, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-tA", "-F", "\t", "-f", "-"],
    stdin: "piped", stdout: "piped", stderr: "piped",
  }).spawn();
  const w = cmd.stdin.getWriter();
  await w.write(new TextEncoder().encode(sql));
  await w.close();
  const { code, stdout, stderr } = await cmd.output();
  if (code !== 0) throw new Error(new TextDecoder().decode(stderr));
  return new TextDecoder().decode(stdout);
}
async function run(args: string[]): Promise<{ code: number; out: string }> {
  const { code, stdout, stderr } = await new Deno.Command(Deno.execPath(), {
    args: ["run", "-A", "--no-lock", ...args], stdout: "piped", stderr: "piped",
  }).output();
  return { code, out: new TextDecoder().decode(stdout) + new TextDecoder().decode(stderr) };
}

Deno.test("SP-565 need keys: a label resolves to its row and a row to its label", () => {
  const k = new NeedKeys({ company: "c1", keys: { N1: "id-1", P2: "id-2" } });
  assertEquals(k.idOf("N1"), "id-1");
  assertEquals(k.keyOf("id-2"), "P2");
  assertEquals(k.label("id-2"), "P2");
  // a row with no label prints as the scripts always printed it, and a label with no row is undefined
  assertEquals(k.label("id-unknown"), "—");
  assertEquals(k.idOf("P7"), undefined);
});

Deno.test("SP-565 need keys: two labels on one row are refused", () => {
  assertThrows(() => new NeedKeys({ company: "c1", keys: { N1: "id-1", N2: "id-1" } }), Error, "both name row id-1");
});

Deno.test("SP-565 need keys: an id that is not a need row of the company is refused, and so is another company", () => {
  const k = new NeedKeys({ company: "c1", keys: { N1: "id-1", N2: "id-2" } });
  k.assertRowsOf("c1", ["id-1", "id-2", "id-3"]);                       // every labelled id is a row: passes
  assertThrows(() => k.assertRowsOf("c1", ["id-1"]), Error, "N2 → id-2");
  assertThrows(() => k.assertRowsOf("c2", ["id-1", "id-2"]), Error, "not c2");
});

Deno.test("SP-565: none of the six scripts finds a need by its sentence", async () => {
  // The three spellings the sentence lookup had. Any of them back in a script is the old behaviour.
  const sentenceLookup = /keyByOutcome|byOutcome\b|outcome\.trim\(\)\.toLowerCase\(\)|byNeed\.get\((exp\.)?outcome\)/;
  for (const s of SCRIPTS) {
    const src = await Deno.readTextFile(HERE + s);
    assert(!sentenceLookup.test(src), `${s} resolves a need by its sentence (${src.match(sentenceLookup)?.[0]})`);
    assert(src.includes('from "./needKeys.ts"'), `${s} does not read the key file`);
  }
});

Deno.test("SP-565: the committed key file names 20 Charter rows, N13 among them, all rows of Charter", async () => {
  const k = await loadNeedKeys(CHARTER, DEFAULT_NEED_KEYS);
  assertEquals(k.keys().length, 20);
  assertEquals(k.idOf("N13"), N13);
  const ids = (await psql(`select id from public.odi_needs where company_id = '${CHARTER}';`)).trim().split("\n");
  k.assertRowsOf(CHARTER, ids);
  await assertRejectsCompany();
});
async function assertRejectsCompany() {
  let refused = "";
  try { await loadNeedKeys("66666666-6666-4666-8666-666666666601", DEFAULT_NEED_KEYS); } catch (e) { refused = (e as Error).message; }
  assert(refused.includes("is for company"), "a key file read for another company must be refused");
}

Deno.test("SP-565 RENAME: the loader still maps N13 when the corpus sentence and the stored sentence differ", async () => {
  // The rename, without touching the database: a copy of the frozen corpus whose N13 sentence is one
  // the database does not hold. That is exactly the state after a need's wording is edited in place —
  // the two sentences differ. The sentence lookup mapped 19 needs here and deferred N13's 330 labels.
  const corpus = JSON.parse(await Deno.readTextFile(CORPUS));
  corpus.needs.N13 = "A sentence no odi_needs row holds, standing in for an edited wording";
  const tmp = await Deno.makeTempFile({ suffix: ".json" });
  try {
    await Deno.writeTextFile(tmp, JSON.stringify(corpus));
    const md5 = new TextDecoder().decode((await new Deno.Command("md5", { args: ["-q", tmp], stdout: "piped" }).output()).stdout).trim();
    const { code, out } = await run([HERE + "load-need-evidence.ts", `--corpus=${tmp}`, `--md5=${md5}`]);
    assertEquals(code, 0, out);
    const mapped = out.split("\n").find((l) => l.startsWith("mapped ")) ?? "";
    assert(mapped.startsWith("mapped 20 need(s)"), `expected 20 mapped needs, got: ${mapped}`);
    assert(/\bN13\b/.test(mapped), `N13 is not among the mapped needs: ${mapped}`);
    const deferred = out.split("\n").find((l) => l.startsWith("not yet a row")) ?? "";
    assert(!/\bN13\b/.test(deferred), `N13 was deferred: ${deferred}`);
    assert(out.includes("rows to load: 6600"), "the renamed need's labels were dropped from the load");
    assert(out.includes("DRY RUN — nothing written"), "this test must only ever be a dry run");
  } finally {
    await Deno.remove(tmp);
  }
});

Deno.test("SP-565 NO-OVERWRITE: the loader's upsert leaves a re-judged or corrected row alone, and still updates its own", async () => {
  const md5Sql = `select md5(string_agg(e::text,'|' order by e.id)) from public.need_evidence e;`;
  const before = (await psql(md5Sql)).trim();
  // three non-bearing N13 rows, all still the loader's own
  const sig = (await psql(`select signal_id from public.need_evidence where need_id = '${N13}' and not bears
    and judged_by = 'cc_read_unchecked' and rubric_md5 = '7736a27727323339ac1cb55ca74c5eab' order by signal_id limit 3;`)).trim().split("\n");
  assertEquals(sig.length, 3);
  const [operatorRow, rejudgedRow, ownRow] = sig;
  const value = (s: string) =>
    `('${CHARTER}'::uuid, '${N13}'::uuid, '${s}'::uuid, false, null, 'spectrum', 'cc_read_unchecked', 'need-match-rubric-v4', '7736a27727323339ac1cb55ca74c5eab', 'full_read')`;
  const out = await psql(`begin;
    -- an operator's correction, and a row re-judged under another rubric; the third is made bearing but left the loader's own
    update public.need_evidence set bears = true, polarity = 'working', judged_by = 'operator' where need_id = '${N13}' and signal_id = '${operatorRow}';
    update public.need_evidence set bears = true, polarity = 'not working', rubric_version = 'another-rubric', rubric_md5 = 'another-md5' where need_id = '${N13}' and signal_id = '${rejudgedRow}';
    update public.need_evidence set bears = true, polarity = 'mixed' where need_id = '${N13}' and signal_id = '${ownRow}';
    -- the loader arrives with the corpus's answer for all three: does not bear
    ${upsertSql([operatorRow, rejudgedRow, ownRow].map(value).join(","))};
    select signal_id, bears, coalesce(polarity,'NULL'), judged_by, rubric_md5 from public.need_evidence
      where need_id = '${N13}' and signal_id in ('${operatorRow}','${rejudgedRow}','${ownRow}');
    rollback;`);
  const got = new Map(out.split("\n").filter((l) => l.includes("\t")).map((l) => { const c = l.split("\t"); return [c[0], c.slice(1).join("|")]; }));
  assertEquals(got.get(operatorRow), "t|working|operator|7736a27727323339ac1cb55ca74c5eab", "an operator's correction was overwritten");
  assertEquals(got.get(rejudgedRow), "t|not working|cc_read_unchecked|another-md5", "a row re-judged under another rubric was overwritten");
  assertEquals(got.get(ownRow), "f|NULL|cc_read_unchecked|7736a27727323339ac1cb55ca74c5eab", "the loader no longer updates its own row");
  assertEquals((await psql(md5Sql)).trim(), before, "the test left a change in need_evidence");
});
