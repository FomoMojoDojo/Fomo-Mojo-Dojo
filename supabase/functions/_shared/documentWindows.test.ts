// SP-232 / SP-233 / SP-234 (2026-11-13): the windower's two laws, as tests.
//
//   SP-232  a block is never split, and a window holds at most WINDOW_CHARS unless one block alone
//           is longer than that;
//   SP-234  coverage is EXACT — every character of the read text belongs to exactly one window.
//
// Coverage is the law worth testing hardest, because the failure is silent: drop one window and the
// document still analyses, with a gap no row records. coverageFailures() is the predicate the ingest
// path, the guard and these tests all share, so a plant that drops a window fails all three at once.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { WINDOW_CHARS as SEGMENT_WINDOW_CHARS } from "../interview-parser/segment.ts";
import {
  blockBoundaries,
  coverageFailures,
  toDocumentWindows,
  WINDOW_CHARS,
} from "./documentWindows.ts";

/** A PDF as the local parser emits it: one `[Page n] …` block per page, blocks joined by a blank line. */
function pdfShaped(pages: number, charsPerPage: number): string {
  const out: string[] = [];
  for (let p = 1; p <= pages; p++) {
    const body = `P${p}START ` + "lorem ipsum dolor sit amet ".repeat(Math.ceil(charsPerPage / 27));
    out.push(`[Page ${p}] ${body.slice(0, charsPerPage)} P${p}END`);
  }
  return out.join("\n\n");
}

Deno.test("WINDOW_CHARS is pinned to the segmenter's", () => {
  assertEquals(WINDOW_CHARS, SEGMENT_WINDOW_CHARS);
  assertEquals(WINDOW_CHARS, 12_000);
});

Deno.test("empty text produces no windows at all", async () => {
  assertEquals(await toDocumentWindows(""), []);
  assertEquals(coverageFailures("", []), []);
});

Deno.test("a PDF-shaped document tiles its text with nothing dropped", async () => {
  const text = pdfShaped(77, 2_100);
  const windows = await toDocumentWindows(text);
  assertEquals(coverageFailures(text, windows), []);
  assert(windows.length > 1, `expected several windows, got ${windows.length}`);
  for (const w of windows) assert(w.chars <= WINDOW_CHARS, `window ${w.window_index} is ${w.chars} chars`);
});

Deno.test("no window boundary falls inside a block", async () => {
  const text = pdfShaped(40, 2_100);
  const cuts = new Set(blockBoundaries(text));
  for (const w of await toDocumentWindows(text)) {
    assert(cuts.has(w.char_start), `window ${w.window_index} starts at ${w.char_start}, not a block boundary`);
    assert(cuts.has(w.char_end), `window ${w.window_index} ends at ${w.char_end}, not a block boundary`);
  }
});

Deno.test("one block longer than the cap becomes its own oversize window, and coverage still holds", async () => {
  const text = "x".repeat(WINDOW_CHARS * 2 + 7);
  const windows = await toDocumentWindows(text);
  assertEquals(windows.length, 1);
  assertEquals(windows[0].oversize, true);
  assertEquals(windows[0].chars, text.length);
  assertEquals(coverageFailures(text, windows), []);
});

Deno.test("a short block before an oversize one is closed first, not swallowed", async () => {
  const head = "[Page 1] short first page";
  const text = `${head}\n\n${"y".repeat(WINDOW_CHARS + 500)}`;
  const windows = await toDocumentWindows(text);
  assertEquals(windows.length, 2);
  assertEquals(windows[0].oversize, false);
  assertEquals(windows[1].oversize, true);
  assertEquals(windows[0].text, `${head}\n\n`);
  assertEquals(coverageFailures(text, windows), []);
});

Deno.test("a markdown heading and a page marker are cut before on a single newline", () => {
  const md = "body line one\n## A heading\nbody after";
  assert(blockBoundaries(md).includes(md.indexOf("## A heading")));
  const pdf = "[Page 1] one\n[Page 2] two";
  assert(blockBoundaries(pdf).includes(pdf.indexOf("[Page 2]")));
  const plain = "body line one\nnot a heading\nbody after";
  assertEquals(blockBoundaries(plain), [0, plain.length]);
});

Deno.test("every window's text is exactly its own slice, and its sha is the identity of that slice", async () => {
  const text = pdfShaped(12, 1_500);
  for (const w of await toDocumentWindows(text)) {
    assertEquals(w.text, text.slice(w.char_start, w.char_end));
    assertEquals(w.sha256.length, 64);
    assert(/^[0-9a-f]{64}$/.test(w.sha256));
  }
});

Deno.test("coverageFailures CATCHES a dropped window — the plant's property", async () => {
  const text = pdfShaped(30, 2_100);
  const windows = await toDocumentWindows(text);
  assert(windows.length >= 3, `need at least 3 windows, got ${windows.length}`);
  const dropped = [...windows.slice(0, 1), ...windows.slice(2)].map((w, i) => ({ ...w, window_index: i }));
  const failures = coverageFailures(text, dropped);
  assert(failures.length > 0, "dropping a window went unnoticed");
  assert(
    failures.some((f) => f.includes("previous ended at")) && failures.some((f) => f.includes("characters")),
    `expected a gap and a coverage shortfall, got: ${JSON.stringify(failures)}`,
  );
});

Deno.test("coverageFailures CATCHES a window whose text was edited away from its offsets", async () => {
  const text = pdfShaped(6, 1_200);
  const windows = await toDocumentWindows(text);
  const tampered = windows.map((w, i) => (i === 0 ? { ...w, text: w.text.replace("P1START", "EDITED") } : w));
  assert(coverageFailures(text, tampered).some((f) => f.includes("not its own slice")));
});
