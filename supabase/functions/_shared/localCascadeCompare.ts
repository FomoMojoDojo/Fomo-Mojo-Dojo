// LOCAL LANE Phase 3a — cascade COMPARE (declared_direction vs public market_read).
//
// COMPARE-not-generate: the internal declared_direction cascade already exists (the
// Phase-2 declared arc, local-strategy-synthesis); the public market_read cascade
// from refresh-cascade. This compares them per-dimension and surfaces divergence as
// cascade drift — the public-vs-internal delta IS the signal. ENTIRELY LOCAL: the
// internal cascade never leaves the machine (imports NO OpenAI client; zero-OpenAI
// structural). Built on the reconcile-market-definition template: deterministic-first
// per dimension, then the shared localVerdictJudge band, comparison-identity caching
// (verdict-by-content-identity, never re-roll), ONE surface_drift_assessments row
// (surface_type='cascade'), the baseline posture (first reconcile = baseline recorded
// quietly; later changed+divergent ⇒ alert; baseline never overwritten), one
// integrity row per eval INCLUDING the quiet/aligned case, and fail-closed self-record.

import { recordIntegrityRun } from "./integrity.ts";
import { normalizeForHash, sha256Hex } from "./contentIdentity.ts";
import { runVerdictJudge } from "./localVerdictJudge.ts";
import { gateCascadeSubjectForLocal } from "./driftExternalGate.ts";
import { FROZEN_COMPANY_IDS } from "./stepConditionsSynthesis.ts";

type SupabaseLike = { from: (t: string) => any };

export const CASCADE_VERDICTS = ["aligned", "diverged", "unknown"] as const;
export type CascadeVerdict = (typeof CASCADE_VERDICTS)[number];

const CASCADE_COMPARE_SYSTEM =
  "You compare a company's INTERNAL declared strategic direction against its PUBLIC " +
  "market read on ONE cascade dimension (e.g. Where-to-Play, How-to-Win). You are given " +
  "the INTERNAL text and the PUBLIC text for that dimension.\n\n" +
  "Decide whether they DIVERGE — name a real, material difference in meaning, not wording.\n" +
  "- \"aligned\": the internal direction and public read say the same thing on this dimension.\n" +
  "- \"diverged\": they materially differ (e.g. a different customer/market, a different " +
  "winning mechanism, a different capability emphasis).\n" +
  "- \"unknown\": one side is empty/too vague to compare, or the difference is genuinely " +
  "ambiguous. Use this honestly — NEVER force a verdict the texts cannot support.\n\n" +
  "Answer with JSON ONLY: {\"classification\":\"aligned\"|\"diverged\"|\"unknown\",\"reason\":\"...\"}. " +
  "The reason MUST be 1-2 sentences and MUST name the dimension and the specific difference (or " +
  "confirm the match).";

// The five compared cascade dimensions (column → label).
const DIMENSIONS: Array<{ key: string; label: string }> = [
  { key: "winning_aspiration", label: "Winning Aspiration" },
  { key: "where_to_play", label: "Where-to-Play" },
  { key: "how_to_win", label: "How-to-Win" },
  { key: "capabilities_json", label: "Capabilities" },
  { key: "management_systems_json", label: "Management systems" },
];

function dimText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  try { return JSON.stringify(value); } catch { return String(value); }
}

type CascadeRow = Record<string, unknown> & { id: string; artifact_role?: string | null; provenance_type?: string | null };

type DimFinding = {
  dimension: string;
  verdict: CascadeVerdict;
  method: "deterministic" | "local_llm" | "stored";
  identity: string | null;
  internal_cited: string;
  external_cited: string;
  detail: string;
};

async function comparisonIdentity(dimension: string, internalText: string, externalText: string): Promise<string> {
  return (await sha256Hex(`${dimension}::${normalizeForHash(internalText)}::${normalizeForHash(externalText)}`)).slice(0, 32);
}

export type CascadeReconcileResult =
  | { status: "no_internal_cascade" | "no_public_cascade" | "skipped_frozen" | "external_lane"; company_id: string }
  | {
      status: "ok" | "dry_run";
      company_id: string;
      surface_id: string;
      baseline: boolean;
      drift_state: string;
      computed_state: string;
      dimensions: Array<{ dimension: string; verdict: CascadeVerdict; method: string }>;
    };

// Compare the declared_direction cascade against the market_read cascade LOCALLY.
// Records exactly one cascade_reconcile integrity row (completed, or failed on crash)
// and writes one surface_drift_assessments row. Frozen companies are skipped BEFORE
// any write. Never throws into the caller path it can't record; fail-closed.
export async function reconcileCascadeLocal(args: {
  supabase: SupabaseLike;
  companyId: string;
  ollamaUrl: string;
  judgeModel?: string;
  dryRun?: boolean;
}): Promise<CascadeReconcileResult> {
  const { supabase, companyId } = args;
  try {
    // ── SUBJECT: the internal declared_direction cascade (latest) ──
    const { data: subjectRows } = await supabase
      .from("strategy_cascades")
      .select("id, artifact_role, provenance_type, winning_aspiration, where_to_play, how_to_win, capabilities_json, management_systems_json, updated_at")
      .eq("company_id", companyId)
      .eq("artifact_role", "declared_direction")
      .order("updated_at", { ascending: false })
      .limit(1);
    const subject = ((subjectRows ?? []) as CascadeRow[])[0];
    if (!subject) return { status: "no_internal_cascade", company_id: companyId };

    // Partition: the subject must belong to the LOCAL lane (declared_direction always
    // is). gateCascadeSubjectForLocal records a decline if it's an external cascade.
    const lane = await gateCascadeSubjectForLocal({
      supabase, companyId, surfaceId: String(subject.id),
      artifactRole: subject.artifact_role, provenance: subject.provenance_type,
      consumer: "reconcile-cascade",
    });
    if (!lane.admissible) return { status: "external_lane", company_id: companyId };

    // Frozen reference fixtures (CB1/CB2) are SELECT-only — skip BEFORE any write.
    if (FROZEN_COMPANY_IDS.has(String(companyId))) return { status: "skipped_frozen", company_id: companyId };

    // ── REFERENCE: the public market_read cascade ──
    const { data: refRows } = await supabase
      .from("strategy_cascades")
      .select("id, winning_aspiration, where_to_play, how_to_win, capabilities_json, management_systems_json")
      .eq("company_id", companyId)
      .eq("artifact_role", "market_read")
      .order("created_at", { ascending: false })
      .limit(1);
    const reference = ((refRows ?? []) as CascadeRow[])[0];
    if (!reference) return { status: "no_public_cascade", company_id: companyId };

    // ── Prior basis (for verdict-by-identity reuse + baseline + change detection) ──
    const { data: existingRow } = await supabase
      .from("surface_drift_assessments")
      .select("id, assessment_basis, drift_state")
      .eq("company_id", companyId)
      .eq("surface_type", "cascade")
      .eq("surface_id", String(subject.id))
      .maybeSingle();
    const priorBasis = (existingRow as { assessment_basis?: Record<string, unknown> } | null)?.assessment_basis ?? null;
    const ledger: Record<string, { verdict: CascadeVerdict }> =
      ((priorBasis as { verdict_ledger?: Record<string, { verdict: CascadeVerdict }> } | null)?.verdict_ledger) ?? {};

    // ── Per-dimension compare: deterministic → stored → local judge ──
    const dimensions: DimFinding[] = [];
    for (const { key, label } of DIMENSIONS) {
      const internalText = dimText(subject[key]);
      const externalText = dimText(reference[key]);
      const internalNorm = normalizeForHash(internalText);
      const externalNorm = normalizeForHash(externalText);

      if (!internalNorm || !externalNorm) {
        dimensions.push({ dimension: label, verdict: "unknown", method: "deterministic", identity: null,
          internal_cited: internalText.slice(0, 200), external_cited: externalText.slice(0, 200),
          detail: "One side is empty — nothing to compare." });
        continue;
      }
      if (internalNorm === externalNorm) {
        dimensions.push({ dimension: label, verdict: "aligned", method: "deterministic", identity: null,
          internal_cited: internalText.slice(0, 200), external_cited: externalText.slice(0, 200),
          detail: "Identical text." });
        continue;
      }
      const identity = await comparisonIdentity(label, internalText, externalText);
      const stored = ledger[identity];
      if (stored) {
        dimensions.push({ dimension: label, verdict: stored.verdict, method: "stored", identity,
          internal_cited: internalText.slice(0, 200), external_cited: externalText.slice(0, 200),
          detail: "Reused stored comparison verdict (content-identity match)." });
        continue;
      }
      const userText =
        `DIMENSION: ${label}\n\nINTERNAL (declared direction):\n${internalText}\n\n` +
        `PUBLIC (market read):\n${externalText}\n\nDo they diverge on this dimension?`;
      const v = await runVerdictJudge<CascadeVerdict>({
        ollamaUrl: args.ollamaUrl, judgeModel: args.judgeModel ?? "llama3:70b",
        system: CASCADE_COMPARE_SYSTEM, userText, verdicts: CASCADE_VERDICTS,
      });
      dimensions.push({ dimension: label, verdict: v.classification, method: "local_llm", identity,
        internal_cited: internalText.slice(0, 200), external_cited: externalText.slice(0, 200), detail: v.reason });
    }

    // ── computedState + baseline posture (verbatim from the reconcile template) ──
    const divergent = dimensions.filter((d) => d.verdict === "diverged");
    const computedState = divergent.length === 0 ? "aligned" : divergent.length === 1 ? "slight_drift" : "material_drift";
    const computedScore = dimensions.length ? Number((divergent.length / dimensions.length).toFixed(4)) : 0;

    const ledgerOut = { ...ledger };
    for (const d of dimensions) {
      if (d.identity && d.verdict !== "unknown" && !ledgerOut[d.identity]) ledgerOut[d.identity] = { verdict: d.verdict };
    }

    const isBaseline = !priorBasis;
    const priorDimMap = new Map<string, string>(
      (((priorBasis?.latest as { dimensions?: DimFinding[] } | undefined)?.dimensions) ?? []).map((d) => [String(d.dimension), String(d.verdict)]),
    );
    const comparedDims = dimensions.filter((d) => priorDimMap.has(d.dimension));
    const changed = !isBaseline && comparedDims.some((d) => priorDimMap.get(d.dimension) !== d.verdict);
    const alertDivergent = comparedDims.filter((d) => d.verdict === "diverged");
    // Alert law (template): baseline quiet; unchanged quiet; changed comparison WITH
    // divergence among COMPARED dimensions ⇒ alert.
    const driftState = isBaseline ? "aligned" : (changed && alertDivergent.length > 0 ? computedState : "aligned");
    const driftScore = driftState === "aligned" ? 0 : computedScore;

    const basis = {
      reconciler: "cascade_v1",
      baseline: isBaseline
        ? { recorded_at: new Date().toISOString(), computed_state: computedState, dimensions }
        : (priorBasis as { baseline?: unknown } | null)?.baseline ?? null,
      latest: { computed_state: computedState, computed_score: computedScore, changed_since_prior: changed, no_change: !isBaseline && !changed, dimensions, reference_cascade_id: String(reference.id) },
      verdict_ledger: ledgerOut,
    };

    await recordIntegrityRun(supabase, {
      company_id: companyId, component: "cascade_reconcile", surface_type: "cascade",
      surface_id: String(subject.id), status: "completed",
      examined: dimensions.length, admitted: dimensions.filter((d) => d.verdict === "aligned").length,
      excluded_by_rule: { dimensions: dimensions.map((d) => ({ dimension: d.dimension, verdict: d.verdict, method: d.method })), computed_state: computedState, baseline: isBaseline, changed_since_prior: changed, drift_state_written: driftState },
      run_ref: "cascade-reconcile",
    });

    if (args.dryRun) {
      return { status: "dry_run", company_id: companyId, surface_id: String(subject.id), baseline: isBaseline, drift_state: driftState, computed_state: computedState, dimensions: dimensions.map((d) => ({ dimension: d.dimension, verdict: d.verdict, method: d.method })) };
    }

    const payload = {
      company_id: companyId,
      surface_type: "cascade",
      surface_id: String(subject.id),
      drift_score: driftScore,
      drift_state: driftState,
      llm_confirmation: divergent.length ? divergent.map((d) => `${d.dimension}: ${d.detail}`).join(" ") : null,
      assessment_basis: basis,
      last_assessed_at: new Date().toISOString(),
      ...(driftState !== "aligned" ? { accepted_as_aligned_at: null, operator_seen_at: null } : {}),
    };
    if ((existingRow as { id?: string } | null)?.id) {
      await supabase.from("surface_drift_assessments").update(payload).eq("id", (existingRow as { id: string }).id);
    } else {
      await supabase.from("surface_drift_assessments").insert(payload);
    }

    return { status: "ok", company_id: companyId, surface_id: String(subject.id), baseline: isBaseline, drift_state: driftState, computed_state: computedState, dimensions: dimensions.map((d) => ({ dimension: d.dimension, verdict: d.verdict, method: d.method })) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[cascade-reconcile] ${companyId}: FAILED (fail-closed): ${message}`);
    await recordIntegrityRun(supabase, {
      company_id: companyId, component: "cascade_reconcile", status: "failed",
      error: `cascade reconcile: ${message}`, run_ref: "cascade-reconcile",
    });
    throw err; // fail-closed: surface, record, never write a fabricated drift
  }
}
