// ── V1-R6 (operator ruling, 2026-10-13): one function builds a row's text ───────────────────────
//
// Row 9830 refused the Edgewood positioning stage with carried_span_drift on two rows that had not
// moved. Selection hashed `claim_text + " " + evidence_excerpt`; the drift re-read hashed
// `claim_text`. Both sides were internally consistent and the module's own tests were green —
// carriedSpan.test.ts leg 10 hands driftedSpans the correct concatenated text, so it exercises the
// comparison and never the re-read. The defect lived in the gap between the module and its caller.
//
// These legs stand in that gap: that there is ONE assembly (a source guard), that the re-read
// derives its SELECT from it and builds its text with it, and that the re-read reports the three
// drift verdicts correctly.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  ROW_TEXT_COLUMNS, ROW_TEXT_TABLES, reReadRowTexts, rowTextOf, rowTextSelect,
} from "./classSourcingScope.ts";
import { driftedSpans, type CarriedBlock } from "./carriedSpan.ts";
import { sha256Hex } from "./contentIdentity.ts";

// ── 1. the source guard: the sourcing path assembles a row's text in exactly ONE place ──────────
//
// SCOPE is the sourcing path — the three files that selected, carried and re-read these rows:
// classSourcingScope.ts, carriedSpan.ts and generate-public-read/index.ts. That is where the two
// disagreeing assemblies lived. Files outside it that concatenate a signal's text for an unrelated
// check (offeringNamedOnSite.ts builds one for the on-site name check) are not in this scope and
// are not changed by R6; naming them here would make the guard about a different rule.
const SOURCING_PATH = [
  new URL("./classSourcingScope.ts", import.meta.url),
  new URL("./carriedSpan.ts", import.meta.url),
  new URL("../generate-public-read/index.ts", import.meta.url),
];

/** A text column named anywhere in the sourcing path, outside the two places R6 allows. */
const TEXT_COLS = ["claim_text", "evidence_excerpt", "quote", "body"];
/** (a) the ROW_TEXT_COLUMNS literal — the ONE statement of which columns a kind's text takes.
 *  (b) a .select("…") list — asking the database for a column is not assembling text.
 *  (c) a row TYPE annotation (`claim_text: string | null`) — a shape, not an expression. */
function allowed(line: string): boolean {
  const t = line.trim();
  if (t.startsWith("//") || t.startsWith("*") || t.startsWith("/*")) return true;
  if (/^(signal|own_word|finding):\s*\[/.test(t)) return true;                       // (a)
  if (/\.select\(\s*["`]/.test(t)) return true;                                      // (b)
  if (/\{[^}]*\b(claim_text|evidence_excerpt|quote|body)\??:\s*string/.test(t)) return true; // (c)
  return false;
}
/** `body` is a common parameter and payload key; count it only where it reads like a COLUMN.
 *  The two payload-key lists in the hook (`["text","statement","promise","body"]`, which read a
 *  line's text out of a STORED READ's json) are not row columns and are not what R6 is about —
 *  they are recognised by the company they keep. */
function namesColumn(line: string): boolean {
  if (TEXT_COLS.slice(0, 3).some((c) => new RegExp(`\\b${c}\\b`).test(line))) return true;
  if (/"statement"|"promise"/.test(line)) return false;
  return /(\.body\b|["'`]body["'`])/.test(line);
}

Deno.test("1. R6 source guard: nothing in the sourcing path names a text column to build text", async () => {
  const offenders: string[] = [];
  for (const u of SOURCING_PATH) {
    const src = await Deno.readTextFile(u);
    src.split("\n").forEach((line, i) => {
      if (!namesColumn(line) || allowed(line)) return;
      offenders.push(`${u.pathname.split("/").pop()}:${i + 1} ${line.trim()}`);
    });
  }
  assertEquals(
    offenders, [],
    `only rowTextOf assembles a row's text, and only ROW_TEXT_COLUMNS says which columns that takes.\n  ` +
    offenders.join("\n  "),
  );
});

Deno.test("1a. and rowTextOf itself names NO column — it reads ROW_TEXT_COLUMNS", async () => {
  const src = await Deno.readTextFile(new URL("./classSourcingScope.ts", import.meta.url));
  const whole = src.slice(src.indexOf("export function rowTextOf"), src.indexOf("export function rowTextSelect"));
  // CODE only. rowTextOf's header explains the duplicate-column defect and has to name the two
  // columns to do it; a comment assembles no text and states no rule. (Same fault as the earlier
  // {"fixes" and "No row in the pool states" assertions, which matched their own comments.)
  const body = whole.split("\n").filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*")).join("\n");
  assert(!TEXT_COLS.some((c) => body.includes(c)), "a column name inside rowTextOf would be a second statement of the rule");
  assert(body.includes("ROW_TEXT_COLUMNS[kind]"), "rowTextOf reads the constant");
});

Deno.test("1b. the re-read's SELECT is DERIVED from ROW_TEXT_COLUMNS, not written out again", () => {
  assertEquals(rowTextSelect("signal"), "id, claim_text, evidence_excerpt");
  assertEquals(rowTextSelect("own_word"), "id, quote");
  assertEquals(rowTextSelect("finding"), "id, body");
  // every column rowTextOf reads for a kind is in that kind's SELECT — the R6 ruling's second half
  for (const { kind } of ROW_TEXT_TABLES) {
    for (const col of ROW_TEXT_COLUMNS[kind]) {
      assert(rowTextSelect(kind).includes(col), `${kind}'s re-read must select ${col}`);
    }
  }
});

Deno.test("1c. rowTextOf is byte-identical to what selection built before R6", () => {
  const r = { claim_text: "over 90% of kinship youth", evidence_excerpt: "remained in family settings" };
  assertEquals(rowTextOf("signal", r), `${r.claim_text ?? ""} ${r.evidence_excerpt ?? ""}`.trim());
  assertEquals(rowTextOf("signal", { claim_text: "a", evidence_excerpt: null }), "a");
  assertEquals(rowTextOf("signal", { claim_text: null, evidence_excerpt: "b" }), "b");
  assertEquals(rowTextOf("own_word", { quote: "  spoken  " }), "spoken");
  assertEquals(rowTextOf("finding", { body: "the finding" }), "the finding");
});

// ── the re-read across the module boundary, against a db that behaves like PostgREST ────────────
/** Honours .select(cols) by PROJECTING to those columns and .in("id", ids) — so a re-read that
 *  forgets a column sees it as absent, exactly as PostgREST would deliver it. */
function fakeDb(tables: Record<string, Array<Record<string, unknown>>>) {
  const selects: Array<{ table: string; cols: string }> = [];
  return {
    selects,
    from: (table: string) => {
      let rows = [...(tables[table] ?? [])];
      let cols: string[] = [];
      const b: Record<string, unknown> = {};
      Object.assign(b, {
        select: (c: string) => { selects.push({ table, cols: c }); cols = c.split(",").map((x) => x.trim()); return b; },
        in: (c: string, vals: readonly unknown[]) => {
          rows = rows.filter((r) => vals.includes(r[c]))
            .map((r) => Object.fromEntries(cols.filter((k) => k in r).map((k) => [k, r[k]])));
          return Promise.resolve({ data: rows, error: null });
        },
      });
      return b;
    },
  };
}

const SIG = "dfb6da68-7d4e-46a2-8b58-7c039cbf5cf1";
const CLAIM = "in 1993 Edgewood established the first kinship program in the country; over 90% of kinship youth remained in family settings 18 months on";
const ROW = { id: SIG, claim_text: CLAIM, evidence_excerpt: CLAIM };
const FULL = rowTextOf("signal", ROW);

/** The shape row 9830's block had: one carried line on a span of a signal row. */
async function blockOn(text: string, start: number, end: number): Promise<CarriedBlock> {
  return {
    unique_attributes: {
      primary: { row_id: SIG, row_sha: await sha256Hex(text), start, end, cls: "record", clause_index: 1, specifics: ["1993", "first"] },
      second: null,
      stored_text: text.slice(start, end),
      rejected: [],
    },
  } as unknown as CarriedBlock;
}

Deno.test("2. the re-read of a known-good carry reports NO drift (the 9830 case, now green)", async () => {
  const start = FULL.indexOf("established"), end = start + 52;
  const block = await blockOn(FULL, start, end);
  const db = fakeDb({ signals: [ROW], findings: [], own_words_candidates: [] });
  const now = await reReadRowTexts(db, [SIG]);
  assertEquals(now[SIG], FULL, "the re-read must rebuild the SELECTION's text");
  assertEquals(now[SIG].length, FULL.length);
  assertEquals(await driftedSpans(block, now), [], "no drift — the row has not moved");
  // and the re-read asked for both columns, which is the fix
  assertEquals(db.selects.find((s) => s.table === "signals")?.cols, "id, claim_text, evidence_excerpt");
});

// The 2026-10-16 ruling collapses a row whose two columns say the same thing, and the fixture above
// is exactly that shape — so on IT the pre-R6 defect can no longer reproduce: both assemblers now
// return the same string. The defect was never about duplication; it was about one assembler reading
// FEWER COLUMNS than another. That still happens, on a row whose columns genuinely differ, and that
// is the row this test now uses.
const EVIDENCE = "the program placed 240 youth with relatives between 1993 and 2011";
const ROW_DISTINCT = { id: SIG, claim_text: CLAIM, evidence_excerpt: EVIDENCE };
const FULL_DISTINCT = rowTextOf("signal", ROW_DISTINCT);

Deno.test("2b. the PRE-R6 re-read (claim_text alone) is what refused row 9830", async () => {
  const start = FULL_DISTINCT.indexOf("established"), end = start + 52;
  const block = await blockOn(FULL_DISTINCT, start, end);
  const pre = { [SIG]: CLAIM };                       // one column, as the old loop built it
  const bad = await driftedSpans(block, pre);
  assertEquals(bad.map((b) => b.why), ["sha_drift"], "the defect reproduces exactly");
  assertEquals(CLAIM.length, 137);
  assertEquals(FULL_DISTINCT.length, CLAIM.length + 1 + EVIDENCE.length,
    "both columns are kept when they say different things");
  assert(FULL_DISTINCT.length > CLAIM.length, "two different texts for one row");
});

Deno.test("3. a MUTATED row reports sha_drift (the guard still bites after the fix)", async () => {
  const start = FULL.indexOf("established"), end = start + 52;
  const block = await blockOn(FULL, start, end);
  const db = fakeDb({ signals: [{ ...ROW, claim_text: CLAIM.replace("1993", "1994") }], findings: [], own_words_candidates: [] });
  const bad = await driftedSpans(block, await reReadRowTexts(db, [SIG]));
  assertEquals(bad.map((b) => b.why), ["sha_drift"]);
});

Deno.test("3b. a mutation in the SECOND column alone still reports sha_drift (pre-R6 it was invisible)", async () => {
  const start = FULL.indexOf("established"), end = start + 52;
  const block = await blockOn(FULL, start, end);
  const db = fakeDb({ signals: [{ ...ROW, evidence_excerpt: CLAIM.replace("90%", "80%") }], findings: [], own_words_candidates: [] });
  const bad = await driftedSpans(block, await reReadRowTexts(db, [SIG]));
  assertEquals(bad.map((b) => b.why), ["sha_drift"], "R6 widened what the re-read can SEE, not only what it accepts");
});

Deno.test("4. a SHORTENED row reports sha_drift — shortening moves the text", async () => {
  const start = FULL.indexOf("established"), end = start + 52;
  const shortened = FULL.slice(0, start + 10);
  const db = fakeDb({ signals: [{ id: SIG, claim_text: shortened, evidence_excerpt: null }], findings: [], own_words_candidates: [] });
  const now = await reReadRowTexts(db, [SIG]);
  assertEquals(now[SIG], shortened, "the re-read sees the row as it now is");
  assertEquals((await driftedSpans(await blockOn(FULL, start, end), now)).map((b) => b.why), ["sha_drift"]);
});

Deno.test("4b. span_mismatch is the verdict when the sha holds but the OFFSETS do not", async () => {
  // The only way past the sha check is a row whose text is unchanged — so span_mismatch is about the
  // block itself: offsets that no longer hold the text that was stored. (A shortened row never
  // reaches this check; its sha moves first, which is why leg 4 reads sha_drift and not this.)
  const start = FULL.indexOf("established"), end = start + 52;
  const block = await blockOn(FULL, start, end);
  // the line was stored from a DIFFERENT clause than the offsets name
  (block.unique_attributes as { stored_text: string }).stored_text = "over 90% of kinship youth remained in family settings";
  const db = fakeDb({ signals: [ROW], findings: [], own_words_candidates: [] });
  const bad = await driftedSpans(block, await reReadRowTexts(db, [SIG]));
  assertEquals(bad.map((b) => b.why), ["span_mismatch"]);
  assertEquals(bad[0].row_id, SIG);
});

Deno.test("5. a DELETED row reports row_missing; an EMPTIED row reports sha_drift", async () => {
  const start = FULL.indexOf("established"), end = start + 52;
  const block = await blockOn(FULL, start, end);
  const gone = fakeDb({ signals: [], findings: [], own_words_candidates: [] });
  assertEquals((await driftedSpans(block, await reReadRowTexts(gone, [SIG]))).map((b) => b.why), ["row_missing"]);
  const empty = fakeDb({ signals: [{ id: SIG, claim_text: null, evidence_excerpt: null }], findings: [], own_words_candidates: [] });
  const now = await reReadRowTexts(empty, [SIG]);
  assertEquals(now[SIG], "", "present but empty keeps its entry — emptied is not the same fact as gone");
  assertEquals((await driftedSpans(block, now)).map((b) => b.why), ["sha_drift"]);
});

Deno.test("6. the re-read covers every table a carried row can come from, each with its own columns", async () => {
  const db = fakeDb({
    signals: [{ id: "s1", claim_text: "sig", evidence_excerpt: "excerpt" }],
    findings: [{ id: "f1", body: "a finding body" }],
    own_words_candidates: [{ id: "o1", quote: "her own words" }],
  });
  assertEquals(await reReadRowTexts(db, ["s1", "f1", "o1"]), {
    s1: "sig excerpt", f1: "a finding body", o1: "her own words",
  });
  assertEquals(db.selects, [
    { table: "signals", cols: "id, claim_text, evidence_excerpt" },
    { table: "findings", cols: "id, body" },
    { table: "own_words_candidates", cols: "id, quote" },
  ]);
});

Deno.test("7. no ids ⇒ no query at all", async () => {
  const db = fakeDb({ signals: [{ id: "s1", claim_text: "x", evidence_excerpt: "" }] });
  assertEquals(await reReadRowTexts(db, []), {});
  assertEquals(db.selects, []);
});

// ── ACROSS THE MODULE BOUNDARY, against the live database ───────────────────────────────────────
//
// Every leg above runs the real reReadRowTexts over a db that projects to the columns it selected —
// which is what PostgREST does, and enough to catch a forgotten column. It is still not the wire.
// Row 9830's defect survived a green module because carriedSpan.test.ts leg 10 hands driftedSpans
// the right text; only a run that actually asked the database could see it. So this leg asks it.
//
// Gated on the local stack's env, in the house pattern (interview-parser/handler4e.test.ts): it
// runs when SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are set and is skipped when they are not,
// rather than failing a clean checkout. Read-only: one SELECT per table, no write of any kind.
const URL_ = Deno.env.get("SUPABASE_URL") ?? "";
const KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const live = URL_ !== "" && KEY !== "";

// the two rows the Edgewood carry chose, and the spans row 9830 refused
const LIVE_SPANS = [
  { row_id: "ba7ee838-1af8-4c33-95fc-8286dd18f9d8", start: 42, end: 176 },
  { row_id: "dfb6da68-7d4e-46a2-8b58-7c039cbf5cf1", start: 45, end: 114 },
];

Deno.test({
  name: "8. LIVE: the re-read of row 9830's two carried rows reports NO drift",
  ignore: !live,
  fn: async () => {
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.57.4");
    const db = createClient(URL_, KEY);

    // what SELECTION sees: liveRecordCandidates' own query, built by rowTextOf
    const { data: sel } = await db.from("signals")
      .select("id, claim_text, evidence_excerpt")
      .in("id", LIVE_SPANS.map((s) => s.row_id));
    const selectionText: Record<string, string> = {};
    for (const r of (sel ?? []) as Array<Record<string, unknown>>) selectionText[String(r.id)] = rowTextOf("signal", r);

    // what the RE-READ sees, through the real path
    const now = await reReadRowTexts(db as unknown as { from: (t: string) => unknown }, LIVE_SPANS.map((s) => s.row_id));

    for (const s of LIVE_SPANS) {
      assertEquals(now[s.row_id], selectionText[s.row_id], `${s.row_id.slice(0, 8)}: the two sides must read ONE text`);
      assert(now[s.row_id].length > 0, `${s.row_id.slice(0, 8)} is present in the live record`);
    }

    // a block exactly as the carry built it, hashed from the live text, then re-read and compared
    const block: Record<string, unknown> = {};
    for (const [i, s] of LIVE_SPANS.entries()) {
      const text = selectionText[s.row_id];
      block[`unique_attributes[${i}]`] = {
        primary: { row_id: s.row_id, row_sha: await sha256Hex(text), start: s.start, end: s.end, cls: "record", clause_index: 1, specifics: [] },
        second: null, stored_text: text.slice(s.start, s.end), rejected: [],
      };
    }
    assertEquals(await driftedSpans(block as unknown as CarriedBlock, now), [], "nothing has drifted — the stage may proceed");
  },
});

// ── ONLY DISTINCT COLUMNS ARE JOINED (operator ruling, 2026-10-16) ─────────────────────────────
//
// A signal's text was claim + " " + evidence unconditionally, and on 2196 of 3175 signals the two
// columns are byte-identical — so the row text was one sentence twice, joined by a space and no
// punctuation. The clause splitter sees no sentence end at that seam, so a clause can run off the
// end of copy 1 into the start of copy 2: IAQM's staged positioning carried span {102,214} over a
// seam at 175 and rendered "...dry ice blasting, decontamination BBB accredited since September 7,
// 2005". These two tests are the floor and the ceiling of the rule.

Deno.test("DUP. a row whose columns say the same thing is read ONCE, and no clause spans a seam", () => {
  const one = "BBB accredited since September 7, 2005; services span mold removal, dry ice blasting, decontamination";
  const text = rowTextOf("signal", { claim_text: one, evidence_excerpt: one });
  assertEquals(text, one, "the duplicate column is dropped before the join");
  assertEquals(text.length, one.length);
  // the seam is what made the defect: with the duplicate gone there is no second copy to run into
  assert(!text.includes("decontamination BBB"), "the clause splitter can no longer cross a seam");
  assertEquals((text.match(/BBB accredited/g) ?? []).length, 1, "stated once");
  // containment, not equality: a column that merely repeats PART of an earlier one adds nothing
  assertEquals(rowTextOf("signal", { claim_text: one, evidence_excerpt: "dry ice blasting" }), one);
});

Deno.test("DUP. a row whose columns say DIFFERENT things keeps both, in order", () => {
  const claim = "Edgewood established the first kinship program in the country";
  const evidence = "the program placed 240 youth with relatives";
  assertEquals(rowTextOf("signal", { claim_text: claim, evidence_excerpt: evidence }),
    `${claim} ${evidence}`, "nothing is dropped when the second column adds something");
  // a column that CONTAINS an earlier one is still kept — the rule drops the contained, not the container
  const long = `${claim} and ran it for three decades`;
  assertEquals(rowTextOf("signal", { claim_text: claim, evidence_excerpt: long }), `${claim} ${long}`);
  // and the single-column kinds are untouched by any of this
  assertEquals(rowTextOf("own_word", { quote: "  spoken  " }), "spoken");
  assertEquals(rowTextOf("finding", { body: "the finding" }), "the finding");
});
