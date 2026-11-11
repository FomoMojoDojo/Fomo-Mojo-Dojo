// ── Act 1 (signed 2026-10-08): the correction writer's pure core ─────────────────────────────────
//
// A client's FACT CORRECTION had no home. record-interview-finding is the ODI path: it demands a
// direction verb and a job step, so Lynn's "we're no longer level 14" could only be filed as an
// 'ask'. Act 1 gives the correction its own kind and this writer gives it its one destination: ONE
// claims row, provenance client_attested, statement = the OPERATOR'S wording verbatim.
//
// Three laws shape every line here:
//
//   OPTION B WALL. A client_attested claim is client-provided material and never reaches an external
//   model. This writer therefore makes NO model call of any kind — not local, not external. There is
//   nothing to judge: the statement is the operator's own words, typed by the operator. (The wall is
//   also enforced structurally downstream: client_attested is absent from PUBLIC_PROVENANCES
//   (publicReadGuards.ts:79), so resolveModel routes any input set containing one to local_ollama,
//   and isObservedAdmissible (claimDeltaSynthesis.ts:254) refuses it from the observed pool.)
//
//   PUBLIC-ONLY BASE. The First Read base is public-only, so this claim must never enter public-read
//   inputs. Nothing here writes to signals, own_words_candidates or public_reads; the claim's only
//   register is the say side.
//
//   EVERY DATA ACT IS AUDITED. One integrity_runs row per write, carrying the reversal SQL, so the
//   act can be undone from its own audit row without reading this file.
//
// DRY RUN IS THE DEFAULT. The handler writes only when the caller passes write:true; every other
// shape — including a bare {} — reports the row it WOULD write and touches nothing.

/** The operator's wording, verbatim and frozen. Act 1 mints this statement and no other. */
export const CORRECTION_STATEMENT =
  "Level 14 is retired terminology; the current California designation is STRTP (AB 403)." as const;

export const CORRECTION_PROVENANCE = "client_attested" as const;
/** 'observation' is the claim_type for a statement of fact about the record. */
export const CORRECTION_CLAIM_TYPE = "observation" as const;
/** The say side's state. A correction is the company's own account, not an outside reading. */
export const CORRECTION_STATE = "diagnose" as const;

export type CorrectionClaimRow = {
  company_id: string;
  statement: string;
  provenance: typeof CORRECTION_PROVENANCE;
  claim_type: typeof CORRECTION_CLAIM_TYPE;
  state: typeof CORRECTION_STATE;
  status: "active";
  confidence: "high";
  topic: null;
  // U6-20 / U6-27: ids and the date only. item_raw_words, speaker_label and person_name were removed
  // on 2026-11-10 — `claims` carries a company_members arm, so anything here is member-readable, and
  // the words and the speaker are interview text. They come from interview_item_text now.
  raw_payload: {
    origin: "interview_correction";
    /** The tier-2 key the chip uses to ask for the words and the speaker. */
    interview_item_id: string;
    interview_record_id: string;
    attested_at: string | null;
  };
};

/** The claim a given correction item mints. Pure: same item in, same row out. */
/**
 * U6-20 / U6-27 (operator rulings, signed 2026-11-10) — THE PAYLOAD CARRIES NO WORDS AND NO NAME.
 *
 * This used to stamp item_raw_words, speaker_label and person_name onto the minted claim. `claims`
 * carries a company_members arm, so every one of those put interview content in a table any member of
 * the company can read — measured on Edgewood 2026-11-10, a member read a real meeting utterance and
 * the name of the person who said it. RLS is row-level and the quote sat inside a jsonb column, so no
 * policy or column grant could reach it; the only fix is to stop writing it.
 *
 * What stays: interview_item_id and interview_record_id (ids, not quotes — and the first is the key
 * the chip's tier-2 read uses) and attested_at (the date the chip shows even when the name is
 * withheld, S-U6-4). The words and the speaker are served by interview_item_text(item_id), gated on
 * interview.readText.
 *
 * `item` keeps its raw_words / speaker_label fields: the caller already has the row and the refusal
 * path reads them. They are simply not copied into the claim.
 */
export function correctionClaimFor(args: {
  companyId: string;
  item: { id: string; interview_record_id: string; raw_words: string; speaker_label: string | null };
  /** The interview's date — the one half of the "You told us" frame that is not interview text. */
  attestedAt: string | null;
}): CorrectionClaimRow {
  return {
    company_id: args.companyId,
    statement: CORRECTION_STATEMENT,
    provenance: CORRECTION_PROVENANCE,
    claim_type: CORRECTION_CLAIM_TYPE,
    state: CORRECTION_STATE,
    status: "active",
    confidence: "high",
    topic: null,
    raw_payload: {
      origin: "interview_correction",
      interview_item_id: args.item.id,
      interview_record_id: args.item.interview_record_id,
      attested_at: args.attestedAt,
    },
  };
}

/** IDEMPOTENCY (on the item id, not the statement): the writer mints at most one claim per item. */
export function existingClaimIdFor(
  rows: ReadonlyArray<{ id: string; raw_payload?: unknown }>,
  itemId: string,
): string | null {
  for (const r of rows) {
    const rp = r.raw_payload && typeof r.raw_payload === "object" ? (r.raw_payload as Record<string, unknown>) : null;
    if (rp?.origin === "interview_correction" && rp?.interview_item_id === itemId) return r.id;
  }
  return null;
}

/** The reversal an audit row carries, so the act is undoable from the ledger alone. */
export function reversalSqlFor(claimId: string): string {
  return `delete from public.claims where id = '${claimId}';`;
}

export const AUDIT_COMPONENT = "interview_correction_claim" as const;
