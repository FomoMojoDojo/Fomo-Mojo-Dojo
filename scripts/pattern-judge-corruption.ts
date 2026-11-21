// ── DOES THE JUDGE EARN ITS PLACE? (SP-461 / SP-491, 2026-11-20) ─────────────────────────────────
//
// A judge that approves whatever it is handed is worse than no judge: it costs time and it launders
// the generator's mistakes into a verdict. So it is fed answers that are WRONG BY CONSTRUCTION and
// counted on how many quotes it keeps.
//
//   HONEST    a real stored pattern with its own real quotes. The judge should keep most of them —
//             the control, without which a judge that says "no" to everything would pass.
//   SWAPPED   the same pattern name, with the quotes of a DIFFERENT need's pattern substituted.
//   INVENTED  this pattern's real quotes under a name no quote supports.
//
// SP-475(d): the judge rules on ONE quote per call, so each case is a run of single-quote calls.
//
// SP-491: EVERY KEPT QUOTE IS RECORDED — its signal id, its text, and whether `need_evidence` says it
// bears on the swapped-in pattern's OWN need. That last column is the one that settles the first
// swap result: the 2026-11-20 run kept 18 of 63, and 6 of the 31 quotes on each side genuinely bear
// on both needs, so a "swapped" quote is not necessarily foreign to the pattern it lands under.
// The rows go to `--out` as JSON; a tsx step masks them through the REAL displayQuote for the report
// (deno cannot import src/lib/reviewQuote.ts — it has an extensionless import).
//
// It WRITES NOTHING to the database.
//
//   deno run -A scripts/pattern-judge-corruption.ts --out=<file>                       # top two, as before
//   deno run -A scripts/pattern-judge-corruption.ts --a="<name>" --b="<name>" --out=…  # a named pair
import { JUDGE_NUM_PREDICT, JUDGE_SYSTEM, buildJudgeUser, parseJudgeOne, type PatternQuote } from "../supabase/functions/_shared/needPatterns.ts";
import { callOllamaJson } from "../supabase/functions/_shared/claimDeltaSynthesis.ts";
import { LOCAL_JUDGE } from "../src/lib/modelRouter/resolveModel.ts";

const arg = (n: string, d = "") => Deno.args.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d;
const COMPANY = arg("company", "dd40ce2f-ff67-4111-bd3c-67943dde6717");
const DB = Deno.env.get("MOJO_DB_CONTAINER") ?? "supabase_db_dzlgyxcvuwiulgifbmew";
const OLLAMA = Deno.env.get("OLLAMA_BASE_URL") ?? "http://127.0.0.1:11434/v1";
const OUT = arg("out");
const WANT_A = arg("a");
const WANT_B = arg("b");
const LABEL = arg("label", "top-two");
/** A name nothing in a Charter complaint corpus can support: the opposite register, and a place that
 *  appears in no quote. If the judge keeps a quote under THIS, it is not reading the quotes. */
const INVENTED = "Customers praise the fibre rollout and the price in rural Idaho";

async function psqlJson<T>(sql: string): Promise<T[]> {
  const { code, stdout, stderr } = await new Deno.Command("docker", {
    args: ["exec", "-i", DB, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-tA", "-c",
      `select coalesce(json_agg(t), '[]'::json) from (${sql}) t`],
    stdout: "piped", stderr: "piped",
  }).output();
  if (code !== 0) throw new Error(new TextDecoder().decode(stderr).trim());
  return JSON.parse(new TextDecoder().decode(stdout));
}
const q = (s: string) => "'" + String(s).replaceAll("'", "''") + "'";

type Row = { pattern_id: string; need_id: string; name: string; outcome: string; signal_id: string; quote: string; url: string | null; date: string | null };
const rows = await psqlJson<Row>(`select p.id as pattern_id, p.need_id, p.name, n.desired_outcome as outcome,
    pq.signal_id, s.quote, s.source_url as url, to_char(s.event_date,'YYYY-MM-DD') as date
  from public.need_patterns p
  join public.need_pattern_quotes pq on pq.pattern_id = p.id and pq.bears
  join public.odi_needs n on n.id = p.need_id
  join public.signals s on s.id = pq.signal_id
  where p.company_id = ${q(COMPANY)} and p.superseded_at is null and s.quote is not null`);
if (rows.length === 0) { console.error("REFUSED: no stored patterns with supporting quotes"); Deno.exit(1); }

type Pat = { needId: string; name: string; outcome: string; quotes: PatternQuote[] };
const byPattern = new Map<string, Pat>();
for (const r of rows) {
  const e = byPattern.get(r.pattern_id) ?? byPattern.set(r.pattern_id, { needId: r.need_id, name: r.name, outcome: r.outcome, quotes: [] }).get(r.pattern_id)!;
  e.quotes.push({ signalId: r.signal_id, quote: r.quote, site: "", eventDate: r.date, brand: "", polarity: null });
}
const ordered = [...byPattern.values()].sort((x, y) => y.quotes.length - x.quotes.length);
const pick = (want: string, fallback: (p: Pat) => boolean): Pat => {
  const hit = want ? ordered.find((p) => p.name === want) : ordered.find(fallback);
  if (!hit) { console.error(`REFUSED: no live pattern named ${JSON.stringify(want)}`); Deno.exit(1); }
  return hit;
};
const A = pick(WANT_A, () => true);
const B = pick(WANT_B, (p) => p.needId !== A.needId);
if (A.needId === B.needId) { console.error("REFUSED: both patterns belong to one need — a swap would not be a swap"); Deno.exit(1); }

// THE OVERLAP, from need_evidence — the frozen corpus, judged long before any of this.
const overlap = (await psqlJson<{ shared: number; a_on_b: number; b_on_a: number }>(`select
   (select count(*) from public.need_pattern_quotes x
      where x.signal_id in (${A.quotes.map((x) => q(x.signalId)).join(",")})
        and x.pattern_id in (select id from public.need_patterns where company_id=${q(COMPANY)} and superseded_at is null and name=${q(B.name)})
        and x.bears) as shared,
   (select count(*) from public.need_evidence e where e.company_id=${q(COMPANY)} and e.bears and e.need_id=${q(B.needId)}
        and e.signal_id in (${A.quotes.map((x) => q(x.signalId)).join(",")})) as a_on_b,
   (select count(*) from public.need_evidence e where e.company_id=${q(COMPANY)} and e.bears and e.need_id=${q(A.needId)}
        and e.signal_id in (${B.quotes.map((x) => q(x.signalId)).join(",")})) as b_on_a`))[0];

// which of the swapped-in quotes DO bear on the host pattern's own need
const bearsOnNeed = async (needId: string, quotes: PatternQuote[]) =>
  new Set((await psqlJson<{ signal_id: string }>(`select e.signal_id from public.need_evidence e
    where e.company_id=${q(COMPANY)} and e.bears and e.need_id=${q(needId)}
      and e.signal_id in (${quotes.map((x) => q(x.signalId)).join(",")})`)).map((r) => r.signal_id));

console.log(`judge: ${LOCAL_JUDGE} (temperature 0, seed 42), ONE quote per call (SP-475d) — writes nothing`);
console.log(`label: ${LABEL}\n`);
console.log(`A = "${A.name}"  (${A.quotes.length} supporting quotes)`);
console.log(`B = "${B.name}"  (${B.quotes.length} supporting quotes, a DIFFERENT need)`);
console.log(`OVERLAP in need_evidence — shared supporting quotes: ${overlap.shared} · A's quotes bearing on B's need: ${overlap.a_on_b} · B's quotes bearing on A's need: ${overlap.b_on_a}\n`);

let calls = 0, seconds = 0, spanRejects = 0;
type Kept = { case: string; pattern: string; signalId: string; quote: string; bearsOnHostNeed: boolean;
  reason: string; states: string; notStated: string[] };
/** SP-498: EVERY honest rejection, so each one can be classified (a) judge too strict or
 *  (b) pattern overclaims. The honest set came from the earlier, lenient judge, so it is not a
 *  neutral control and its rejections have to be read one by one rather than counted. */
type Rejected = { case: string; pattern: string; signalId: string; quote: string;
  reason: string; states: string; notStated: string[]; rejected: string };
const kept: Kept[] = [];
const rejectedHonest: Rejected[] = [];

async function judge(caseLabel: string, host: Pat, quotes: PatternQuote[], patternName: string, hostBears: Set<string>) {
  let n = 0;
  const refusals: string[] = [];
  const t0 = performance.now();
  for (const qt of quotes) {
    const content = await callOllamaJson(OLLAMA, LOCAL_JUDGE, JUDGE_SYSTEM, buildJudgeUser(host.outcome, patternName, qt), 600_000,
      { temperature: 0, seed: 42, num_predict: JUDGE_NUM_PREDICT } as never);
    const v = parseJudgeOne(content, qt.quote);
    calls++;
    if (v.rejected) spanRejects++;
    if (v.supports) {
      n++;
      kept.push({ case: caseLabel, pattern: patternName, signalId: qt.signalId, quote: qt.quote,
                  bearsOnHostNeed: hostBears.has(qt.signalId), reason: v.reason,
                  states: v.states, notStated: v.notStated });
    } else {
      if (caseLabel.startsWith("HONEST")) {
        rejectedHonest.push({ case: caseLabel, pattern: patternName, signalId: qt.signalId, quote: qt.quote,
          reason: v.reason, states: v.states, notStated: v.notStated, rejected: v.rejected });
      }
      if (refusals.length < 2 && (v.notStated[0] || v.reason)) refusals.push(v.notStated[0] || v.reason);
    }
  }
  const s = (performance.now() - t0) / 1000;
  seconds += s;
  console.log(`${caseLabel.padEnd(24)} kept ${String(n).padStart(2)} of ${String(quotes.length).padStart(2)}   ${s.toFixed(1)}s   refusals: "${refusals.join(" | ").slice(0, 70)}"`);
  return { kept: n, of: quotes.length };
}

const none = new Set<string>();
const hA = await judge("HONEST A", A, A.quotes, A.name, none);
const hB = await judge("HONEST B", B, B.quotes, B.name, none);
// SP-491: for a swap, the host is the PATTERN's need and the quotes are the other one's, so the
// bearing column asks "does this swapped-in quote bear on the host pattern's own need?"
const sA = await judge("SWAPPED A<-B quotes", A, B.quotes, A.name, await bearsOnNeed(A.needId, B.quotes));
const sB = await judge("SWAPPED B<-A quotes", B, A.quotes, B.name, await bearsOnNeed(B.needId, A.quotes));
const iA = await judge("INVENTED name, A quotes", A, A.quotes, INVENTED, none);
const iB = await judge("INVENTED name, B quotes", B, B.quotes, INVENTED, none);

const honest = hA.kept + hB.kept, honestOf = hA.of + hB.of;
const swapped = sA.kept + sB.kept, swappedOf = sA.of + sB.of;
const invented = iA.kept + iB.kept, inventedOf = iA.of + iB.of;
console.log(`\n── RESULT (${LABEL}) ─────────────────────────────────────`);
console.log(`HONEST    kept ${honest} of ${honestOf}`);
console.log(`SWAPPED   kept ${swapped} of ${swappedOf}`);
console.log(`INVENTED  kept ${invented} of ${inventedOf}`);
console.log(`${calls} judge call(s), ${seconds.toFixed(1)}s total`);
console.log(`SP-494: ${spanRejects} verdict(s) rejected for an unverifiable span`);
const sw = kept.filter((k) => k.case.startsWith("SWAPPED"));
console.log(`of the ${sw.length} kept swap quote(s), ${sw.filter((k) => k.bearsOnHostNeed).length} DO bear on the host pattern's own need per need_evidence`);
console.log(`honest rejections recorded for classification (SP-498): ${rejectedHonest.length}`);

if (OUT) {
  await Deno.writeTextFile(OUT, JSON.stringify({
    label: LABEL, a: A.name, b: B.name, overlap,
    totals: { honest, honestOf, swapped, swappedOf, invented, inventedOf, calls, seconds: Number(seconds.toFixed(1)), spanRejects },
    kept, rejectedHonest,
  }, null, 2));
  console.log(`rows written to ${OUT}`);
}
