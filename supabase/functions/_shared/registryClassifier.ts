// ── Registry classifier (C1, operator ruling 2026-09-17) ─────────────────────────────────────────
//
// THE ONE AUTHORITY for what a registry page row IS. A registry (ProPublica Nonprofit Explorer,
// GuideStar/Candid, Charity Navigator, CauseIQ) is a HOST that reproduces three different voices on
// one page: the organization's own filing data and self-reported profile sections (the company
// speaking through a registry), the registry's own ratings / derived metrics / index facts (the
// registry speaking), and — on a newsroom's own domain — journalism (a journalist speaking).
//
// Classification is DETERMINISTIC: host × path × page markers in the STORED snapshot. Never a model
// verdict (the aggregator authorship judge returned two different verdicts on identical GuideStar
// text; a registry row is decided here once and the judge never re-judges it — see raw_payload.registry).
// No network, no model, no I/O in this module — the source guard test pins it.
//
//   class            voice at mint              corroboration / recurrence   record surfaces
//   filing           client_voice (filing)      excluded like own-domain     never
//   self_reported    client_voice (filing)      excluded like own-domain     never
//   rating           outside_voice_about_client counts (one host per registry) yes
//   derived_metric   outside_voice_about_client counts                       yes
//   registry_meta    outside_voice_about_client counts                       yes
//   journalism       untouched (the model's label stands)                    yes
//
// NO MATCHED MARKER (ruling 2026-09-18): a row on a registry host whose section cannot be read from the
// stored snapshot is REGISTRY META / outside voice on every page type — filing and self_reported are earned
// only from a matched section, never assumed from the page type.

export type RegistryPageType = "filing_data" | "profile" | "rating" | "journalism";
export type RegistryClass = "filing" | "self_reported" | "rating" | "derived_metric" | "registry_meta" | "journalism";
export type RegistrySection =
  | "filing_data"      // ProPublica "Fiscal Year Ending …" blocks (Form 990 extracted data)
  | "org_summary"      // ProPublica "Organization summary" + page boilerplate (EIN, 501(c), NTEE)
  | "self_reported"    // GuideStar "SOURCE: Self-reported by organization" blocks + its Mission block; CN Mission/Vision/Goals block
  | "profile_meta"     // GuideStar index facts (EIN, NTEE code, ruling year, addresses, filing requirement)
  | "rating"           // CN star rating / beacons
  | "derived_metric"   // CN Financial Health / Revenue & Expenses metrics (ratios, board independence)
  | "article"          // journalism body
  | "page_default";    // no readable section — page-type default applied (fail closed)

export type RegistryRule = {
  /** stable rule id, recorded on the row as host_rule */
  id: string;
  host: RegExp;
  path: RegExp;
  page_type: RegistryPageType;
};

// REGISTRY_PATTERNS — host regex × path regex → page type. Hosts are matched on the registrable host
// with a leading www. stripped. Shapes verified against the record (Edgewood rows) and, for CauseIQ,
// against the live site on 2026-09-17 (/organizations/<slug>,<ein>/ → 200). grantmakers.io is
// deliberately ABSENT: no profile URL shape could be verified (guessed /profiles/v0/<ein>-<slug>/
// → 404; the index exposes no profile links), and the ruling says leave a host out rather than guess.
export const REGISTRY_PATTERNS: ReadonlyArray<RegistryRule> = [
  { id: "propublica_nonprofit_organization", host: /^projects\.propublica\.org$/i, path: /^\/nonprofits\/organizations\/\d+/i, page_type: "filing_data" },
  { id: "propublica_article", host: /^propublica\.org$/i, path: /^\/article\//i, page_type: "journalism" },
  { id: "guidestar_profile", host: /^(guidestar|candid)\.org$/i, path: /^\/profile\/[\d-]+/i, page_type: "profile" },
  { id: "charitynavigator_ein", host: /^charitynavigator\.org$/i, path: /^\/ein\/\d+/i, page_type: "rating" },
  { id: "causeiq_organization", host: /^causeiq\.com$/i, path: /^\/organizations\/[^/,]+,\d{9}\/?/i, page_type: "filing_data" },
];

export type RegistryMatch = { host_rule: string; page_type: RegistryPageType; host: string; path: string };

function hostAndPath(url: string): { host: string; path: string } | null {
  try {
    const u = new URL(url);
    return { host: u.hostname.replace(/^www\d*\./i, "").toLowerCase(), path: u.pathname };
  } catch {
    return null;
  }
}

/** URL-only match: which registry rule (if any) owns this URL. */
export function matchRegistryUrl(url: string | null | undefined): RegistryMatch | null {
  const hp = hostAndPath(String(url ?? "").trim());
  if (!hp) return null;
  for (const r of REGISTRY_PATTERNS) {
    if (r.host.test(hp.host) && r.path.test(hp.path)) return { host_rule: r.id, page_type: r.page_type, host: hp.host, path: hp.path };
  }
  return null;
}

/** True for any URL on a registry rule — journalism included (the own-words exclusion is host-wide, fail closed). */
export function isRegistryUrl(url: string | null | undefined): boolean {
  return matchRegistryUrl(url) !== null;
}

// ── Marker sets (verbatim strings the classifier relies on) ─────────────────────────────────────
// ProPublica Nonprofit Explorer organization page (stored snapshot 0a49e82f, 2026-09-14).
export const PROPUBLICA_MARKERS = {
  org_summary: ["Organization summary"],
  boilerplate: ["Tax Filings and Audits by Year"],   // page prose about Form 990 — registry text, not the filing
  filing_block: ["Fiscal Year Ending"],              // each block: "Fiscal Year Ending <Month>\n<year>\nExtracted Financial Data…"
  filing_inner: ["Extracted Financial Data", "Document Links"],
} as const;

// GuideStar / Candid profile (stored snapshot 342407a3, 2026-09-14).
// The self-reported marker opens a block; the block ends at the NEXT section heading in
// GUIDESTAR_SECTION_HEADINGS (the heading immediately BEFORE the marker names the block).
export const GUIDESTAR_SELF_REPORTED_MARKER = "SOURCE: Self-reported by organization";
/** C2 (ruling 2026-09-17): the profile's "Mission" heading block is the organization's own words — self_reported,
 *  not registry meta — on GuideStar and on Charity Navigator alike (CN_SELF_REPORTED_OPEN carries the same heading). */
export const GUIDESTAR_MISSION_HEADING = "Mission";
export const GUIDESTAR_SECTION_HEADINGS: ReadonlyArray<string> = [
  "Summary", "Programs + Results", "Financials", "Operations", "Mission", "Ruling year", "Main address",
  "Contact Information", "Formerly known as", "EIN", "NTEE code", "IRS filing requirement", "Communication",
  "Programs and results", "What we aim to solve", "Our programs", "Where we work", "Affiliations & memberships",
  "Photos", "Videos", "Our results", "Our Sustainable Development Goals", "Goals & Strategy", "How we listen",
  "Board of directors", "Officers, directors, trustees, and key employees", "Highest paid employees",
];

// Charity Navigator /ein/ page (live page 2026-09-17; the stored snapshot 42eb9a2d carries only the
// page's Elementor JSON inside its 12,000-char clean_text cap, so on that snapshot section detection
// falls to ld_json → rating page default).
export const CN_SELF_REPORTED_OPEN = ["Mission"];                       // Mission → Vision → Goals: organization-supplied block
export const CN_RATING_MARKERS: ReadonlyArray<string> = [
  "-Star Charity", "Beacon Report", "Accountability & Finance", "Impact & Measurement", "Leadership & Planning",
  "Culture & Compensation", "Encompass Rating",
];
export const CN_DERIVED_METRIC_MARKERS: ReadonlyArray<string> = [
  "Financial Health", "Revenue & Expenses", "Program Expense Ratio", "Fundraising Efficiency", "Liabilities to Assets",
  "Working Capital Ratio", "Independent Board",
];

// ── Snapshot reading ─────────────────────────────────────────────────────────────────────────────
export type RegistrySnapshot = {
  clean_text?: string | null;
  /** outside_page_snapshots.structured — { ld_json?: unknown[] } */
  structured?: unknown;
  /** outside_page_snapshots.text_sha256 — the snapshot ROW's identity (sha256 of normalizeForHash(clean_text), NOT of the
   *  raw bytes). The span table is keyed by it; offsets are into that row's raw clean_text. */
  text_sha256?: string | null;
};

/** A labelled section of the stored page. `text` is the trimmed-lines join the scorers read; `start`/`end` are
 *  offsets into the raw clean_text such that clean_text.slice(start, end) === text when the page is byte-exact
 *  (C3a: verified on write; a drifting page fails closed — see RegistryClassification.basis.spans_exact). */
export type SectionSpan = { section: RegistrySection; class: RegistryClass; text: string; start: number; end: number };
/** One row of the persisted span table (basis.snapshot_sections): the span minus its text. */
export type SectionSpanRow = { section: RegistrySection; class: RegistryClass; start: number; end: number };

function ldTypes(structured: unknown): string[] {
  const out: string[] = [];
  const walk = (v: unknown, depth: number) => {
    if (depth > 6 || v == null) return;
    if (Array.isArray(v)) { for (const x of v) walk(x, depth + 1); return; }
    if (typeof v === "object") {
      const o = v as Record<string, unknown>;
      const t = o["@type"];
      if (typeof t === "string") out.push(t);
      else if (Array.isArray(t)) for (const x of t) if (typeof x === "string") out.push(x);
      for (const k of ["@graph", "review", "mainEntity", "publisher"]) if (k in o) walk(o[k], depth + 1);
    }
  };
  const ld = (structured && typeof structured === "object" ? (structured as { ld_json?: unknown }).ld_json : undefined);
  walk(ld, 0);
  return out;
}

/** ld_json page confirmation: Dataset (ProPublica) → filing_data; Review → rating; Article → journalism. */
export function ldPageHint(structured: unknown): RegistryPageType | null {
  const types = ldTypes(structured);
  if (types.includes("Dataset")) return "filing_data";
  if (types.includes("Review")) return "rating";
  if (types.includes("Article") || types.includes("NewsArticle")) return "journalism";
  return null;
}

const lines = (t: string) => t.split(/\r?\n/).map((s) => s.trim());

/** The page as trimmed lines WITH the raw offsets of each trimmed line (start/end into clean_text). */
type OffsetLine = { t: string; s: number; e: number };
function offsetLines(text: string): OffsetLine[] {
  const out: OffsetLine[] = [];
  let pos = 0;
  for (const raw of text.split(/(\r?\n)/)) {
    if (raw === "\n" || raw === "\r\n") { pos += raw.length; continue; }
    const lead = raw.length - raw.trimStart().length;
    const t = raw.trim();
    out.push({ t, s: pos + lead, e: pos + lead + t.length });
    pos += raw.length;
  }
  return out;
}

function classOf(section: RegistrySection): RegistryClass {
  switch (section) {
    case "filing_data": return "filing";
    case "self_reported": return "self_reported";
    case "org_summary": case "profile_meta": return "registry_meta";
    case "rating": return "rating";
    case "derived_metric": return "derived_metric";
    case "article": return "journalism";
    case "page_default": return "registry_meta";
  }
}

/** Split a stored page into labelled section spans by the page type's marker set. */
export function sectionSpans(pageType: RegistryPageType, cleanText: string | null | undefined): SectionSpan[] {
  const text = String(cleanText ?? "");
  if (!text.trim()) return [];
  const ls = offsetLines(text);
  const spans: SectionSpan[] = [];
  // A span's text is the trimmed lines joined by "\n" and trimmed (unchanged since C1); its offsets are the raw
  // bounds of its first and last NON-EMPTY lines, so on a page whose lines carry no edge whitespace and use "\n"
  // endings clean_text.slice(start, end) === text. Any other page fails the exactness check downstream.
  const push = (section: RegistrySection, buf: OffsetLine[]) => {
    const t = buf.map((l) => l.t).join("\n").trim();
    if (!t) return;
    const first = buf.find((l) => l.t)!;
    let last = first;
    for (const l of buf) if (l.t) last = l;
    spans.push({ section, class: classOf(section), text: t, start: first.s, end: last.e });
  };

  if (pageType === "journalism") return [{ section: "article", class: "journalism", text, start: 0, end: text.length }];

  if (pageType === "filing_data") {
    // ProPublica: everything before the first "Fiscal Year Ending" is registry text (summary + boilerplate);
    // each "Fiscal Year Ending" block is filing data until the next one.
    let cur: RegistrySection = "org_summary";
    let buf: OffsetLine[] = [];
    for (const l of ls) {
      if (PROPUBLICA_MARKERS.filing_block.some((m) => l.t.startsWith(m))) { push(cur, buf); cur = "filing_data"; buf = [l]; continue; }
      buf.push(l);
    }
    push(cur, buf);
    return spans;
  }

  if (pageType === "profile") {
    // GuideStar: a heading line names the section; the self-reported marker converts the CURRENT
    // section (from its heading) into a self_reported block until the next heading.
    const headings = new Set(GUIDESTAR_SECTION_HEADINGS);
    let cur: RegistrySection = "profile_meta";
    let buf: OffsetLine[] = [];
    for (const l of ls) {
      if (headings.has(l.t)) { push(cur, buf); cur = l.t === GUIDESTAR_MISSION_HEADING ? "self_reported" : "profile_meta"; buf = [l]; continue; }
      if (l.t === GUIDESTAR_SELF_REPORTED_MARKER) { cur = "self_reported"; buf.push(l); continue; }
      buf.push(l);
    }
    push(cur, buf);
    return spans;
  }

  // rating (Charity Navigator): Mission opens the organization-supplied block; a rating heading or a
  // derived-metric heading closes it and opens its own section; everything else is registry text.
  let cur: RegistrySection = "profile_meta";
  let buf: OffsetLine[] = [];
  for (const l of ls) {
    if (CN_SELF_REPORTED_OPEN.includes(l.t)) { push(cur, buf); cur = "self_reported"; buf = [l]; continue; }
    if (CN_DERIVED_METRIC_MARKERS.some((m) => l.t === m || l.t.startsWith(m))) { push(cur, buf); cur = "derived_metric"; buf = [l]; continue; }
    if (CN_RATING_MARKERS.some((m) => l.t === m || l.t.endsWith(m) || l.t.startsWith(m))) { push(cur, buf); cur = "rating"; buf = [l]; continue; }
    buf.push(l);
  }
  push(cur, buf);
  return spans;
}

/** C3a: every span's offsets reproduce its text from the raw page — the write-time check behind basis.spans_exact. */
export function spansAreExact(cleanText: string | null | undefined, spans: SectionSpan[]): boolean {
  const text = String(cleanText ?? "");
  return spans.every((sp) => text.slice(sp.start, sp.end) === sp.text);
}

/** The persisted span table: the spans minus their text (the text is reproducible from the sha'd snapshot). */
export function spanTable(spans: SectionSpan[]): SectionSpanRow[] {
  return spans.map((sp) => ({ section: sp.section, class: sp.class, start: sp.start, end: sp.end }));
}

// ── Fiscal year (C3a, ruling 2026-09-18) — filing_data pages only ─────────────────────────────────
// A ProPublica "Fiscal Year Ending <Month>" block names its year on the NEXT line. A row's year is the block whose
// EXACT FIGURES it carries — money / percent / comma-grouped numbers, never a bare year (the block's own header
// would match) and never words (the same labels sit in every block). Blocks are scored one at a time (scoreSections
// merges same-section spans for the class decision, which is why the year was invisible before C3a).
//   best block alone         → "FYE <Month> <year>"
//   exactly two tied blocks  → "FYE <Month> <y1>–<y2>" (page order, newest first)
//   no exact figure / 3+ tie → null (a rounded "-$1.87M" row names no year — the frame renders none)
const FYE_HEAD = /^Fiscal Year Ending\s+([A-Za-z]+)\s*$/;
const FIGURE_RE = /\$[\d,]+(?:\.\d+)?|\d+(?:\.\d+)?%|\d{1,3}(?:,\d{3})+/g;

export function fiscalYearOfBlock(blockText: string): { month: string; year: string } | null {
  const ls = blockText.split("\n");
  const m = FYE_HEAD.exec(ls[0] ?? "");
  const y = /^(\d{4})$/.exec((ls[1] ?? "").trim());
  return m && y ? { month: m[1], year: y[1] } : null;
}

export function figureTokens(text: string): Set<string> {
  return new Set([...String(text ?? "").matchAll(FIGURE_RE)].map((m) => m[0]));
}

export type FiscalBlockScore = { fiscal_year: string; score: number };
export function attributeFiscalYear(rowText: string, spans: SectionSpan[]): { fiscal_year: string | null; fiscal_blocks: FiscalBlockScore[] } {
  const rowFigs = figureTokens(rowText);
  const blocks: FiscalBlockScore[] = [];
  for (const sp of spans) {
    if (sp.section !== "filing_data") continue;
    const fy = fiscalYearOfBlock(sp.text);
    if (!fy) continue;
    const body = sp.text.split("\n").slice(2).join("\n"); // the block minus its own two header lines
    const figs = figureTokens(body);
    let score = 0;
    for (const f of rowFigs) if (figs.has(f)) score++;
    blocks.push({ fiscal_year: `FYE ${fy.month} ${fy.year}`, score });
  }
  const best = Math.max(0, ...blocks.map((b) => b.score));
  if (best === 0) return { fiscal_year: null, fiscal_blocks: blocks };
  const top = blocks.filter((b) => b.score === best);
  if (top.length === 1) return { fiscal_year: top[0].fiscal_year, fiscal_blocks: blocks };
  if (top.length === 2) {
    const [a, b] = top; // page order — newest first on ProPublica
    const ya = a.fiscal_year.split(" "), yb = b.fiscal_year.split(" ");
    const range = ya[1] === yb[1] ? `FYE ${ya[1]} ${ya[2]}–${yb[2]}` : `${a.fiscal_year}–${b.fiscal_year}`;
    return { fiscal_year: range, fiscal_blocks: blocks };
  }
  return { fiscal_year: null, fiscal_blocks: blocks };
}

// ── Row attribution: which section does a minted row's text come from? ──────────────────────────
// Token overlap between the row's text and each section span — money / numeric / percent tokens weigh
// 3 (a figure pins a filing block; an EIN pins the summary), words weigh 1, stopwords dropped. Pure
// string arithmetic; identical inputs give identical output.
const STOP = new Set([
  "the", "and", "for", "with", "that", "this", "from", "are", "was", "were", "has", "have", "had", "not", "its", "their",
  "our", "who", "into", "onto", "than", "then", "also", "but", "per", "via", "all", "any", "one", "two", "most", "more",
  "profile", "confirms", "lists", "listed", "org", "com", "www", "https", "http", "center", "children", "families", "family",
  "edgewood", "san", "francisco", "california", "bay", "area", "organization", "nonprofit", "guidestar", "candid",
  "propublica", "charity", "navigator", "explorer",
]);

export function tokenize(text: string): Map<string, number> {
  const out = new Map<string, number>();
  const s = String(text ?? "").toLowerCase();
  for (const m of s.matchAll(/-?\$[\d,]+(?:\.\d+)?|\d+(?:\.\d+)?%|\b\d{2}-\d{7}\b|\b\d{4,}\b|\b[a-z][a-z0-9'-]{2,}\b/g)) {
    const tok = m[0].replace(/^-/, "");
    if (STOP.has(tok)) continue;
    const w = /^\$|%$|^\d/.test(tok) ? 3 : 1;
    out.set(tok, w);
  }
  return out;
}

export type SectionScore = { section: RegistrySection; class: RegistryClass; score: number };

export function scoreSections(rowText: string, spans: SectionSpan[]): SectionScore[] {
  const rowToks = tokenize(rowText);
  // merge spans of the same section so a section is scored once
  const merged = new Map<RegistrySection, { class: RegistryClass; toks: Set<string> }>();
  for (const sp of spans) {
    const cur = merged.get(sp.section) ?? { class: sp.class, toks: new Set<string>() };
    for (const t of tokenize(sp.text).keys()) cur.toks.add(t);
    merged.set(sp.section, cur);
  }
  const scores: SectionScore[] = [];
  for (const [section, { class: cls, toks }] of merged) {
    let score = 0;
    for (const [t, w] of rowToks) if (toks.has(t)) score += w;
    scores.push({ section, class: cls, score });
  }
  return scores.sort((a, b) => b.score - a.score || a.section.localeCompare(b.section));
}

/** one incidental word never places a row; two distinctive tokens (or one figure) do */
export const MIN_SECTION_SCORE = 2;

/** The class a markerless snapshot takes on each page type — registry_meta everywhere (ruling 2026-09-18); journalism
 *  never reaches the section step. Kept as a table so the rule reads at one glance. */
export const PAGE_DEFAULT_CLASS: Record<RegistryPageType, RegistryClass> = {
  filing_data: "registry_meta",
  profile: "registry_meta",
  rating: "registry_meta",
  journalism: "journalism",
};

export type RegistryClassification = {
  host_rule: string;
  page_type: RegistryPageType;
  section: RegistrySection;
  class: RegistryClass;
  basis: {
    /** ld_json page confirmation from the stored snapshot (null when absent or unrecognized) */
    ld_hint: RegistryPageType | null;
    /** C3a: the snapshot row the span table is keyed by (outside_page_snapshots.text_sha256); null ⇒ no table */
    snapshot_sha: string | null;
    /** C3a: the span table — every section of the stored page with offsets into that snapshot's raw clean_text.
     *  Empty when the page is not byte-exact (spans_exact=false) or the snapshot carries no sha. Pre-C3a rows
     *  carried an integer count here (now section_count). */
    snapshot_sections: SectionSpanRow[];
    /** how many sections the stored page split into (the pre-C3a snapshot_sections count) */
    section_count: number;
    /** C3a: clean_text.slice(start, end) === text held for every span on write; false ⇒ the table was omitted */
    spans_exact: boolean;
    /** C3a (filing_data pages): the year of the block whose exact figures the row carries; null when none */
    fiscal_year: string | null;
    /** C3a: per-block exact-figure scores behind fiscal_year (filing_data pages; [] elsewhere) */
    fiscal_blocks: FiscalBlockScore[];
    /** per-section overlap scores, best first */
    scores: SectionScore[];
    /** the runner-up section scored ≥ half the winner (and ≥ 3): the row mixes sections — reported, not split */
    mixed: boolean;
    classifier_version: string;
  };
};

export const REGISTRY_CLASSIFIER_VERSION = "c3a-2026-09-18.1"; // c3a + markerless pages default by ld_json hint, else registry_meta

/** C3a fold (ruling 2026-09-18): a MARKERLESS page whose stored snapshot carries an ld_json hint defaults to the
 *  hint's class — Review → rating; Dataset → the filing_data page default (registry_meta); Article → journalism.
 *  No hint → registry_meta (c2b). filing / self_reported are still never assumed (a hint is the page's own word
 *  about what it is, never about which section a row came from). */
export const HINT_DEFAULT_CLASS: Record<RegistryPageType, RegistryClass> = {
  rating: "rating",
  filing_data: PAGE_DEFAULT_CLASS.filing_data,
  profile: PAGE_DEFAULT_CLASS.profile,
  journalism: "journalism",
};
export function markerlessClass(ldHint: RegistryPageType | null): RegistryClass {
  return ldHint ? HINT_DEFAULT_CLASS[ldHint] : "registry_meta";
}

/** Classify one row. Returns null when the URL is not a registry URL (the row is none of this module's business). */
export function classifyRegistryRow(args: {
  url: string | null | undefined;
  /** claim_text + evidence_excerpt (+ quote) — whatever text the row carries */
  text: string | null | undefined;
  snapshot?: RegistrySnapshot | null;
}): RegistryClassification | null {
  const m = matchRegistryUrl(args.url);
  if (!m) return null;
  const ld_hint = ldPageHint(args.snapshot?.structured);
  const snapshot_sha = typeof args.snapshot?.text_sha256 === "string" && args.snapshot.text_sha256 ? args.snapshot.text_sha256 : null;
  const noSpans = { snapshot_sha, snapshot_sections: [] as SectionSpanRow[], section_count: 0, spans_exact: true, fiscal_year: null, fiscal_blocks: [] as FiscalBlockScore[] };
  if (m.page_type === "journalism") {
    return { host_rule: m.host_rule, page_type: "journalism", section: "article", class: "journalism", basis: { ld_hint, ...noSpans, scores: [], mixed: false, classifier_version: REGISTRY_CLASSIFIER_VERSION } };
  }
  const spans = sectionSpans(m.page_type, args.snapshot?.clean_text);
  // C3a: the span table rides the row ONLY when every offset reproduces its text from the raw page AND the snapshot
  // is named by its sha — otherwise the table is omitted (fail closed) and the classification proceeds on the text
  // spans exactly as before. The count stays as section_count.
  const spans_exact = spansAreExact(args.snapshot?.clean_text, spans);
  const table = spans_exact && snapshot_sha ? spanTable(spans) : [];
  const fy = m.page_type === "filing_data" ? attributeFiscalYear(String(args.text ?? ""), spans) : { fiscal_year: null, fiscal_blocks: [] };
  const spanBasis = { snapshot_sha, snapshot_sections: table, section_count: spans.length, spans_exact, fiscal_year: fy.fiscal_year, fiscal_blocks: fy.fiscal_blocks };
  // A snapshot whose only span is the catch-all (no marker matched — e.g. a page whose text cap was
  // consumed by layout JSON) has NO readable sections: attribution would be noise.
  const readable = spans.some((s) => s.section !== "profile_meta" && s.section !== "org_summary");
  const scores = readable ? scoreSections(String(args.text ?? ""), spans) : [];
  const top = scores[0];
  const second = scores[1];
  if (!top || top.score < MIN_SECTION_SCORE) {
    // NO MATCHED MARKER (fold, ruling 2026-09-18): a snapshot whose only span is the catch-all — or a row that
    // overlaps no section — takes the ld_json hint's class when the page names itself (CN's stored Elementor page
    // carries ld Review → rating), else REGISTRY META / outside voice (Mithun's CauseIQ row, run 78, was born filing
    // from a 207-char markerless snapshot under the pre-c2b default). A filing or self_reported class is earned
    // only from a matched section; it is never assumed from the page type or the hint.
    return {
      host_rule: m.host_rule, page_type: m.page_type, section: "page_default", class: markerlessClass(ld_hint),
      basis: { ld_hint, ...spanBasis, fiscal_year: null, scores, mixed: false, classifier_version: REGISTRY_CLASSIFIER_VERSION },
    };
  }
  const mixed = !!second && second.score >= 3 && second.score * 2 >= top.score && second.class !== top.class;
  return {
    host_rule: m.host_rule, page_type: m.page_type, section: top.section, class: top.class,
    // the fiscal year is a FILING row's attribute: a registry_meta row on a filing page carries none
    basis: { ld_hint, ...spanBasis, fiscal_year: top.class === "filing" ? fy.fiscal_year : null, scores, mixed, classifier_version: REGISTRY_CLASSIFIER_VERSION },
  };
}

/** The mint-time stamp a classification implies. journalism → null (the model's label stands). */
export function registryStamp(c: RegistryClassification): { evidence_class: "filing" | "prose"; voice_class: "client_voice" | "outside_voice_about_client" } | null {
  switch (c.class) {
    case "filing": case "self_reported": return { evidence_class: "filing", voice_class: "client_voice" };
    case "rating": case "derived_metric": case "registry_meta": return { evidence_class: "prose", voice_class: "outside_voice_about_client" };
    case "journalism": return null;
  }
}

// ── Exclusion predicates (pure; shared by recurrence, provenance and the own-words corpus) ────────
/** A filing-class row — Form 990 data or a self-reported registry section — is the company speaking through a
 *  registry. Recurrence and corroboration treat it like own-domain. */
export function isFilingClassRow(row: { evidence_class?: string | null } | null | undefined): boolean {
  return !!row && row.evidence_class === "filing";
}

/** Own-words corpus (extract-own-words): a registry host is excluded REGARDLESS of voice_class — fail closed until a
 *  section boundary exists for minting (C2). Journalism on a newsroom host is excluded too: it is never the company's words. */
export function excludeRegistryFromOwnWords<T extends { source_url?: string | null }>(signals: T[]): { kept: T[]; excluded: T[] } {
  const kept: T[] = [];
  const excluded: T[] = [];
  for (const s of signals) (isRegistryUrl(s.source_url) ? excluded : kept).push(s);
  return { kept, excluded };
}
