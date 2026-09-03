// RB-2 REPAIR — restore a company's own-words claim_signal_refs that the unscoped rebuild delete
// (RB-1, fixed by migration 20260903160000) wiped. Reusable, parameterized (promoted from the Geniant
// one-off after the Geniant proof, 2026-09-03).
//
// Each own_words claim was born from ONE own_words_candidate (extract-own-words write phase: first
// survivor per content identity, ref = that candidate's signal_id). This re-derives that link:
//   claim.statement ──contentIdentity()──▶ identity  ==  own_words_candidates.content_identity
// The identity is recomputed through the SINGLE TS authority (contentIdentity.ts: normalizeForHash +
// sha256Hex) — never a SQL reimplementation — and cross-checked against the identity the claim was
// born with (raw_payload.content_identity). A mismatch is reported and skipped, never guessed.
// Candidate choice when several share the identity: same page_url as the claim first, else the
// earliest — the order the extractor used.
//
// Inserts a ref ONLY where the claim currently has none. All writes carry the target company_id, so
// nothing outside it can be touched by construction. Frozen company → refused before any write.
// Audit: one long_runner_runs row (run_kind='own_words_ref_restore', chain_state = the plan).
//
// Usage (exactly one of --dry-run / --apply is required — an ambiguous invocation is refused):
//   SUPABASE_URL=http://127.0.0.1:54321 SRK=<service role> \
//     deno run --allow-net --allow-env scripts/restore-own-words-refs.ts --company <company_id> --dry-run
//     deno run --allow-net --allow-env scripts/restore-own-words-refs.ts --company <company_id> --apply

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { contentIdentity } from "../supabase/functions/_shared/contentIdentity.ts";
import { FROZEN_COMPANY_IDS } from "../supabase/functions/_shared/frozenCompanies.ts";

const url = Deno.env.get("SUPABASE_URL");
const key = Deno.env.get("SRK") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
if (!url || !key) throw new Error("SUPABASE_URL and SRK required");
const argv = Deno.args;
const companyFlag = argv.indexOf("--company");
const companyId = companyFlag >= 0 ? argv[companyFlag + 1] : undefined;
const dryRun = argv.includes("--dry-run");
const apply = argv.includes("--apply");
if (!companyId || !/^[0-9a-f-]{36}$/i.test(companyId)) throw new Error("usage: --company <company_id> (--dry-run | --apply)");
if (dryRun === apply) throw new Error("exactly one of --dry-run / --apply is required");
// deno-lint-ignore no-explicit-any
const supabase = createClient(url, key) as any;

const { data: co, error: coErr } = await supabase.from("companies").select("id, name, frozen").eq("id", companyId).maybeSingle();
if (coErr || !co) throw new Error(`company not found: ${companyId} ${coErr?.message ?? ""}`);
if (co.frozen || FROZEN_COMPANY_IDS.has(co.id)) throw new Error(`refused: ${co.name} is frozen`);

const { data: claims, error: cErr } = await supabase.from("claims")
  .select("id, statement, raw_payload, created_at").eq("company_id", companyId).eq("claim_type", "own_words").order("created_at");
if (cErr) throw new Error(cErr.message);
const { data: cands, error: kErr } = await supabase.from("own_words_candidates")
  .select("id, signal_id, content_identity, source_url, created_at").eq("company_id", companyId).order("created_at");
if (kErr) throw new Error(kErr.message);
const { data: refs, error: rErr } = await supabase.from("claim_signal_refs").select("claim_id, signal_id").eq("company_id", companyId);
if (rErr) throw new Error(rErr.message);
const { data: sigs, error: sErr } = await supabase.from("signals").select("id").eq("company_id", companyId);
if (sErr) throw new Error(sErr.message);

const hasRef = new Set((refs ?? []).map((r: { claim_id: string }) => r.claim_id));
const sigIds = new Set((sigs ?? []).map((s: { id: string }) => s.id));
const candsByIdentity = new Map<string, Array<{ id: string; signal_id: string | null; source_url: string; created_at: string }>>();
for (const k of cands ?? []) {
  if (!k.signal_id) continue;
  const list = candsByIdentity.get(k.content_identity) ?? [];
  list.push(k);
  candsByIdentity.set(k.content_identity, list);
}

type PlanRow = { claim_id: string; signal_id: string; candidate_id: string; identity: string; statement: string };
const plan: PlanRow[] = [];
const skipped: Array<{ claim_id: string; reason: string; statement: string }> = [];
let alreadyLinked = 0;
for (const c of claims ?? []) {
  if (hasRef.has(c.id)) { alreadyLinked++; continue; }
  const identity = await contentIdentity(String(c.statement ?? ""));
  const born = String(c.raw_payload?.content_identity ?? "");
  if (born && born !== identity) { skipped.push({ claim_id: c.id, reason: `identity mismatch: born=${born.slice(0, 12)} recomputed=${identity.slice(0, 12)}`, statement: c.statement }); continue; }
  const matches = candsByIdentity.get(identity) ?? [];
  if (matches.length === 0) { skipped.push({ claim_id: c.id, reason: "no candidate with this identity carries a signal_id", statement: c.statement }); continue; }
  const pageUrl = String(c.raw_payload?.page_url ?? "");
  const pick = matches.find((m) => m.source_url === pageUrl) ?? matches[0];
  if (!sigIds.has(pick.signal_id!)) { skipped.push({ claim_id: c.id, reason: `candidate signal ${pick.signal_id} is not this company's`, statement: c.statement }); continue; }
  plan.push({ claim_id: c.id, signal_id: pick.signal_id!, candidate_id: pick.id, identity, statement: c.statement });
}

console.log(`company=${co.name} own_words_claims=${(claims ?? []).length} already_linked=${alreadyLinked} to_insert=${plan.length} skipped=${skipped.length} mode=${apply ? "APPLY" : "DRY-RUN"}`);
for (const p of plan) console.log(`  + ${p.claim_id.slice(0, 8)} ← ${p.signal_id.slice(0, 8)} (${p.identity.slice(0, 12)}) ${p.statement.slice(0, 70)}`);
for (const s of skipped) console.log(`  ! ${s.claim_id.slice(0, 8)} ${s.reason} — ${s.statement.slice(0, 60)}`);

if (!apply) { console.log(`dry-run: nothing written (missing refs=${plan.length})`); Deno.exit(0); }

const runRef = `own_words_ref_restore_${new Date().toISOString().slice(0, 10)}`;
const { data: ledger, error: lErr } = await supabase.from("long_runner_runs").insert({
  run_kind: "own_words_ref_restore", company_id: companyId, status: "running", target_count: plan.length, done_count: 0, request_id: runRef,
  chain_state: { plan: plan.map((p) => ({ claim_id: p.claim_id, signal_id: p.signal_id, candidate_id: p.candidate_id })), skipped },
}).select("id").single();
if (lErr || !ledger) throw new Error(`ledger insert failed: ${lErr?.message}`);

let inserted = 0;
try {
  for (const p of plan) {
    const { error } = await supabase.from("claim_signal_refs").insert({ company_id: companyId, claim_id: p.claim_id, signal_id: p.signal_id, relationship: "supports" });
    if (error) throw new Error(`ref insert failed for ${p.claim_id}: ${error.message}`);
    inserted++;
  }
  await supabase.from("long_runner_runs").update({ status: "completed", done_count: inserted, finished_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", ledger.id);
} catch (e) {
  await supabase.from("long_runner_runs").update({ status: "failed", done_count: inserted, error_text: String((e as Error).message), finished_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", ledger.id);
  throw e;
}
console.log(`APPLIED: refs inserted=${inserted} ledger=${ledger.id} run_ref=${runRef}`);
