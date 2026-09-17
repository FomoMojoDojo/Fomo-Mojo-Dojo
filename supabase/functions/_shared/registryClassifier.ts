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
// FAIL CLOSED: a row on a registry host whose section cannot be read from the stored snapshot takes
// the PAGE DEFAULT — filing for a filing-data page, self_reported for a profile page, rating for a
// rating page — so an unreadable registry row is never born as the outside speaking.

export type RegistryPageType = "filing_data" | "profile" | "rating" | "journalism";
export type RegistryClass = "filing" | "self_reported" | "rating" | "derived_metric" | "registry_meta" | "journalism";
export type RegistrySection =
  | "filing_data"      // ProPublica "Fiscal Year Ending …" blocks (Form 990 extracted data)
  | "org_summary"      // ProPublica "Organization summary" + page boilerplate (EIN, 501(c), NTEE)
  | "self_reported"    // GuideStar "SOURCE: Self-reported by organization" blocks; CN Mission/Vision/Goals block
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
};

export type SectionSpan = { section: RegistrySection; class: RegistryClass; text: string };

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
  const ls = lines(text);
  const spans: SectionSpan[] = [];
  const push = (section: RegistrySection, buf: string[]) => {
    const t = buf.join("\n").trim();
    if (t) spans.push({ section, class: classOf(section), text: t });
  };

  if (pageType === "journalism") return [{ section: "article", class: "journalism", text }];

  if (pageType === "filing_data") {
    // ProPublica: everything before the first "Fiscal Year Ending" is registry text (summary + boilerplate);
    // each "Fiscal Year Ending" block is filing data until the next one.
    let cur: RegistrySection = "org_summary";
    let buf: string[] = [];
    for (const l of ls) {
      if (PROPUBLICA_MARKERS.filing_block.some((m) => l.startsWith(m))) { push(cur, buf); cur = "filing_data"; buf = [l]; continue; }
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
    let buf: string[] = [];
    for (const l of ls) {
      if (headings.has(l)) { push(cur, buf); cur = "profile_meta"; buf = [l]; continue; }
      if (l === GUIDESTAR_SELF_REPORTED_MARKER) { cur = "self_reported"; buf.push(l); continue; }
      buf.push(l);
    }
    push(cur, buf);
    return spans;
  }

  // rating (Charity Navigator): Mission opens the organization-supplied block; a rating heading or a
  // derived-metric heading closes it and opens its own section; everything else is registry text.
  let cur: RegistrySection = "profile_meta";
  let buf: string[] = [];
  for (const l of ls) {
    if (CN_SELF_REPORTED_OPEN.includes(l)) { push(cur, buf); cur = "self_reported"; buf = [l]; continue; }
    if (CN_DERIVED_METRIC_MARKERS.some((m) => l === m || l.startsWith(m))) { push(cur, buf); cur = "derived_metric"; buf = [l]; continue; }
    if (CN_RATING_MARKERS.some((m) => l === m || l.endsWith(m) || l.startsWith(m))) { push(cur, buf); cur = "rating"; buf = [l]; continue; }
    buf.push(l);
  }
  push(cur, buf);
  return spans;
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

export const PAGE_DEFAULT_CLASS: Record<RegistryPageType, RegistryClass> = {
  filing_data: "filing",
  profile: "self_reported",
  rating: "rating",
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
    /** whether any readable section was found in the stored snapshot */
    snapshot_sections: number;
    /** per-section overlap scores, best first */
    scores: SectionScore[];
    /** the runner-up section scored ≥ half the winner (and ≥ 3): the row mixes sections — reported, not split */
    mixed: boolean;
    classifier_version: string;
  };
};

export const REGISTRY_CLASSIFIER_VERSION = "c1-2026-09-17";

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
  if (m.page_type === "journalism") {
    return { host_rule: m.host_rule, page_type: "journalism", section: "article", class: "journalism", basis: { ld_hint, snapshot_sections: 0, scores: [], mixed: false, classifier_version: REGISTRY_CLASSIFIER_VERSION } };
  }
  const spans = sectionSpans(m.page_type, args.snapshot?.clean_text);
  // A snapshot whose only span is the catch-all (no marker matched — e.g. a page whose text cap was
  // consumed by layout JSON) has NO readable sections: attribution would be noise.
  const readable = spans.some((s) => s.section !== "profile_meta" && s.section !== "org_summary");
  const scores = readable ? scoreSections(String(args.text ?? ""), spans) : [];
  const top = scores[0];
  const second = scores[1];
  if (!top || top.score < MIN_SECTION_SCORE) {
    // FAIL CLOSED — no readable section (or no real overlap): the page default decides — never the
    // outside speaking on a filing / profile page.
    return {
      host_rule: m.host_rule, page_type: m.page_type, section: "page_default", class: PAGE_DEFAULT_CLASS[m.page_type],
      basis: { ld_hint, snapshot_sections: spans.length, scores, mixed: false, classifier_version: REGISTRY_CLASSIFIER_VERSION },
    };
  }
  const mixed = !!second && second.score >= 3 && second.score * 2 >= top.score && second.class !== top.class;
  return {
    host_rule: m.host_rule, page_type: m.page_type, section: top.section, class: top.class,
    basis: { ld_hint, snapshot_sections: spans.length, scores, mixed, classifier_version: REGISTRY_CLASSIFIER_VERSION },
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
