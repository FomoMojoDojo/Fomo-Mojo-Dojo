// ── A1 (operator ruling, 2026-10-15): AN AUDIT WRITE THAT IS REFUSED FAILS THE ACT ──────────────
//
// WHY. generate-read-slots wrote its stage-time audit row with `status: allAccepted ? "ok" :
// "rejected"`, and "ok" is not a legal status — integrity_runs_status_check allows completed,
// failed, skipped_empty_input, planned and rejected. The insert was a bare `await …insert({…})`
// whose { error } was never read, so every accepted slot stage failed its audit write SILENTLY. The
// table proves it: across all time, slot components carry 14 'rejected' rows (a legal status, so
// those inserts landed) and 2 'completed' rows, both from the SIGNING path — not one successful
// stage has ever been audited. Wasabi's stage on 2026-10-15 burned id 10533 the same way.
//
// The refusal path kept working, which is what hid it: the only rows that failed were the ones
// saying something went RIGHT, and nobody misses a row they never expected to read.
//
//   THE RULE: every insert into integrity_runs reads its error, and a refused insert fails the act
//   loudly rather than leaving a gap nobody can see.
//
// THIS REVERSES A STANDING INTENT AT SEVERAL SITES, and that is the point. Comments at those sites
// said "observability must never break the pipeline" and "a failed integrity write must never turn
// a completed run into a failed one". That reasoning protects the run and sacrifices the record —
// and a record with silent holes is worse than a run that stops, because the hole is invisible
// exactly where the audit was supposed to speak. Where a site genuinely must not fail its act, it
// now has to say so explicitly by catching IntegrityWriteRefused, which is a decision a reader can
// see rather than an omission they cannot.

/** Thrown when the database refuses an integrity_runs insert. Named so a caller that truly must
 *  survive the refusal can catch THIS and nothing else. */
export class IntegrityWriteRefused extends Error {
  readonly component: string;
  readonly status: string;
  readonly cause_message: string;
  constructor(component: string, status: string, message: string) {
    super(`integrity_runs insert refused (component=${component} status=${status}): ${message}`);
    this.name = "IntegrityWriteRefused";
    this.component = component;
    this.status = status;
    this.cause_message = message;
  }
}

// deno-lint-ignore no-explicit-any
type SupabaseLike = { from: (t: string) => any };

// R36 (b) (2026-10-20): a run's row is OPENED before its first write and FINISHED at the end, so a refused finish
// leaves a row that says so instead of no row at all. Both read their error.
/** Insert and return the new row's id; throws IntegrityWriteRefused when refused. */
export async function openIntegrityRun(supabase: SupabaseLike, row: Record<string, unknown>): Promise<number> {
  const { data, error } = await supabase.from("integrity_runs").insert(row).select("id").single();
  if (error || !data || data.id == null) {
    throw new IntegrityWriteRefused(String(row.component ?? "(none)"), String(row.status ?? "(none)"), String(error?.message ?? error ?? "insert returned no id"));
  }
  return Number(data.id);
}
/** Update one row by id; throws IntegrityWriteRefused (with "update" in the message) when refused. */
export async function finishIntegrityRun(supabase: SupabaseLike, id: number, patch: Record<string, unknown>): Promise<void> {
  const { error } = await supabase.from("integrity_runs").update(patch).eq("id", id);
  if (error) throw new IntegrityWriteRefused(String(patch.component ?? "(update)"), String(patch.status ?? "(none)"), `update of row ${id} refused: ${String(error.message ?? error)}`);
}

/** THE one writer. Reads { error } and throws IntegrityWriteRefused when the row is refused. */
export async function insertIntegrityRun(
  supabase: SupabaseLike,
  row: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase.from("integrity_runs").insert(row);
  if (error) {
    throw new IntegrityWriteRefused(
      String(row.component ?? "(none)"), String(row.status ?? "(none)"), String(error.message ?? error),
    );
  }
}
