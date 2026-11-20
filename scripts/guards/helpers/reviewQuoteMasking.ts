// ── (r4) THE MASK FIRES ON THE CORPUS THE REVIEW SCREENS SHOW (SP-443, 2026-11-19) ───────────────
//
// `maskReviewerNames` was written for LEAD texts. The review group and the Brief show
// `signals.evidence_excerpt`, a different corpus — and against Charter's judged excerpts NOT ONE of
// the lead-text shapes fires. So "the call is wired" proves nothing on its own: this check runs the
// real mask over the real excerpts the live cards cite and asserts that (a) it still takes names, and
// (b) no byline shape survives it.
//
// The residual detector below is deliberately a SECOND implementation of the FOUR byline shapes. If
// the mask's own regexes are weakened or deleted, the residual check still recognises the lines and
// this goes RED — a check that reused the mask's regexes could not.
//
// Input: one base64-encoded excerpt per line (the guard dumps them with psql, so no newline wrapping
// can split a value). Output: one R4-OK / R4-FAIL line.
import { maskReviewerNames, MASK } from "../../../supabase/functions/_shared/leadText.ts";

const GLUED_BYLINE = /^[A-Z][a-z]+[A-Z][A-Za-z .'’-]*, [A-Z]{2}$/;
const VERIFIED_BYLINE = /^[–-]\s*[A-Z][a-z]+(?: [A-Z]\.)?,\s*Verified User/;
/** A date on a line of its own — the App Store's stacked header. The NEXT line is the handle. */
const DATE_ONLY = /^(?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.? \d{1,2}(?:, \d{4})?|\d{1,2}\/\d{1,2}\/\d{4}|\d{4}\/\d{1,2}\/\d{1,2})$/;
/** Google Play's reviewer avatar — the NEXT non-empty line is the display name. */
const PLAY_AVATAR = /^\[\]\(https:\/\/play-lh\.googleusercontent\.com\//;

// SP-455c: the brand words are the caller's. The guard passes the company's stored values after the
// file path, exactly as the screens pass them, so this check exercises the same decision they make.
const brands = Deno.args.slice(1).filter((a) => !a.startsWith("--"));
const path = Deno.args[0];
if (!path) { console.log("R4-FAIL no excerpt file given"); Deno.exit(0); }

let quotes = 0, masked = 0, withName = 0;
const residual: string[] = [];
for (const b64 of (await Deno.readTextFile(path)).split("\n")) {
  if (!b64.trim()) continue;
  const text = new TextDecoder().decode(Uint8Array.from(atob(b64.trim()), (c) => c.charCodeAt(0)));
  quotes++;
  const r = maskReviewerNames(text, brands);
  if (r.masked > 0) { withName++; masked += r.masked; }
  const out = r.text.split("\n");
  for (let i = 0; i < out.length; i++) {
    const ln = out[i].trim();
    if (ln.startsWith(MASK)) continue;              // already masked, place kept
    if (GLUED_BYLINE.test(ln) || VERIFIED_BYLINE.test(ln)) { residual.push(ln); continue; }
    // a date alone on a line, with the NEXT line holding one unmasked token: the stacked byline
    if (DATE_ONLY.test(ln)) {
      const next = (out[i + 1] ?? "").trim();
      if (next && !next.startsWith(MASK) && !/\s/.test(next)) residual.push(`${ln} / ${next}`);
    }
    // the line after a Google Play avatar link is the reviewer's display name
    if (PLAY_AVATAR.test(ln)) {
      const next = (out.slice(i + 1).find((l) => l.trim()) ?? "").trim();
      if (next && !next.startsWith(MASK)) residual.push(next);
    }
  }
}

// TWO MODES (SP-452). The screens now show `signals.quote`, the verified quote, which holds no byline
// by construction — so "the mask took 0 names" is the RIGHT answer there and a wrong one against the
// fragment corpus the mask was built for. `--expect-names` is the fragment mode; without it the check
// is that nothing name-shaped is on the screen.
const expectNames = Deno.args.includes("--expect-names");
if (quotes === 0) console.log("R4-FAIL the live cards cite no quotes — the corpus this check reads is empty");
else if (residual.length) console.log(`R4-FAIL ${residual.length} byline(s) survived: ${[...new Set(residual)].slice(0, 3).join(" | ")}`);
else if (expectNames && masked === 0) console.log(`R4-FAIL the mask took 0 names from ${quotes} fragment(s) — it is wired but inert`);
else if (expectNames) console.log(`R4-OK the mask took ${masked} reviewer name(s) from ${withName} of ${quotes} stored fragment(s); 0 bylines survived it`);
else console.log(`R4-OK 0 reviewer names visible in ${quotes} shown quote(s) — 0 bylines, and the mask took ${masked} as a second layer`);
