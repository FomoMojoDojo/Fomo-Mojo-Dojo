// AUTHORSHIP GATE — outside ingest path (operator ruling 2026-09-03, A+B).
//
// LAW: CHANNEL ≠ VOICE. public-baseline stamped voice_class by HOST (own domain ⇒ client_voice,
// everything else ⇒ the model's label, in practice outside_voice_about_client). An aggregator
// company-profile page (Glassdoor /Overview/, LinkedIn /company/, Crunchbase /organization/,
// ZoomInfo /c/, …) is a CHANNEL that carries several voices at once: the company's own boilerplate
// reproduced on the page, the aggregator's computed facts, reviewers' words. The host stamp said
// nothing about WHOSE WORDS an item carries — so company copy on Glassdoor scored as market
// confirmation of the company's own claims (Geniant 1e590a73: 7 false echoes from one row).
//
// This module adds an AUTHORSHIP test on that path, mirroring the upload classifier's criterion
// (uploadVoiceClassifier.ts: "judge authorship, not topic"):
//   · the URL PATTERN gates the judge (a /Reviews/ row, a news release, a person profile never
//     reach the model);
//   · AUTHORSHIP decides — the SUBJECT company speaking ⇒ client_voice; ANOTHER named entity
//     speaking (an acquired studio's own LinkedIn page, a partner's own program page) ⇒
//     competitor_voice; the aggregator / reviewers / journalists speaking ⇒ the label is left
//     exactly as the model set it (outside_voice_about_client stays, market_context stays);
//   · FAIL TOWARD UNCHANGED — a judge error, timeout, unparseable or malformed answer leaves the
//     label untouched and is recorded on the entry (never a silent flip in either direction).
//
// Two consumers: (A) public-baseline's ingest (demoteAggregatorSelfVoiceInResult, forward-only,
// runs on the parsed result before it is persisted/minted so signals.voice_class is born from
// authorship); (B) the audited backfill (planRestamp / applyRestamp / revertRestamp over an
// injected RestampStore) that re-stamps the already-stored rows — dry-run by default, ZERO
// writes until the operator has reviewed the plan, one audit row per change, reversible by run.
// The frozen guard (companies.frozen + FROZEN_COMPANY_IDS courtesy set) refuses CB1 before any
// write, in plan and in apply.

import { callClassifierWithUsage, CLASSIFIER_MODEL, isLocalOllamaUrl } from "./uploadVoiceClassifier.ts";
import type { ModelCallRecord } from "./recordModelCall.ts";
import { sanitizeForStore, sanitizeNullable } from "./sanitizeForStore.ts";
import { isOwnDomainUrl } from "./firstReadProvenance.ts";
import { voiceClassForMintedExcerpt } from "./voiceClassAtMint.ts";
import { FROZEN_COMPANY_IDS } from "./frozenCompanies.ts";

/** no_page_words (R54): the text could not be placed on a stored page, so the judge was NOT asked — no model call, no
 *  ledger row; every consumer treats it as "the label stands" (outcomeFor → null). Never accepted from the model. */
export type AuthorshipVerdict = "subject_company" | "other_entity" | "third_party" | "uncertain" | "judge_failed" | "no_page_words";
export type AuthorshipJudgment = { verdict: AuthorshipVerdict; entity: string | null; reason: string; model: string };
/** What the judge may DO to a label: set client_voice, set competitor_voice, or nothing. */
export type VoiceOutcome = "client_voice" | "competitor_voice" | null;
// ── R54 (operator ruling, 2026-10-20): THE JUDGE SEES WHERE THE TEXT SITS ON THE PAGE ──────────────────────────────
// The judge was handed the excerpt and the host's field brief and nothing else, so it could not tell which FIELD the
// excerpt came from: on chamberofcommerce.com it called three template contact / Q&A lines "the About field". It now
// gets the nearest preceding heading and the page words around the excerpt, taken from the STORED page at the excerpt
// offset (the R42 pattern: context from the page, never from the row). A text that cannot be placed on a page is not
// judged at all (no_page_words). The context is REQUIRED — there is no default — and built by ONE helper.
/** UTF-16 code units of page text kept before / after the excerpt. */
export const AUTHORSHIP_CONTEXT_BEFORE = 600;
export const AUTHORSHIP_CONTEXT_AFTER = 300;
/** How far back (UTF-16 units) the nearest heading is searched, and the longest line that counts as a heading. */
export const AUTHORSHIP_HEADING_LOOKBACK = 2000;
export const AUTHORSHIP_HEADING_MAX = 48;
export type AuthorshipPageContext = {
  kind: "page"; heading: string | null; before: string; after: string;
  /** the excerpt's offset in the page: UTF-16 code units (JS string index), and the same position in code points */
  offset_utf16: number; offset_cp: number; length_utf16: number;
};
export type AuthorshipNoPage = { kind: "no_page"; reason: string };
export type AuthorshipContext = AuthorshipPageContext | AuthorshipNoPage;
export const noPageWords = (reason: string): AuthorshipNoPage => ({ kind: "no_page", reason });
/** A heading line: short, starts with a capital letter, mostly letters, no terminal punctuation, not a time / phone line. */
function isHeadingLine(line: string): boolean {
  const t = line.trim();
  if (t.length < 2 || t.length > AUTHORSHIP_HEADING_MAX) return false;
  if (!/^[A-Z]/.test(t) || /[.!?:;,]$/.test(t)) return false;
  if (/\d{1,2}:\d{2}|\d{3}[-.\s]\d{3}[-.]\d{4}/.test(t)) return false;
  const letters = (t.match(/\p{L}/gu) ?? []).length;
  return letters / t.replace(/\s/g, "").length >= 0.6;
}
/** THE context builder (R54): from the stored page text and the excerpt offset. The text must sit at that offset in the
 *  page (slice-equal); otherwise — or with no page, no text, no offset — the result is no_page and the judge is not asked. */
export function authorshipContext(pageText: string | null | undefined, text: string | null | undefined, offset: number | null | undefined): AuthorshipContext {
  const page = typeof pageText === "string" ? pageText : "";
  const t = String(text ?? "");
  if (!page.trim()) return noPageWords("no stored page");
  if (!t.trim()) return noPageWords("no text to place on the page");
  if (offset === null || offset === undefined || !Number.isInteger(offset) || offset < 0) return noPageWords("the text has no offset on the stored page");
  if (page.slice(offset, offset + t.length) !== t) return noPageWords(`the text is not at offset ${offset} of the stored page`);
  // R54a (operator ruling, 2026-10-20): the context is the SECTION the text sits in — from the heading above to the next
  // heading below, or the window cap, NEVER across a heading. The heading above is kept as the heading line, not as words.
  const lineStart = page.lastIndexOf("\n", offset - 1) + 1;
  let heading: string | null = null, sectionStart = 0;
  for (let end = lineStart; end > 0 && lineStart - end <= AUTHORSHIP_HEADING_LOOKBACK;) {
    const start = end >= 2 ? page.lastIndexOf("\n", end - 2) + 1 : 0;
    if (isHeadingLine(page.slice(start, end))) { heading = page.slice(start, end).trim(); sectionStart = end; break; }
    end = start;
  }
  const textEnd = offset + t.length, afterCap = textEnd + AUTHORSHIP_CONTEXT_AFTER;
  let sectionEnd = afterCap;
  for (let start = page.indexOf("\n", textEnd) + 1; start > 0 && start < afterCap;) {
    const nl = page.indexOf("\n", start), end = nl < 0 ? page.length : nl;
    if (isHeadingLine(page.slice(start, end))) { sectionEnd = start; break; }
    if (nl < 0) break;
    start = nl + 1;
  }
  return {
    kind: "page", heading,
    before: page.slice(Math.max(sectionStart, offset - AUTHORSHIP_CONTEXT_BEFORE), offset),
    after: page.slice(textEnd, Math.min(sectionEnd, afterCap)),
    offset_utf16: offset, offset_cp: [...page.slice(0, offset)].length, length_utf16: t.length,
  };
}
/** Where a stored text sits on a page when no offset was stored: its first byte-present occurrence, else null. */
export function locateOnPage(pageText: string | null | undefined, text: string | null | undefined): number | null {
  const page = typeof pageText === "string" ? pageText : "", t = String(text ?? "");
  if (!page || !t.trim()) return null;
  const i = page.indexOf(t);
  return i >= 0 ? i : null;
}
export type AuthorshipInput = { subjectName: string; subjectHost: string; url: string; text: string; context: AuthorshipContext };
export type AuthorshipJudge = (input: AuthorshipInput) => Promise<AuthorshipJudgment>;
/** R53 (2026-10-20): the authorship judge's two seams, the speaker judge's shape. The transport is one local call returning
 *  content + token counts; the ledger writes ONE model_calls row per call BEFORE the answer is parsed and resolves false
 *  when the write failed (never throws). The ledger is REQUIRED: a call with none fails to compile and throws before any call. */
export type AuthorshipTransport = (args: { model: string; system: string; user: string }) => Promise<{ content: string; prompt_tokens: number | null; completion_tokens: number | null }>;
export type AuthorshipLedger = (e: { usage: ModelCallRecord; promptSha: string }) => Promise<boolean>;

// ── URL gate ────────────────────────────────────────────────────────────────────
// Aggregator COMPANY-PROFILE pages — the pages that reproduce a company's own "about" blurb
// beside aggregator data — and, since the amendment below, PRESS RELEASES. Review pages, salary
// pages, person profiles and search pages are still deliberately NOT matched: their dominant
// voice is the public's or a journalist's, and the host stamp is right for them. Per-host path
// rules, not a bare host list, so the same host can be gated on one path and left alone on another.
//
// AMENDMENT (operator ruling, 2026-10-16) — PRESS RELEASES ONLY. The 2026-09-03 gate excluded news
// releases on the grounds that their dominant voice is a journalist's. That is true of the reporting
// and false of the BOILERPLATE: a release carries an "About <company>" paragraph that is the
// company's own copy, and a third party reprinting it does not make it the third party's words.
// IAQM's staged positioning cited exactly such a sentence — "pioneered many of the most advanced,
// efficient and cost-effective decontamination services in the industry", classed `record` from
// contractorsupplymagazine.com — which is IAQM describing itself, reprinted. Reviews, salary, person
// and search pages stay excluded; only releases are added.
export const AGGREGATOR_PROFILE_PATTERNS: ReadonlyArray<{ host: string; path: RegExp }> = [
  { host: "glassdoor.com", path: /^\/overview\//i },
  { host: "linkedin.com", path: /^\/company\//i },
  { host: "crunchbase.com", path: /^\/organization\//i },
  { host: "globenewswire.com", path: /^\/search\/organization\//i },
  { host: "cbinsights.com", path: /^\/company\//i },
  { host: "pitchbook.com", path: /^\/profiles\/company\//i },
  { host: "zoominfo.com", path: /^\/c\//i },
  { host: "datanyze.com", path: /^\/companies\//i },
  { host: "getlatka.com", path: /^\/companies\//i },
  { host: "leadiq.com", path: /^\/c\//i },
  { host: "prospeo.io", path: /^\/c\//i },
  { host: "salary.com", path: /^\/research\/company\//i },
  { host: "bbb.org", path: /\/profile\//i },
  { host: "guidestar.org", path: /^\/profile\//i },
  { host: "charitynavigator.org", path: /^\/ein\//i },
  { host: "rocketreach.co", path: /-(profile|management)_/i },
  { host: "craft.co", path: /^\/[^/]+\/?$/ },
  { host: "owler.com", path: /^\/company\//i },
  { host: "dnb.com", path: /^\/business-directory\/company-profiles\./i },
  // Company page ONLY — /cmp/<slug>/reviews is a review page and stays ungated.
  { host: "indeed.com", path: /^\/cmp\/[^/?#]+\/?$/i },
  // Product / seller profile ONLY — /products/<x>/reviews is a review page and stays ungated.
  { host: "g2.com", path: /^\/(products|sellers)\/[^/?#]+\/?$/i },
  // ── R49 (operator ruling R51, 2026-10-20): PROVIDER-WRITTEN PROFILE HOSTS ─────────────────────────────────
  // The b3 fleet's 724 rows were read host by host from the stored page structure (R46 diagnostic): these hosts carry
  // a field the subject writes itself (an About / description / program / app-store / brand-store text) beside
  // platform data and reviews. Each has a field brief below so the judge decides by FIELD, never by tone.
  // Health-care and social-care directories: the provider writes its own profile text
  { host: "psychologytoday.com", path: /^\/us\/(treatment-rehab|therapists|psychiatrists|groups)\//i },
  { host: "findhelp.org", path: /^\/provider\//i },
  { host: "recovery.com", path: /^\/(?!blog|research|about|resources|insurance|news)[^/?#]+\/?$/i },
  // School directories: the school's own overview beside NCES data and reviews
  { host: "privateschoolreview.com", path: /-profile\/?$/i },
  { host: "niche.com", path: /^\/(k12|colleges)\/[^/?#]+\/?$/i },
  // Nonprofit directories and review aggregators: an org- or business-supplied About beside ratings and reviews
  { host: "givefreely.com", path: /^\/charity-directory\/nonprofit\//i },
  { host: "birdeye.com", path: /^\/[^/?#]+-\d{6,}\/?$/ },
  // Home-services marketplaces: the pro writes "About us"; homeowners write the reviews
  { host: "angi.com", path: /^\/companylist\//i },
  { host: "homeadvisor.com", path: /^\/rated\./i },
  { host: "thumbtack.com", path: /\/service\/\d+/i },
  { host: "buildzoom.com", path: /^\/contractor\//i },
  { host: "alignable.com", path: /^\/[^/?#]+\/[^/?#]+\/?$/ },
  { host: "chamberofcommerce.com", path: /^\/business-directory\//i },
  { host: "findmoldremoval.com", path: /^\/[^/?#]+\/[^/?#]+\/[^/?#]+\/?$/ },
  // App stores: the developer writes the description; users write the reviews
  { host: "apps.apple.com", path: /^\/[a-z]{2}\/app\//i },
  { host: "play.google.com", path: /^\/store\/apps\/details/i },
  // Brand store: brand-supplied copy beside prices and customer reviews (the weakest entry, ruled in)
  { host: "bestbuy.com", path: /^\/site\/(brands\/|[^/?#]+\/all-[^/?#]+-products\/)/i },
  // Data aggregator and chamber directory: a company-supplied description paragraph beside platform data
  { host: "seamless.ai", path: /^\/b\//i },
  { host: "business.newportbeach.com", path: /^\/directory\/Details\//i },
];

// ── PRESS RELEASES (operator ruling, 2026-10-16) ─────────────────────────────────
// DETECTOR (a): the wire hosts, on their RELEASE paths only. A wire's own about/search pages are
// not releases and stay ungated — the path is the gate, exactly as above.
export const PRESS_RELEASE_PATTERNS: ReadonlyArray<{ host: string; path: RegExp }> = [
  { host: "prnewswire.com", path: /^\/news-releases\//i },
  { host: "businesswire.com", path: /^\/news\//i },
  { host: "globenewswire.com", path: /^\/news-release\//i },
  { host: "prweb.com", path: /^\/releases\//i },
];

// RELEASE-SHAPED, defined exactly. Measured against the eight pages detector (b) finds in the
// fleet: prose markers do NOT separate them — three true releases carry no "SOURCE", no media
// contact and no dateline at all — so the shape is read from the PATH, which does separate them.
//
//   release-shaped  ⇔  the path names news or a release
//                      AND the path is not a profile / review / person / search page
//                      AND the page is not a machine-written summary
//
// The last clause is the impala.digital case: an aggregator profile whose AI summary ends "For more
// information, visit www.edgewood.org" — a boilerplate close on a page that reprints nothing.
export const RELEASE_PATH_RE = /(^|\/)(news|news-release|news-releases|press-release|press-releases|releases|pr)(\/|-|$)/i;
export const NON_RELEASE_PATH_RE = /(^|\/)(profiles?|overview|reviews?|salary|salaries|people|person|search|jobs?)(\/|$)/i;
export const MACHINE_SUMMARY_RE = /\bAI[- ]generated\b|\bChatGPT\b|\bthis summary is\b/i;

/** The path half of release-shape. Pure URL — no page text, no I/O. */
export function isReleasePathShaped(url: string): boolean {
  let u: URL;
  try { u = new URL(url); } catch { return false; }
  const path = u.pathname || "/";
  return RELEASE_PATH_RE.test(path) && !NON_RELEASE_PATH_RE.test(path);
}

/** DETECTOR (b): a company-boilerplate close naming the SUBJECT's own domain. Case-insensitive, and
 *  EVERY close on the page is checked — a joint release carries one per company and the subject's is
 *  not necessarily the first (on IAQM's release WonderPaint's close comes first). Returns the close
 *  it matched, so a plan can show the operator what fired. Never opens the gate on its own. */
export function subjectBoilerplateClose(pageText: string, subjectHost: string): string | null {
  const own = String(subjectHost || "").toLowerCase().replace(/^www\d*\./, "");
  const text = String(pageText || "");
  if (!own || !text) return null;
  for (const m of text.matchAll(/for more information[\s\S]{0,160}/gi)) {
    const seg = m[0];
    for (const d of seg.matchAll(/([a-z0-9-]+(?:\.[a-z0-9-]+)+)/gi)) {
      const name = d[1].toLowerCase().replace(/^www\d*\./, "").replace(/[.,;:]$/, "");
      if (name === own || name.endsWith(`.${own}`)) return seg.replace(/\s+/g, " ").trim();
    }
  }
  return null;
}

/** THE ONE GATE the restamp uses: an aggregator profile (2026-09-03) or a press release
 *  (2026-10-16). (b) requires the page text AND the subject's host; without them only (a) can open,
 *  which is the fail-toward-unchanged direction this module has always taken. */
export function matchGatedUrl(
  url: string,
  opts?: { pageText?: string | null; subjectHost?: string | null },
): { host: string; path: string; via: "profile" | "wire" | "boilerplate" } | null {
  const profile = matchAggregatorProfileUrl(url);
  if (profile) return { ...profile, via: "profile" };
  let u: URL;
  try { u = new URL(url); } catch { return null; }
  const host = hostOf(url);
  const path = u.pathname || "/";
  if (!host) return null;
  for (const p of PRESS_RELEASE_PATTERNS) {
    if ((host === p.host || host.endsWith(`.${p.host}`)) && p.path.test(path)) return { host: p.host, path, via: "wire" };
  }
  const text = String(opts?.pageText ?? "");
  if (!text || !opts?.subjectHost) return null;                 // (b) cannot be decided — stay shut
  if (MACHINE_SUMMARY_RE.test(text)) return null;               // a machine summary reprints nothing
  if (!isReleasePathShaped(url)) return null;                   // (b) never opens alone
  if (!subjectBoilerplateClose(text, opts.subjectHost)) return null;
  return { host, path, via: "boilerplate" };
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\d*\./, "").toLowerCase();
  } catch {
    return "";
  }
}

export function matchAggregatorProfileUrl(url: string): { host: string; path: string } | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const host = hostOf(url);
  if (!host) return null;
  const path = u.pathname || "/";
  for (const p of AGGREGATOR_PROFILE_PATTERNS) {
    if ((host === p.host || host.endsWith(`.${p.host}`)) && p.path.test(path)) return { host: p.host, path };
  }
  return null;
}

// ── verdict → outcome ───────────────────────────────────────────────────────────
function normName(s: string): string {
  return String(s || "").toLowerCase().replace(/\b(llc|inc|ltd|corp|corporation|co|company|group|the)\b/g, " ").replace(/[^a-z0-9]+/g, " ").trim();
}
function initials(s: string): string {
  return normName(s).split(" ").filter(Boolean).map((w) => w[0]).join("");
}
/** Does the judge's "other entity" actually name the subject (by name, contained name, or acronym)? */
export function entityNamesSubject(entity: string | null, subjectName: string): boolean {
  if (!entity) return false;
  const e = normName(entity);
  const s = normName(subjectName);
  if (!e || !s) return false;
  if (e === s || e.includes(s) || s.includes(e)) return true;
  const ini = initials(subjectName);
  return ini.length >= 3 && e.replace(/\s+/g, "") === ini;
}

export function outcomeFor(j: AuthorshipJudgment, subjectName: string): VoiceOutcome {
  if (j.verdict === "subject_company") return "client_voice";
  if (j.verdict === "other_entity") {
    // An "other entity" that is the subject under another spelling is an inconsistent verdict —
    // fail toward unchanged rather than mark the company's own words as a competitor's.
    if (entityNamesSubject(j.entity, subjectName)) return null;
    return "competitor_voice";
  }
  return null;
}

// ── local judge (qwen2.5:14b-instruct on the operator's Ollama; local-only) ─────
//
// CRITERION (operator ruling 2026-09-03, "tighten"): STRUCTURAL, never tonal. The first cut asked the
// model whether text "read as marketing voice" — it equated neutral tone with third-party authorship
// and left company-supplied About copy (Geniant 1e590a73, 7 false echoes; Edgewood e756386d, 8) as
// outside voice. The judge is now told the HOST and PAGE TYPE, which FIELDS on that page are
// company-supplied and which are platform-authored, and is asked ONE question: which field is this
// text from, and who writes that field. Tone is not evidence.

/** Field-ownership brief per aggregator host: who writes what on this page type. Informational for
 *  the judge only — the URL gate table (AGGREGATOR_PROFILE_PATTERNS) is the sole gate and is unchanged. */
const PAGE_BRIEFS: ReadonlyArray<{ host: string; brief: string }> = [
  { host: "glassdoor.com", brief: "Glassdoor company Overview page. The 'About' / company description / mission field is COMPANY-SUPPLIED (the employer writes it, usually in the third person). Overall ratings, % recommend, interview stats, compensation ratings, review counts, pros/cons and salaries are PLATFORM- or REVIEWER-authored." },
  { host: "indeed.com", brief: "Indeed company page. The company description is EMPLOYER-SUPPLIED; ratings, review counts and review text are EMPLOYEE- or PLATFORM-authored." },
  { host: "linkedin.com", brief: "LinkedIn company page. The tagline, 'About' text and posts are written by the PAGE OWNER — the company that owns THIS page, which may be a different entity from the subject (an acquired studio's page is that studio's own copy). Follower counts are PLATFORM data." },
  { host: "crunchbase.com", brief: "Crunchbase organization profile. The company description paragraph is COMPANY-SUPPLIED boilerplate; acquisition counts, funding, headcount ranges and 'most recent' facts are PLATFORM data." },
  { host: "zoominfo.com", brief: "ZoomInfo company profile. The company description paragraph is COMPANY-SUPPLIED (taken from the company's own site, often 'X is a leading provider of…'); revenue estimates, headcount, activity/intent scores, PPP loan data, SIC/NAICS codes and news summaries are PLATFORM data." },
  { host: "cbinsights.com", brief: "CB Insights company profile. The company description is written by CB INSIGHTS ANALYSTS (PLATFORM-authored) even when it reads like an About paragraph; founding year, HQ, competitors and funding are PLATFORM data; press entries are wire/press summaries." },
  { host: "pitchbook.com", brief: "PitchBook profile. Descriptions, deal facts, headcount and HQ are PITCHBOOK-authored PLATFORM data." },
  { host: "datanyze.com", brief: "Datanyze data-aggregator profile. Revenue and headcount estimates, NAICS/SIC codes, HQ and categories are PLATFORM-computed; a company description paragraph, when present, is COMPANY-SUPPLIED boilerplate." },
  { host: "getlatka.com", brief: "GetLatka data-aggregator profile. Revenue and team-size estimates and headlines are PLATFORM-computed; a company description paragraph, when present, is COMPANY-SUPPLIED boilerplate." },
  { host: "leadiq.com", brief: "LeadIQ data-aggregator profile. NAICS/SIC codes, contacts, headcount and news summaries are PLATFORM data; a company description paragraph, when present, is COMPANY-SUPPLIED boilerplate." },
  { host: "prospeo.io", brief: "Prospeo data-aggregator profile. Revenue and employee estimates and funding status are PLATFORM-computed; a company description paragraph, when present, is COMPANY-SUPPLIED boilerplate." },
  { host: "rocketreach.co", brief: "RocketReach data-aggregator profile. Category, location, employee count, management lists and NAICS/SIC codes are PLATFORM data; a company description paragraph, when present, is COMPANY-SUPPLIED boilerplate." },
  { host: "salary.com", brief: "Salary.com company salary page. Salary ranges and averages are PLATFORM-computed; a company description paragraph, when present, is COMPANY-SUPPLIED boilerplate." },
  { host: "craft.co", brief: "Craft.co company profile. Status, sector, founding year, HQ, revenue and headcount are PLATFORM data; a company description paragraph, when present, is COMPANY-SUPPLIED boilerplate." },
  { host: "owler.com", brief: "Owler company profile. Revenue/headcount estimates and competitor lists are PLATFORM data; a company description paragraph, when present, is COMPANY-SUPPLIED boilerplate." },
  { host: "dnb.com", brief: "Dun & Bradstreet company profile. Revenue, headcount, industry codes and location are PLATFORM data; a company description paragraph, when present, is COMPANY-SUPPLIED boilerplate." },
  { host: "bbb.org", brief: "BBB business profile. The 'Business Details' / products-and-services description and stated leadership are COMPANY-SUPPLIED; accreditation status and dates, BBB rating, licensing lines and complaint summaries are BBB-authored PLATFORM data; complaint and review bodies are CUSTOMER-authored." },
  { host: "guidestar.org", brief: "Candid / GuideStar nonprofit profile. Mission, program and 'what we do' descriptions are SELF-REPORTED by the nonprofit (COMPANY-SUPPLIED); EIN, IRS category, seals of transparency and financial figures are PLATFORM data." },
  { host: "charitynavigator.org", brief: "Charity Navigator profile. Star ratings, scores, expense ratios, board-independence metrics and 'not yet scored' notes are CHARITY NAVIGATOR-authored PLATFORM data; a quoted mission statement is the nonprofit's own copy." },
  { host: "g2.com", brief: "G2 product / seller profile. The product or seller description is VENDOR-SUPPLIED; star ratings, review counts and 'users praise…' summaries are REVIEWER- or PLATFORM-authored." },
  { host: "globenewswire.com", brief: "PRESS WIRE (GlobeNewswire). A release body — including its self-descriptive boilerplate ('X, a leading…', 'X announced…') — is COMPANY-AUTHORED: the company wrote it and paid to distribute it. Only the wire's own index / search-listing lines (headline lists, dates, result counts) are PLATFORM-authored." },
  { host: "prnewswire.com", brief: "PRESS WIRE (PR Newswire). A release body — including its self-descriptive boilerplate — is COMPANY-AUTHORED; only the wire's own index / search-listing lines are PLATFORM-authored." },
  { host: "businesswire.com", brief: "PRESS WIRE (Business Wire). A release body — including its self-descriptive boilerplate — is COMPANY-AUTHORED; only the wire's own index / search-listing lines are PLATFORM-authored." },
  // ── R49 (2026-10-20): field briefs for the provider-written profile hosts ──────────────────────────────────
  { host: "psychologytoday.com", brief: "Psychology Today treatment-center / therapist profile. The About, program and 'we serve' prose is PROVIDER-WRITTEN (the center writes its own profile); the 'Verified by Psychology Today' badge, license line, and the insurance / payment / age / expertise / specialty lists are PLATFORM fields filled from the provider's selections; nothing on the page is reviewer-authored." },
  { host: "findhelp.org", brief: "findhelp.org social-care directory provider page. Program descriptions, eligibility text and 'next steps' prose are PROVIDER-SUBMITTED (the organization claims and edits its programs); postal, hours, contact and category chrome is PLATFORM." },
  { host: "recovery.com", brief: "Recovery.com treatment-center profile. The 'About Us' block, amenities and levels-of-care lists are PROVIDER-SUPPLIED; the center overview paragraph is RECOVERY.COM-EDITORIAL written from provider materials (PLATFORM); star ratings and review bodies are REVIEWER-authored." },
  { host: "privateschoolreview.com", brief: "Private School Review school profile. The 'School Overview' / 'About Us' text is SCHOOL-SUPPLIED; enrollment, student-teacher ratio, rankings and 'Source: NCES' lines are PLATFORM data." },
  { host: "niche.com", brief: "Niche K-12 / college profile. The About blurb is SCHOOL-CLAIMED or NCES-derived (COMPANY-SUPPLIED when the school claimed the page); grades, ratios, grades-by-category and rankings are PLATFORM; review sentences ('I find the school…') are REVIEWER-authored." },
  { host: "givefreely.com", brief: "GiveFreely charity-directory profile. The Overview is an AI SUMMARY (PLATFORM) drawn from two sources: the organization's Form 990 mission and program statements (ORGANIZATION-SUPPLIED, reworded — 'is committed to being…', 'Their mission is to…') and Facebook reviews (REVIEWER). Ratings, expense ratios and board percentages are PLATFORM data." },
  { host: "birdeye.com", brief: "Birdeye reviews aggregator business page. 'About this business' / 'About Us' is BUSINESS-SUPPLIED; the star rating, review count and category are PLATFORM; review bodies are REVIEWER-authored." },
  { host: "angi.com", brief: "Angi (Angie's List) company page. The 'About us' / services paragraph is PRO-WRITTEN (the company's own copy); ratings, badges and review bodies are HOMEOWNER- or PLATFORM-authored." },
  { host: "homeadvisor.com", brief: "HomeAdvisor rated-pro page. 'About us' is PRO-WRITTEN (the company's own copy); verification lines, ratings and review bodies are PLATFORM- or HOMEOWNER-authored." },
  { host: "thumbtack.com", brief: "Thumbtack pro service page. The Introduction / 'About' text is PRO-WRITTEN; Overview facts (hired count, background check, years in business) are PLATFORM; review bodies are CUSTOMER-authored." },
  { host: "buildzoom.com", brief: "BuildZoom contractor profile. The 'About' narrative is CONTRACTOR-SUPPLIED or copied from the contractor's own site; license, permit history, 'Verified' badges and the BuildZoom score are PLATFORM data; reviews are CUSTOMER-authored." },
  { host: "alignable.com", brief: "Alignable business profile. The 'About Us' and the whole profile prose are BUSINESS-WRITTEN; connection and recommendation counts are PLATFORM." },
  { host: "chamberofcommerce.com", brief: "ChamberofCommerce.com business-directory listing. The 'About' block is TEMPLATE listing sentences the PLATFORM generates from the listing data ('X is located at …', 'X can be contacted via phone at …') unless it is free prose, which is BUSINESS-SUPPLIED (COMPANY-SUPPLIED); category, hours and contact lines are PLATFORM; 'Ratings and Reviews' bodies are REVIEWER-authored." },
  { host: "findmoldremoval.com", brief: "Find Mold Removal directory listing. The 'About' text is BUSINESS-SUPPLIED; 'Verified' badges, category and service-area lines are PLATFORM chrome." },
  { host: "apps.apple.com", brief: "Apple App Store app page. The app description, subtitle and 'What's New' notes are DEVELOPER-WRITTEN (the subject, when the subject is the developer); ratings, rankings and the 'Ratings and Reviews' bodies are USER- or PLATFORM-authored." },
  { host: "play.google.com", brief: "Google Play app page. 'About this app' and 'What's new' are DEVELOPER-WRITTEN; 'About the developer', ratings and 'Ratings and reviews' bodies are PLATFORM- or USER-authored." },
  { host: "bestbuy.com", brief: "Best Buy brand-store / category page. Brand-page prose ('Sonos is…', product-line copy) is BRAND-SUPPLIED or written by Best Buy merchandising from brand materials (COMPANY-SUPPLIED); prices, SKUs, availability and sale lines are PLATFORM; customer reviews are CUSTOMER-authored." },
  { host: "seamless.ai", brief: "Seamless.AI data-aggregator company profile. The company description paragraph is COMPANY-SUPPLIED boilerplate (taken from the company's own site, often first person — 'We help…'); headcount, revenue, address and contact data are PLATFORM." },
  { host: "business.newportbeach.com", brief: "Newport Beach Chamber member directory listing. The 'About' text is MEMBER-SUPPLIED (the company's own copy); category, map and contact lines are PLATFORM." },
];
const GENERIC_BRIEF = "Third-party company profile page. A company description / About / mission paragraph is COMPANY-SUPPLIED; ratings, review counts, complaints, financial or PPP data, headcount and revenue estimates, SIC/NAICS codes, and analyst blurbs are PLATFORM-authored.";

export function pageBriefFor(url: string): { host: string; brief: string } {
  const host = hostOf(url);
  for (const b of PAGE_BRIEFS) {
    if (host === b.host || host.endsWith(`.${b.host}`)) return b;
  }
  return { host: host || "unknown host", brief: GENERIC_BRIEF };
}

const JUDGE_SYSTEM =
  "You determine WHO WROTE one short text that was collected from a third-party company-profile page (an aggregator such as " +
  "Glassdoor, LinkedIn, Crunchbase, ZoomInfo, BBB, GuideStar, CB Insights, or a press wire). You are told the SUBJECT company, the " +
  "HOST, and a PAGE BRIEF that says which fields on that page are COMPANY-SUPPLIED and which are PLATFORM-AUTHORED.\n" +
  "Answer ONE question — from which field does this text come, and who writes that field on this host:\n" +
  "- subject_company: the text is the SUBJECT company's own description copy — the company-supplied About / description / mission / " +
  "products-and-services field, or a press-release body the company authored. Company-supplied descriptions are routinely plain, " +
  "factual and written in the third person ('X focuses on…', 'X is a provider of…', 'X CSU is the only…'). That is still the company's copy.\n" +
  "- other_entity: the text is ANOTHER named company's or organization's own copy — e.g. a different company's LinkedIn page describing " +
  "itself, an acquired or subsidiary studio's own tagline or post, a partner's own program description. Name that entity.\n" +
  "- third_party: the text is PLATFORM-, REVIEWER- or ANALYST-authored data — star ratings, % recommend, review counts, complaint " +
  "bodies, employee or customer reviews, salaries, PPP-loan or financial data, headcount / revenue estimates, activity scores, " +
  "SIC/NAICS codes, acquisition/deal counts, founding-year/HQ facts as a platform summary, CB Insights or Charity Navigator analyst " +
  "blurbs, and a wire's own index or search-listing lines.\n" +
  "- uncertain: the text could come from either kind of field and nothing decides it.\n" +
  "RULES. (1) TONE IS NOT EVIDENCE: neutral, factual or unpolished wording does NOT make text platform-authored, and polished wording " +
  "does NOT make it company copy — decide by the FIELD and its author on this host. (2) A statement ABOUT the subject can be any of " +
  "the three; naming the subject decides nothing. (3) If company description copy carries an appended platform-metadata fragment " +
  "(e.g. 'Only 3 employee reviews publicly visible.', 'SIC Code 17,179; NAICS Code 56,562.'), judge the MAIN BODY and ignore the " +
  "appended fragment. (4) The subject may appear under variants (lower-case, with LLC/Inc, an acronym). (5) On a press wire, a " +
  "release body is the issuing company's copy even when it reports an event in the third person ('X announced the acquisition of…'). " +
  "(6) When the text could only be a company-supplied description field but you cannot tell WHICH company supplied it, answer uncertain. " +
  "(7) LISTING DATA IS PLATFORM-AUTHORED IN ANY FIELD: a sentence whose content is only listing data (the business name, address, " +
  "phone, URL, hours or category) is third_party wherever it sits, even under an 'About' heading ('X is located at 86 Main St in " +
  "Medford, MA 02155.' → third_party); company-supplied means prose the company wrote ('We have restored historic homes across the " +
  "North Shore since 1998.' or 'X builds custom cabinetry for coastal homes.' → subject_company).\n" +
  'Return JSON only: {"verdict":"subject_company|other_entity|third_party|uncertain","entity":"<the named entity whose copy this is, or null>",' +
  '"reason":"one sentence naming the page FIELD this text comes from and who writes it on this host"}.';

/** R54: the CONTEXT block — the nearest heading, then the page words with the TEXT marked ⟦ ⟧. */
function contextBlock(c: AuthorshipPageContext, text: string): string {
  return (
    `CONTEXT — where the TEXT sits on the stored page; decide the FIELD from its heading and the words around it:\n` +
    `NEAREST HEADING ABOVE THE TEXT: ${c.heading ?? "(none found)"}\n` +
    `The heading names the FIELD the TEXT sits in; decide who wrote the TEXT within that field under the PAGE BRIEF.\n` +
    `PAGE WORDS (the TEXT is marked ⟦ ⟧):\n…${c.before}⟦${text.slice(0, 3600)}⟧${c.after}…\n\n`
  );
}

function buildJudgeUser(input: AuthorshipInput): string {
  const page = pageBriefFor(input.url);
  return (
    `SUBJECT COMPANY: ${input.subjectName}${input.subjectHost ? ` (${input.subjectHost})` : ""}\n` +
    `HOST: ${page.host}\n` +
    `SOURCE URL: ${input.url}\n` +
    `PAGE BRIEF: ${page.brief}\n\n` +
    contextBlock(input.context as AuthorshipPageContext, input.text) +
    `TEXT (verbatim, may be truncated):\n${input.text.slice(0, 3600)}\n\n` +
    `Which field is this text from, and who wrote it? Return the JSON verdict.`
  );
}

const VERDICTS: ReadonlySet<string> = new Set(["subject_company", "other_entity", "third_party", "uncertain"]);

// ── R32 (R35, 2026-10-18): THE SPEAKER JUDGE ─────────────────────────────────────────────────────────────────
// A different question from authorship: not who WROTE the field, but WHO IS QUOTED OR REPORTED inside the sentence,
// and whether that person belongs to the subject. Called only for attribution-bearing candidates (detectAttribution),
// with the attribution span and the surrounding paragraph, on the local model. Every call writes a model_calls row
// (provider ollama, prompt/eval counts from the response, usd null) BEFORE the answer is parsed. Fail toward failure.
export type SpeakerClass = "subject_company_officer" | "subject_company_text" | "third_party" | "unknown" | "judge_failed";
export type SpeakerJudgment = { speaker_class: SpeakerClass; speaker_name: string | null; speaker_role: string | null; reason: string; model: string; /** R36 (a): a field carried U+0000 / a control character and was cleaned at parse */ sanitized?: true };
export type SpeakerInput = { subjectName: string; subjectHost: string; url: string; candidate: string; attributionForm: string; attributionSpan: string; speakerString: string; context: string };
export type SpeakerJudge = (input: SpeakerInput) => Promise<SpeakerJudgment | null>;
/** One raw answer from the local model with its token counts (null when the response carried none). */
export type SpeakerTransport = (args: { model: string; system: string; user: string }) => Promise<{ content: string; prompt_tokens: number | null; completion_tokens: number | null }>;
/** The ledger seam: one row per call, written BEFORE parse; resolves false when the write failed (never throws). */
export type SpeakerLedger = (e: { usage: ModelCallRecord; promptSha: string }) => Promise<boolean>;
const SPEAKER_CLASSES: ReadonlySet<string> = new Set(["subject_company_officer", "subject_company_text", "third_party", "unknown"]);

export const SPEAKER_SYSTEM =
  "You identify WHO IS SPEAKING in one sentence collected from a third-party web page about a SUBJECT company. The sentence " +
  "quotes or reports someone (\"…,\" said X / X said that… / according to X / X told Y). You are given the subject company, the " +
  "sentence, the attribution span the detector found, the speaker string as the page gives it, and the surrounding paragraph.\n" +
  "Answer ONE question — who is the speaker, and do they belong to the subject:\n" +
  "- subject_company_officer: a named PERSON the page identifies as the subject's founder, co-founder, CEO, chairman, officer, " +
  "executive or spokesperson (by title beside the name, or by an earlier sentence in the paragraph).\n" +
  "- subject_company_text: the subject company ITSELF or its own text — 'the company', 'its website', 'a company statement', a release.\n" +
  "- third_party: a named person or organization that is NOT the subject — a customer, a partner's officer, a city official, a reviewer, an analyst.\n" +
  "- unknown: the paragraph does not say who the speaker is, or does not say whether they belong to the subject.\n" +
  "RULES. (1) Decide from the page's own words: a title beside the name, or an identification earlier in the paragraph. Never infer a " +
  "role from the name alone. (2) A pronoun speaker (they, he, she) resolves to whoever the paragraph last identified as speaking. " +
  "(3) The subject may appear under variants (lower-case, with LLC/Inc, an acronym). (4) If two speakers are present, answer for the " +
  "one the attribution span names.\n" +
  'Return JSON only: {"speaker_name":"<name as the page gives it, or null>","speaker_role":"<role as the page gives it, or null>",' +
  '"speaker_class":"subject_company_officer|subject_company_text|third_party|unknown","reason":"one sentence citing the page words that identify the speaker"}.';

export function buildSpeakerUser(input: SpeakerInput): string {
  return (
    `SUBJECT COMPANY: ${input.subjectName}${input.subjectHost ? ` (${input.subjectHost})` : ""}\n` +
    `SOURCE URL: ${input.url}\n` +
    `SENTENCE: ${input.candidate}\n` +
    `ATTRIBUTION (${input.attributionForm}): ${input.attributionSpan.slice(0, 600)}\n` +
    `SPEAKER STRING AS THE PAGE GIVES IT: ${input.speakerString || "(none)"}\n` +
    `PARAGRAPH:\n${input.context.slice(0, 2400)}\n\n` +
    `Who is the speaker, and do they belong to the subject? Return the JSON.`
  );
}

/** The local transport: Ollama /api/chat, JSON mode, token counts from prompt_eval_count / eval_count. */
export function ollamaSpeakerTransport(ollamaUrl: string): SpeakerTransport {
  const base = ollamaUrl.replace(/\/v1\/?$/, "").replace(/\/$/, "");
  return async ({ model, system, user }) => {
    const resp = await fetch(`${base}/api/chat`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, format: "json", stream: false, options: { temperature: 0, num_predict: 400 }, messages: [{ role: "system", content: system }, { role: "user", content: user }] }),
    });
    if (!resp.ok) throw new Error(`ollama HTTP ${resp.status}`);
    const data = await resp.json().catch(() => ({})) as { message?: { content?: unknown }; prompt_eval_count?: unknown; eval_count?: unknown };
    const n = (v: unknown) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : null);
    return { content: String(data.message?.content ?? ""), prompt_tokens: n(data.prompt_eval_count), completion_tokens: n(data.eval_count) };
  };
}

/** THE speaker judgment: ledger BEFORE parse; every failure mode resolves to judge_failed with the reason. */
export async function judgeSpeaker(
  input: SpeakerInput,
  opts: { transport: SpeakerTransport; ledger: SpeakerLedger; model?: string; sha?: (s: string) => Promise<string> },
): Promise<SpeakerJudgment> {
  // R53: the ledger is required — a call with none never reaches the model
  if (typeof opts?.ledger !== "function") throw new Error("speaker judge: a ledger is required (R4) — no model call made");
  const model = opts.model ?? CLASSIFIER_MODEL;
  const system = SPEAKER_SYSTEM, user = buildSpeakerUser(input);
  const sha = opts.sha ?? (async (s: string) => { const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)); return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join(""); });
  const promptSha = await sha(`${system}\n\n${user}`);
  let raw = "";
  try {
    const r = await opts.transport({ model, system, user });
    raw = r.content;
    await opts.ledger({ usage: { provider: "ollama", model, prompt_tokens: r.prompt_tokens, completion_tokens: r.completion_tokens, usd: null }, promptSha });
  } catch (err) {
    await opts.ledger({ usage: { provider: "ollama", model, prompt_tokens: null, completion_tokens: null, usd: null }, promptSha });
    return { speaker_class: "judge_failed", speaker_name: null, speaker_role: null, reason: `speaker judge call failed (${String((err as Error)?.message ?? err)})`, model };
  }
  let parsed: { speaker_name?: unknown; speaker_role?: unknown; speaker_class?: unknown; reason?: unknown };
  try { const m = raw.match(/\{[\s\S]*\}/); parsed = JSON.parse(m ? m[0] : raw); } catch {
    return { speaker_class: "judge_failed", speaker_name: null, speaker_role: null, reason: `speaker judge output was unparseable. raw: ${raw.slice(0, 200)}`, model };
  }
  // R36 (a): the ONE sanitizer, at the parse boundary — speaker_name, speaker_role, reason
  const cls = String(parsed.speaker_class ?? "").trim();
  const sReason = sanitizeForStore(parsed.reason); const reason = sReason.text.trim();
  const sName = sanitizeNullable(parsed.speaker_name), sRole = sanitizeNullable(parsed.speaker_role);
  const str = (s: string | null) => { const t = (s ?? "").trim(); return t && t.toLowerCase() !== "null" ? t : null; };
  const sanitized = sReason.changed || sName.changed || sRole.changed;
  if (SPEAKER_CLASSES.has(cls) && reason) return { speaker_class: cls as SpeakerClass, speaker_name: str(sName.text), speaker_role: str(sRole.text), reason, model, ...(sanitized ? { sanitized: true as const } : {}) };
  return { speaker_class: "judge_failed", speaker_name: null, speaker_role: null, reason: `speaker judge returned a malformed answer (class '${cls || "empty"}')`, model };
}

// Pure single-statement judgment. FAIL TOWARD judge_failed is enforced HERE: the only way out is a
// concrete verdict with the model's own reason; every failure mode resolves to judge_failed
// (which every consumer maps to "leave the label untouched").
export async function judgeAggregatorAuthorship(
  input: AuthorshipInput,
  opts: { transport: AuthorshipTransport; ledger: AuthorshipLedger; model?: string; sha?: (s: string) => Promise<string> },
): Promise<AuthorshipJudgment> {
  // R53 (2026-10-20): R4 for the authorship judge — the ledger is required; a call with none never reaches the model.
  if (typeof opts?.ledger !== "function") throw new Error("authorship judge: a ledger is required (R4) — no model call made");
  // R54: the context is required — a call with none never reaches the model; a no_page context is refused, uncalled
  const ctxKind = (input as { context?: { kind?: unknown } })?.context?.kind;
  if (ctxKind !== "page" && ctxKind !== "no_page") throw new Error("authorship judge: a page context is required (R54) — no model call made");
  const model = opts.model ?? CLASSIFIER_MODEL;
  if (input.context.kind === "no_page") return { verdict: "no_page_words", entity: null, reason: `no_page_words: ${input.context.reason} — not judged; the label stands.`, model };
  const tag = `${hostOf(input.url)} ${input.text.slice(0, 60)}`;
  const system = JUDGE_SYSTEM, user = buildJudgeUser(input);
  const sha = opts.sha ?? (async (t: string) => { const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t)); return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, "0")).join(""); });
  const promptSha = await sha(`${system}\n\n${user}`);
  let raw = "";
  try {
    const r = await opts.transport({ model, system, user });
    raw = r.content;
    // ledger BEFORE parse: the call cost whether or not its answer is usable
    await opts.ledger({ usage: { provider: "ollama", model, prompt_tokens: r.prompt_tokens, completion_tokens: r.completion_tokens, usd: null }, promptSha });
  } catch (err) {
    await opts.ledger({ usage: { provider: "ollama", model, prompt_tokens: null, completion_tokens: null, usd: null }, promptSha });
    const msg = String((err as Error)?.message ?? err);
    console.warn(`[authorship] judge call failed → judge_failed (${tag}): ${msg}`);
    return { verdict: "judge_failed", entity: null, reason: `judge call failed (${msg}) — label left unchanged.`, model };
  }
  if (!raw) {
    console.warn(`[authorship] judge call failed → judge_failed (${tag}): empty content`);
    return { verdict: "judge_failed", entity: null, reason: "judge call failed (empty content) — label left unchanged.", model };
  }
  let parsed: { verdict?: unknown; entity?: unknown; reason?: unknown };
  try {
    const m = raw.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(m ? m[0] : raw) as { verdict?: unknown; entity?: unknown; reason?: unknown };
  } catch {
    console.warn(`[authorship] unparseable model output → judge_failed (${tag})`);
    return { verdict: "judge_failed", entity: null, reason: `judge output was unparseable — label left unchanged. raw: ${raw.slice(0, 200)}`, model };
  }
  const verdict = String(parsed.verdict ?? "").trim();
  const reason = String(parsed.reason ?? "").trim();
  const entityRaw = parsed.entity == null ? "" : String(parsed.entity).trim();
  const entity = entityRaw && entityRaw.toLowerCase() !== "null" ? entityRaw : null;
  if (VERDICTS.has(verdict) && reason) {
    return { verdict: verdict as AuthorshipVerdict, entity, reason, model };
  }
  console.warn(`[authorship] malformed verdict → judge_failed (${tag}): verdict='${verdict}' reasonLen=${reason.length}`);
  return { verdict: "judge_failed", entity: null, reason: `judge returned a malformed verdict ('${verdict || "empty"}') — label left unchanged.`, model };
}

/** R53: the local authorship transport — the classifier's own request (callClassifierWithUsage), token counts read. */
export function ollamaAuthorshipTransport(ollamaUrl: string): AuthorshipTransport {
  return ({ model, system, user }) => callClassifierWithUsage(ollamaUrl, model, system, user);
}

/** Local-only Ollama base for the edge runtime: OLLAMA_BASE_URL, else the syndication base
 *  (config.toml maps OLLAMA_BASE_URL from the shell env, which is usually empty locally), else
 *  the classify-upload-voice default. Null when the resolved host is not local. */
export function resolveLocalOllamaUrl(): string | null {
  const env = (globalThis as { Deno?: { env?: { get?: (k: string) => string | undefined } } }).Deno?.env;
  const base = env?.get?.("OLLAMA_BASE_URL") || env?.get?.("OLLAMA_SYNDICATION_BASE_URL") || "http://host.docker.internal:11434/v1";
  return isLocalOllamaUrl(base) ? base : null;
}

// ── (A) ingest: apply authorship to parsed result entries ────────────────────────
export type AuthorshipStats = {
  considered: number;
  /** URL-gated entries (the judge was eligible to run). */
  gated: number;
  judged: number;
  changed: number;
  judge_failed: number;
  /** Gated entries left unjudged after the judge was declared unavailable (consecutive failures) or the cap hit. */
  unavailable: number;
  /** C1: registry items already decided by the deterministic classifier — never judged here. */
  registry_skipped: number;
  /** R54: gated entries whose text could not be placed on the crawled page — not judged, label stands, no call. */
  no_page_words: number;
};

export type AuthorshipStamp = AuthorshipJudgment & { applied: "client_voice" | "competitor_voice" | "unchanged"; url_rule: string; judged_at: string };

const DEFAULT_MAX_JUDGED = 40;
const CONSECUTIVE_FAILURES_TO_STOP = 2;

export async function applyAuthorshipToEntries<T extends { url?: unknown; voice_class?: unknown }>(
  entries: T[],
  /** R54: pageFor returns the crawled page text for a URL (null when the run holds none) — REQUIRED; the judge reads the
   *  entry's text in place on that page, and an entry it cannot place is not judged. */
  ctx: { subjectName: string; subjectHost: string; getText: (e: T) => string; judge: AuthorshipJudge; pageFor: (url: string) => string | null; maxJudged?: number; log?: (s: string) => void },
): Promise<{ entries: T[]; stats: AuthorshipStats }> {
  const stats: AuthorshipStats = { considered: entries.length, gated: 0, judged: 0, changed: 0, judge_failed: 0, unavailable: 0, registry_skipped: 0, no_page_words: 0 };
  const maxJudged = ctx.maxJudged ?? DEFAULT_MAX_JUDGED;
  const log = ctx.log ?? (() => {});
  let consecutiveFailures = 0;
  const out: T[] = [];
  for (const e of entries) {
    const url = String(e.url ?? "").trim();
    // C1 (2026-09-17): a REGISTRY item already carries its deterministic decision (`registry`, from
    // _shared/registryClassifier.ts) — the model gate never re-judges a classified row. This is the
    // seam that produced two different verdicts on identical GuideStar text; closed here.
    if ((e as { registry?: unknown }).registry) {
      stats.registry_skipped++;
      out.push(e);
      continue;
    }
    // URL PATTERN GATES THE JUDGE. Own-domain URLs are never aggregators (the host guard owns them).
    const m = url ? matchAggregatorProfileUrl(url) : null;
    if (!m || isOwnDomainUrl(url, ctx.subjectHost)) {
      out.push(e);
      continue;
    }
    const text = String(ctx.getText(e) ?? "").trim();
    if (!text) {
      out.push(e);
      continue;
    }
    stats.gated++;
    const page = ctx.pageFor(url);
    const context = authorshipContext(page, text, locateOnPage(page, text));
    if (consecutiveFailures >= CONSECUTIVE_FAILURES_TO_STOP || (context.kind === "page" && stats.judged >= maxJudged)) {
      stats.unavailable++;
      out.push(e);
      continue;
    }
    // R17 (2026-10-18): the decision — judge, outcomeFor, label-stands — is the ONE shared authority
    // (voiceClassAtMint.ts), called with this path's gate (aggregator PROFILES only) and its standing failure
    // policy (keep_label: a judge failure leaves the label and is stamped). This loop keeps only the bookkeeping
    // the gate stats and the consecutive-failure stop need.
    const d = await voiceClassForMintedExcerpt({
      url, item: null, labeledClass: String(e.voice_class ?? ""), pageText: null, judgedText: text,
      company: { name: ctx.subjectName, host: ctx.subjectHost }, registry: null, authorshipContext: context,
      judge: (input) => ctx.judge(input), gate: "profile", onJudgeFailure: "keep_label",
    });
    if (context.kind === "page") stats.judged++; else stats.no_page_words++;
    const stamp = d.authorship_judge;
    if (!d.ok || !stamp) {
      // unreachable under keep_label (the policy never refuses) — fail toward unchanged, loudly
      log(`authority returned no judgment (${m.host} ${url}); label untouched`);
      out.push(e);
      continue;
    }
    if (stamp.verdict === "judge_failed") {
      stats.judge_failed++;
      consecutiveFailures++;
      log(`judge failed, label untouched (${m.host} ${url}): ${stamp.reason}`);
      out.push({ ...e, authorship_judge: stamp });
      continue;
    }
    consecutiveFailures = 0;
    // AUTHORSHIP DECIDES. A label-stands decision carries the stamp with applied "unchanged".
    if (d.authority === "authorship_judge" && d.voice_class !== e.voice_class) {
      stats.changed++;
      log(`${String(e.voice_class ?? "null")} → ${d.voice_class} (${stamp.verdict}${stamp.entity ? `: ${stamp.entity}` : ""}) ${url} — ${stamp.reason}`);
      out.push({ ...e, voice_class: d.voice_class, authorship_judge: stamp });
    } else {
      out.push({ ...e, authorship_judge: stamp });
    }
  }
  return { entries: out, stats };
}

/** public-baseline seam: apply the gate to BOTH minted arrays of the parsed result (the mapper
 *  reads outside_voice_signals.signal|perspective and evidence_ledger.snippet|bucket). */
export async function demoteAggregatorSelfVoiceInResult(
  result: Record<string, unknown>,
  ctx: { subjectName: string; subjectHost: string; judge: AuthorshipJudge; pageFor: (url: string) => string | null; log?: (s: string) => void },
): Promise<{ result: Record<string, unknown>; stats: Record<string, AuthorshipStats> }> {
  const stats: Record<string, AuthorshipStats> = {};
  const next = { ...result };
  if (Array.isArray(result.outside_voice_signals)) {
    const r = await applyAuthorshipToEntries(result.outside_voice_signals as Array<Record<string, unknown>>, {
      ...ctx,
      getText: (e) => String(e.signal ?? e.perspective ?? ""),
    });
    next.outside_voice_signals = r.entries;
    stats.outside_voice_signals = r.stats;
  }
  if (Array.isArray(result.evidence_ledger)) {
    const r = await applyAuthorshipToEntries(result.evidence_ledger as Array<Record<string, unknown>>, {
      ...ctx,
      getText: (e) => String(e.snippet ?? e.bucket ?? ""),
    });
    next.evidence_ledger = r.entries;
    stats.evidence_ledger = r.stats;
  }
  return { result: next, stats };
}

// ── (B) audited, reversible backfill over stored rows ────────────────────────────
export class RestampRefusedError extends Error {
  status = 403;
  constructor(msg: string) {
    super(msg);
    this.name = "RestampRefusedError";
  }
}

export type CandidateSignal = {
  id: string;
  company_id: string;
  source_url: string | null;
  voice_class: string | null;
  claim_text: string;
  evidence_excerpt: string;
  quote_source_text?: string | null;
  held_at: string | null;
  raw_payload: Record<string, unknown>;
};

export type JudgedTextSource = "quote_source_text" | "evidence_excerpt" | "claim_text";
/** The text the judge sees for a stored row. claim_text may carry an appended E4-class analysis
 *  fragment ("Only 3 employee reviews publicly visible."); prefer the retained source text, then the
 *  excerpt, and fall back to claim_text. Reports which one was used so the plan can count how many
 *  rows had a cleaner text available. */
export function judgedTextFor(s: Pick<CandidateSignal, "claim_text" | "evidence_excerpt" | "quote_source_text">): { text: string; source: JudgedTextSource } {
  const qst = String(s.quote_source_text ?? "").trim();
  if (qst) return { text: qst, source: "quote_source_text" };
  const ee = String(s.evidence_excerpt ?? "").trim();
  if (ee) return { text: ee, source: "evidence_excerpt" };
  return { text: String(s.claim_text ?? "").trim(), source: "claim_text" };
}
export type DeltaBacking = { echoed: number; divergent: number; internally_silent: number };
export type AuditRow = {
  company_id: string;
  signal_id: string;
  run_ref: string;
  ledger_run_id: string | null;
  old_voice_class: string | null;
  new_voice_class: "client_voice" | "competitor_voice";
  judge_verdict: string;
  judge_entity: string | null;
  judge_reason: string;
  judge_model: string;
  source_url: string | null;
};

/** Injected data seam (stepper precedent): the core is pure over this interface; the supabase
 *  implementation lives in makeSupabaseRestampStore below. */
export type RestampStore = {
  loadCompanies(): Promise<Array<{ id: string; name: string; website: string | null; frozen: boolean }>>;
  /** Stored-row predicate: outside band, voice_class='outside_voice_about_client', not superseded. */
  loadCandidateSignals(companyIds: string[]): Promise<CandidateSignal[]>;
  /** claim_deltas this signal backs on the PUBLIC (observed / echo) side, via claim_signal_refs → public_claim_id. */
  loadDeltaBacking(signalIds: string[]): Promise<Map<string, DeltaBacking>>;
  loadSignalsById(ids: string[]): Promise<CandidateSignal[]>;
  /** 2026-10-16, detector (b) only: the stored page text for these urls. OPTIONAL — a store that
   *  does not implement it leaves (b) undecidable, so only the wire-host detector can open the
   *  gate. That is the fail-toward-unchanged direction this module has always taken. */
  loadPageTexts?(urls: string[]): Promise<Map<string, string>>;
  openLedger(companyId: string, runRef: string, target: number): Promise<string>;
  closeLedger(runId: string, status: "completed" | "failed", done: number, errorText?: string): Promise<void>;
  insertAudit(row: AuditRow): Promise<void>;
  writeVoiceClass(signalId: string, voiceClass: string, rawPayload: Record<string, unknown>): Promise<void>;
  loadAudit(runRef: string): Promise<Array<AuditRow & { id: string; reverted_at: string | null }>>;
  markReverted(auditId: string): Promise<void>;
};

export type RestampProposal = {
  signal_id: string;
  company_id: string;
  company_name: string;
  host: string;
  path: string;
  /** which detector opened the gate: the 2026-09-03 profile list, a wire host, or a boilerplate
   *  close on a release-shaped page (2026-10-16). */
  via?: "profile" | "wire" | "boilerplate";
  from: string | null;
  to: VoiceOutcome;
  held: boolean;
  text: string;
  /** Which stored field the judged text came from; `cleaner_text` = it differs from claim_text. */
  text_source: JudgedTextSource;
  cleaner_text: boolean;
  judge: AuthorshipJudgment;
  echo_deltas: number;
  delta_backing: DeltaBacking;
};

function isFrozen(co: { id: string; frozen: boolean } | undefined): boolean {
  return !!co && (co.frozen || FROZEN_COMPANY_IDS.has(co.id));
}

/** Dry-run plan: ZERO writes. Frozen companies are never loaded or judged (an explicit frozen
 *  company_id is refused outright). Every URL-gated stored row gets one judgment. */
export async function planRestamp(
  store: RestampStore,
  /** R53: the judge is told the row's company so its ledger can key the model_calls row to it. */
  opts: { companyId?: string; judge: (input: AuthorshipInput, ctx: { companyId: string }) => Promise<AuthorshipJudgment>; log?: (s: string) => void },
): Promise<{
  proposals: RestampProposal[];
  scanned: number;
  skipped_frozen: string[];
  cleaner_text_available: number;
  /** 2026-10-16: candidate rows per company whose page the store could not serve, so detector (b)
   *  was never decidable for them. A shut gate shows it looked. */
  unreadable_pages: Array<{ company_id: string; company_name: string; rows: number }>;
}> {
  const companies = await store.loadCompanies();
  const byId = new Map(companies.map((c) => [c.id, c]));
  if (opts.companyId) {
    const co = byId.get(opts.companyId);
    if (!co) throw new Error(`company not found: ${opts.companyId}`);
    if (isFrozen(co)) throw new RestampRefusedError(`restamp refused: company ${co.name} (${co.id}) is frozen`);
  }
  const skippedFrozen = companies.filter((c) => isFrozen(c)).map((c) => c.id);
  const scope = (opts.companyId ? [byId.get(opts.companyId)!] : companies).filter((c) => !isFrozen(c));
  const signals = await store.loadCandidateSignals(scope.map((c) => c.id));
  // (b) needs the PAGE, not the row: a release's boilerplate close sits in the page text, not in
  // the claim the signal carries. Loaded once for every candidate url the store can serve.
  const hostByCompany = new Map(scope.map((c) => [c.id, hostOf(c.website ?? "")]));
  const pageTexts = store.loadPageTexts
    ? await store.loadPageTexts([...new Set(signals.map((s) => String(s.source_url ?? "")).filter(Boolean))])
    : new Map<string, string>();
  const gateOf = (s: CandidateSignal) => matchGatedUrl(String(s.source_url ?? ""), {
    pageText: pageTexts.get(String(s.source_url ?? "")) ?? null,
    subjectHost: hostByCompany.get(s.company_id) ?? null,
  });
  const gated = signals.filter((s) => !!gateOf(s));
  // A SHUT GATE SHOWS IT LOOKED (operator ruling, 2026-10-16). Detector (b) needs the stored page;
  // when there is none, the gate stays shut because the question could not be asked — not because
  // the answer was no. Counted per company so the plan distinguishes "no reprint here" from
  // "we never read the page". Only rows (a) did not already open are counted: a wire-host release
  // is gated on its path and needs no page text.
  const unreadableByCompany = new Map<string, number>();
  for (const s of signals) {
    if (gateOf(s)) continue;
    const url = String(s.source_url ?? "");
    if (!url || (pageTexts.get(url) ?? "") !== "") continue;
    unreadableByCompany.set(s.company_id, (unreadableByCompany.get(s.company_id) ?? 0) + 1);
  }
  const backing = await store.loadDeltaBacking(gated.map((s) => s.id));
  const proposals: RestampProposal[] = [];
  let cleanerTextAvailable = 0;
  for (const s of gated) {
    const m = gateOf(s)!;
    const co = byId.get(s.company_id);
    if (!co || isFrozen(co)) continue; // belt-and-braces: never judge a frozen company's row
    const jt = judgedTextFor(s);
    const text = jt.text;
    const cleaner = jt.source !== "claim_text" && text !== String(s.claim_text ?? "").trim();
    if (cleaner) cleanerTextAvailable++;
    // R54: the row's text is read in place on the stored page; a text the page does not carry is not judged
    const page = pageTexts.get(String(s.source_url ?? "")) ?? null;
    const j = text
      ? await opts.judge({ subjectName: co.name, subjectHost: hostOf(co.website ?? ""), url: String(s.source_url), text, context: authorshipContext(page, text, locateOnPage(page, text)) }, { companyId: co.id })
      : { verdict: "uncertain" as const, entity: null, reason: "empty statement — nothing to judge", model: "none" };
    const b = backing.get(s.id) ?? { echoed: 0, divergent: 0, internally_silent: 0 };
    const to = j.verdict === "judge_failed" ? null : outcomeFor(j, co.name);
    proposals.push({
      signal_id: s.id, company_id: s.company_id, company_name: co.name, host: m.host, path: m.path, via: m.via,
      from: s.voice_class, to, held: !!s.held_at, text, text_source: jt.source, cleaner_text: cleaner, judge: j, echo_deltas: b.echoed, delta_backing: b,
    });
    opts.log?.(`${co.name} ${s.id.slice(0, 8)} ${m.host} ${s.voice_class} → ${to ?? "(unchanged)"} [${j.verdict}] ${j.reason}`);
  }
  return {
    proposals, scanned: signals.length, skipped_frozen: skippedFrozen, cleaner_text_available: cleanerTextAvailable,
    // per company: candidate rows whose page text the store could not serve, so detector (b) was
    // never decidable for them
    unreadable_pages: [...unreadableByCompany.entries()]
      .map(([company_id, rows]) => ({ company_id, company_name: byId.get(company_id)?.name ?? company_id, rows }))
      .sort((a, b) => b.rows - a.rows),
  };
}

export type PlanRow = {
  signal_id: string;
  from: string | null;
  to: "client_voice" | "competitor_voice";
  judge_verdict: string;
  judge_entity: string | null;
  judge_reason: string;
  judge_model: string;
};

/** Apply the REVIEWED plan (exactly the rows the operator kept). Frozen guard refuses the whole
 *  call before any write if any planned row belongs to a frozen company. Per row: skip when the
 *  stored class drifted from the plan's `from`; else audit row THEN signals write (an audit row
 *  exists for every changed row — reversible by run_ref). One ledger row per company. */
export async function applyRestamp(
  store: RestampStore,
  opts: { plan: PlanRow[]; runRef?: string; log?: (s: string) => void },
): Promise<{ run_ref: string; applied: number; skipped: Array<{ signal_id: string; reason: string }>; ledger_runs: Record<string, string> }> {
  const runRef = opts.runRef ?? crypto.randomUUID();
  const signals = await store.loadSignalsById(opts.plan.map((p) => p.signal_id));
  const byId = new Map(signals.map((s) => [s.id, s]));
  const companies = await store.loadCompanies();
  const coById = new Map(companies.map((c) => [c.id, c]));
  // FROZEN GUARD — before ANY write.
  for (const p of opts.plan) {
    const s = byId.get(p.signal_id);
    if (!s) continue;
    const co = coById.get(s.company_id);
    if (isFrozen(co ?? { id: s.company_id, frozen: false })) {
      throw new RestampRefusedError(`restamp refused: planned row ${p.signal_id} belongs to frozen company ${co?.name ?? s.company_id}`);
    }
  }
  const ledger: Record<string, string> = {};
  const doneByCompany: Record<string, number> = {};
  let applied = 0;
  const skipped: Array<{ signal_id: string; reason: string }> = [];
  for (const p of opts.plan) {
    const s = byId.get(p.signal_id);
    if (!s) {
      skipped.push({ signal_id: p.signal_id, reason: "signal not found" });
      continue;
    }
    if ((s.voice_class ?? null) !== (p.from ?? null)) {
      skipped.push({ signal_id: p.signal_id, reason: `drifted: current '${s.voice_class}' ≠ plan '${p.from}'` });
      continue;
    }
    if (p.to !== "client_voice" && p.to !== "competitor_voice") {
      skipped.push({ signal_id: p.signal_id, reason: `invalid target '${String(p.to)}'` });
      continue;
    }
    if (!ledger[s.company_id]) {
      ledger[s.company_id] = await store.openLedger(s.company_id, runRef, opts.plan.filter((q) => byId.get(q.signal_id)?.company_id === s.company_id).length);
      doneByCompany[s.company_id] = 0;
    }
    await store.insertAudit({
      company_id: s.company_id, signal_id: s.id, run_ref: runRef, ledger_run_id: ledger[s.company_id],
      old_voice_class: s.voice_class, new_voice_class: p.to,
      judge_verdict: p.judge_verdict, judge_entity: p.judge_entity, judge_reason: p.judge_reason, judge_model: p.judge_model,
      source_url: s.source_url,
    });
    await store.writeVoiceClass(s.id, p.to, {
      ...(s.raw_payload ?? {}),
      voice_restamp: { run_ref: runRef, from: s.voice_class, to: p.to, judge_verdict: p.judge_verdict, judge_entity: p.judge_entity, reason: p.judge_reason, model: p.judge_model, at: new Date().toISOString() },
    });
    applied++;
    doneByCompany[s.company_id]++;
    opts.log?.(`restamped ${s.id} ${s.voice_class} → ${p.to}`);
  }
  for (const [companyId, id] of Object.entries(ledger)) await store.closeLedger(id, "completed", doneByCompany[companyId] ?? 0);
  return { run_ref: runRef, applied, skipped, ledger_runs: ledger };
}

/** Reverse one run by run_ref: restore old_voice_class where the row still carries the run's new
 *  value; mark each audit row reverted (the audit row itself is never deleted). */
export async function revertRestamp(
  store: RestampStore,
  opts: { runRef: string; log?: (s: string) => void },
): Promise<{ run_ref: string; reverted: number; skipped: Array<{ signal_id: string; reason: string }> }> {
  const audit = (await store.loadAudit(opts.runRef)).filter((a) => !a.reverted_at);
  const signals = await store.loadSignalsById(audit.map((a) => a.signal_id));
  const byId = new Map(signals.map((s) => [s.id, s]));
  const companies = await store.loadCompanies();
  const coById = new Map(companies.map((c) => [c.id, c]));
  for (const a of audit) {
    if (isFrozen(coById.get(a.company_id))) throw new RestampRefusedError(`revert refused: ${a.signal_id} belongs to a frozen company`);
  }
  let reverted = 0;
  const skipped: Array<{ signal_id: string; reason: string }> = [];
  for (const a of audit) {
    const s = byId.get(a.signal_id);
    if (!s) {
      skipped.push({ signal_id: a.signal_id, reason: "signal not found" });
      continue;
    }
    if (s.voice_class !== a.new_voice_class) {
      skipped.push({ signal_id: a.signal_id, reason: `drifted since restamp: current '${s.voice_class}' ≠ '${a.new_voice_class}'` });
      continue;
    }
    const { voice_restamp: _drop, ...rest } = (s.raw_payload ?? {}) as Record<string, unknown>;
    await store.writeVoiceClass(s.id, a.old_voice_class ?? "outside_voice_about_client", {
      ...rest,
      voice_restamp_reverted: { run_ref: opts.runRef, restored: a.old_voice_class, at: new Date().toISOString() },
    });
    await store.markReverted(a.id);
    reverted++;
    opts.log?.(`reverted ${s.id} ${a.new_voice_class} → ${a.old_voice_class}`);
  }
  return { run_ref: opts.runRef, reverted, skipped };
}

// ── supabase-backed store ────────────────────────────────────────────────────────
// deno-lint-ignore no-explicit-any
type SupabaseLike = { from: (t: string) => any };
const SIGNAL_COLS = "id, company_id, source_url, voice_class, claim_text, evidence_excerpt, quote_source_text, held_at, raw_payload";
const PAGE = 1000;
const IN_CHUNK = 200;
/** Ids are 36 chars; article urls run past 120. An `.in()` of 200 of them overflows the GET query
 *  string, so the url reads chunk far smaller than the id reads do. */
const URL_IN_CHUNK = 25;

async function pageAll<T>(build: (from: number, to: number) => Promise<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

export function makeSupabaseRestampStore(supabase: SupabaseLike): RestampStore {
  return {
    async loadCompanies() {
      const { data, error } = await supabase.from("companies").select("id, name, website, frozen, fixture_hold");
      if (error) throw new Error(`companies read failed: ${error.message}`);
      // R40: a held company (fixture_hold non-null) is outside every sweep
      return ((data ?? []) as Array<{ id: string; name: string; website: string | null; frozen: boolean | null; fixture_hold?: string | null }>).filter((c) => !c.fixture_hold).map(({ fixture_hold: _h, ...c }) => ({ ...c, frozen: !!c.frozen }));
    },
    // 2026-10-16, detector (b): the stored page text for the candidate urls.
    //
    // URLS ARE LONG, SO THE CHUNK IS SMALL. An `.in()` filter is a GET query string: 200 article
    // urls overflow it and the request comes back an error, not a result. Measured on this fleet —
    // 1 url returned 1 page, 50 returned 36, and all 395 returned ZERO. And because the first cut
    // of this function ignored `error`, that transport failure read as "no company reprints exist
    // anywhere", which is the one answer a detector must never give by accident. It THROWS now,
    // like every other read in this store, and chunks at a size long urls survive.
    async loadPageTexts(urls) {
      const out = new Map<string, string>();
      if (urls.length === 0) return out;
      for (let i = 0; i < urls.length; i += URL_IN_CHUNK) {
        const slice = urls.slice(i, i + URL_IN_CHUNK);
        const { data, error } = await supabase.from("outside_page_snapshots")
          .select("source_url, clean_text").in("source_url", slice);
        if (error) throw new Error(`page text read failed (${slice.length} urls): ${error.message}`);
        for (const r of ((data ?? []) as Array<{ source_url: string; clean_text: string | null }>)) {
          const t = String(r.clean_text ?? "");
          if (t && !out.has(r.source_url)) out.set(r.source_url, t);
        }
      }
      return out;
    },
    async loadCandidateSignals(companyIds) {
      if (companyIds.length === 0) return [];
      const rows: CandidateSignal[] = [];
      for (let i = 0; i < companyIds.length; i += IN_CHUNK) {
        const chunk = companyIds.slice(i, i + IN_CHUNK);
        rows.push(...await pageAll<CandidateSignal>((from, to) =>
          supabase.from("signals").select(SIGNAL_COLS)
            .in("company_id", chunk).eq("signal_band", "outside").eq("voice_class", "outside_voice_about_client")
            .is("superseded_at", null).order("created_at", { ascending: true }).range(from, to)));
      }
      return rows;
    },
    async loadDeltaBacking(signalIds) {
      const map = new Map<string, DeltaBacking>();
      if (signalIds.length === 0) return map;
      const refs: Array<{ claim_id: string; signal_id: string }> = [];
      for (let i = 0; i < signalIds.length; i += IN_CHUNK) {
        const { data, error } = await supabase.from("claim_signal_refs").select("claim_id, signal_id").in("signal_id", signalIds.slice(i, i + IN_CHUNK));
        if (error) throw new Error(`claim_signal_refs read failed: ${error.message}`);
        refs.push(...((data ?? []) as Array<{ claim_id: string; signal_id: string }>));
      }
      const claimIds = [...new Set(refs.map((r) => r.claim_id))];
      const byClaim = new Map<string, DeltaBacking>();
      for (let i = 0; i < claimIds.length; i += IN_CHUNK) {
        const { data, error } = await supabase.from("claim_deltas").select("public_claim_id, delta_type").in("public_claim_id", claimIds.slice(i, i + IN_CHUNK));
        if (error) throw new Error(`claim_deltas read failed: ${error.message}`);
        for (const d of (data ?? []) as Array<{ public_claim_id: string; delta_type: string }>) {
          const cur = byClaim.get(d.public_claim_id) ?? { echoed: 0, divergent: 0, internally_silent: 0 };
          if (d.delta_type === "echoed" || d.delta_type === "divergent" || d.delta_type === "internally_silent") cur[d.delta_type]++;
          byClaim.set(d.public_claim_id, cur);
        }
      }
      for (const r of refs) {
        const b = byClaim.get(r.claim_id);
        if (!b) continue;
        const cur = map.get(r.signal_id) ?? { echoed: 0, divergent: 0, internally_silent: 0 };
        cur.echoed += b.echoed; cur.divergent += b.divergent; cur.internally_silent += b.internally_silent;
        map.set(r.signal_id, cur);
      }
      return map;
    },
    async loadSignalsById(ids) {
      const rows: CandidateSignal[] = [];
      for (let i = 0; i < ids.length; i += IN_CHUNK) {
        const { data, error } = await supabase.from("signals").select(SIGNAL_COLS).in("id", ids.slice(i, i + IN_CHUNK));
        if (error) throw new Error(`signals read failed: ${error.message}`);
        rows.push(...((data ?? []) as CandidateSignal[]));
      }
      return rows;
    },
    async openLedger(companyId, runRef, target) {
      const { data, error } = await supabase.from("long_runner_runs")
        .insert({ run_kind: "selfvoice_restamp", company_id: companyId, status: "running", target_count: target, done_count: 0, request_id: runRef })
        .select("id").single();
      if (error || !data) throw new Error(`ledger insert failed: ${error?.message ?? "no row"}`);
      return String((data as { id: string }).id);
    },
    async closeLedger(runId, status, done, errorText) {
      const now = new Date().toISOString();
      const { error } = await supabase.from("long_runner_runs").update({ status, done_count: done, error_text: errorText ?? null, finished_at: now, updated_at: now }).eq("id", runId);
      if (error) throw new Error(`ledger close failed: ${error.message}`);
    },
    async insertAudit(row) {
      const { error } = await supabase.from("signal_voice_restamps").insert(row);
      if (error) throw new Error(`audit insert failed (${row.signal_id}): ${error.message}`);
    },
    async writeVoiceClass(signalId, voiceClass, rawPayload) {
      const { error } = await supabase.from("signals").update({ voice_class: voiceClass, raw_payload: rawPayload, updated_at: new Date().toISOString() }).eq("id", signalId);
      if (error) throw new Error(`signals write failed (${signalId}): ${error.message}`);
    },
    async loadAudit(runRef) {
      const { data, error } = await supabase.from("signal_voice_restamps").select("*").eq("run_ref", runRef).order("applied_at", { ascending: true });
      if (error) throw new Error(`audit read failed: ${error.message}`);
      return (data ?? []) as Array<AuditRow & { id: string; reverted_at: string | null }>;
    },
    async markReverted(auditId) {
      const { error } = await supabase.from("signal_voice_restamps").update({ reverted_at: new Date().toISOString() }).eq("id", auditId);
      if (error) throw new Error(`audit revert mark failed (${auditId}): ${error.message}`);
    },
  };
}
