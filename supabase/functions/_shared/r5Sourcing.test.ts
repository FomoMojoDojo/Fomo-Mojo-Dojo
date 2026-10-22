// R5 (operator ruling, signed 2026-10-16, built 2026-10-22): every sourcing gate tests only the cited row's VERIFIED
// page words — never claim_text. Matching ignores case, possessives and punctuation-only differences.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { rowTextOf } from "./classSourcingScope.ts";
import { nameSourcedIn, s1Unsourced, sourcedIn, unsourcedNames } from "./classFactCheck.ts";

// the shape of Spectrum's 492bda10: our claim states the figures; the tool's cited text was cut off before them
const ROW_492 = {
  claim_text: "Spectrum operates across 45 states, serving roughly 37 million customers after the Cox merger.",
  evidence_excerpt: "Spectrum is the consumer brand of Charter Communications, and as of August 2026, it’s the largest telco operator in the U.S. by footprint.\n\nCharter cl...",
  raw_payload: { excerpt_guard: { basis: "websearch_cited_text", traced: true } },
};

Deno.test("R5: a figure stated only in claim_text is UNSOURCED — the row speaks only through its excerpt", () => {
  const r = s1Unsourced({ field: "unique_attributes[0]", cls: "record", text: "reaching across 45 states and serving roughly 37 million customers", citedSourceTexts: [rowTextOf("signal", ROW_492)] });
  assertEquals(r.unsourced.map((u) => u.token).sort(), ["37", "45"]);
  const ok = s1Unsourced({ field: "market_category", cls: "record", text: "the largest telco operator in the U.S. by footprint", citedSourceTexts: [rowTextOf("signal", ROW_492)] });
  assertEquals(ok.unsourced, [], "what the excerpt says still sources");
});

Deno.test("R5: an UNVERIFIED excerpt sources nothing (run-81's model-summary excerpts)", () => {
  const summary = { claim_text: "x", evidence_excerpt: "Spectrum sells internet across 45 U.S. states", raw_payload: { excerpt_guard: { basis: "none", reason: "page_not_retained" } } };
  assertEquals(rowTextOf("signal", summary), "");
  assertEquals(s1Unsourced({ field: "f", cls: "record", text: "across 45 U.S. states", citedSourceTexts: [rowTextOf("signal", summary)] }).unsourced.map((u) => u.token), ["45", "U.S."], "the figure and the name both fail: the row has no page words");
});

Deno.test("R5 matching: case, possessives and punctuation-only differences are the same words; nothing else is", () => {
  assert(sourcedIn("Spectrum Mobile's", "Spectrum Mobile ’s $100 trade-in offer"));
  assert(sourcedIn("Internet", "all fiber-powered internet plans"));
  assert(sourcedIn("24/7", "support 24 / 7"));
  assert(sourcedIn("U.S.-based", "100% U.S. based phone support"));
  assert(!nameSourcedIn("Air", "a fair price"), "a name keeps word boundaries after the fold");
  assert(sourcedIn("5", "nationwide 5G access"), "a figure inside a token still counts, as before the fold");
  assert(!sourcedIn("45 states", "Charter cl..."));
  assertEquals(unsourcedNames({ text: "Spectrum Mobile’s trade-in", cls: "you", citedSourceTexts: ["eligible customers can use spectrum mobile's $100 trade-in"] }), []);
  assertEquals(unsourcedNames({ text: "Wasabi GovCloud", cls: "you", citedSourceTexts: ["Wasabi hot cloud storage"] }), ["Wasabi GovCloud"]);
});
