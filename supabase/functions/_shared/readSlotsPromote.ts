// ── SLOT STAGING / PROMOTION / SIGNATURE (R1, R6; signed 2026-10-05) ─────────────────────────────
//
// The SAME two-phase shape as _shared/publicReadPromote.ts — stage writes NOT current, promote flips
// it current and supersedes the prior current row — in its own file because publicReadPromote.ts
// stays BYTE-IDENTICAL under the R6 ruling (the read→slot supersession is a DB trigger, not a third
// sequential update; see 20261005150000_first_read_slots.sql). This is that idiom applied to slots,
// not a second idiom: same lookup order, same fail-closed-before-any-write discipline, same
// PromoteRefused-style named refusal.
//
// WHAT PROMOTE ADDS BEYOND THE READ CASE: promoting a slot IS the operator's signing act. There is no
// unsigned current slot — the table's first_read_slots_current_signed_check enforces it — so promote
// sets is_current, signed_at and signed_by together or not at all.
//
// STALE-SOURCE REFUSAL (R6 amendment). A slot staged against read X, whose read is then replaced by
// Y, must never be promoted: it would become a current slot describing a read that is no longer
// current — the Edgewood 913b716a shape. The trigger already supersedes a staged slot when its source
// stops being current, so this refusal is the belt to that braces: it is decided BEFORE any write and
// it also catches a slot whose source was never current to begin with.

// deno-lint-ignore no-explicit-any
type AnySupabase = { from: (t: string) => any };

export class SlotPromoteRefused extends Error {
  constructor(public readonly slotId: string, public readonly kind: string, reason: string) {
    super(`slot promote refused (${kind}, slot ${slotId}): ${reason}`);
    this.name = "SlotPromoteRefused";
  }
}

export type SlotPromoted = { kind: string; staged: string; superseded: string | null };

/** The newest staged, not-superseded slot for a kind — the row an operator just reviewed. */
export async function stagedSlotFor(
  supabase: AnySupabase, companyId: string, kind: string,
): Promise<{ id: string; source_read_id: string | null; criterion_version: string | null } | null> {
  const { data } = await supabase.from("first_read_slots")
    .select("id, source_read_id, criterion_version")   // VS2: the signature row names the rules the slot was written under
    .eq("company_id", companyId).eq("kind", kind)
    .eq("is_current", false).is("superseded_at", null)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  return (data as { id: string; source_read_id: string | null; criterion_version: string | null } | null) ?? null;
}

/** PROMOTE + SIGN. Per kind: refuse a stale source, supersede the prior current slot, flip the staged
 *  row current and stamp the signature. No model call, no generation. */
export async function promoteStagedSlots(
  supabase: AnySupabase,
  companyId: string,
  kinds: readonly string[],
  signedBy: string,
  signNote?: string | null,
): Promise<{ promoted: SlotPromoted[] }> {
  if (!signedBy) throw new Error("promoteStagedSlots: signedBy is required — a current slot is always a signed slot");
  const promoted: SlotPromoted[] = [];

  for (const kind of kinds) {
    const staged = await stagedSlotFor(supabase, companyId, kind);
    if (!staged) { promoted.push({ kind, staged: "", superseded: null }); continue; }

    // ── FAIL CLOSED, BEFORE ANY WRITE: the staged slot's source must still be the current read ────
    const { data: curRead } = await supabase.from("public_reads")
      .select("id").eq("company_id", companyId).eq("kind", kind).eq("is_current", true).maybeSingle();
    const currentReadId = (curRead as { id?: string } | null)?.id ?? null;
    if (!staged.source_read_id || staged.source_read_id !== currentReadId) {
      const detail = `staged against read ${staged.source_read_id ?? "(none)"} but the current read is ${currentReadId ?? "(none)"} — stage it again against the current read`;
      // VS2: a refused signature is recorded too. A signature that did not happen is as much a fact
      // about the slot as one that did, and the refusal is the only place the reason survives.
      await recordSignature(supabase, {
        companyId, kind, slotId: staged.id, sourceReadId: staged.source_read_id ?? null,
        signedBy, criterionVersion: staged.criterion_version ?? null, status: "rejected", detail,
      });
      throw new SlotPromoteRefused(staged.id, kind, detail);
    }

    const { data: prior } = await supabase.from("first_read_slots")
      .select("id").eq("company_id", companyId).eq("kind", kind).eq("is_current", true).maybeSingle();
    const priorId = (prior as { id?: string } | null)?.id ?? null;
    if (priorId) {
      const { error: e1 } = await supabase.from("first_read_slots")
        .update({ is_current: false, superseded_by: staged.id, superseded_at: new Date().toISOString(), superseded_reason: "slot_promoted" })
        .eq("id", priorId);
      if (e1) throw new Error(`supersede-prior-slot failed (${kind}): ${e1.message}`);
    }
    // promote AND sign in one update — the current_signed_check refuses the pair coming apart
    const { error: e2 } = await supabase.from("first_read_slots")
      .update({ is_current: true, signed_at: new Date().toISOString(), signed_by: signedBy, sign_note: signNote ?? null })
      .eq("id", staged.id);
    if (e2) throw new Error(`promote-staged-slot failed (${kind}): ${e2.message}`);

    // VS2: AFTER the flip, and it cannot fail it. The signature is the act; the row is the record of
    // the act, and a record that can undo what it records is worse than no record. Until this ruling
    // a signature left no integrity row at all — the slot's own signed_at/signed_by were the only
    // trace, which guard s5 checks but no audit could reconstruct.
    await recordSignature(supabase, {
      companyId, kind, slotId: staged.id, sourceReadId: staged.source_read_id ?? null,
      signedBy, criterionVersion: staged.criterion_version ?? null, status: "completed",
      supersededSlotId: priorId,
    });
    promoted.push({ kind, staged: staged.id, superseded: priorId });
  }
  return { promoted };
}

/** REJECT: mark a staged slot superseded so it can never be promoted, without making it current. */
export async function rejectStagedSlots(
  supabase: AnySupabase, companyId: string, kinds: readonly string[], reason = "operator_rejected",
): Promise<{ rejected: Array<{ kind: string; slot: string }> }> {
  const rejected: Array<{ kind: string; slot: string }> = [];
  for (const kind of kinds) {
    const staged = await stagedSlotFor(supabase, companyId, kind);
    if (!staged) continue;
    const { error } = await supabase.from("first_read_slots")
      .update({ superseded_at: new Date().toISOString(), superseded_reason: reason })
      .eq("id", staged.id);
    if (error) throw new Error(`reject-staged-slot failed (${kind}): ${error.message}`);
    rejected.push({ kind, slot: staged.id });
  }
  return { rejected };
}


/**
 * VS2 (operator ruling, 2026-10-14): ONE integrity row per signature — taken or refused.
 *
 * Never throws. An accounting failure must not undo a signature that already happened, so every
 * error is swallowed here exactly as recordModelCall swallows its own: the act is the truth, the row
 * is the record, and a record that can fail the act is a liability.
 */
async function recordSignature(supabase: AnySupabase, a: {
  companyId: string; kind: string; slotId: string; sourceReadId: string | null;
  signedBy: string; criterionVersion: string | null;
  status: "completed" | "rejected"; detail?: string; supersededSlotId?: string | null;
}): Promise<void> {
  try {
    await supabase.from("integrity_runs").insert({
      company_id: a.companyId,
      component: `first_read_slot_signed_${a.kind}`,
      ran_at: new Date().toISOString(),
      status: a.status,
      examined: 1,
      admitted: a.status === "completed" ? 1 : 0,
      excluded_by_rule: {
        act: a.status === "completed" ? "slot_signed" : "slot_sign_refused",
        kind: a.kind,
        slot_id: a.slotId,
        source_read_id: a.sourceReadId,
        signed_by: a.signedBy,
        criterion_version: a.criterionVersion,
        superseded_slot_id: a.supersededSlotId ?? null,
        detail: a.detail ?? null,
        reversal_sql: a.status === "completed"
          ? `update public.first_read_slots set is_current=false, signed_at=null, signed_by=null, superseded_at=now(), superseded_reason='operator_rejected' where id='${a.slotId}';`
          : null,
        reversal_note: a.status === "completed"
          ? "Unsigns the slot and takes it out of the current set, returning the beat to the full read. It does NOT restore a slot this signature superseded — reset that row's superseded_at/superseded_reason explicitly if it should come back."
          : "Nothing to reverse: the signature was refused before any write.",
      },
    });
  } catch { /* the record must never be able to fail the act it records */ }
}