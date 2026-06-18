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

const DRIFT_EXTERNAL_ADMISSIBLE_PROVENANCE = new Set([
  "public_research",
  "public_baseline",
]);

export function isDriftSurfaceExternallyAdmissible(
  provenance: string | null | undefined,
): boolean {
  return provenance != null && DRIFT_EXTERNAL_ADMISSIBLE_PROVENANCE.has(String(provenance));
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
