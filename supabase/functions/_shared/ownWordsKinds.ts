// OWN-WORDS ADMISSION CRITERION (operator ruling 2026-09-03) — the ONE home of the statement-kind
// vocabulary, the eligibility rule, and the client-visibility split. Pure (no Deno, no DB): imported by
// the extractor, the retype backfill, the delta compute, the public-read seeds, and the First Read hook,
// and by vitest. Admit / decline only — nothing here rewrites a statement.
//
// A "you say" statement is a claim that POSITIONS — who they are, what they offer, whom for, why choose
// them. Usage copy, taglines without a claim, product notes, policy, story and recruiting copy are the
// company's words but not its positioning: they stay as own-words RECORD (never deleted), never as the
// declared side of the gap.

export const OWN_WORDS_KINDS = [
  "positioning", "offer", "audience", "proof",
  "instruction", "slogan", "location", "policy", "story", "recruiting", "other",
] as const;
export type OwnWordsKind = (typeof OWN_WORDS_KINDS)[number];

/** Declared-eligible kinds — the only kinds that reach the gap's declared side. */
export const DECLARED_ELIGIBLE_KINDS: ReadonlySet<OwnWordsKind> = new Set<OwnWordsKind>(["positioning", "offer", "audience", "proof"]);
/** Kept as record AND still shown under "In your words" (the company's voice, never the gap). */
export const CLIENT_RECORD_KINDS: ReadonlySet<OwnWordsKind> = new Set<OwnWordsKind>(["slogan", "story", "location"]);
// instruction / policy / recruiting / other: kept as record, operator view only.

export function parseOwnWordsKind(raw: unknown): OwnWordsKind | null {
  const k = String(raw ?? "").trim().toLowerCase();
  return (OWN_WORDS_KINDS as readonly string[]).includes(k) ? (k as OwnWordsKind) : null;
}

/** FAIL-TOWARD-ELIGIBLE: a missing/invalid kind (a judge glitch) never hides a positioning claim. */
export function declaredEligibleFor(kind: OwnWordsKind | null): boolean {
  return kind === null ? true : DECLARED_ELIGIBLE_KINDS.has(kind);
}

/** Client surface ("In your words"): eligible kinds, plus slogan / story / location as record. */
export function ownWordsClientVisible(kind: OwnWordsKind | null, declaredEligible: boolean): boolean {
  return declaredEligible || (kind !== null && CLIENT_RECORD_KINDS.has(kind));
}

/** The judge question — asked INSIDE the existing own-words judge call (no extra spend). Typed + reasoned. */
export const JUDGE_KIND_QUESTION =
  `kind (exactly one of: ${OWN_WORDS_KINDS.join(", ")}) — positioning = who we are / why choose us; ` +
  `offer = what we provide and how; audience = whom we serve; proof = evidence, method, credentials, track record; ` +
  `instruction = how to use or prepare a product; slogan = a tagline with no claim; location = where we are; ` +
  `policy = legal, privacy, terms; story = founder or history narrative; recruiting = hiring or culture copy; ` +
  `other = none of these. Also give kindReason (one sentence why).`;
