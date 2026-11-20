// ── THE PATTERN LAYER UNDER A NEED (SP-465 / SP-463 / SP-428 / SP-459, 2026-11-20) ───────────────
//
// Two model calls per need, and the second one exists to throw the first one's work away.
//
//   GENERATOR  reads the need and its counted quotes and proposes patterns, each naming the quotes
//              whose own words state it. Schema-bounded per SP-463: at most 6 patterns, a name of at
//              most 90 characters, temperature 0.
//   JUDGE      takes each proposed pattern and re-reads the cited quotes one at a time. A quote
//              survives only if its own words state the pattern. A pattern with ZERO survivors is not
//              stored (SP-463) — so a pattern the generator invented and then could not support
//              leaves no row, rather than a row with an empty evidence list.
//
// THE STRENGTH IS NOT THE MODEL'S OPINION. SP-428's four strengths are assigned HERE, from the
// surviving quotes and the sites they sat on, by `patternStrength` — a pure function the tests pin.
// A judge that could name the strength itself would be free to call three quotes a confirmed rule.
// SP-428 also struck the supporting ÷ total ratio, so nothing here computes or stores one.
//
// COUNTS ARE NEVER STORED (SP-463). `need_pattern_quotes` holds which quote bears on which pattern,
// and every count on every surface derives from those rows.
//
// THE LANE. The caller resolves it ONCE through `patternRouteProvenance` (SP-460 / SP-468) and passes
// the routed caller in. This module never chooses a model and never reads an env var: that is what
// made the router the single authority, and a model id chosen here would be a second one.
import { normalizeForHash, sha256Hex } from "./contentIdentity.ts";

/** The rubric these patterns were judged under, by value — as need_evidence carries its own. */
export const PATTERN_RUBRIC_VERSION = "need-pattern-rubric-v1";
/** md5 of PATTERN_RUBRIC_TEXT below, so a changed rubric cannot pass as the one that was signed. */
export const PATTERN_RUBRIC_TEXT = [
  "A PATTERN is the particular thing that keeps happening under a need, stated as one sentence in plain words.",
  "A quote SUPPORTS a pattern only when the quote's own words state it. A quote about the same topic does not support it.",
  "A pattern must be narrower than the need and wider than one quote.",
  "Never invent a quote, a number, a date or a name.",
].join("\n");

/** SP-463, as COLUMN-BACKED bounds — need_patterns_name_len and the cap below are the same numbers. */
export const MAX_PATTERNS_PER_NEED = 6;
export const MAX_PATTERN_NAME_CHARS = 90;
/** A backstop in tokens, in the SP-F43 spirit: the schema is the bound, this is what stops a runaway. */
export const PATTERN_NUM_PREDICT = 1_200;

export type PatternQuote = {
  signalId: string;
  /** signals.quote — the VERIFIED sentence (SP-452), never evidence_excerpt. */
  quote: string;
  site: string;
  eventDate: string | null;
  brand: string;
};

export type ProposedPattern = { name: string; signalIds: string[] };
/** SP-428: the four strengths, and only these. */
export type PatternStrength = "confirmed rule" | "likely rule" | "possible failure" | "too thin";

/** SP-428, assigned from the SURVIVING quotes, never by the model.
 *
 *  'likely rule' is the one strength SP-428 defines numerically — 5 or more quotes from 2 or more
 *  sites. 'confirmed rule' is above it on both counts. Below it, a pattern with at least two quotes is
 *  a 'possible failure' (something is going wrong and it is not yet a rule); one quote is 'too thin'. */
export function patternStrength(supporting: ReadonlyArray<{ site: string }>): PatternStrength {
  const n = supporting.length;
  const sites = new Set(supporting.map((q) => q.site)).size;
  if (n >= 8 && sites >= 3) return "confirmed rule";
  if (n >= 5 && sites >= 2) return "likely rule";
  if (n >= 2) return "possible failure";
  return "too thin";
}

/** PCT-1: computed in TypeScript only. A pattern's identity is its need plus its normalised name, so a
 *  re-run that proposes the same pattern in different words is a NEW identity and supersedes nothing —
 *  which is honest: it is a different sentence, and the operator should see that it moved. */
export async function patternIdentity(needId: string, name: string): Promise<string> {
  return await sha256Hex(`${needId}\u0000${normalizeForHash(name)}`);
}

export const GENERATOR_SYSTEM = [
  PATTERN_RUBRIC_TEXT,
  "",
  "You are given ONE customer need and the quotes already judged to bear on it.",
  `Propose at most ${MAX_PATTERNS_PER_NEED} patterns. Order them most-evidenced first.`,
  `Each pattern's "name" is ONE sentence of at most ${MAX_PATTERN_NAME_CHARS} characters.`,
  'For each pattern list the LABELS (q1, q2, ...) of the quotes whose own words state it, in "quotes".',
  "A quote may support more than one pattern. A quote that supports none is left out.",
  'Copy each label exactly as given. Never write an id, a uuid, or a label that was not given to you.',
  'JSON only: {"patterns":[{"name":"<=90 chars","quotes":["q1","q4"]}]}',
].join("\n");

export const JUDGE_SYSTEM = [
  PATTERN_RUBRIC_TEXT,
  "",
  "You are given ONE proposed pattern and the quotes cited for it. Judge each quote SEPARATELY.",
  "A quote supports the pattern only if the quote's own words state it. Topic overlap is not support.",
  "Do not judge how strong the pattern is and do not name a strength: only which quotes support it.",
  'Use the labels exactly as given (q1, q2, ...). Never write an id or a uuid.',
  'JSON only: {"supporting":["q1"],"rejected":["q2"],"reason":"<one short clause>"}',
].join("\n");

// ── QUOTES ARE LABELLED q1..qN, NOT BY UUID (measured 2026-11-20) ───────────────────────────────
//
// The first run of this on N13 handed qwen2.5:14b-instruct 44 raw uuids and it returned
// "a76c4a80-5b4d-9b68-f62e97d19115" — four groups, not five: a real id with a group dropped. The
// citation gate refused the whole answer, correctly, and the run stopped.
//
// The gate is not the problem; the surface is. A 36-character hex string is a transcription task a
// model will sometimes fail, and failing it looks exactly like fabrication. `q1`..`q44` is a label it
// can copy, and an out-of-range or invented label is STILL refused by the same gate — so the rule did
// not move, only the thing being copied. The stored rows carry real signal ids throughout: the label
// exists only inside the prompt and the answer.
export function quoteLabels(quotes: readonly PatternQuote[]): Map<string, string> {
  return new Map(quotes.map((qt, i) => [`q${i + 1}`, qt.signalId]));
}

const qline = (q: PatternQuote, i: number) => `q${i + 1} site=${q.site} date=${q.eventDate ?? "unknown"}: "${q.quote.replace(/\s+/g, " ").trim()}"`;

export function buildGeneratorUser(needStatement: string, quotes: readonly PatternQuote[]): string {
  return [`NEED: ${needStatement}`, "", `QUOTES (${quotes.length}):`, ...quotes.map(qline)].join("\n");
}

export function buildJudgeUser(needStatement: string, name: string, quotes: readonly PatternQuote[]): string {
  return [`NEED: ${needStatement}`, "", `PROPOSED PATTERN: ${name}`, "",
          `QUOTES CITED (${quotes.length}):`, ...quotes.map(qline)].join("\n");
}

/** Read a model's JSON answer, and REFUSE anything the schema does not allow rather than repairing it.
 *  SP-463's caps are enforced here as well as in the column, because a cut or over-long answer must
 *  fail loudly: a silently truncated pattern name is a finding nobody can trace. */
export function parseGenerated(content: string, labels: ReadonlyMap<string, string>): ProposedPattern[] {
  const m = content.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("pattern generator returned no JSON object");
  let parsed: unknown;
  try { parsed = JSON.parse(m[0]); } catch (e) { throw new Error(`pattern generator returned unparseable JSON: ${e instanceof Error ? e.message : e}`); }
  const raw = (parsed as { patterns?: unknown })?.patterns;
  if (!Array.isArray(raw)) throw new Error("pattern generator returned no `patterns` array");
  if (raw.length > MAX_PATTERNS_PER_NEED) throw new Error(`pattern generator returned ${raw.length} patterns, over the SP-463 cap of ${MAX_PATTERNS_PER_NEED}`);
  const out: ProposedPattern[] = [];
  for (const p of raw) {
    const name = String((p as { name?: unknown })?.name ?? "").replace(/\s+/g, " ").trim();
    if (!name) throw new Error("pattern generator returned a pattern with no name");
    if (name.length > MAX_PATTERN_NAME_CHARS) throw new Error(`pattern name is ${name.length} chars, over the SP-463 cap of ${MAX_PATTERN_NAME_CHARS}: "${name.slice(0, 60)}…"`);
    const raw = (p as { quotes?: unknown })?.quotes;
    if (!Array.isArray(raw)) throw new Error(`pattern "${name}" cites no quotes array`);
    const cited = [...new Set(raw.filter((x): x is string => typeof x === "string").map((s) => s.trim()))];
    // CITATION INTEGRITY, at the door: a label the call was never given is a fabrication, and it
    // rejects the whole answer rather than being dropped — a dropped citation is a pattern quietly
    // resting on less evidence than the row will claim.
    const unknown = cited.filter((l) => !labels.has(l));
    if (unknown.length) throw new Error(`pattern "${name}" cites ${unknown.length} label(s) that were not in its input: ${unknown.slice(0, 3).join(", ")}`);
    out.push({ name, signalIds: cited.map((l) => labels.get(l)!) });
  }
  return out;
}

export function parseJudged(content: string, labels: ReadonlyMap<string, string>): { supporting: string[]; rejected: string[]; reason: string } {
  const m = content.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("pattern judge returned no JSON object");
  const parsed = JSON.parse(m[0]) as { supporting?: unknown; rejected?: unknown; reason?: unknown };
  // A label outside this pattern's own cited set is DROPPED here rather than refusing the answer: the
  // generator's citations are what the pattern rests on, and the judge can only ever take them away.
  // So a judge that names something extra cannot ADD evidence — the worst it can do is keep fewer.
  const pick = (v: unknown) => [...new Set((Array.isArray(v) ? v : []).filter((x): x is string => typeof x === "string").map((s) => s.trim()))]
    .filter((l) => labels.has(l)).map((l) => labels.get(l)!);
  const supporting = pick(parsed.supporting);
  const rejected = pick(parsed.rejected).filter((id) => !supporting.includes(id));
  return { supporting, rejected, reason: String(parsed.reason ?? "").replace(/\s+/g, " ").trim().slice(0, 400) };
}
