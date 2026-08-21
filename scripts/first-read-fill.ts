// ── First Read per-company FILL runner (vite-node, local dev) ──────────────────
//
// Runs the IDEMPOTENT public First Read steps for a company, in dependency order, and never calls
// research-company or refresh-positioning. Every step is convergent (identity/pair-keyed) or
// append-only (score), so a re-run either lands nothing new or an identical/appended row.
//
//   own_words → recurrence → deltas_public → open_questions → status_conflict → score
//
// Models (privacy): own_words extraction sends ONLY public site content to OpenAI (allowed);
// recurrence / deltas / open_questions run on LOCAL Ollama; status_conflict + score are deterministic
// (no model). Nothing internal/uploaded/intake enters any step (each edge fn enforces its own gate).
//
// Deltas are driven DIRECTLY against generate-claim-deltas (plan → cap-3 chunks → finalize, the
// headless runner sequencing every chunk) — NOT via refresh-deltas-step, whose gateway self-chain +
// 25-min stall-window watchdog livelocks a large company. generate-claim-deltas is used verbatim.
//
//   npx vite-node scripts/first-read-fill.ts -- --company=<id>
//   npx vite-node scripts/first-read-fill.ts -- --all
//   npx vite-node scripts/first-read-fill.ts -- --all --dry-run          # plan only, touches nothing
//   npx vite-node scripts/first-read-fill.ts -- --company=<id> --from=deltas_public
//   npx vite-node scripts/first-read-fill.ts -- --all --skip=recurrence   # hold a step (skipped:operator)
//
// --skip=<step,…>: the operator holds a step out; it is ledgered skipped:operator and nothing runs
// for it. When recurrence is skipped, the score step passes --no-recurrence so record_strength is
// recorded not_computed (honest — beat 8 shows "—" + the signed line), never a misleading 0.
//
// FROZEN: CB1 (58b2b15b) is hard-excluded by id AND by companies.frozen; the empty dup
// 916ce5f4 is excluded too. --company refuses either. Edge fns independently refuse frozen.
//
// Ledger: one first_read_fill_runs row per company per step (started/finished, rows before/after,
// outcome ran|skipped:<reason>|failed:<error>).

import { execFileSync } from "node:child_process";
import { packPairChunks } from "../src/lib/signalRecurrence/packPairChunks";
import { packAnchorChunks } from "../src/lib/firstRead/packAnchors";
import { packDeltaChunks, type DeltaPlanClaim } from "../src/lib/claimDeltas/packChunks";
import {
  CB1_FROZEN_ID, HELD_FROM_ALL, FILL_STEP_ORDER, stepsFrom, skipReason, refuseReason, ledgerEnabled,
  parseSkip, type FillStep, type FillCounts,
} from "../src/lib/firstReadFill/plan";

const DB_CONTAINER = "supabase_db_dzlgyxcvuwiulgifbmew";
const SUPA_URL = "http://127.0.0.1:54321";
// Local demo service-role key (a valid service_role JWT — passes verify_jwt on every edge fn).
const SERVICE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.-3WFNcnncF4UrDHQ-nYO1RWUz_i-yLHWIPXVLQyQW-o";
// CB1_FROZEN_ID + HELD_FROM_ALL (916 empty dup + CB2 live-test fixture) come from the pure plan lib.

const argv = process.argv.slice(2);
const dryRun = argv.includes("--dry-run");
const all = argv.includes("--all");
const onlyCompany = argv.find((a) => a.startsWith("--company="))?.split("=")[1] ?? null;
const fromStep = argv.find((a) => a.startsWith("--from="))?.split("=")[1] ?? null;
const skipArg = argv.find((a) => a.startsWith("--skip="))?.split("=")[1] ?? null;
let skipSet: Set<FillStep>;
try { skipSet = parseSkip(skipArg); } catch (e) { console.error((e as Error).message); process.exit(1); }
type Step = FillStep;

function psql<T = unknown>(sql: string): T {
  const out = execFileSync(
    "docker",
    ["exec", "-i", DB_CONTAINER, "psql", "-U", "postgres", "-d", "postgres", "-tA", "-c", sql],
    { encoding: "utf8" },
  ).trim();
  return (out ? JSON.parse(out) : null) as T;
}
function count(sql: string): number {
  const out = execFileSync(
    "docker",
    ["exec", "-i", DB_CONTAINER, "psql", "-U", "postgres", "-d", "postgres", "-tA", "-c", sql],
    { encoding: "utf8" },
  ).trim();
  return Number(out || 0);
}

const RUN_BATCH = new Date().toISOString();
function ledger(companyId: string, companyName: string, step: Step, startedAt: string, finishedAt: string | null, before: number | null, after: number | null, outcome: string): void {
  if (!ledgerEnabled(dryRun)) return; // dry-run writes nothing
  const payload = JSON.stringify({ run_batch: RUN_BATCH, company_id: companyId, company_name: companyName, step, started_at: startedAt, finished_at: finishedAt, rows_before: before, rows_after: after, outcome });
  const sql = `INSERT INTO first_read_fill_runs (run_batch, company_id, company_name, step, started_at, finished_at, rows_before, rows_after, outcome)
    SELECT j->>'run_batch', (j->>'company_id')::uuid, j->>'company_name', j->>'step', (j->>'started_at')::timestamptz,
           NULLIF(j->>'finished_at','')::timestamptz, NULLIF(j->>'rows_before','')::int, NULLIF(j->>'rows_after','')::int, j->>'outcome'
    FROM (SELECT $$${payload.replace(/\$\$/g, "")}$$::jsonb AS j) t;`;
  execFileSync("docker", ["exec", "-i", DB_CONTAINER, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-c", sql], { encoding: "utf8" });
}

async function invokeFn(name: string, body: Record<string, unknown>, timeoutMs = 180_000): Promise<{ status: number; ok: boolean; data: any }> {
  const resp = await fetch(`${SUPA_URL}/functions/v1/${name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await resp.text();
  let data: any; try { data = JSON.parse(text); } catch { data = { raw: text.slice(0, 300) }; }
  return { status: resp.status, ok: resp.ok, data };
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── per-company counts (skip inputs + before/after) ────────────────────────────
const q = {
  website: (id: string) => psql<string | null>(`SELECT coalesce(to_jsonb(website), 'null'::jsonb) FROM companies WHERE id='${id}';`),
  ownWords: (id: string) => count(`SELECT count(*) FROM claims WHERE company_id='${id}' AND claim_type='own_words';`),
  outsideSignals: (id: string) => count(`SELECT count(*) FROM signals WHERE company_id='${id}' AND signal_band='outside' AND voice_class='outside_voice_about_client' AND superseded_at IS NULL AND length(trim(coalesce(evidence_excerpt,'')))>0;`),
  recurrenceVerdicts: (id: string) => count(`SELECT count(*) FROM signal_recurrence_verdicts WHERE company_id='${id}';`),
  deltasPublic: (id: string) => count(`SELECT count(*) FROM claim_deltas WHERE company_id='${id}' AND pairing_kind='public_vs_public';`),
  questions: (id: string) => count(`SELECT count(*) FROM first_read_open_questions WHERE company_id='${id}' AND status='live' AND coalesce(source_kind,'')<>'status_conflict';`),
  statusConflicts: (id: string) => count(`SELECT count(*) FROM first_read_open_questions WHERE company_id='${id}' AND status='live' AND source_kind='status_conflict';`),
  scoreRows: (id: string) => count(`SELECT count(*) FROM mojo_scores WHERE company_id='${id}' AND methodology_version LIKE 'outside-%';`),
};

type Company = { id: string; name: string; website: string | null; frozen: boolean };

function selectCompanies(): Company[] {
  if (onlyCompany) {
    const rows = psql<Company[]>(`SELECT coalesce(json_agg(json_build_object('id',id,'name',name,'website',website,'frozen',coalesce(frozen,false))),'[]'::json) FROM companies WHERE id='${onlyCompany}';`) ?? [];
    return rows;
  }
  // --all: every NON-frozen REAL company, minus CB1 (by id AND flag) and the held fixtures (916 + CB2).
  const held = [...HELD_FROM_ALL].map((x) => `'${x}'`).join(",");
  return psql<Company[]>(
    `SELECT coalesce(json_agg(json_build_object('id',id,'name',name,'website',website,'frozen',coalesce(frozen,false)) ORDER BY created_at),'[]'::json)
     FROM companies WHERE coalesce(frozen,false)=false AND id NOT IN ('${CB1_FROZEN_ID}',${held});`,
  ) ?? [];
}

function stepsToRun(): Step[] {
  try { return stepsFrom(fromStep); }
  catch (e) { console.error((e as Error).message); process.exit(1); }
}
function countsFor(c: Company): FillCounts {
  return { hasWebsite: !!c.website?.trim(), ownWords: q.ownWords(c.id), outsideSignals: q.outsideSignals(c.id) };
}
// The row count that a step's before/after reflects (used for a skipped step's ledger line).
function stepMetric(step: Step, c: Company): number {
  switch (step) {
    case "own_words": return q.ownWords(c.id);
    case "recurrence": return q.recurrenceVerdicts(c.id);
    case "deltas_public": return q.deltasPublic(c.id);
    case "open_questions": return q.questions(c.id);
    case "status_conflict": return q.statusConflicts(c.id);
    case "score": return q.scoreRows(c.id);
  }
}

// ── the six steps ──────────────────────────────────────────────────────────────
async function runOwnWords(c: Company, counts: FillCounts): Promise<{ before: number; after: number; outcome: string }> {
  const before = q.ownWords(c.id);
  const skip = skipReason("own_words", counts);
  if (skip) return { before, after: before, outcome: `skipped:${skip}` };
  const plan = await invokeFn("extract-own-words", { company_id: c.id, mode: "plan" }, 180_000);
  if (!plan.ok) return { before, after: q.ownWords(c.id), outcome: `failed:plan_${plan.status}_${plan.data?.error ?? ""}`.slice(0, 200) };
  const write = await invokeFn("extract-own-words", { company_id: c.id, mode: "write" }, 120_000);
  const after = q.ownWords(c.id);
  if (!write.ok) return { before, after, outcome: write.status === 409 ? "skipped:no_candidates" : `failed:write_${write.status}` };
  return { before, after, outcome: "ran" };
}

async function runRecurrence(c: Company, counts: FillCounts): Promise<{ before: number; after: number; outcome: string }> {
  const before = q.recurrenceVerdicts(c.id);
  const skip = skipReason("recurrence", counts);
  if (skip) return { before, after: before, outcome: `skipped:${skip}` };
  const plan = await invokeFn("generate-signal-recurrence", { company_id: c.id, plan: true }, 120_000);
  if (!plan.ok) return { before, after: q.recurrenceVerdicts(c.id), outcome: `failed:plan_${plan.status}` };
  const pairs = Array.isArray(plan.data?.pairs) ? plan.data.pairs : [];
  const chunks = packPairChunks(pairs);
  const freshTotal = Number(plan.data?.candidates_fresh ?? 0);
  for (const chunk of chunks) {
    try { await invokeFn("generate-signal-recurrence", { company_id: c.id, write: true, pairs: chunk, run_target: freshTotal }, 150_000); }
    catch { /* per-chunk isolation: banked verdicts make resume cheap; keep going */ }
  }
  await invokeFn("generate-signal-recurrence", { company_id: c.id, write: true }, 170_000); // finalize
  return { before, after: q.recurrenceVerdicts(c.id), outcome: `ran:pairs=${pairs.length}` };
}

async function runDeltasPublic(c: Company, counts: FillCounts): Promise<{ before: number; after: number; outcome: string }> {
  const before = q.deltasPublic(c.id);
  const skip = skipReason("deltas_public", counts);
  if (skip) return { before, after: before, outcome: `skipped:${skip}` };
  // Drive generate-claim-deltas DIRECTLY (plan → cap-3 chunks → finalize), like recurrence/questions.
  // The headless runner controls timing, so it avoids refresh-deltas-step's gateway self-chain +
  // 25-min stall-window watchdog, which livelocks a big company (chunk 1 banks, the waitUntil→fetch
  // self-chain to chunk 2 is unreliable behind the gateway → the run is swept stale → re-fired →
  // repeats forever). Re-plan each pass so a cut/failed chunk is returned again (idempotent retry);
  // packDeltaChunks filters candidates_fresh>0, so each pass shrinks and the loop converges.
  const pk = "public_vs_public";
  let passes = 0, totalChunks = 0;
  let planErr: string | null = null;
  while (passes++ < 60) {
    const plan = await invokeFn("generate-claim-deltas", { company_id: c.id, plan: true, pairing_kind: pk }, 120_000).catch(() => null);
    if (!plan || !plan.ok) { planErr = plan ? `plan_${plan.status}` : "plan_timeout"; break; }
    const claims: DeltaPlanClaim[] = Array.isArray(plan.data?.claims) ? plan.data.claims : [];
    const chunks = packDeltaChunks(claims);
    if (chunks.length === 0) break; // converged — no fresh candidates remain
    for (const chunk of chunks) {
      totalChunks++;
      try {
        await invokeFn("generate-claim-deltas", {
          company_id: c.id, write: true, pairing_kind: pk,
          declared_ids: chunk.map((x) => x.declared_claim_id),
        }, 420_000);
      } catch { /* gateway cut / timeout: idempotent — the next re-plan returns unbanked pairs */ }
    }
  }
  if (planErr) return { before, after: q.deltasPublic(c.id), outcome: `failed:${planErr}` };
  // FINALIZE — the ONE unscoped run (silences + stale-sweep).
  const fin = await invokeFn("generate-claim-deltas", { company_id: c.id, write: true, pairing_kind: pk }, 420_000).catch(() => null);
  const after = q.deltasPublic(c.id);
  if (!fin || !fin.ok) return { before, after, outcome: `failed:finalize_${fin ? fin.status : "timeout"}` };
  return { before, after, outcome: `ran:chunks=${totalChunks}` };
}

async function runOpenQuestions(c: Company, _counts: FillCounts): Promise<{ before: number; after: number; outcome: string }> {
  const before = q.questions(c.id);
  const plan = await invokeFn("generate-open-questions", { company_id: c.id, plan: true }, 120_000);
  if (!plan.ok || !plan.data?.ok) return { before, after: q.questions(c.id), outcome: `failed:plan_${plan.status}` };
  const runId = plan.data.run_id as string;
  const anchorIds = (Array.isArray(plan.data.anchors) ? plan.data.anchors : []).map((a: { identity: string }) => a.identity);
  const chunks = packAnchorChunks(anchorIds);
  for (const chunk of chunks) {
    try { await invokeFn("generate-open-questions", { company_id: c.id, run_id: runId, write: true, anchor_identities: chunk }, 150_000); }
    catch { /* per-chunk isolation */ }
  }
  await invokeFn("generate-open-questions", { company_id: c.id, run_id: runId, write: true }, 150_000); // finalize
  return { before, after: q.questions(c.id), outcome: `ran:anchors=${anchorIds.length}` };
}

async function runStatusConflict(c: Company, _counts: FillCounts): Promise<{ before: number; after: number; outcome: string }> {
  const before = q.statusConflicts(c.id);
  const res = await invokeFn("detect-status-conflict", { company_id: c.id }, 120_000);
  if (!res.ok) return { before, after: q.statusConflicts(c.id), outcome: res.status === 403 ? "skipped:frozen" : `failed:${res.status}` };
  const after = q.statusConflicts(c.id);
  return { before, after, outcome: after > 0 ? "ran:conflict" : "ran:none" };
}

function runScore(c: Company, counts: FillCounts): { before: number; after: number; outcome: string } {
  const before = q.scoreRows(c.id);
  const skip = skipReason("score", counts);
  if (skip) return { before, after: before, outcome: `skipped:${skip}` };
  // If recurrence was skipped this run, tell the scorer so record_strength is not_computed (honest),
  // not a misleading 0.
  const args = ["vite-node", "scripts/compute-outside-scores.ts", "--", `--company=${c.id}`];
  if (skipSet.has("recurrence")) args.push("--no-recurrence");
  execFileSync("npx", args, { encoding: "utf8", stdio: "inherit" });
  return { before, after: q.scoreRows(c.id), outcome: skipSet.has("recurrence") ? "ran:appended(record_strength not_computed)" : "ran:appended" };
}

const RUNNERS: Record<Step, (c: Company, counts: FillCounts) => Promise<{ before: number; after: number; outcome: string }> | { before: number; after: number; outcome: string }> = {
  own_words: runOwnWords,
  recurrence: runRecurrence,
  deltas_public: runDeltasPublic,
  open_questions: runOpenQuestions,
  status_conflict: runStatusConflict,
  score: runScore,
};

// ── dry-run plan (read-only) ─────────────────────────────────────────────────────
function dryPlan(c: Company): void {
  const counts = countsFor(c);
  const detail: Record<Step, string> = {
    own_words: `own_words=${counts.ownWords}`,
    recurrence: `outside_signals=${counts.outsideSignals}`,
    deltas_public: `deltas_public=${q.deltasPublic(c.id)}`,
    open_questions: `questions=${q.questions(c.id)}`,
    status_conflict: `conflicts=${q.statusConflicts(c.id)}`,
    score: `score_rows=${q.scoreRows(c.id)}`,
  };
  console.log(`\n• ${c.name} [${c.id}]  website=${c.website ?? "—"}`);
  for (const s of stepsToRun()) {
    const skip = skipSet.has(s) ? "operator" : skipReason(s, counts);
    console.log(`    ${s.padEnd(16)} → ${skip ? `SKIP ${skip}` : `RUN`} (${detail[s]})`);
  }
}

// ── main ─────────────────────────────────────────────────────────────────────────
async function main() {
  if (!all && !onlyCompany) { console.error("Pass --all or --company=<id>."); process.exit(1); }
  let companies = selectCompanies();
  // HARD guard — refuse CB1 and ANY frozen company outright, even when passed via --company.
  for (const r of companies.filter((c) => refuseReason(c))) console.log(`REFUSED ${r.name} [${r.id}] — frozen reference company; not run, not ledgered.`);
  companies = companies.filter((c) => !refuseReason(c));

  console.log(`first-read-fill · batch ${RUN_BATCH} · ${dryRun ? "DRY RUN" : "LIVE"} · ${companies.length} compan${companies.length === 1 ? "y" : "ies"}`);
  console.log(`steps: ${stepsToRun().join(" → ")}`);

  if (dryRun) { companies.forEach(dryPlan); console.log("\n(dry run — nothing written)"); return; }

  for (const c of companies) {
    console.log(`\n═══ ${c.name} [${c.id}] ═══`);
    for (const step of stepsToRun()) {
      // Re-read step inputs LIVE before each step — own_words changes deltas' inputs within a run, so
      // a per-company snapshot would wrongly skip deltas for a company that just gained own-words.
      const counts = countsFor(c);
      const startedAt = new Date().toISOString();
      // Operator-held step (--skip): ledger skipped:operator, run nothing.
      if (skipSet.has(step)) {
        const m = stepMetric(step, c);
        ledger(c.id, c.name, step, startedAt, new Date().toISOString(), m, m, "skipped:operator");
        console.log(`  ${step.padEnd(16)} ${String(m).padStart(4)} → ${String(m).padStart(4)}  skipped:operator`);
        continue;
      }
      let r: { before: number; after: number; outcome: string };
      try {
        r = await RUNNERS[step](c, counts);
      } catch (e) {
        r = { before: -1, after: -1, outcome: `failed:${(e as Error).message}`.slice(0, 200) };
      }
      const finishedAt = new Date().toISOString();
      ledger(c.id, c.name, step, startedAt, finishedAt, r.before < 0 ? null : r.before, r.after < 0 ? null : r.after, r.outcome);
      console.log(`  ${step.padEnd(16)} ${String(r.before).padStart(4)} → ${String(r.after).padStart(4)}  ${r.outcome}`);
    }
  }

  // Print the batch ledger.
  console.log(`\n── ledger (batch ${RUN_BATCH}) ──`);
  const rows = execFileSync(
    "docker",
    ["exec", "-i", DB_CONTAINER, "psql", "-U", "postgres", "-d", "postgres", "-P", "pager=off", "-c",
      `SELECT company_name, step, rows_before AS before, rows_after AS after, outcome, round(extract(epoch FROM finished_at-started_at))||'s' AS secs
       FROM first_read_fill_runs WHERE run_batch='${RUN_BATCH}' ORDER BY started_at;`],
    { encoding: "utf8" },
  );
  console.log(rows);
}

main().then(() => console.log("done.")).catch((e) => { console.error(e); process.exit(1); });
