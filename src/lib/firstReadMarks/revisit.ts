// The revisit fire rule (commit 4 of 4, ruling FM12 revised, 2026-09-22). Pure — no store, no page, no clock.
//
// R4: a mark is listed in the prompt when matchAnchor ≠ match AND the current state differs from what the
// operator last kept it against. So:
//   • a row whose wording matches            → silent, always
//   • a changed row never resolved           → fires (wording_changed)
//   • a changed row kept against THIS text   → silent
//   • a changed row kept against older text  → fires again (it changed a second time)
//   • a vanished row never resolved          → fires (row_gone)
//   • a vanished row kept against row_gone   → silent
//   • a vanished row kept against some sha   → fires (it was kept while present, and has since left)
//
// R7: the classification runs on normalizeForHash(text) on both sides — the stored sha256 is the tiebreak only,
// used when the current row's words are not derivable from the read (a null text: section / group / an offering
// question). A null text is never a mismatch: static copy cannot drift from a data change.
// Until the read has loaded, callers pass loaded=false and NOTHING fires (the prompt never flashes).
import { normalizeForHash } from "../../../supabase/functions/_shared/contentIdentity.ts";
import { matchAnchor, type AnchorMatch } from "./anchors";
import type { CurrentAnchor } from "./currentAnchors";
import type { LiveMark } from "./useFirstReadMarks";
import { anchorId } from "./useFirstReadMarks";

/** The literal stored in revisit_resolved_against when the row had already left the read. */
export const ROW_GONE = "row_gone";

/** What the prompt shows for one mark: why it fired, and the row's words now (null when it has none). */
export type RevisitEntry = {
  mark: LiveMark;
  state: Exclude<AnchorMatch, "match">;
  /** The row's current text — present only for wording_changed. */
  currentText: string | null;
  /** What a Keep on this entry records: the current row's sha256, or the literal row_gone. */
  against: string;
};

/** A current row, already hashed where its text was derivable. */
export type HashedAnchor = CurrentAnchor & { sha: string | null };

/**
 * Classify ONE mark against the rows on the page now.
 * Returns null when the mark is silent (a match, or already resolved against this very state).
 */
export function revisitEntryFor(mark: LiveMark, byId: ReadonlyMap<string, HashedAnchor>): RevisitEntry | null {
  const row = byId.get(anchorId(mark.anchor_kind, mark.anchor_key));
  if (!row) {
    // The row has left the read. Silent only when that is exactly what was kept against.
    return mark.revisit_resolved_against === ROW_GONE
      ? null
      : { mark, state: "row_gone", currentText: null, against: ROW_GONE };
  }
  // Words not derivable (static copy, or a kind keyed by its own text hash) — never a mismatch.
  if (row.text === null || row.sha === null) return null;
  const state: AnchorMatch = matchAnchor(
    { anchor_kind: mark.anchor_kind, anchor_key: mark.anchor_key, sha: mark.anchor_text_sha256 },
    [{ anchor_kind: row.anchor_kind, anchor_key: row.anchor_key, sha: row.sha }],
  );
  if (state === "match") return null;
  // R7: the normalized words are the authority; a hash that disagrees with them would be a mint-time bug.
  if (normalizeForHash(row.text) === normalizeForHash(mark.anchor_text)) return null;
  if (mark.revisit_resolved_against === row.sha) return null; // kept against exactly this wording
  return { mark, state: "wording_changed", currentText: row.text, against: row.sha };
}

/**
 * Every mark that the prompt must ask about, in the marks' given order (the caller sorts by beat).
 * `loaded` false ⇒ nothing fires, so the prompt cannot flash before the read arrives (R7).
 */
export function revisitEntries(
  marks: readonly LiveMark[],
  rows: readonly HashedAnchor[],
  loaded: boolean,
): RevisitEntry[] {
  if (!loaded) return [];
  const byId = new Map<string, HashedAnchor>();
  for (const r of rows) {
    const k = anchorId(r.anchor_kind, r.anchor_key);
    if (!byId.has(k)) byId.set(k, r); // first row of a key wins, as matchAnchor's filter would
  }
  const out: RevisitEntry[] = [];
  for (const m of marks) {
    const e = revisitEntryFor(m, byId);
    if (e) out.push(e);
  }
  return out;
}
