// ── SP-604: pattern-citation-guard (c2) reads LIVE patterns only — and still fails on one ────────
//
// The guard is a shell script, so this test runs the guard's OWN c2 predicate: it reads `C2_FROM=` out
// of scripts/guards/pattern-citation-guard.sh and executes it. A copy of the SQL here would let the
// guard and its test drift, and the test would go on passing.
//
// Everything happens inside ONE transaction that is rolled back; the test then proves need_evidence and
// need_patterns are byte-for-byte what they were.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const DB = "supabase_db_dzlgyxcvuwiulgifbmew";
const GUARD = new URL("./guards/pattern-citation-guard.sh", import.meta.url).pathname;

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
async function c2From(): Promise<string> {
  const m = (await Deno.readTextFile(GUARD)).match(/^C2_FROM="([^"\n]+)"$/m);
  assert(m, "the guard no longer defines C2_FROM on one line — this test cannot run the guard's own SQL");
  return m![1];
}
const stateSql = `select md5(coalesce(string_agg(e::text,'|' order by e.id),'')) from public.need_evidence e;
  select md5(coalesce(string_agg(p::text,'|' order by p.id),'')) from public.need_patterns p;`;

Deno.test("SP-604 c2: a LIVE pattern citing a quote with no bearing row FAILS; the same row under a SUPERSEDED pattern does not", async () => {
  const from = await c2From();
  const before = await psql(stateSql);
  // a quote that is cited by exactly ONE pattern, that pattern live, and that bears on the pattern's need today
  const pick = (await psql(`select p.id, p.need_id, pq.signal_id from public.need_pattern_quotes pq
      join public.need_patterns p on p.id = pq.pattern_id
      join public.need_evidence e on e.need_id = p.need_id and e.signal_id = pq.signal_id and e.bears
     where p.superseded_at is null
       and (select count(*) from public.need_pattern_quotes x join public.need_patterns xp on xp.id = x.pattern_id
             where x.signal_id = pq.signal_id and xp.need_id = p.need_id) = 1
     order by p.id, pq.signal_id limit 1;`)).trim().split("\t");
  assertEquals(pick.length, 3, "no fixture: no live pattern cites a quote that only it cites");
  const [patternId, needId, signalId] = pick;

  const out = (await psql(`begin;
    select 'baseline', count(*) ${from};
    -- the quote stops bearing on the need, as a re-read of the need's links would make it
    update public.need_evidence set bears = false, polarity = null where need_id = '${needId}' and signal_id = '${signalId}';
    select 'live', count(*) ${from};
    select 'live_names_it', count(*) ${from} and p.id = '${patternId}' and pq.signal_id = '${signalId}';
    -- the citing pattern is superseded: it is now a record
    update public.need_patterns set superseded_at = now(), superseded_reason = 'SP-604 test, rolled back' where id = '${patternId}';
    select 'superseded', count(*) ${from};
    select 'superseded_names_it', count(*) ${from} and p.id = '${patternId}' and pq.signal_id = '${signalId}';
    rollback;`)).split("\n").filter((l) => l.includes("\t")).map((l) => l.split("\t"));
  const n = Object.fromEntries(out.map(([k, v]) => [k, Number(v)]));
  assertEquals(n.live, n.baseline + 1, "c2 did NOT fail on a live pattern citing a quote with no bearing row for its need");
  assertEquals(n.live_names_it, 1, "c2 failed, but not on the row that was planted");
  assertEquals(n.superseded, n.baseline, "c2 still counts the row once its pattern is superseded (SP-604: a superseded pattern is a record)");
  assertEquals(n.superseded_names_it, 0);
  assertEquals(await psql(stateSql), before, "the test left a change behind");
});

Deno.test("SP-604 c2: the guard counts and lists with the one predicate, and that predicate is scoped to live patterns", async () => {
  const src = await Deno.readTextFile(GUARD);
  const from = await c2From();
  assert(/\bp\.superseded_at is null\b/.test(from), "C2_FROM is not scoped to live patterns");
  assert(/\be\.bears\b/.test(from), "C2_FROM no longer asks for a BEARING row");
  assertEquals((src.match(/\$C2_FROM/g) ?? []).length, 2, "the count and the listing must both use $C2_FROM, and nothing else");
});
