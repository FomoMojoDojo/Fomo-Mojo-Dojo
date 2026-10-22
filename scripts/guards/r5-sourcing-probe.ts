// R5 probe (2026-10-22) — only verified page words source a specific; the gap beat says when the comparison has not
// run. Fixtures only (a guard checks invariants, never a live company's rows); no network, no model. One JSON line.
//   r1 a figure stated only in a signal's claim_text is unsourced (the 492bda10 shape); what the excerpt states sources;
//      an unverified excerpt reads as nothing; every builder of row text reads through rowTextOf
//   r2 the gap beat's state: Spectrum's shape (skipped row, newer own-words) is not_compared; the hook uses the function
//   r3 matching folds case, possessives and punctuation; word boundaries hold
//   r4 N1o: a sentence-opening word is tested off a name; a shortened name no cited row states is still refused
import { rowTextOf, ROW_TEXT_COLUMNS } from "../../supabase/functions/_shared/classSourcingScope.ts";
import { nameSourcedIn, s1Unsourced, sourcedIn, unsourcedNames } from "../../supabase/functions/_shared/classFactCheck.ts";

const ROOT = new URL("../../", import.meta.url);
const read = (p: string) => Deno.readTextFile(new URL(p, ROOT));
const ROW = {
  claim_text: "Spectrum operates across 45 states, serving roughly 37 million customers after the Cox merger.",
  evidence_excerpt: "Spectrum is the consumer brand of Charter Communications, and as of August 2026, it’s the largest telco operator in the U.S. by footprint.\n\nCharter cl...",
  raw_payload: { excerpt_guard: { basis: "websearch_cited_text", traced: true } },
};
const text = rowTextOf("signal", ROW);
const r1res = s1Unsourced({ field: "ua", cls: "record", text: "reaching across 45 states and serving roughly 37 million customers", citedSourceTexts: [text] });
const r1ok = s1Unsourced({ field: "mc", cls: "record", text: "the largest telco operator in the U.S. by footprint", citedSourceTexts: [text] });
const inputs = await read("supabase/functions/_shared/publicReadInputs.ts");
const scope = await read("supabase/functions/_shared/classSourcingScope.ts");
const slots = await read("supabase/functions/generate-read-slots/index.ts");
const r1 = {
  columns: ROW_TEXT_COLUMNS.signal, claim_in_text: text.includes("45 states"), unsourced: r1res.unsourced.map((u) => u.token).sort(), excerpt_sources: r1ok.unsourced.length === 0,
  unverified_reads_nothing: rowTextOf("signal", { evidence_excerpt: "Spectrum sells internet across 45 U.S. states", raw_payload: { excerpt_guard: { basis: "none" } } }) === "",
  wired: inputs.includes("await annotateVerifiedExcerpts(supabase as unknown as { from: (t: string) => any }, (sig ?? []) as Array<Record<string, unknown>>);")
    && scope.includes('if (kind === "signal") await annotateVerifiedExcerpts(supabase, rows);')
    && scope.includes("await annotateVerifiedExcerpts(supabase, (sigRows ?? []) as Array<Record<string, unknown>>);")
    && slots.includes('supabase.from("signals").select(rowTextSelect("signal")).in("id", chunk)')
    && scope.includes('if (kind === "signal" && !excerptIsVerifiedPageWords(row)) return "";'),
};
const hook = await read("src/views/client/firstReadPreview/useFirstReadPreviewData.ts");
const acts = await read("src/views/client/firstReadPreview/acts.tsx");
const r2 = { hook_uses_state: hook.includes("gapIntegrity = gapIntegrityState({"), string_signed: acts.includes(`const GAP_NOT_COMPARED_NOTE = "We haven't compared your own words with the record yet.";`), branch: acts.includes(`: read.gapIntegrity === "not_compared"\n                ? GAP_NOT_COMPARED_NOTE`) };
const r3 = {
  possessive: sourcedIn("Spectrum Mobile's", "Spectrum Mobile ’s $100 trade-in"), case_only: sourcedIn("Internet", "fiber-powered internet"), punct: sourcedIn("24/7", "24 / 7 support"),
  boundary: !nameSourcedIn("Air", "a fair price"), figure_in_token: sourcedIn("5", "nationwide 5G access"),
  name_case: unsourcedNames({ text: "Spectrum Mobile’s trade-in", cls: "you", citedSourceTexts: ["eligible customers can use spectrum mobile's $100 trade-in"] }).length === 0,
};
// r4 N1o (2026-10-22): a sentence-opening word is tested off a name — the shortened name must be in a cited row
const ANYTIME = "Anytime Upgrade : Included in the Spectrum Mobile Unlimited Plus plan, Anytime Upgrade allows customers to upgrade their phones whenever they want.";
const r4 = {
  opener_verb_passes: unsourcedNames({ text: "Provide Anytime Upgrade, allowing customers to upgrade their phones whenever they want.", cls: "you", citedSourceTexts: [ANYTIME] }).length === 0,
  negative_refused: unsourcedNames({ text: "Provide Turbo Upgrade, allowing customers to upgrade whenever they want.", cls: "you", citedSourceTexts: [ANYTIME] }).join("|"),
  mid_sentence_refused: unsourcedNames({ text: "Customers can Provide Anytime Upgrade today.", cls: "you", citedSourceTexts: [ANYTIME] }).join("|"),
};
console.log(JSON.stringify({ r1, r2, r3, r4 }));
