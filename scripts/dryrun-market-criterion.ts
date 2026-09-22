// READ-ONLY dry run of the market judge CHAIN over a fixed set of rows (operator tool, 2026-09-22).
// Lives in scripts/, NOT in supabase/functions/_shared — never served, never imported by a function.
//
// Usage: deno run --allow-net=localhost:11434 --allow-read --allow-env \
//          scripts/dryrun-market-criterion.ts <rows.json> <offering-items.json> <company name> [peers.json]
//   rows.json    [{ id, role, who, jtbd }] — the rows to judge
//   offering     the current offering read's `items` array (the v2/v3 solution line)
//   peers.json   [{ id, who, jtbd }] — the company's OTHER public rows, for the dedup gate
//
// WRITE-FREE BY CONSTRUCTION. This file imports only the two PURE judge modules; it never imports
// marketPortfolioDiscovery.ts or stepPerspectiveJudge.ts, because those take a supabase handle and carry
// .from(...) calls — importing them would make "this cannot write" a claim about arguments rather than a
// claim about the module graph. The three prompts they own are therefore INLINED below, byte-identical,
// and scripts/__tests__/dryrunPromptParity.test.ts pins each copy against its source so it cannot drift.
// The only I/O here is reading the JSON files it is handed and POSTing to the LOCAL Ollama.
import {
  buildSolutionAgnosticUser, buildSolutionLine, judgeSolutionAgnosticMajority,
  CRITERION_VERSION, SOLUTION_AGNOSTIC_SYSTEM, type OfferingItem,
} from "../supabase/functions/_shared/solutionAgnosticJudge.ts";
import { marketMeansHits, marketMeansReason } from "../supabase/functions/_shared/marketMeansTerms.ts";

const OLLAMA = Deno.env.get("OLLAMA_BASE_URL") ?? "http://localhost:11434";
const JUDGE_MODEL = "llama3:70b";
const GEN_MODEL = "qwen2.5:14b-instruct";
const MAX_REFRAMES = 2;

/** INLINED verbatim from _shared/stepPerspectiveJudge.ts (gate a). */
export const BUYER_SYSTEM =
  "You judge whose job a process step describes. Answer with JSON only: {\"verdict\":\"buyer\"} or {\"verdict\":\"seller\"}. " +
  "'buyer' = the step describes what the JOB EXECUTOR (the buying side) evaluates, requires, vets, confirms or decides in their own world. " +
  "'seller' = the step describes the selling company's solution, offering, method, or what the seller does/delivers. " +
  "If a step is about the buyer assessing a named vendor's offering, that is still 'seller' framing — the buyer's job must be stated in the buyer's own terms. " +
  "If you are not sure, answer 'seller'.";

/** INLINED verbatim from _shared/marketPortfolioDiscovery.ts (gate c). */
export const SAME_MARKET_CRITERION =
  "Same market = substantially the same job executor getting substantially the same job done, merely reworded. " +
  "A different executor, or a genuinely different job, is a DIFFERENT market. " +
  "NEGATIVE EXAMPLES — none of these makes two markets the same: " +
  "a shared theme, service area, industry, or beneficiary population is NOT the same market; " +
  "DIFFERENT job executor means DIFFERENT market, always — never merge two candidates with different executors even when their jobs touch the same domain.";
export const SAME_MARKET_SYSTEM =
  "You judge whether two market definitions are the SAME market. " +
  SAME_MARKET_CRITERION + " " +
  'JSON only: {"same_market":true|false,"reason":"<one short clause citing words from BOTH>"}.';

/** INLINED verbatim from _shared/marketPortfolioDiscovery.ts, with the names-a-means problem kind. */
export const REFRAME_SYSTEM =
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
type Peer = { id: string; who: string; jtbd: string };
/** A gate's outcome. `votes` is present only for the 3-call majority gate, and carries EVERY vote —
 *  the majority helper keeps all three and the tool must not throw two of them away. A unanimous
 *  accept whose three reasons disagree about WHY is a different thing from three that agree, and the
 *  operator cannot see that difference from the tally and one reason alone. */
type Vote = { solutionFree: boolean; reason: string };
type GateResult = { gate: string; pass: boolean; verdict: string; reason: string; votes?: Vote[] };

/** The chain, in the order marketPortfolioDiscovery runs it. Stops at the first failing gate. */
async function runChain(solutionLine: string, who: string, jtbd: string, peers: readonly Peer[]): Promise<GateResult[]> {
  const out: GateResult[] = [];

  // Gate (0): deterministic means terms — before any judge call.
  const hits = marketMeansHits(`${who} ${jtbd}`);
  out.push(hits.length
    ? { gate: "0 means (deterministic)", pass: false, verdict: "rejected_means", reason: marketMeansReason(hits) }
    : { gate: "0 means (deterministic)", pass: true, verdict: "no term", reason: "names no deterministic means term" });
  if (hits.length) return out;

  // Gate (a): buyer perspective. Fail-safe direction: unparseable ⇒ 'seller' (the blocking verdict).
  const braw = await ollamaJson(JUDGE_MODEL, BUYER_SYSTEM,
    `Job executor (the buying side): ${who}\nStep label: market-discovery:${who}\nStep description: ${jtbd}\nWhose job does this step describe?`);
  let bverdict = "seller";
  try { bverdict = String((JSON.parse(braw) as { verdict?: unknown })?.verdict ?? "seller"); } catch { /* fail safe */ }
  const buyerOk = bverdict === "buyer";
  out.push({ gate: "a buyer-perspective", pass: buyerOk, verdict: bverdict, reason: buyerOk ? "the step is the executor's own" : "framed from the selling side (or unparseable ⇒ fail-safe)" });
  if (!buyerOk) return out;

  // Gate (b): solution-agnostic v3 — 3 calls, majority, every vote kept.
  const user = buildSolutionAgnosticUser(solutionLine, who, jtbd);
  const m = await judgeSolutionAgnosticMajority(async () => {
    const raw = await ollamaJson(JUDGE_MODEL, SOLUTION_AGNOSTIC_SYSTEM, user);
    const p = JSON.parse(raw) as { solution_free?: unknown; reason?: unknown };
    return { solutionFree: p.solution_free === true, reason: String(p.reason ?? "").trim() };
  });
  out.push({
    gate: `b solution-agnostic v${CRITERION_VERSION}`, pass: m.solutionFree, verdict: m.tally, reason: m.reason,
    votes: m.votes.map((v) => ({ solutionFree: v.solutionFree, reason: v.reason })),
  });
  if (!m.solutionFree) return out;

  // Gate (c): same-market dedup against the company's other public rows.
  for (const p of peers) {
    const raw = await ollamaJson(JUDGE_MODEL, SAME_MARKET_SYSTEM,
      `MARKET A — executor: ${who}\njob: ${jtbd}\nMARKET B — executor: ${p.who}\njob: ${p.jtbd}\nAre A and B the same market?`);
    let same = false; let reason = "";
    try { const v = JSON.parse(raw) as { same_market?: unknown; reason?: unknown }; same = v.same_market === true; reason = String(v.reason ?? "").trim(); } catch { /* unparseable ⇒ not a duplicate */ }
    if (same) {
      out.push({ gate: "c same-market dedup", pass: false, verdict: `duplicate of ${p.id}`, reason });
      return out;
    }
  }
  out.push({ gate: "c same-market dedup", pass: true, verdict: `distinct from ${peers.length} peer(s)`, reason: "no peer judged the same market" });
  return out;
}

// Only when RUN as a script — importing this module (the prompt-parity test does) must execute nothing.
if (import.meta.main) {
  const rows: Row[] = JSON.parse(await Deno.readTextFile(Deno.args[0]));
  const items: OfferingItem[] = JSON.parse(await Deno.readTextFile(Deno.args[1]));
  const peers: Peer[] = Deno.args[3] ? JSON.parse(await Deno.readTextFile(Deno.args[3])) : [];
  const solutionLine = buildSolutionLine(items, Deno.args[2] ?? "");

  const report: unknown[] = [];
  for (const r of rows) {
    const myPeers = peers.filter((p) => p.id !== r.id);
    const attempts: unknown[] = [];
    let statement = r.jtbd;
    let lastReason = "";
    for (let attempt = 0; attempt <= MAX_REFRAMES; attempt++) {
      const chain = await runChain(solutionLine, r.who, statement, myPeers);
      const failed = chain.find((g) => !g.pass) ?? null;
      const survived = !failed;
      attempts.push({ attempt, kind: attempt === 0 ? "current" : `reframe ${attempt}`, statement, chain, survived });
      console.error(`[chain] ${r.id} attempt ${attempt}: ${survived ? "SURVIVED" : "failed at " + failed!.gate}`);
      lastReason = failed ? `${failed.gate}: ${failed.reason}` : "";
      // R3 of this brief: even a surviving attempt spends its remaining reframe, so the operator sees two.
      if (attempt === MAX_REFRAMES) break;
      const problem = !failed ? "names-a-means"
        : failed.gate.startsWith("0") ? "names-a-means"
        : failed.gate.startsWith("a") ? "seller-framed" : "solution-bound";
      const feedback = failed
        ? `Your previous attempt was REJECTED — ${lastReason}. Fix that specific problem.`
        : `Your previous attempt was accepted. Produce a DIFFERENT wording of the same job, equally free of any means.`;
      const raw = await ollamaJson(GEN_MODEL, REFRAME_SYSTEM,
        `EXECUTOR (fixed): ${r.who}\nORIGINAL JOB (rejected as ${problem}): ${statement}\n${feedback}\nRestate this executor's own job.`);
      let next = "";
      try { next = String((JSON.parse(raw) as { jtbd?: unknown })?.jtbd ?? "").trim(); } catch { /* unparseable ⇒ stop */ }
      if (!next || next === statement) { console.error(`[chain] ${r.id}: reframe ${attempt + 1} produced nothing new — stopping`); break; }
      statement = next;
    }
    report.push({ id: r.id, role: r.role, who: r.who, current: r.jtbd, attempts });
  }
  console.log(JSON.stringify({ criterion_version: CRITERION_VERSION, solution_line_present: solutionLine.length > 0, peers: peers.length, rows: report }, null, 1));
}
