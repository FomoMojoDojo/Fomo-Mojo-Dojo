// ── LEAD TEXT, MASKED FOR DISPLAY (A3, 2026-11-18) ────────────────────────────────────────────────────────────────────
// A lead's text is the search tool's summary of a page, stored verbatim. Where a lead is displayed or exported, the
// REVIEWER's first name, initial or handle is masked as "[reviewer]"; the stored text is never changed. No name or
// handle field exists (standing rule); this covers names that arrive inside the summary text itself.
// Masked, in the shapes measured in Charter's 777 lead texts:
//   - a review header: a date, then the reviewer's name or handle ("May 13 NewNew2021", "1月5日 Jesus Barroso",
//     "2025/11/12 Austin Dee H.", "Oct 1 D.Architekt");
//   - "Review from Daniel M" (BBB); a page-JSON "author":"Rebecca M.";
//   - Reddit "u/<name>"; DSLReports "said by <handle>:", "<handle> ... said by" and its "<handle> : online" list.
// NOT masked: a company's own account (@ask_spectrum, cox.help@cox.com), an email domain (@cox.net), and the names
// of the company's staff inside a review ("Supervisor Shawn") — they are not the reviewer.
export const MASK = "[reviewer]";
const BRAND = new Set(["Cox", "Spectrum", "Charter", "Communications", "Comcast", "Xfinity", "Verizon", "Contour", "Panoramic", "Google", "Apple"]);
const DATE = String.raw`(?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.? \d{1,2}(?:, \d{4})?|\d{1,2}/\d{1,2}/\d{4}|\d{4}/\d{1,2}/\d{1,2}|\d{1,2}月\d{1,2}日)`;
const HANDLE = String.raw`[A-Za-z][\w.]*`;
const isHandle = (t: string) => /\d/.test(t) || /\w\.\w/.test(t) || /[a-z][A-Z]/.test(t) || /^[a-z]{3,}$/.test(t);

export function maskReviewerNames(text: string): { text: string; masked: number } {
  let n = 0;
  const hit = () => { n++; return MASK; };
  let s = String(text ?? "");
  // a review header: at the start of the text or a line (after an optional list dash), a date, then the name or handle
  s = s.replace(new RegExp(String.raw`(^|\n)([-*] )?(${DATE}) (${HANDLE})(?: ([A-Z][a-z]+(?: [A-Z][a-z]+)?(?: [A-Z]\.)?))?(?=\s)`, "g"),
    (all, lead: string, dash: string | undefined, date: string, first: string, rest: string | undefined) => {
      if (isHandle(first)) return `${lead}${dash ?? ""}${date} ${hit()}${rest ? ` ${rest}` : ""}`;
      const words = [first, ...(rest ? rest.split(" ") : [])];
      const person = /^[A-Z][a-z]+$/.test(first) && words.length >= 2 && !words.some((w) => BRAND.has(w.replace(/\.$/, "")));
      return person ? `${lead}${dash ?? ""}${date} ${hit()}` : all;
    });
  s = s.replace(/\bReview from [A-Z][\w'-]+(?: [A-Z]\.?)?(?=[\s*]|$)/g, () => `Review from ${hit()}`);
  s = s.replace(/"author"\s*:\s*"(?!\[reviewer\])[^"]*"/g, () => `"author":"${hit()}"`);
  s = s.replace(/\bu\/(?!\[)[\w-]+/g, () => `u/${hit()}`);
  s = s.replace(/\bsaid by (?!\[)[^\s:]+:/g, () => `said by ${hit()}:`);
  s = s.replace(/(^|\s)(?!\[)(\S+) \.\.\. said by\b/g, (_a, sp: string) => `${sp}${hit()} ... said by`);
  // DSLReports' member-status list: "<handle> : online 24w3d ago"
  s = s.replace(/(^|\s)(?!\[)[A-Za-z][\w.-]* : online\b/g, (_a, sp: string) => `${sp}${hit()} : online`);
  return { text: s, masked: n };
}
