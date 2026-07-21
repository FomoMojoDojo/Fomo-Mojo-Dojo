// ── MO-1 · ODI-form market OPTIONS ────────────────────────────────────────────
//
// Generates PRELIMINARY market options in strict ODI form from the company's
// outside record, and judges each against THREE INDEPENDENT criteria. Options
// are hypotheses by proof law (market_options.proof_tier is pinned to
// 'hypothesis' by CHECK) and never auto-promote.
//
// WHY THIS EXISTS: odi_market_definitions holds BLENDED statements — its birth
// prompt instructs the generator to fold WHO and JOB into one job_executor
// clause ("Independent cafe operators sourcing a specialty coffee offering for
// their venue"). Of Edgewood's 6 live public market cards, 0 pass ODI form and
// 4 are solution-bound. Those rows are also immutable after birth. So options
// are NEW rows in a NEW table; nothing here reads for mutation, updates, or
// deletes odi_market_definitions.
//
// THREE CRITERIA — all must pass, judged independently, short-circuiting:
//   (1) executor_group    — the executor is a GROUP OF PEOPLE. Never a company,
//                           brand, industry, sector, or abstraction.
//                           "Pediatricians" passes; "healthcare" fails.
//   (2) odi_form          — the job is VERB + OBJECT OF THE VERB + CONTEXTUAL
//                           CLARIFIER, structurally separable into three parts.
//   (3) solution_agnostic — the job names no product, service, channel,
//                           provider, or offering category. EXTENDS the
//                           existing SOLUTION_AGNOSTIC_SYSTEM judge (imported,
//                           not copied). A statement can be perfectly
//                           well-formed under (2) and still fail (3): "Select a
//                           residential treatment provider for a youth in
//                           crisis" is verb+object+clarifier AND solution-bound.
//
// NEGATIVE CACHE FROM BIRTH: judge-rejected candidates are STORED
// (status='rejected'), so a re-run never re-pays the model tax on a candidate
// already ruled out. Freeze-on-reject, keyed by content_identity alone, models
// are provenance only, no TTL. Content change self-invalidates.
//
// require_model: every model call is strict. Unparseable or missing fields
// throw; there is no canned fallback, no template substitution, and no default
// verdict. A model failure aborts loudly with zero further writes — the rows
// already banked stay banked.
//
// LOCAL-ONLY (Option B): qwen2.5:14b-instruct gen + llama3:70b judge on a
// localhost Ollama. Zero OpenAI.

import { normalizeForHash, sha256Hex } from "./contentIdentity.ts";
import { SOLUTION_AGNOSTIC_SYSTEM, buildSolutionAgnosticUser } from "./marketPortfolioDiscovery.ts";

const DEFAULT_GEN_MODEL = "qwen2.5:14b-instruct";
const DEFAULT_JUDGE_MODEL = "llama3:70b";
const GEN_TIMEOUT_MS = 180_000;
const JUDGE_TIMEOUT_MS = 180_000;

export const MAX_OPTIONS = 6;
/** Judge chunk cap. 3 judge calls per candidate worst case vs the ~150s edge wall. */
export const DEFAULT_CHUNK = 2;

export const RUN_KIND = "market_options";

/**
 * CRITERIA VERSION — bump whenever ANY criterion's definition changes.
 *
 * A verdict is only valid for the criteria that produced it. Verdicts banked
 * under an older version STOP counting as cached: the option is re-judged under
 * the current criteria and lands as a new row at the new version. Old rows are
 * kept — history is history, and a rejection's audit trail must survive.
 *
 *   v1 — executor is a group of people | ODI form | solution-agnostic
 *   v2 — v1 + executor must be VERB-FREE (no job content embedded in WHO)
 *
 * KEEP IN SYNC with MO1_CRITERIA_VERSION in src/hooks/useMarketOptions.ts,
 * which must not display a candidate judged under superseded criteria.
 */
export const MO1_CRITERIA_VERSION = 2;

export type MarketOptionCandidate = {
  executor_statement: string;
  job_statement: string;
  basis?: string;
  /** Set only on a revision: the id of the row this rewrites (attempt 1 or 2). */
  revision_of?: string;
  /** MO-2b: the attempt number THIS candidate will be written as (2 or 3). */
  revision_attempt?: number;
};

type Criterion = "executor_group" | "odi_form" | "solution_agnostic";

// ── ollama (sibling-module pattern; require_model: loud fail, no fallback) ────

// MO-2 ruling 3 — DETERMINISM CONTROLS on the judge.
//
// Recorded honestly: pinning temperature/seed makes verdicts REPRODUCIBLE, not
// more CORRECT. It removes the run-to-run variance that let two lexically
// equivalent jobs land opposite verdicts under the same model —
//   "Determine necessary mental health support for youth in need"   -> PASS
//   "Determine appropriate mental health support for youth in need." -> REJECT
// — but a judge that is consistently wrong stays consistently wrong. N-of-M
// judging was considered and rejected for now on cost.
//
// Applied to JUDGE calls ONLY. The generator and reviser keep temperature 0.2:
// proposal diversity is what puts breadth on a conversation surface, and pinning
// it would make every re-run re-propose an identical set.
const JUDGE_SEED = 1729;

async function callOllamaJson(
  ollamaUrl: string,
  model: string,
  system: string,
  user: string,
  timeoutMs: number,
  opts?: { deterministic?: boolean },
): Promise<string> {
  const nativeBase = ollamaUrl.replace(/\/v1\/?$/, "");
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const resp = await fetch(`${nativeBase}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer ollama" },
      body: JSON.stringify({
        model,
        format: "json",
        stream: false,
        options: opts?.deterministic
          ? { num_ctx: 8192, temperature: 0, top_p: 1, top_k: 1, seed: JUDGE_SEED }
          : { num_ctx: 8192, temperature: 0.2 },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
      signal: ctrl.signal,
    });
    if (!resp.ok) throw new Error(`market-options model call failed: HTTP ${resp.status} (${model})`);
    const data = await resp.json().catch(() => ({}));
    const content = String((data as { message?: { content?: unknown } })?.message?.content ?? "");
    if (!content) throw new Error(`market-options model call returned empty content (${model})`);
    return content;
  } finally {
    clearTimeout(t);
  }
}

/** Strict boolean parse — throws rather than defaulting. require_model law. */
function parseBool(raw: string, field: string, who: string): { value: boolean; reason: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`market-options ${who} output unparseable (strict): ${raw.slice(0, 140)}`);
  }
  const p = parsed as Record<string, unknown>;
  if (typeof p[field] !== "boolean") {
    throw new Error(`market-options ${who} output missing ${field} (strict): ${raw.slice(0, 140)}`);
  }
  return { value: p[field] as boolean, reason: String(p.reason ?? "").trim() };
}

// ── generation ───────────────────────────────────────────────────────────────

const GEN_SYSTEM =
  "You propose PRELIMINARY MARKET OPTIONS for a company, from evidence about it. " +
  "A market = a GROUP OF PEOPLE + the JOB they are trying to get done. " +
  "You MUST return the two parts SEPARATELY — never fold the job into the executor. " +
  "executor_statement = WHO, and ONLY who: a group of people, in their own terms. " +
  "It must name people, not an organisation, brand, industry, sector, or abstraction. " +
  "'Pediatricians' is valid; 'healthcare', 'the referral market', 'schools' as an institution are NOT. " +
  "It must contain NO verb describing what they are doing — that belongs in the job. " +
  "job_statement = VERB + OBJECT OF THE VERB + CONTEXTUAL CLARIFIER, in that order, one clause. " +
  "Example SHAPE (match the shape, not the facts): 'Restore a young person's stability after an acute crisis.' " +
  "-> verb 'restore', object \"a young person's stability\", clarifier 'after an acute crisis'. " +
  "The job MUST be solution-agnostic: it names no product, service, programme, channel, provider, vendor, or category of offering, " +
  "and it must NOT describe buying, choosing, finding, selecting, or sourcing anything — those are purchase acts, not jobs. " +
  "The job existed before this company and would exist without it. " +
  "NEVER name a company, brand, or vendor — not even the company under analysis. " +
  "basis = one short clause citing the evidence this option is drawn from. " +
  "Ground every option in the evidence given. Fewer, well-grounded options beat many speculative ones. " +
  'JSON only: {"options":[{"executor_statement":"...","job_statement":"...","basis":"..."}]}.';

// INPUT REFRAME (operator amendment after the run-1 all-rejected result): the
// FINDINGS are the substance the options are built from. The existing market
// defs may only say WHO is already in the picture — their JOBS are blended and
// solution-bound, and in run 1 handing them over as context poisoned every job
// the generator produced (5 of 6 rejections were odi_form, mostly inherited
// phrasing). So only the executor half is passed, explicitly labelled as
// not-a-template.
function buildGenUser(companyName: string, evidence: string, knownWho: string, max: number): string {
  return (
    `COMPANY: ${companyName}\n\n` +
    `EVIDENCE — THE OUTSIDE RECORD. Build the options from THIS:\n${evidence}\n\n` +
    `GROUPS ALREADY KNOWN TO BE IN THE PICTURE (names only — these are NOT job templates, ` +
    `and their phrasing must NOT be reused for job_statement):\n${knownWho}\n\n` +
    `For each option, decompose explicitly:\n` +
    `  1. WHO — a group of people, named as people, with no verb.\n` +
    `  2. THE JOB — verb + object of the verb + contextual clarifier, one clause, solution-agnostic.\n` +
    `Derive the job from what the evidence shows those people are trying to achieve — ` +
    `never from how this company describes its own services.\n\n` +
    `Propose at most ${max} preliminary market options.`
  );
}

// ── refinement: ONE rewrite cycle for a rejected candidate ───────────────────
//
// The generator is handed the candidate plus the judge's NAMED failing
// criterion and its rationale, as a targeted instruction. Most run-1 failures
// were near-misses in FORM (a missing clarifier), not bad readings — the fix is
// to refine the statement, never to loosen the judge. The revision re-enters
// the FULL three-criteria judge; one cycle only.
//
// require_model: the revision is MODEL output. There is no template patching —
// nothing here appends a clarifier or rewrites a statement in code.
const REVISE_SYSTEM =
  "You REVISE a single market option that failed a form check. " +
  "You are given the option, the criterion it failed IN FULL, and every reason the judge recorded. " +
  "Fix the failure while keeping the same PEOPLE and the same underlying progress they are pursuing. " +
  "Do not invent a different market. Do not broaden or narrow WHO unless WHO is what failed. " +
  "The criterion is given in full because a statement can fail it in more than one way at once: " +
  "satisfy EVERY requirement listed, not only the one the judge happened to name. " +
  "executor_statement = a group of people, named as people, containing no verb. " +
  "job_statement = VERB + OBJECT OF THE VERB + CONTEXTUAL CLARIFIER, one clause. " +
  "The clarifier states the circumstance (when / under what condition / for whom) and is REQUIRED. " +
  "The job must name no product, service, provider, or offering category, and must not be a " +
  "buying, choosing, finding, selecting or sourcing act. " +
  "WHEN THE FAILURE IS THAT THE JOB DESCRIBES AN ACT — referring, routing, assessing, coordinating, " +
  "selecting, or any other step someone performs — DO NOT rephrase that act. Replace it. " +
  "State instead the PROGRESS those same people are trying to make, the outcome the act was in service of. " +
  "Ask what would be true for them if the act had succeeded, and write THAT as the job. " +
  "Keeping the act and rewording it around the edges is the failure repeating itself, not a revision. " +
  "State the progress the people are trying to make, as it would read if no supplier existed. " +
  'JSON only: {"executor_statement":"...","job_statement":"...","basis":"..."}.';

// FULL criterion text handed to the reviser (MO-2 ruling 1). Previously it saw
// only the judge's one-line reason, which is why the donor option died: attempt 1
// was told "contains a verb ('raising')", removed the verb, and attempt 2 then
// failed the SAME criterion on its OTHER requirement — "names an organisation" —
// which had never been stated to it. These strings enumerate every requirement of
// the criterion so a single revision can satisfy all of them at once. They
// PARAPHRASE the judge prompts for instruction; they do not alter judging.
const CRITERION_SPEC: Record<string, string> = {
  executor_group:
    "WHO must be a GROUP OF PEOPLE, stated with NO job content. ALL of the following must hold:\n" +
    "  (a) it names people — a role, profession, or population a human being could belong to;\n" +
    "  (b) it is VERB-FREE — only who they are, never what they are doing, seeking, or wanting;\n" +
    "  (c) it is NOT a company, brand, vendor, or named organisation;\n" +
    "  (d) it is NOT an industry, sector, market, or field;\n" +
    "  (e) it is NOT an institution or entity — name the PEOPLE IN IT instead\n" +
    "      ('schools' fails, 'school counsellors' passes; 'agencies' fails, 'agency caseworkers' passes;\n" +
    "       'community organizations' fails — name the people who do the work or give the money);\n" +
    "  (f) it carries NO ROLE-DUTY phrasing. ANY participle, gerund, or relative clause describing\n" +
    "      what these people DO — their duty, function, task, or service — is ACTIVITY language and\n" +
    "      fails (b), REGARDLESS OF WHICH VERB CARRIES IT. Name the ROLE those people hold, not the\n" +
    "      work the role performs. ('responsible for', 'in charge of', 'tasked with', 'accountable\n" +
    "      for', 'overseeing', 'charged with', 'providing', 'delivering', 'working on' are examples\n" +
    "      of the rule, NOT a closed list — substituting a verb outside this list does not pass it.)\n" +
    "      'People responsible for youth mental health services in government agencies' FAILS;\n" +
    "      'Government programme officers' passes. Do not relocate the duty phrase inside the\n" +
    "      statement — remove it, and name the role those people hold instead.",
  odi_form:
    "THE JOB must be VERB + OBJECT OF THE VERB + CONTEXTUAL CLARIFIER — all three present and\n" +
    "structurally separable, as ONE clause. A missing clarifier fails. Multiple jobs chained fails.\n" +
    "A noun phrase with no verb fails. Prose rather than one clause fails.",
  solution_agnostic:
    "THE JOB must be free of SOLUTIONS, from ANY supplier — not merely free of this company's. ALL must hold:\n" +
    "  (a) it names no product, service, programme, treatment, facility, channel, platform, or tool;\n" +
    "  (b) it names no PROVIDER, VENDOR, or SUPPLIER of those, and no CATEGORY of such an offering;\n" +
    "  (c) it is not a purchase or procurement act — buying, choosing, selecting, finding, sourcing,\n" +
    "      procuring, hiring, contracting, or evaluating a provider or offering;\n" +
    "  (d) it describes the PROGRESS itself, in the executor's own world — stated so it would still be\n" +
    "      true if no supplier existed at all.",
};

// Every recorded reason, not just the failing criterion's. A revision that fixes
// the named failure while re-breaking a criterion the judge already commented on
// is the loop the widened payload exists to stop.
function buildReviseUser(
  executor: string,
  job: string,
  criterion: string,
  reason: string,
  allReasons?: { executor_group?: string; odi_form?: string; solution_agnostic?: string },
): string {
  const named = criterion === "executor_group"
    ? "WHO is not a group of people"
    : criterion === "odi_form"
    ? "THE JOB is not verb + object + contextual clarifier"
    : "THE JOB names a solution, provider, or offering, or is a purchase act";
  const spec = CRITERION_SPEC[criterion] ?? "";
  const others = Object.entries(allReasons ?? {})
    .filter(([k, v]) => k !== criterion && String(v ?? "").trim())
    .map(([k, v]) => `  - ${k}: ${v}`)
    .join("\n");
  // MO-2d (A): the OTHER TWO criteria, in full, flagged MUST-PRESERVE.
  // Evidence — every donor revision fixed its named criterion and regressed on
  // one that had been passing:
  //   42f2b76b  executor_group -> solution_agnostic -> odi_form ("Missing clarifier")
  //   26a600b5  executor_group -> executor_group    -> odi_form ("No clarifier present.")
  // The reviser dropped the clarifier because odi_form had never failed, so no
  // reason mentioned it and the old payload never showed it the form rule. A
  // revision is re-judged on ALL THREE, so it must SEE all three.
  const preserve = (["executor_group", "odi_form", "solution_agnostic"] as const)
    .filter((k) => k !== criterion)
    .map((k) => `${k}:\n${CRITERION_SPEC[k]}`)
    .join("\n\n");
  // MO-2f (2): when the SCAN rejected this row, the judge's own reason says it
  // passed — handing that over unqualified would tell the reviser nothing is
  // wrong. Replace the header with the scan's finding and name the fix.
  const scanIdx = (reason || "").indexOf(SCAN_CLAUSE_F_MARKER);
  const scanFragment = scanIdx >= 0
    ? (reason || "").slice(scanIdx + SCAN_CLAUSE_F_MARKER.length).trim().replace(/^"|"$/g, "")
    : null;
  const scanBlock = scanFragment
    ? `WHY THIS FAILED — a form scan of the WHO, not the judge. The judge passed this WHO, ` +
      `and the judge was wrong about the text in front of it: ${scanFragment} is a clause ` +
      `describing what these people DO, not a name for who they are.\n` +
      `Rule (f): name the ROLE, not the work the role performs. There is almost always a plain ` +
      `role noun available — the people who fund are FUNDERS; the people who give are DONORS; ` +
      `the people who make grants are GRANTMAKERS; people working for a charity are CHARITY STAFF.\n` +
      `Replace the whole clause with that noun. Do not keep the clause and reword it, do not move ` +
      `it elsewhere in the statement, and do not swap one activity word for another — ` +
      `"People who fund X" and "People funding X" fail identically.\n` +
      `KEEP THE JOB EXACTLY AS WRITTEN unless it independently fails a criterion below.\n\n`
    : "";
  return (
    `OPTION AS WRITTEN —\n  WHO: ${executor}\n  THE JOB: ${job}\n\n` +
    scanBlock +
    `FAILED CRITERION: ${criterion} — ${named}.\n` +
    `JUDGE'S REASON: ${reason || "(none given)"}\n\n` +
    `THE FAILED CRITERION IN FULL — your revision must satisfy EVERY line, not only the reason above:\n${spec}\n\n` +
    `MUST-PRESERVE — these two criteria CURRENTLY PASS and your revision is re-judged on all\n` +
    `three. Fixing one by breaking another is a FAILED revision, not a partial success. Keep\n` +
    `satisfying every line below while you fix the failure above:\n\n${preserve}\n\n` +
    (others ? `ALSO RECORDED BY THE JUDGE ON THIS OPTION (do not re-break these):\n${others}\n\n` : "") +
    `Rewrite the option so it passes ALL THREE criteria, keeping the same people and the same underlying progress.`
  );
}

function parseRevision(raw: string): MarketOptionCandidate {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`market-options reviser output unparseable (strict): ${raw.slice(0, 200)}`);
  }
  const p = parsed as Record<string, unknown>;
  const executor = String(p.executor_statement ?? "").trim();
  const job = String(p.job_statement ?? "").trim();
  // require_model: a half-missing revision is a loud failure, never patched.
  if (!executor || !job) {
    throw new Error(`market-options reviser returned an incomplete option (strict): ${raw.slice(0, 200)}`);
  }
  return { executor_statement: executor, job_statement: job, basis: String(p.basis ?? "").trim() || undefined };
}

function parseOptions(raw: string): MarketOptionCandidate[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`market-options generator output unparseable (strict): ${raw.slice(0, 200)}`);
  }
  const arr = (parsed as { options?: unknown })?.options;
  if (!Array.isArray(arr)) {
    throw new Error(`market-options generator output missing options[] (strict): ${raw.slice(0, 200)}`);
  }
  const out: MarketOptionCandidate[] = [];
  for (const o of arr) {
    const executor = String((o as { executor_statement?: unknown })?.executor_statement ?? "").trim();
    const job = String((o as { job_statement?: unknown })?.job_statement ?? "").trim();
    if (!executor || !job) continue; // an option missing a half is not an option
    out.push({
      executor_statement: executor,
      job_statement: job,
      basis: String((o as { basis?: unknown })?.basis ?? "").trim() || undefined,
    });
  }
  return out.slice(0, MAX_OPTIONS);
}

// ── criterion (1): executor is a group of people ─────────────────────────────

// TIGHTENED v1 -> v2: the executor must ALSO be verb-free. GEN_SYSTEM always
// demanded it ("no verb describing what they are doing — that belongs in the
// job"), but the judge did not enforce it, so an executor carrying job content
// could pass: "Direct care staff SEEKING BETTER WORKING CONDITIONS". That is
// the blend problem re-entering through the WHO half, and it destroys the
// two-half card's teaching value — the card claims WHO and THE JOB are
// separable, so WHO must not contain a job.
const EXECUTOR_GROUP_SYSTEM =
  "You judge whether a market EXECUTOR is a GROUP OF PEOPLE, stated WITHOUT any job content. " +
  "PASS only if BOTH hold. " +
  "(A) It names people — a role, profession, or population that a human being could belong to. " +
  "(B) It is VERB-FREE: it says only WHO they are, never what they are doing, seeking, wanting, or trying to achieve. " +
  "FAIL (B) if it contains a verb or participle describing an activity, goal, or need — " +
  "'Direct care staff seeking better working conditions' FAILS (the job is inside the WHO); " +
  "'Direct care staff' PASSES. " +
  "'Community organizations raising funds' FAILS on both counts. " +
  "FAIL if it names a company, brand, vendor, or named organisation. " +
  "FAIL if it names an industry, sector, market, or field ('healthcare', 'education', 'the referral market'). " +
  "FAIL if it is an institution or entity rather than the people in it ('schools', 'agencies', 'hospitals') — " +
  "unless it names the people ('school counsellors', 'agency caseworkers'). " +
  "FAIL if it is an abstraction, a segment label, or a demographic bucket with no human referent. " +
  "A bare descriptive qualifier is fine ('at-risk youth aged 5-26', 'county social workers') — " +
  "it is ACTIVITY or GOAL language that fails (B). " +
  'JSON only: {"is_group_of_people":true|false,"reason":"<one short clause>"}.';

function buildExecutorGroupUser(executor: string): string {
  return `EXECUTOR: ${executor}\nIs this a group of people?`;
}

// ── criterion (2): job is verb + object + contextual clarifier ───────────────

const ODI_FORM_SYSTEM =
  "You judge whether a JOB STATEMENT is in strict ODI form: VERB + OBJECT OF THE VERB + CONTEXTUAL CLARIFIER. " +
  "PASS only if all three parts are present and structurally separable: " +
  "a single action verb, the thing that verb acts on, and a clarifier giving the circumstance. " +
  "FAIL if any part is missing, if there is no clarifier, if it is a noun phrase with no verb, " +
  "if it chains multiple jobs together, or if it is a sentence of prose rather than one clause. " +
  "Judge FORM ONLY here — do not judge whether the job mentions a product or solution; another judge does that. " +
  'JSON only: {"odi_form":true|false,"verb":"<the verb>","object":"<the object>","clarifier":"<the clarifier>","reason":"<one short clause>"}.';

function buildOdiFormUser(job: string): string {
  return `JOB STATEMENT: ${job}\nIs this verb + object of the verb + contextual clarifier?`;
}

// ── criterion (3), part B: no generic offering, no purchase act ──────────────
//
// The imported SOLUTION_AGNOSTIC_SYSTEM asks a NARROWER question than criterion
// (3) requires: it asks whether the job is free of THIS COMPANY's product or
// solution. Criterion (3) as specified is broader — the job must name no
// product, service, channel, provider, or offering category, from ANY supplier.
//
// Proven live, not assumed: the probe "Select a residential treatment provider
// for a young person after an acute episode" PASSED the imported judge, whose
// reason was "the job exists independently of Edgewood Center's specific
// services" — true, and beside the point. It names a provider category and is a
// purchase act, so criterion (3) must reject it.
//
// So criterion (3) = imported judge AND this one. Both must pass. The shared
// judge is NOT modified: generate-market-discovery depends on its current
// behaviour, and this is a composition, not a rewrite.
const NO_OFFERING_SYSTEM =
  "You judge whether a JOB STATEMENT is free of SOLUTIONS — from any supplier, not just one company. " +
  "FAIL if it names a product, service, programme, treatment, facility, channel, platform, tool, " +
  "or a PROVIDER / VENDOR / SUPPLIER of any of those, or a CATEGORY of such an offering. " +
  "FAIL if the job is a PURCHASE OR PROCUREMENT ACT: buying, choosing, selecting, finding, sourcing, " +
  "procuring, hiring, contracting, or evaluating a provider or offering. Those describe shopping for a " +
  "solution, not the underlying progress the person is trying to make. " +
  "PASS only if the job describes the progress itself, in the executor's own world — the outcome they " +
  "want, stated so that it would be true even if no supplier existed. " +
  "Example FAIL: 'Select a residential treatment provider for a young person after an acute episode' — " +
  "names a provider category and is a selection act. " +
  "Example PASS: \"Restore a young person's stability after an acute mental health episode.\" " +
  'JSON only: {"offering_free":true|false,"reason":"<one short clause>"}.';

function buildNoOfferingUser(job: string): string {
  return `JOB STATEMENT: ${job}\nIs this free of any named offering, provider, or purchase act?`;
}

// ── MO-2f (1): odi_form COHERENCE GUARD ──────────────────────────────────────
//
// MO-2e census, 97 assessable verdicts: the ONLY boolean-vs-reason contradictions
// were 2 odi_form rows, both with the identical reason "No clarifier present" on
// a TRUE boolean. The signature is exact — of 31 odi_form passes, 29 carry NO
// reason and the 2 that carry one both state failure:
//
//   odi_form FALSE -> 11 rows, 11 carry a reason  (100%)
//   odi_form TRUE  -> 31 rows, 29 carry NO reason (94%), 2 carry one — both wrong
//
// So: an odi_form PASS that bothers to explain itself is explaining a failure.
// Refuse it, re-ask once, and if it recurs hard-fail the chain by name rather
// than banking a verdict we can see is incoherent. Deterministic; no criteria
// text, no judge prompt, no banked verdict touched.
export function odiFormPassIsIncoherent(pass: boolean, reason: string): boolean {
  return pass === true && String(reason ?? "").trim().length > 0;
}

// ── MO-2f (2): CLAUSE-(f) STATEMENT SCAN ─────────────────────────────────────
//
// The larger MO-2e class: 8 of 42 passing executor_group verdicts (19%) sit on a
// WHO containing duty language clause (f) names as failing, and the judge waved
// them through with reasons that are factually untrue of the text ("People who
// support youth initiatives" judged "verb-free"). A coherence check cannot see
// this — the reason agrees with the boolean, both are just wrong about the text.
//
// So this is a deterministic READ of the statement, not a re-judge. It never
// overrides the judge toward rejection: a scan hit does NOT store a pass and does
// NOT silently drop the option — it COACHES, feeding the offending clause back as
// a targeted revision instruction so the reviser reaches for the role noun the
// judge never forced it to find.
//
// Exclusions are deliberate and extensible: these are -ing words that are part of
// a role NOUN, not a description of activity. Add to this list, with the reason,
// rather than weakening the scan.
const CLAUSE_F_ING_EXCLUSIONS = new Set([
  "nursing",   // "nursing staff" — the word names the profession, not an activity
  "housing",   // "housing caseworkers"
  "training",  // "training officers"
  "safeguarding", // UK statutory role: "safeguarding leads"
  "counselling", "counseling", // "counselling staff"
]);

/**
 * Marker separating the JUDGE's verbatim reason from the SCAN's finding in a
 * stored executor_group reason. Provenance must stay legible in the record: the
 * judge said what it said; the scan is what rejected the row.
 */
export const SCAN_CLAUSE_F_MARKER = "scan-clause-f:";

// ⚠ FUTURE CONSISTENCY CENSUSES MUST EXCLUDE ROWS CARRYING THIS MARKER.
//
// A scan-coached row deliberately stores the judge's TRUE executor_group verdict
// beside status='rejected' — the honest record: the judge passed it, the SCAN
// rejected it. A boolean-vs-reason heuristic (see MO-2e) reads that shape as a
// contradiction, because the reason now contains fail language next to a TRUE
// boolean. It is not one.
//
// So a RISING contradiction rate driven by these rows is THE GUARD WORKING, not
// judge decay. Filter `criterion_executor_reason LIKE '%scan-clause-f:%'` out of
// the assessable population before computing any rate, and say so in the report.

const CLAUSE_F_RELATIVE = /\b(who|that|which)\s+\w+/i;
const CLAUSE_F_DUTY_WORD = /\b(responsible|in\s+charge|tasked|accountable|charged|overseeing)\b/i;

/** The offending fragment, or null when the WHO is clean. Read-only, no models. */
export function clauseFViolation(executor: string): string | null {
  const who = String(executor ?? "");
  const rel = CLAUSE_F_RELATIVE.exec(who);
  if (rel) return rel[0];
  const duty = CLAUSE_F_DUTY_WORD.exec(who);
  if (duty) return duty[0];
  for (const m of who.matchAll(/\b([A-Za-z]+ing)\b/g)) {
    const w = m[1].toLowerCase();
    if (!CLAUSE_F_ING_EXCLUSIONS.has(w)) return m[1];
  }
  return null;
}

// ── MO-2c (1): relationship_kind by UNAMBIGUOUS TRACE ────────────────────────
//
// Restores the pre-MO-1 Act A chip. NEVER model-assigned: the kind is derived
// deterministically from the company's own odi_market_definitions, or it is NULL.
//
// An option TRACES to a def iff every distinctive token of its executor appears
// in that def's job_executor — the def is the blended original, the option is the
// distilled WHO, so containment runs option ⊆ def. Resolution is on the DISTINCT
// KIND, not on def count: Edgewood has two defs that duplicate each other
// (differing only in case), and that is not ambiguity unless their kinds differ.
//
// NULL = no chip, silently (pre-MO-1 behaviour). Display-honesty law: an honest
// absent chip beats a guessed one. No fuzzy borrow, no nearest-neighbour, no
// threshold — if it does not resolve to exactly one kind, it stays NULL.
const KIND_STOP_TOKENS = new Set([
  "and", "of", "the", "in", "at", "for", "to", "a", "an",
  "their", "who", "that", "which", "with", "or",
]);

function kindTokens(s: string): Set<string> {
  return new Set(
    normalizeForHash(s).replace(/[^a-z0-9]+/g, " ").split(/\s+/)
      .filter((w) => w && !KIND_STOP_TOKENS.has(w)),
  );
}

export type MarketDefForKind = { job_executor: string; relationship_kind: string | null };

/** The traced kind, or null when it does not resolve to exactly one. */
export function resolveRelationshipKind(
  executor: string,
  defs: readonly MarketDefForKind[],
): string | null {
  const ot = kindTokens(executor);
  if (ot.size === 0) return null;
  const kinds = new Set<string>();
  for (const d of defs) {
    const dt = kindTokens(String(d.job_executor ?? ""));
    let subset = true;
    for (const t of ot) if (!dt.has(t)) { subset = false; break; }
    if (!subset) continue;
    const k = String(d.relationship_kind ?? "").trim();
    if (k) kinds.add(k);
  }
  return kinds.size === 1 ? [...kinds][0] : null;
}

// ── duplicate detection (MO-2b (c)) ──────────────────────────────────────────
//
// Same tokenisation as the reconcile path (reconcilePublicSynthesis): lower ->
// strip non letter/number -> split -> drop universal scaffold. Kept local rather
// than exported from there because the THRESHOLD differs and must not drift into
// that module's reconcile behaviour.
//
// THRESHOLD 0.55, operator-confirmed against both fixtures:
//   direct-care pair 0.636 -> collapses    (shared 7 of 11 distinctive tokens)
//   families pair    0.143 -> survives     (shared 2 of 14)
// The safe band is 0.40-0.63; 0.55 leans high because under the breadth
// calibration the costly error is collapsing a NON-duplicate, not missing one.
export const DUPLICATE_THRESHOLD = 0.55;

const DUP_STOP_TOKENS = new Set(["the", "to", "of", "a", "it", "takes", "time", "minimize"]);

function jobTokens(statement: string): Set<string> {
  return new Set(
    normalizeForHash(statement)
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter(Boolean)
      .filter((w) => !DUP_STOP_TOKENS.has(w)),
  );
}

/** Distinctive-token Jaccard over two job statements. 0 when either is empty. */
export function jobSimilarity(a: string, b: string): number {
  const ta = jobTokens(a);
  const tb = jobTokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  const union = ta.size + tb.size - inter;
  return union === 0 ? 0 : inter / union;
}

// ── identity ─────────────────────────────────────────────────────────────────

/**
 * Content identity of an option. Namespaced like the sibling market keys, over
 * the SEPARATE halves. Uses the single TS hashing authority — never SQL.
 */
export async function optionIdentity(executor: string, job: string): Promise<string> {
  return await sha256Hex(`mktopt|${normalizeForHash(`${executor}|${job}`)}`);
}

// ── core ─────────────────────────────────────────────────────────────────────

type Supa = { from: (t: string) => any };

export type MarketOptionArgs = {
  supabase: Supa;
  companyId: string;
  ollamaUrl: string;
  nowIso: string;
  genModel?: string;
  judgeModel?: string;
  write?: boolean;
  plan?: boolean;
  revise?: boolean;
  /** MO-2b (c): deterministic true-duplicate suppression. Zero model calls. */
  collapse?: boolean;
  candidates?: MarketOptionCandidate[];
  runId?: string | null;
};

export type MarketOptionResult =
  | { ok: true; plan: { candidates: MarketOptionCandidate[]; fresh: number; cached: number; gen_calls: number } }
  // MO-2b (c): deterministic duplicate suppression — zero model calls.
  | { ok: true; collapse: { considered: number; suppressed: Array<{ id: string; duplicate_of: string; score: number }>; threshold: number } }
  | {
    ok: true;
    scoped: boolean;
    totals: {
      considered: number;
      cached: number;
      written_candidates: number;
      written_rejections: number;
      terminal: number;
      judge_calls: number;
      gen_calls: number;
      clause_f_coached: number;
      coherence_reasks: number;
      coherence_recovered: number;
    };
    results: Array<Record<string, unknown>>;
  }
  | { ok: false; skipped: "no_evidence" | "frozen_company"; detail?: string }
  | { ok: false; error: string };

async function loadCompanyName(supabase: Supa, companyId: string): Promise<string> {
  const { data } = await supabase.from("companies").select("name").eq("id", companyId).single();
  return String((data as { name?: unknown } | null)?.name ?? "").trim() || "the company";
}

/** Identity -> status for every option already banked (candidates AND rejections). */
/**
 * Identity -> status for options banked UNDER THE CURRENT CRITERIA VERSION.
 * Verdicts from a superseded version are deliberately NOT loaded: they must not
 * satisfy a cache lookup, or a stale pass would ride forever.
 */
async function loadBanked(supabase: Supa, companyId: string): Promise<Map<string, string>> {
  const { data } = await supabase
    .from("market_options")
    .select("content_identity, status")
    .eq("company_id", companyId)
    .eq("criteria_version", MO1_CRITERIA_VERSION);
  const rows = (data ?? []) as Array<{ content_identity: string; status: string }>;
  return new Map(rows.map((r) => [r.content_identity, r.status]));
}

export async function computeMarketOptions(args: MarketOptionArgs): Promise<MarketOptionResult> {
  const genModel = args.genModel ?? DEFAULT_GEN_MODEL;
  const judgeModel = args.judgeModel ?? DEFAULT_JUDGE_MODEL;
  const write = args.write !== false;
  const companyName = await loadCompanyName(args.supabase, args.companyId);
  const banked = await loadBanked(args.supabase, args.companyId);

  // ── PLAN: one 14b gen call → candidate manifest. ZERO writes, ZERO judges. ──
  if (args.plan) {
    const { data: findingRows } = await args.supabase
      .from("findings")
      .select("kind, body, beats")
      .eq("company_id", args.companyId)
      .eq("status", "open");
    const findings = (findingRows ?? []) as Array<{ kind: string; body: string; beats: Record<string, unknown> | null }>;
    if (findings.length === 0) return { ok: false, skipped: "no_evidence", detail: "no open findings" };

    const evidence = findings
      .map((f) => `- [${f.kind}] ${String((f.beats as { observe?: unknown })?.observe ?? f.body ?? "").trim()}`)
      .filter((l) => l.length > 6)
      .join("\n");

    // WHO ONLY. jtbd is deliberately NOT selected — see buildGenUser.
    const { data: defRows } = await args.supabase
      .from("odi_market_definitions")
      .select("id, job_executor")
      .eq("company_id", args.companyId);
    const allDefs = (defRows ?? []) as Array<{ id: string; job_executor: string }>;
    const knownWho = allDefs.map((d) => `- ${d.job_executor}`).join("\n") || "(none on file)";

    const raw = await callOllamaJson(
      args.ollamaUrl,
      genModel,
      GEN_SYSTEM,
      buildGenUser(companyName, evidence, knownWho, MAX_OPTIONS),
      GEN_TIMEOUT_MS,
    );
    const proposed = parseOptions(raw);

    // Dedup within the manifest and against everything already banked.
    const seen = new Set<string>();
    const fresh: MarketOptionCandidate[] = [];
    let cached = 0;
    for (const c of proposed) {
      const id = await optionIdentity(c.executor_statement, c.job_statement);
      if (seen.has(id)) continue;
      seen.add(id);
      if (banked.has(id)) { cached++; continue; } // frozen verdict — never re-judged
      fresh.push(c);
    }
    return { ok: true, plan: { candidates: fresh, fresh: fresh.length, cached, gen_calls: 1 } };
  }

  // ── COLLAPSE: suppress TRUE duplicates among passing candidates. ───────────
  //
  // DETERMINISTIC — zero model calls. Mirrors the distinctive-token Jaccard the
  // reconcile path already uses; a judge was considered and rejected because the
  // operator's two fixtures separate by 4.4x (0.636 vs 0.143), which no judge is
  // needed to tell apart.
  //
  // Gated to the SAME normalized executor: same WHO with genuinely different
  // jobs is BREADTH and must survive (the families fixture). Only the same WHO
  // saying the same thing twice collapses (the direct-care fixture).
  //
  // SURVIVOR (operator rule ii): lowest attempt wins, tie-break earliest
  // created_at. An attempt-1 clean pass sits closer to what the evidence
  // actually said than a coached rewrite does.
  if (args.collapse) {
    const { data: passRows } = await args.supabase
      .from("market_options")
      .select("id, executor_statement, job_statement, attempt, created_at")
      .eq("company_id", args.companyId)
      .eq("status", "candidate")
      .eq("criteria_version", MO1_CRITERIA_VERSION);
    const passing = ((passRows ?? []) as Array<Record<string, unknown>>).map((r) => ({
      id: String(r.id),
      executor: String(r.executor_statement ?? ""),
      job: String(r.job_statement ?? ""),
      attempt: Number(r.attempt) || 1,
      createdAt: String(r.created_at ?? ""),
    }));

    // Group by normalized executor; cluster within each group.
    const groups = new Map<string, typeof passing>();
    for (const p of passing) {
      const key = normalizeForHash(p.executor);
      const g = groups.get(key);
      if (g) g.push(p); else groups.set(key, [p]);
    }

    const better = (a: typeof passing[number], b: typeof passing[number]) =>
      a.attempt !== b.attempt ? (a.attempt < b.attempt ? a : b)
        : (a.createdAt <= b.createdAt ? a : b);

    const suppressed: Array<{ id: string; duplicate_of: string; score: number }> = [];
    for (const g of groups.values()) {
      if (g.length < 2) continue;
      // Survivor-first clustering: each member joins the first cluster it is a
      // duplicate of, so a 3-way duplicate resolves to ONE survivor.
      const clusters: Array<typeof passing> = [];
      for (const p of g) {
        let placed = false;
        for (const c of clusters) {
          const score = jobSimilarity(c[0].job, p.job);
          if (score >= DUPLICATE_THRESHOLD) { c.push(p); placed = true; break; }
        }
        if (!placed) clusters.push([p]);
      }
      for (const c of clusters) {
        if (c.length < 2) continue;
        const survivor = c.reduce(better);
        for (const p of c) {
          if (p.id === survivor.id) continue;
          suppressed.push({ id: p.id, duplicate_of: survivor.id, score: jobSimilarity(survivor.job, p.job) });
        }
      }
    }

    if (write) {
      for (const s of suppressed) {
        // Status only — the passing verdict is NEVER rewritten.
        const { error } = await args.supabase
          .from("market_options")
          .update({ status: "duplicate", duplicate_of: s.duplicate_of })
          .eq("id", s.id);
        if (error) throw new Error(`market-options duplicate suppression failed (${s.id}): ${error.message}`);
      }
    }
    return { ok: true, collapse: { considered: passing.length, suppressed, threshold: DUPLICATE_THRESHOLD } };
  }

  // ── REVISE: ONE rewrite cycle per rejected attempt-1 option. 14b ONLY. ─────
  // Zero judge calls, zero writes — returns a manifest the driver feeds back to
  // the judge chunk. Keeping this its own phase preserves model-phase batching:
  // plan and revise are the 14b phases, every chunk is 70b-only, so a model
  // swap happens once per phase instead of once per candidate.
  if (args.revise) {
    const REV_COLS = "id, executor_statement, job_statement, status, attempt, revision_of, rejected_criterion, criterion_executor_reason, criterion_odi_form_reason, criterion_solution_agnostic_reason";
    // MO-2b: attempts 1 AND 2 are revisable. A third attempt is BOUNDED — see
    // qualifiesForThirdAttempt below. Never a 4th (the CHECK is the backstop).
    const { data: rejRows } = await args.supabase
      .from("market_options")
      .select(REV_COLS)
      .eq("company_id", args.companyId)
      .eq("status", "rejected")
      .in("attempt", [1, 2])
      .eq("criteria_version", MO1_CRITERIA_VERSION);
    const rejected = (rejRows ?? []) as Array<Record<string, unknown>>;

    // One rewrite per parent: skip any row that already has a revision of its own.
    const { data: revRows } = await args.supabase
      .from("market_options")
      .select("revision_of")
      .eq("company_id", args.companyId)
      .in("attempt", [2, 3])
      .eq("criteria_version", MO1_CRITERIA_VERSION);
    const alreadyRevised = new Set(
      ((revRows ?? []) as Array<{ revision_of: string | null }>).map((r) => String(r.revision_of ?? "")),
    );

    const byId = new Map(rejected.map((r) => [String(r.id), r]));
    const reasonFor = (row: Record<string, unknown> | undefined, criterion: string): string => {
      if (!row) return "";
      return criterion === "executor_group"
        ? String(row.criterion_executor_reason ?? "")
        : criterion === "odi_form"
        ? String(row.criterion_odi_form_reason ?? "")
        : String(row.criterion_solution_agnostic_reason ?? "");
    };

    // THE BOUND (MO-2b ruling a). An attempt-2 rejection earns a third pass only
    // when the loop is still MOVING: it failed a DIFFERENT criterion than its
    // parent (the sequential-defect case — donor chain A, where fixing WHO
    // exposed a defect in THE JOB), or the SAME criterion for a DIFFERENT reason.
    // Same criterion AND same reason means the coaching did not land and another
    // identical pass would burn model calls to repeat itself — that stays a HOLD
    // for the operator, not an automatic retry.
    const qualifiesForThirdAttempt = (row: Record<string, unknown>): boolean => {
      const parent = byId.get(String(row.revision_of ?? ""));
      if (!parent) return false; // unwalkable chain — never guess
      const c2 = String(row.rejected_criterion ?? "");
      const c1 = String(parent.rejected_criterion ?? "");
      if (c1 !== c2) return true; // different criterion — sequential defect
      const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
      return norm(reasonFor(row, c2)) !== norm(reasonFor(parent, c1));
    };

    const revisions: MarketOptionCandidate[] = [];
    let genCalls = 0;
    let skipped = 0;
    for (const r of rejected) {
      const originalId = String(r.id);
      if (alreadyRevised.has(originalId)) { skipped++; continue; }
      const parentAttempt = Number(r.attempt) || 1;
      if (parentAttempt === 2 && !qualifiesForThirdAttempt(r)) { skipped++; continue; }
      const criterion = String(r.rejected_criterion ?? "");
      const reason = criterion === "executor_group"
        ? String(r.criterion_executor_reason ?? "")
        : criterion === "odi_form"
        ? String(r.criterion_odi_form_reason ?? "")
        : String(r.criterion_solution_agnostic_reason ?? "");
      const raw = await callOllamaJson(
        args.ollamaUrl,
        genModel,
        REVISE_SYSTEM,
        buildReviseUser(String(r.executor_statement), String(r.job_statement), criterion, reason, {
          executor_group: String(r.criterion_executor_reason ?? ""),
          odi_form: String(r.criterion_odi_form_reason ?? ""),
          solution_agnostic: String(r.criterion_solution_agnostic_reason ?? ""),
        }),
        GEN_TIMEOUT_MS,
      );
      genCalls++;
      const rev = parseRevision(raw);
      const identity = await optionIdentity(rev.executor_statement, rev.job_statement);
      // A revision identical to something already judged is a frozen verdict —
      // don't spend judge calls re-deciding it.
      if (banked.has(identity)) { skipped++; continue; }
      revisions.push({ ...rev, revision_of: originalId, revision_attempt: parentAttempt + 1 });
    }
    return { ok: true, plan: { candidates: revisions, fresh: revisions.length, cached: skipped, gen_calls: genCalls } };
  }

  // ── SCOPED CHUNK: judge the given candidates, bank verdicts INLINE. ─────────
  if (args.candidates && args.candidates.length > 0) {
    // MO-2f counters: clause_f_coached = scan-coached rows; coherence_reasks /
    // coherence_recovered = odi_form guard firings and recoveries.
    const totals = { considered: 0, cached: 0, written_candidates: 0, written_rejections: 0, terminal: 0, judge_calls: 0, gen_calls: 0, clause_f_coached: 0, coherence_reasks: 0, coherence_recovered: 0 };
    const results: Array<Record<string, unknown>> = [];
    // MO-2c: the company's own market definitions, read ONCE per chunk, for the
    // write-time relationship_kind trace. Read-only; never mutated here.
    const { data: kindDefRows } = await args.supabase
      .from("odi_market_definitions")
      .select("job_executor, relationship_kind")
      .eq("company_id", args.companyId);
    const kindDefs = (kindDefRows ?? []) as MarketDefForKind[];

    for (const cand of args.candidates) {
      totals.considered++;
      const identity = await optionIdentity(cand.executor_statement, cand.job_statement);

      // FREEZE-ON-REJECT / dedup: a banked verdict is final. Zero model calls.
      if (banked.has(identity)) {
        totals.cached++;
        totals.terminal++;
        results.push({ executor_statement: cand.executor_statement, job_statement: cand.job_statement, outcome: `cached_${banked.get(identity)}` });
        continue;
      }

      let passExec: boolean | null = null, reasonExec = "";
      let passForm: boolean | null = null, reasonForm = "";
      let passSol: boolean | null = null, reasonSol = "";
      let rejected: Criterion | null = null;

      // (1) executor is a group of people.
      {
        const raw = await callOllamaJson(args.ollamaUrl, judgeModel, EXECUTOR_GROUP_SYSTEM, buildExecutorGroupUser(cand.executor_statement), JUDGE_TIMEOUT_MS, { deterministic: true });
        const v = parseBool(raw, "is_group_of_people", "executor-group judge");
        totals.judge_calls++;
        passExec = v.value; reasonExec = v.reason;
        if (!v.value) rejected = "executor_group";
        // MO-2f (2) CLAUSE-(f) SCAN-AS-COACH. The judge's boolean and reason are
        // stored EXACTLY as given — nothing here rewrites a verdict. What the
        // scan changes is the ROW STATUS: a WHO carrying duty language does not
        // reach Act A on a reason that is untrue of its own text. The offending
        // fragment is appended under an explicit `scan-clause-f:` marker so the
        // record shows plainly that the pipeline, not the judge, rejected it —
        // and buildReviseUser turns that marker into targeted coaching.
        if (v.value) {
          const frag = clauseFViolation(cand.executor_statement);
          if (frag) {
            totals.clause_f_coached++;
            rejected = "executor_group";
            reasonExec = `${v.reason} | ${SCAN_CLAUSE_F_MARKER} "${frag}"`;
            console.log(`[market-options] clause-(f) scan coached: "${cand.executor_statement}" (fragment: ${frag})`);
          }
        }
      }

      // (2) verb + object + contextual clarifier. Short-circuits on (1).
      if (!rejected) {
        let raw = await callOllamaJson(args.ollamaUrl, judgeModel, ODI_FORM_SYSTEM, buildOdiFormUser(cand.job_statement), JUDGE_TIMEOUT_MS, { deterministic: true });
        let v = parseBool(raw, "odi_form", "odi-form judge");
        totals.judge_calls++;
        // MO-2f (1) COHERENCE GUARD: a PASS that carries a reason is, on the
        // census evidence (2/2), explaining a failure. Re-ask once, then refuse
        // to bank an incoherent verdict rather than shipping it to Act A.
        if (odiFormPassIsIncoherent(v.value, v.reason)) {
          totals.coherence_reasks++;
          console.log(`[market-options] odi_form coherence guard: PASS carried reason "${v.reason}" — re-asking once`);
          raw = await callOllamaJson(args.ollamaUrl, judgeModel, ODI_FORM_SYSTEM, buildOdiFormUser(cand.job_statement), JUDGE_TIMEOUT_MS, { deterministic: true });
          v = parseBool(raw, "odi_form", "odi-form judge");
          totals.judge_calls++;
          if (odiFormPassIsIncoherent(v.value, v.reason)) {
            throw new Error(
              `market-options odi_form COHERENCE FAILURE (strict): judge returned odi_form=true ` +
              `with a reason that states failure — "${v.reason}" — for job "${cand.job_statement}". ` +
              `Re-ask reproduced it. Refusing to bank an incoherent verdict.`,
            );
          }
          totals.coherence_recovered++;
        }
        passForm = v.value; reasonForm = v.reason;
        if (!v.value) rejected = "odi_form";
      }

      // (3) solution-agnostic — TWO parts, both must pass. Part A is the
      // EXISTING judge (imported, not copied): is the job free of THIS
      // company's solution. Part B is MO-1's extension: is it free of ANY
      // named offering, provider, or purchase act. Part A alone lets
      // "Select a residential treatment provider ..." through — proven live.
      if (!rejected) {
        const rawA = await callOllamaJson(args.ollamaUrl, judgeModel, SOLUTION_AGNOSTIC_SYSTEM, buildSolutionAgnosticUser(companyName, cand.executor_statement, cand.job_statement), JUDGE_TIMEOUT_MS, { deterministic: true });
        const a = parseBool(rawA, "solution_free", "solution-agnostic judge");
        totals.judge_calls++;
        if (!a.value) {
          passSol = false;
          reasonSol = `company-solution: ${a.reason}`;
          rejected = "solution_agnostic";
        } else {
          const rawB = await callOllamaJson(args.ollamaUrl, judgeModel, NO_OFFERING_SYSTEM, buildNoOfferingUser(cand.job_statement), JUDGE_TIMEOUT_MS, { deterministic: true });
          const b = parseBool(rawB, "offering_free", "no-offering judge");
          totals.judge_calls++;
          passSol = b.value;
          reasonSol = b.value
            ? `company-solution: ${a.reason} | offering-free: ${b.reason}`
            : `offering/purchase-act: ${b.reason}`;
          if (!b.value) rejected = "solution_agnostic";
        }
      }

      const status = rejected ? "rejected" : "candidate";
      if (write) {
        const { error } = await args.supabase.from("market_options").insert({
          company_id: args.companyId,
          executor_statement: cand.executor_statement,
          job_statement: cand.job_statement,
          basis: cand.basis ?? null,
          status,
          criterion_executor_group: passExec,
          criterion_executor_reason: reasonExec || null,
          criterion_odi_form: passForm,
          criterion_odi_form_reason: reasonForm || null,
          criterion_solution_agnostic: passSol,
          criterion_solution_agnostic_reason: reasonSol || null,
          rejected_criterion: rejected,
          content_identity: identity,
          // Deterministic trace, or NULL. Never model-assigned.
          relationship_kind: resolveRelationshipKind(cand.executor_statement, kindDefs),
          criteria_version: MO1_CRITERIA_VERSION,
          attempt: cand.revision_attempt ?? (cand.revision_of ? 2 : 1),
          revision_of: cand.revision_of ?? null,
          gen_model: genModel,
          judge_model: judgeModel,
          run_id: args.runId ?? null,
          created_at: args.nowIso,
        });
        // UNIQUE(company_id, content_identity) is the loud backstop; a concurrent
        // duplicate is benign (same frozen verdict), anything else throws.
        if (error && !String(error.message ?? "").includes("duplicate")) {
          throw new Error(`market-options insert failed: ${error.message}`);
        }
      }
      banked.set(identity, status);
      if (status === "candidate") totals.written_candidates++; else totals.written_rejections++;
      // LEDGER ACCOUNTING: target_count counts OPTIONS to decide, not model
      // rounds. An attempt-1 rejection is NOT terminal — its revision is still
      // owed, and counting it here would overshoot target by the number of
      // refinement cycles. Terminal = passed first time, or judged at attempt 2,
      // or already frozen in the cache.
      // MO-2b: an attempt-2 rejection may still earn a bounded third pass, so it
      // is NOT terminal by the mere fact of being a revision. Terminal = passed,
      // or judged at the final allowed attempt (3), or already frozen.
      const writtenAttempt = cand.revision_attempt ?? (cand.revision_of ? 2 : 1);
      const isTerminal = status === "candidate" || writtenAttempt >= 3;
      if (isTerminal) totals.terminal++;

      results.push({
        executor_statement: cand.executor_statement,
        job_statement: cand.job_statement,
        attempt: cand.revision_attempt ?? (cand.revision_of ? 2 : 1),
        revision_of: cand.revision_of ?? null,
        status,
        rejected_criterion: rejected,
        criteria: {
          executor_group: { pass: passExec, reason: reasonExec },
          odi_form: { pass: passForm, reason: reasonForm },
          solution_agnostic: { pass: passSol, reason: reasonSol },
        },
      });
    }
    return { ok: true, scoped: true, totals, results };
  }

  // ── FINALIZE: census only. No prune — candidates and rejections share the
  // table, so a rejection is never orphaned from its option content. ──────────
  const { data: allRows } = await args.supabase
    .from("market_options")
    .select("id, executor_statement, job_statement, status, rejected_criterion, attempt, revision_of")
    .eq("company_id", args.companyId)
    .eq("criteria_version", MO1_CRITERIA_VERSION);
  const rows = (allRows ?? []) as Array<Record<string, unknown>>;
  return {
    ok: true,
    scoped: false,
    totals: {
      considered: rows.length,
      cached: rows.length,
      written_candidates: rows.filter((r) => r.status === "candidate").length,
      written_rejections: rows.filter((r) => r.status === "rejected").length,
      terminal: rows.length,
      judge_calls: 0,
      gen_calls: 0,
      clause_f_coached: 0,
      coherence_reasks: 0,
      coherence_recovered: 0,
    },
    results: rows,
  };
}
