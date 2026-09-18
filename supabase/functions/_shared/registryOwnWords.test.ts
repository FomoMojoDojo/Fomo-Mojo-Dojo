// C3b (ruling 2026-09-18) — registry self-reported text → own words. Fakes + the real Edgewood GuideStar page
// (fixtures/registry/guidestar_edgewood.txt = outside_page_snapshots.clean_text, sha 7905f8a4…; 7 self_reported spans).
//
// Guards (each with a by-hand bypass, reported):
//   admission     profile + spans_exact + ≥1 self_reported → admitted; filing_data page → excluded; spans_exact=false
//                 → excluded; a page with no self_reported span → excluded; site signals untouched
//   drift         the stored page's sha ≠ the basis sha → the extractor skips the URL (source guard: no fetch)
//   span only     the generator/judge input for a registry unit is registrySpanText(page, span) — never the page
//   bounded       a quote from the Mission span is NOT provable against the Our-programs span; it is against its own
//   span_mismatch on write an unprovable survivor is marked span_mismatch and nothing mints (source guard + predicate)
//   twins         retireParaphraseTwins strikes only LIVE publicly_declared claims backed by the span's signals,
//                 through set_claim_status with reason span_quote_minted:<claim>; struck / public_observed / other-
//                 signal claims untouched; idempotent across two mints
//   no snapshot   the registry loop writes nothing to own_words_page_snapshots and never calls fetchAndExtract
//   attribution   Edgewood's five self_reported rows attribute to the Our-programs span (index 2), none to Mission
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  admitRegistrySignal, attributeSignalsToSpans, isQuestionnaireSpan, partitionOwnWordsCorpus, registrySpanText, retireParaphraseTwins,
  spanQuoteVerified, TWIN_RETIRE_REASON,
} from "./registryOwnWords.ts";
import { classifyRegistryRow, isRegistryUrl, sectionSpans, spanTable } from "./registryClassifier.ts";
import { normalizeForHash, sha256Hex } from "./contentIdentity.ts";

const read = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));
const GS = "https://www.guidestar.org/profile/94-1186168";
const PP = "https://projects.propublica.org/nonprofits/organizations/941186168";
const page = async () => {
  const clean_text = (await read("./fixtures/registry/guidestar_edgewood.txt")).replace(/\n$/, "");
  return { clean_text, text_sha256: await sha256Hex(normalizeForHash(clean_text)), structured: null };
};
const ROWS: Record<string, string> = {
  "34405b08": "GuideStar/Candid profile confirms CSU created with SF DPH; accepts Kaiser and most private insurances and Medi-Cal SF; only CSU serving youth under 12 in Bay Area.",
  "8ed60855": "GuideStar/Candid profile confirms CSU created in conjunction with SF Dept of Public Health; only CSU serving youth under 12 in the Bay Area; accepts Kaiser, most private insurances and Medi-Cal of San Francisco.",
  "a94f1427": "GuideStar/Candid profile (EIN 94-1186168) lists Edgewood as serving SF and San Mateo counties; Drop-in Centers in San Bruno and Redwood City; CSU created in conjunction with SF DPH.",
  "ba7ee838": "GuideStar/Candid profile; EIN 94-1186168; CSU 'one of only a few CSUs designed to serve youth 5-17 in all of California and the only one serving youth under 12 in the Bay Area'; accepts Kaiser and most private insurances.",
  "e756386d": "Edgewood CSU is the only crisis stabilization unit serving youth under 12 in the Bay Area; opened 2014 in conjunction with SF Department of Public Health.",
};
/** a signal stamped by the C3a classifier on the real page */
async function stamped(id: string, url = GS) {
  const p = await page();
  const c = classifyRegistryRow({ url, text: ROWS[id] ?? "x", snapshot: p })!;
  return { id, source_url: url, claim_text: ROWS[id] ?? null, evidence_excerpt: null, raw_payload: { registry: c } };
}

Deno.test("admission: profile + spans_exact + self_reported spans → admitted (7 spans, the basis sha); filing_data / inexact / no-span → excluded; site pages untouched", async () => {
  const p = await page();
  const s = await stamped("e756386d");
  const a = admitRegistrySignal(s);
  assert(a.admitted);
  assertEquals([a.page_type, a.snapshot_sha, a.spans.length], ["profile", p.text_sha256, 7]);
  assert(a.spans.every((x) => x.section === "self_reported"));
  // filing_data page: a real ProPublica-stamped row → not_profile_page
  const pp = await read("./fixtures/registry/propublica_edgewood.txt");
  const ppc = classifyRegistryRow({ url: PP, text: "Revenue $31,008,000", snapshot: { clean_text: pp, text_sha256: "x", structured: null } })!;
  assertEquals(admitRegistrySignal({ id: "f", source_url: PP, raw_payload: { registry: ppc } }), { admitted: false, reason: "not_profile_page" });
  // inexact spans (the classifier failed closed) → excluded
  const inexact = { ...s, raw_payload: { registry: { ...(s.raw_payload.registry), basis: { ...s.raw_payload.registry.basis, spans_exact: false } } } };
  assertEquals(admitRegistrySignal(inexact), { admitted: false, reason: "spans_not_exact" });
  // no self_reported span (a profile page read without markers) → excluded
  const nospan = { ...s, raw_payload: { registry: { ...(s.raw_payload.registry), basis: { ...s.raw_payload.registry.basis, snapshot_sections: spanTable(sectionSpans("profile", "EIN\n94-1186168\nRuling year\n1958")) } } } };
  assertEquals(admitRegistrySignal(nospan), { admitted: false, reason: "no_self_reported_span" });
  assertEquals(admitRegistrySignal({ id: "z", source_url: GS, raw_payload: {} }), { admitted: false, reason: "no_registry_stamp" });
  // the corpus partition: site signals pass through untouched; one registry entry per URL; excluded carry reasons
  const site = { id: "s1", source_url: "https://edgewood.org/about/", raw_payload: null };
  const part = partitionOwnWordsCorpus([site, s, await stamped("34405b08"), { id: "f", source_url: PP, raw_payload: { registry: ppc } }], isRegistryUrl);
  assertEquals(part.site, [site]);
  assertEquals(part.registry.map((e) => [e.url, e.signals.length, e.spans.length]), [[GS, 2, 7]]);
  assertEquals(part.excluded, [{ url: PP, reason: "not_profile_page" }]);
});

Deno.test("bounded provability: a Mission quote is provable against the Mission span only; the same words against Our programs are not", async () => {
  const p = await page();
  const spans = sectionSpans("profile", p.clean_text).filter((x) => x.section === "self_reported");
  const mission = registrySpanText(p.clean_text, spans[0])!;
  const programs = registrySpanText(p.clean_text, spans[2])!;
  const quote = "We provide the people, place, and path for exceptional youth mental healthcare.";
  assert(spanQuoteVerified(quote, mission));
  assert(!spanQuoteVerified(quote, programs), "elsewhere on the page is not this span");
  assert(spanQuoteVerified("The Edgewood CSU is one of only a few CSUs designed to serve youth 5-17 years of age in the entire state of California", programs));
  assert(!spanQuoteVerified("a sentence the page never says", programs));
  // offsets that no longer fit the page fail closed
  assertEquals(registrySpanText(p.clean_text, { start: 5, end: 99_999 }), null);
  assertEquals(registrySpanText(p.clean_text, { start: 10, end: 10 }), null);
});

Deno.test("questionnaire sections: 'How we listen' and 'Our Sustainable Development Goals' are Candid's words — never minted; the organization's blocks are", async () => {
  const p = await page();
  const spans = sectionSpans("profile", p.clean_text).filter((x) => x.section === "self_reported").map((x) => registrySpanText(p.clean_text, x)!);
  assertEquals(spans.map((t) => [t.split("\n")[0], isQuestionnaireSpan(t)]), [
    ["Mission", false], ["What we aim to solve", false], ["Our programs", false], ["Our results", false],
    ["Our Sustainable Development Goals", true], ["Goals & Strategy", false], ["How we listen", true],
  ]);
  const src = await read("../extract-own-words/index.ts");
  assert(src.includes('if (isQuestionnaireSpan(text)) { pages.push({ url: `${entry.url}#span${i}`, fetched: true, registry_skipped: "questionnaire_section"'), "the registry loop skips questionnaire spans before any model call");
});

Deno.test("attribution: Edgewood's five self_reported rows sit in the Our-programs span (index 2); Mission gets none", async () => {
  const p = await page();
  const s = await stamped("e756386d");
  const a = admitRegistrySignal(s);
  assert(a.admitted);
  const signals = await Promise.all(Object.keys(ROWS).map((id) => stamped(id)));
  const m = attributeSignalsToSpans(signals, a.spans, p.clean_text);
  assertEquals([...m.keys()], [2]);
  assertEquals(m.get(2)!.sort(), Object.keys(ROWS).sort());
  // a row about nothing on the page attributes to no span
  assertEquals(attributeSignalsToSpans([{ id: "n", source_url: GS, claim_text: "zebra quantum lattice" }], a.spans, p.clean_text).size, 0);
});

/** claims + claim_signal_refs + the set_claim_status RPC, in memory */
function fakeDb(claims: Array<{ id: string; provenance: string; status: string }>, refs: Array<{ claim_id: string; signal_id: string }>) {
  const events: Array<{ id: string; status: string; reason: string; actor: string }> = [];
  const from = (t: string) => {
    let rows: Array<Record<string, unknown>> = t === "claims" ? claims.map((c) => ({ ...c })) : t === "claim_signal_refs" ? refs.map((r) => ({ ...r })) : [];
    const b: Record<string, unknown> = {};
    const chain = (f: (r: Array<Record<string, unknown>>) => Array<Record<string, unknown>>) => { rows = f(rows); return b; };
    Object.assign(b, {
      select: () => b,
      eq: (c: string, v: unknown) => chain((r) => r.filter((x) => c === "company_id" ? true : x[c] === v)),
      neq: (c: string, v: unknown) => chain((r) => r.filter((x) => x[c] !== v)),
      in: (c: string, vs: unknown[]) => chain((r) => r.filter((x) => vs.includes(x[c]))),
      then: (res: (v: { data: unknown; error: null }) => unknown) => Promise.resolve({ data: rows, error: null }).then(res),
    });
    return b;
  };
  const rpc = (fn: string, a: Record<string, unknown>) => {
    if (fn !== "set_claim_status") return Promise.resolve({ error: { message: `unknown rpc ${fn}` } });
    const c = claims.find((x) => x.id === a.p_claim_id)!;
    c.status = String(a.p_status);
    events.push({ id: c.id, status: String(a.p_status), reason: String(a.p_reason), actor: String(a.p_actor) });
    return Promise.resolve({ error: null });
  };
  return { from, rpc, claims, events };
}

Deno.test("twin retirement: only LIVE publicly_declared claims backed by the span's signals are struck, by signal id, audited; idempotent across mints", async () => {
  const db = fakeDb(
    [
      { id: "twin-pd", provenance: "publicly_declared", status: "active" },      // backed by e756386d → retires
      { id: "twin-struck", provenance: "publicly_declared", status: "struck" },  // already struck → untouched
      { id: "obs", provenance: "public_observed", status: "active" },            // same signal, not a twin (public_observed) → untouched
      { id: "other-pd", provenance: "publicly_declared", status: "active" },     // backed by another signal → untouched
      { id: "new-quote", provenance: "public_observed", status: "active" },      // the minted quote itself
    ],
    [
      { claim_id: "twin-pd", signal_id: "e756386d" }, { claim_id: "twin-struck", signal_id: "e756386d" }, { claim_id: "obs", signal_id: "e756386d" },
      { claim_id: "other-pd", signal_id: "zzzz" }, { claim_id: "new-quote", signal_id: "e756386d" },
    ],
  );
  const already = new Set<string>();
  const r1 = await retireParaphraseTwins(db as never, { companyId: "c", mintedClaimId: "new-quote", signalIds: ["e756386d", "34405b08"], already });
  assertEquals(r1, [{ claim_id: "twin-pd", signal_id: "e756386d", replaced_by: "new-quote" }]);
  assertEquals(db.events, [{ id: "twin-pd", status: "struck", reason: TWIN_RETIRE_REASON("new-quote"), actor: "extract-own-words" }]);
  assertEquals(db.claims.map((c) => `${c.id}:${c.status}`), ["twin-pd:struck", "twin-struck:struck", "obs:active", "other-pd:active", "new-quote:active"]);
  // a second mint from the same span: nothing left to retire, no second strike
  const r2 = await retireParaphraseTwins(db as never, { companyId: "c", mintedClaimId: "new-quote-2", signalIds: ["e756386d"], already });
  assertEquals(r2, []);
  assertEquals(db.events.length, 1);
  // no signals → nothing
  assertEquals(await retireParaphraseTwins(db as never, { companyId: "c", mintedClaimId: "x", signalIds: [] }), []);
});

Deno.test("source guard: the extractor mints registry units from the stored span only — no fetch, no own_words_page_snapshots write, drift skips, span_mismatch refuses, twins retire", async () => {
  const src = await read("../extract-own-words/index.ts");
  const loop = src.slice(src.indexOf("// ── Registry units (C3b)"), src.indexOf("// Integrity — plan mode writes ONLY"));
  assert(loop.length > 200);
  assert(!loop.includes("own_words_page_snapshots"), "the registry loop never writes the own-words snapshot store");
  assert(!loop.includes("fetchAndExtract("), "the registry loop never fetches");
  assert(loop.includes('registry_skipped: "snapshot_drift"') && loop.includes("if (page.text_sha256 !== entry.snapshot_sha) { pages.push"), "drift ⇒ skip");
  assert(loop.includes("const text = registrySpanText(page.clean_text, span);") && loop.includes("await runUnit({ url: entry.url, text, signal_id: null,"), "the unit's text is the span");
  assert(!/runUnit\(\{[^}]*text: page\.clean_text/.test(loop), "the page never enters a prompt");
  // the ONE prompt path: runUnit's generator/judge read `text` (the unit's text) and nothing else
  const unit = src.slice(src.indexOf("const runUnit = async"), src.indexOf("for (const url of urls)"));
  assert(unit.includes("callModel(GEN_SYSTEM, `PAGE TEXT:\\n${text}`)") && unit.includes("callModel(JUDGE_SYSTEM, `PAGE TEXT:\\n${text}\\n\\nCANDIDATES:"));
  assert(unit.includes("registry_origin: unit.registry_origin,"), "the frozen candidate names its span");
  assert(unit.includes("assembleOwnWords(candidates, verdicts, text, unit.source_title)"), "rails run over the unit text (the span)");
  // corpus: the C1 exclusion is now the partition (site untouched; registry admitted by the rule)
  assert(src.includes("partitionOwnWordsCorpus(sigsAll.filter((s) => !isRegistryUrl(s.source_url) || !s.superseded_at), isRegistryUrl)"));
  assert(!src.includes("excludeRegistryFromOwnWords("), "the blanket exclusion is replaced by the rule");
  // write: span re-verified, mismatch marks the candidate and skips; refs to the span's signals; twins retire
  const w = src.slice(src.indexOf("async function writeFromFrozen"), src.indexOf("Deno.serve("));
  assert(w.includes("if (!spanQuoteVerified(s.quote, cleanText)) {") && w.includes('judge_reason: "span_mismatch"') && w.includes("continue;"));
  assert(w.includes("pg.text_sha256 !== origin.snapshot_sha"), "write-time drift ⇒ nothing mints");
  assert(w.includes("const refSignals = ro ? ro.signal_ids : (s.signal_id ? [s.signal_id] : []);"));
  assert(w.includes("retireParaphraseTwins(supabase, { companyId: company_id, mintedClaimId: m.claim_id, signalIds: m.origin.signal_ids, already: retiredIds })"));
  assert(w.includes('registry_origin: { ...ro, verified_at: nowStr }'));
  assert(w.includes("read_at: ro ? (s.read_at ?? nowStr) : nowStr"), "a registry quote's read date is the snapshot crawl date");
  // the read side: registry candidates carry signal_id NULL → they can never enter the provable-verbatim SIGNAL set
  assert(unit.includes("signal_id: unit.signal_id,") && loop.includes("signal_id: null"));
  const reader = await read("../../../src/views/client/firstReadPreview/useFirstReadPreviewData.ts");
  assert(reader.includes('.not("signal_id", "is", null)'), "loadProvableVerbatimSignalIds keys on signal_id");
});
