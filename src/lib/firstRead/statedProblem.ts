// V2-2 — the Act 1 render-boundary guard. A stated problem renders only if it is real
// substance; a canned / generic / empty class is REFUSED (honest-empty in its place),
// so the act never shows a generic problem statement in place of the client's own words.

const CANNED_CLASS: RegExp[] = [
  /^this company (solves|helps|provides|offers|serves)/i,
  /^a (company|business|firm|provider) that/i,
  /^(we|they) (help|solve|provide) (companies|businesses|customers)/i,
  /^helps? (businesses|companies|customers|people) (with|to)\b/i,
  /^provides? (solutions|services|products)\b/i,
];

export function admitStatedProblem(statement: string | null | undefined): boolean {
  const s = (statement ?? "").trim();
  if (s.length < 8) return false; // too short to be a real stated problem
  if (CANNED_CLASS.some((re) => re.test(s))) return false; // generic canned class — refused
  return true;
}

// V2-2b — the provenance label under the statement (which source/register fired).
// Client-facing — OPERATOR-SIGNED 2026-07-23.
export const STATED_PROBLEM_LABELS = {
  company_declared: "The problem you brought to us",   // register = internal_declared
  site_inferred: "Read from your public site",         // register = public_observed, problem framing
  site_descriptive: "How you describe yourselves publicly", // register = public_observed, descriptive fallback
} as const;

export function statedProblemLabel(register: string, descriptiveFallback: boolean): string {
  if (register === "internal_declared") return STATED_PROBLEM_LABELS.company_declared;
  // public_observed
  return descriptiveFallback ? STATED_PROBLEM_LABELS.site_descriptive : STATED_PROBLEM_LABELS.site_inferred;
}

// V2-3 — long-brief threshold. A short brief (a sentence or two — a stated problem is
// typically ~200–500 chars) distills cleanly to ONE line. Past this length a brief
// carries multiple distinct dimensions (Edgewood's is 4097 chars / ~617 words, with
// several "for X" consequence sections), and forcing it into one line drops faithful
// substance — so we parse it into a headline + up to 4 supporting points. 900 chars
// (~140 words, ~5+ sentences) is the honest cut between the two. Calibrated on the one
// real brief that exists today (Edgewood) plus the "short = 1–2 sentences" definition;
// re-tune when more briefs land.
export const LONG_BRIEF_CHARS = 900;

export function isLongBrief(brief: string | null | undefined): boolean {
  return (brief ?? "").trim().length >= LONG_BRIEF_CHARS;
}
