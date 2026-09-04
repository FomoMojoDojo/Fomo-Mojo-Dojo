// ── R2: First Read outside-basis re-crawl (local dev runner) ──────────────────
//
// Refreshes ONE company's outside evidence BASIS (outside_page_snapshots) by
// re-fetching every known outside URL and recording new moment-in-time snapshots
// for content that CHANGED or RECOVERED. This is an INERT, basis-only gate:
//   • It writes ONLY outside_page_snapshots rows + ONE integrity_runs ledger row.
//   • It NEVER writes signals, never touches held_at/superseded_at, never changes
//     the client render. Signal restore / source_gone reclassification is R3.
//
// Two-pass fetch (feasibility gate R2):
//   1. simple GET via the REAL pipeline (fetchOutsidePage) — status+hash parity
//      with the edge crawl-outside-pages fetch pass.
//   2. headless Playwright fallback for any URL the simple GET could not read —
//      sequential, per-URL timeout. (Edge cannot run headless; hence a local script.)
//
// Content identity is the SINGLE TS helper (normalizeForHash + sha256Hex). One row
// is minted per dependent signal_id, but ONLY on a NEW (company_id, signal_id,
// text_sha256) — the UNIQUE(company_id, signal_id, text_sha256) index makes an
// unchanged re-fetch a no-op. 404 / NXDOMAIN / still-walled results mint NO rows;
// they are recorded honestly in the ledger's excluded_by_rule lists (ruling R2-1:
// gone/walled at ledger level; no basis mutation, no signal write).
//
// DB I/O goes through the local supabase container via `docker exec psql` (the
// audited superuser channel every local data act uses). Row payloads are passed as
// a base64-encoded JSON parameter — NEVER string-interpolated into SQL. The DB
// enforce_company_freeze trigger independently refuses any write to the frozen CB1;
// this script ALSO refuses CB1 (and any frozen company) loudly before any write.
//
//   npx vite-node scripts/first-read-outside-recrawl.ts -- --company=<uuid> --dry-run
//   npx vite-node scripts/first-read-outside-recrawl.ts -- --company=<uuid>
//   npx vite-node scripts/first-read-outside-recrawl.ts -- --company=<uuid> --review --run-id=<uuid>
//   … --review --run-id=<uuid> --baseline-run=<uuid>   (ruling 3: baseline from THAT run's snapshots only)
//   … --review --run-id=<uuid> --url=<exact source_url>  (restrict the review to one dependent URL)
//
// --review (operator ruling 2026-09-04): the RECRAWL-INTO-REVIEW-TABLE run. URL universe = the DEPENDENT
// set only (outside signals held, or superseded held_source_unreachable_recrawl_pending). Each URL is
// fetched (plain, then headless on a wall), an ok body is snapshotted as usual, and ONE outside_recrawl_review
// row per URL records disposition vs the BASELINE (newest snapshot whose run_id is not the sentinel and
// which predates today — never bare newest), anchor presence, and the dependent signal / delta ids.
// operator_decision is left NULL: nothing regenerates until the operator approves (R3 gate). No R3 call.

import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { chromium, type Browser, type BrowserContext } from "playwright";
import { fetchOutsidePage } from "../supabase/functions/_shared/outsidePageStore";
import { extractTextBasic } from "../supabase/functions/_shared/fetchAndExtract";
import { normalizeForHash, sha256Hex } from "../supabase/functions/_shared/contentIdentity";
import { anchorPresent, buildAnchors, selectBaseline, type SnapshotCandidate } from "../supabase/functions/_shared/outsideRecrawlAnchors";

const DB_CONTAINER = "supabase_db_dzlgyxcvuwiulgifbmew";
const CB1_FROZEN_ID = "58b2b15b-bada-4bcd-9c12-b7e66a37d0bc"; // NEVER written
// Browser UA for the headless fallback — matches the design-gate reachability probe
// and _shared/outsidePageStore's BROWSER_UA. Public pages we are allowed to read.
const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const TEXT_CAP = 12_000; // parity with fetchAndExtract's 12k cap
const EMPTY_SHA = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"; // sha256("")

const dryRun = process.argv.includes("--dry-run");
const review = process.argv.includes("--review");
const runIdArg = process.argv.find((a) => a.startsWith("--run-id="))?.split("=")[1] ?? null;
const baselineRunArg = process.argv.find((a) => a.startsWith("--baseline-run="))?.split("=")[1] ?? null;
const urlOnlyArg = process.argv.find((a) => a.startsWith("--url="))?.slice("--url=".length) ?? null;
/** The vacuous-proof plant lives under this run_id; the baseline selection EXCLUDES it by construction. */
const SENTINEL_RUN_ID = "0000feed-0000-4000-8000-000000000001";
const company = process.argv.find((a) => a.startsWith("--company="))?.split("=")[1] ?? null;

function fail(msg: string): never {
  console.error(`\n✗ ${msg}\n`);
  process.exit(1);
}
if (!company) fail("required: --company=<uuid>");
if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(company)) fail("--company must be a uuid");
if (company === CB1_FROZEN_ID) fail("REFUSED: CB1 is the frozen reference fixture — it is never re-crawled or written.");
if (review && (!runIdArg || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(runIdArg))) fail("--review requires --run-id=<uuid>");
if (review && runIdArg === SENTINEL_RUN_ID) fail("REFUSED: the sentinel run_id is reserved for the vacuous-proof plant.");
if (baselineRunArg && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(baselineRunArg)) fail("--baseline-run must be a uuid");

/** Run SQL through the audited docker-exec psql channel. SQL is delivered on STDIN (not argv),
 *  so there is no ARG_MAX ceiling on payload size. `vars` become psql -v NAME=VALUE for tiny
 *  scalars (e.g. the company uuid) only. */
function psql(sql: string, vars: Record<string, string> = {}): string {
  const args = ["exec", "-i", DB_CONTAINER, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-tA"];
  for (const [k, v] of Object.entries(vars)) args.push("-v", `${k}=${v}`);
  return execFileSync("docker", args, { input: sql, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).trim();
}
// Large JSON payloads are inlined into the SQL body (delivered on STDIN) as a single-quoted
// base64 literal. The base64 alphabet is [A-Za-z0-9+/=] — no quote, no backslash — so the literal
// cannot break out of its quotes: injection-safe without CLI-arg length limits.
const b64 = (obj: unknown): string => Buffer.from(JSON.stringify(obj), "utf8").toString("base64");
const b64Sql = (obj: unknown): string => `convert_from(decode('${b64(obj)}','base64'),'utf8')::jsonb`;

// ── frozen refusal (defence in depth; the DB trigger is the real guard) ───────
const frozen = psql("select coalesce(frozen,false) from companies where id=:'c';", { c: company });
if (frozen !== "f" && frozen.toLowerCase() !== "false") {
  if (frozen === "") fail(`no such company ${company}`);
  fail(`REFUSED: company ${company} is frozen — never re-crawled or written.`);
}

// ── URL universe: outside_voice signals with a fetchable URL, grouped by URL ───
type Sig = { id: string; url: string };
const sigs: Sig[] = JSON.parse(
  psql(
    `select coalesce(json_agg(json_build_object('id',id,'url',source_url)),'[]')
       from signals
      where company_id=:'c' and voice_class='outside_voice_about_client'
        and source_url is not null and length(trim(source_url))>0;`,
    { c: company },
  ),
);
const byUrl = new Map<string, string[]>();
for (const s of sigs) {
  if (!byUrl.has(s.url)) byUrl.set(s.url, []);
  byUrl.get(s.url)!.push(s.id);
}
const urls = [...byUrl.keys()].sort();
if (urls.length === 0) fail("no outside_voice_about_client signals with a URL for this company");

// stored newest hash per URL (for changed/unchanged prediction + the dry-run table)
const storedNewest: Record<string, string> = JSON.parse(
  psql(
    `select coalesce(json_object_agg(source_url, text_sha256),'{}')
       from (select distinct on (source_url) source_url, text_sha256
               from outside_page_snapshots where company_id=:'c'
              order by source_url, crawled_at desc) t;`,
    { c: company },
  ),
);

// ── headless fallback (shared browser, launched lazily) ───────────────────────
let browser: Browser | null = null;
let ctx: BrowserContext | null = null;
type HeadlessResult = { status: number; textLen: number; html: string; challenged: boolean; navError: string | null };
async function headless(url: string): Promise<HeadlessResult> {
  if (!browser) {
    browser = await chromium.launch({ headless: true });
    ctx = await browser.newContext({ userAgent: BROWSER_UA, locale: "en-US", viewport: { width: 1280, height: 900 } });
  }
  const page = await ctx!.newPage();
  try {
    const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    const status = resp ? resp.status() : -1;
    await page.waitForTimeout(2_500); // let JS challenges / hydration settle
    const txt = ((await page.evaluate(() => (document.body ? document.body.innerText : ""))) as string) || "";
    const html = await page.content();
    const low = txt.toLowerCase();
    const challenged =
      /just a moment|verify you are human|enable javascript|attention required|access denied|are you a robot|px-captcha|cf-browser-verification/.test(
        low,
      );
    return { status, textLen: txt.trim().length, html, challenged, navError: null };
  } catch (e) {
    return { status: -1, textLen: 0, html: "", challenged: false, navError: String((e as Error).message || e).slice(0, 120) };
  } finally {
    await page.close();
  }
}

// ── per-URL pass ──────────────────────────────────────────────────────────────
type Verdict = "ok-unchanged" | "ok-changed" | "recovered" | "still-walled" | "gone";
type RowDraft = {
  company_id: string;
  source_url: string;
  signal_id: string;
  clean_text: string | null;
  text_sha256: string;
  run_id: string;
  fetch_status: "ok";
  http_status: number;
};
const runId = review ? runIdArg! : randomUUID();
const runRef = `r2_outside_recrawl_${review ? "review_" : ""}${new Date().toISOString()}`;
const report: Array<{ url: string; path: "simple" | "headless"; verdict: Verdict; minted: number }> = [];
const lists = { recovered: [] as string[], changed: [] as string[], gone: [] as string[], still_walled: [] as string[] };

function insertRows(rows: RowDraft[]): number {
  if (dryRun || rows.length === 0) return 0;
  const out = psql(
    `with p as (select ${b64Sql(rows)} as arr),
          rows as (
            select (e->>'company_id')::uuid company_id, e->>'source_url' source_url,
                   (e->>'signal_id')::uuid signal_id, e->>'clean_text' clean_text,
                   e->>'text_sha256' text_sha256, (e->>'run_id')::uuid run_id,
                   (e->>'fetch_status')::outside_fetch_status fetch_status, (e->>'http_status')::int http_status
              from p, jsonb_array_elements(p.arr) e),
          ins as (
            insert into outside_page_snapshots
              (company_id, source_url, signal_id, clean_text, text_sha256, run_id, fetch_status, http_status, crawled_at)
            select company_id, source_url, signal_id, clean_text, text_sha256, run_id, fetch_status, http_status, now()
              from rows on conflict (company_id, signal_id, text_sha256) do nothing returning 1)
     select count(*) from ins;`,
  );
  return parseInt(out, 10) || 0;
}

async function run() {
  for (const url of urls) {
    const signalIds = byUrl.get(url)!;
    const simple = await fetchOutsidePage(url);

    if (simple.fetch_status === "ok") {
      const rows: RowDraft[] = signalIds.map((sid) => ({
        company_id: company!, source_url: url, signal_id: sid, clean_text: simple.clean_text,
        text_sha256: simple.text_sha256, run_id: runId, fetch_status: "ok", http_status: simple.http_status,
      }));
      const minted = insertRows(rows);
      // dry-run: predict changed/unchanged from the stored hash; live: from minted count.
      const changed = dryRun ? simple.text_sha256 !== (storedNewest[url] ?? "") : minted > 0;
      const verdict: Verdict = changed ? "ok-changed" : "ok-unchanged";
      if (verdict === "ok-changed") lists.changed.push(url);
      report.push({ url, path: "simple", verdict, minted });
      continue;
    }

    // simple GET failed → headless fallback
    const hl = await headless(url);
    const dns = hl.navError ? /ERR_NAME_NOT_RESOLVED|ENOTFOUND|getaddrinfo|dns/i.test(hl.navError) : false;
    let verdict: Verdict;
    let minted = 0;
    if (dns || hl.status === 404 || hl.status === 410) {
      verdict = "gone";
      lists.gone.push(url);
    } else if (hl.status >= 200 && hl.status < 400 && hl.textLen > 400 && !hl.challenged) {
      const clean = extractTextBasic(hl.html).slice(0, TEXT_CAP);
      const hash = await sha256Hex(normalizeForHash(clean));
      const alreadyCaptured = (storedNewest[url] ?? EMPTY_SHA) !== EMPTY_SHA;
      if (!clean.trim() || hash === EMPTY_SHA) {
        verdict = "still-walled";
        lists.still_walled.push(url);
      } else if (alreadyCaptured) {
        // The simple GET flaked THIS run, but this URL already has a real stored body.
        // Headless-extracted DOM hashes DIFFERENTLY from the simple-GET raw-HTML pass, so
        // minting here would create a method-variance duplicate for an unchanged page. The
        // headless fallback exists to recover EMPTY basis (genuinely walled URLs), not to
        // re-capture an already-captured URL by a second method. No mint; the canonical
        // simple-GET path re-verifies it on a run where the fetch does not flake.
        verdict = "ok-unchanged";
      } else {
        const rows: RowDraft[] = signalIds.map((sid) => ({
          company_id: company!, source_url: url, signal_id: sid, clean_text: clean,
          text_sha256: hash, run_id: runId, fetch_status: "ok", http_status: hl.status,
        }));
        minted = insertRows(rows);
        verdict = "recovered";
        lists.recovered.push(url);
      }
    } else {
      verdict = "still-walled";
      lists.still_walled.push(url);
    }
    report.push({ url, path: "headless", verdict, minted });
  }
}

// ── REVIEW MODE (operator ruling 2026-09-04) ──────────────────────────────────
type Disposition = "new" | "changed" | "unchanged" | "still_walled" | "gone" | "recovered";
type ReviewRow = {
  url: string; path: "plain" | "headless"; fetch_status: "ok" | "blocked" | "gone"; http_status: number;
  baseline_sha: string | null; baseline_status: string | null; new_sha: string | null;
  disposition: Disposition; anchor_present: boolean | null; signal_ids: string[]; delta_ids: string[]; minted: number; ms: number;
};
const reviewRows: ReviewRow[] = [];
async function runReview() {
  // Dependent URL set: held, or superseded recrawl-pending, outside signals — grouped by URL.
  type Dep = { url: string; signal_ids: string[]; delta_ids: string[]; quotes: string[] };
  const deps: Dep[] = JSON.parse(psql(
    `with dep as (
       select source_url, id, quote from signals
        where company_id=:'c' and signal_band='outside' and source_url is not null and length(trim(source_url))>0
          and (held_at is not null or superseded_reason='held_source_unreachable_recrawl_pending'))
     select coalesce(json_agg(t order by t.url),'[]') from (
       select d.source_url url,
              array_agg(distinct d.id) signal_ids,
              coalesce((select array_agg(distinct x.id) from claim_deltas x join claim_signal_refs r on r.claim_id=x.public_claim_id where x.company_id=:'c' and r.signal_id = any(array_agg(d.id))), '{}') delta_ids,
              coalesce(array_agg(distinct d.quote) filter (where d.quote is not null and length(trim(d.quote))>0), '{}') quotes
         from dep d group by d.source_url) t;`,
    { c: company! },
  ));
  if (deps.length === 0) fail("review: no dependent URLs (nothing held / recrawl-pending) for this company");
  const depsUsed = urlOnlyArg ? deps.filter((d) => d.url === urlOnlyArg) : deps;
  if (depsUsed.length === 0) fail(`review: --url does not name a dependent URL: ${urlOnlyArg}`);
  // Baseline per URL (ruling 3): candidates are every snapshot for the URL; the pure selector applies the law
  // (--baseline-run → that run only; absent → newest non-sentinel predating today — NEVER bare newest).
  const candByUrl: Record<string, SnapshotCandidate[]> = JSON.parse(psql(
    `select coalesce(json_object_agg(source_url, rows),'{}') from (
       select source_url, json_agg(json_build_object('sha', text_sha256, 'status', fetch_status, 'run_id', run_id, 'crawled_at', crawled_at)) rows
         from outside_page_snapshots where company_id=:'c' group by source_url) t;`,
    { c: company! },
  ));
  const today = new Date().toISOString().slice(0, 10);
  const baselineFor = (url: string) => selectBaseline(candByUrl[url] ?? [], { sentinel: SENTINEL_RUN_ID, today, baselineRun: baselineRunArg });
  // Anchors (ruling 2): entity_anchors_json + website host label + name with the fixture suffix stripped.
  const coRow = JSON.parse(psql("select coalesce(row_to_json(t)::text,'null') from (select name, website, entity_anchors_json from companies where id=:'c') t;", { c: company! })) as { name: string | null; website: string | null; entity_anchors_json: unknown[] | null } | null;
  const anchors = buildAnchors({ name: coRow?.name ?? null, website: coRow?.website ?? null, entityAnchors: coRow?.entity_anchors_json ?? [] });
  console.log(`  anchors: ${anchors.join(" | ")}${baselineRunArg ? `\n  baseline-run: ${baselineRunArg}` : ""}`);
  for (const d of depsUsed) {
    const t0 = Date.now();
    const base = baselineFor(d.url);
    let path: "plain" | "headless" = "plain";
    let fetch_status: "ok" | "blocked" | "gone";
    let http_status: number;
    let clean: string | null = null;
    let sha: string | null = null;
    const simple = await fetchOutsidePage(d.url);
    if (simple.fetch_status === "ok") {
      fetch_status = "ok"; http_status = simple.http_status; clean = simple.clean_text; sha = simple.text_sha256;
    } else {
      path = "headless";
      const hl = await headless(d.url);
      const dns = hl.navError ? /ERR_NAME_NOT_RESOLVED|ENOTFOUND|getaddrinfo|dns/i.test(hl.navError) : false;
      if (dns || hl.status === 404 || hl.status === 410 || simple.fetch_status === "gone") { fetch_status = "gone"; http_status = hl.status > 0 ? hl.status : simple.http_status; }
      else if (hl.status >= 200 && hl.status < 400 && hl.textLen > 400 && !hl.challenged) {
        const txt = extractTextBasic(hl.html).slice(0, TEXT_CAP);
        const h = await sha256Hex(normalizeForHash(txt));
        if (!txt.trim() || h === EMPTY_SHA) { fetch_status = "blocked"; http_status = hl.status; }
        else { fetch_status = "ok"; http_status = hl.status; clean = txt; sha = h; }
      } else { fetch_status = "blocked"; http_status = hl.status > 0 ? hl.status : simple.http_status; }
    }
    // Disposition vs baseline. Headless bodies hash by a different method than plain bodies, so a headless ok
    // against an ok baseline is compared by ANCHOR only and reported 'unchanged' (no mint) — the runner's law.
    let disposition: Disposition;
    let anchor_present: boolean | null = null;
    let minted = 0;
    if (fetch_status === "ok") {
      anchor_present = anchorPresent(clean ?? "", anchors, d.quotes);
      if (!base) disposition = "new";
      else if (base.status !== "ok") disposition = "recovered";
      else if (path === "headless") disposition = "unchanged";
      else disposition = sha === base.sha ? "unchanged" : "changed";
      if (!(path === "headless" && base && base.status === "ok")) {
        minted = insertRows(d.signal_ids.map((sid) => ({
          company_id: company!, source_url: d.url, signal_id: sid, clean_text: clean, text_sha256: sha!, run_id: runId, fetch_status: "ok", http_status,
        })));
      }
    } else disposition = fetch_status === "gone" ? "gone" : "still_walled";
    const row: ReviewRow = { url: d.url, path, fetch_status, http_status, baseline_sha: base?.sha ?? null, baseline_status: base?.status ?? null, new_sha: sha, disposition, anchor_present, signal_ids: d.signal_ids, delta_ids: d.delta_ids, minted, ms: Date.now() - t0 };
    reviewRows.push(row);
    if (!dryRun) {
      psql(`with p as (select ${b64Sql({
        company_id: company, run_id: runId, source_url: d.url, baseline_sha256: row.baseline_sha, baseline_status: row.baseline_status, new_sha256: row.new_sha,
        fetch_status, http_status, fetch_path: path, disposition, dependent_signal_ids: d.signal_ids, dependent_delta_ids: d.delta_ids, anchor_present,
      })} j)
        insert into outside_recrawl_review (company_id, run_id, source_url, baseline_sha256, baseline_status, new_sha256, fetch_status, http_status, fetch_path, disposition, dependent_signal_ids, dependent_delta_ids, anchor_present)
        select (j->>'company_id')::uuid, (j->>'run_id')::uuid, j->>'source_url', j->>'baseline_sha256', j->>'baseline_status', j->>'new_sha256',
               (j->>'fetch_status')::outside_fetch_status, (j->>'http_status')::int, j->>'fetch_path', j->>'disposition',
               array(select jsonb_array_elements_text(j->'dependent_signal_ids'))::uuid[], array(select jsonb_array_elements_text(j->'dependent_delta_ids'))::uuid[],
               (j->>'anchor_present')::boolean
          from p;`);
    }
    console.log(`  ${disposition.padEnd(13)} ${path.padEnd(8)} ${String(http_status).padEnd(4)} anchor=${String(anchor_present).padEnd(5)} ${(Date.now() - t0) + "ms"}  ${d.url.replace(/^https?:\/\//, "")}`);
  }
}

// integrity_runs.status vocabulary is CHECK-constrained: completed | failed | skipped_empty_input | planned.
let status = "completed";
let error: string | null = null;
try {
  if (review) await runReview(); else await run();
} catch (e) {
  status = "failed";
  error = String((e as Error).message || e).slice(0, 300);
} finally {
  if (browser) await browser.close();
}

// ── REVIEW ledger + report ─────────────────────────────────────────────────────
if (review) {
  const byDisp: Record<string, string[]> = {};
  for (const r of reviewRows) (byDisp[r.disposition] ??= []).push(r.url);
  const rvExamined = reviewRows.length;
  const rvMinted = reviewRows.reduce((n, r) => n + r.minted, 0);
  const rvMs = reviewRows.reduce((n, r) => n + r.ms, 0);
  let rvLedger = "(dry-run: not written)";
  if (!dryRun) {
    rvLedger = psql(
      `with p as (select ${b64Sql({
        company_id: company, component: "r2_outside_recrawl", surface_type: "outside_review",
        status, examined: rvExamined, admitted: rvMinted,
        excluded_by_rule: { mode: "review", run_id: runId, dispositions: byDisp, error, wall_ms: rvMs }, run_ref: runRef,
      })} j),
       ins as (
         insert into integrity_runs (company_id, component, surface_type, ran_at, status, examined, admitted, excluded_by_rule, run_ref)
         select (j->>'company_id')::uuid, j->>'component', j->>'surface_type', now(),
                j->>'status', (j->>'examined')::int, (j->>'admitted')::int, j->'excluded_by_rule', j->>'run_ref'
           from p returning id)
       select id from ins;`,
    );
  }
  console.log(`\nREVIEW run · company ${company} · run_id=${runId} · urls=${rvExamined} · snapshot rows minted=${rvMinted} · wall=${(rvMs / 1000).toFixed(1)}s · status=${status}`);
  for (const [k, v] of Object.entries(byDisp)) console.log(`  ${k.padEnd(13)} ${v.length}`);
  console.log(`ledger integrity_runs.id = ${rvLedger}`);
  if (error) console.log(`ERROR: ${error}`);
  process.exit(status === "completed" ? 0 : 1);
}

// ── ledger row (written AFTER the pass; failure-settable) ─────────────────────
const examined = urls.length;
const admitted = report.reduce((n, r) => n + r.minted, 0);
let ledgerId = "(dry-run: not written)";
if (!dryRun) {
  // Wrap the INSERT in a data-modifying CTE and SELECT the id, so psql (-tA) returns ONLY the
  // id tuple — not the trailing "INSERT 0 1" command tag.
  ledgerId = psql(
    `with p as (select ${b64Sql({
      company_id: company, component: "r2_outside_recrawl", surface_type: "outside_basis",
      status, examined, admitted, excluded_by_rule: { ...lists, error }, run_ref: runRef,
    })} j),
     ins as (
       insert into integrity_runs (company_id, component, surface_type, ran_at, status, examined, admitted, excluded_by_rule, run_ref)
       select (j->>'company_id')::uuid, j->>'component', j->>'surface_type', now(),
              j->>'status', (j->>'examined')::int, (j->>'admitted')::int, j->'excluded_by_rule', j->>'run_ref'
         from p returning id)
     select id from ins;`,
  );
}

// ── report ────────────────────────────────────────────────────────────────────
const pad = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s.padEnd(n));
console.log(`\nR2 outside-basis re-crawl${dryRun ? " (DRY-RUN — no writes)" : ""} · company ${company}`);
console.log(`run_id=${runId}  run_ref=${runRef}\n`);
console.log(`${pad("URL", 56)}  ${pad("path", 8)}  ${pad("verdict", 13)}  minted`);
console.log("-".repeat(90));
for (const r of report) {
  console.log(`${pad(r.url.replace(/^https?:\/\//, ""), 56)}  ${pad(r.path, 8)}  ${pad(r.verdict, 13)}  ${r.minted}`);
}
console.log("-".repeat(90));
console.log(`examined=${examined}  admitted(rows minted)=${admitted}  status=${status}`);
console.log(`  recovered:    ${lists.recovered.length}  ${lists.recovered.map((u) => u.replace(/^https?:\/\//, "")).join(", ")}`);
console.log(`  changed:      ${lists.changed.length}  ${lists.changed.map((u) => u.replace(/^https?:\/\//, "")).join(", ")}`);
console.log(`  gone:         ${lists.gone.length}  ${lists.gone.map((u) => u.replace(/^https?:\/\//, "")).join(", ")}`);
console.log(`  still_walled: ${lists.still_walled.length}  ${lists.still_walled.map((u) => u.replace(/^https?:\/\//, "")).join(", ")}`);
console.log(`ledger integrity_runs.id = ${ledgerId}`);
if (error) console.log(`ERROR: ${error}`);
process.exit(status === "completed" ? 0 : 1);
