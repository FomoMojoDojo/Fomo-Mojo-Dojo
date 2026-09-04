// E2 LENGTH CEILINGS — the ONE home (operator ruling 2026-09-04). Read by the admission rail (admitOutsideEvidence,
// inherited by clientVoiceGuard) AND the claim-layer canonicalize cap (evidenceMappers), so an admitted excerpt always
// survives rebuild-claims. Raised 160 → 210 for a single sentence: the sample showed length carried no junk signal
// (filler passes just under, roaster attribution fails just over); the judge holds the about-the-client line.
export const E2_SINGLE_SENTENCE_MAX = 210;
/** THE 18 (2026-09-04): the raise belongs to judge-admitted verbatim (R3 rail). At the CLAIM layer an un-judged single
 *  sentence (baseline paraphrase, competitor discovery, …) keeps the pre-raise ceiling — otherwise 161–210 char paraphrases
 *  on held/superseded signals mint claims the judge never saw. */
export const E2_UNJUDGED_SINGLE_SENTENCE_MAX = 160;
/** Multi-sentence AND concrete-bearing (retained clauses): unchanged. */
export const E2_MULTI_SENTENCE_MAX = 480;
/** Declared (organization) band keeps full passages: unchanged. */
export const E2_ORGANIZATION_MAX = 320;
