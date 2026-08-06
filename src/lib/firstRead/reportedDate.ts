// The "Reported" line — the SINGLE home of the operator-signed date string for date-only
// (quote-less) outside items. Both the screen (OutsideRaisedSection / DeltaItemRow) and the
// leave-behind (exportHtml) call formatReportedLine so the string can never fork.
//
// OPERATOR-SIGNED, byte-exact: "Reported {Mon YYYY} · read by us {Mon YYYY}"
//   - first date  = the signal's event_date, formatted month-year (a DAY-precision date
//     also shows month-year — the stored day is never shown; precision column untouched).
//   - second date = the signal's created_at (when we read it), month-year.
//   - separator   = the middle dot · (U+00B7).
//   - no event_date → formatReportedLine returns null → NO line renders.

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
