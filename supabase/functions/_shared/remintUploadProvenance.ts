// RE-MINT of upload provenance under the authorship rule (mechanism signed 2026-09-13).
//
// For each of a company's uploaded documents that has file proposals, the CURRENT origin (highest-
// version override, else highest-version model verdict — resolveOrigin) is compared with the origin
// the LIVE signals of each proposal carry (raw_payload.upload_origin; pre-a779766 rows carry none and
// were minted as the client's material, so they read as {client, this_company}). Where they differ:
//   1. the live signals are SUPERSEDED — superseded_at / superseded_reason='remint_authorship_v2' /
//      raw_payload.superseded_by_minting_version=2 — never deleted (a terminal supersession: they stop
//      backing claim candidates; the ingest's history guard keeps them through any re-ingest);
//   2. the proposal is re-ingested under the current origin with minting_version=2 (new signals; the
//      company rebuild re-derives claims, states, support counts, triangulation, dependencies);
//   3. every claim whose ENTIRE live backing was superseded — computed before step 1 — is STRUCK through
//      set_claim_status with the remint reason (Gate A: preserved as a recorded decision, stops counting
//      everywhere, reversible); provenance is never edited;
//   4. one provenance_remints ledger row records what was superseded, struck and minted.
// Idempotent: a proposal whose live signals already carry the current origin at minting_version 2 is
// a no-op; a struck claim is not struck twice; a superseded signal is not superseded twice.
// dry_run: computes and reports every step; writes nothing (not even the ledger).
import { ingestDifyProposalSignals } from "./evidencePhase1.ts";
import { loadContributingDocs } from "./uploadCorpus.ts";
import { resolveUploadOrigin, type UploadOrigin } from "./uploadVoiceClassifier.ts";
import { snapshotMojoScore } from "./snapshotMojoScore.ts";
import { loadUploadSidecar } from "./uploadSidecar.ts";

export const REMINT_REASON = "remint_authorship_v2";
export const REMINT_MINTING_VERSION = 2;
export const REMINT_ACTOR = "remint_authorship_v2 (operator brief 2026-09-13)";

type Sb = { from: (t: string) => any; rpc: (fn: string, args: Record<string, unknown>) => any; storage: any };
type Origin = { authorship: UploadOrigin["authorship"]; subject: UploadOrigin["subject"] };

export type RemintProposalPlan = {
  input_file_id: string;
  file_name: string;
  content_sha: string | null;
  proposal_id: string;
  current_origin: Origin;
  origin_source: "override" | "model" | "none";
  live_signals: number;
  live_origin: Origin | null;      // what the live signals carry (null = legacy, minted as client)
  live_minting_version: number | null;
  change: "none" | "remint" | "skipped_unclassified";
  superseded_signal_ids: string[];
  struck_claim_ids: Array<{ id: string; statement: string; provenance: string; state: string }>;
  would_mint: { signals: number; band: string; voice_class: string | null } | null;
};

function liveOriginOf(rp: unknown): { origin: Origin | null; version: number | null } {
  const r = rp && typeof rp === "object" ? (rp as { upload_origin?: unknown; minting_version?: unknown }) : null;
  const o = r?.upload_origin && typeof r.upload_origin === "object" ? (r.upload_origin as Partial<Origin>) : null;
  const origin: Origin | null = o && o.authorship && o.subject ? { authorship: o.authorship, subject: o.subject } : null;
  return { origin, version: typeof r?.minting_version === "number" ? r.minting_version : null };
}
// What the MINTING depends on: authorship for client / us (organization band, subject irrelevant); authorship +
// subject for third_party / uncertain (outside band; subject decides whether a claim may be minted).
const mintingKey = (o: Origin) => (o.authorship === "client" || o.authorship === "us" ? o.authorship : `${o.authorship}/${o.subject}`);
const sameOrigin = (a: Origin | null, b: Origin | null) => !!a && !!b && mintingKey(a) === mintingKey(b);
/** Pre-a779766 signals carried no origin and were minted as the client's own material. */
const LEGACY_ORIGIN: Origin = { authorship: "client", subject: "this_company" };

export async function planRemint(supabase: Sb, companyId: string, opts: { ollamaUrl: string; model?: string; inputFileIds?: string[] | null }): Promise<RemintProposalPlan[]> {
  const docs = await loadContributingDocs(supabase as any, companyId);
  const { data: proposals } = await supabase.from("file_proposals").select("id, file_id, file_name, status, processing_state, source_type").eq("company_id", companyId).eq("processing_state", "ready").neq("status", "rejected");
  const plans: RemintProposalPlan[] = [];
  for (const p of ((proposals ?? []) as Array<{ id: string; file_id: string | null; file_name: string; source_type: string | null }>)) {
    if (!p.file_id) continue;
    if (opts.inputFileIds && opts.inputFileIds.length > 0 && !opts.inputFileIds.includes(p.file_id)) continue;
    if (p.source_type === "intake") continue;
    const doc = docs.find((d) => d.input_file_id === p.file_id) ?? null;
    const resolved = await resolveUploadOrigin(supabase, companyId, p.file_id, { ollamaUrl: opts.ollamaUrl, model: opts.model });
    const currentOrigin: Origin = { authorship: resolved.authorship, subject: resolved.subject };
    const { data: sigs } = await supabase.from("signals").select("id, raw_payload, signal_band, voice_class").eq("company_id", companyId).eq("source_id", p.id).is("superseded_at", null);
    const live = (sigs ?? []) as Array<{ id: string; raw_payload: unknown; signal_band: string; voice_class: string | null }>;
    const first = live[0] ? liveOriginOf(live[0].raw_payload) : { origin: null, version: null };
    const liveOrigin = first.origin ?? (live.length > 0 ? LEGACY_ORIGIN : null);
    // Unchanged when the live signals already carry the current origin's MINTING KEY (a legacy client document
    // whose current authorship is client is left as it is — nothing to correct, no churn).
    // A document with NO current judgment (no sidecar-matched verdict row: archived, duplicate, or never
    // classified) is SKIPPED — the re-mint acts only on judged documents (ruling 11); it never mints uncertain.
    const unclassified = resolved.source === "none";
    const unchanged = live.length === 0 || sameOrigin(liveOrigin, currentOrigin);
    const plan: RemintProposalPlan = {
      input_file_id: p.file_id, file_name: p.file_name, content_sha: doc?.content_sha ?? null, proposal_id: p.id,
      current_origin: currentOrigin, origin_source: resolved.source, live_signals: live.length, live_origin: liveOrigin, live_minting_version: first.version,
      change: unclassified ? "skipped_unclassified" : unchanged ? "none" : "remint", superseded_signal_ids: [], struck_claim_ids: [], would_mint: null,
    };
    if (plan.change === "remint") {
      plan.superseded_signal_ids = live.map((s) => s.id);
      // Claims whose ENTIRE live backing is these signals.
      const { data: refRows } = await supabase.from("claim_signal_refs").select("claim_id, signal_id").eq("company_id", companyId);
      const refs = (refRows ?? []) as Array<{ claim_id: string; signal_id: string }>;
      const superseded = new Set(plan.superseded_signal_ids);
      const { data: supersededAlready } = await supabase.from("signals").select("id").eq("company_id", companyId).not("superseded_at", "is", null);
      const dead = new Set([...superseded, ...((supersededAlready ?? []) as Array<{ id: string }>).map((s) => s.id)]);
      const byClaim = new Map<string, string[]>();
      for (const r of refs) byClaim.set(r.claim_id, [...(byClaim.get(r.claim_id) ?? []), r.signal_id]);
      const candidates = [...byClaim.entries()].filter(([, sids]) => sids.some((s) => superseded.has(s)) && sids.every((s) => dead.has(s))).map(([cid]) => cid);
      if (candidates.length > 0) {
        const { data: claimRows } = await supabase.from("claims").select("id, statement, provenance, state, status").in("id", candidates);
        plan.struck_claim_ids = ((claimRows ?? []) as Array<{ id: string; statement: string; provenance: string; state: string; status: string }>)
          .filter((c) => c.status !== "struck")
          .map((c) => ({ id: c.id, statement: c.statement, provenance: c.provenance, state: c.state }));
      }
      const a = currentOrigin.authorship;
      plan.would_mint = { signals: live.length, band: a === "client" || a === "us" ? "organization" : "outside", voice_class: a === "client" ? null : a === "us" ? "analysis" : currentOrigin.subject === "this_company" ? "outside_voice_about_client" : "market_context" };
    }
    plans.push(plan);
  }
  return plans;
}

export async function applyRemint(supabase: Sb, companyId: string, plans: RemintProposalPlan[], opts: { actor?: string; note?: string }): Promise<Array<{ proposal_id: string; superseded: number; minted: number; struck: number; ledger_id: string | null }>> {
  const out: Array<{ proposal_id: string; superseded: number; minted: number; struck: number; ledger_id: string | null }> = [];
  const nowIso = new Date().toISOString();
  for (const plan of plans) {
    if (plan.change !== "remint") { out.push({ proposal_id: plan.proposal_id, superseded: 0, minted: 0, struck: 0, ledger_id: null }); continue; }
    // 1. supersede the live signals (never delete)
    for (const sid of plan.superseded_signal_ids) {
      const { data: row } = await supabase.from("signals").select("raw_payload").eq("id", sid).maybeSingle();
      const rp = row?.raw_payload && typeof row.raw_payload === "object" ? (row.raw_payload as Record<string, unknown>) : {};
      const { error } = await supabase.from("signals").update({
        superseded_at: nowIso, superseded_reason: REMINT_REASON, updated_at: nowIso,
        raw_payload: { ...rp, superseded_by_minting_version: REMINT_MINTING_VERSION, superseded_by_remint: { at: nowIso, from: plan.live_origin, to: plan.current_origin } },
      }).eq("id", sid).is("superseded_at", null);
      if (error) throw new Error(`supersede signal ${sid}: ${error.message}`);
    }
    // 2. re-ingest under the current origin (new signals at minting_version 2; company rebuild)
    const { data: p } = await supabase.from("file_proposals").select("id, company_id, file_name, source_type, summary, evidence, contradictions, framework_results, questions_to_verify, suggested_areas, confidence, confidence_reason, analysis_version").eq("id", plan.proposal_id).maybeSingle();
    if (!p) throw new Error(`proposal ${plan.proposal_id} not found`);
    // A re-mint re-ingests the proposal's OWN findings under its own methodology version (never re-analysed);
    // the upload excerpt guard applies here too (ruling 5), with the sidecar as basis.
    const sidecar = await loadUploadSidecar(supabase as unknown as { from: (t: string) => any; storage: any }, plan.input_file_id);
    await ingestDifyProposalSignals({
      supabase: supabase as any, companyId, proposalId: plan.proposal_id,
      sourceType: String(p.source_type ?? "uploaded_file"), sourceTitle: String(p.file_name ?? ""),
      summary: p.summary, evidence: p.evidence, contradictions: p.contradictions, frameworkResults: p.framework_results, questionsToVerify: p.questions_to_verify,
      rawPayload: { summary: p.summary, suggested_areas: p.suggested_areas, confidence: p.confidence, confidence_reason: p.confidence_reason, reminted: true },
      origin: plan.current_origin, mintingVersion: REMINT_MINTING_VERSION,
      analysisVersion: Number(p.analysis_version ?? 1) || 1, sourceText: sidecar?.text ?? null, sourceFilePath: sidecar?.filePath ?? null,
    });
    const { data: minted } = await supabase.from("signals").select("id").eq("company_id", companyId).eq("source_id", plan.proposal_id).is("superseded_at", null);
    const mintedIds = ((minted ?? []) as Array<{ id: string }>).map((s) => s.id);
    // 3. strike the claims whose whole backing was superseded
    const reason = `${REMINT_REASON}: minted under the pre-authorship rule (uploaded_file ⇒ internal_declared); document "${plan.file_name}" re-judged ${plan.current_origin.authorship} (${plan.origin_source})`;
    let struck = 0;
    for (const c of plan.struck_claim_ids) {
      const { data: cur } = await supabase.from("claims").select("status").eq("id", c.id).maybeSingle();
      if (!cur || cur.status === "struck") continue;
      const { error } = await supabase.rpc("set_claim_status", { p_claim_id: c.id, p_status: "struck", p_reason: reason, p_actor: opts.actor ?? REMINT_ACTOR });
      if (error) throw new Error(`strike claim ${c.id}: ${error.message}`);
      struck++;
    }
    // 4. ledger
    const { data: ledger, error: ledgerErr } = await supabase.from("provenance_remints").insert({
      company_id: companyId, kind: "remint", input_file_id: plan.input_file_id, content_sha: plan.content_sha, proposal_id: plan.proposal_id,
      from_authorship: plan.live_origin?.authorship ?? null, from_subject: plan.live_origin?.subject ?? null,
      to_authorship: plan.current_origin.authorship, to_subject: plan.current_origin.subject,
      superseded_signal_ids: plan.superseded_signal_ids, struck_claim_ids: plan.struck_claim_ids.map((c) => c.id), minted_signal_ids: mintedIds,
      dry_run: false, actor: opts.actor ?? REMINT_ACTOR, note: opts.note ?? null,
    }).select("id").maybeSingle();
    if (ledgerErr) throw new Error(`ledger: ${ledgerErr.message}`);
    out.push({ proposal_id: plan.proposal_id, superseded: plan.superseded_signal_ids.length, minted: mintedIds.length, struck, ledger_id: ledger?.id ?? null });
  }
  if (out.some((o) => o.superseded > 0 || o.struck > 0)) await snapshotMojoScore(supabase as any, companyId);
  return out;
}
