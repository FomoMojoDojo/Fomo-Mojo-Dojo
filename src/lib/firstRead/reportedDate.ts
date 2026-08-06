// The source-attribution line — the SINGLE home of the operator-signed string shown under a
// quote-less outside item. Both the screen (OutsideRaisedSection / DeltaItemRow) and the
// leave-behind (exportHtml) call formatSourceAttribution so the composition can never fork.
//
// OPERATOR-SIGNED, byte-exact (host + date variant):
//   "{host} · Reported {Mon YYYY} · read by us {Mon YYYY}"
//   - {host}      = the registrable domain of the backing signal's source_url, via the ONE
//     host helper (sourceHost.ts) — plain text, NEVER a link. No prettified brand names.
//   - first date  = the signal's event_date, formatted month-year (a DAY-precision date
//     also shows month-year — the stored day is never shown; precision column untouched).
//   - second date = the signal's created_at (when we read it), month-year.
//   - separator   = the middle dot · (U+00B7) throughout.
//
// The four honest branches (formatSourceAttribution):
//   host + date  → "{host} · Reported {Mon YYYY} · read by us {Mon YYYY}"
//   host only    → "{host}"                              (source_url present, no event_date)
//   date only    → "Reported {Mon YYYY} · read by us {Mon YYYY}"  (no source_url but dated;
//                    possible in principle — the a986cda string, byte-unchanged)
//   neither      → null                                  (no line renders)
//
// SAME-SIGNAL INVARIANT: the caller resolves host and date from ONE backing signal, so a host
// is never composed beside a date that came from a different signal.

import { sourceHost } from "@/lib/sourceHost";

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** YYYY-MM(-DD…)/ISO-timestamp → "Mon YYYY". TZ-safe: reads the leading YYYY-MM from the
 *  string (never new Date(), which would shift a date across the UTC boundary). "" if unparseable. */
export function formatMonthYear(value: string | null | undefined): string {
  if (typeof value !== "string") return "";
  const m = value.match(/^(\d{4})-(\d{2})/);
  if (!m) return "";
  const [, y, mm] = m;
  const month = MONTHS[Number(mm) - 1];
  if (!month) return "";
  return `${month} ${y}`;
}

/** The signed Reported line, or null when there is no event_date (no line renders). */
export function formatReportedLine(
  eventDate: string | null | undefined,
  capturedAt: string | null | undefined,
): string | null {
  const reported = formatMonthYear(eventDate);
  if (!reported) return null; // no usable event_date → no line
  const read = formatMonthYear(capturedAt);
  return `Reported ${reported} · read by us ${read}`;
}

/**
 * The full source-attribution line: host, host+date, date-only, or null. ONE function owns
 * the composition — screen and export both call it, so the signed string can never fork.
 *
 * `sourceUrl`, `eventDate` and `capturedAt` MUST come from the SAME backing signal (the
 * caller's resolution guarantees this). The host is derived via the single sourceHost helper;
 * an empty/unparseable url yields no host (honest degrade), never an invented one.
 */
export function formatSourceAttribution(
  sourceUrl: string | null | undefined,
  eventDate: string | null | undefined,
  capturedAt: string | null | undefined,
): string | null {
  const host = sourceHost(sourceUrl); // registrable domain or null — never a link
  const reported = formatReportedLine(eventDate, capturedAt); // the a986cda string, or null
  if (host && reported) return `${host} · ${reported}`; // host + date
  if (host) return host; // host only (undated)
  return reported; // date-only (no source_url but dated), or null when neither
}
