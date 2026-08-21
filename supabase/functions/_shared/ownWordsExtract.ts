// GATE OW-2 (2026-08-20) — own-words extractor, PURE logic (no DB, no model, no fetch).
// The edge function extract-own-words fetches page text and calls the generator/judge, then
// hands the raw candidates + judge verdicts to assembleOwnWords here. Every honesty rail that
// can be deterministic lives here so it is unit-testable and can never drift into the model.
//
// verbatim-or-nothing: the final gate is a DETERMINISTIC substring proof against the stored
// page text — a model can never talk a fabricated quote past it.

import { contentIdentity, normalizeForHash } from "./contentIdentity.ts";

// ── channelJunk — byte-mirror of src/views/client/firstReadPreview/channelJunk.ts (R3).
// A second copy on the edge side (like fetchAndExtract); unification is filed, not done here.
const NOT_INDEXABLE_RE = /not\s+publicly\s+indexable/i;
const PAGE_TITLED_RE = /^\s*page titled\b/i;
const TITLE_PIPE_RE = /\s\|\s/; // " | " — a title separator, never sentence prose.
const junkNorm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

/** True when a candidate is junk (a title/nav label or a no-content research note). */
export function isChannelJunk(statement: string, sourceTitle: string | null): boolean {
  const s = (statement ?? "").trim();
  if (!s) return true;
  if (sourceTitle && junkNorm(s) === junkNorm(sourceTitle)) return true; // exact page title
  if (PAGE_TITLED_RE.test(s)) return true; // note about a title
  if (NOT_INDEXABLE_RE.test(s)) return true; // no readable content
  if (TITLE_PIPE_RE.test(s)) return true; // title shape
  return false;
}

// ── R1 deterministic rejection heuristics (2026-08-20) ───────────────────────
// The judge carries the full criteria; these catch the UNAMBIGUOUS cases model-free so the
// rails are testable. Both are intentionally NARROW — an offering-model statement ("we provide
// X to Y") carries none of this vocabulary and is never matched.

// (ii) recruiting / job copy — hiring calls, benefits lists, role descriptions.
const RECRUITING_RE: RegExp[] = [
  /\bwe(?:['’]re| are)\s+(?:looking for|hiring|seeking|recruiting)\b/i,
  /\bwe['’]d love to meet you\b/i,
  /\b(?:full[- ]time|per diem)\b.*\b(?:role|position|join|programs?)\b/i,
  /\bjoin our (?:team|growing|staff)\b/i,
  /\bcompetitive (?:compensation|pay|benefits|salary)\b/i,
  /\bpaths? for advancement\b/i,
  /\bas an?\b[^.?!]{0,60}\byou['’]ll\b/i, // "As a Family Support Counselor, you'll provide…"
];
export function isRecruitingCopy(quote: string): boolean {
  return RECRUITING_RE.some((re) => re.test(quote));
}

// (i) product / SKU description — tasting notes, roast profiles, format/price copy for a
// SPECIFIC item. Requires actual tasting/roast vocabulary so offering-breadth statements
// ("all of our coffees are available in 12oz bags") are NOT matched by shape alone.
const ROAST_RE = /\b(?:light|medium|medium[- ]dark|dark)\s+roast\b/i;
const TASTING_RE = /\b(full[- ]bodied|fruity|earthy|nutty|chocolat\w*|floral|aromatic|acidic|caramel\w*|citrus\w*|berr\w*|smoky|silky|velvety|balanced\s+(?:medium|roast|coffee))\b/i;
const SKU_OPENER_RE = /^\s*this\s+(?:coffee|roast|blend|medium|dark|light|single)\b/i;
export function isProductDescription(quote: string): boolean {
  const flavorCount = (quote.match(new RegExp(TASTING_RE, "gi")) || []).length;
  // roast profile + any flavor descriptor, OR a "This <coffee/roast…>" opener with a flavor note,
  // OR two-plus flavor descriptors (a tasting note regardless of opener).
  if (ROAST_RE.test(quote) && TASTING_RE.test(quote)) return true;
  if (SKU_OPENER_RE.test(quote) && TASTING_RE.test(quote)) return true;
  if (flavorCount >= 2) return true;
  return false;
}

// ── DETERMINISTIC verbatim guard ─────────────────────────────────────────────
/** normalizeForHash(quote) must be a substring of normalizeForHash(cleanText). Offset-
 *  independent (robust to a model miscounting offsets); the single hash authority normalizes
 *  both sides identically. Empty quote is never provable. */
export function verbatimProvable(quote: string, cleanText: string): boolean {
  const q = normalizeForHash(quote);
  if (!q) return false;
  return normalizeForHash(cleanText).includes(q);
}

// ── Privacy assertion (Option B) ─────────────────────────────────────────────
export type SignalGate = { voice_class: string | null; source_type: string | null };
// Public-web source types the crawl produces. uploaded_file / intake / mojo_analysis are
// NOT public — they must never reach an external model.
export const PUBLIC_SOURCE_TYPES = new Set(["public_baseline_run", "competitor_discovery_run"]);

/** Throw unless EVERY signal is the company's own voice AND from a public-web source. The
 *  extractor sends page text to an external model, so this is the gate that keeps internal /
 *  uploaded / intake material local. Frozen companies are refused separately (never fetched). */
export function assertPublicClientVoice(signals: SignalGate[]): void {
  for (const s of signals) {
    if (s.voice_class !== "client_voice") {
      throw new Error(`own-words refused: signal voice_class='${s.voice_class}' (needs client_voice)`);
    }
    if (!s.source_type || !PUBLIC_SOURCE_TYPES.has(s.source_type)) {
      throw new Error(`own-words refused: signal source_type='${s.source_type}' is not public`);
    }
  }
}

// ── Assembly ─────────────────────────────────────────────────────────────────
export type Candidate = { quote: string; offset: number; length: number };
export type JudgeVerdict = {
  keep: boolean;
  fidelity: "verbatim" | "paraphrased";
  selfAssertion: boolean;
  reason?: string;
};
export type Survivor = {
  quote: string;
  offset: number;
  length: number;
  fidelity: "verbatim" | "paraphrased";
  contentIdentity: string;
};
export type Rejection = { quote: string; reason: string };

/**
 * Given the generator's candidates and the judge's per-candidate verdicts, apply the honesty
 * rails IN ORDER and return the surviving own-words + the rejections with reasons. Rail order:
 *   1. channelJunk (deterministic) — nav/title/no-content.
 *   2. recruiting_copy (deterministic, R1) — hiring/benefits/role copy.
 *   3. product_description (deterministic, R1) — tasting-note/roast/SKU copy.
 *   4. self-assertion (judge) — the company speaking about itself, not a third party.
 *   5. judge keep — the judge's overall verdict (also carries the R1 criteria for ambiguous cases).
 *   6. verbatim guard (DETERMINISTIC, final) — substring-provable against the page, else reject.
 *   7. dedup by content identity.
 * A missing verdict for a candidate is a reject (require_model — no verdict, no keep).
 */
export async function assembleOwnWords(
  candidates: Candidate[],
  verdicts: (JudgeVerdict | undefined)[],
  cleanText: string,
  sourceTitle: string | null,
): Promise<{ survivors: Survivor[]; rejections: Rejection[] }> {
  const survivors: Survivor[] = [];
  const rejections: Rejection[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    const v = verdicts[i];
    if (isChannelJunk(c.quote, sourceTitle)) { rejections.push({ quote: c.quote, reason: "channel_junk" }); continue; }
    if (isRecruitingCopy(c.quote)) { rejections.push({ quote: c.quote, reason: "recruiting_copy" }); continue; }
    if (isProductDescription(c.quote)) { rejections.push({ quote: c.quote, reason: "product_description" }); continue; }
    if (!v) { rejections.push({ quote: c.quote, reason: "no_verdict" }); continue; }
    if (!v.selfAssertion) { rejections.push({ quote: c.quote, reason: "not_self_assertion" }); continue; }
    if (!v.keep) { rejections.push({ quote: c.quote, reason: v.reason || "judge_reject" }); continue; }
    if (!verbatimProvable(c.quote, cleanText)) { rejections.push({ quote: c.quote, reason: "not_verbatim_provable" }); continue; }
    const id = await contentIdentity(c.quote);
    if (seen.has(id)) { rejections.push({ quote: c.quote, reason: "duplicate" }); continue; }
    seen.add(id);
    survivors.push({ quote: c.quote, offset: c.offset, length: c.length, fidelity: v.fidelity, contentIdentity: id });
  }
  return { survivors, rejections };
}
