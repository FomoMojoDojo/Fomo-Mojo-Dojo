// First-read marks — the ANCHOR helper (commit 1 of 4; rulings FM12, FM14, FM15, signed 2026-09-21). Pure.
//
// A mark attaches to ONE row (or one stable group) of the live first read. The anchor is frozen at creation:
// { anchor_kind, anchor_key, anchor_text, sha } where sha = sha256(normalizeForHash(anchor_text)) — the SAME
// normalization + hash the content-identity authority uses (supabase/functions/_shared/contentIdentity.ts), so a
// mark's hash and a row's identity can never drift apart. On a revisit the reader classifies the mark against the
// rows it can see: match (key + hash) · wording_changed (key only) · row_gone (no key). Nothing here reads or
// writes the store; the census test (FM13 option A) keeps every reader inside src/lib/firstReadMarks/.
//
// Keys per row kind (the two inventory reports, 2026-09-21):
//   signal            signals.id                       (What the world sees; cold-open fallback)
//   own_words         claims.id                        (What you say — In your words)
//   channel_claim     claims.id                        (What you say — Your channels)
//   gap_statement     claims.id (statementId)          (The gap — statement rows)
//   gap_pair          claim_deltas.content_identity    (The gap — evidence pairs; the override key)
//   reverse_row       claim_deltas.id                  (The gap — Raised by the record)
//   finding           findings.id                      (What stands out)
//   finding_quote     findings.id + ":" + signals.id   (a supporting quote under a finding)
//   cold_open_pointer claim_deltas.content_identity    (the featured cold open)
//   cold_open_line    the ladder rung kind             (a signed cold-open line: conflict | echo_gap)
//   market            odi_market_definitions.journey_key (Who you serve — FM14: never the row id, research-company reinserts)
//   candidate_group   market_candidate_outcomes.original_identity (Other groups we saw — FM14: never the per-run id)
//   question          first_read_open_questions.question_identity (FM15)
//   offering_question "offering:" + sha of the text    (a question carried by the offering payload)
//   status_conflict   first_read_open_questions.question_identity of the conflict row
//   read_field        <read>:<field>[:<index>]         (promise / positioning / strategy / offering payload items — FM12: field + index + text hash)
//   score_value       "score"                          (FM14: the Mojo Score value as rendered; the bands stay non-markable)
//   section           the beat key                     (a whole beat, text = its headline; every beat except the static screens
//                                                       arc · cold · siesta1 · siesta2 · next · base · score)
//   group             <beat>:<block>                   (FM15: only yousay:channels · gap:reverse · serve:unstated — the blocks that
//                                                       hold rows of their own; ownership groups (offer own-site, own-words fidelity,
//                                                       serve:observed) are ruled out)
// Non-markable (return null): Base elements, score bands, every sort-derived group (record tiers, gap verdict runs,
// findings shown/all, question halves), the ruled-out groups above, and the static-screen sections.
import { normalizeForHash, sha256Hex } from "../../../supabase/functions/_shared/contentIdentity.ts";

export type AnchorKind =
  | "signal" | "own_words" | "channel_claim" | "gap_statement" | "gap_pair" | "reverse_row"
  | "finding" | "finding_quote" | "cold_open_pointer" | "cold_open_line"
  | "market" | "candidate_group" | "question" | "offering_question" | "status_conflict"
  | "read_field" | "score_value" | "section" | "group";

export type MarkAnchor = { anchor_kind: AnchorKind; anchor_key: string; anchor_text: string; sha: string };

/** The one hash rule: sha256 of normalizeForHash(text) — identical to the content-identity authority. */
export async function hashAnchorText(text: string): Promise<string> {
  return sha256Hex(normalizeForHash(text));
}

/** Every markable row / group on the live first read, by its stable key. */
export type MarkableRow =
  | { kind: "signal"; id: string; text: string }
  | { kind: "own_words"; id: string; text: string }
  | { kind: "channel_claim"; id: string; text: string }
  | { kind: "gap_statement"; statementId: string; text: string }
  | { kind: "gap_pair"; contentIdentity: string | null; text: string }
  | { kind: "reverse_row"; id: string; text: string }
  | { kind: "finding"; id: string; text: string }
  | { kind: "finding_quote"; findingId: string; signalId: string; text: string }
  | { kind: "cold_open_pointer"; contentIdentity: string; text: string }
  | { kind: "cold_open_line"; rung: "conflict" | "echo_gap"; text: string }
  | { kind: "market"; journeyKey: string | null; text: string }
  | { kind: "candidate_group"; originalIdentity: string | null; text: string }
  | { kind: "question"; questionIdentity: string; text: string }
  | { kind: "offering_question"; text: string }
  | { kind: "status_conflict"; questionIdentity: string; text: string }
  | { kind: "read_field"; read: "promise" | "positioning" | "strategy" | "offering"; field: string; index?: number; text: string }
  | { kind: "score_value"; text: string }
  | { kind: "section"; beat: string; text: string }
  | { kind: "group"; beat: string; block: string; text: string }
  // non-markable kinds — always null
  | { kind: "base_element"; text: string }
  | { kind: "score_band"; text: string }
  | { kind: "derived_group"; text: string };

/** FM15: the only markable groups — blocks with rows of their own. */
const STABLE_GROUPS: ReadonlySet<string> = new Set(["yousay:channels", "gap:reverse", "serve:unstated"]);
/** The static screens — never a markable section. */
const STATIC_BEATS: ReadonlySet<string> = new Set(["arc", "cold", "siesta1", "siesta2", "next", "base", "score"]);

/** Build the anchor for a row, or null when the row has no durable key (or is not markable). */
export async function buildAnchor(row: MarkableRow): Promise<MarkAnchor | null> {
  const text = (row.text ?? "").trim();
  const make = async (anchor_kind: AnchorKind, key: string | null | undefined): Promise<MarkAnchor | null> => {
    const anchor_key = (key ?? "").trim();
    if (!anchor_key || !text) return null;
    return { anchor_kind, anchor_key, anchor_text: text, sha: await hashAnchorText(text) };
  };
  switch (row.kind) {
    case "signal": case "own_words": case "channel_claim": case "reverse_row": case "finding":
      return make(row.kind, row.id);
    case "gap_statement": return make("gap_statement", row.statementId);
    case "gap_pair": return make("gap_pair", row.contentIdentity);
    case "finding_quote": return row.findingId && row.signalId ? make("finding_quote", `${row.findingId}:${row.signalId}`) : null;
    case "cold_open_pointer": return make("cold_open_pointer", row.contentIdentity);
    case "cold_open_line": return make("cold_open_line", row.rung);
    case "market": return make("market", row.journeyKey);
    case "candidate_group": return make("candidate_group", row.originalIdentity);
    case "question": return make("question", row.questionIdentity);
    case "offering_question": return text ? make("offering_question", `offering:${await hashAnchorText(text)}`) : null;
    case "status_conflict": return make("status_conflict", row.questionIdentity);
    case "read_field": {
      if (!row.field.trim()) return null;
      const index = row.index == null ? "" : `:${row.index}`;
      return make("read_field", `${row.read}:${row.field.trim()}${index}`);
    }
    case "score_value": return make("score_value", "score");
    case "section": {
      const beat = row.beat.trim();
      return beat && !STATIC_BEATS.has(beat) ? make("section", beat) : null;
    }
    case "group": {
      const key = `${row.beat}:${row.block}`;
      return STABLE_GROUPS.has(key) ? make("group", key) : null;
    }
    case "base_element": case "score_band": case "derived_group":
      return null;
  }
}

export type AnchorMatch = "match" | "wording_changed" | "row_gone";
/** A row as the reader sees it now, already hashed with hashAnchorText. */
export type CurrentRow = { anchor_kind: AnchorKind; anchor_key: string; sha: string };

/** Classify a stored anchor against the rows currently on the page (same kind + key → match by hash). */
export function matchAnchor(anchor: Pick<MarkAnchor, "anchor_kind" | "anchor_key" | "sha">, current: readonly CurrentRow[]): AnchorMatch {
  const same = current.filter((r) => r.anchor_kind === anchor.anchor_kind && r.anchor_key === anchor.anchor_key);
  if (same.length === 0) return "row_gone";
  return same.some((r) => r.sha === anchor.sha) ? "match" : "wording_changed";
}

/** The offering-question keys for a list of texts ("offering:<sha>"), in order — for the view's async fill. */
export async function offeringQuestionKeys(texts: readonly string[]): Promise<string[]> {
  return Promise.all(texts.map(async (t) => `offering:${await hashAnchorText(t)}`));
}
