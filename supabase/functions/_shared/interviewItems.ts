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

export const ITEM_KINDS = ["job", "pain_point", "desire", "outcome", "route", "step", "positioning", "cascade"] as const;
export const FRAMEWORK_FORMS = ["odi_need", "job_statement", "route", "step", "positioning", "cascade"] as const;
export const TRACE_STATES = ["located", "not_located"] as const;
export const LANDINGS = ["market", "step", "unplaced"] as const;
export const REVIEW_STATES = ["unreviewed", "reviewed"] as const;
export const JUDGE_STATES = ["accepted", "annotated"] as const;

export type ItemKind = (typeof ITEM_KINDS)[number];
export type FrameworkForm = (typeof FRAMEWORK_FORMS)[number];
export type TraceState = (typeof TRACE_STATES)[number];
export type Landing = (typeof LANDINGS)[number];
export type ReviewState = (typeof REVIEW_STATES)[number];
export type JudgeState = (typeof JUDGE_STATES)[number];

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
