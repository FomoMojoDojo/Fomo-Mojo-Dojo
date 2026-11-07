// Gate 3a — the strategy-artifact chokepoint (operator-approved design,
// 2026-06-12; fourth application of the Gate 1 sequencing law: the gate ships
// BEFORE any declared artifact exists).
//
// EVERY external-bound read of positioning_canvases / strategy_cascades content
// passes through here before prompt assembly. Admission: artifact_role =
// 'market_read' AND provenance_type is a public-derived class (see
// externalProvenance.ts). NULL provenance is inadmissible (Gate 1 law, applied
// uniformly — CB1's legacy artifacts excluded by operator ruling, no restamp).
// declared_direction
// artifacts are internal framing and NEVER reach an external model.
// local-alignment is deliberately NOT gated (public→local and internal→local
// are legal) — it is role-scoped at the read instead.

import { recordIntegrityRun } from "./integrity.ts";
import { EXTERNAL_ADMISSIBLE_PROVENANCE, isCascadeExternallyAdmissible, isOperatorEdited } from "./externalProvenance.ts";

// Admit set single-sourced in externalProvenance.ts (operator ruling 2026-06-18):
// only public-derived provenance crosses an external boundary. framework_adjudicated
// / odi_survey / manual are internal and were dropped here — zero live delta (no
// cascade/positioning row of those classes exists). The market_read requirement and
// NULL-inadmissible behavior below are unchanged.

export type StrategyArtifactKind = "positioning_canvas" | "strategy_cascade";

export async function gateStrategyArtifactForExternal<
  T extends { artifact_role?: string | null; provenance_type?: string | null; operator_edited_at?: string | null },
>(opts: {
  supabase: { from: (t: string) => any } | undefined | null;
  companyId: string;
  artifact: T | null | undefined;
  artifactKind: StrategyArtifactKind;
  consumer: string;
}): Promise<{ admissible: T | null; fallback: boolean }> {
  const artifact = opts.artifact ?? null;
  const role = String(artifact?.artifact_role ?? "");
  const provenance = artifact?.provenance_type == null ? null : String(artifact.provenance_type);
  // Q3 (2026-11-06): operator authorship is the third admission dimension. The CALLER must select
  // operator_edited_at — an unselected column reads undefined, which isOperatorEdited treats as
  // "not edited", so the gate cannot detect a caller that forgot.
  // src/lib/operatorEditedSelectGate.test.ts asserts every consumer's select list carries the column.
  const operatorEditedAt = artifact?.operator_edited_at == null ? null : String(artifact.operator_edited_at);
  const operatorEdited = artifact !== null && isOperatorEdited(operatorEditedAt);
  // excluded_by_rule flags kept for the integrity record; the ADMIT decision is the
  // single-sourced cascade predicate (admitted === !nonMarketRead && !nullProvenance
  // && !internalProvenance, behaviour-identical).
  const nonMarketRead = artifact !== null && role !== "market_read";
  const nullProvenance = artifact !== null && provenance === null;
  const internalProvenance =
    artifact !== null && provenance !== null && !EXTERNAL_ADMISSIBLE_PROVENANCE.has(provenance);
  const admitted = artifact !== null && isCascadeExternallyAdmissible(role, provenance, operatorEditedAt);
  const fallback = !admitted;

  if (artifact !== null && !admitted) {
    console.log("[strategy-artifact-gate] excluded", {
      consumer: opts.consumer,
      company_id: opts.companyId,
      kind: opts.artifactKind,
      role: role || null,
      provenance,
      operator_edited: operatorEdited,
    });
  }
  await recordIntegrityRun(opts.supabase ?? null, {
    company_id: opts.companyId,
    component: "strategy_artifact_gate",
    surface_type: opts.artifactKind,
    status: "completed",
    examined: artifact === null ? 0 : 1,
    admitted: admitted ? 1 : 0,
    excluded_by_rule: {
      non_market_read: nonMarketRead,
      internal_provenance: internalProvenance,
      null_provenance: nullProvenance,
      // Q3 (2026-11-06) — the named reason the ruling requires. Carries the stamp itself so the
      // refusal is reconstructable from the audit row alone.
      operator_edited: operatorEdited,
      operator_edited_at: operatorEdited ? operatorEditedAt : null,
      fallback,
    },
    run_ref: opts.consumer,
  });
  return { admissible: admitted ? artifact : null, fallback };
}

// Array form for consumers that fetch row sets (council-review's context payload).
// One integrity record per call with examined/admitted counts.
export async function gateStrategyArtifactsForExternal<
  T extends { artifact_role?: string | null; provenance_type?: string | null; operator_edited_at?: string | null },
>(opts: {
  supabase: { from: (t: string) => any } | undefined | null;
  companyId: string;
  artifacts: T[] | null | undefined;
  artifactKind: StrategyArtifactKind;
  consumer: string;
}): Promise<{ admissible: T[]; fallback: boolean }> {
  const rows = Array.isArray(opts.artifacts) ? opts.artifacts : [];
  const admissible = rows.filter((row) =>
    isCascadeExternallyAdmissible(row?.artifact_role, row?.provenance_type, row?.operator_edited_at)
  );
  const excluded = rows.length - admissible.length;
  // Q3 (2026-11-06): counted separately so the array form's audit row says HOW MANY were refused
  // for operator authorship, not just that some were refused.
  const operatorEditedExcluded = rows.filter((row) => isOperatorEdited(row?.operator_edited_at)).length;
  const fallback = admissible.length === 0;
  if (excluded > 0) {
    console.log("[strategy-artifact-gate] composition", {
      consumer: opts.consumer,
      company_id: opts.companyId,
      kind: opts.artifactKind,
      examined: rows.length,
      admitted: admissible.length,
    });
  }
  await recordIntegrityRun(opts.supabase ?? null, {
    company_id: opts.companyId,
    component: "strategy_artifact_gate",
    surface_type: opts.artifactKind,
    status: "completed",
    examined: rows.length,
    admitted: admissible.length,
    excluded_by_rule: { excluded_rows: excluded, operator_edited: operatorEditedExcluded, fallback },
    run_ref: opts.consumer,
  });
  return { admissible, fallback };
}
