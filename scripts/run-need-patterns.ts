// ── RUN THE PATTERN LAYER FOR A COMPANY'S BAR-MEETING NEEDS (SP-465, 2026-11-20) ─────────────────
//
// The driver. Everything that decides anything lives elsewhere, on purpose:
//   the LANE          src/lib/modelRouter/resolveModel.ts   (SP-460 lineage, SP-468 this one consumer)
//   the PROMPTS,
//   the SCHEMA bound,
//   the STRENGTH      supabase/functions/_shared/needPatterns.ts
//   the COUNTING      src/lib/needEvidenceCounting.ts       (which quotes count, and the bar)
//   the LEDGER        supabase/functions/_shared/recordModelCall.ts
//   the SPEND CAP     supabase/functions/_shared/spendCap.ts (before every PAID call)
// This file reads rows, calls the model through the router, and writes what came back.
//
// WHY A SCRIPT AND NOT AN EDGE FUNCTION. A new function directory is not served until the stack is
// recreated — an operator-approved step — and this slice's other data acts (load-need-evidence,
// materialise-proposed-needs) are scripts for the same reason. The compute is in _shared so an edge
// function can call it later without a second copy.
//
// WALL-CLOCK SECONDS ARE PRINTED FOR EVERY CALL. model_calls has no duration column and this brief
// does not add one, so the timings live in the run's own output and in the report.
//
//   deno run -A scripts/run-need-patterns.ts --needs=N13,P1 [--company=<uuid>]          # dry run
//   deno run -A scripts/run-need-patterns.ts --needs=N13,P1 --apply
//   deno run -A scripts/run-need-patterns.ts --needs=N13 --apply --tag=run2             # a re-run
import { isCounted, siteOf } from "../src/lib/needEvidenceCounting.ts";
import { patternRouteProvenance, resolveModel } from "../src/lib/modelRouter/resolveModel.ts";
import { callOllamaJson } from "../supabase/functions/_shared/claimDeltaSynthesis.ts";
import { companyHasClientProvidedMaterial } from "../supabase/functions/_shared/clientMaterial.ts";
import { makeRoutedModel } from "../supabase/functions/_shared/modelRouter.ts";
import { openaiRecord, recordModelCall } from "../supabase/functions/_shared/recordModelCall.ts";
import { makeSpendCap, projectOpenAIUsd, assertSpendable, SPEND_CAP_CEILING_USD } from "../supabase/functions/_shared/spendCap.ts";
import {
  GENERATOR_SYSTEM, JUDGE_SYSTEM, JUDGE_NUM_PREDICT, PATTERN_CEILING, PATTERN_NUM_PREDICT,
  PATTERN_RUBRIC_TEXT, PATTERN_RUBRIC_VERSION, QUOTE_POLARITIES,
  buildGeneratorUser, buildJudgeUser, parseGenerated, parseJudgeOne, patternIdentity, patternStrength,
  quoteLabels, type PatternQuote, type QuotePolarity,
} from "../supabase/functions/_shared/needPatterns.ts";

const arg = (n: string, d = "") => Deno.args.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d;
const COMPANY = arg("company", "dd40ce2f-ff67-4111-bd3c-67943dde6717");
const DB = Deno.env.get("MOJO_DB_CONTAINER") ?? "supabase_db_dzlgyxcvuwiulgifbmew";
const APPLY = Deno.args.includes("--apply");
const TAG = arg("tag", "run1");
const CALL_SITE = "need-patterns";
const WANT = arg("needs").split(",").map((s) => s.trim()).filter(Boolean);
const CORPUS = arg("corpus", "/Users/fomomojodojo/dev/_diagnose-shots/2026-11-18/charter-need-labels-full.json");

async function psql(sql: string): Promise<string[][]> {
  const { code, stdout, stderr } = await new Deno.Command("docker", {
    args: ["exec", "-i", DB, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-tA", "-F", "\t", "-c", sql],
    stdout: "piped", stderr: "piped",
  }).output();
  if (code !== 0) throw new Error(new TextDecoder().decode(stderr).trim());
  return new TextDecoder().decode(stdout).split("\n").filter((l) => l.trim() !== "").map((l) => l.split("\t"));
}
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
const qn = (s: string | null) => (s == null ? "null" : q(s));

// The minimal supabase stand-in the two shared writers need: model_calls inserts (recordModelCall)
// and the model_calls read the spend cap sums over. Nothing else is implemented, so an unsupported
// call throws rather than silently doing nothing.
const sbShim = {
  from(table: string) {
    return {
      insert: async (row: Record<string, unknown>) => {
        const cols = Object.keys(row).filter((k) => row[k] !== undefined);
        const vals = cols.map((k) => (row[k] === null ? "null" : typeof row[k] === "number" ? String(row[k]) : q(String(row[k]))));
        try { await psql(`insert into public.${table} (${cols.join(", ")}) values (${vals.join(", ")})`); return { error: null }; }
        catch (e) { return { error: { message: String(e instanceof Error ? e.message : e) } }; }
      },
      select: (_c: string) => {
        const f: string[] = [];
        const api = {
          eq(c: string, v: unknown) { f.push(`${c} = ${q(String(v))}`); return api; },
          gte(c: string, v: unknown) { f.push(`${c} >= ${q(String(v))}`); return api; },
          in(c: string, v: string[]) { f.push(`${c} in (${v.map(q).join(", ")})`); return api; },
          not(c: string, _o: string, _v: unknown) { f.push(`${c} is not null`); return api; },
          then: (ok: (r: unknown) => unknown, bad?: (e: unknown) => unknown) =>
            psql(`select provider, coalesce(usd::text,'') from public.${table}${f.length ? " where " + f.join(" and ") : ""}`)
              .then((rows) => ({ data: rows.map(([provider, usd]) => ({ provider, usd: usd === "" ? null : Number(usd) })), error: null }))
              .catch((e) => ({ data: null, error: { message: String(e) } }))
              .then(ok as never, bad as never),
        };
        return api;
      },
    };
  },
};

// ── the lane, resolved ONCE for the whole run (SP-460 / SP-468) ──────────────────────────────────
// companyHasClientProvidedMaterial issues head+count selects, which `sbShim` above does not serve;
// this is that one query shape, with the same named join patternLane.ts documents.
function makeCountQuery(table: string) {
  const f: string[] = [];
  const api = {
    select: (_c: string, _o?: unknown) => api,
    eq(c: string, v: unknown) { if (c === "inputs.company_id") { f.push(`__join__${v}`); } else { f.push(`t.${c} = ${q(String(v))}`); } return api; },
    in(c: string, v: string[]) { f.push(`t.${c} in (${v.map(q).join(", ")})`); return api; },
    not(c: string, _o: string, _v: unknown) { f.push(`t.${c} is not null`); return api; },
    then(ok: (r: unknown) => unknown, bad?: (e: unknown) => unknown) {
      const join = f.find((x) => x.startsWith("__join__"));
      const where = f.filter((x) => !x.startsWith("__join__"));
      const from = join ? `public.input_files t join public.inputs i on i.id = t.input_id` : `public.${table} t`;
      if (join) where.push(`i.company_id = ${q(join.slice(8))}`);
      return psql(`select count(*) from ${from}${where.length ? " where " + where.join(" and ") : ""}`)
        .then((r) => ({ count: Number(r[0][0]), error: null }))
        .catch((e) => ({ count: null, error: { message: String(e) } }))
        .then(ok as never, bad as never);
    },
  };
  return api;
}
// deno-lint-ignore no-explicit-any
const laneShim: any = { from: (t: string) => makeCountQuery(t) };
const material = await companyHasClientProvidedMaterial(laneShim, COMPANY);

// ── the needs and their COUNTED quotes, from stored rows ─────────────────────────────────────────
const corpus = JSON.parse(await Deno.readTextFile(CORPUS)) as { needs: Record<string, string> };
const keyByOutcome = new Map(Object.entries(corpus.needs).map(([k, v]) => [v.trim().toLowerCase(), k]));

const needRows = await psql(`select n.id, n.desired_outcome, n.status, coalesce(n.source_path,'')
  from public.odi_needs n where n.company_id = ${q(COMPANY)} and n.status in ('active','proposed')`);
// JSON, not the tab-separated form the other reads use: a verified quote carries newlines and tabs of
// its own (a reviewer's line breaks), and splitting such a row on "\t" silently shears it into the
// wrong columns — which is how the first run of this script died, on an undefined `quote`.
const evRows = await psqlJson<{ need_id: string; signal_id: string; brand: string; quote: string | null; url: string | null; date: string | null; polarity: string | null }>(
  `select e.need_id, e.signal_id, e.brand, s.quote, s.source_url as url,
     to_char(s.event_date,'YYYY-MM-DD') as date, e.polarity
   from public.need_evidence e join public.signals s on s.id = e.signal_id
   where e.company_id = ${q(COMPANY)} and e.bears`);

const quotesByNeed = new Map<string, PatternQuote[]>();
for (const { need_id: needId, signal_id: signalId, brand, quote: rawQuote, url: rawUrl, date, polarity } of evRows) {
  const quote = rawQuote ?? "";
  const url = rawUrl ?? "";
  const eventDate = date || null;
  if (!isCounted({ brand, eventDate })) continue;      // the ONE counting authority
  if (!quote.trim()) continue;                          // no verified quote, nothing to read
  (quotesByNeed.get(needId) ?? quotesByNeed.set(needId, []).get(needId)!)
    .push({
      signalId, quote, site: siteOf(url), eventDate, brand,
      // SP-470: the quote's own polarity reaches the generator. An unrecognised or NULL value is
      // passed through as null and shown as "unlabelled" rather than guessed into a polarity.
      polarity: QUOTE_POLARITIES.includes(polarity as QuotePolarity) ? (polarity as QuotePolarity) : null,
    });
}

const needs = needRows
  .map(([id, outcome, status, sourcePath]) => ({ id, outcome, status, sourcePath, key: keyByOutcome.get(outcome.trim().toLowerCase()) ?? "—" }))
  .filter((n) => (WANT.length ? WANT.includes(n.key) : true))
  .sort((a, b) => (quotesByNeed.get(b.id)?.length ?? 0) - (quotesByNeed.get(a.id)?.length ?? 0));

if (WANT.length) {
  const missing = WANT.filter((k) => !needs.some((n) => n.key === k));
  if (missing.length) { console.error(`REFUSED: no need row for ${missing.join(", ")} on this company`); Deno.exit(1); }
}

const provenance = patternRouteProvenance({
  hasClientMaterial: material.has,
  signalSourceTypes: (await psql(`select distinct coalesce(s.source_type,'') from public.signals s
    join public.need_evidence e on e.signal_id = s.id and e.company_id = s.company_id
    where s.company_id = ${q(COMPANY)}`)).map((r) => r[0]),
  needSourcePaths: [...new Set(needs.map((n) => n.sourcePath))],
});
const lane = resolveModel({ role: "generator", inputs: [{ provenance }] });
const judgeLane = resolveModel({ role: "judge", inputs: [{ provenance }] });
const JUDGE_PROVIDER = judgeLane.provider;
const JUDGE_MODEL = judgeLane.model;
console.log(`lane: ${lane.provider}  generator=${lane.model}  judge=${judgeLane.model}`);
console.log(`      client material: ${material.has ? material.found.map((f) => `${f.kind}=${f.count}`).join(" ") : "none"}`);
console.log(`rubric: ${PATTERN_RUBRIC_VERSION}  md5 ${await md5(PATTERN_RUBRIC_TEXT)}`);
console.log(`needs: ${needs.map((n) => `${n.key}(${quotesByNeed.get(n.id)?.length ?? 0})`).join(" ")}\n`);

async function md5(text: string): Promise<string> {
  const p = new Deno.Command("md5", { args: ["-q", "-s", text], stdout: "piped" });
  const { stdout } = await p.output();
  return new TextDecoder().decode(stdout).trim();
}
const RUBRIC_MD5 = await md5(PATTERN_RUBRIC_TEXT);

// ── the routed caller: local stays local, and a PAID call is projected and checked before it is sent ──
const OLLAMA = Deno.env.get("OLLAMA_BASE_URL") ?? "http://127.0.0.1:11434/v1";
const spendCap = makeSpendCap({ capUsd: SPEND_CAP_CEILING_USD, companyId: COMPANY, since: new Date().toISOString(), supabase: sbShim as never });
let usage: { prompt_tokens: number; completion_tokens: number } | null = null;
const timings: Array<{ need: string; role: string; model: string; seconds: number; outChars: number }> = [];

const routed = makeRoutedModel({
  callLocalGenerator: (model, system, user) => callOllamaJson(OLLAMA, model, system, user, 600_000, { temperature: 0, num_predict: PATTERN_NUM_PREDICT } as never),
  // SP-428's strengths are OURS, not the judge's; the judge still runs at temperature 0 so a re-judge
  // of the same pattern returns the same verdict.
  callLocalJudge: (model, system, user) => callOllamaJson(OLLAMA, model, system, user, 600_000, { temperature: 0, seed: 42, num_predict: JUDGE_NUM_PREDICT } as never),
  openaiKey: Deno.env.get("OPENAI_API_KEY") ?? "",
  onUsage: (u) => { usage = u; },
  externalTemperature: 0,
  externalSeed: 42,
  externalMaxTokens: PATTERN_NUM_PREDICT,
  // SP-464: wired for the companies where the external lane CAN fire. On Charter it never does.
  beforeExternal: (c) => assertSpendable(spendCap, {
    site: CALL_SITE, model: c.model,
    projectedUsd: projectOpenAIUsd(c.model, { promptChars: c.system.length + c.user.length, maxOutputTokens: PATTERN_NUM_PREDICT }),
  }),
});

async function call(role: "generator" | "judge", need: string, system: string, user: string, quiet = false) {
  usage = null;
  const t0 = performance.now();
  const r = await routed({ role, provenances: [provenance], system, user });
  const seconds = (performance.now() - t0) / 1000;
  timings.push({ need, role, model: r.model, seconds, outChars: r.content.length });
  if (!quiet) console.log(`    ${role.padEnd(9)} ${r.model.padEnd(22)} ${seconds.toFixed(1)}s  ${r.content.length} chars`);
  // the ledger, on EVERY call — a local call is priced 0, and that 0 is a record, not an absence
  await recordModelCall(sbShim as never, {
    companyId: COMPANY, callSite: `${CALL_SITE}:${role}`,
    usage: r.provider === "external_openai"
      ? openaiRecord(r.model, usage)
      : { provider: r.provider, model: r.model, prompt_tokens: null, completion_tokens: null, usd: 0 },
    promptSha: await (async () => (await md5(system + "\n" + user))) (),
  });
  return r;
}

let patternsWritten = 0, patternsDropped = 0, quotesWritten = 0;
/** SP-494: how often the span failed to verify. (The keyword flag was removed by SP-504.) */
let spanRejects = 0;
const refusedNeeds: Array<{ key: string; why: string }> = [];
let genProvider = "", genModel = "";
const perNeed: Array<{ key: string; counted: number; patterns: number; ceilingHit: boolean; proposed: number; assigned: number; unassigned: number; polarities: Record<string, number> }> = [];
const runStart = performance.now();

for (const need of needs) {
  const quotes = quotesByNeed.get(need.id) ?? [];
  console.log(`${need.key}  ${quotes.length} counted quote(s)  ${need.outcome.slice(0, 58)}`);
  if (quotes.length === 0) { console.log("    no counted quotes — skipped\n"); continue; }
  // ── SP-470: ONE PASS PER POLARITY ─────────────────────────────────────────────────────────────
  // "positive and mixed patterns are produced separately" read as its strongest sense: their OWN
  // generator call, over their own quotes. The single-pass v2 run proved the weaker reading does not
  // work — asked for all three polarities at once over N13's 44 quotes, the generator returned seven
  // 'not working' patterns and nothing else, leaving all 4 working and all 3 mixed quotes unassigned.
  // A model given 37 complaints and 4 compliments writes about the complaints.
  //
  // Measured polarity on the five needs: 202 'not working', 16 'working', 5 'mixed', 0 unlabelled.
  // A quote with NO stored polarity would get no pass and stay unassigned — reported, not guessed
  // into a polarity it does not carry.
  const byPolarity = new Map<QuotePolarity, PatternQuote[]>();
  for (const qt of quotes) {
    if (qt.polarity == null) continue;
    (byPolarity.get(qt.polarity) ?? byPolarity.set(qt.polarity, []).get(qt.polarity)!).push(qt);
  }
  const unlabelled = quotes.filter((x) => x.polarity == null);
  if (unlabelled.length) console.log(`    note   ${unlabelled.length} quote(s) carry no polarity — no pass covers them`);

  const byId = new Map(quotes.map((x) => [x.signalId, x]));
  type Candidate = { name: string; polarity: QuotePolarity; signalIds: string[]; representativeSignalId: string | null; identity: string };
  const candidates: Candidate[] = [];
  const byIdentity = new Map<string, Candidate>();
  let proposedTotal = 0;
  let collapsed = 0;
  let needRefused = "";

  for (const [polarity, pQuotes] of [...byPolarity].sort((a, b) => b[1].length - a[1].length)) {
    const labels = quoteLabels(pQuotes);
    // ONE BOUNDED RE-ASK per pass (2026-11-20). The schema gate stays absolute — a cut or over-long
    // answer is a finding nobody can trace — but a single refusal must not take the other needs with
    // it: the first v2 run died on a 99-character name against the signed 90-char cap (SP-463) before
    // P1, N15, N14 and P2 ran at all.
    let gen: Awaited<ReturnType<typeof call>> | null = null;
    let proposed: ReturnType<typeof parseGenerated> | null = null;
    let refusal = "";
    for (let attempt = 1; attempt <= 2 && proposed === null; attempt++) {
      const base = buildGeneratorUser(need.outcome, pQuotes);
      const user = attempt === 1 ? base
        : `${base}\n\nYOUR PREVIOUS ANSWER WAS REFUSED: ${refusal}\nAnswer again, fixing only that. Keep the particulars; shorten the wording, do not generalise it.`;
      gen = await call("generator", `${need.key}/${polarity}`, GENERATOR_SYSTEM, user);
      try { proposed = parseGenerated(gen.content, labels); }
      catch (e) {
        refusal = e instanceof Error ? e.message : String(e);
        console.log(`    ${attempt === 1 ? "re-ask" : "REFUSED"} ${polarity} (attempt ${attempt}): ${refusal.slice(0, 100)}`);
      }
    }
    if (proposed === null || gen === null) { needRefused = refusal; continue; }
    genProvider = gen.provider; genModel = gen.model;
    proposedTotal += proposed.length;

    for (const c of proposed) {
      // SP-470, MECHANICALLY: a pattern carries ONE polarity, so a quote of another polarity is not
      // its evidence. Within a per-polarity pass this can only fire if the model cited across the
      // group, which it cannot — the pass is only given its own quotes — so it is a floor, not a filter.
      const own = c.signalIds.filter((id) => byId.get(id)?.polarity === polarity);
      if (own.length === 0) continue;
      const identity = await patternIdentity(need.id, c.name);
      const seen = byIdentity.get(identity);
      if (seen) {
        // EXACT DUPLICATE COLLAPSE. Two patterns with the same normalised name ARE one pattern —
        // that is what pattern_identity means — so they are merged by unioning their quotes rather
        // than written twice. The first v2 run proved this is not hypothetical: P1's generator
        // returned "Outages are frequent and can last for days…" THREE times, with the same 20
        // citations, and the unique index on pattern_identity refused the second insert and killed
        // the run. This is not SP-471's merge step: that is about distinct names describing one rule,
        // and this is the same name twice.
        collapsed++;
        seen.signalIds = [...new Set([...seen.signalIds, ...own])];
        seen.representativeSignalId ??= c.representativeSignalId;
        continue;
      }
      const cand: Candidate = { name: c.name, polarity, signalIds: own, representativeSignalId: c.representativeSignalId, identity };
      byIdentity.set(identity, cand);
      candidates.push(cand);
    }
  }
  if (collapsed) console.log(`    note   ${collapsed} exact-duplicate pattern(s) collapsed by identity`);
  if (candidates.length === 0) {
    console.log(`    NEED REFUSED — no pattern survived the schema gate for ${need.key}\n`);
    refusedNeeds.push({ key: need.key, why: needRefused || "no pattern proposed" });
    continue;
  }
  // SP-469: the ceiling is per NEED, across the polarity passes, and hitting it is a FACT OF THE RUN
  // — stored because it cannot be recovered afterwards: 12 kept patterns and "the generator wanted
  // more" look identical in the table.
  const ceilingHit = proposedTotal >= PATTERN_CEILING;
  if (ceilingHit) console.log(`    ⚠ ceiling: ${proposedTotal} patterns proposed across the polarity passes, at or over the SP-469 ceiling of ${PATTERN_CEILING}`);
  const proposed = candidates.slice(0, PATTERN_CEILING);

  if (APPLY) {
    const sup = await psql(`update public.need_patterns
        set superseded_at = now(), superseded_reason = ${q("superseded by " + PATTERN_RUBRIC_VERSION + " run " + TAG)}
      where company_id = ${q(COMPANY)} and need_id = ${q(need.id)} and superseded_at is null
      returning 1`);
    if (sup.length) console.log(`    superseded ${sup.length} earlier pattern(s) of this need`);
  }

  const assigned = new Set<string>();
  const usedRepresentative = new Set<string>();
  let keptHere = 0;   // per-need, not the run total — the summary below is per need
  const polarities: Record<string, number> = {};
  const writes: string[] = [];

  for (const p of proposed) {
    const cited = p.signalIds.map((id) => byId.get(id)!).filter(Boolean);
    if (cited.length === 0) { patternsDropped++; console.log(`    drop   (cited nothing)  "${p.name.slice(0, 44)}"`); continue; }

    // SP-475(d): ONE quote per judge call. The judge never sees the pattern's other quotes, so its
    // verdict on this quote cannot depend on them.
    const verdicts: Array<{ q: PatternQuote; supports: boolean; reason: string; states: string; notStated: string[]; rejected: string }> = [];
    for (const qt of cited) {
      const j = await call("judge", need.key, JUDGE_SYSTEM, buildJudgeUser(need.outcome, p.name, qt), true);
      // SP-494: `supports` is COMPUTED from the judge's own not-stated list plus a verbatim check on
      // the span it cited; it is never read off the model's answer.
      const v = parseJudgeOne(j.content, qt.quote);
      if (v.rejected) spanRejects++;
      verdicts.push({ q: qt, supports: v.supports, reason: v.reason, states: v.states, notStated: v.notStated, rejected: v.rejected });
    }
    const supporting = verdicts.filter((v) => v.supports).map((v) => v.q);
    if (supporting.length === 0) {
      patternsDropped++;
      console.log(`    drop   (judge kept 0 of ${String(cited.length).padStart(2)})    "${p.name.slice(0, 54)}"`);
      continue;
    }

    const strength = patternStrength(supporting);
    const identity = p.identity;
    const sites = new Set(supporting.map((x) => x.site));
    // SP-475(c): the generator's pick when it survived the judge and is not already a representative
    // of another pattern in this need; otherwise the first survivor that is free. null only when every
    // survivor is already spoken for, which the unique index then permits.
    const rep = [p.representativeSignalId, ...supporting.map((x) => x.signalId)]
      .find((id) => id && supporting.some((x) => x.signalId === id) && !usedRepresentative.has(id)) ?? null;
    if (rep) usedRepresentative.add(rep);
    for (const x of supporting) assigned.add(x.signalId);
    polarities[p.polarity] = (polarities[p.polarity] ?? 0) + 1;

    console.log(`    keep   ${p.polarity.padEnd(11)} ${strength.padEnd(16)} ${String(supporting.length).padStart(2)}/${sites.size} of ${String(cited.length).padStart(2)} cited  "${p.name.slice(0, 44)}"`);
    patternsWritten++; keptHere++;
    quotesWritten += cited.length;
    const firstReason = (verdicts.find((v) => v.supports)?.reason) || null;
    writes.push(`with ins as (
        insert into public.need_patterns (company_id, need_id, name, strength, polarity, judge_reason,
          representative_signal_id, pattern_identity, rubric_version, rubric_md5,
          model_provider, model_name, judge_provider, judge_model, judged_at, run_ref,
          run_ceiling_hit, run_proposed_count)
        values (${q(COMPANY)}, ${q(need.id)}, ${q(p.name)}, ${q(strength)}, ${q(p.polarity)}, ${qn(firstReason)},
          ${rep ? q(rep) : "null"}, ${q(identity)}, ${q(PATTERN_RUBRIC_VERSION)}, ${q(RUBRIC_MD5)},
          ${q(genProvider)}, ${q(genModel)}, ${q(JUDGE_PROVIDER)}, ${q(JUDGE_MODEL)}, now(), ${q(TAG)},
          ${ceilingHit}, ${proposed.length})
        returning id)
      insert into public.need_pattern_quotes (company_id, pattern_id, signal_id, bears, judge_reason,
          states_span, not_stated)
      select ${q(COMPANY)}, ins.id, v.sid, v.bears, v.reason, v.span, v.notstated::jsonb
        from ins, (values ${verdicts.map((v) => `(${q(v.q.signalId)}::uuid, ${v.supports}, ${qn(v.reason || null)}, ${qn(v.states || null)}, ${q(JSON.stringify(v.notStated))})`).join(", ")}) as v(sid, bears, reason, span, notstated)`);
  }
  if (APPLY && writes.length) await psql("begin;\n" + writes.join(";\n") + ";\ncommit;");

  // SP-469: every counted quote under NO surviving pattern is listed.
  const unassigned = quotes.filter((x) => !assigned.has(x.signalId));
  console.log(`    coverage ${assigned.size} of ${quotes.length} counted quotes under a pattern · ${unassigned.length} unassigned` +
    (ceilingHit ? " · CEILING HIT" : ""));
  if (unassigned.length) {
    console.log(`    unassigned: ${unassigned.map((x) => `${x.signalId.slice(0, 8)}[${x.polarity ?? "unlabelled"}]`).join(" ")}`);
  }
  perNeed.push({
    key: need.key, counted: quotes.length, patterns: keptHere, ceilingHit, proposed: proposedTotal,
    assigned: assigned.size, unassigned: unassigned.length, polarities,
  });
  console.log("");
}

const total = (performance.now() - runStart) / 1000;
console.log(`── ${APPLY ? "APPLIED" : "DRY RUN"} ───────────────────────────────────────────────`);
console.log(`patterns kept ${patternsWritten} · dropped ${patternsDropped} · quote rows ${quotesWritten}`);
console.log(`SP-494: ${spanRejects} verdict(s) rejected for an unverifiable span`);
console.log("\nper need:");
for (const n of perNeed) {
  console.log(`  ${n.key.padEnd(4)} counted ${String(n.counted).padStart(2)} · patterns ${String(n.patterns).padStart(2)}` +
    ` · proposed ${String(n.proposed).padStart(2)} · ceiling ${n.ceilingHit ? "HIT" : "no "}` +
    ` · coverage ${n.assigned}/${n.counted} · unassigned ${n.unassigned}` +
    ` · polarity ${JSON.stringify(n.polarities)}`);
}
console.log(`model calls ${timings.length} · total local time ${total.toFixed(1)}s`);
for (const t of timings) console.log(`  ${t.need.padEnd(4)} ${t.role.padEnd(9)} ${t.model.padEnd(22)} ${t.seconds.toFixed(1)}s`);
if (refusedNeeds.length) {
  console.log(`\nNEEDS REFUSED (${refusedNeeds.length}) — the schema gate held and nothing was written for them:`);
  for (const r of refusedNeeds) console.log(`  ${r.key}: ${r.why}`);
}
if (spendCap.refusals.length) console.log(`spend cap refusals: ${JSON.stringify(spendCap.refusals)}`);
if (!APPLY) console.log("nothing written — re-run with --apply");
