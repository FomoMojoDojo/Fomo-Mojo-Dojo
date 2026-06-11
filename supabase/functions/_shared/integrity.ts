// Reviewer-integrity logging — the write-side helper.
//
// Law: "all clear" that never asked isn't all clear. Every checking component
// persists one integrity_runs record per execution: completed (with the same
// composition counts it logs to console), failed (with the error), or
// skipped_empty_input. Best-effort by construction — recording integrity must
// never change pipeline behavior, so this function NEVER throws. Console mirror
// stays: console is debug, the table is product truth.
//
// Record-scope law (design-gate risk list): a company-level record never backs a
// surface-level claim — callers set surface_type/surface_id when (and only when)
// the record is about a specific surface.

export type IntegrityRecord = {
  company_id: string;
  component:
    | "evidence_review"
    | "consistency_review"
    | "finalizer"
    | "claim_provenance"
    | "attr_evidence"
    | "syndication_ingest"
    | "store_supplement"
    | "market_reconcile"
    | "drift_scan";
  surface_type?: string | null;
  surface_id?: string | null;
  status: "completed" | "failed" | "skipped_empty_input";
  examined?: number | null;
  admitted?: number | null;
  excluded_by_rule?: Record<string, unknown> | null;
  error?: string | null;
  run_ref?: string | null;
};

export async function recordIntegrityRun(
  supabase: { from: (t: string) => any } | undefined | null,
  record: IntegrityRecord,
): Promise<void> {
  console.log(`[integrity] ${record.component} ${record.status}`, {
    company_id: record.company_id,
    surface: record.surface_type ?? null,
    examined: record.examined ?? null,
    admitted: record.admitted ?? null,
    error: record.error ? String(record.error).slice(0, 200) : null,
  });
  if (!supabase) return;
  try {
    await supabase.from("integrity_runs").insert({
      company_id: record.company_id,
      component: record.component,
      surface_type: record.surface_type ?? null,
      surface_id: record.surface_id ?? null,
      status: record.status,
      examined: record.examined ?? null,
      admitted: record.admitted ?? null,
      excluded_by_rule: record.excluded_by_rule ?? null,
      error: record.error ? String(record.error).slice(0, 2000) : null,
      run_ref: record.run_ref ?? null,
    });
  } catch (error) {
    // Never let integrity recording alter pipeline behavior.
    console.warn("[integrity] record insert failed (non-fatal)", {
      component: record.component,
      message: String(error instanceof Error ? error.message : error).slice(0, 200),
    });
  }
}
