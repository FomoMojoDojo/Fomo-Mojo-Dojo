// ── The SEGMENTER (parser commit 2, rules 2026-09-22.1 — rule 2, "pointer over wording") ──────────
//
// Pure. No I/O, no model, no clock. Given the record's stored text exactly as saved, it returns the
// turns and passages the later stages point at. Rule 2 is the whole reason this file exists: the P6
// probe asked the local model for character offsets over a 12,000-char window and got 116 spans, 34 of
// them outside the window or inverted. An offset a model asserts is not evidence — so the CODE cuts
// the passages and hashes them, and trace re-checks the pointer rather than the words.
//
// NOTHING IS STRIPPED AND NOTHING IS RE-JOINED. Line numbers are 1-based into the stored text, and a
// passage's text is exactly `lines.slice(line_start - 1, line_end).join("\n")` — segmentRoundTrip in
// the tests asserts that byte-for-byte, because a pointer into a text we normalised is a pointer into
// a text that does not exist.
import { sha256Hex } from "../_shared/contentIdentity.ts";

export const MAX_PASSAGE_CHARS = 1500;
export const WINDOW_CHARS = 12_000;

/** The transcript shapes the segmenter recognises, measured against the fixtures we hold. */
export type TranscriptShape = "zoom" | "krisp" | "cue" | "paragraph";

// ── header shapes ────────────────────────────────────────────────────────────────────────────────
// zoom  — "<speaker> | HH:MM:SS" on its own line, the body following. Measured on the kickoff export:
//         205 of 205 header lines carry the pipe. (An earlier reading of mine called this
//         "<speaker> HH:MM:SS"; the separator is a pipe and the regex says so.)
// krisp — "HH:MM:SS <speaker>" on its own line: the TIMESTAMP LEADS and the name follows, the reverse
//         of zoom. Measured on the two TEST krisp exports (8 and 10 headers).
// cue   — WebVTT / SRT: an optional numeric index line, then a cue-timing line containing "-->",
//         then the caption body. WebVTT may name the speaker with <v Name>; SRT has no speaker, so
//         speaker_label is null and the shape is still cue.
const ZOOM_HEADER = /^(.+?)\s*\|\s*\d{1,2}:\d{2}(?::\d{2})?\s*$/;
const KRISP_HEADER = /^\d{1,2}:\d{2}(?::\d{2})?\s+(\S.*?)\s*$/;
const CUE_TIMING = /-->/;
const CUE_INDEX = /^\d+\s*$/;
const VOICE_TAG = /<v\s+([^>]+)>/i;

export type Turn = {
  turn_index: number;
  speaker_label: string | null;
  /** 1-based, inclusive, into the stored text's lines. */
  line_start: number;
  line_end: number;
  text: string;
};

export type Passage = Turn & {
  /** 0 when the turn was not split; otherwise the passage's index within its turn. */
  part_index: number;
  passage_sha256: string;
};

/** Consecutive passage indexes packed for the later model stage. */
export type Window = { start_passage: number; end_passage: number; chars: number };

const splitLines = (text: string): string[] => text.split("\n");

/**
 * Shape detection is a MAJORITY of candidate header lines, not a first match: a body line that happens
 * to read like a header cannot flip the whole transcript. Each shape counts the lines it would claim;
 * the largest count wins, and a shape must claim at least MIN_HEADERS lines AND more than any other.
 * Ties and an empty field fall to `paragraph`, which needs no headers at all.
 */
export const MIN_HEADERS = 2;

export function detectShape(text: string): TranscriptShape {
  const lines = splitLines(text);
  let zoom = 0, krisp = 0, cue = 0;
  for (const line of lines) {
    if (CUE_TIMING.test(line)) { cue++; continue; }
    if (ZOOM_HEADER.test(line)) { zoom++; continue; }
    if (KRISP_HEADER.test(line)) { krisp++; continue; }
  }
  const best = Math.max(zoom, krisp, cue);
  if (best < MIN_HEADERS) return "paragraph";
  if (cue === best && cue > zoom && cue > krisp) return "cue";
  if (zoom === best && zoom > krisp && zoom > cue) return "zoom";
  if (krisp === best && krisp > zoom && krisp > cue) return "krisp";
  return "paragraph"; // a tie is not a majority
}

/** Is this line a header under the detected shape? Used by the splitter's guard too. */
export function isHeaderLine(line: string, shape: TranscriptShape): boolean {
  switch (shape) {
    case "zoom": return ZOOM_HEADER.test(line);
    case "krisp": return KRISP_HEADER.test(line);
    case "cue": return CUE_TIMING.test(line) || CUE_INDEX.test(line);
    case "paragraph": return false;
  }
}

function speakerOf(line: string, shape: TranscriptShape): string | null {
  if (shape === "zoom") return ZOOM_HEADER.exec(line)?.[1]?.trim() || null;
  if (shape === "krisp") return KRISP_HEADER.exec(line)?.[1]?.trim() || null;
  return null;
}

/** Turns, in document order. A turn spans from its header line to the line before the next header. */
export function toTurns(text: string, shape: TranscriptShape = detectShape(text)): Turn[] {
  const lines = splitLines(text);
  const turns: Turn[] = [];
  if (shape === "paragraph") {
    // Blank-line paragraphs; speaker unknown by construction.
    let start = -1;
    for (let i = 0; i < lines.length; i++) {
      const blank = lines[i].trim() === "";
      if (!blank && start < 0) start = i;
      if ((blank || i === lines.length - 1) && start >= 0) {
        const end = blank ? i - 1 : i;
        turns.push({ turn_index: turns.length, speaker_label: null, line_start: start + 1, line_end: end + 1, text: lines.slice(start, end + 1).join("\n") });
        start = -1;
      }
    }
    return turns;
  }
  // Header-led shapes: a turn opens on a header line and runs to the line before the next one.
  const headerAt: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (shape === "cue" ? CUE_TIMING.test(lines[i]) : isHeaderLine(lines[i], shape)) headerAt.push(i);
  }
  for (let h = 0; h < headerAt.length; h++) {
    const start = headerAt[h];
    const end = (h + 1 < headerAt.length ? headerAt[h + 1] : lines.length) - 1;
    // A cue's speaker, when WebVTT names one with <v Name>.
    const speaker = shape === "cue"
      ? (VOICE_TAG.exec(lines.slice(start, end + 1).join("\n"))?.[1]?.trim() || null)
      : speakerOf(lines[start], shape);
    turns.push({ turn_index: turns.length, speaker_label: speaker, line_start: start + 1, line_end: end + 1, text: lines.slice(start, end + 1).join("\n") });
  }
  return turns;
}

/** Sentence-ish boundaries: end of sentence punctuation followed by whitespace. */
const SENTENCE_END = /[.!?]["')\]]?\s/;

/**
 * Passages. A turn under MAX_PASSAGE_CHARS is one passage. A longer turn splits at SENTENCE boundaries
 * into passages that keep the turn_index and carry a part_index; each gets its own line range and sha.
 *
 * NO PASSAGE CROSSES A HEADER LINE. A split is only ever taken strictly inside the turn's own lines,
 * and the turn itself ends before the next header — so a header can never land mid-passage. The
 * property test generates transcripts and asserts it over every passage.
 */
export async function toPassages(text: string, shape: TranscriptShape = detectShape(text)): Promise<Passage[]> {
  const lines = splitLines(text);
  const out: Passage[] = [];
  for (const turn of toTurns(text, shape)) {
    const turnLines = lines.slice(turn.line_start - 1, turn.line_end);
    if (turn.text.length <= MAX_PASSAGE_CHARS) {
      out.push({ ...turn, part_index: 0, passage_sha256: await sha256Hex(turn.text) });
      continue;
    }
    // Split on LINE boundaries so every passage keeps a whole-line range (the pointer is a line range,
    // so a mid-line cut could not be expressed). Prefer a line that ends a sentence.
    let partIndex = 0;
    let from = 0; // index into turnLines
    while (from < turnLines.length) {
      let to = from; // inclusive
      let chars = turnLines[from].length;
      let lastSentenceEnd = -1;
      while (to + 1 < turnLines.length && chars + 1 + turnLines[to + 1].length <= MAX_PASSAGE_CHARS) {
        to++;
        chars += 1 + turnLines[to].length;
        if (SENTENCE_END.test(turnLines[to] + " ")) lastSentenceEnd = to;
      }
      // Back off to the last sentence end when one exists and is not the whole run.
      if (lastSentenceEnd > from && lastSentenceEnd < to) to = lastSentenceEnd;
      const passageText = turnLines.slice(from, to + 1).join("\n");
      out.push({
        turn_index: turn.turn_index,
        speaker_label: turn.speaker_label,
        line_start: turn.line_start + from,
        line_end: turn.line_start + to,
        text: passageText,
        part_index: partIndex++,
        passage_sha256: await sha256Hex(passageText),
      });
      from = to + 1;
    }
  }
  return out;
}

/**
 * Windows for the later model stage: consecutive passages packed to WINDOW_CHARS, NEVER splitting a
 * passage. Boundaries are passage indexes, so a window is addressable without re-cutting the text. A
 * single passage longer than WINDOW_CHARS (impossible while MAX_PASSAGE_CHARS < WINDOW_CHARS, but the
 * code does not rely on that) gets a window of its own.
 */
export function toWindows(passages: readonly Passage[], max = WINDOW_CHARS): Window[] {
  const windows: Window[] = [];
  let start = 0, chars = 0;
  for (let i = 0; i < passages.length; i++) {
    const len = passages[i].text.length;
    if (i > start && chars + len > max) {
      windows.push({ start_passage: start, end_passage: i - 1, chars });
      start = i; chars = 0;
    }
    chars += len;
  }
  if (passages.length) windows.push({ start_passage: start, end_passage: passages.length - 1, chars });
  return windows;
}
