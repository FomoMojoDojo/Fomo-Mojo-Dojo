// Interview origin frame (gate 3, operator rulings 2026-09-16) — the ONE way an interview-sourced need
// is framed on the workspace surfaces (Job Map, Opportunities; Market renders no rows).
//
//   client_attested     → "You told us · {person_name} · {date}"      data-fr-origin="client_attested"
//   market_interviewed  → "{Market label} told us · {date}"           data-fr-origin="market_interviewed"
//                          Market label = market_lens.title for the ROW's journey_key → the key
//                          no person name anywhere in the DOM
//   both                → no value band, anywhere (rows, High counts/filters, the Opportunities selected panel)
//   anything else       → null: the caller renders exactly what it rendered before.
//
// The chip is the summary of a wordless <details>: opening it shows the record's verbatim as the
// quotation it is, attributed to the person (stakeholder) or the market label (market participant).
// The two chip strings are the only client-visible strings here (signed 2026-09-16); the date is
// short month + day, formatted in UTC so an interview date never shifts by timezone.
import type { OdiNeedRow } from "@/hooks/useOdiNeeds";

export type InterviewOrigin = {
  kind: "client_attested" | "market_interviewed";
  chip: string;
  /** Who the quote is attributed to: the person (stakeholder) or the market label (market participant). */
  attribution: string;
  /** The record's own immutable words. */
  verbatim: string;
};

/** The market chip's label for a row: market_lens.title for the row's journey_key, else the key — never the step title (gate 3 delta, ruling 3). */
export function marketChipLabel(journeyKey: string | null | undefined, lensTitles: ReadonlyMap<string, string> | null | undefined): string {
  const key = String(journeyKey ?? "").trim();
  return (key && lensTitles?.get(key)?.trim()) || key;
}

export function formatInterviewDate(iso: string | null | undefined): string {
  const d = new Date(String(iso ?? ""));
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

/** True when the row carries a value band. An interview-sourced finding — stakeholder or market — never does (it is evidence, not a verdict or a value; gate 3 delta, ruling 2). */
export function needShowsBand(need: Pick<OdiNeedRow, "provenance_type"> | null | undefined): boolean {
  const p = need?.provenance_type;
  return p !== "market_interviewed" && p !== "client_attested";
}

export function interviewOrigin(
  need: Pick<OdiNeedRow, "provenance_type" | "interview_records"> | null | undefined,
  marketLabel: string | null | undefined,
): InterviewOrigin | null {
  const p = need?.provenance_type;
  if (p !== "client_attested" && p !== "market_interviewed") return null;
  const rec = need?.interview_records ?? null;
  const date = formatInterviewDate(rec?.interviewed_at);
  const withDate = (head: string) => (date ? `${head} · ${date}` : head);
  const verbatim = String(rec?.verbatim ?? "").trim();
  if (p === "client_attested") {
    const name = String(rec?.person_name ?? "").trim();
    return { kind: p, chip: withDate(name ? `You told us · ${name}` : "You told us"), attribution: name, verbatim };
  }
  const label = String(marketLabel ?? "").trim();
  return { kind: p, chip: withDate(`${label} told us`), attribution: label, verbatim };
}

export function InterviewOriginChip({ need, marketLabel }: { need: OdiNeedRow; marketLabel: string | null | undefined }) {
  const origin = interviewOrigin(need, marketLabel);
  if (!origin) return null;
  const quote = origin.verbatim;
  return (
    <details className="fr-ws-origin" data-fr-origin={origin.kind} data-testid="need-origin">
      <summary className="fr-ws-origin-chip fr-mono" data-testid="need-origin-chip">{origin.chip}</summary>
      {quote ? (
        <blockquote className="fr-ws-origin-quote" data-testid="need-origin-quote">
          <p>{quote}</p>
          {origin.attribution ? <cite className="fr-mono">{origin.attribution}</cite> : null}
        </blockquote>
      ) : null}
    </details>
  );
}
