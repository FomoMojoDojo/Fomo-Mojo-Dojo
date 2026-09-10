// ── The solution-agnostic judge, criterion v2 (Gate 5b) ────────────────────────────────────────────
//
// WHAT v1 GOT WRONG. It was told nothing about the company and asked whether a job was "free of the
// company's product/solution". With no solution named, it inferred one from the job's own words, and
// the Gate 3d census measured the result: 11 of 20 rejections named a DOMAIN word — "using AI",
// "quantum error correction" — that was the customer's field, not the company's product. Riverlane's
// buyer group was rejected on "quantum hardware". Council ruling (Living Memory 09-10): the judge must
// be TOLD the solution from the offering read, never infer it from the domain; a job fails only when
// it names the product or the solution category that is the company's MEANS; field, platform and
// context belong in the clarifier.
//
// WHAT FOUR DRY PASSES (5a-1..5a-4, 14 census rows × 3 runs each) ESTABLISHED, and the design here:
//   • the WORDING below is frozen from 5a-3 — the sentence about "using AI to X" is what stopped the
//     judge reading an instrumental phrase as naming a means;
//   • the COMPANY NAME is withheld entirely — 5a-3 showed "Brand AI" alone made the judge decide AI
//     was part of the solution, with no AI token anywhere in the injection;
//   • product/platform items carry their STATEMENT, not just the label — 5a-3 showed "Brand OS" as a
//     bare name gave the judge nothing to match "machine-readable system" against, so a job that
//     described the product verbatim was accepted; with the statement it is rejected;
//   • technology words and -powered/-driven/-based/-enabled compounds are STRIPPED from what is
//     injected, so the injection never lends the judge a word it would then find in the job;
//   • a 3-CALL MAJORITY, because 5a-4's one unstable row (Lumio #3, a/a/r) was a knife-edge the
//     criterion is entitled to have — a majority makes the ruling a ruling, and the votes are kept.
//
// Local only (Option B): the offering read comes from public_reads through the caller's supabase
// handle. No external call is made to learn what the company sells.

import { sha256Hex, normalizeForHash } from "./contentIdentity.ts";

/** THE criterion version. Bump it when SOLUTION_AGNOSTIC_SYSTEM or the injection rule changes: the
 *  verdict key carries it, so a bump re-judges every candidate exactly once and leaves v1 as history. */
export const CRITERION_VERSION = 2;

/** Frozen verbatim from Gate 5a-3. Do not edit without bumping CRITERION_VERSION. */
export const SOLUTION_AGNOSTIC_SYSTEM =
  "You judge whether a market definition is SOLUTION-AGNOSTIC. You are told what the company sells. " +
  "A job FAILS only if it names that product, or names the category of solution the company sells as the MEANS of getting the job done. " +
  "A job PASSES when it merely happens in the company's field, uses the same technology as its context or platform, or describes an outcome the company's product also serves — the field is not the solution. " +
  "A job that says it will USE a general technology (AI, software, data, cloud) to get something done is still a FIELD job — 'using AI to X' is about X, not about AI — even when that technology also appears in the company's product names. " +
  "It FAILS only when the thing it names is the company's product or the company's specific category of solution, not the technology behind it. " +
  "The test: if the company's solution category did not exist, would the job read the same? If yes, it is solution-agnostic. " +
  'JSON only: {"solution_free":true|false,"reason":"<one short clause>"}.';

/** Versioned verdict key. v1 is byte-identical to the pre-Gate-5b key so existing rows still resolve;
 *  v≥2 carries the version inside the hash so a v2 lookup can never find a v1 row. */
export async function solutionAgnosticKey(executor: string, jtbd: string, version: number = CRITERION_VERSION): Promise<string> {
  const content = normalizeForHash(`${executor}|${jtbd}`);
  return version <= 1
    ? await sha256Hex(`mktsolagn|${content}`)
    : await sha256Hex(`mktsolagn|v${version}|${content}`);
}

// ── criterion v1, FROZEN (Gate 5b) ────────────────────────────────────────────────────────────────
// The v1 prompt pair, byte-for-byte as it shipped in marketPortfolioDiscovery.ts before Gate 5b. It is
// kept for ONE consumer: marketOptionSynthesis.ts (generate-market-options) extends this judge as its
// third criterion and was written against v1 — the COMPANY line, the company name in the question.
// Moving that pipeline to v2 is a separate decision; nothing in Gate 5b re-judges market options.
// Discovery (marketPortfolioDiscovery.ts) uses v2 and never imports these.
export const SOLUTION_AGNOSTIC_SYSTEM_V1 =
  "You judge whether a market definition is SOLUTION-AGNOSTIC. " +
  "The job must be stated entirely in the executor's own world — a job that names, presupposes, or is only meaningful in terms of the company's product, service, or solution FAILS. " +
  "The job existed before this company and would exist without it. " +
  'JSON only: {"solution_free":true|false,"reason":"<one short clause>"}.';

export function buildSolutionAgnosticUserV1(companyName: string, executor: string, jtbd: string): string {
  return `COMPANY: ${companyName}\nCANDIDATE MARKET — executor: ${executor}\njob: ${jtbd}\nIs this job free of ${companyName}'s product/solution?`;
}

// ── injection ─────────────────────────────────────────────────────────────────────────────────────
const MEANS_KINDS = new Set(["product", "platform", "service", "program"]);
const STATEMENT_KINDS = new Set(["product", "platform"]);
const BARE_TECH = new Set(["ai", "software", "data", "cloud"]);
const COMPOUND_TECH = /-(powered|driven|based|enabled)$/i;
const DANGLE = new Set(["with", "and", "for", "of", "&"]);

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Strip bare technology words and -powered/-driven/-based/-enabled compounds. NEVER strips system,
 *  tool, service, platform, program — those carry the means (5a-3: stripping "system" from "Brand
 *  OS … system"-class labels removed the very thing the judge needed). */
export function stripTechnologyWords(text: string): string {
  const parts = String(text ?? "").split(/\s+/).filter((w) => {
    const bare = w.replace(/[.,;:]$/, "").toLowerCase();
    return w && !BARE_TECH.has(bare) && !COMPOUND_TECH.test(w.replace(/[.,;:]$/, ""));
  });
  while (parts.length && DANGLE.has(parts[parts.length - 1].toLowerCase())) parts.pop();
  return parts.join(" ").replace(/\s+([.,;:])/g, "$1");
}

/** No company name reaches the judge — including through its own product statements. */
export function scrubCompanyName(text: string, companyName: string): string {
  const name = String(companyName ?? "").trim();
  if (!name) return String(text ?? "");
  return String(text ?? "")
    .replace(new RegExp(`${escapeRe(name)}'s`, "gi"), "the company's")
    .replace(new RegExp(escapeRe(name), "gi"), "the company");
}

export type OfferingItem = { label?: unknown; statement?: unknown; kind_hint?: unknown };

/** The one added line. Empty string when the offering read has no means-kind items — the criterion
 *  still applies (and the version still bumps), the judge just is not told the solution. */
export function buildSolutionLine(items: readonly OfferingItem[], companyName: string): string {
  const parts: string[] = [];
  for (const i of items) {
    const kind = String(i?.kind_hint ?? "");
    if (!MEANS_KINDS.has(kind)) continue;
    const label = stripTechnologyWords(String(i?.label ?? ""));
    if (label.length < 4) continue;
    const statement = STATEMENT_KINDS.has(kind) ? stripTechnologyWords(scrubCompanyName(String(i?.statement ?? ""), companyName)) : "";
    parts.push(statement ? `${label} — ${statement.replace(/\.$/, "")}` : label);
  }
  return parts.length ? `THE COMPANY'S SOLUTION IS: ${parts.join("; ")}.` : "";
}

/** The user prompt. NO company name: not in a COMPANY line, not in the question, not in the
 *  injection. Candidate executor/job text is the candidate's own and is passed untouched. */
export function buildSolutionAgnosticUser(solutionLine: string, executor: string, jtbd: string): string {
  return (solutionLine ? `${solutionLine}\n` : "") +
    `CANDIDATE MARKET — executor: ${executor}\njob: ${jtbd}\n` +
    `If the company's solution category did not exist, would this job read the same?`;
}

/** Load the current offering read's items for the company. Local only. */
/** The read seam: returns the current offering payload for a company, or null. Injected so the judge
 *  module carries no client type and the proof can plant a payload. */
export type OfferingReader = (companyId: string) => Promise<{ items?: unknown } | null>;

export async function loadOfferingItems(read: OfferingReader, companyId: string): Promise<OfferingItem[]> {
  const payload = await read(companyId);
  const items = payload?.items;
  return Array.isArray(items) ? (items as OfferingItem[]) : [];
}

// ── the 3-vote majority ───────────────────────────────────────────────────────────────────────────
export type Vote = { solutionFree: boolean; reason: string };
export type MajorityVerdict = {
  solutionFree: boolean;
  /** e.g. "3-0 accepted", "2-1 rejected" — the tally, so a knife-edge is visible on the record. */
  tally: string;
  votes: Vote[];
  /** The reason of the first vote on the winning side — the one clause the row carries as its reason. */
  reason: string;
};

/** Three independent calls at production temperature; majority rules; every vote is kept. The judge
 *  function is injected so the proof can vote without a model. */
export async function judgeSolutionAgnosticMajority(
  judgeOnce: () => Promise<Vote>,
  calls = 3,
): Promise<MajorityVerdict> {
  const votes: Vote[] = [];
  for (let i = 0; i < calls; i++) votes.push(await judgeOnce());
  const yes = votes.filter((v) => v.solutionFree).length;
  const solutionFree = yes * 2 > votes.length;
  const winning = votes.find((v) => v.solutionFree === solutionFree);
  const tally = solutionFree ? `${yes}-${votes.length - yes} accepted` : `${votes.length - yes}-${yes} rejected`;
  return { solutionFree, tally, votes, reason: winning?.reason ?? "" };
}
