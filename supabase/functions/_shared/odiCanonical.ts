// Single source of truth for ODI canonical-statement generation: the formula
// PROMPT + the deterministic format GUARD. Extracted here (needs-canonical Phase 2)
// so the local generator and any future caller share ONE definition instead of the
// 3 forked copies that exist today (research-company, propose-opportunity-changes,
// backfill-canonical-statements). Repointing those 3 is a separate cleanup (it
// touches the destructive research path) — this module is the destination.

// The ODI canonical FORMULA PROMPT — lifted verbatim from the prior backfill so the
// local (qwen) reformat produces the same shape the OpenAI backfill did.
export const ODI_CANONICAL_SYSTEM =
  `You are translating a desired outcome statement into strict ODI canonical form.\n` +
  `Return ONLY valid JSON matching the schema: {"odi_canonical_statement":"..."}. No prose.\n\n` +
  `Rules:\n` +
  `- odi_canonical_statement must use the strict ODI formula:\n` +
  `  "[Minimize/Maximize/Reduce/Increase] the [dimension] [to|of|in] [object] when [context]"\n` +
  `- It must be a formula-syntax translation of the desired_outcome — same underlying concept, not a different one\n` +
  `- It must NOT be identical to the desired_outcome\n` +
  `- It must include at least one formula verb (Minimize, Maximize, Reduce, or Increase) and a "when" clause\n` +
  `- The "when" clause should name the job context using the job_executor description when relevant\n` +
  `- Keep it concise (12–22 words), solution-free, and measurable in spirit\n` +
  `- Do not invent new concepts not present in desired_outcome`;

export function buildOdiCanonicalUser(desiredOutcome: string, jobExecutor: string): string {
  return `desired_outcome: ${desiredOutcome}\n` + (jobExecutor ? `job_executor: ${jobExecutor}\n` : "");
}

// Deterministic format guard (the old backfill's isValidCanonical). NOT a semantic
// faithfulness judge (deferred) — it catches empty / identical-to-source / missing
// formula verb / missing "when" clause.
export const ODI_FORMULA_PATTERN = /\b(minimize|maximize|reduce|increase)\b/i;
export const WHEN_PATTERN = / when /i;

export function isValidCanonical(
  value: string,
  desiredOutcome: string,
): { ok: boolean; reason?: string } {
  const trimmed = value.trim();
  if (!trimmed) return { ok: false, reason: "empty string" };
  if (trimmed.toLowerCase() === desiredOutcome.trim().toLowerCase()) {
    return { ok: false, reason: "identical to desired_outcome" };
  }
  if (!ODI_FORMULA_PATTERN.test(trimmed)) {
    return { ok: false, reason: "missing ODI formula verb (Minimize/Maximize/Reduce/Increase)" };
  }
  if (!WHEN_PATTERN.test(trimmed)) {
    return { ok: false, reason: "missing 'when' clause" };
  }
  return { ok: true };
}
