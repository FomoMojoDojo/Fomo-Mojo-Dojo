// ── The interview items store — the ONE module that names the table ───────────────────────────────
//
// Census law (interviewItems.census.test.ts, the marks-census idiom): only this file, the parser's
// own directory and the migrations may name `interview_items`. A page, a public-register writer, an
// external prompt builder or a corpus loader that reaches for it fails the census — rule 4, "public
// register and external writers never read items; local generators may".
//
// Nothing here reads or writes: this commit is storage, types and identity only. The reader/writer
// arrives with the parser itself.
import { normalizeForHash, sha256Hex } from "./contentIdentity.ts";

/** The table, named once. Every caller takes it from here rather than spelling it. */
export const INTERVIEW_ITEMS_TABLE = "interview_items";
/** R-A1 (2026-10-12): the operator's reclassification record, named once, same rule. */
export const INTERVIEW_ITEM_KIND_OVERRIDES_TABLE = "interview_item_kind_overrides";

/** R4 (operator review, 2026-09-23): `ask` and `hypothesis` join the eight. Neither converts yet —
 *  both land with their raw words, framework_form NULL and a reason naming the kind.
 *  Act 1 (signed 2026-10-08): `correction` joins them — a client statement that the RECORD is wrong.
 *  It converts no further than its own claim: record-interview-correction mints one client_attested
 *  claim from it and never calls a model. */
export const ITEM_KINDS = ["job", "pain_point", "desire", "outcome", "route", "step", "positioning", "cascade", "ask", "hypothesis", "correction"] as const;
/** The kinds that carry raw words and no framework_form. */
export const RECORDED_KINDS = ["ask", "hypothesis", "correction"] as const;
export const FRAMEWORK_FORMS = ["odi_need", "job_statement", "route", "step", "positioning", "cascade"] as const;
export const TRACE_STATES = ["located", "not_located"] as const;
export const LANDINGS = ["market", "step", "unplaced"] as const;
export const REVIEW_STATES = ["unreviewed", "reviewed"] as const;
export const JUDGE_STATES = ["accepted", "annotated"] as const;
/** R5 (operator ruling, 2026-09-23): whose side of the room said it. Derived AT LANDING from the
 *  record's our_speakers as they stood at that moment; never in the content identity, so R7's
 *  retract-and-re-land shows the SAME identity landing twice rather than two different items. */
export const SPEAKER_SIDES = ["client", "ours"] as const;
/** R5 (operator review, 2026-09-23): what the item is ABOUT. market = donors, funders, the outside
 *  world; internal = Edgewood's own organization, team or process. Assigned by the finder, checked by
 *  the judge, and — like speaker_side — never in the content identity. */
export const SCOPES = ["market", "internal"] as const;

export type ItemKind = (typeof ITEM_KINDS)[number];
export type FrameworkForm = (typeof FRAMEWORK_FORMS)[number];
export type TraceState = (typeof TRACE_STATES)[number];
export type Landing = (typeof LANDINGS)[number];
export type ReviewState = (typeof REVIEW_STATES)[number];
export type JudgeState = (typeof JUDGE_STATES)[number];
export type SpeakerSide = (typeof SPEAKER_SIDES)[number];
export type Scope = (typeof SCOPES)[number];

/** The code-computed pointer (rule 2). The model never supplies any of these. */
export type ItemPointer = {
  /** Which speaker turn the passage sits in, 0-based. */
  turn_index: number;
  /** Inclusive line range within the record's stored text, 0-based. */
  line_start: number;
  line_end: number;
  /** sha256 of the passage as the code cut it — what trace re-checks. */
  passage_sha256: string;
};

export type InterviewItem = {
  id: string;
  company_id: string;
  interview_record_id: string;
  journey_key: string | null;
  kind: ItemKind;
  raw_words: string;
  speaker_label: string | null;
  speaker_side: SpeakerSide;
  scope: Scope;
  framework_statement: string | null;
  framework_form: FrameworkForm | null;
  pointer: ItemPointer;
  record_text_sha256: string;
  trace_state: TraceState;
  landing: Landing;
  placement: Record<string, unknown> | null;
  review_state: ReviewState;
  validated: boolean;
  judge_state: JudgeState;
  judge_reason: string;
  parse_level: string | null;
  rules_version: string;
  content_identity: string;
  created_at: string;
  retracted_at: string | null;
  retracted_reason: string | null;
};

/** R5: an item spoken by our own side lands with its words and its pointer and nothing derived — no
 *  converter runs, no judge call is spent, and this is the reason it carries. */
export const OURS_SIDE_REASON = "spoken by our side";

/** R4: the reason an ask or a hypothesis carries — it names the kind, so the row says why it has no
 *  statement rather than looking like a conversion that failed. */
export const NO_CONVERTER_REASON = (kind: ItemKind): string => `${kind} items are recorded, not converted`;
/** R9: the later of two near-duplicate statements on one record keeps its row and says which. */
export const NEAR_DUPLICATE_REASON = (otherId: string): string => `near-duplicate of ${otherId}`;

/**
 * The identity a landing is keyed by (rule 5): the KIND, the normalized raw words, and the passage's
 * own sha. Two parses of the same transcript produce the same identity for the same passage, so the
 * second is a no-op rather than a duplicate; a different passage saying the same words is a DIFFERENT
 * item, because the pointer's sha is in the hash.
 */
export async function itemContentIdentity(args: {
  kind: ItemKind;
  raw_words: string;
  passage_sha256: string;
}): Promise<string> {
  const normalized = normalizeForHash(args.raw_words);
  return await sha256Hex(`interviewitem|${args.kind}|${normalized}|${args.passage_sha256}`);
}

// ── Act 1 (signed 2026-10-08): the ONE read a correction writer gets ─────────────────────────────
//
// record-interview-correction must check that the item exists, belongs to the company, is kind
// 'correction' and is not retracted — four facts that live on this table. Rather than widen the
// census wall to a second function directory, the read lives HERE, in the module the wall already
// sanctions. The writer imports this and never spells the table, so interviewItems.census.test.ts
// keeps exactly the four allowances it had before Act 1.
//
// Returns a discriminated result, never throws: the caller turns `refused` into its own 4xx before
// any write happens.
export type CorrectionItemRefusal =
  | "item_not_found"
  | "wrong_company"
  | "not_a_correction"
  | "retracted";

export type CorrectionItemRow = {
  id: string;
  company_id: string;
  interview_record_id: string;
  /** the PARSER's kind, untouched at landing */
  kind: string;
  /** the landing an override is keyed against */
  content_identity: string;
  raw_words: string;
  speaker_label: string | null;
  retracted_at: string | null;
};

export type CorrectionItemLookup =
  | { ok: true; item: CorrectionItemRow; effective: EffectiveKind }
  | { ok: false; refusal: CorrectionItemRefusal; detail: string };

// deno-lint-ignore no-explicit-any
type AnySupabase = { from: (t: string) => any };

/** R-A1 — THE ONE RESOLVER. An item's effective kind is the parser's kind unless the operator
 *  overrode it for THIS landing, in which case the override wins.
 *
 *  Keyed on (item id, content_identity) together, not on the id alone: the identity is what the
 *  decision was made against. If a re-parse ever lands the same item with a different identity, no
 *  override matches and the parser's kind is in force again — the correct failure, because a
 *  decision about one landing is not a decision about a different one.
 *
 *  LATEST DECIDED WINS. The table is append-only, so a mistaken override is corrected by appending a
 *  newer decision; the newest row for the identity is therefore the one in force. There is
 *  deliberately no SQL view or function doing this: one rule, one authority.
 *
 *  R-A4 (2026-10-12) — A NULL to_kind IS THE UNDO. It means "no override, the parser's kind stands",
 *  so appending one reverses an earlier override without editing or deleting anything. The newest
 *  row still wins; it just resolves back to the parser's kind. `overridden` is therefore false for a
 *  NULL row — nothing is in force — while `override` still names the decision that said so, because
 *  "the operator deliberately undid this" and "nobody ever decided" are different facts.
 */
export type EffectiveKind = {
  kind: string;
  /** true when an override is in force for this exact landing (a NULL undo is NOT in force). */
  overridden: boolean;
  /** the latest decision for this landing, even when that decision was an undo (to_kind null). */
  override: { id: string; from_kind: string; to_kind: string | null; reason: string; decided_by: string; decided_at: string } | null;
};

export async function effectiveItemKind(
  supabase: AnySupabase,
  args: { itemId: string; contentIdentity: string; parserKind: string },
): Promise<EffectiveKind> {
  const { data } = await supabase.from(INTERVIEW_ITEM_KIND_OVERRIDES_TABLE)
    .select("id, from_kind, to_kind, reason, decided_by, decided_at")
    .eq("interview_item_id", args.itemId)
    .eq("content_identity", args.contentIdentity)
    .order("decided_at", { ascending: false })
    .limit(1);
  const rows = (data ?? []) as Array<{ id: string; from_kind: string; to_kind: string | null; reason: string; decided_by: string; decided_at: string }>;
  const o = rows[0] ?? null;
  if (!o) return { kind: args.parserKind, overridden: false, override: null };
  // R-A4: the latest decision was an UNDO — the parser's kind is in force again, and we say WHICH
  // decision put it back rather than pretending no decision was ever made.
  if (o.to_kind === null) return { kind: args.parserKind, overridden: false, override: o };
  return { kind: o.to_kind, overridden: true, override: o };
}

/** Load one item and decide whether a correction may be minted from it. No write, no model.
 *  The kind it checks is the EFFECTIVE kind (effectiveItemKind), never the parser column alone —
 *  R-A1's whole point is that the operator's reclassification is what is in force. */
export async function loadCorrectionItem(
  supabase: AnySupabase,
  companyId: string,
  itemId: string,
): Promise<CorrectionItemLookup> {
  const { data } = await supabase.from(INTERVIEW_ITEMS_TABLE)
    .select("id, company_id, interview_record_id, kind, content_identity, raw_words, speaker_label, retracted_at")
    .eq("id", itemId).maybeSingle();
  const row = (data ?? null) as CorrectionItemRow | null;
  if (!row) return { ok: false, refusal: "item_not_found", detail: `no interview item ${itemId}` };
  if (row.company_id !== companyId) return { ok: false, refusal: "wrong_company", detail: `item ${itemId} belongs to another company` };
  if (row.retracted_at) return { ok: false, refusal: "retracted", detail: `item ${itemId} was retracted at ${row.retracted_at}` };
  const eff = await effectiveItemKind(supabase, {
    itemId, contentIdentity: row.content_identity, parserKind: row.kind,
  });
  if (eff.kind !== "correction") {
    return {
      ok: false, refusal: "not_a_correction",
      detail: eff.overridden
        ? `item ${itemId} resolves to kind '${eff.kind}' (overridden from '${row.kind}'), not 'correction'`
        : `item ${itemId} is kind '${row.kind}', not 'correction' — and no operator override is in force for this landing`,
    };
  }
  return { ok: true, item: row, effective: eff };
}
