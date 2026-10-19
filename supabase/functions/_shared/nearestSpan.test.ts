// R27 (2026-10-18) — the page span an e4 refusal came closest to, with its offset in the RAW page.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { nearestSpan } from "./nearestSpan.ts";
import { excerptTracesToSource } from "../../../src/lib/evidenceExcerptGuard.ts";

const PAGE = "Insights\n🟡 This company has maintained an active DOT status for 1 year but had no inspections .\n2025\n9 changes";

Deno.test("the pilot-2 case: one word changed → the nearest span is the page's sentence, at its raw offset, as the page carries it", () => {
  const cand = "The company has maintained an active DOT status for 1 year but had no inspections";
  assert(!excerptTracesToSource(cand, PAGE), "e4 refuses the one-word change");
  const n = nearestSpan(cand, PAGE)!;
  assert(n, "a span is named");
  assertEquals(n.text, "company has maintained an active DOT status for 1 year but had no inspections");
  assertEquals(PAGE.slice(n.offset, n.offset + n.length), n.text, "offset and length index the raw page");
  assertEquals(n.offset, PAGE.indexOf("company has maintained"));
});

Deno.test("case and whitespace differences are normalized like e4 (offset still indexes the raw page); a run below the minimum names nothing", () => {
  const page = "Cargo Classifications\nTruck   Transportation\nGeneral Freight\nYes";
  const n = nearestSpan("truck transportation and general freight", page)!;
  assertEquals(n.text, "Truck   Transportation");   // the raw span, with the page's own spacing
  assertEquals(n.offset, page.indexOf("Truck"));
  assertEquals(nearestSpan("completely unrelated words", page), null);
  assertEquals(nearestSpan("", page), null);
  assertEquals(nearestSpan("anything", ""), null);
});

Deno.test("a verbatim candidate names itself (sanity: the longest run is the whole candidate)", () => {
  const cand = "This company has maintained an active DOT status for 1 year but had no inspections";
  const n = nearestSpan(cand, PAGE)!;
  assertEquals(n.text, cand); assertEquals(n.normalized_length, cand.length);
});
