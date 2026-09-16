// Birth admission (operator direction 2026-09-16) — the ONE rule for whether a company may be
// born (research-company cold start) or hunted for (public-baseline), independent of any dialog flag.
//
//   no_public_site  — the company declared it has no public site: nothing is crawled or searched for,
//                     and nothing is born from its name. Refused by name, never by a missing field.
//   no_baseline     — no public_baseline_runs row exists and no uploaded evidence exists: a birth would
//                     be fabricated from the company name alone. (research-company used to read an
//                     ABSENT baseline as status "ok" and build anyway.)
//
// run-agent-flow skips BEFORE the guard (skipped_no_public_site / skipped_no_baseline, ledgered);
// research-company refuses with 422 (nothing written); public-baseline refuses no_public_site with 422.
export type BirthAdmission =
  | { ok: true }
  | { ok: false; reason: "no_public_site" | "no_baseline"; message: string };

export const NO_PUBLIC_SITE_MESSAGE = "This company has no public site — nothing is crawled, searched for, or born from its name.";
export const NO_BASELINE_MESSAGE = "No public baseline exists for this company and no uploaded evidence is present — a birth would be built from the name alone. Run the outside read or upload evidence first; nothing was written.";

type Db = { from: (t: string) => any };

export async function readNoPublicSite(supabase: Db, companyId: string): Promise<boolean> {
  const { data } = await supabase.from("companies").select("no_public_site").eq("id", companyId).maybeSingle();
  return (data as { no_public_site?: unknown } | null)?.no_public_site === true;
}

export async function birthAdmission(
  supabase: Db,
  companyId: string,
  opts: { hasUploadedEvidence: () => Promise<boolean> },
): Promise<BirthAdmission> {
  if (await readNoPublicSite(supabase, companyId)) return { ok: false, reason: "no_public_site", message: NO_PUBLIC_SITE_MESSAGE };
  const { data: run } = await supabase.from("public_baseline_runs").select("id").eq("company_id", companyId).limit(1).maybeSingle();
  if (run) return { ok: true };
  if (await opts.hasUploadedEvidence()) return { ok: true };
  return { ok: false, reason: "no_baseline", message: NO_BASELINE_MESSAGE };
}

/** The ledger row the onramp writes for a refused birth — recorded, never silent. */
export async function ledgerSkippedBirth(supabase: Db, companyId: string, reason: "no_public_site" | "no_baseline"): Promise<void> {
  const now = new Date().toISOString();
  await supabase.from("long_runner_runs").insert({
    run_kind: "birth", company_id: companyId, status: "skipped", target_count: 0, done_count: 0,
    error_text: reason, started_at: now, finished_at: now, updated_at: now,
  });
}
