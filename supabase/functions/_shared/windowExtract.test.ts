// SP-235 / SP-237 (2026-11-13): the pointer is computed, and a quote the window does not contain is
// refused. These are the two properties the whole chunked pipeline's honesty rests on.
//
// The measurement behind them (segment.ts's rule 2): the P6 probe asked a local model for character
// offsets over a 12,000-character window and got 116 spans, 34 of them outside the window or
// inverted. So nothing here trusts an offset from a model — and a model that quotes something absent
// must not be able to put it on a row.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildWindowExtractUser,
  locateExcerpt,
  MAX_EXCERPT_CHARS,
  MAX_ITEMS_PER_KIND,
  readWindowExtract,
  WINDOW_EXTRACT_SYSTEM,
} from "./windowExtract.ts";
import {
  buildMergedExtractText, MERGED_EXTRACT_BUDGET, mergeWindowExtracts, selectForBudget,
} from "./mergeExtracts.ts";
import { HALF_WINDOW_FRACTION } from "./windowExtract.ts";

const WINDOW = "[Page 4] Revenue rose to $13.8 billion in the quarter. Churn improved by 40 basis points.";

Deno.test("locateExcerpt finds an exact quote and returns its own range", () => {
  const found = locateExcerpt(WINDOW, "Churn improved by 40 basis points.");
  assert(found);
  assertEquals(WINDOW.slice(found!.start, found!.end), "Churn improved by 40 basis points.");
});

Deno.test("locateExcerpt tolerates re-spacing, and the range still spans the DOCUMENT's characters", () => {
  const found = locateExcerpt(WINDOW, "Revenue   rose to $13.8\n  billion in the quarter.");
  assert(found, "a re-spaced quote should still be found");
  assertEquals(WINDOW.slice(found!.start, found!.end), "Revenue rose to $13.8 billion in the quarter.");
});

Deno.test("locateExcerpt refuses a quote the window does not contain", () => {
  assertEquals(locateExcerpt(WINDOW, "Revenue fell to $2 billion."), null);
  assertEquals(locateExcerpt(WINDOW, ""), null);
});

Deno.test("a model-supplied offset is ignored entirely; the stored pointer is the code's", async () => {
  const raw = {
    evidence: [{ text: "Churn improved by 40 basis points.", char_start: 99999, char_end: 1 }],
    claims: [], needs: [],
  };
  const { items } = await readWindowExtract({ raw, windowText: WINDOW, windowStart: 5_000 });
  assertEquals(items.length, 1);
  const want = WINDOW.indexOf("Churn improved");
  assertEquals(items[0].char_start, 5_000 + want);
  assertEquals(items[0].char_end, 5_000 + want + "Churn improved by 40 basis points.".length);
});

Deno.test("an invented quote is DISCARDED with its reason, not stored and not silently dropped", async () => {
  const raw = { evidence: [{ text: "Revenue fell to $2 billion." }], claims: [], needs: [] };
  const { items, discarded } = await readWindowExtract({ raw, windowText: WINDOW, windowStart: 0 });
  assertEquals(items.length, 0);
  assertEquals(discarded.length, 1);
  assert(discarded[0].reason.includes("not found verbatim"));
});

Deno.test("a need is not a quote: it is kept and pointed at the whole window", async () => {
  const raw = { evidence: [], claims: [], needs: [{ text: "Know what my bill will be before it arrives." }] };
  const { items, discarded } = await readWindowExtract({ raw, windowText: WINDOW, windowStart: 1_000 });
  assertEquals(discarded.length, 0);
  assertEquals(items.length, 1);
  assertEquals(items[0].char_start, 1_000);
  assertEquals(items[0].char_end, 1_000 + WINDOW.length);
});

Deno.test("the per-kind cap is enforced, and the overflow is reported", async () => {
  const sentences = Array.from({ length: MAX_ITEMS_PER_KIND + 4 }, (_, i) => `Fact number ${i} holds.`);
  // Padded deliberately: on a short window SP-258's half-window allowance bites FIRST, and this test
  // is about the per-kind COUNT cap. A window big enough to hold the quotes isolates the one rule.
  const windowText = `${sentences.join(" ")} ${"padding ".repeat(500)}`;
  const raw = { evidence: sentences.map((text) => ({ text })), claims: [], needs: [] };
  const { items, discarded } = await readWindowExtract({ raw, windowText, windowStart: 0 });
  assertEquals(items.length, MAX_ITEMS_PER_KIND);
  assert(discarded.some((d) => d.reason.includes("cap")));
});

Deno.test("an over-long passage is cut back, not stored whole", async () => {
  const long = "This sentence repeats. ".repeat(80); // ~1,840 chars
  const raw = { evidence: [{ text: long }], claims: [], needs: [] };
  const { items } = await readWindowExtract({ raw, windowText: long, windowStart: 0 });
  assertEquals(items.length, 1);
  assert(items[0].text.length <= MAX_EXCERPT_CHARS, `kept ${items[0].text.length} chars`);
});

Deno.test("a non-JSON answer yields nothing and says so", async () => {
  const { items, discarded } = await readWindowExtract({ raw: "sorry, I cannot", windowText: WINDOW, windowStart: 0 });
  assertEquals(items.length, 0);
  assert(discarded[0].reason.includes("not JSON"));
});

Deno.test("the prompt asks for extraction only, and forbids offsets in terms", () => {
  assert(WINDOW_EXTRACT_SYSTEM.includes("never interpret"));
  assert(WINDOW_EXTRACT_SYSTEM.includes("Do NOT return character offsets"));
  assert(WINDOW_EXTRACT_SYSTEM.includes("VERBATIM"));
  const user = buildWindowExtractUser({ fileName: "f.pdf", windowIndex: 2, windowCount: 17, windowText: WINDOW });
  assert(user.includes("Section 3 of 17"), "the window must be named as a section of the whole");
  assert(user.includes("THIS SECTION ONLY"));
});

// ── SP-237: the merge ───────────────────────────────────────────────────────────────────────────

const SIDECAR = `[Page 1] ${WINDOW}\n\n[Page 9] Churn improved by 40 basis points.`;

Deno.test("the same sentence in two windows is ONE merged row carrying both window refs", () => {
  const sha = "a".repeat(64);
  const rows = [
    { kind: "evidence", item_index: 0, text: "Churn improved by 40 basis points.", excerpt_sha: sha, window_index: 0, char_start: 60, char_end: 94 },
    { kind: "evidence", item_index: 0, text: "Churn improved by 40 basis points.", excerpt_sha: sha, window_index: 3, char_start: 900, char_end: 934 },
  ];
  const merged = mergeWindowExtracts(rows, SIDECAR);
  assertEquals(merged.items.length, 1);
  assertEquals(merged.items[0].windows, [0, 3]);
  assertEquals(merged.items[0].occurrences, 2);
  // The pointer kept is the FIRST occurrence, so a reader always has one verified place to go.
  assertEquals(merged.items[0].char_start, 60);
  assertEquals(merged.stats.repeated, 1);
  assert(buildMergedExtractText(merged.items).includes("sections 1, 4"));
});

Deno.test("a quote the sidecar does not contain is DROPPED from the merge and reported", () => {
  const rows = [
    { kind: "evidence", item_index: 0, text: "Revenue fell to $2 billion.", excerpt_sha: "b".repeat(64), window_index: 0, char_start: 0, char_end: 27 },
  ];
  const merged = mergeWindowExtracts(rows, SIDECAR);
  assertEquals(merged.items.length, 0);
  assertEquals(merged.untraceable.length, 1);
  assertEquals(merged.stats.dropped_untraceable, 1);
  assert(!buildMergedExtractText(merged.items).includes("Revenue fell"));
});

Deno.test("a need survives the merge without a verbatim check, because it is not a quote", () => {
  const rows = [
    { kind: "need", item_index: 0, text: "Know what my bill will be before it arrives.", excerpt_sha: "c".repeat(64), window_index: 1, char_start: 0, char_end: 100 },
  ];
  const merged = mergeWindowExtracts(rows, SIDECAR);
  assertEquals(merged.items.length, 1);
  assertEquals(merged.untraceable.length, 0);
});

Deno.test("the merged extract says it is not the document", () => {
  const rows = [
    { kind: "evidence", item_index: 0, text: "Churn improved by 40 basis points.", excerpt_sha: "d".repeat(64), window_index: 0, char_start: 60, char_end: 94 },
  ];
  const text = buildMergedExtractText(mergeWindowExtracts(rows, SIDECAR).items);
  assert(text.includes("this is not the document"));
  assert(text.includes("EVIDENCE (1)"));
});

// ── SP-255 / SP-256 / SP-257: the hand-off budget and the round-robin ───────────────────────────
//
// The failure these guard against is a TAIL CUT: fill the budget in document order and stop, which
// would hand the framework pass the first few sections of a 77-section filing and nothing else — the
// 30-page cap again under another name. The round-robin takes rank 0 from EVERY section before rank 1
// from any, so the hand-off is thin but end-to-end rather than thick and front-loaded.

/** A document of `windows` sections, each yielding `perKind` items per kind at ~`chars` characters. */
function fixture(windows: number, perKind: number, chars: number) {
  const rows: Array<Parameters<typeof mergeWindowExtracts>[0][number]> = [];
  const parts: string[] = [];
  let sha = 0;
  for (let w = 0; w < windows; w++) {
    for (const kind of ["evidence", "claim", "need"] as const) {
      for (let i = 0; i < perKind; i++) {
        const text = `W${w}-${kind}-${i} ` + "x".repeat(Math.max(0, chars - 16));
        rows.push({
          kind, item_index: i, text,
          excerpt_sha: (sha++).toString(16).padStart(64, "0"),
          window_index: w, char_start: w * 12_000 + i * 400, char_end: w * 12_000 + i * 400 + text.length,
        });
        parts.push(text);
      }
    }
  }
  return { rows, sidecar: parts.join(" ") };
}

Deno.test("the hand-off NEVER exceeds the budget, however much the document yields", () => {
  const { rows, sidecar } = fixture(34, 6, 300); // a document at the 400,000-character cap
  const merged = mergeWindowExtracts(rows, sidecar);
  const sel = selectForBudget(merged.items);
  assert(merged.items.length > 500, `fixture too small to exercise the budget: ${merged.items.length}`);
  assert(
    sel.text.length <= MERGED_EXTRACT_BUDGET,
    `hand-off was ${sel.text.length} chars against a ${MERGED_EXTRACT_BUDGET} budget`,
  );
  assertEquals(sel.stats.chars, sel.text.length);
});

Deno.test("SP-256: every window of a REAL document is represented", () => {
  // 17 windows is the Charter 10-Q's actual shape, measured.
  const { rows, sidecar } = fixture(17, 6, 300);
  const sel = selectForBudget(mergeWindowExtracts(rows, sidecar).items);
  assertEquals(sel.stats.windows_represented, 17);
  for (let w = 0; w < 17; w++) {
    assert(sel.selected.some((i) => i.windows[0] === w), `window ${w} contributed nothing`);
  }
});

Deno.test("at the DOCUMENT CAP the budget runs out during rank 0, and coverage is still maximal", () => {
  // THE LIMIT OF THE 10,000 BUDGET, stated rather than hidden. 34 windows (a 400,000-character
  // document) need 34 items of ~320 characters to give each one a single excerpt: 10,880, which does
  // not fit 10,000. So four windows contribute nothing to the HAND-OFF — while everything they
  // yielded is still stored, and items_interpreted < items_extracted says so on the row.
  //
  // What must still hold, and does: the round-robin is exhausting RANK 0 when it runs out, so no
  // window has two items while another has none. The shortfall is at the end of the first pass, which
  // is the fairest place for it to be.
  const { rows, sidecar } = fixture(34, 6, 300);
  const sel = selectForBudget(mergeWindowExtracts(rows, sidecar).items);
  const counts = new Map<number, number>();
  for (const item of sel.selected) counts.set(item.windows[0], (counts.get(item.windows[0]) ?? 0) + 1);
  assertEquals(Math.max(...counts.values()), 1, "a window got a second item while others had none");
  assert(sel.stats.windows_represented >= 30, `only ${sel.stats.windows_represented} windows represented`);
  assert(sel.stats.windows_represented < 34, "this fixture is meant to exceed the budget");
  // And nothing is lost — only not interpreted.
  assertEquals(sel.selected.length + sel.not_interpreted.length, sel.stats.items_merged);
});

Deno.test("SP-256: no window gets a second item while another has none", () => {
  const { rows, sidecar } = fixture(30, 6, 300);
  const sel = selectForBudget(mergeWindowExtracts(rows, sidecar).items);
  const counts = new Map<number, number>();
  for (const item of sel.selected) counts.set(item.windows[0], (counts.get(item.windows[0]) ?? 0) + 1);
  const min = Math.min(...counts.values());
  const max = Math.max(...counts.values());
  assert(max - min <= 1, `windows got between ${min} and ${max} items — that is not round-robin`);
});

Deno.test("selection is DETERMINISTIC — the same input gives the same hand-off", () => {
  const { rows, sidecar } = fixture(20, 6, 300);
  const merged = mergeWindowExtracts(rows, sidecar).items;
  assertEquals(selectForBudget(merged).text, selectForBudget(merged).text);
  // And it does not depend on the order the rows arrive in, which a database decides.
  const shuffled = [...merged].reverse();
  assertEquals(selectForBudget(shuffled).text, selectForBudget(merged).text);
});

Deno.test("SP-257: nothing is lost — what is not interpreted is still accounted for", () => {
  const { rows, sidecar } = fixture(34, 6, 300);
  const merged = mergeWindowExtracts(rows, sidecar);
  const sel = selectForBudget(merged.items);
  assertEquals(sel.stats.items_merged, merged.items.length);
  assertEquals(sel.selected.length + sel.not_interpreted.length, merged.items.length);
  assert(sel.stats.items_interpreted < sel.stats.items_merged, "the budget did not bite; fixture too small");
});

Deno.test("a small document is handed over WHOLE — the budget only bites when it must", () => {
  // Sized to fit 10,000 deliberately: two windows of three short items per kind is ~3,800 characters.
  const { rows, sidecar } = fixture(2, 3, 200);
  const merged = mergeWindowExtracts(rows, sidecar);
  const sel = selectForBudget(merged.items);
  assertEquals(sel.stats.items_interpreted, merged.items.length);
  assertEquals(sel.not_interpreted.length, 0);
});

Deno.test("whole items only: the hand-off never ends mid-sentence", () => {
  const { rows, sidecar } = fixture(34, 6, 300);
  const sel = selectForBudget(mergeWindowExtracts(rows, sidecar).items);
  for (const line of sel.text.split("\n")) {
    if (!line.startsWith("- [")) continue;
    const item = sel.selected.find((i) => line.endsWith(i.text));
    assert(item, `a hand-off line is not a whole stored item: ${line.slice(0, 60)}…`);
  }
});

Deno.test("SP-258: a window's extract may not exceed half the window's characters", async () => {
  // Twelve long quotes, all genuinely present: the cap must bite on SIZE, not only on count.
  const sentences = Array.from({ length: 12 }, (_, i) => `Sentence ${i} ` + "y".repeat(280));
  const windowText = sentences.join(" ");
  const half = Math.floor(windowText.length * HALF_WINDOW_FRACTION);
  const raw = {
    evidence: sentences.map((text) => ({ text })),
    claims: sentences.map((text) => ({ text })),
    needs: sentences.map((text) => ({ text })),
  };
  const { items, discarded } = await readWindowExtract({ raw, windowText, windowStart: 0 });
  const taken = items.reduce((n, i) => n + i.text.length, 0);
  assert(taken <= half, `kept ${taken} characters of a ${windowText.length}-character window (half is ${half})`);
  assert(discarded.some((d) => d.reason.includes("half-window")), "the half-window rule never bit");
});
