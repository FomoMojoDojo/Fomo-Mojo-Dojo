// ── A QUOTE, AS A REVIEW SURFACE SHOWS IT (SP-443, corrected by SP-452, 2026-11-19) ───────────────
//
// THE TEXT IS `public.signals.quote`, AND NOTHING ELSE.
//
// The review lane stores two different things about one review (`_shared/reviewHostLane.ts:14-16`):
//   `evidence_excerpt`  the PAGE FRAGMENT as captured — markdown image links, "more_vert",
//                       "Flag inappropriate", the byline, a stray "DT";
//   `quote`             "the whole sentence(s) containing it, sliced VERBATIM from that page text"
//                       (written at `reviewHostLane.ts:364`).
// `quote` is the verified quote, and it is what charter-needs-status-v2.md prints: measured
// 2026-11-19, 64 of the 64 distinct quotes the five live cards cite appear in that file verbatim as
// `quote`, against 29 of 64 as `evidence_excerpt`. The first build of these screens showed the
// fragment and so showed the page furniture and two reviewer names. It reads `quote` now, and the
// fragment is NOT a fallback: where no verified quote was stored the surface shows the quote's
// source line and no text, because there is no verified text to show.
//
// MASKING STAYS AS A SECOND LAYER (SP-452). `maskReviewerNames` runs on the quote even though a
// verified quote holds no byline by construction — the guard proves the layer is still live against
// the fragment corpus it was built for, and this call is what keeps a stray name off the screen if
// the lane's slicing ever changes.
//
// A QUOTE IS SHOWN IN FULL OR WITH A VISIBLE ELLIPSIS, NEVER SILENTLY CUT (SP-443). Clipping is
// after masking, so a clip can never reveal a name the mask would have taken.
import { maskReviewerNames } from "../../supabase/functions/_shared/leadText.ts";
import { siteOf } from "./needEvidenceCounting";

/** Clip length for one quote. Charter's longest stored quote is 805 characters, so nothing on these
 *  screens clips today; the rule exists for the quote that one day runs longer. */
export const QUOTE_MAX_CHARS = 1200;
export const QUOTE_ELLIPSIS = "…";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** The date as the First Read writes one — `formatDate` (views/client/diagnoseFlow/useDiagnoseData.ts:373)
 *  renders "November 12, 2026" and the mono meta line upper-cases it. Formatted from the Y-M-D parts
 *  rather than through `new Date(iso).toLocaleDateString`, because a date-only value parses as UTC
 *  midnight and would print the day before in any negative-offset timezone. */
export function formatQuoteDate(iso: string | null | undefined): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? "").trim());
  if (!m) return null;
  const month = MONTHS[Number(m[2]) - 1];
  if (!month) return null;
  return `${month} ${Number(m[3])}, ${m[1]}`;
}

/** A quote's stored row: the VERIFIED quote, its page, its date, and the brand need_evidence recorded. */
export type QuoteRow = {
  signalId: string;
  /** public.signals.quote — the verified quote. NEVER evidence_excerpt. */
  quote: string | null;
  brand: string;
  sourceUrl: string | null;
  /** signals.event_date as 'YYYY-MM-DD', or null when the page showed none. */
  eventDate: string | null;
};

export type DisplayQuote = {
  signalId: string;
  /** Masked, then clipped. null when no verified quote was stored for this signal. */
  text: string | null;
  clipped: boolean;
  /** How many reviewer names the mask took. */
  masked: number;
  brand: string;
  site: string;
  /** "November 12, 2026", or null when the page showed no date. */
  date: string | null;
};

export function displayQuote(row: QuoteRow): DisplayQuote {
  const raw = typeof row.quote === "string" ? row.quote.trim() : "";
  const masked = maskReviewerNames(raw);
  const full = masked.text.trim();
  const clipped = full.length > QUOTE_MAX_CHARS;
  return {
    signalId: row.signalId,
    text: full === "" ? null : clipped ? `${full.slice(0, QUOTE_MAX_CHARS).trimEnd()}${QUOTE_ELLIPSIS}` : full,
    clipped,
    masked: masked.masked,
    // The brand is DATA — the value need_evidence recorded, rendered as stored. The meta line is mono
    // and upper-cased, so "spectrum" reads SPECTRUM; a brand that was never recorded reads as the
    // stored `brand_not_recorded` rather than as prose nobody signed. Writing "Spectrum" here would
    // also put a client's brand name in the main.tsx module graph as a literal (U6-64).
    brand: row.brand,
    site: siteOf(row.sourceUrl),
    date: formatQuoteDate(row.eventDate),
  };
}

export function displayQuotes(rows: readonly QuoteRow[]): DisplayQuote[] {
  return rows.map(displayQuote);
}

/** How many of a shown set carried a reviewer name the mask took. */
export function maskedCount(quotes: readonly DisplayQuote[]): number {
  return quotes.reduce((n, q) => n + q.masked, 0);
}
