// ── THE REVIEW-HOST LANE (V1, 2026-11-18; the Charter voice research plan, decisions 1–8) ───────────────────────────────
//
// A sibling of the seed-host lane (seedHostLane.ts): ONE Claude call per review target, its tools restricted to that
// target's host (allowed_domains), ledgered and spend-capped before it is sent. Rows come from the tool's CITATIONS only:
//   * evidence_excerpt = the citation's cited_text, VERBATIM (ruling 4, 2026-10-21) — never the model's sentence.
//   * the BRAND is the reviewed page list's entry for the cited URL (reviewPages.ts), never the quote's text and never a
//     model; a URL on no listed page is "brand not recorded" (about_entity_id NULL). An unlisted page is kept only when
//     its words name the company (spectrum / charter / cox) — another company's review page mints nothing.
//   * a citation with no review sentence (a list of reviewer names and dates, a heading, a rating table) mints nothing
//     (decision 7). No reviewer name or handle is stored in any field.
//   * duplicates: one row per normalized cited_text across the call AND the company's live excerpts; a repost of the
//     same words on another page is the same quote.
//   * QUOTE: the web_fetch tool returns the review page's TEXT in the response. When the cited fragment is found in a
//     fetched page, quote = the whole sentence(s) containing it, sliced VERBATIM from that page text, and
//     quote_source_text = the page paragraph it was sliced from (signals_quote_verbatim then holds by construction).
//     Not found ⇒ quote NULL (the fragment stands alone) — never text that is not on the page.
//   * DATE: the date printed on the review — a date inside the cited fragment, else inside the quote's own paragraph;
//     two different dates there ⇒ NULL (ambiguous). Never the fetch date, which is kept separately (fetched_at).
// Pure — no I/O, no model.
import { normalizeForHash } from "./contentIdentity.ts";
import { WEBSEARCH_CITED_TEXT } from "./citedTextExcerpt.ts";
import { pageForUrl, type CompanyReviewList, type ReviewTarget } from "./reviewPages.ts";

export const REVIEW_LANE_CALL_SITE = "public-baseline-review-lane" as const;
export const REVIEW_LANE_VERSION = "review_host_lane v1" as const;
export const REVIEW_LANE_SEARCH_MAX_USES = 3;
export const REVIEW_LANE_FETCH_MAX_USES = 2;
export const REVIEW_LANE_FETCH_MAX_CONTENT_TOKENS = 30_000;
export const REVIEW_LANE_MAX_TOKENS = 6000;
/** Operator ruling 2026-11-18: the outside-spend cap for the Charter voice research. A lane run is refused without a cap
 *  and a requested cap is clamped to this ceiling (the baseline's own $2.25 ceiling is untouched). */
export const REVIEW_LANE_CAP_CEILING_USD = 10;
export const REVIEW_LANE_BETA = "web-fetch-2025-09-10";
const MAX_QUOTE_CHARS = 1500;

export function clampReviewLaneCap(requested: unknown): number | null {
  const n = typeof requested === "number" && Number.isFinite(requested) && requested > 0 ? requested : null;
  return n == null ? null : Math.min(n, REVIEW_LANE_CAP_CEILING_USD);
}

/** The run window the cap reads ledgered spend over: an ISO instant in the last 24 hours, not in the future. */
export function parseSpendSince(v: unknown, now = Date.now()): string | null {
  if (typeof v !== "string") return null;
  const t = Date.parse(v);
  if (!Number.isFinite(t) || t > now || t < now - 24 * 3600_000) return null;
  return new Date(t).toISOString();
}

export function reviewLaneTools(host: string): Array<Record<string, unknown>> {
  return [
    { type: "web_search_20250305", name: "web_search", max_uses: REVIEW_LANE_SEARCH_MAX_USES, allowed_domains: [host] },
    { type: "web_fetch_20250910", name: "web_fetch", max_uses: REVIEW_LANE_FETCH_MAX_USES, allowed_domains: [host], citations: { enabled: true }, max_content_tokens: REVIEW_LANE_FETCH_MAX_CONTENT_TOKENS },
  ];
}

export function reviewLanePrompt(t: ReviewTarget): string {
  return `You are collecting customers' own words about ${t.brand} from ${t.site} (${t.host}).\n` +
    `Use web search (results are limited to ${t.host}) to find ${t.hint}. Then use web fetch on one or two of the page URLs ` +
    `your search returned, copied EXACTLY as returned, to read the reviews in full.\n` +
    `Write one short sentence of prose for each customer review you read, saying what that customer reports — about internet, ` +
    `mobile, TV, billing, price changes, outages, installation, technician visits, customer support or cancellation — and cite ` +
    `the review's own words. Every sentence must carry a citation; a sentence you cannot cite, do not write. ` +
    `Customers' reviews only: no news, no employee reviews, no replies from the company. At most 25 sentences. ` +
    `No headings, no lists, no JSON, no reviewer names.`;
}

/** The cap check's upper estimate for one lane call: searches at 40k input tokens each (spendCap.ts), fetches at their
 *  content ceiling, output at max_tokens, plus the search fee. */
export function projectReviewLaneUsd(price: { input: number; output: number; web_search_per_1k: number } | null, promptChars: number): number | null {
  if (!price) return null;
  const input = Math.ceil(promptChars / 4) + REVIEW_LANE_SEARCH_MAX_USES * 40_000 + REVIEW_LANE_FETCH_MAX_USES * REVIEW_LANE_FETCH_MAX_CONTENT_TOKENS;
  return (input * price.input + REVIEW_LANE_MAX_TOKENS * price.output) / 1e6 + (REVIEW_LANE_SEARCH_MAX_USES * price.web_search_per_1k) / 1000;
}

export type FetchedDoc = { url: string; text: string; retrieved_at: string | null };

/** Every page the web_fetch tool returned in the response, with its text verbatim. */
export function fetchedDocuments(response: unknown): FetchedDoc[] {
  const blocks = Array.isArray((response as { content?: unknown })?.content) ? (response as { content: unknown[] }).content : [];
  const out: FetchedDoc[] = [];
  for (const b of blocks) {
    if ((b as { type?: unknown })?.type !== "web_fetch_tool_result") continue;
    const c = (b as { content?: Record<string, unknown> }).content ?? {};
    if (c.type !== "web_fetch_result") continue;
    const doc = (c.content ?? {}) as { source?: { data?: unknown } };
    const text = typeof doc.source?.data === "string" ? doc.source.data : "";
    const url = String(c.url ?? "").trim();
    if (url && text) out.push({ url, text, retrieved_at: typeof c.retrieved_at === "string" ? c.retrieved_at : null });
  }
  return out;
}

export type LaneCitation = { url: string | null; title: string; cited_text: string; sentence: string; document_index: number | null };

/** Every citation on every prose block, in order — web_search citations carry a url; a fetched document's citations
 *  may carry only its index, so the url is resolved against the fetched pages afterwards. */
export function laneCitations(response: unknown): { citations: LaneCitation[]; text_blocks: number; cited_blocks: number } {
  const blocks = Array.isArray((response as { content?: unknown })?.content) ? (response as { content: unknown[] }).content : [];
  const citations: LaneCitation[] = [];
  let text_blocks = 0, cited_blocks = 0, leadIn = "";
  for (const b of blocks) {
    if ((b as { type?: unknown })?.type !== "text") continue;
    text_blocks++;
    const cits = Array.isArray((b as { citations?: unknown }).citations) ? (b as { citations: unknown[] }).citations : [];
    const raw = String((b as { text?: unknown }).text ?? "");
    const own = raw.replace(/\s+/g, " ").trim();
    // the model writes "A customer said " (uncited) then the cited words: our summary is the two read together
    if (!cits.length) { leadIn = (raw.split(/\n|(?<=[.!?])\s/).pop() ?? "").trim(); continue; }
    cited_blocks++;
    const sentence = `${leadIn} ${own}`.replace(/\s+/g, " ").trim();
    leadIn = "";
    for (const c of cits) {
      const r = c as Record<string, unknown>;
      const cited = typeof r.cited_text === "string" ? r.cited_text : "";
      if (!cited.trim()) continue;
      const url = typeof r.url === "string" && r.url.trim() ? r.url.trim() : null;
      citations.push({ url, title: String(r.title ?? r.document_title ?? "").trim(), cited_text: cited, sentence,
        document_index: Number.isInteger(r.document_index) ? Number(r.document_index) : null });
    }
  }
  return { citations, text_blocks, cited_blocks };
}

// ── verbatim location: find a fragment in page text with whitespace and quote marks folded, map back to the original ──
function fold(s: string): { t: string; map: number[] } {
  const out: string[] = []; const map: number[] = [];
  let prevSpace = true;
  for (let i = 0; i < s.length; i++) {
    let ch = s[i];
    if (/\s/.test(ch)) { if (prevSpace) continue; ch = " "; prevSpace = true; } else prevSpace = false;
    if (ch === "‘" || ch === "’") ch = "'";
    else if (ch === "“" || ch === "”") ch = '"';
    out.push(ch.toLowerCase()); map.push(i);
  }
  return { t: out.join(""), map };
}
const trimFragment = (s: string) => s.replace(/\s*(?:\.\.\.|…)\s*$/, "").replace(/^\s*(?:\.\.\.|…)\s*/, "").trim();

/** [start, end) of the fragment in `text`, original offsets, or null. */
export function locate(text: string, fragment: string): [number, number] | null {
  const f = fold(trimFragment(fragment)).t.trim();
  if (f.length < 12) return null;
  const T = fold(text);
  const i = T.t.indexOf(f);
  if (i < 0) return null;
  return [T.map[i], T.map[i + f.length - 1] + 1];
}

/** The paragraph [start, end) containing [a, b): bounded by blank lines (or a single newline when the page has none). */
function paragraphAround(text: string, a: number, b: number): [number, number] {
  const blank = /\n\s*\n/g;
  let start = 0, end = text.length, m: RegExpExecArray | null;
  while ((m = blank.exec(text))) { if (m.index + m[0].length <= a) start = m.index + m[0].length; else if (m.index >= b) { end = m.index; break; } }
  if (end - start > 4000) { // no blank lines near: fall back to single newlines
    const s1 = text.lastIndexOf("\n", a - 1); const e1 = text.indexOf("\n", b);
    start = Math.max(start, s1 + 1); end = Math.min(end, e1 < 0 ? text.length : e1);
  }
  return [start, end];
}

/** The whole sentence(s) containing [a, b), within [ps, pe): from the end of the previous sentence to the end of the
 *  last one. Verbatim slices of `text`. */
export function sentencesAround(text: string, a: number, b: number, ps: number, pe: number): [number, number] {
  let s = a;
  while (s > ps) { const ch = text[s - 1]; if (/[.!?]/.test(ch) && s < a && /\s/.test(text[s] ?? "")) break; s--; }
  while (s < a && /\s/.test(text[s])) s++;
  let e = b;
  // a fragment that already ends a sentence ends the quote there
  if (/[.!?]/.test(text[b - 1] ?? "")) e = pe + 1;
  while (e < pe) { const ch = text[e]; e++; if (/[.!?]/.test(ch) && (e >= pe || /[\s"”')\]]/.test(text[e]))) { while (e < pe && /["”')\]]/.test(text[e])) e++; break; } }
  if (e > pe) e = b;
  if (e - s > MAX_QUOTE_CHARS) return [a, b];
  return [s, e];
}

/** The date printed in a review's own HEADER on a fetched page: walking back at most 8 paragraphs from the review's
 *  paragraph, the nearest short paragraph carrying exactly one date and at most 40 other characters (the reviewer's
 *  line "Name Jul 25, 2026", or a date alone); a rating, a title or the review's own earlier paragraphs may sit between
 *  — a review's header always precedes its body. None found ⇒ null. No name is kept. */
export function headerDate(text: string, paragraphStart: number): PrintedDate | null {
  const before = text.slice(0, paragraphStart).split(/\n\s*\n/).reverse();
  for (const p of before.slice(0, 8)) {
    // a markdown link's target is not text on the page ("[Name Jul 25, 2026](…/users/…)" reads "Name Jul 25, 2026")
    const t = p.replace(/\]\([^)]*\)/g, "]").replace(/[[\]]/g, "").trim();
    if (!t) continue;
    if (hasReviewSentence(t)) continue;
    // this review's own header carries a relative age only: it is undated — never another review's date
    if (/\b\d+\s+(?:minutes?|hours?|days?|weeks?|months?)\s+ago\b/i.test(t)) return null;
    const ds = printedDates(t);
    const rest = t.replace(new RegExp(`\\b${MON}\\.?\\s+\\d{1,2},?\\s+\\d{4}\\b|\\b\\d{1,2}\\s+${MON}\\.?,?\\s+\\d{4}\\b|\\b20\\d{2}-\\d{2}-\\d{2}\\b`, "gi"), "").replace(/[^\p{L}\p{N}]/gu, "");
    if (ds.length === 1 && ds[0].precision === "day" && rest.length <= 40) return ds[0];
  }
  return null;
}

/** A review header with only a RELATIVE age ("7 days ago") within the 8 paragraphs before: the paragraph is a review,
 *  undated (a relative age is never turned into a date). */
export function headerRelativeAge(text: string, paragraphStart: number): boolean {
  return text.slice(0, paragraphStart).split(/\n\s*\n/).slice(-8).some((p) => /\b\d+\s+(?:minutes?|hours?|days?|weeks?|months?)\s+ago\b/i.test(p) && !hasReviewSentence(p));
}

export type QuoteVerdict = { quote: string; quote_source_text: string; url: string; header_date: PrintedDate | null; in_review_block: boolean } | null;
/** The verbatim review sentence(s) for a cited fragment, from a fetched page (the citation's own url first). */
export function expandQuote(docs: FetchedDoc[], url: string | null, fragment: string): QuoteVerdict {
  const order = [...docs].sort((x, y) => (x.url === url ? -1 : 0) - (y.url === url ? -1 : 0));
  for (const d of order) {
    const at = locate(d.text, fragment);
    if (!at) continue;
    const [ps, pe] = paragraphAround(d.text, at[0], at[1]);
    const [s, e] = sentencesAround(d.text, at[0], at[1], ps, pe);
    // widening never walks back into page structure (a heading, a listing header): the review body of the slice
    const quote = reviewBody(d.text.slice(s, e).trim());
    const source = d.text.slice(ps, pe);
    if (!quote || !source.includes(quote)) continue;
    const header_date = headerDate(d.text, ps);
    return { quote, quote_source_text: source, url: d.url, header_date, in_review_block: !!header_date || headerRelativeAge(d.text, ps) };
  }
  return null;
}

// ── review sentence and printed date ──
/** A review sentence: at least six consecutive words of letters, three of them written wholly in lower case or common
 *  function words in any case (prose has "the", "and", "my"… — so does a review in capitals). A list of reviewer names,
 *  dates and ratings, or a Title Case header ("Cox Contour TV Cox Communications Inc"), has none. */
const FUNCTION_WORDS = new Set(("the and to a an of my i i'm is was it for not but that they you your will with on in at have has had be are " +
  "this me we our us them their there so or if no when just get got all from what do did don't can't won't").split(" "));
export function hasReviewSentence(s: string): boolean {
  const toks = s.split(/\s+/);
  let run = 0, lower = 0;
  for (const t of toks) {
    // strip punctuation only: a token with a digit in it ("3.0*star*", "4.04K") is not a word
    const w = t.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
    if (w && /^[\p{L}'’-]+$/u.test(w)) { run++; if (/^[\p{Ll}'’-]+$/u.test(w) || FUNCTION_WORDS.has(w.toLowerCase())) lower++; if (run >= 6 && lower >= 3) return true; }
    else { run = 0; lower = 0; }
  }
  return false;
}

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
const MON = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
export type PrintedDate = { date: string; precision: "day" | "month" };
/** Every distinct date printed in `s` (day precision), or month-year when no day date is present. */
export function printedDates(s: string): PrintedDate[] {
  const days = new Set<string>();
  const pad = (n: number) => String(n).padStart(2, "0");
  const ok = (y: number, m: number, d: number) => y >= 2000 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31;
  for (const m of s.matchAll(new RegExp(`\\b${MON}\\.?\\s+(\\d{1,2}),?\\s+(\\d{4})\\b`, "gi"))) {
    const mo = MONTHS[m[1].slice(0, 4).toLowerCase() === "sept" ? "sept" : m[1].slice(0, 3).toLowerCase()], d = +m[2], y = +m[3];
    if (ok(y, mo, d)) days.add(`${y}-${pad(mo)}-${pad(d)}`);
  }
  for (const m of s.matchAll(new RegExp(`\\b(\\d{1,2})\\s+${MON}\\.?,?\\s+(\\d{4})\\b`, "gi"))) {
    const mo = MONTHS[m[2].slice(0, 3).toLowerCase()], d = +m[1], y = +m[3];
    if (ok(y, mo, d)) days.add(`${y}-${pad(mo)}-${pad(d)}`);
  }
  for (const m of s.matchAll(/\b(20\d{2})-(\d{2})-(\d{2})\b/g)) if (ok(+m[1], +m[2], +m[3])) days.add(`${m[1]}-${m[2]}-${m[3]}`);
  if (days.size) return [...days].sort().map((date) => ({ date, precision: "day" as const }));
  const months = new Set<string>();
  for (const m of s.matchAll(new RegExp(`\\b${MON}\\.?\\s+(\\d{4})\\b`, "gi"))) {
    const mo = MONTHS[m[1].slice(0, 3).toLowerCase()], y = +m[2];
    if (ok(y, mo, 1)) months.add(`${y}-${pad(mo)}-01`);
  }
  return [...months].sort().map((date) => ({ date, precision: "month" as const }));
}
/** The review's printed date: the one date in the fragment, else the review header's date on the fetched page, else the
 *  one date in its paragraph; none or several ⇒ null. */
export function reviewDate(fragment: string, paragraph: string | null, header: PrintedDate | null = null): (PrintedDate & { basis: "cited_text" | "review_header" | "page_paragraph" }) | null {
  const a = printedDates(fragment);
  if (a.length === 1) return { ...a[0], basis: "cited_text" };
  if (a.length > 1) return null;
  if (header) return { ...header, basis: "review_header" };
  if (!paragraph) return null;
  const b = printedDates(paragraph);
  return b.length === 1 ? { ...b[0], basis: "page_paragraph" } : null;
}

/** How many dated review blocks a fetched page holds — a page with ≥ 3 is a review list, so a fragment of it that sits in
 *  no dated block (the site's own summary, page chrome) is not a customer's review. */
export function datedReviewBlocks(text: string): number {
  let n = 0, at = 0;
  for (const p of text.split(/\n\s*\n/)) { if (hasReviewSentence(p) && headerDate(text, text.indexOf(p, at))) n++; at += p.length; }
  return n;
}

/** A cited span can run across a page's paragraphs (a rating image, a title, then the review). The review is the part
 *  from the first paragraph holding a review sentence to the last; markup paragraphs around it are not the customer's
 *  words. A span with no such paragraph is returned whole (it fails the review-sentence test downstream). */
/** The company's own reply on a review page ("Please DM us…", "We apologize…", a signed "-Greg") — not a customer's words. */
export const COMPANY_REPLY = /(\bDM us\b|@Ask_?Spectrum|@CoxHelp|\bwe (?:apologize|are sorry|['’]re sorry)\b|\bsorry to hear\b|\bthank you for (?:your|reaching|taking|choosing)\b|\bthanks for choosing\b|\bplease (?:reach out|contact us|send us)\b|\bour apologies\b|\bDeveloper Response\b|\bResponse from (?:Spectrum|Cox|Charter)\b|\bso we can (?:investigate|review|look into|help)\b|\bplease email (?:me|us)\b|\bglad to (?:review|help|assist)\b)/i;

export function reviewBody(cited: string): string {
  // LINE by line (a search fragment flattens a page's blocks onto single lines): from the first line holding a
  // customer's review sentence to the last — a heading, an app listing's header, a reply's signature or the
  // company's own reply is skipped. A verbatim slice of the span.
  const parts = cited.split(/(\n+)/);
  const isReview = (p: string) => hasReviewSentence(p) && !COMPANY_REPLY.test(p) && !/^\s*(?:[-*]\s*)?#{1,6}\s/.test(p);
  const idx = parts.map((p, i) => (i % 2 === 0 && isReview(p) ? i : -1)).filter((i) => i >= 0);
  if (!idx.length) return cited;
  return parts.slice(idx[0], idx[idx.length - 1] + 1).join("").trim();
}

export type ReviewLaneStats = {
  text_blocks: number; cited_blocks: number; citations: number; fetched_pages: number;
  no_url: number; off_host: number; excluded: number; not_company: number; no_review_sentence: number; not_review_block: number; heading: number; company_reply: number; not_outside: number;
  duplicate_in_run: number; duplicate_existing: number; minted: number; branded: number; brand_not_recorded: number;
  quote_expanded: number; dated: number;
};

/** The rows to insert for one stored lane call. `decide` is the one voice authority (decideVoiceClassBeforeJudge). */
export function buildReviewLaneRows(a: {
  list: CompanyReviewList; target: ReviewTarget; callId: string; response: unknown; fetchedAt: string;
  excludeHosts: readonly string[]; existingExcerpts: ReadonlySet<string>;
  decide: (url: string) => { ok?: boolean; voice_class?: string; authority?: string };
}): { rows: Array<Record<string, unknown>>; stats: ReviewLaneStats } {
  const docs = fetchedDocuments(a.response);
  const { citations, text_blocks, cited_blocks } = laneCitations(a.response);
  const stats: ReviewLaneStats = { text_blocks, cited_blocks, citations: citations.length, fetched_pages: docs.length, no_url: 0, off_host: 0, excluded: 0,
    not_company: 0, no_review_sentence: 0, not_review_block: 0, heading: 0, company_reply: 0, not_outside: 0, duplicate_in_run: 0, duplicate_existing: 0, minted: 0, branded: 0, brand_not_recorded: 0, quote_expanded: 0, dated: 0 };
  const seen = new Set<string>();
  const rows: Array<Record<string, unknown>> = [];
  const listPages = new Map(docs.map((d) => [d.url, datedReviewBlocks(d.text)] as const));
  const targetHost = a.target.host.toLowerCase().replace(/^www\./, "");
  for (const c of citations) {
    // a fetched document's citation names its page by index or by containing the words
    let url = c.url;
    if (!url && c.document_index != null) url = docs[c.document_index]?.url ?? null;
    if (!url) url = docs.find((d) => locate(d.text, c.cited_text))?.url ?? null;
    if (!url) { stats.no_url++; continue; }
    let host = "";
    try { host = new URL(url).hostname.toLowerCase().replace(/^www\./, ""); } catch { /* counted below */ }
    if (!host || !(host === targetHost || host.endsWith(`.${targetHost}`))) { stats.off_host++; continue; }
    if (a.excludeHosts.some((x) => { const d = x.toLowerCase().replace(/^www\./, ""); return host === d || host.endsWith(`.${d}`); })) { stats.excluded++; continue; }
    const page = pageForUrl(a.list, url);
    const body = reviewBody(c.cited_text);
    const expanded = expandQuote(docs, url, body);
    const words = expanded?.quote ?? body;
    if (!page && !a.list.names.test(`${c.cited_text} ${c.title} ${url}`)) { stats.not_company++; continue; }
    if (!hasReviewSentence(words)) { stats.no_review_sentence++; continue; }
    if (COMPANY_REPLY.test(words)) { stats.company_reply++; continue; }
    // a review's title line repeats its body's opening: the body is the quote
    if (expanded && /^#{1,6}\s/.test(expanded.quote)) { stats.heading++; continue; }
    if (expanded && !expanded.in_review_block && (listPages.get(expanded.url) ?? 0) >= 3) { stats.not_review_block++; continue; }
    const d = a.decide(url);
    if (!d?.ok || d.voice_class !== "outside_voice_about_client") { stats.not_outside++; continue; }
    // one row per customer's words: the span and the words shown (the quote, else the review body) both dedupe
    const norm = normalizeForHash(c.cited_text), shown = normalizeForHash(words);
    if (!norm || seen.has(norm) || seen.has(`w:${shown}`)) { stats.duplicate_in_run++; continue; }
    seen.add(norm); seen.add(`w:${shown}`);
    if (a.existingExcerpts.has(norm)) { stats.duplicate_existing++; continue; }
    const date = reviewDate(c.cited_text, expanded?.quote_source_text ?? null, expanded?.header_date ?? null);
    const row: Record<string, unknown> = {
      company_id: a.list.companyId,
      source_id: a.callId,
      source_type: "public_baseline_run",
      source_title: c.title || `${a.target.site} review`,
      source_url: url,
      signal_band: "outside",
      evidence_type: "market_signal",
      evidence_class: "prose",
      claim_text: (c.sentence || c.cited_text).slice(0, 600),
      evidence_excerpt: c.cited_text,
      quote: expanded?.quote ?? null,
      quote_source_text: expanded?.quote_source_text ?? null,
      event_date: date?.date ?? null,
      event_date_precision: date?.precision ?? "day",
      topic: "customer_review",
      framework: "public_baseline",
      directness: "direct",
      recency: null,
      framing_fit: "partial",
      structure_level: "extracted",
      validation_status: "directional",
      confidence_to_use: "medium",
      voice_class: "outside_voice_about_client",
      about_entity_id: page ? a.list.entities[page.entity] : null,
      about_entity_basis: page ? "review_page" : null,
      about_entity_page: page ? page.key : null,
      review_lane_call_id: a.callId,
      raw_payload: {
        source_type: "customer_review",
        lane: REVIEW_LANE_VERSION,
        target_key: a.target.key,
        url, title: c.title, sentence: c.sentence, cited_text: c.cited_text, citation: true,
        review_body: body,
        fetched_at: a.fetchedAt,
        quote_basis: expanded ? "web_fetch_page_text" : null,
        date_basis: date?.basis ?? null,
        brand_basis: page ? { page: page.key, label: page.label } : "brand_not_recorded",
        voice_authority: { authority: d.authority ?? "third_party_host" },
        excerpt_guard: { basis: WEBSEARCH_CITED_TEXT, traced: true },
      },
    };
    rows.push(row);
    stats.minted++;
    if (page) stats.branded++; else stats.brand_not_recorded++;
    if (expanded) stats.quote_expanded++;
    if (date) stats.dated++;
  }
  return { rows, stats };
}
