// The segmenter and trace (parser commit 2, rules 2026-09-22.1). SYNTHETIC FIXTURES ONLY — no line of
// any real transcript appears here or in any assertion.
//
// Plants: (i) shift line numbering by one (line_start + 1) → every round-trip and sha check red;
//         (ii) drop the header guard in the splitter → the property test red.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { sha256Hex } from "../_shared/contentIdentity.ts";
import {
  MAX_PASSAGE_CHARS, WINDOW_CHARS, detectShape, isHeaderLine, toPassages, toTurns, toWindows,
} from "./segment.ts";
import { diceSimilarity, locatePassage, normalizeWs, passageAt } from "./trace.ts";

// ── fixtures, all invented ───────────────────────────────────────────────────────────────────────
const ZOOM = [
  "Ada Lovelace | 00:00:04",
  "We started the pilot in March.",
  "",
  "Grace Hopper | 00:01:12",
  "The handover took three weeks longer than we planned.",
  "It slipped again in April.",
  "",
  "Ada Lovelace | 00:02:30",
  "That matches what the team told me.",
].join("\n");

const KRISP = [
  "00:00:04 Ada Lovelace",
  "We started the pilot in March.",
  "",
  "00:01:12 Grace Hopper",
  "The handover took three weeks longer than we planned.",
  "",
  "00:02:30 Ada Lovelace",
  "That matches what the team told me.",
].join("\n");

const VTT = [
  "WEBVTT",
  "",
  "1",
  "00:00:04.000 --> 00:00:09.000",
  "<v Ada Lovelace>We started the pilot in March.",
  "",
  "2",
  "00:01:12.000 --> 00:01:18.000",
  "<v Grace Hopper>The handover took three weeks longer.",
].join("\n");

const SRT = [
  "1",
  "00:00:04,000 --> 00:00:09,000",
  "We started the pilot in March.",
  "",
  "2",
  "00:01:12,000 --> 00:01:18,000",
  "The handover took three weeks longer.",
].join("\n");

const PARAGRAPH = [
  "We started the pilot in March.",
  "It went well enough at first.",
  "",
  "The handover took three weeks longer than we planned.",
].join("\n");

// ── shape detection ──────────────────────────────────────────────────────────────────────────────
Deno.test("shape: zoom is <speaker> | HH:MM:SS", () => assertEquals(detectShape(ZOOM), "zoom"));
Deno.test("shape: krisp is HH:MM:SS <speaker> — the timestamp leads", () => assertEquals(detectShape(KRISP), "krisp"));
Deno.test("shape: WebVTT and SRT are both cue", () => {
  assertEquals(detectShape(VTT), "cue");
  assertEquals(detectShape(SRT), "cue");
});
Deno.test("shape: unlabelled prose falls back to paragraph", () => assertEquals(detectShape(PARAGRAPH), "paragraph"));

Deno.test("shape: detection is a MAJORITY — one body line that reads like a header cannot flip it", () => {
  // eight krisp headers, one stray line that a zoom regex would claim
  const lines: string[] = [];
  for (let i = 0; i < 8; i++) { lines.push(`00:0${i}:00 Ada Lovelace`, `Turn ${i} body text.`, ""); }
  lines.push("a stray line | 00:09:00");
  assertEquals(detectShape(lines.join("\n")), "krisp");
});

Deno.test("shape: fewer than MIN_HEADERS candidates is paragraph, not a guess", () => {
  assertEquals(detectShape("Ada Lovelace | 00:00:04\nOne turn only."), "paragraph");
});

// ── turns and speakers ───────────────────────────────────────────────────────────────────────────
Deno.test("turns: zoom yields one turn per header with the speaker named", () => {
  const turns = toTurns(ZOOM);
  assertEquals(turns.map((t) => t.speaker_label), ["Ada Lovelace", "Grace Hopper", "Ada Lovelace"]);
  assertEquals(turns.map((t) => t.turn_index), [0, 1, 2]);
  assertEquals(turns[0].line_start, 1);
  assertEquals(turns[1].line_start, 4);
});
Deno.test("turns: krisp names the speaker after the timestamp", () => {
  assertEquals(toTurns(KRISP).map((t) => t.speaker_label), ["Ada Lovelace", "Grace Hopper", "Ada Lovelace"]);
});
Deno.test("turns: WebVTT takes the speaker from <v>, SRT has none", () => {
  assertEquals(toTurns(VTT).map((t) => t.speaker_label), ["Ada Lovelace", "Grace Hopper"]);
  assertEquals(toTurns(SRT).map((t) => t.speaker_label), [null, null]);
});
Deno.test("turns: paragraph fallback carries speaker_label null", () => {
  const turns = toTurns(PARAGRAPH);
  assertEquals(turns.length, 2);
  assertEquals(turns.map((t) => t.speaker_label), [null, null]);
});

// ── the round trip: nothing stripped, nothing re-joined ──────────────────────────────────────────
for (const [name, text] of [["zoom", ZOOM], ["krisp", KRISP], ["vtt", VTT], ["srt", SRT], ["paragraph", PARAGRAPH]] as const) {
  Deno.test(`round trip (${name}): every passage re-joins byte-for-byte from its line range, and its sha verifies`, async () => {
    const lines = text.split("\n");
    const passages = await toPassages(text);
    assert(passages.length > 0);
    for (const p of passages) {
      const rejoined = lines.slice(p.line_start - 1, p.line_end).join("\n");
      assertEquals(rejoined, p.text, `line range ${p.line_start}-${p.line_end} did not re-join to the passage`);
      assertEquals(await sha256Hex(rejoined), p.passage_sha256);
      assertEquals(passageAt(text, p), p.text);
    }
  });
}

// ── splitting ────────────────────────────────────────────────────────────────────────────────────
/** A synthetic long turn: one header, then many sentence lines, well past MAX_PASSAGE_CHARS. */
function longTurn(sentences = 120): string {
  const lines = ["Ada Lovelace | 00:00:04"];
  for (let i = 0; i < sentences; i++) lines.push(`Sentence number ${i} about the pilot and the handover schedule.`);
  lines.push("", "Grace Hopper | 00:30:00", "A short closing turn.");
  return lines.join("\n");
}

Deno.test("split: a long turn becomes several passages that keep the turn_index and carry a part index", async () => {
  const text = longTurn();
  const passages = await toPassages(text);
  const first = passages.filter((p) => p.turn_index === 0);
  assert(first.length > 1, "the long turn should have split");
  assertEquals(first.map((p) => p.part_index), first.map((_, i) => i));
  for (const p of first) assert(p.text.length <= MAX_PASSAGE_CHARS, `passage ${p.part_index} is ${p.text.length} chars`);
  // an unsplit turn keeps part_index 0
  assertEquals(passages.filter((p) => p.turn_index === 1).map((p) => p.part_index), [0]);
});

Deno.test("split: the passages of a turn cover its line range exactly, with no gap and no overlap", async () => {
  const text = longTurn();
  const turns = toTurns(text);
  const passages = await toPassages(text);
  for (const turn of turns) {
    const parts = passages.filter((p) => p.turn_index === turn.turn_index);
    assertEquals(parts[0].line_start, turn.line_start);
    assertEquals(parts[parts.length - 1].line_end, turn.line_end);
    for (let i = 1; i < parts.length; i++) assertEquals(parts[i].line_start, parts[i - 1].line_end + 1);
  }
});

Deno.test("PROPERTY: no passage ever crosses a header line", async () => {
  // a generated transcript: varied turn lengths, every shape that has headers
  for (const shape of ["zoom", "krisp"] as const) {
    const lines: string[] = [];
    for (let t = 0; t < 12; t++) {
      lines.push(shape === "zoom" ? `Speaker ${t % 3} | 00:0${t % 10}:00` : `00:0${t % 10}:00 Speaker ${t % 3}`);
      for (let s = 0; s < (t % 5) * 14 + 1; s++) lines.push(`Body line ${t}-${s} with enough words to push the turn past the passage cap when repeated.`);
      lines.push("");
    }
    const text = lines.join("\n");
    const detected = detectShape(text);
    assertEquals(detected, shape);
    const all = text.split("\n");
    const passages = await toPassages(text, detected);
    assert(passages.length > 12, "the fixture should have split at least one turn");
    for (const p of passages) {
      // a header may only be the FIRST line of a passage (the turn's own opener), never inside it
      for (let ln = p.line_start + 1; ln <= p.line_end; ln++) {
        assert(!isHeaderLine(all[ln - 1], detected),
          `passage (turn ${p.turn_index} part ${p.part_index}) contains a header at line ${ln}`);
      }
    }
  }
});

// ── windows ──────────────────────────────────────────────────────────────────────────────────────
Deno.test("windows: never split a passage, stay within WINDOW_CHARS, and cover every passage once", async () => {
  const passages = await toPassages(longTurn(400));
  const windows = toWindows(passages);
  assert(windows.length > 1, "the fixture should need more than one window");
  assertEquals(windows[0].start_passage, 0);
  assertEquals(windows[windows.length - 1].end_passage, passages.length - 1);
  for (let i = 1; i < windows.length; i++) assertEquals(windows[i].start_passage, windows[i - 1].end_passage + 1);
  for (const w of windows) {
    assert(w.end_passage >= w.start_passage);
    // a window of more than one passage must fit the cap; a lone oversized passage gets its own window
    if (w.end_passage > w.start_passage) assert(w.chars <= WINDOW_CHARS, `window is ${w.chars} chars`);
  }
});

Deno.test("windows: an empty transcript yields no windows", () => assertEquals(toWindows([]), []));

// ── trace ────────────────────────────────────────────────────────────────────────────────────────
const TOLERANCES = ["exact", "ws", "fuzzy_0_85"] as const;

Deno.test("trace: the record sha is checked FIRST — a changed text is not_located whatever the range says", async () => {
  const passages = await toPassages(ZOOM);
  const p = passages[0];
  const sha = await sha256Hex(ZOOM);
  for (const tol of TOLERANCES) {
    const r = await locatePassage(ZOOM + "\nan added line", { turn_index: p.turn_index, line_start: p.line_start, line_end: p.line_end, passage_sha256: p.passage_sha256 }, tol, sha, p.text);
    assertEquals(r.state, "not_located");
    assert(r.reason.includes("record text changed"));
  }
});

Deno.test("trace: an unchanged passage is located under every tolerance", async () => {
  const sha = await sha256Hex(ZOOM);
  for (const p of await toPassages(ZOOM)) {
    for (const tol of TOLERANCES) {
      const r = await locatePassage(ZOOM, { turn_index: p.turn_index, line_start: p.line_start, line_end: p.line_end, passage_sha256: p.passage_sha256 }, tol, sha, p.text);
      assertEquals(r.state, "located", `${tol}: ${r.reason}`);
      assert(r.reason.length > 0);
    }
  }
});

Deno.test("trace: a line range outside the text is not_located and says so", async () => {
  const sha = await sha256Hex(ZOOM);
  const r = await locatePassage(ZOOM, { turn_index: 0, line_start: 900, line_end: 901, passage_sha256: "0".repeat(64) }, "exact", sha);
  assertEquals(r.state, "not_located");
  assert(r.reason.includes("outside the stored text"));
});

Deno.test("trace: whitespace-only drift fails exact, passes ws and fuzzy", async () => {
  const original = "We started   the pilot in March.";
  const drifted = "We started the pilot in March.";
  const text = drifted;
  const sha = await sha256Hex(text);
  const pointer = { turn_index: 0, line_start: 1, line_end: 1, passage_sha256: await sha256Hex(original) };
  assertEquals((await locatePassage(text, pointer, "exact", sha, original)).state, "not_located");
  assertEquals((await locatePassage(text, pointer, "ws", sha, original)).state, "located");
  assertEquals((await locatePassage(text, pointer, "fuzzy_0_85", sha, original)).state, "located");
});

Deno.test("trace: a RE-WORDED passage fails exact and ws, passes fuzzy at 0.85", async () => {
  const landed = "The handover took three weeks longer than we planned.";
  const reworded = "The handover took three weeks longer than we had planned.";
  const sha = await sha256Hex(reworded);
  const pointer = { turn_index: 0, line_start: 1, line_end: 1, passage_sha256: await sha256Hex(landed) };
  assertEquals((await locatePassage(reworded, pointer, "exact", sha, landed)).state, "not_located");
  assertEquals((await locatePassage(reworded, pointer, "ws", sha, landed)).state, "not_located");
  const fuzzy = await locatePassage(reworded, pointer, "fuzzy_0_85", sha, landed);
  assertEquals(fuzzy.state, "located");
  assert((fuzzy.similarity ?? 0) >= 0.85, `similarity was ${fuzzy.similarity}`);
});

Deno.test("trace: a DIFFERENT passage fails all three", async () => {
  const landed = "The handover took three weeks longer than we planned.";
  const other = "Funding was approved by the county in a single meeting.";
  const sha = await sha256Hex(other);
  const pointer = { turn_index: 0, line_start: 1, line_end: 1, passage_sha256: await sha256Hex(landed) };
  for (const tol of TOLERANCES) {
    const r = await locatePassage(other, pointer, tol, sha, landed);
    assertEquals(r.state, "not_located", `${tol} should not locate a different passage`);
  }
  assert(diceSimilarity(landed, other) < 0.85);
});

Deno.test("trace: ws and fuzzy without a landing text are not_located, and say why", async () => {
  const sha = await sha256Hex("changed text here");
  const r = await locatePassage("changed text here", { turn_index: 0, line_start: 1, line_end: 1, passage_sha256: "0".repeat(64) }, "ws", sha);
  assertEquals(r.state, "not_located");
  assert(r.reason.includes("no landing text"));
});

Deno.test("dice: identical is 1, disjoint is 0, and normalization is applied", () => {
  assertEquals(diceSimilarity("abc def", "abc def"), 1);
  assertEquals(diceSimilarity("abc def", "  abc   def "), 1);
  assertEquals(diceSimilarity("aaaa", "zzzz"), 0);
  assertEquals(normalizeWs("  a   b  "), "a b");
});
