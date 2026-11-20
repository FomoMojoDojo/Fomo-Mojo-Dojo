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
  GENERATOR_SYSTEM, JUDGE_SYSTEM, PATTERN_NUM_PREDICT, PATTERN_RUBRIC_TEXT, PATTERN_RUBRIC_VERSION,
  buildGeneratorUser, buildJudgeUser, parseGenerated, parseJudged, patternIdentity, patternStrength,
  quoteLabels, type PatternQuote,
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
const evRows = await psqlJson<{ need_id: string; signal_id: string; brand: string; quote: string | null; url: string | null; date: string | null }>(
  `select e.need_id, e.signal_id, e.brand, s.quote, s.source_url as url, to_char(s.event_date,'YYYY-MM-DD') as date
   from public.need_evidence e join public.signals s on s.id = e.signal_id
   where e.company_id = ${q(COMPANY)} and e.bears`);

const quotesByNeed = new Map<string, PatternQuote[]>();
for (const { need_id: needId, signal_id: signalId, brand, quote: rawQuote, url: rawUrl, date } of evRows) {
  const quote = rawQuote ?? "";
  const url = rawUrl ?? "";
  const eventDate = date || null;
  if (!isCounted({ brand, eventDate })) continue;      // the ONE counting authority
  if (!quote.trim()) continue;                          // no verified quote, nothing to read
  (quotesByNeed.get(needId) ?? quotesByNeed.set(needId, []).get(needId)!)
    .push({ signalId, quote, site: siteOf(url), eventDate, brand });
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
  callLocalJudge: (model, system, user) => callOllamaJson(OLLAMA, model, system, user, 600_000, { temperature: 0, seed: 42 }),
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

async function call(role: "generator" | "judge", need: string, system: string, user: string) {
  usage = null;
  const t0 = performance.now();
  const r = await routed({ role, provenances: [provenance], system, user });
  const seconds = (performance.now() - t0) / 1000;
  timings.push({ need, role, model: r.model, seconds, outChars: r.content.length });
  console.log(`    ${role.padEnd(9)} ${r.model.padEnd(22)} ${seconds.toFixed(1)}s  ${r.content.length} chars`);
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
const runStart = performance.now();

for (const need of needs) {
  const quotes = quotesByNeed.get(need.id) ?? [];
  console.log(`${need.key}  ${quotes.length} counted quote(s)  ${need.outcome.slice(0, 58)}`);
  if (quotes.length === 0) { console.log("    no counted quotes — skipped\n"); continue; }
  const labels = quoteLabels(quotes);

  const gen = await call("generator", need.key, GENERATOR_SYSTEM, buildGeneratorUser(need.outcome, quotes));
  let proposed;
  try { proposed = parseGenerated(gen.content, labels); }
  catch (e) { console.error(`    REFUSED: ${e instanceof Error ? e.message : e}`); Deno.exit(1); }

  const writes: string[] = [];
  for (const p of proposed) {
    const cited = quotes.filter((x) => p.signalIds.includes(x.signalId));
    if (cited.length === 0) { patternsDropped++; console.log(`    drop   (cited nothing)        "${p.name.slice(0, 54)}"`); continue; }
    const j = await call("judge", need.key, JUDGE_SYSTEM, buildJudgeUser(need.outcome, p.name, cited));
    const verdict = parseJudged(j.content, quoteLabels(cited));
    const supporting = cited.filter((x) => verdict.supporting.includes(x.signalId));
    if (supporting.length === 0) {
      // SP-463: a pattern with zero surviving supporting quotes is not stored.
      patternsDropped++;
      console.log(`    drop   (judge kept 0 of ${String(cited.length).padStart(2)})    "${p.name.slice(0, 54)}"`);
      continue;
    }
    const strength = patternStrength(supporting);
    const identity = await patternIdentity(need.id, p.name);
    const sites = new Set(supporting.map((x) => x.site));
    console.log(`    keep   ${strength.padEnd(16)} ${String(supporting.length).padStart(2)}/${sites.size} of ${String(cited.length).padStart(2)} cited  "${p.name.slice(0, 48)}"`);
    patternsWritten++;
    quotesWritten += cited.length;
    const rep = supporting[0].signalId;
    writes.push(`with superseded as (
        update public.need_patterns set superseded_at = now()
         where company_id = ${q(COMPANY)} and need_id = ${q(need.id)} and pattern_identity = ${q(identity)}
           and superseded_at is null returning id),
      ins as (
        insert into public.need_patterns (company_id, need_id, name, strength, judge_reason,
          representative_signal_id, pattern_identity, rubric_version, rubric_md5,
          model_provider, model_name, judge_provider, judge_model, judged_at, run_ref)
        values (${q(COMPANY)}, ${q(need.id)}, ${q(p.name)}, ${q(strength)}, ${qn(verdict.reason || null)},
          ${q(rep)}, ${q(identity)}, ${q(PATTERN_RUBRIC_VERSION)}, ${q(RUBRIC_MD5)},
          ${q(gen.provider)}, ${q(gen.model)}, ${q(j.provider)}, ${q(j.model)}, now(), ${q(TAG)})
        returning id)
      insert into public.need_pattern_quotes (company_id, pattern_id, signal_id, bears, judge_reason)
      select ${q(COMPANY)}, ins.id, v.sid, v.bears, ${qn(verdict.reason || null)}
        from ins, (values ${cited.map((c) => `(${q(c.signalId)}::uuid, ${verdict.supporting.includes(c.signalId)})`).join(", ")}) as v(sid, bears)`);
  }
  if (APPLY && writes.length) await psql("begin;\n" + writes.join(";\n") + ";\ncommit;");
  console.log("");
}

const total = (performance.now() - runStart) / 1000;
console.log(`── ${APPLY ? "APPLIED" : "DRY RUN"} ───────────────────────────────────────────────`);
console.log(`patterns kept ${patternsWritten} · dropped ${patternsDropped} · quote rows ${quotesWritten}`);
console.log(`model calls ${timings.length} · total local time ${total.toFixed(1)}s`);
for (const t of timings) console.log(`  ${t.need.padEnd(4)} ${t.role.padEnd(9)} ${t.model.padEnd(22)} ${t.seconds.toFixed(1)}s`);
if (spendCap.refusals.length) console.log(`spend cap refusals: ${JSON.stringify(spendCap.refusals)}`);
if (!APPLY) console.log("nothing written — re-run with --apply");
