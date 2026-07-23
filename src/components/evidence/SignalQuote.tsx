// CV-2e (tier A) — the render-boundary-safe verbatim quote primitive.
//
// RENDER-BOUNDARY RULE: this component shows the signal's VERBATIM `quote` field or
// NOTHING. It structurally cannot render model claim_text as a quotation — it accepts
// only `quote`. A quote-less signal renders no quote machinery at all (honest absence).
// Every quote carries the "as captured" label so a reader never mistakes a captured
// line for a paraphrase. When the source carried a visible date, it is shown; absence
// of a date is shown without one (never an inferred/"Captured" placeholder).

import type { CSSProperties } from "react";

// ── Client-visible copy — DRAFT PENDING OPERATOR SIGNATURE ("as captured" family) ──
export const AS_CAPTURED_LABEL = "As captured";
// ───────────────────────────────────────────────────────────────────────────────────

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// TZ-safe: format a YYYY-MM-DD date string from its parts (never new Date(), which
// would shift a date-only value across the UTC boundary). Returns "" if not a date.
export function formatEventDate(iso: string | null | undefined): string {
  if (typeof iso !== "string") return "";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return "";
  const [, y, mm, dd] = m;
  const month = MONTHS[Number(mm) - 1];
  if (!month) return "";
  return `${month} ${Number(dd)}, ${y}`;
}

const figureStyle: CSSProperties = {
  margin: "8px 0 0",
  paddingLeft: 12,
  borderLeft: "2px solid rgba(17,17,17,0.18)",
};
const quoteStyle: CSSProperties = {
  margin: 0,
  fontStyle: "italic",
  fontSize: 13.5,
  lineHeight: 1.55,
  color: "#233c4b",
};
const capStyle: CSSProperties = {
  margin: "5px 0 0",
  fontFamily: "ui-monospace, Menlo, monospace",
  fontSize: 9,
  letterSpacing: "0.09em",
  textTransform: "uppercase",
  opacity: 0.55,
};

export default function SignalQuote({
  quote,
  eventDate,
}: {
  quote: string | null | undefined;
  eventDate?: string | null;
}) {
  const q = typeof quote === "string" ? quote.trim() : "";
  if (!q) return null; // render-boundary: no verbatim quote → render NOTHING

  const dateStr = formatEventDate(eventDate);
  return (
    <figure className="cvs-signal-quote" style={figureStyle}>
      <blockquote className="cvs-signal-quote-text" style={quoteStyle}>“{q}”</blockquote>
      <figcaption className="cvs-signal-quote-cap" style={capStyle}>
        {AS_CAPTURED_LABEL}{dateStr ? ` · ${dateStr}` : ""}
      </figcaption>
    </figure>
  );
}
