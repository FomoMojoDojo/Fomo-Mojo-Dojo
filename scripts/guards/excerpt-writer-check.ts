#!/usr/bin/env -S deno run --allow-all --no-check
// ── Step (a) writer check (operator ruling 2026-10-16) — called by excerpt-verification-guard.sh, step w ─────
//
// Runs applyMintExcerptGuard — the SAME exported branch public-baseline's ingest runs — against the guard's
// throwaway company, with hand-built drafts in every basis shape, and prints what the writer did as ONE JSON
// object for the shell to assert. The served public-baseline path needs a model call; this needs none. Writes
// ONLY to the throwaway company (outside_page_snapshots + excerpt_verifications), which the guard deletes.
//
//   SUPABASE_URL=… SERVICE_ROLE_KEY=… GUARD_CO=<throwaway company uuid> deno run --allow-all --no-check scripts/guards/excerpt-writer-check.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { applyMintExcerptGuard } from "../../supabase/functions/_shared/evidencePhase1.ts";
import { basisMetaFor } from "../../src/lib/firstRead/citationSource.ts";

const url = Deno.env.get("SUPABASE_URL") ?? "";
const key = Deno.env.get("SERVICE_ROLE_KEY") ?? "";
const co = Deno.env.get("GUARD_CO") ?? "";
if (!url || !key || !co) { console.error("SUPABASE_URL, SERVICE_ROLE_KEY and GUARD_CO are required"); Deno.exit(2); }
const supabase = createClient(url, key);

const SNIPPET = "Staff were compassionate and the crisis unit responded within the hour, my daughter felt safe there.";
const PAGE = "About us. The roastery opened in 2011 on Magnolia Boulevard and roasts every bean in Burbank, three days a week, for forty wholesale accounts.";
const NO_BASIS_EXCERPT = "Summary words the model wrote about a page nobody retained.";
const ANALYSIS_EXCERPT = "Our reading: the roastery's wholesale emphasis outruns its retail footprint.";

// deno-lint-ignore no-explicit-any
const draft = (over: Record<string, unknown>): any => ({
  company_id: co, source_id: "guard-run", source_type: "public_baseline_run", source_title: "guard", source_url: null,
  signal_band: "outside", evidence_type: "market_signal", claim_text: "", evidence_excerpt: "", topic: "x", framework: null,
  directness: "direct", recency: "recent", framing_fit: "partial", structure_level: "extracted", validation_status: "directional",
  confidence_to_use: "medium", relevance_state: "unknown", voice_class: "outside_voice_about_client", raw_payload: { source_type: "public_baseline_run" },
  ...over,
});

const signals = [
  // A. no basis anywhere: the law says claim_text stays, evidence_excerpt goes
  draft({ source_url: "https://nobasis.test/page", claim_text: NO_BASIS_EXCERPT, evidence_excerpt: NO_BASIS_EXCERPT, raw_payload: { source_type: "public_baseline_run", tag: "no_basis" } }),
  // B. cited_text basis, excerpt verbatim in the snippet; url carried with www + trailing slash
  draft({ source_url: "https://www.cited.test/p/", claim_text: "crisis unit responded within the hour", evidence_excerpt: "crisis unit responded within the hour", raw_payload: { tag: "cited_verbatim" } }),
  // C. cited_text basis, excerpt a paraphrase; same page under the bare url form
  draft({ source_url: "https://cited.test/p", claim_text: "the crisis team came in sixty minutes", evidence_excerpt: "the crisis team came in sixty minutes", raw_payload: { tag: "cited_paraphrase" } }),
  // D. crawl basis, excerpt verbatim on the page
  draft({ source_url: "https://crawl.test/about", claim_text: "roasts every bean in Burbank", evidence_excerpt: "roasts every bean in Burbank", raw_payload: { tag: "crawl_verbatim" } }),
  // E. analysis row with no basis: stamped, text kept (the 2026-09-02 carve-out)
  draft({ source_url: "https://nobasis.test/page", voice_class: "analysis", claim_text: ANALYSIS_EXCERPT, evidence_excerpt: ANALYSIS_EXCERPT, raw_payload: { tag: "analysis" } }),
];
const sourceTextByUrl = new Map<string, string>([
  ["cited.test/p", SNIPPET],
  ["crawl.test/about", PAGE],
  ["orphan.test/x", PAGE + " Orphan page: no draft cites it."],   // retained under the crawl's own url
  ["nometa.test/y", PAGE + " No meta and no draft."],              // retained under the key, kind unknown
]);
// The labels come from basisMetaFor — the function public-baseline uses — not from a hand-written map, so a
// plant that mislabels a snippet in that function is RED here, where the label is decided.
const sourceBasisMeta = basisMetaFor({
  crawlUrls: ["https://crawl.test/about/", "https://orphan.test/x/"],                 // the crawl's own url forms
  citationUrlByKey: new Map([["cited.test/p", "https://www.cited.test/p/"]]),          // the tool's url for the snippet
  merged: sourceTextByUrl,                                                             // nometa.test/y: neither names it
});

const stats = await applyMintExcerptGuard({ supabase, companyId: co, runId: "guard-run", signals, sourceTextByUrl, sourceBasisMeta });
const byTag: Record<string, unknown> = {};
for (const s of signals) {
  const tag = String((s.raw_payload as { tag?: string })?.tag ?? "");
  byTag[tag] = { evidence_excerpt: s.evidence_excerpt, claim_text: s.claim_text, excerpt_guard: (s.raw_payload as { excerpt_guard?: unknown })?.excerpt_guard ?? null };
}
const { data: snaps } = await supabase.from("outside_page_snapshots").select("source_url, structured, text_sha256").eq("company_id", co).order("source_url");
const retained = ((snaps ?? []) as Array<{ source_url: string; structured: Record<string, unknown> | null; text_sha256: string }>)
  .filter((r) => r.structured?.retained_at_mint === true)
  .map((r) => ({ url: r.source_url, kind: r.structured?.basis_kind ?? null, key: r.structured?.url_key ?? null, sha8: r.text_sha256.slice(0, 8) }));
console.log(JSON.stringify({ stats, drafts: byTag, retained }));
