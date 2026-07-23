// CV-2e (GOAL 4) — the client-language rule, single-sourced for every generator +
// its judge. US-English by default; adopt the CLIENT's origin language when the
// client's own materials use it (never mix). This is a GENERATOR-INSTRUCTION change
// plus a JUDGE CRITERION (flagBritishisms) — NOT post-hoc string rewriting: we
// instruct the model and flag violations honestly; we never silently rewrite output.

// Appended to a generator's system prompt.
export const US_ENGLISH_RULE =
  "LANGUAGE: Write in US English spelling and idiom by default (organize, utilization, " +
  "categorized, specialize, prioritize, analyze) — never British forms (organise, " +
  "utilisation, categorised). The ONE exception: if the client's own origin materials " +
  "use British spelling, match the client throughout. Never mix the two within one output.";

// The JUDGE CRITERION: detect British -ise/-isation spellings a US-English output must
// not contain. Curated allowlist so genuine -ise words (exercise, surprise, comprise…)
// never false-positive. Returns the offending words (lowercased, de-duped); empty = clean.
const ALLOWLIST = new Set([
  "advertise", "advise", "apprise", "arise", "chastise", "circumcise", "comprise",
  "compromise", "demise", "despise", "devise", "disguise", "enterprise", "excise",
  "exercise", "franchise", "guise", "improvise", "incise", "merchandise", "otherwise",
  "paradise", "poise", "praise", "precise", "premise", "prise", "promise", "raise",
  "reprise", "revise", "rise", "supervise", "surmise", "surprise", "wise", "likewise",
  "noise", "cruise", "bruise", "concise", "expertise", "malaise", "mortise", "treatise",
]);

export function flagBritishisms(text: string | null | undefined): string[] {
  const s = typeof text === "string" ? text : "";
  if (!s) return [];
  const hits = new Set<string>();
  // British -ise verb family and -isation nouns. -ize/-ization (US) do not match.
  const re = /\b([a-z]+(?:ise[sd]?|ising|isation|isations|yse[sd]?|ysing))\b/gi;
  for (const m of s.matchAll(re)) {
    const word = m[1].toLowerCase();
    // -isation / -ising / -ised almost always British; -ise/-ises need the allowlist.
    if (/(isation|isations|ising|ised|ysing|ysed)$/.test(word)) { hits.add(word); continue; }
    if (/yses?$/.test(word)) { hits.add(word); continue; } // analyse / analyses / paralyses
    if (!ALLOWLIST.has(word)) hits.add(word); // bare -ise/-ises not in the allowlist
  }
  return [...hits];
}
