// V2-6 — the verbatim-quote PRODUCER. CV-2e shipped the capture guard (liftVerbatimQuote
// + the DB CHECK); this selects the CANDIDATE span from retained source text so the guard
// has something to lift. Own-domain first, then eligible outside voices.
//
// SELECTION LAW: the candidate is the SOURCE'S OWN WORDS — a real sentence/prose span,
// NOT boilerplate or navigation. Selection is DETERMINISTIC (no model): pick the first
// qualifying prose span. The byte-exact CHECK (liftVerbatimQuote) remains the AUTHORITY —
// this only proposes a substring; a proposal that somehow isn't byte-exact lifts nothing.
// A source with no qualifying span produces no quote (absence is honest, never blocks).

import { liftVerbatimQuote, pickEventDate } from "../verbatimQuote.ts";

// Nav / boilerplate the crawl retains but which are NOT the company's own voice. A
// candidate matching any of these is refused (case-insensitive).
const BOILERPLATE: RegExp[] = [
  /cookie/i,
  /privacy policy/i,
  /terms of (service|use)/i,
  /all rights reserved/i,
  /copyright/i,
  /©/, // ©
  /\b(sign|log)\s?in\b/i,
  /\bsubscribe\b/i,
  /\bnewsletter\b/i,
  /skip to (main )?content/i,
  /\b(main )?menu\b/i,
  /\bnavigation\b/i,
  /\bclick here\b/i,
  /\blearn more\b/i,
  /page not found|404/i,
  /^\s*(home|about|contact|search|login|menu)\s*$/i,
  /(declared in page metadata|site crawl|linked from company|referenced in script)/i, // synthetic crawl labels
];

const MIN_LEN = 40;
const MAX_LEN = 240;
const MIN_WORDS = 6;

function isBoilerplate(s: string): boolean {
  return BOILERPLATE.some((re) => re.test(s));
}
function looksLikeProse(s: string): boolean {
  const words = s.split(/\s+/).filter(Boolean);
  if (words.length < MIN_WORDS) return false;
  const letters = (s.match(/[A-Za-z]/g) || []).length;
  if (letters < s.length * 0.5) return false; // mostly symbols/numbers → not prose
  if (s === s.toUpperCase() && /[A-Z]/.test(s)) return false; // ALL CAPS → nav/banner
  return true;
}

function overlapScore(candidate: string, hint: string): number {
  const toks = (s: string) => new Set((s.toLowerCase().match(/[a-z]{4,}/g) || []));
  const h = toks(hint);
  if (h.size === 0) return 0;
  let n = 0;
  for (const t of toks(candidate)) if (h.has(t)) n++;
  return n;
}

/**
 * Select a verbatim candidate span — a BYTE-EXACT substring of `sourceText` that reads as
 * the source's own prose. Returns the span, or null (honest absence). Never fuzzy: the
 * returned value is always `sourceText.includes(candidate)`. When `relevanceHint` (e.g.
 * the signal's paraphrased claim) is given, the qualifying sentence with the most word
 * overlap wins — a DETERMINISTIC relevance pick, still a real line from the source.
 */
export function selectVerbatimQuote(sourceText: string | null | undefined, relevanceHint?: string | null): string | null {
  const src = typeof sourceText === "string" ? sourceText : "";
  if (src.trim().length < MIN_LEN) return null;
  if (isBoilerplate(src)) return null; // whole retained blob is boilerplate/nav

  // 1) Collect qualifying sentences (letter/quote start, ≥ MIN_LEN, ends in . ! or ?).
  const sentence = /["'"“]?[A-Za-z][^.!?\n]{38,}?[.!?]/g;
  const qualifying: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = sentence.exec(src)) !== null) {
    const cand = m[0].trim();
    if (cand.length >= MIN_LEN && cand.length <= MAX_LEN && !isBoilerplate(cand) && looksLikeProse(cand) && src.includes(cand)) {
      qualifying.push(cand);
    }
  }
  if (qualifying.length > 0) {
    const hint = typeof relevanceHint === "string" ? relevanceHint : "";
    if (hint.trim()) {
      // deterministic: max overlap, ties broken by earliest (stable) order
      let best = qualifying[0], bestScore = overlapScore(qualifying[0], hint);
      for (let i = 1; i < qualifying.length; i++) {
        const s = overlapScore(qualifying[i], hint);
        if (s > bestScore) { best = qualifying[i]; bestScore = s; }
      }
      return best;
    }
    return qualifying[0];
  }

  // 2) Fallback: a clean capped prefix of the source's leading prose (back off to a word
  //    boundary). Still a byte-exact substring. Only when the leading text reads as prose.
  const head = src.trim();
  if (isBoilerplate(head)) return null;
  let cut = head.slice(0, MAX_LEN);
  if (head.length > MAX_LEN) {
    const lastSpace = cut.lastIndexOf(" ");
    if (lastSpace > MIN_LEN) cut = cut.slice(0, lastSpace);
  }
  cut = cut.trim();
  if (cut.length >= MIN_LEN && looksLikeProse(cut) && !isBoilerplate(cut) && src.includes(cut)) return cut;
  return null;
}

/** Normalize a URL to a stable join key (host+path, no scheme/www/trailing-slash/query/hash). */
export function normalizeUrlKey(value: string | null | undefined): string {
  try {
    const url = new URL(String(value || "").trim());
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    let path = url.pathname || "/";
    if (path !== "/") path = path.replace(/\/+$/, "");
    return `${host}${path}`;
  } catch {
    return "";
  }
}

export interface ProducedQuote {
  quote: string;
  quote_source_text: string;
  event_date: string | null;
}

/**
 * Produce a verified verbatim quote (+ its source + a visible date if any) from retained
 * source text. Routes the selected candidate through liftVerbatimQuote — the byte-exact
 * CHECK is the authority, so this returns null unless the span is provably verbatim.
 * `dateCandidate` yields an event_date ONLY when it is genuinely date-shaped (pickEventDate
 * law — never inferred).
 */
export function produceQuote(
  sourceText: string | null | undefined,
  dateCandidate?: string | null,
  relevanceHint?: string | null,
): ProducedQuote | null {
  const candidate = selectVerbatimQuote(sourceText, relevanceHint);
  if (!candidate) return null;
  const lifted = liftVerbatimQuote(sourceText, candidate); // AUTHORITY: byte-exact substring
  if (!lifted) return null;
  return { quote: lifted.quote, quote_source_text: lifted.quote_source_text, event_date: pickEventDate(dateCandidate ?? null) };
}
