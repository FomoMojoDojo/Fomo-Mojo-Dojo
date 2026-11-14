// ── THE DOCUMENT WINDOWER (SP-232, SP-233, SP-234 — 2026-11-13) ──────────────────────────────────
//
// Pure. No I/O, no model, no clock. Given a document's extracted text EXACTLY as the sidecar holds
// it, it returns the windows a later stage reads one at a time.
//
// WHY A SEPARATE FILE FROM interview-parser/segment.ts, which already windows text.
// The discipline is shared and deliberately identical: pack consecutive units up to WINDOW_CHARS,
// never cut a unit, address a window by offsets the CODE computed rather than by anything a model
// asserted (segment.ts's rule 2 — the P6 probe returned 116 spans for a 12,000-char window, 34 of
// them outside it or inverted). What differs is the unit and the pointer. A transcript's unit is a
// PASSAGE inside a speaker turn and its pointer is a 1-based LINE RANGE, because a turn is the thing
// a reader cites. A document's unit is a BLOCK — a page block or a paragraph — and its pointer is a
// half-open CHARACTER RANGE, because SP-234 requires that every character of the read text belong to
// exactly one window, which a line range cannot express. Adapting toWindows() to carry char offsets
// would have changed the segmenter's own contract to serve a second caller; forking it silently is
// what the brief forbids. So the number is shared and PINNED: WINDOW_CHARS here must equal
// WINDOW_CHARS in segment.ts, and ingest-chunking-guard reads both files and fails if they drift.
//
// WHAT A BLOCK IS, AND WHY THAT IS WHERE THE CUTS GO.
// The local parser emits a PDF as one `[Page n] …` block per page, blocks joined by a blank line, and
// a page's own text items joined by single spaces — so A PDF PAGE IS ONE LINE. For a PDF the only
// boundaries that exist are page boundaries, and that is exactly where this cuts. For text, markdown
// and docx the blank lines of the source survive the parser, so paragraphs are blocks too, and a
// markdown heading is cut before even on a single newline because a heading is its own unit.
//
// A BLOCK IS NEVER SPLIT (SP-232). A single block longer than WINDOW_CHARS therefore gets a window of
// its own, over the cap, flagged `oversize` — the same choice segment.ts makes for an over-long
// passage. The alternative would be cutting mid-paragraph, which SP-232 forbids. An oversize window
// is attempted like any other and may fail its model call; that failure is already a named, ledgered
// outcome (x6-inference-real-run pins it for an uncuttable 12,000-char CJK line), and under SP-241
// the document continues with its remaining windows.
import { contentIdentity } from "./contentIdentity.ts";

/** Pinned to interview-parser/segment.ts's WINDOW_CHARS; ingest-chunking-guard fails on drift. */
export const WINDOW_CHARS = 12_000;

/** Cut before a markdown heading even without a blank line: a heading is its own unit. */
const HEADING_LINE = /^#{1,6}\s/;
/** The local parser's per-page marker (`[Page 12] …`), the only boundary a PDF has. */
const PAGE_MARKER = /^\[Page \d+\]/;

export type DocumentWindow = {
  /** 0-based, document order. */
  window_index: number;
  /** Half-open [char_start, char_end) into the text as given. text.slice(start, end) IS the window. */
  char_start: number;
  char_end: number;
  text: string;
  chars: number;
  /** sha256(normalizeForHash(window text)) through contentIdentity.ts, the one identity authority. */
  sha256: string;
  /** True when this window is a single block longer than the cap, so the cap could not be honoured. */
  oversize: boolean;
};

/**
 * The cut points: offsets at which a window MAY begin. Always includes 0 and text.length, so the
 * returned list bounds every block. A cut lands at the START of a block, so the blank line that
 * separated it from the previous block belongs to the PREVIOUS window — that is what makes the
 * windows tile the text with nothing dropped (SP-234), rather than leaving the separators homeless.
 */
export function blockBoundaries(text: string): number[] {
  const cuts = new Set<number>([0, text.length]);
  if (!text) return [0];
  // Blank-line runs: the cut is after the run, i.e. at the first character of the next block.
  const blank = /\n{2,}/g;
  for (let m = blank.exec(text); m; m = blank.exec(text)) cuts.add(m.index + m[0].length);
  // Single-newline cuts, only before a line that is its own unit: a markdown heading or a page marker.
  const line = /\n/g;
  for (let m = line.exec(text); m; m = line.exec(text)) {
    const at = m.index + 1;
    const rest = text.slice(at, at + 32);
    if (HEADING_LINE.test(rest) || PAGE_MARKER.test(rest)) cuts.add(at);
  }
  return [...cuts].sort((a, b) => a - b);
}

/**
 * Windows over the text as given. Blocks are packed in document order up to `max`; a block that alone
 * exceeds `max` becomes its own oversize window.
 *
 * COVERAGE IS EXACT AND IS THE POINT (SP-234): windows are contiguous and non-overlapping,
 * windows[0].char_start === 0, the last char_end === text.length, and each char_end is the next
 * char_start. For empty text there are no windows at all — a document with no readable text is not a
 * document with one empty window.
 */
export async function toDocumentWindows(text: string, max = WINDOW_CHARS): Promise<DocumentWindow[]> {
  const source = String(text ?? "");
  if (!source.length) return [];
  const cuts = blockBoundaries(source);
  const out: DocumentWindow[] = [];
  let start = 0;
  for (let i = 1; i < cuts.length; i++) {
    const blockStart = cuts[i - 1];
    const blockEnd = cuts[i];
    if (blockEnd - start <= max) continue; // this block still fits in the open window
    // It does not fit. Close the open window before this block, if anything is open.
    if (blockStart > start) {
      out.push(await makeWindow(source, out.length, start, blockStart, max));
      start = blockStart;
    }
    // If the block STILL does not fit, it is longer than the cap on its own: its own oversize window,
    // because SP-232 forbids cutting inside it.
    if (blockEnd - start > max) {
      out.push(await makeWindow(source, out.length, start, blockEnd, max));
      start = blockEnd;
    }
  }
  if (start < source.length) out.push(await makeWindow(source, out.length, start, source.length, max));
  return out;
}

async function makeWindow(
  source: string, index: number, charStart: number, charEnd: number, max: number,
): Promise<DocumentWindow> {
  const slice = source.slice(charStart, charEnd);
  return {
    window_index: index,
    char_start: charStart,
    char_end: charEnd,
    text: slice,
    chars: slice.length,
    sha256: await contentIdentity(slice),
    oversize: slice.length > max,
  };
}

/**
 * The coverage law, as a predicate rather than a comment — so the guard, the tests and the ingest path
 * all ask the SAME question. Returns the reasons it fails, empty when it holds.
 */
export function coverageFailures(text: string, windows: readonly DocumentWindow[]): string[] {
  const source = String(text ?? "");
  const bad: string[] = [];
  if (!source.length) {
    if (windows.length) bad.push(`empty text produced ${windows.length} window(s)`);
    return bad;
  }
  if (!windows.length) { bad.push("non-empty text produced no windows"); return bad; }
  if (windows[0].char_start !== 0) bad.push(`first window starts at ${windows[0].char_start}, not 0`);
  const last = windows[windows.length - 1];
  if (last.char_end !== source.length) bad.push(`last window ends at ${last.char_end}, not ${source.length}`);
  for (let i = 0; i < windows.length; i++) {
    const w = windows[i];
    if (w.window_index !== i) bad.push(`window ${i} carries index ${w.window_index}`);
    if (w.char_end <= w.char_start) bad.push(`window ${i} is empty or inverted [${w.char_start},${w.char_end})`);
    if (w.text !== source.slice(w.char_start, w.char_end)) bad.push(`window ${i} text is not its own slice`);
    if (w.chars !== w.text.length) bad.push(`window ${i} chars ${w.chars} != text length ${w.text.length}`);
    if (i > 0 && w.char_start !== windows[i - 1].char_end) {
      bad.push(`window ${i} starts at ${w.char_start}, previous ended at ${windows[i - 1].char_end}`);
    }
  }
  const covered = windows.reduce((n, w) => n + w.chars, 0);
  if (covered !== source.length) bad.push(`windows cover ${covered} of ${source.length} characters`);
  return bad;
}
