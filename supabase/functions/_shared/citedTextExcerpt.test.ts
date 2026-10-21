// Ruling 4 (2026-10-21): a web_search row's evidence_excerpt is one cited_text span the tool returned for its URL — the
// whole span — or blank; never the model's summary. Analysis rows keep the carve-out.
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { citedTextExcerpt } from "./citedTextExcerpt.ts";
import { applyMintExcerptGuard } from "./evidencePhase1.ts";
import { extractCitedSpans } from "../../../src/lib/firstRead/citationSource.ts";

const RESP = { content: [
  { type: "server_tool_use", name: "web_search" },
  { type: "text", text: "Spectrum sells internet", citations: [
    { type: "web_search_result_location", url: "https://www.cabletv.com/spectrum", cited_text: "Spectrum sells internet, TV, mobile, and home phone across 41 states." },
    { type: "web_search_result_location", url: "https://www.cabletv.com/spectrum", cited_text: "Prices start at $30/mo." },
  ] },
] };

Deno.test("spans: every cited_text per URL, verbatim, in order", () => {
  const m = extractCitedSpans(RESP);
  assertEquals([...m.values()], [["Spectrum sells internet, TV, mobile, and home phone across 41 states.", "Prices start at $30/mo."]]);
});

Deno.test("the rule: inside a span ⇒ the whole span; a summary ⇒ blank; no span for the URL ⇒ blank", () => {
  const m = extractCitedSpans(RESP);
  assertEquals(citedTextExcerpt("TV, mobile, and home phone", "https://www.cabletv.com/spectrum", m), { kind: "cited", evidence_excerpt: "Spectrum sells internet, TV, mobile, and home phone across 41 states." });
  assertEquals(citedTextExcerpt("Spectrum is the biggest telco after acquiring Cox", "https://www.cabletv.com/spectrum", m).kind, "blanked");
  assertEquals(citedTextExcerpt("anything", "https://forbes.com/x", m), { kind: "blanked", evidence_excerpt: "", unverified_excerpt: "anything", reason: "no_cited_text_for_url" });
  assertEquals(citedTextExcerpt("", "https://www.cabletv.com/spectrum", m), { kind: "no_excerpt" });
});

Deno.test("the mint guard applies it to every non-analysis draft; analysis keeps the carve-out", async () => {
  const rows: unknown[] = [];
  const sb = { from: () => ({ insert: (r: unknown) => { rows.push(r); return { select: () => ({ single: () => Promise.resolve({ data: { id: "x" }, error: null }) }) , then: (f: (v: unknown) => unknown) => f({ error: null }) }; }, select: () => ({ eq: () => ({ eq: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }) }) }), upsert: () => Promise.resolve({ error: null }) }) };
  const mk = (excerpt: string, voice_class: string) => ({ company_id: "co", source_type: "public_baseline_run", source_url: "https://www.cabletv.com/spectrum", signal_band: "outside", voice_class, claim_text: excerpt, evidence_excerpt: excerpt, raw_payload: {} }) as never;
  const summary = mk("Spectrum just became the biggest telco provider in the U.S.", "outside_voice_about_client");
  const inSpan = mk("Prices start at $30/mo.", "outside_voice_about_client");
  const analysis = mk("Our reading: price-led.", "analysis");
  await applyMintExcerptGuard({ supabase: sb, companyId: "co", runId: "r", signals: [summary, inSpan, analysis], sourceTextByUrl: new Map(), webSearchCitedSpans: extractCitedSpans(RESP) });
  const s = summary as unknown as { evidence_excerpt: string; claim_text: string; raw_payload: { excerpt_guard: Record<string, unknown> } };
  assertEquals([s.evidence_excerpt, s.claim_text, s.raw_payload.excerpt_guard.basis, s.raw_payload.excerpt_guard.traced], ["", "Spectrum just became the biggest telco provider in the U.S.", "websearch_cited_text", false]);
  assertEquals((inSpan as unknown as { evidence_excerpt: string }).evidence_excerpt, "Prices start at $30/mo.");
  assertEquals((analysis as unknown as { evidence_excerpt: string }).evidence_excerpt, "Our reading: price-led.");
});
