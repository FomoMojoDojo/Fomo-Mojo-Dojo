// Operator ruling 34 (2026-10-22) — the ledger grouped by class, filings tagged, sources named per field, and the
// continue block that no longer steers only toward own words. Fixture: fixtures/catalogue/spectrum-pool-20261022.json —
// copied text of Spectrum's positioning pool (ruling 33, cap 30) and the V1 spans captured with the pre-ruling-34 code.
//   C34-1  the four headers, exactly, in order; every row under its own class's header
//   C34-2  every own_filing_related row is grouped under YOU — FILINGS and carries " · filing"
//   C34-3  the continue-block sentence, exactly; the old ending is gone
//   C34-4  SOURCES BY FIELD, exactly, inside GEN_POSITIONING and GEN_STRATEGY
//   C34-V1 V1 is untouched: every row's text reaches textByRef byte-exact and its spans equal the pre-34 capture;
//          the carry choice does not depend on ref order
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildCatalogue, CATALOGUE_HEADERS } from "../generate-public-read/index.ts";
import { chooseSpan, usableSpansOf, type CarriedSpan } from "./carriedSpan.ts";
import type { InputRow } from "./publicReadInputs.ts";

type FixRow = { id: string; kind: string; source_class: "record" | "you" | "our_read"; text: string; source_title: string | null; provenance: string; own_filing_related: boolean };
const FIX = JSON.parse(await Deno.readTextFile(new URL("./fixtures/catalogue/spectrum-pool-20261022.json", import.meta.url))) as { rows: FixRow[]; spans_before_34: Record<string, Array<{ start: number; end: number; text: string; row_sha: string }>> };
const inputs: InputRow[] = FIX.rows.map((r) => ({ id: r.id, kind: r.kind, provenance: r.provenance, text: r.text, source_class: r.source_class, source_title: r.source_title, filing: r.own_filing_related }));
const read = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));

Deno.test("C34-1 the ledger is grouped under the four headers, exactly and in order; every row sits under its class", () => {
  const cat = buildCatalogue(inputs);
  const lines = cat.text.split("\n");
  const H = [
    "THE RECORD — what others say: press, analysts, customers, registries.",
    "YOU — FILINGS — what the company stated in its own regulatory filings.",
    "YOU — the company's own site and own words.",
    "OUR READ — our analysis of the record; cite it as our reading, never as fact.",
  ];
  assertEquals([CATALOGUE_HEADERS.record, CATALOGUE_HEADERS.filing, CATALOGUE_HEADERS.you, CATALOGUE_HEADERS.our_read], H);
  const at = H.map((h) => lines.indexOf(h));
  assert(at.every((i) => i >= 0), `a header is missing: ${JSON.stringify(at)}`);
  assert(at[0] < at[1] && at[1] < at[2] && at[2] < at[3], "headers in order");
  const groupOfLine = (i: number) => at.filter((h) => h < i).length - 1;
  for (const row of cat.rows) {
    const i = lines.findIndex((l) => l.startsWith(`[${row.ref}] `));
    const want = row.cls === "record" ? 0 : row.cls === "our_read" ? 3 : row.filing ? 1 : 2;
    assertEquals(groupOfLine(i), want, `${row.ref} under header ${want}`);
  }
  // a row text may carry newlines (a filing's "#### Overview"), so count the ref-led lines, not all lines
  assertEquals(lines.filter((l) => /^\[[SOFD]\d+\] \(/.test(l)).length, cat.rows.length, "every row rendered once");
  assertEquals(lines.filter((l) => H.includes(l)).length, 4, "each header once");
});

Deno.test("C34-2 every own_filing_related row is under YOU — FILINGS and tagged ' · filing'", () => {
  const cat = buildCatalogue(inputs);
  const filingIds = new Set(FIX.rows.filter((r) => r.own_filing_related).map((r) => r.id));
  assert(filingIds.size >= 1, "the fixture carries filings");
  for (const [ref, id] of cat.uuidByRef) {
    const line = cat.text.split("\n").find((l) => l.startsWith(`[${ref}] `))!;
    if (filingIds.has(id)) assert(line.startsWith(`[${ref}] (signal · you · filing) `), `filing ${id.slice(0, 8)} tagged: ${line.slice(0, 60)}`);
    else assert(!line.includes(" · filing)"), `a non-filing is not tagged: ${line.slice(0, 60)}`);
  }
});

Deno.test("C34-3 the continue block carries the signed sentence exactly", async () => {
  const src = await read("./stageContinuity.ts");
  assert(src.includes("CURRENT LINES TO CONTINUE OR IMPROVE — the read you are replacing states these, and the rows they cite are in the ledger above. Keep each line's facts and its citation. Where a row under THE RECORD or YOU — FILINGS states the same fact, add that row to the line's citations (at most 3 in all). Write every other field from the whole ledger, not from these lines alone:\\n` + body;"), "the signed sentence");
  assert(!src.includes("the rows they cite are in the ledger above:\\n` + body;"), "the old ending is gone");
});

Deno.test("C34-4 SOURCES BY FIELD, exactly, inside GEN_POSITIONING and GEN_STRATEGY", async () => {
  const g = await read("../generate-public-read/index.ts");
  assert(g.includes("const SOURCES_BY_FIELD_POSITIONING = `SOURCES BY FIELD. best_fit_customers and alternatives come from THE RECORD — what customers, press and analysts say about who buys and what they would otherwise choose. A row under YOU may support them, but when THE RECORD speaks to them, cite THE RECORD. value_for_customer comes from THE RECORD where a row there states an outcome a customer got; use YOU only when no record row states one. market_category and unique_attributes may rest on YOU; a differentiator is stronger when THE RECORD confirms it, so cite both when both state it.`;"));
  assert(g.includes("const SOURCES_BY_FIELD_STRATEGY = `SOURCES BY FIELD. where_to_play, how_to_win and must_have_capabilities come first from YOU — FILINGS and THE RECORD: what the company told its regulators about its markets, competition, risks and plans, and what press and analysts report. Use the company's own site (YOU) to name the arena only where filings and the record are silent. winning_aspiration may rest on filings, the record or the company's own words.`;"));
  const pos = g.slice(g.indexOf("const GEN_POSITIONING = `"), g.indexOf("const GEN_STRATEGY = `"));
  const str = g.slice(g.indexOf("const GEN_STRATEGY = `"), g.indexOf("const GEN_PROMISE = `"));
  assert(pos.includes("${SOURCES_BY_FIELD_POSITIONING}\n${CONFLICTING_FIGURES_RULE}\nReturn ONLY JSON:"), "in the positioning prompt, before its JSON (ruling 42's line follows it)");
  assert(str.includes("${SOURCES_BY_FIELD_STRATEGY}\n${CONFLICTING_FIGURES_RULE}\nReturn ONLY JSON:"), "in the strategy prompt, before its JSON");
});

Deno.test("C34-V1 V1 is untouched — row text byte-exact, spans equal to the pre-34 capture, the carry choice order-free", async () => {
  const cat = buildCatalogue(inputs);
  const refById = new Map([...cat.uuidByRef].map(([ref, id]) => [id, ref]));
  const after: CarriedSpan[] = [];
  for (const r of FIX.rows) {
    assertEquals(cat.textByRef.get(refById.get(r.id)!), r.text, `${r.id.slice(0, 8)} text byte-exact`);
    const before = FIX.spans_before_34[r.id];
    if (!before) continue;
    const { spans } = await usableSpansOf(r.id, cat.textByRef.get(refById.get(r.id)!)!, r.source_class);
    assertEquals(spans.map((s) => ({ start: s.start, end: s.end, text: s.text, row_sha: s.row_sha })), before, `${r.id.slice(0, 8)} spans`);
    after.push(...spans);
  }
  assert(after.length === Object.values(FIX.spans_before_34).flat().length && after.length > 0, "every captured span is reproduced");
  // the grouped ref order changes the ORDER spans are gathered in; chooseSpan is a total order, so the carry cannot move
  assertEquals(chooseSpan([...after].reverse()), chooseSpan(after));
});
