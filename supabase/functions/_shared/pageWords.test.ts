// Operator ruling 39 (2026-10-22) — the page-words rule (proposal 37). Each test is the target of one plant:
//   PW-1  P37-1  the framing list: "Spectrum promises … with a commitment to providing …" over its own row passes
//   PW-2  P37-2  hyphen / slash normalization: "fiber-powered, high-bandwidth" passes against "powered by Fiber … high bandwidth"
//   PW-3  P37-3  the threshold is 2: a single unsupported generic noun does not flip a line
//   PW-4  P37-4  the company's own name words are never counted
//   PW-5  P37-5  promote re-runs the rule (S1 → level → page words → flip) and fails closed
//   PW-7  P37-7  a V1 carry passes by construction: every captured Spectrum span holds against its own row
//   PW-8  P37-8  R37: a failing predecessor line joins the withheld set, so C1 licenses its drop
//   PW-S         the stage re-stamp flips a failing record/you slot where it lives, after the judge, before the insert;
//                the slot walker sees exactly linesOfStoredPayload's lines
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { applyPageWordsRestamp, PAGE_WORDS_THRESHOLD, pageWordsVerdicts, pageWordsWithheldKeys, unsupportedContentWords } from "./pageWordsRule.ts";
import { promotePageWordsRefusal } from "./publicReadPromote.ts";
import { citedSlotsOfStoredPayload, linesOfStoredPayload } from "./citedLines.ts";
import { classifyContinuity } from "./stageContinuity.ts";
import { unionWithheld } from "./readLevel.ts";

const read = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));
const POOL = JSON.parse(await read("./fixtures/catalogue/spectrum-pool-20261022.json")) as { rows: Array<{ id: string; text: string }>; spans_before_34: Record<string, Array<{ text: string }>> };
const TEXT = Object.fromEntries(POOL.rows.map((r) => [r.id, r.text]));
const LEVEL = JSON.parse(await read("./fixtures/readLevel/reads-20261022.json")).companies as Record<string, Record<string, Record<string, unknown>>>;

Deno.test("PW-1 framing words are not content — the current promise passes over its own row (P37-1)", () => {
  const line = "Spectrum promises reliable and affordable services plus 24/7 customer service, with a commitment to providing the best customer experience possible.";
  const row = "With reliable and affordable services plus 24/7 customer service, Spectrum is committed to providing the best customer experience possible.";
  assertEquals(unsupportedContentWords(line, row, "Spectrum"), []);
});

Deno.test("PW-2 hyphen and slash variants are the same words (P37-2)", () => {
  assertEquals(unsupportedContentWords("a fiber-powered, high-bandwidth network with 24/7 support", "Our network is powered by Fiber, high bandwidth, support 24 7", "Acme"), []);
  assertEquals(unsupportedContentWords("U.S.-based phone support", "100% US based phone support", "Acme"), []);
  // as proposed, a word passes when it IS one of the page's stems — "business" against "businesses"
  assertEquals(unsupportedContentWords("residential and business customers", "homes and businesses customers", "Acme"), ["residential"]);
});

Deno.test("PW-3 the threshold is 2 — one unsupported generic noun does not flip a line (P37-3)", () => {
  assertEquals(PAGE_WORDS_THRESHOLD, 2);
  const payload = { promise: "Acme offers internet to customers in 41 states.", citations: ["r1"], class: "you" };
  const v = pageWordsVerdicts(payload, { r1: "Acme offers internet in 41 states" }, "Acme");
  assertEquals(v.map((x) => [x.unsupported, x.flips]), [[["customers"], false]]);
  const two = pageWordsVerdicts({ promise: "Acme offers bundled internet to customers.", citations: ["r1"], class: "you" }, { r1: "Acme offers internet" }, "Acme");
  assertEquals(two.map((x) => x.flips), [true]);
});

Deno.test("PW-4 the company's own name words are never counted (P37-4)", () => {
  assertEquals(unsupportedContentWords("Acme Widgets ships the fastest repairs", "ships the fastest repairs", "Acme Widgets"), []);
});

Deno.test("PW-5 promote re-runs the rule before the flip, and fails closed (P37-5)", async () => {
  const src = await read("./publicReadPromote.ts");
  const s1 = src.indexOf("const s1 = await promoteS1Refusal("), lv = src.indexOf("const lvl = await promoteLevelRefusal("),
    pw = src.indexOf("const pw = await promotePageWordsRefusal(supabase, companyId, stagedRow!);"), flip = src.indexOf("update({ is_current: true })");
  assert(s1 > 0 && lv > s1 && pw > lv && flip > pw, "promote: S1 → level → page words → flip");
  assert(src.includes("if (pw) throw new PromoteRefused(stagedId, kind, `PAGE WORDS:"), "a failing line refuses the promote");
  // behaviour: a stored you line whose words left its row refuses; a re-read that throws refuses too (fails closed)
  const fake = (texts: Record<string, string> | "throw") => ({
    from: (t: string) => {
      const q: Record<string, unknown> = {};
      const done = () => {
        if (texts === "throw") throw new Error("boom");
        if (t === "companies") return { data: { name: "Acme" }, error: null };
        return { data: Object.entries(texts).map(([id, text]) => ({ id, quote: text, evidence_excerpt: text, body: text, raw_payload: { excerpt_guard: { traced: true } }, claim_text: text })), error: null };
      };
      for (const m of ["select", "eq", "in", "is", "order", "limit"]) q[m] = () => q;
      q.maybeSingle = async () => done();
      q.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => { try { return Promise.resolve(done()).then(res, rej); } catch (e) { return Promise.reject(e).then(res, rej); } };
      return q;
    },
  });
  const row = { payload: { promise: "Acme delivers bundled savings and loyal retention.", citations: ["r1"], class: "you" } };
  const refused = await promotePageWordsRefusal(fake({ r1: "Acme sells internet" }) as never, "co", row);
  assert(refused && refused.includes("bundled"), `refused: ${refused}`);
  assert(await promotePageWordsRefusal(fake("throw") as never, "co", row), "a re-read that cannot be made refuses");
});

Deno.test("PW-7 a V1 carry passes by construction — every captured Spectrum span holds against its own row (P37-7)", () => {
  let n = 0;
  for (const [id, spans] of Object.entries(POOL.spans_before_34)) for (const sp of spans) {
    assertEquals(unsupportedContentWords(sp.text, TEXT[id], "Spectrum"), [], `${id.slice(0, 8)}: "${sp.text.slice(0, 60)}"`);
    n++;
  }
  assert(n > 0, "the fixture carries spans");
});

Deno.test("PW-8 R37 — a failing predecessor line is withheld, so C1 licenses its drop instead of demanding it (P37-8)", async () => {
  const current = linesOfStoredPayload(LEVEL.Spectrum.positioning);
  const cat = current.find((l) => l.field === "market_category")!;
  assert(cat && TEXT[cat.refs[0]], "the fixture carries the category line and its row");
  const v = pageWordsVerdicts(LEVEL.Spectrum.positioning, TEXT, "Spectrum", { unclassed: "include" });
  const vc = v.find((x) => x.field === "market_category")!;
  assert(vc.flips, `the category line fails: ${vc.unsupported.join(", ")}`);
  const r37 = pageWordsWithheldKeys(v);
  // C1 continues a line through ANY staged line sharing its citation, so both lines on that row leave the staged read;
  // best_fit (internet, mobile, tv, services) fails the rule too
  assert(v.find((x) => x.field === "best_fit")!.flips, "best_fit fails too");
  const staged = current.filter((l) => l.field !== "market_category" && l.field !== "best_fit");
  const refs = [...new Set(current.flatMap((l) => l.refs))];
  const args = { currentLines: current, stagedLines: staged, newLedgerIds: new Set(refs), textByRef: TEXT, classByRef: Object.fromEntries(refs.map((r) => [r, "you"])), sourcingIds: new Set(refs) };
  const withR37 = classifyContinuity({ ...args, withheld: unionWithheld(new Set(), r37) });
  assert(!withR37.dropped.some((d) => JSON.stringify(d).includes("internet, mobile, and TV service provider")), "licensed under R37");
  const without = classifyContinuity({ ...args, withheld: new Set() });
  assert(without.dropped.some((d) => JSON.stringify(d).includes("internet, mobile, and TV service provider")), "demanded without it (the control)");
  const gen = await read("../generate-public-read/index.ts");
  assert(gen.includes("for (const k of pageWordsWithheldKeys(pageWords)) out.withheld.add(k);"), "the generator's withheld set takes the R37 keys");
  // a legacy predecessor has no classes map: a line citing an ANALYSIS row is our read by the row, never judged
  assert(gen.includes("if (isAnalysisRow(sg)) ourReadIds.add(sg.id);"), "analysis rows a legacy line cites are our read");
  const legacy = { value_for_customer: "seamless multi room integrated pop sound", value_citations: ["a1"] };
  assertEquals(pageWordsVerdicts(legacy, { a1: "speakers" }, "Acme", { unclassed: "include", ourReadIds: new Set(["a1"]) }), []);
  assertEquals(pageWordsVerdicts(legacy, { a1: "speakers" }, "Acme", { unclassed: "include" }).map((x) => x.flips), [true]);
});

Deno.test("PW-S the stage re-stamp flips a failing slot where it lives; the walker sees linesOfStoredPayload's lines", async () => {
  const payload: Record<string, unknown> = {
    best_fit_customers: "homes and businesses seeking affordable, reliable connectivity and bundled services", best_fit_citations: ["r1"], best_fit_class: "you",
    value_for_customer: "fast internet in 41 states", value_citations: ["r1"], value_class: "you",
    unique_attributes: [{ text: "cross-sell retention maximizer", citations: ["r1"], class: "record" }, { text: "our reading", citations: ["r1"], class: "our_read" }],
  };
  assertEquals(citedSlotsOfStoredPayload(payload).map((s) => s.line), linesOfStoredPayload(payload));
  const v = pageWordsVerdicts(payload, { r1: "Acme offers fast internet to homes and businesses in 41 states" }, "Acme");
  assertEquals(applyPageWordsRestamp(payload, v), 2);
  assertEquals([payload.best_fit_class, payload.value_class, (payload.unique_attributes as Array<{ class: string }>).map((u) => u.class)], ["our_read", "you", ["our_read", "our_read"]]);
  const gen = await read("../generate-public-read/index.ts");
  const at = gen.indexOf("const built = prepareStorage(kind, payload, verdict);"), stamp = gen.indexOf("applyPageWordsRestamp(built.stored, vStored);"), ins = gen.indexOf('await supabase.from("public_reads").insert({\n          company_id, kind, payload: built.staged,');
  assert(at > 0 && stamp > at && ins > stamp, "re-stamp after the judge (inside commit), before the stage insert");
  assert(gen.includes("page_words: pageWordsResults[kind as Kind]"), "recorded under excluded_by_rule.page_words");
});
