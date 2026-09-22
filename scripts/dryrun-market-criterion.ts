// READ-ONLY dry run of the market solution-agnostic criterion over a fixed set of rows (operator tool,
// 2026-09-22). Lives in scripts/, NOT in supabase/functions/_shared — it is never served and never imported
// by a function.
//
// Usage: deno run --allow-net=localhost:11434 --allow-read --allow-env \
//          scripts/dryrun-market-criterion.ts <rows.json> <offering-items.json> <company name>
// rows.json: [{ id, role, who, jtbd }]   offering-items.json: the current offering read's `items` array.
//
// READ-ONLY dry run of criterion v3 over a fixed set of market rows. No supabase client is imported or
// constructed anywhere in this file or its imports' call paths — the only I/O is (1) reading two JSON
// files this script is handed and (2) POSTing to the LOCAL Ollama. It therefore cannot write any row.
import { buildSolutionAgnosticUser, buildSolutionLine, judgeSolutionAgnosticMajority, CRITERION_VERSION, SOLUTION_AGNOSTIC_SYSTEM, type OfferingItem } from "../supabase/functions/_shared/solutionAgnosticJudge.ts";
import { marketMeansHits, marketMeansReason } from "../supabase/functions/_shared/marketMeansTerms.ts";

const OLLAMA = Deno.env.get("OLLAMA_BASE_URL") ?? "http://localhost:11434";
const JUDGE_MODEL = "llama3:70b";
const GEN_MODEL = "qwen2.5:14b-instruct";

// The reframe prompt, byte-identical to marketPortfolioDiscovery.ts's REFRAME_SYSTEM (that module is not
// imported here because it constructs supabase-shaped calls; this file must stay provably write-free).
const REFRAME_SYSTEM =
  "You restate a job-to-be-done in the JOB EXECUTOR'S OWN terms. The executor is FIXED — do not change who they are. " +
  "If the problem is 'seller-framed': the job was stated as some provider's acquisition or growth goal — restate it as the progress the EXECUTOR is trying to make in their own world. " +
  "If the problem is 'solution-bound': the job named or presupposed a specific provider's services — restate the underlying job free of ANY provider's product, service, or solution language. " +
  "If the problem is 'names-a-means': A job statement names what the executor is trying to get done, in the executor's own words. It never names a provider, program, service line, facility, treatment setting, or category of supplier the executor would shop for. Form: transitive verb + object + contextual clarifier. " +
  "Hard rules: never name a company, brand, vendor, or specific service offering; the job existed before any provider and must read that way; " +
  "do not invent facts beyond the substance already present in the original job. " +
  'JSON only: {"jtbd":"<one sentence, the executor\'s own job>"}.';

async function ollamaJson(model: string, system: string, user: string): Promise<string> {
  const r = await fetch(`${OLLAMA}/api/chat`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, format: "json", stream: false, options: { num_ctx: 4096 }, messages: [{ role: "system", content: system }, { role: "user", content: user }] }),
  });
  const j = await r.json();
  return String(j?.message?.content ?? "");
}

type Row = { id: string; role: string; who: string; jtbd: string };
type Verdict = { pass: boolean; reason: string; tally?: string };

async function judge(solutionLine: string, who: string, jtbd: string): Promise<Verdict> {
  const hits = marketMeansHits(`${who} ${jtbd}`);
  if (hits.length) return { pass: false, reason: marketMeansReason(hits), tally: "deterministic (no judge call)" };
  const user = buildSolutionAgnosticUser(solutionLine, who, jtbd);
  const m = await judgeSolutionAgnosticMajority(async () => {
    const raw = await ollamaJson(JUDGE_MODEL, SOLUTION_AGNOSTIC_SYSTEM, user);
    const p = JSON.parse(raw) as { solution_free?: unknown; reason?: unknown };
    return { solutionFree: p.solution_free === true, reason: String(p.reason ?? "").trim() };
  });
  return { pass: m.solutionFree, reason: m.reason, tally: m.tally };
}

const rows: Row[] = JSON.parse(await Deno.readTextFile(Deno.args[0]));
const items: OfferingItem[] = JSON.parse(await Deno.readTextFile(Deno.args[1]));
const solutionLine = buildSolutionLine(items, Deno.args[2] ?? "");

const out: unknown[] = [];
for (const r of rows) {
  const first = await judge(solutionLine, r.who, r.jtbd);
  let reframed: string | null = null;
  let second: Verdict | null = null;
  if (!first.pass) {
    const raw = await ollamaJson(GEN_MODEL, REFRAME_SYSTEM, `EXECUTOR (fixed): ${r.who}\nORIGINAL JOB (rejected as names-a-means): ${r.jtbd}\nRestate this executor's own job.`);
    try { reframed = String((JSON.parse(raw) as { jtbd?: unknown })?.jtbd ?? "").trim() || null; } catch { reframed = null; }
    if (reframed) second = await judge(solutionLine, r.who, reframed);
  }
  out.push({ id: r.id, role: r.role, who: r.who, current: r.jtbd, v3: first, reframed, reframed_v3: second });
  console.error(`[dry-run] ${r.id} ${first.pass ? "PASS" : "REJECT"}${reframed ? " → reframed " + (second?.pass ? "PASS" : "REJECT") : ""}`);
}
console.log(JSON.stringify({ criterion_version: CRITERION_VERSION, solution_line_present: solutionLine.length > 0, rows: out }, null, 1));
