// DECL-OPP 1a — the drift-boundary privacy chokepoint (operator-approved design,
// 2026-06-18; Option-B privacy law).
//
// assess-surface-drift ships surface content to an EXTERNAL model (OpenAI). Only
// PUBLIC-derived surfaces may cross that boundary. Declared/internal/operator-
// authored/curated-private and NULL-provenance surfaces are fail-closed
// inadmissible — they return not-applicable and their text NEVER reaches the
// external prompt.
//
// Stricter than the strategy-artifact gate (which admits manual / odi_survey /
// framework_adjudicated) by design: a drift scan has no public-only fallback to
// degrade to, so an inadmissible surface is simply skipped, and the Option-B rule
// is that human-curated and survey-sourced text is private too. Admission is the
// narrow set {public_research, public_baseline}; everything else, including NULL,
// is excluded (Gate 1 law — unproven provenance never reaches an external prompt).
//
// EVERY external-bound read of routes / odi_needs content in assess-surface-drift
// passes through here before any surface text is assembled. Each excluded surface
// records its own integrity_runs row (component 'drift_external_gate') so the
// not-applicable outcome is persisted truth, not silence (the integrity laws).

import { recordIntegrityRun } from "./integrity.ts";
import { EXTERNAL_ADMISSIBLE_PROVENANCE, isSubjectLocalAdmissible, isCascadeLocalAdmissible } from "./externalProvenance.ts";

export function isDriftSurfaceExternallyAdmissible(
  provenance: string | null | undefined,
): boolean {
  return provenance != null && EXTERNAL_ADMISSIBLE_PROVENANCE.has(String(provenance));
}

// Single-row form: the one skip+record path for consumers that send ONE internal
// subject surface to an external model (the verdict/propose lanes). Inadmissible
// (internal/NULL-provenance) subject → record an excluded-by-rule integrity row
// and return admissible:false so the caller skips the external call entirely.
// Admissible (public-derived) → admissible:true, no record, caller proceeds.
export async function gateSubjectForExternal(opts: {
  supabase: { from: (t: string) => any } | undefined | null;
  companyId: string;
  surfaceType: string;
  surfaceId: string;
  provenance: string | null | undefined;
  consumer: string;
}): Promise<{ admissible: boolean }> {
  const prov = opts.provenance == null ? null : String(opts.provenance);
  if (isDriftSurfaceExternallyAdmissible(prov)) {
    return { admissible: true };
  }
  console.log("[drift-external-gate] subject excluded", {
    consumer: opts.consumer,
    company_id: opts.companyId,
    surface_type: opts.surfaceType,
    surface_id: opts.surfaceId,
    provenance: prov,
  });
  await recordIntegrityRun(opts.supabase ?? null, {
    company_id: opts.companyId,
    component: "drift_external_gate",
    surface_type: opts.surfaceType,
    surface_id: opts.surfaceId,
    status: "completed",
    examined: 1,
    admitted: 0,
    excluded_by_rule: { non_public_provenance: true, provenance: prov },
    run_ref: opts.consumer,
  });
  return { admissible: false };
}

// LOCAL-LANE mirror of gateSubjectForExternal — the one skip+record path for
// consumers that judge an internal subject with a LOCAL model (text never leaves).
// Admits internal/NULL provenance (the exact complement of the external gate); on
// an external-admissible (public-derived) row it DECLINES — that subject belongs to
// the external lane — recording a 'local_lane_gate' integrity row. Together with
// gateSubjectForExternal this is a partition: for every provenance exactly one gate
// admits (XOR), enforced by isSubjectLocalAdmissible = !external-admissible.
export async function gateSubjectForLocal(opts: {
  supabase: { from: (t: string) => any } | undefined | null;
  companyId: string;
  surfaceType: string;
  surfaceId: string;
  provenance: string | null | undefined;
  consumer: string;
}): Promise<{ admissible: boolean }> {
  const prov = opts.provenance == null ? null : String(opts.provenance);
  if (isSubjectLocalAdmissible(prov)) {
    return { admissible: true };
  }
  console.log("[local-lane-gate] subject declined (external lane)", {
    consumer: opts.consumer,
    company_id: opts.companyId,
    surface_type: opts.surfaceType,
    surface_id: opts.surfaceId,
    provenance: prov,
  });
  await recordIntegrityRun(opts.supabase ?? null, {
    company_id: opts.companyId,
    component: "local_lane_gate",
    surface_type: opts.surfaceType,
    surface_id: opts.surfaceId,
    status: "completed",
    examined: 1,
    admitted: 0,
    excluded_by_rule: { public_provenance: true, provenance: prov },
    run_ref: opts.consumer,
  });
  return { admissible: false };
}

// CASCADE local gate (Phase 3a) — artifact_role-aware mirror of gateSubjectForLocal.
// Admits the LITERAL complement of the cascade external gate (isCascadeLocalAdmissible
// = !isCascadeExternallyAdmissible), so the cascade XOR partition holds by
// construction. SEPARATE from gateSubjectForLocal so the route/opportunity
// provenance-only gate stays byte-unchanged. Declines (records) a cascade the
// external lane owns (market_read + public).
export async function gateCascadeSubjectForLocal(opts: {
  supabase: { from: (t: string) => any } | undefined | null;
  companyId: string;
  surfaceId: string;
  artifactRole: string | null | undefined;
  provenance: string | null | undefined;
  consumer: string;
}): Promise<{ admissible: boolean }> {
  const role = opts.artifactRole == null ? null : String(opts.artifactRole);
  const prov = opts.provenance == null ? null : String(opts.provenance);
  if (isCascadeLocalAdmissible(role, prov)) {
    return { admissible: true };
  }
  console.log("[local-lane-gate] cascade declined (external lane)", {
    consumer: opts.consumer,
    company_id: opts.companyId,
    surface_id: opts.surfaceId,
    artifact_role: role,
    provenance: prov,
  });
  await recordIntegrityRun(opts.supabase ?? null, {
    company_id: opts.companyId,
    component: "local_lane_gate",
    surface_type: "cascade",
    surface_id: opts.surfaceId,
    status: "completed",
    examined: 1,
    admitted: 0,
    excluded_by_rule: { external_cascade: true, artifact_role: role, provenance: prov },
    run_ref: opts.consumer,
  });
  return { admissible: false };
}

// Array form: filter a fetched surface set to the externally-admissible rows,
// recording one per-surface excluded-by-rule integrity record for each row the
// rule drops. Inadmissible rows never reach assessSurface, so zero external calls
// are made on their behalf.
export async function gateDriftSurfacesForExternal<
  T extends { id: string; provenance_type?: string | null },
>(opts: {
  supabase: { from: (t: string) => any } | undefined | null;
  companyId: string;
  surfaceType: string;
  rows: T[] | null | undefined;
  consumer: string;
}): Promise<{ admissible: T[]; excludedCount: number }> {
  const rows = Array.isArray(opts.rows) ? opts.rows : [];
  const admissible: T[] = [];
  let excludedCount = 0;
  for (const row of rows) {
    const provenance = row?.provenance_type == null ? null : String(row.provenance_type);
    if (isDriftSurfaceExternallyAdmissible(provenance)) {
      admissible.push(row);
      continue;
    }
    excludedCount++;
    console.log("[drift-external-gate] excluded", {
      consumer: opts.consumer,
      company_id: opts.companyId,
      surface_type: opts.surfaceType,
      surface_id: row?.id ?? null,
      provenance,
    });
    await recordIntegrityRun(opts.supabase ?? null, {
      company_id: opts.companyId,
      component: "drift_external_gate",
      surface_type: opts.surfaceType,
      surface_id: row?.id ?? null,
      status: "completed",
      examined: 1,
      admitted: 0,
      excluded_by_rule: { non_public_provenance: true, provenance },
      run_ref: opts.consumer,
    });
  }
  if (excludedCount > 0) {
    console.log("[drift-external-gate] composition", {
      consumer: opts.consumer,
      company_id: opts.companyId,
      surface_type: opts.surfaceType,
      examined: rows.length,
      admitted: admissible.length,
      excluded_non_public_provenance: excludedCount,
    });
  }
  return { admissible, excludedCount };
}
