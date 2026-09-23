// READ-ONLY proof of the segmenter against a stored interview transcript (parser commit 2).
// Lives in scripts/ — never served, never imported by a function, and it names no table it may not:
// the record is read by id through psql by the CALLER and handed to this script as a file, so the
// script itself touches no database at all.
//
// Usage: deno run --allow-read scripts/segment-kickoff-proof.ts <text-file>
// It prints COUNTS ONLY. No line, speaker name, or fragment of the transcript is printed, logged or
// written anywhere — the standing instruction on uploaded-document text.
import { sha256Hex } from "../supabase/functions/_shared/contentIdentity.ts";
import { MAX_PASSAGE_CHARS, WINDOW_CHARS, detectShape, toPassages, toTurns, toWindows } from "../supabase/functions/interview-parser/segment.ts";

const text = await Deno.readTextFile(Deno.args[0]);
const shape = detectShape(text);
const turns = toTurns(text, shape);
const passages = await toPassages(text, shape);
const windows = toWindows(passages);

// Every passage sha re-verified from the stored text by its own line range, under EXACT tolerance.
const lines = text.split("\n");
let verified = 0;
for (const p of passages) {
  if (await sha256Hex(lines.slice(p.line_start - 1, p.line_end).join("\n")) === p.passage_sha256) verified++;
}

const sizes = passages.map((p) => p.text.length).sort((a, b) => a - b);
const median = sizes.length ? sizes[Math.floor(sizes.length / 2)] : 0;
const speakers = new Set(turns.map((t) => t.speaker_label).filter((s): s is string => !!s));

console.log(JSON.stringify({
  detected_shape: shape,
  chars: text.length,
  lines: lines.length,
  turns: turns.length,
  distinct_speakers: speakers.size,
  turns_without_speaker: turns.filter((t) => !t.speaker_label).length,
  passages: passages.length,
  split_turns: new Set(passages.filter((p) => p.part_index > 0).map((p) => p.turn_index)).size,
  max_passage_chars: sizes.length ? sizes[sizes.length - 1] : 0,
  median_passage_chars: median,
  passage_cap: MAX_PASSAGE_CHARS,
  passages_over_cap: sizes.filter((n) => n > MAX_PASSAGE_CHARS).length,
  windows: windows.length,
  window_cap: WINDOW_CHARS,
  windows_over_cap: windows.filter((w) => w.end_passage > w.start_passage && w.chars > WINDOW_CHARS).length,
  sha_verified: `${verified} of ${passages.length}`,
}, null, 1));
