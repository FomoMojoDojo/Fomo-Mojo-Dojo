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

import { callClassifier, CLASSIFIER_MODEL, isLocalOllamaUrl } from "./uploadVoiceClassifier.ts";
import { isOwnDomainUrl } from "./firstReadProvenance.ts";
import { FROZEN_COMPANY_IDS } from "./frozenCompanies.ts";

export type AuthorshipVerdict = "subject_company" | "other_entity" | "third_party" | "uncertain" | "judge_failed";
export type AuthorshipJudgment = { verdict: AuthorshipVerdict; entity: string | null; reason: string; model: string };
/** What the judge may DO to a label: set client_voice, set competitor_voice, or nothing. */
export type VoiceOutcome = "client_voice" | "competitor_voice" | null;
export type AuthorshipInput = { subjectName: string; subjectHost: string; url: string; text: string };
export type AuthorshipJudge = (input: AuthorshipInput) => Promise<AuthorshipJudgment>;

// ── URL gate ────────────────────────────────────────────────────────────────────
// Aggregator COMPANY-PROFILE pages only — the pages that reproduce a company's own "about"
// blurb beside aggregator data. Review pages, salary pages, news releases, person profiles and
// search pages are deliberately NOT matched: their dominant voice is the public's or a
// journalist's, and the host stamp is right for them. Per-host path rules, not a bare host
// list, so the same host can be gated on one path and left alone on another.
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
];

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
  "(6) When the text could only be a company-supplied description field but you cannot tell WHICH company supplied it, answer uncertain.\n" +
  'Return JSON only: {"verdict":"subject_company|other_entity|third_party|uncertain","entity":"<the named entity whose copy this is, or null>",' +
  '"reason":"one sentence naming the page FIELD this text comes from and who writes it on this host"}.';

function buildJudgeUser(input: AuthorshipInput): string {
  const page = pageBriefFor(input.url);
  return (
    `SUBJECT COMPANY: ${input.subjectName}${input.subjectHost ? ` (${input.subjectHost})` : ""}\n` +
    `HOST: ${page.host}\n` +
    `SOURCE URL: ${input.url}\n` +
    `PAGE BRIEF: ${page.brief}\n\n` +
    `TEXT (verbatim, may be truncated):\n${input.text.slice(0, 3600)}\n\n` +
    `Which field is this text from, and who wrote it? Return the JSON verdict.`
  );
}

const VERDICTS: ReadonlySet<string> = new Set(["subject_company", "other_entity", "third_party", "uncertain"]);

// Pure single-statement judgment. FAIL TOWARD judge_failed is enforced HERE: the only way out is a
// concrete verdict with the model's own reason; every failure mode resolves to judge_failed
// (which every consumer maps to "leave the label untouched").
export async function judgeAggregatorAuthorship(
  input: AuthorshipInput,
  opts: { ollamaUrl: string; model?: string },
): Promise<AuthorshipJudgment> {
  const model = opts.model ?? CLASSIFIER_MODEL;
  const tag = `${hostOf(input.url)} ${input.text.slice(0, 60)}`;
  try {
    const raw = await callClassifier(opts.ollamaUrl, model, JUDGE_SYSTEM, buildJudgeUser(input));
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
  } catch (err) {
    const msg = String((err as Error)?.message ?? err);
    console.warn(`[authorship] judge call failed → judge_failed (${tag}): ${msg}`);
    return { verdict: "judge_failed", entity: null, reason: `judge call failed (${msg}) — label left unchanged.`, model };
  }
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
};

export type AuthorshipStamp = AuthorshipJudgment & { applied: "client_voice" | "competitor_voice" | "unchanged"; url_rule: string; judged_at: string };

const DEFAULT_MAX_JUDGED = 40;
const CONSECUTIVE_FAILURES_TO_STOP = 2;

export async function applyAuthorshipToEntries<T extends { url?: unknown; voice_class?: unknown }>(
  entries: T[],
  ctx: { subjectName: string; subjectHost: string; getText: (e: T) => string; judge: AuthorshipJudge; maxJudged?: number; log?: (s: string) => void },
): Promise<{ entries: T[]; stats: AuthorshipStats }> {
  const stats: AuthorshipStats = { considered: entries.length, gated: 0, judged: 0, changed: 0, judge_failed: 0, unavailable: 0 };
  const maxJudged = ctx.maxJudged ?? DEFAULT_MAX_JUDGED;
  const log = ctx.log ?? (() => {});
  let consecutiveFailures = 0;
  const out: T[] = [];
  for (const e of entries) {
    const url = String(e.url ?? "").trim();
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
    if (consecutiveFailures >= CONSECUTIVE_FAILURES_TO_STOP || stats.judged >= maxJudged) {
      stats.unavailable++;
      out.push(e);
      continue;
    }
    const j = await ctx.judge({ subjectName: ctx.subjectName, subjectHost: ctx.subjectHost, url, text });
    stats.judged++;
    const stamp = (applied: AuthorshipStamp["applied"]): AuthorshipStamp => ({ ...j, applied, url_rule: m.host, judged_at: new Date().toISOString() });
    if (j.verdict === "judge_failed") {
      stats.judge_failed++;
      consecutiveFailures++;
      log(`judge failed, label untouched (${m.host} ${url}): ${j.reason}`);
      out.push({ ...e, authorship_judge: stamp("unchanged") });
      continue;
    }
    consecutiveFailures = 0;
    // AUTHORSHIP DECIDES. null ⇒ the model's label stands exactly as set.
    const outcome = outcomeFor(j, ctx.subjectName);
    if (outcome && outcome !== e.voice_class) {
      stats.changed++;
      log(`${String(e.voice_class ?? "null")} → ${outcome} (${j.verdict}${j.entity ? `: ${j.entity}` : ""}) ${url} — ${j.reason}`);
      out.push({ ...e, voice_class: outcome, authorship_judge: stamp(outcome) });
    } else {
      out.push({ ...e, authorship_judge: stamp(outcome ?? "unchanged") });
    }
  }
  return { entries: out, stats };
}

/** public-baseline seam: apply the gate to BOTH minted arrays of the parsed result (the mapper
 *  reads outside_voice_signals.signal|perspective and evidence_ledger.snippet|bucket). */
export async function demoteAggregatorSelfVoiceInResult(
  result: Record<string, unknown>,
  ctx: { subjectName: string; subjectHost: string; judge: AuthorshipJudge; log?: (s: string) => void },
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
  opts: { companyId?: string; judge: AuthorshipJudge; log?: (s: string) => void },
): Promise<{ proposals: RestampProposal[]; scanned: number; skipped_frozen: string[]; cleaner_text_available: number }> {
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
  const gated = signals.filter((s) => !!matchAggregatorProfileUrl(String(s.source_url ?? "")));
  const backing = await store.loadDeltaBacking(gated.map((s) => s.id));
  const proposals: RestampProposal[] = [];
  let cleanerTextAvailable = 0;
  for (const s of gated) {
    const m = matchAggregatorProfileUrl(String(s.source_url))!;
    const co = byId.get(s.company_id);
    if (!co || isFrozen(co)) continue; // belt-and-braces: never judge a frozen company's row
    const jt = judgedTextFor(s);
    const text = jt.text;
    const cleaner = jt.source !== "claim_text" && text !== String(s.claim_text ?? "").trim();
    if (cleaner) cleanerTextAvailable++;
    const j = text
      ? await opts.judge({ subjectName: co.name, subjectHost: hostOf(co.website ?? ""), url: String(s.source_url), text })
      : { verdict: "uncertain" as const, entity: null, reason: "empty statement — nothing to judge", model: "none" };
    const b = backing.get(s.id) ?? { echoed: 0, divergent: 0, internally_silent: 0 };
    const to = j.verdict === "judge_failed" ? null : outcomeFor(j, co.name);
    proposals.push({
      signal_id: s.id, company_id: s.company_id, company_name: co.name, host: m.host, path: m.path,
      from: s.voice_class, to, held: !!s.held_at, text, text_source: jt.source, cleaner_text: cleaner, judge: j, echo_deltas: b.echoed, delta_backing: b,
    });
    opts.log?.(`${co.name} ${s.id.slice(0, 8)} ${m.host} ${s.voice_class} → ${to ?? "(unchanged)"} [${j.verdict}] ${j.reason}`);
  }
  return { proposals, scanned: signals.length, skipped_frozen: skippedFrozen, cleaner_text_available: cleanerTextAvailable };
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
      const { data, error } = await supabase.from("companies").select("id, name, website, frozen");
      if (error) throw new Error(`companies read failed: ${error.message}`);
      return ((data ?? []) as Array<{ id: string; name: string; website: string | null; frozen: boolean | null }>).map((c) => ({ ...c, frozen: !!c.frozen }));
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
