// ── N4: READ FEEDBACK, DETECTED IN CODE (operator ruling, 2026-09-24) ────────────────────────────
//
// Pure. No I/O, no model. Given the company's CURRENT first-read text and an item's words, decide
// whether the speaker is reading our document back at us.
//
// WHY THIS IS CODE AND NOT A PROMPT. 4d asked the finder to notice a reaction to the read and gave it
// a regular expression of tell-tale phrases ("the first read", "that paragraph", "on screen"). Turn
// 226 of Edgewood's kickoff carries neither: the speaker simply reads two lines of our own strategy
// aloud and says what they think of them. Measured, the passage produced two pain_points — "high
// family placement retention" and "maintaining strong government payer relationships" — which are not
// the client's needs at all, they are OUR SENTENCES quoted back. The one signal that actually
// separates them is that the words are ours, verbatim, and that is a thing a machine can check.
//
// THE TEST is a shared run of READ_OVERLAP_WORDS normalized words. Normalization matters and is not a
// detail: the current strategy read stores "high family-placement retention" hyphenated, so a raw
// substring search finds nothing while the speaker is plainly reading that very line. Punctuation goes,
// case goes, whitespace collapses, and what is compared is the word sequence.
import { READ_OVERLAP_WORDS } from "./rules.ts";

/** The words of a text, lowercased, punctuation dropped. The unit N4 counts. */
export function normalizedWords(text: string): string[] {
  return String(text ?? "").toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

/** Every run of `n` consecutive words in `words`, joined by single spaces. */
export function ngrams(words: readonly string[], n = READ_OVERLAP_WORDS): string[] {
  if (n <= 0 || words.length < n) return [];
  const out: string[] = [];
  for (let i = 0; i + n <= words.length; i++) out.push(words.slice(i, i + n).join(" "));
  return out;
}

/** Keys of a public_reads payload that are NOT the read's prose: citation id lists, and the internal
 *  copy of the source cascade. Nobody reads either on the page, so neither can be quoted back. */
export const NON_PROSE_KEYS = new Set(["cascade_source"]);
const isCitationKey = (k: string): boolean => k.endsWith("_citations");

/** Every string leaf of a payload that the client actually reads, in document order. */
export function prosePartsOf(payload: unknown): string[] {
  const out: string[] = [];
  const walk = (node: unknown, key: string | null) => {
    if (node === null || node === undefined) return;
    if (typeof node === "string") { if (node.trim()) out.push(node); return; }
    if (Array.isArray(node)) { for (const v of node) walk(v, key); return; }
    if (typeof node === "object") {
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        if (isCitationKey(k) || NON_PROSE_KEYS.has(k)) continue;
        walk(v, k);
      }
    }
  };
  walk(payload, null);
  return out;
}

/** The index N4 tests against: every n-gram of every current read the company holds. */
export function buildReadIndex(payloads: readonly unknown[], n = READ_OVERLAP_WORDS): Set<string> {
  const index = new Set<string>();
  for (const payload of payloads) {
    for (const part of prosePartsOf(payload)) {
      for (const g of ngrams(normalizedWords(part), n)) index.add(g);
    }
  }
  return index;
}

/** The FIRST run of `n` words these raw words share with the read, or null when they share none.
 *  Returned rather than a boolean so the run row can record what was matched. */
export function sharedReadRun(rawWords: string, index: ReadonlySet<string>, n = READ_OVERLAP_WORDS): string | null {
  if (index.size === 0) return null;
  for (const g of ngrams(normalizedWords(rawWords), n)) if (index.has(g)) return g;
  return null;
}

// ── N21: THE CODE CAPTURE (operator ruling, 2026-09-24) ─────────────────────────────────────────
//
// Pure. Given a turn's words, its two predecessors and the read index, decide whether this is a read
// reaction — without asking a model anything.
//
// WHY IT EXISTS. Three prompt attempts failed to make the finder notice these turns, and the last one
// (N17(b)) SUPPRESSED turn 226, the archetypal reaction it was written to catch. The signal was never
// in the finder's reach: either the client quotes our read (route a) or the thing they are answering
// is in OUR preceding turn (route b). Both are visible in the transcript, so the code takes them.
//
// THE FLOOR. A turn under N21_MIN_TURN_WORDS words is not a reaction, it is an acknowledgement —
// "yeah", "right", "okay, sure". Without the floor route (b) would capture every back-channel that
// happens to follow one of our turns.
import { N21_MIN_TURN_WORDS, type N21Route } from "./rules.ts";

/** A turn or passage carries its own speaker header on the first line ("Ada Lovelace | 00:01"). That
 *  is the transcript's furniture, not the speaker's words: it must not be counted toward N21's floor
 *  (it added 5 words and let a two-word back-channel clear a six-word bar), it must not be compared
 *  against the read, and it must never be stored as raw_words. */
export function stripSpeakerHeader(text: string): string {
  const lines = String(text ?? "").split("\n");
  const rest = /\|\s*\d{1,2}:\d{2}/.test(lines[0] ?? "") ? lines.slice(1) : lines;
  return rest.join("\n").trim();
}

/** How many words a turn carries, by the same normalization the overlap test uses. Header excluded. */
export const turnWordCount = (text: string): number => normalizedWords(stripSpeakerHeader(text)).length;

/**
 * Which N21 route catches this turn, or null. `precedingOurTurnsQuoteRead` says whether either of the
 * two turns before it was one of OURS that quotes the read — the caller knows the sides, so it is
 * passed in rather than re-derived here.
 */
export function n21Route(args: {
  turnText: string;
  index: ReadonlySet<string>;
  precedingOurTurnQuotesRead: boolean;
  overlapWords?: number;
}): N21Route | null {
  const body = stripSpeakerHeader(args.turnText);
  if (turnWordCount(body) < N21_MIN_TURN_WORDS) return null;
  if (sharedReadRun(body, args.index, args.overlapWords) !== null) return "a_turn_quotes_read";
  if (args.precedingOurTurnQuotesRead) return "b_preceded_by_our_read_turn";
  return null;
}
