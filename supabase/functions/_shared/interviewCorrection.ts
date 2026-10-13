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
  raw_payload: {
    origin: "interview_correction";
    interview_item_id: string;
    interview_record_id: string;
    /** The client's own words as the parser cut them — kept beside the operator's wording, never instead of it. */
    item_raw_words: string;
    speaker_label: string | null;
    attested_at: string | null;
    person_name: string | null;
  };
};

/** The claim a given correction item mints. Pure: same item in, same row out. */
export function correctionClaimFor(args: {
  companyId: string;
  item: { id: string; interview_record_id: string; raw_words: string; speaker_label: string | null };
  /** The interview's date, for the "You told us · {name} · {date}" frame. */
  attestedAt: string | null;
  personName: string | null;
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
      item_raw_words: args.item.raw_words,
      speaker_label: args.item.speaker_label,
      attested_at: args.attestedAt,
      person_name: args.personName,
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
