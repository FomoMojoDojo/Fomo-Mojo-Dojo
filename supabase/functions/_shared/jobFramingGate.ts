// Phase 2 Gate 1 — the job-framing chokepoint (council-approved design, 2026-06-12).
//
// Council decisions on record: (1) provenance marker + external gating ship before
// any internal job-step set exists; (2) companies without admissible job framing
// fall back externally to category+locale only (the competitor-gate pattern);
// (3) provenance_type ∈ public_baseline | internal_derived | operator_authored,
// with operator_authored inadmissible-to-external like internal; (4) NULL means
// inadmissible — unproven provenance never reaches an external prompt.
//
// EVERY external-bound consumer of job_steps content routes its queried rows through
// this gate BEFORE any brief construction (the gate-before-prompt pattern of
// gateBasisBySyndication): only provenance_type === 'public_baseline' rows survive;
// the gate records its own integrity_runs row (component 'job_framing_gate') so the
// fallback state is a persisted record per the integrity laws — examined/admitted
// counts distinguish "steps excluded" from "company has no steps at all".
// competitor-discovery keeps its own stricter second layer (public AND pinned AND
// every-step-resolves) — this gate does not replace it.

import { recordIntegrityRun } from "./integrity.ts";

export const JOB_FRAMING_FALLBACK_LINE =
  "none — no public-provenance job framing; category and locale context only";

export async function gateJobStepsForExternal<T extends { provenance_type?: string | null }>(opts: {
  supabase: { from: (t: string) => any } | undefined | null;
  companyId: string;
  rows: T[];
  consumer: string;
}): Promise<{ admissible: T[]; fallback: boolean; excludedCount: number }> {
  const rows = Array.isArray(opts.rows) ? opts.rows : [];
  const admissible = rows.filter((r) => r?.provenance_type === "public_baseline");
  const excludedCount = rows.length - admissible.length;
  const fallback = admissible.length === 0;
  if (excludedCount > 0 || fallback) {
    console.log("[job-framing-gate] composition", {
      consumer: opts.consumer,
      company_id: opts.companyId,
      examined: rows.length,
      admitted: admissible.length,
      excluded_non_public_provenance: excludedCount,
      fallback,
    });
  }
  await recordIntegrityRun(opts.supabase ?? null, {
    company_id: opts.companyId,
    component: "job_framing_gate",
    status: "completed",
    examined: rows.length,
    admitted: admissible.length,
    excluded_by_rule: { non_public_provenance: excludedCount, fallback },
    run_ref: opts.consumer,
  });
  return { admissible, fallback, excludedCount };
}
