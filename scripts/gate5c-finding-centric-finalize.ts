// ── Gate 5c — finding-centric coherent-clustering finalize (local long-runner) ──
//
// Recomputes finding_recurrence for ONE company under the Gate-5c rule
// (_shared/findingCentricMembership.deriveFindingCentricRow): tight entity anchor +
// IDF body-coherence(≥6) + host-text dedup + judge-anchor via BANKED
// finding_cluster_verdicts. NO model calls, NO union-find. Runs IN-PROCESS (Deno) so
// it is free of the 150s edge-gateway ceiling that forced B's finalize into 7
// retries; the edge finalize remains for small runs.
//
//   • per-company — one company_id per invocation; never a fan-out.
//   • frozen-refusal — explicit CB1 guard + the DB freeze trigger.
//   • ledger-last — long_runner_runs written after the reconcile settles.
//   • reconcile-in-place — diff against existing rows; unchanged rows keep computed_at
//     (a no-change rerun is byte-identical), changed upsert, gone delete. No writes on a dry run.
//
// Run:  SUPABASE_URL=http://127.0.0.1:54321 SRK=<service_role_key> \
//         deno run --allow-net --allow-env scripts/gate5c-finding-centric-finalize.ts <company_id> [write]
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  companyEntityAnchor,
  deriveFindingCentricRow,
  idfWeights,
  type FCMember,
  type FindingCentricRow,
} from "../supabase/functions/_shared/findingCentricMembership.ts";

const CB1 = "58b2b15b-bada-4bcd-9c12-b7e66a37d0bc";
const RUN_KIND = "finding_recurrence_5c_finalize";
const TWO_PART_TLDS = new Set(["co.uk", "com.au", "co.nz", "co.jp", "com.br", "co.in", "org.uk", "ac.uk"]);
function registrableDomain(url: string | null | undefined): string | null {
  if (!url) return null;
  let host: string;
  try { host = new URL(url.includes("://") ? url : `https://${url}`).hostname.toLowerCase(); } catch { return null; }
  const parts = host.split(".");
  if (parts.length <= 2) return host;
  const last2 = parts.slice(-2).join(".");
  if (TWO_PART_TLDS.has(last2)) return parts.slice(-3).join(".");
  return last2;
}

const url = Deno.env.get("SUPABASE_URL");
const key = Deno.env.get("SRK") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
if (!url || !key) throw new Error("SUPABASE_URL and SRK (service role key) are required.");
const companyId = Deno.args[0];
if (!companyId) throw new Error("usage: <company_id> [write]");
if (companyId === CB1) { console.error("REFUSED: CB1 is frozen — never recomputed."); Deno.exit(2); }
const doWrite = Deno.args[1] === "write";
const sb = createClient(url, key) as any;

// 1. company + own domain
const { data: co } = await sb.from("companies").select("name, website, frozen").eq("id", companyId).maybeSingle();
if ((co as any)?.frozen === true) { console.error("REFUSED: company is frozen."); Deno.exit(2); }
const ownDomain = registrableDomain((co as any)?.website ?? null);
const anchor = companyEntityAnchor((co as any)?.name ?? "", ownDomain);

// 2. eligible signals (mirror loadEligibleSignals: outside band, not superseded/held, third-party, non-own-domain)
const { data: sig } = await sb.from("signals")
  .select("id, claim_text, source_url, syndicated_from_client")
  .eq("company_id", companyId).eq("signal_band", "outside").is("superseded_at", null).is("held_at", null);
const eligible: FCMember[] = [];
for (const r of (sig as any[])) {
  if (r.syndicated_from_client === true) continue;
  const domain = registrableDomain(r.source_url);
  if (!domain || (ownDomain && domain === ownDomain)) continue;
  if (!String(r.claim_text ?? "").trim()) continue;
  eligible.push({ id: r.id, claim_text: r.claim_text, domain });
}
const idf = idfWeights(eligible.map((s) => s.claim_text));

// 3. judge-anchor: accepted finding_cluster_verdicts per finding
const { data: fcv } = await sb.from("finding_cluster_verdicts")
  .select("finding_id, verdict").eq("company_id", companyId).eq("verdict", "accepted");
const fcvCount = new Map<string, number>();
for (const v of (fcv as any[])) fcvCount.set(v.finding_id, (fcvCount.get(v.finding_id) ?? 0) + 1);

// 4. open findings
const { data: fnd } = await sb.from("findings").select("id, body").eq("company_id", companyId).eq("status", "open");
const findings = ((fnd as any[]) ?? []).slice().sort((a, b) => String(a.id).localeCompare(String(b.id)));

// 5. derive desired rows
const desired = new Map<string, FindingCentricRow>();
for (const f of findings) {
  const row = deriveFindingCentricRow(
    f.id, String(f.body ?? ""), eligible, idf, anchor,
    (fcvCount.get(f.id) ?? 0) >= 1, fcvCount.get(f.id) ?? 0,
  );
  if (row) desired.set(f.id, row);
}

// 6. reconcile-in-place (diff)
const { data: existRows } = await sb.from("finding_recurrence")
  .select("finding_id, cluster_signal_ids, distinct_host_count, host_list, verdict_count").eq("company_id", companyId);
const canon = (r: { cluster_signal_ids: string[]; distinct_host_count: number; host_list: string[]; verdict_count: number }) =>
  JSON.stringify([r.cluster_signal_ids, r.distinct_host_count, r.host_list, r.verdict_count]);
const existing = new Map<string, any>(((existRows as any[]) ?? []).map((r) => [r.finding_id, r]));
let written = 0, deleted = 0, unchanged = 0;
const nowIso = new Date().toISOString();

if (doWrite) {
  for (const fid of existing.keys()) if (!desired.has(fid)) {
    const { error } = await sb.from("finding_recurrence").delete().eq("company_id", companyId).eq("finding_id", fid);
    if (error) throw new Error(`delete ${fid} failed: ${error.message}`);
    deleted++;
  }
  for (const [fid, row] of desired) {
    const ex = existing.get(fid);
    if (ex && canon(ex) === canon(row)) { unchanged++; continue; }
    // PK is finding_id alone → conflict target is finding_id.
    const { error } = await sb.from("finding_recurrence").upsert({
      finding_id: fid, company_id: companyId,
      cluster_signal_ids: row.cluster_signal_ids, distinct_host_count: row.distinct_host_count,
      host_list: row.host_list, verdict_count: row.verdict_count, computed_at: nowIso,
    }, { onConflict: "finding_id" });
    if (error) throw new Error(`upsert ${fid} failed: ${error.message}`);
    written++;
  }
  try {
    await sb.from("long_runner_runs").insert({
      run_kind: RUN_KIND, company_id: companyId, status: "completed",
      target_count: desired.size, done_count: desired.size, finished_at: new Date().toISOString(),
    });
  } catch (e) { console.error("[gate5c] ledger error (non-fatal)", String((e as Error)?.message ?? e)); }
} else {
  for (const [fid, row] of desired) { const ex = existing.get(fid); if (ex && canon(ex) === canon(row)) unchanged++; else written++; }
  for (const fid of existing.keys()) if (!desired.has(fid)) deleted++;
}

const sizes = [...desired.values()].map((r) => r.cluster_signal_ids.length).sort((a, b) => b - a);
console.log(JSON.stringify({
  company_id: companyId, dry_run: !doWrite, eligible: eligible.length,
  judge_anchored_findings: [...fcvCount.keys()].length, desired_rows: desired.size,
  sizes, written, deleted, unchanged,
  entity_anchor: { phrase: anchor.phrase, concat: anchor.concat },
}));
