// ── LEAD TEXT, MASKED FOR DISPLAY (A3, 2026-11-18) ────────────────────────────────────────────────────────────────────
// A lead's text is the search tool's summary of a page, stored verbatim. Where a lead is displayed or exported, the
// REVIEWER's first name, initial or handle is masked as "[reviewer]"; the stored text is never changed. No name or
// handle field exists (standing rule); this covers names that arrive inside the summary text itself.
// Masked, in the shapes measured in Charter's 777 lead texts:
//   - a review header: a date, then the reviewer's name or handle ("May 13 NewNew2021", "1月5日 Jesus Barroso",
//     "2025/11/12 Austin Dee H.", "Oct 1 D.Architekt");
//   - "Review from Daniel M" (BBB); a page-JSON "author":"Rebecca M.";
//   - Reddit "u/<name>"; DSLReports "said by <handle>:", "<handle> ... said by" and its "<handle> : online" list.
// NOT masked: a company's own account (@ask_spectrum, cox.help@cox.com), an email domain (@cox.net), the names
// of the company's staff inside a review ("Supervisor Shawn") — they are not the reviewer — and a BRAND standing where
// a reviewer's name would. The brand words are the caller's, read from stored rows (see `brands` below); this module
// holds no list of company names.
//
// ── SP-443 (2026-11-19): THE EXCERPT SHAPES ──────────────────────────────────────────────────────────────────────────
// The shapes above were measured in Charter's 777 LEAD texts (a search tool's summary of a page). The review group and
// the Brief show a different corpus: `signals.evidence_excerpt`, the quote as it was captured off the page. Measured
// against Charter's 330 judged excerpts, NOT ONE of the shapes above fires on them, while 18 carry a reviewer's name in
// one of two byline shapes this corpus has and the lead texts do not. Wiring the mask without these two would have been
// a mask that masks nothing, so they are part of the same one authority:
//   - ConsumerAffairs byline, a line of its own: "StewartMyrtle Beach, SC" — the reviewer's first name is GLUED to the
//     city with no separator. The first-name run is masked and the place is kept, because a place is not a name.
//   - HighSpeedInternet byline: "– Heather R., Verified User".
//   - Google Play byline: the display name on the line after the reviewer's own avatar image link.
//   - the App Store's STACKED header: the date on one line and the handle on the next, indented
//     ("01/09/2025\n  Vinnydefo"; "  Jun 14\n  MDW32752"), which the one-line header rule above missed.
// Each is anchored to a whole line or to a host-specific link, so none can fire inside a sentence; a date
// followed by a BLANK line and then the review body is never a byline and is left alone.
export const MASK = "[reviewer]";
const DATE = String.raw`(?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.? \d{1,2}(?:, \d{4})?|\d{1,2}/\d{1,2}/\d{4}|\d{4}/\d{1,2}/\d{1,2}|\d{1,2}月\d{1,2}日)`;
const HANDLE = String.raw`[A-Za-z][\w.]*`;
const isHandle = (t: string) => /\d/.test(t) || /\w\.\w/.test(t) || /[a-z][A-Z]/.test(t) || /^[a-z]{3,}$/.test(t);

/**
 * SP-455c (2026-11-19): the brand words are PASSED IN, read from the company's stored values, and no
 * list of company names lives in this module. `brands` is the set this function refuses to call a
 * reviewer: a review header whose name position holds one of them is left alone ("May 13 Cox
 * Communications raised my bill again"). Passing none only makes the mask more eager — it can never
 * leak a name — and the words are compared case-insensitively, because the stored values are
 * lower-case ('cox', 'spectrum') while a page prints them capitalised.
 */
export function maskReviewerNames(text: string, brands: Iterable<string> = []): { text: string; masked: number } {
  const BRAND = new Set<string>();
  for (const b of brands) for (const w of String(b ?? "").split(/[^A-Za-z]+/)) if (w) BRAND.add(w.toLowerCase());
  let n = 0;
  const hit = () => { n++; return MASK; };
  let s = String(text ?? "");
  // a review header: at the start of the text or a line (after an optional indent and list dash), a date, then the
  // name or handle. SP-443: the separator may be a SPACE or a NEWLINE — the App Store stacks them
  // ("01/09/2025\n  Vinnydefo\n  Within 24 hours…"), and a blank line never matches, so a date line followed by
  // the review body is left alone.
  s = s.replace(new RegExp(String.raw`(^|\n)([ \t]*)([-*] )?(${DATE})([ \t]+|\n[ \t]*)(${HANDLE})(?: ([A-Z][a-z]+(?: [A-Z][a-z]+)?(?: [A-Z]\.)?))?(?=\s)`, "g"),
    (all, lead: string, indent: string, dash: string | undefined, date: string, sep: string, first: string, rest: string | undefined,
     offset: number, whole: string) => {
      if (isHandle(first)) return `${lead}${indent}${dash ?? ""}${date}${sep}${hit()}${rest ? ` ${rest}` : ""}`;
      // SP-443: a STACKED header whose second line holds that one word and nothing else is a byline, not
      // prose — "01/09/2025\n  Vinnydefo\n  Within 24 hours…". The one-word test is only safe here, which is
      // why the inline form below still demands two words before it will call something a person.
      if (sep.includes("\n") && rest === undefined && whole[offset + all.length] === "\n") {
        return `${lead}${indent}${dash ?? ""}${date}${sep}${hit()}`;
      }
      const words = [first, ...(rest ? rest.split(" ") : [])];
      const person = /^[A-Z][a-z]+$/.test(first) && words.length >= 2 && !words.some((w) => BRAND.has(w.replace(/\.$/, "").toLowerCase()));
      return person ? `${lead}${indent}${dash ?? ""}${date}${sep}${hit()}` : all;
    });
  s = s.replace(/\bReview from [A-Z][\w'-]+(?: [A-Z]\.?)?(?=[\s*]|$)/g, () => `Review from ${hit()}`);
  s = s.replace(/"author"\s*:\s*"(?!\[reviewer\])[^"]*"/g, () => `"author":"${hit()}"`);
  s = s.replace(/\bu\/(?!\[)[\w-]+/g, () => `u/${hit()}`);
  s = s.replace(/\bsaid by (?!\[)[^\s:]+:/g, () => `said by ${hit()}:`);
  s = s.replace(/(^|\s)(?!\[)(\S+) \.\.\. said by\b/g, (_a, sp: string) => `${sp}${hit()} ... said by`);
  // DSLReports' member-status list: "<handle> : online 24w3d ago"
  s = s.replace(/(^|\s)(?!\[)[A-Za-z][\w.-]* : online\b/g, (_a, sp: string) => `${sp}${hit()} : online`);
  // SP-443 — the stacked header whose handle is not a plain word: a date alone on a line, and the next line
  // holding ONE token that contains something other than letters ("J0n+3", "Frustrated\u{1F624}\u{1F624}"). The rule above
  // reads the handle with [A-Za-z][\w.]* and then demands whitespace, so such a handle escaped it entirely.
  // A token of letters only is left to that rule (which masks it as the handle — see the test that records
  // the deliberate over-mask); this one exists for the handles that reader cannot hold at all.
  s = s.replace(new RegExp(String.raw`(^|\n)([ \t]*)(${DATE})\n([ \t]*)(?!\[reviewer\])(\S+)[ \t]*(?=\n)`, "gu"),
    (all, lead: string, indent: string, date: string, ind2: string, token: string) =>
      /[^A-Za-z]/.test(token) ? `${lead}${indent}${date}\n${ind2}${hit()}` : all);
  // SP-443 — Google Play byline: the line immediately after the reviewer's own avatar image link is their
  // display name ("…googleusercontent.com/a-/…=s32)\n\nRachael Tinsley"). The avatar host is the anchor, so this
  // cannot fire on a sentence.
  s = s.replace(/(\[\]\(https:\/\/play-lh\.googleusercontent\.com\/[^)\n]*\)\n\n)(?!\[reviewer\])([^\n]+)(?=\n)/g,
    (_a, head: string) => `${head}${hit()}`);
  // SP-443 — ConsumerAffairs byline line: "<FirstName><City>, <ST>" on a line of its own. Only the name run is
  // replaced; the lookahead keeps the city and the state, which are not the reviewer's name.
  s = s.replace(/(^|\n)([A-Z][a-z]+)(?=[A-Z][A-Za-z .'\u2019-]*, [A-Z]{2}(?:\n|$))/g,
    (_a, lead: string) => `${lead}${hit()}`);
  // SP-443 — HighSpeedInternet byline: "– Heather R., Verified User".
  s = s.replace(/(^|\n)([\u2013-]\s*)([A-Z][a-z]+(?: [A-Z]\.)?)(?=,\s*Verified User)/g,
    (_a, lead: string, dash: string) => `${lead}${dash}${hit()}`);
  return { text: s, masked: n };
}
