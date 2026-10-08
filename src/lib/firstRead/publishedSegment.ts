// ── THE PUBLISHED SEGMENT of a source line (operator ruling 5A, signed 2026-10-08) ──────────────
//
// A commitment's source line reads "head · host · published". This file decides the PUBLISHED part,
// and only that part.
//
// WHY IT IS NOT JUST A DATE FORMAT. 13 of the 18 dated rows in Edgewood's pool carry a January-1
// date — a year-only guess the ingest stamped as a day — and `signals.event_date_precision` reads
// 'day' on every row in the record, including the two that carry no date at all, so the column
// cannot tell a guess from an observation. The date's own SHAPE is the only honest signal left:
//   YYYY-01-01  → the YEAR alone. The year is genuinely known; rendering "January 1, 2023" would
//                 assert a day nobody observed, and rendering "undated" would throw away the year.
//   any other   → the full date.
//   null        → NOTHING. The segment is omitted, never invented and never labelled — the same
//                 discipline filingOrigin already applies when a fiscal year is missing
//                 (InterviewOrigin.tsx: "renders without the trailing segment rather than
//                 inventing a year").
//
// 1a-2 is not built. When it is, a real precision column replaces the shape test here and nothing
// else needs to move.
import { formatFullDate } from "@/views/client/firstReadPreview/deriveSourceTag";

/** The published segment of a source line, or null when there is nothing honest to render. */
export function publishedSegment(eventDate: string | null | undefined): string | null {
  const s = String(eventDate ?? "").trim();
  if (!s) return null;
  const jan1 = /^(\d{4})-01-01(?:$|[T\s])/.exec(s);
  if (jan1) return jan1[1];
  return formatFullDate(s);
}

/** Join the parts of a source line, dropping every absent segment. Never leaves a dangling "·". */
export function sourceLineOf(parts: Array<string | null | undefined>): string {
  return parts.map((p) => (p ?? "").trim()).filter((p) => p.length > 0).join(" · ");
}
