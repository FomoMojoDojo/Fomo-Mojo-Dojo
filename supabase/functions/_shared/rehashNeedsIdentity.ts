// One-time, IDEMPOTENT re-hash of odi_needs.content_identity to the hardened
// identity-source (needs-identity-source hardening, 2026-06-18): identity =
// hash(desired_outcome) ALWAYS. Rows created under the old coalesce(canonical,
// desired_outcome) source whose canonical ≠ desired_outcome carry a stale stored
// identity (= hash(canonical)); the first reconcile after the formula flip would
// false-ADD them. This brings their stored identity to parity.
//
// Uses the ONE TS identity authority (contentIdentity + needIdentityStatement) —
// NEVER a SQL/pgcrypto reimplementation (that would silently diverge). Writes ONLY
// rows whose stored hash actually changes, so a re-run is a pure no-op (idempotent).
// NULL-stored rows are skipped (planReconcile lazily recomputes them correctly on
// the next reconcile). CB1/CB2 are excluded belt-and-suspenders — they are
// zero-change anyway (canonical NULL or == desired_outcome), but never written.

import { contentIdentity, needIdentityStatement } from "./contentIdentity.ts";

type SupabaseLike = { from: (t: string) => any };

export async function rehashNeedsIdentity(opts: {
  supabase: SupabaseLike;
  excludeCompanyIds?: string[];
}): Promise<{ examined: number; changed: number; perCompany: Record<string, number> }> {
  const exclude = new Set((opts.excludeCompanyIds ?? []).map(String));
  const { data, error } = await opts.supabase
    .from("odi_needs")
    .select("id, company_id, desired_outcome, content_identity");
  if (error) throw new Error(`rehash select failed: ${error.message}`);
  const rows = (data ?? []) as Array<Record<string, string | null>>;

  let examined = 0;
  let changed = 0;
  const perCompany: Record<string, number> = {};
  for (const r of rows) {
    if (r.content_identity == null) continue; // NULL stored → lazy-recompute, no migration
    if (exclude.has(String(r.company_id))) continue; // frozen / excluded
    examined++;
    const want = await contentIdentity(needIdentityStatement({ desired_outcome: r.desired_outcome }));
    if (r.content_identity === want) continue; // already hardened → idempotent no-op
    const { error: uerr } = await opts.supabase
      .from("odi_needs")
      .update({ content_identity: want })
      .eq("id", r.id);
    if (uerr) throw new Error(`rehash update ${r.id} failed: ${uerr.message}`);
    changed++;
    const cid = String(r.company_id);
    perCompany[cid] = (perCompany[cid] ?? 0) + 1;
  }
  return { examined, changed, perCompany };
}
