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

//   filing (C2, signed 2026-09-17) → the company's own words arriving through a REGISTRY (a publicly_declared claim):
//                          "In your filing · {host} · {fiscal year}"   when raw_payload.registry page_type = filing_data
//                          "In your profile · {host} · {date}"         when the section is self_reported (date = the
//                          snapshot read date, same UTC formatter). Expand shows the statement's excerpt attributed to
//                          the host. No value band, no verdict word. The fiscal year comes from the classifier basis
//                          when it carries one; without it the filing frame renders without the trailing segment
//                          rather than inventing a year.

export type InterviewOrigin = {
  kind: "client_attested" | "market_interviewed" | "filing";
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

// ── C2: the registry-declared frame (publicly_declared claims) ────────────────────────────────────
export const FILING_FRAME_HEAD = "In your filing" as const;
export const PROFILE_FRAME_HEAD = "In your profile" as const;

export type RegistryFilingOriginView = {
  origin?: string | null;
  host?: string | null;
  page_type?: string | null;
  section?: string | null;
  fiscal_year?: string | null;
  snapshot_read_at?: string | null;
};

/** Read the registry origin off a claim's raw_payload (written at mint by evidenceMappers.registryFilingOrigin). */
export function registryOriginOf(rawPayload: unknown): RegistryFilingOriginView | null {
  const rp = rawPayload && typeof rawPayload === "object" ? (rawPayload as Record<string, unknown>) : null;
  if (!rp || rp.origin !== "registry_filing") return null;
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  return { origin: "registry_filing", host: str(rp.host), page_type: str(rp.page_type), section: str(rp.section), fiscal_year: str(rp.fiscal_year), snapshot_read_at: str(rp.snapshot_read_at) };
}

/** The frame for a publicly_declared claim; null for any other provenance (the caller renders what it rendered before). */
export function filingOrigin(
  claim: { provenance?: string | null; raw_payload?: unknown; statement?: string | null } | null | undefined,
): InterviewOrigin | null {
  if (claim?.provenance !== "publicly_declared") return null;
  const o = registryOriginOf(claim.raw_payload) ?? {};
  const host = o.host ?? "";
  const withHost = (head: string) => (host ? `${head} · ${host}` : head);
  const chip = o.page_type === "filing_data"
    ? (o.fiscal_year ? `${withHost(FILING_FRAME_HEAD)} · ${o.fiscal_year}` : withHost(FILING_FRAME_HEAD))
    : (() => { const d = formatInterviewDate(o.snapshot_read_at); return d ? `${withHost(PROFILE_FRAME_HEAD)} · ${d}` : withHost(PROFILE_FRAME_HEAD); })();
  return { kind: "filing", chip, attribution: host, verbatim: String(claim.statement ?? "").trim() };
}

// ── Act 1 (signed 2026-10-08): the client-attested frame, for a CLAIM ───────────────────────────
//
// interviewOrigin() above frames a NEED (an OdiNeedRow with its interview_records join). A claim is
// the other shape, and filingOrigin() already covers the registry-declared claim. attestedOrigin is
// its sibling for the client_attested claim a correction mints.
//
// NO NEW STRING. The chip is the signed "You told us · {person_name} · {date}" — the same head and
// the same UTC short-date formatter interviewOrigin uses for its client_attested branch. The only
// difference is where the name and date come from: a claim carries them on raw_payload (written at
// mint by record-interview-correction), not on a joined record.
export type AttestedOriginView = {
  origin?: string | null;
  person_name?: string | null;
  /** R-A2: the item's speaker, used for the name ONLY when the record has no person_name. */
  speaker_label?: string | null;
  attested_at?: string | null;
  item_raw_words?: string | null;
};

/** Read the attested origin off a claim's raw_payload (written at mint by record-interview-correction). */
export function attestedOriginOf(rawPayload: unknown): AttestedOriginView | null {
  const rp = rawPayload && typeof rawPayload === "object" ? (rawPayload as Record<string, unknown>) : null;
  if (!rp || rp.origin !== "interview_correction") return null;
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  return {
    origin: "interview_correction",
    person_name: str(rp.person_name),
    speaker_label: str(rp.speaker_label),
    attested_at: str(rp.attested_at),
    item_raw_words: str(rp.item_raw_words),
  };
}

/** The frame for a client_attested claim; null for any other provenance (the caller renders what it
 *  rendered before). The expand shows the CLIENT'S OWN WORDS from the item, attributed to the person
 *  — the operator's wording is the statement itself and is rendered by the caller.
 *
 *  R-A2 (operator ruling, 2026-10-12) fixes where the two halves come from:
 *
 *    NAME — the record's person_name, else the ITEM's speaker_label. A meeting record has several
 *    speakers, so person_name is often unset on a kickoff; the item knows who actually said the
 *    words. Neither present ⇒ the bare head, as before.
 *
 *    DATE — the record's interviewed_at and NOTHING ELSE. Never parsed_at: when the transcript was
 *    machine-read is not when the client said it, and a chip that implied otherwise would attribute
 *    a date the client never spoke on. interviewed_at unset ⇒ render the name with NO date rather
 *    than substituting a date we do not have.
 */
export function attestedOrigin(
  claim: { provenance?: string | null; raw_payload?: unknown; statement?: string | null } | null | undefined,
): InterviewOrigin | null {
  if (claim?.provenance !== "client_attested") return null;
  const o = attestedOriginOf(claim.raw_payload) ?? {};
  const name = (o.person_name ?? "") || (o.speaker_label ?? "");
  const date = formatInterviewDate(o.attested_at);
  const head = name ? `You told us · ${name}` : "You told us";
  return {
    kind: "client_attested",
    chip: date ? `${head} · ${date}` : head,
    attribution: name,
    verbatim: (o.item_raw_words ?? String(claim.statement ?? "")).trim(),
  };
}

export function AttestedOriginChip({ claim }: { claim: { provenance?: string | null; raw_payload?: unknown; statement?: string | null } }) {
  const origin = attestedOrigin(claim);
  if (!origin) return null;
  return (
    <details className="fr-ws-origin" data-fr-origin={origin.kind} data-testid="claim-origin">
      <summary className="fr-ws-origin-chip fr-mono" data-testid="claim-origin-chip">{origin.chip}</summary>
      {origin.verbatim ? (
        <blockquote className="fr-ws-origin-quote" data-testid="claim-origin-quote">
          <p>{origin.verbatim}</p>
          {origin.attribution ? <cite className="fr-mono">{origin.attribution}</cite> : null}
        </blockquote>
      ) : null}
    </details>
  );
}

export function FilingOriginChip({ claim }: { claim: { provenance?: string | null; raw_payload?: unknown; statement?: string | null } }) {
  const origin = filingOrigin(claim);
  if (!origin) return null;
  return (
    <details className="fr-ws-origin" data-fr-origin={origin.kind} data-testid="claim-origin">
      <summary className="fr-ws-origin-chip fr-mono" data-testid="claim-origin-chip">{origin.chip}</summary>
      {origin.verbatim ? (
        <blockquote className="fr-ws-origin-quote" data-testid="claim-origin-quote">
          <p>{origin.verbatim}</p>
          {origin.attribution ? <cite className="fr-mono">{origin.attribution}</cite> : null}
        </blockquote>
      ) : null}
    </details>
  );
}
