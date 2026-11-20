// ── DOES THE JUDGE EARN ITS PLACE? (SP-461, one-time accuracy test, 2026-11-20) ──────────────────
//
// A judge that approves whatever it is handed is worse than no judge: it costs time and it launders
// the generator's mistakes into a verdict. So it is fed answers that are WRONG BY CONSTRUCTION and
// counted on how many quotes it keeps.
//
//   HONEST    a real stored pattern with its own real quotes. The judge should keep most of them —
//             this is the control, and without it a judge that says "no" to everything would pass.
//   SWAPPED   the same pattern name, with the quotes of a DIFFERENT need substituted. Nothing in
//             those quotes states this pattern, so the judge should keep ~none.
//   INVENTED  this need's real quotes under a pattern name no quote supports. Same expectation.
//
// SP-461: a one-time accuracy test, not a recurring operator step. It WRITES NOTHING — it reads
// stored patterns and quotes and calls the local judge, and its output is the number for the report.
//
//   deno run -A scripts/pattern-judge-corruption.ts [--company=<uuid>]
import { JUDGE_SYSTEM, buildJudgeUser, parseJudged, quoteLabels, type PatternQuote } from "../supabase/functions/_shared/needPatterns.ts";
import { callOllamaJson } from "../supabase/functions/_shared/claimDeltaSynthesis.ts";
import { LOCAL_JUDGE } from "../src/lib/modelRouter/resolveModel.ts";

const arg = (n: string, d = "") => Deno.args.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d;
const COMPANY = arg("company", "dd40ce2f-ff67-4111-bd3c-67943dde6717");
const DB = Deno.env.get("MOJO_DB_CONTAINER") ?? "supabase_db_dzlgyxcvuwiulgifbmew";
const OLLAMA = Deno.env.get("OLLAMA_BASE_URL") ?? "http://127.0.0.1:11434/v1";
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

if (rows.length === 0) { console.error("REFUSED: no stored patterns with supporting quotes — run the pattern layer first"); Deno.exit(1); }

const byPattern = new Map<string, { needId: string; name: string; outcome: string; quotes: PatternQuote[] }>();
for (const r of rows) {
  const e = byPattern.get(r.pattern_id) ?? byPattern.set(r.pattern_id, { needId: r.need_id, name: r.name, outcome: r.outcome, quotes: [] }).get(r.pattern_id)!;
  e.quotes.push({ signalId: r.signal_id, quote: r.quote, site: "", eventDate: r.date, brand: "" });
}
// the two most-evidenced patterns, from two DIFFERENT needs, so the swap is a real swap
const ordered = [...byPattern.entries()].sort((a, b) => b[1].quotes.length - a[1].quotes.length);
const a = ordered[0];
const b = ordered.find(([, v]) => v.needId !== a[1].needId);
if (!b) { console.error("REFUSED: every stored pattern belongs to one need — a swap would not be a swap"); Deno.exit(1); }

let calls = 0, seconds = 0;
async function judge(label: string, name: string, outcome: string, quotes: PatternQuote[]) {
  const labels = quoteLabels(quotes);
  const t0 = performance.now();
  const content = await callOllamaJson(OLLAMA, LOCAL_JUDGE, JUDGE_SYSTEM, buildJudgeUser(outcome, name, quotes), 600_000, { temperature: 0, seed: 42 });
  const s = (performance.now() - t0) / 1000;
  calls++; seconds += s;
  const v = parseJudged(content, labels);
  console.log(`${label.padEnd(24)} kept ${String(v.supporting.length).padStart(2)} of ${String(quotes.length).padStart(2)}   ${s.toFixed(1)}s   "${v.reason.slice(0, 72)}"`);
  return { kept: v.supporting.length, of: quotes.length };
}

console.log(`judge: ${LOCAL_JUDGE} (temperature 0, seed 42) — writes nothing\n`);
console.log(`A = "${a[1].name}"  (${a[1].quotes.length} supporting quotes)`);
console.log(`B = "${b[1].name}"  (${b[1].quotes.length} supporting quotes, a DIFFERENT need)\n`);

const honestA = await judge("HONEST A", a[1].name, a[1].outcome, a[1].quotes);
const honestB = await judge("HONEST B", b[1].name, b[1].outcome, b[1].quotes);
const swapA = await judge("SWAPPED A<-B quotes", a[1].name, a[1].outcome, b[1].quotes);
const swapB = await judge("SWAPPED B<-A quotes", b[1].name, b[1].outcome, a[1].quotes);
const invA = await judge("INVENTED name, A quotes", INVENTED, a[1].outcome, a[1].quotes);
const invB = await judge("INVENTED name, B quotes", INVENTED, b[1].outcome, b[1].quotes);

const honest = honestA.kept + honestB.kept, honestOf = honestA.of + honestB.of;
const swapped = swapA.kept + swapB.kept, swappedOf = swapA.of + swapB.of;
const invented = invA.kept + invB.kept, inventedOf = invA.of + invB.of;
console.log(`\n── RESULT ─────────────────────────────────────────────`);
console.log(`HONEST    kept ${honest} of ${honestOf}`);
console.log(`SWAPPED   kept ${swapped} of ${swappedOf}`);
console.log(`INVENTED  kept ${invented} of ${inventedOf}`);
console.log(`${calls} judge call(s), ${seconds.toFixed(1)}s total`);
if (honest === 0) console.log("VERDICT: the judge kept NOTHING even on the honest control — it is refusing everything, which is not discrimination.");
else if (swapped === 0 && invented === 0) console.log("VERDICT: the judge rejected every corrupted pattern and kept the honest ones. It earns its place.");
else console.log(`VERDICT: the judge KEPT corrupted evidence (${swapped} swapped, ${invented} invented). Report this; do not drop the judge (SP-461 / acceptance).`);
