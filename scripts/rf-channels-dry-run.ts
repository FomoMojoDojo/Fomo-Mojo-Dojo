// ── RF DRY-RUN (operator ruling 2026-09-04) — read-only, prints a table, WRITES NOTHING ────────────────
//
// Runs the inference claims that the First Read "Your channels, as we read them" block would render for ONE
// company through the own-words admission criterion (the SAME typed kind question, ownWordsKinds.ts), and
// prints PASS / FAIL / UNTYPED + the judge's kind and reason per claim. Nothing is written: no claims update,
// no ledger, no audit. There is NO --apply in this brief; apply comes under a separate brief.
//
//   npx vite-node scripts/rf-channels-dry-run.ts -- --company=<id>
//   npx vite-node scripts/rf-channels-dry-run.ts -- --company=<id> --apply --plan=<signed.json>
//
// --apply posts the OPERATOR-SIGNED plan file ({ "plan": [{claim_id, kind, reason}] }) to the rf-channels-apply
// edge door (service role). The judge is NOT called in apply mode — the signed table is the plan. CB1 is refused
// by id before any read (above); the door refuses frozen companies again.
//
// Selection reproduces the hook (useFirstReadPreviewData) EXACTLY, with the same shared pure helpers:
// active public_observed claims → not own_words (by class AND text identity) → not upload-derived →
// own-voice → own-host newest signal → not channel junk. So the table lists exactly the block's rows.
//
// FROZEN: CB1 (58b2b15b) is refused by id BEFORE any read, and companies.frozen is refused after the first
// read. Model: OpenAI (public site content only, the same allowance as the own-words extractor); key from
// supabase/functions/.env.local (OPENAI_API_KEY) — never printed.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { CB1_FROZEN_ID } from "../src/lib/firstReadFill/plan";
import { RF_SYSTEM, planRfAdmission, rfTotals, type RfJudgeVerdict, type RfRow } from "../src/lib/firstReadFill/rfChannelsAdmission";
import {
  PUBLIC_PROVENANCE, channelReadClaimIds, clientVoiceClaimIds, ownHostSignalByClaim, uploadDerivedClaimIds,
} from "../supabase/functions/_shared/firstReadProvenance";
import { normalizeForHash } from "../supabase/functions/_shared/contentIdentity.ts";
import { isChannelJunk } from "../src/views/client/firstReadPreview/channelJunk";
import { bareHost } from "../src/views/client/firstReadPreview/mapping";

const DB_CONTAINER = "supabase_db_dzlgyxcvuwiulgifbmew";
const argv = process.argv.slice(2);
const companyArg = argv.find((a) => a.startsWith("--company="))?.split("=")[1] ?? null;
if (!companyArg) { console.error("usage: npx vite-node scripts/rf-channels-dry-run.ts -- --company=<id>"); process.exit(1); }
const applyMode = argv.includes("--apply");
const planPath = argv.find((a) => a.startsWith("--plan="))?.split("=")[1] ?? null;
if (applyMode && !planPath) { console.error("--apply requires --plan=<signed.json>"); process.exit(1); }

// Frozen by id, BEFORE any read.
if (companyArg === CB1_FROZEN_ID || CB1_FROZEN_ID.startsWith(companyArg)) { console.error("refused: frozen reference company (CB1)."); process.exit(2); }

function psqlJson<T>(sql: string): T {
  const out = execFileSync("docker", ["exec", "-i", DB_CONTAINER, "psql", "-U", "postgres", "-d", "postgres", "-tA", "-c", sql], { encoding: "utf8" }).trim();
  return (out ? JSON.parse(out) : null) as T;
}
const q = (s: string) => s.replace(/'/g, "''");

type Co = { id: string; name: string; website: string | null; frozen: boolean | null };
const co = psqlJson<Co | null>(`select row_to_json(t) from (select id, name, website, frozen from companies where id::text like '${q(companyArg)}%' limit 1) t;`);
if (!co) { console.error("company not found"); process.exit(1); }
if (co.id === CB1_FROZEN_ID || co.frozen) { console.error(`refused: ${co.name} is frozen.`); process.exit(2); }
const companyId = co.id;
const companyHost = bareHost(co.website);

type Claim = { id: string; topic: string | null; statement: string; status: string | null; raw_payload: unknown; provenance: string; claim_type: string | null; statement_kind: string | null; declared_eligible: boolean | null };
const claims = psqlJson<Claim[]>(`select coalesce(json_agg(t), '[]') from (select id, topic, statement, status, raw_payload, provenance, claim_type, statement_kind, declared_eligible from claims where company_id='${companyId}' and provenance='${PUBLIC_PROVENANCE}' and status='active') t;`) ?? [];
type Ref = { claim_id: string; signal_id: string };
const refs = claims.length ? psqlJson<Ref[]>(`select coalesce(json_agg(t), '[]') from (select claim_id, signal_id from claim_signal_refs where claim_id in (select id from claims where company_id='${companyId}' and provenance='${PUBLIC_PROVENANCE}' and status='active')) t;`) ?? [] : [];
type Sig = { id: string; source_url: string | null; source_title: string | null; source_type: string | null; voice_class: string | null; event_date: string | null };
const sigIds = [...new Set(refs.map((r) => r.signal_id))];
const sigs = sigIds.length ? psqlJson<Sig[]>(`select coalesce(json_agg(t), '[]') from (select id, source_url, source_title, source_type, voice_class, event_date from signals where id in (${sigIds.map((s) => `'${s}'`).join(",")})) t;`) ?? [] : [];
const sigById = new Map(sigs.map((s) => [s.id, s]));

// The hook's selection, step for step.
const docExcluded = uploadDerivedClaimIds(refs, new Map(sigs.map((s) => [s.id, s.source_type])), claims);
const ownVoiceIds = clientVoiceClaimIds(refs, sigById, companyHost);
const ownSigByClaim = ownHostSignalByClaim(refs, sigById, companyHost);
const ownWordsNormTexts = new Set(claims.filter((c) => c.claim_type === "own_words").map((c) => normalizeForHash(c.statement)));
const channelReadIds = channelReadClaimIds(claims, ownVoiceIds, docExcluded, ownWordsNormTexts);
const members = claims.filter((c) => channelReadIds.has(c.id));
// RF ADMISSION: FAILED inference claims (declared_eligible=false) are dropped by the SAME predicate the hook
// uses — reported here as channelIneligibleIds (the after-apply proof shows the five FAIL ids here).
const ineligible = claims.filter((c) => c.claim_type !== "own_words" && c.declared_eligible === false && ownVoiceIds.has(c.id));
const offHost = members.filter((c) => !ownSigByClaim.has(c.id));
const onHost = members.filter((c) => ownSigByClaim.has(c.id));
const junk = onHost.filter((c) => isChannelJunk(c.statement, ownSigByClaim.get(c.id)!.source_title ?? null));
const rows: RfRow[] = onHost.filter((c) => !junk.includes(c)).map((c) => ({ id: c.id, statement: c.statement, pageUrl: ownSigByClaim.get(c.id)!.source_url ?? null }));

// Page text (read-only) from the own-words snapshot table when present — parity with retype-own-words.
async function pageText(url: string | null): Promise<string | null> {
  if (!url) return null;
  const r = psqlJson<{ clean_text: string } | null>(`select row_to_json(t) from (select clean_text from own_words_page_snapshots where company_id='${companyId}' and source_url='${q(url)}' order by fetched_at desc limit 1) t;`);
  return r?.clean_text ?? null;
}

// Judge — OpenAI, key from supabase/functions/.env.local (never printed). Same model ladder as ownWordsJudge.
const envText = readFileSync("supabase/functions/.env.local", "utf8");
const env = Object.fromEntries(envText.split("\n").filter((l) => /^[A-Z_]+=/.test(l)).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const apiKey = env.OPENAI_API_KEY;
if (!apiKey) { console.error("OPENAI_API_KEY missing in supabase/functions/.env.local"); process.exit(1); }
const models = [env.OWN_WORDS_MODEL ?? "gpt-4.1-mini", "gpt-4o-mini"];
async function judge(text: string | null, statements: string[]): Promise<RfJudgeVerdict[]> {
  const user = `${text ? `PAGE TEXT:\n${text.slice(0, 12_000)}\n\n` : "PAGE TEXT: (not available)\n\n"}STATEMENTS:\n${statements.map((s) => `- ${s}`).join("\n")}`;
  let lastErr: unknown = null;
  for (const model of models) {
    try {
      const resp = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model, temperature: 0, response_format: { type: "json_object" }, messages: [{ role: "system", content: RF_SYSTEM }, { role: "user", content: user }] }),
      });
      if (!resp.ok) { lastErr = new Error(`${model} ${resp.status}: ${(await resp.text()).slice(0, 200)}`); continue; }
      const data = await resp.json();
      const m = String(data?.choices?.[0]?.message?.content ?? "").match(/\{[\s\S]*\}/);
      if (!m) { lastErr = new Error(`${model} returned no JSON`); continue; }
      const j = JSON.parse(m[0]);
      return (Array.isArray(j.verdicts) ? j.verdicts : []) as RfJudgeVerdict[];
    } catch (e) { lastErr = e; }
  }
  throw lastErr ?? new Error("all models failed");
}

const SUPA_URL = "http://127.0.0.1:54321";
// Local demo service-role key (same as first-read-fill.ts — passes verify_jwt on every edge fn).
const SERVICE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.-3WFNcnncF4UrDHQ-nYO1RWUz_i-yLHWIPXVLQyQW-o";

async function applySignedPlan(): Promise<void> {
  const signed = JSON.parse(readFileSync(planPath!, "utf8")) as { plan: Array<{ claim_id: string; kind: string; reason: string | null }> };
  if (!Array.isArray(signed.plan) || !signed.plan.length) throw new Error("plan file has no plan rows");
  console.log(`RF APPLY · ${co.name} (${companyId}) · plan rows=${signed.plan.length} · door rf-channels-apply · judge NOT called`);
  const resp = await fetch(`${SUPA_URL}/functions/v1/rf-channels-apply`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY },
    body: JSON.stringify({ company_id: companyId, mode: "apply", plan: signed.plan }),
  });
  const text = await resp.text();
  let data: any; try { data = JSON.parse(text); } catch { data = { raw: text.slice(0, 300) }; }
  if (!resp.ok || !data?.ok) { console.error(`apply refused/failed (${resp.status}):`, JSON.stringify(data)); process.exit(3); }
  console.log(`run_id=${data.run_id} · totals=${JSON.stringify(data.totals)}`);
  for (const r of data.rows as Array<Record<string, unknown>>) {
    console.log(`  ${String(r.claim_id).slice(0, 8)}  ${r.changed ? "CHANGED" : r.refused ? `REFUSED:${r.refused}` : "unchanged"}  ${r.from_kind ?? "—"}/${r.from_eligible} → ${r.to_kind ?? "—"}/${r.to_eligible}  ${r.audit_reason}`);
  }
}

(async () => {
  if (applyMode) { await applySignedPlan(); return; }
  console.log(`RF DRY-RUN · ${co.name} (${companyId}) · host ${companyHost ?? "(none)"} · MODE dry_run · writes nothing`);
  console.log(`selection: public_observed active=${claims.length} · own_words=${ownWordsNormTexts.size} · doc-excluded=${docExcluded.size} · channel members=${members.length} · off-host (excluded)=${offHost.length} · junk (hidden)=${junk.length} · ineligible (excluded)=${ineligible.length} · BLOCK ROWS=${rows.length}`);
  console.log(`channelIneligibleIds: ${ineligible.length ? ineligible.map((c) => c.id.slice(0, 8)).join(", ") : "(none)"}`);
  const { plan, judgeCalls } = await planRfAdmission(rows, judge, pageText);
  const pad = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s.padEnd(n));
  console.log("");
  console.log(`${pad("claim", 9)} ${pad("verdict", 8)} ${pad("kind", 12)} ${pad("page", 40)} ${pad("statement", 70)} reason`);
  console.log("-".repeat(200));
  for (const p of plan) {
    const page = p.pageUrl ? p.pageUrl.replace(/^https?:\/\/(www\.)?/, "") : "(no page)";
    console.log(`${pad(p.id.slice(0, 8), 9)} ${pad(p.verdict, 8)} ${pad(p.kind ?? "—", 12)} ${pad(page, 40)} ${pad(p.statement.replace(/\s+/g, " "), 70)} ${p.reason ?? "—"}`);
  }
  const t = rfTotals(plan);
  console.log("-".repeat(200));
  console.log(`totals: rows=${plan.length} · PASS=${t.PASS} · FAIL=${t.FAIL} · UNTYPED=${t.UNTYPED} · judge calls=${judgeCalls} (one per page) · writes=0`);
  const out = process.env.RF_OUT;
  if (out) { writeFileSync(out, JSON.stringify({ company: co, mode: "dry_run", totals: t, plan }, null, 2)); console.log(`plan saved (outside the repo): ${out}`); }
})().catch((e) => { console.error(e); process.exit(1); });
