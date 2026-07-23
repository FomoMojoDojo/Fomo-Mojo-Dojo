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
