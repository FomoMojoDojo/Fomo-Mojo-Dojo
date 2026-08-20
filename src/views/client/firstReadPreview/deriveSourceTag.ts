// First Read (8-beat) — source-tag derivation, per the source-honesty ruling
// (2026-08-20): source tags state the real source and real time, derived from
// the persisted record. No fixed copy, ever. If no source is derivable the tag
// is hidden (null) — never a placeholder, never "unknown".
//
// Pure and I/O-free so every branch is testable. The data hook resolves the
// persisted lookups (run dates, canvas dates, ref'd upload signals) and passes
// them in; this module only classifies and formats.

export type SourceTagResult = { label: string; href?: string } | null;

/** An outside/public signal row ("The record", "The gap" record side, cold open). */
export type PublicSignalSource = {
  kind: "public_signal";
  sourceUrl: string | null;
  sourceTitle: string | null;
  /** public_baseline_runs.created_at resolved via signals.source_id, or null. */
  runDate: string | null;
  eventDate: string | null;
};

/** A declared claim row (Act 1 "What you say you are"). */
export type DeclaredClaimSource = {
  kind: "declared_claim";
  /** claims.raw_payload — the birth record. */
  rawPayload: unknown;
  /** First uploaded_file signal referenced via claim_signal_refs, if any. */
  refUpload: { fileName: string | null; date: string | null } | null;
  /** positioning_canvases.updated_at for the payload's source_canvas_id, if resolved. */
  canvasUpdatedAt: string | null;
  /** intake_responses submission date, if the claim descends from one. */
  intakeSubmittedAt: string | null;
  /** claims.created_at — the mint instant (used when the doc basis has no own date). */
  claimCreatedAt: string | null;
};

export type SourceTagInput = PublicSignalSource | DeclaredClaimSource;

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** "2026-07-24[T…]" → "July 24, 2026". Null/invalid → null (date omitted). */
export function formatFullDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  const monthIndex = Number(m[2]) - 1;
  if (monthIndex < 0 || monthIndex > 11) return null;
  const day = Number(m[3]);
  if (day < 1 || day > 31) return null;
  return `${MONTHS[monthIndex]} ${day}, ${m[1]}`;
}

/** "https://www.x.com/a/b/?q=1" → "x.com/a/b". Unparseable → null. */
export function trimmedPage(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl.includes("://") ? rawUrl : `https://${rawUrl}`);
    const host = url.hostname.replace(/^www\./, "");
    if (!host) return null;
    const path = url.pathname.replace(/\/+$/, "");
    return path && path !== "/" ? `${host}${path}` : host;
  } catch {
    return null;
  }
}

/**
 * The stored-title patterns that carry no checkable information — the exact
 * defect this ruling removes. These never render; a row with only such a
 * title has no derivable source and hides its tag.
 */
function isUninformativeTitle(title: string): boolean {
  const t = title.trim();
  return /public baseline$/i.test(t) || /^public research$/i.test(t);
}

/** First document filename cited in a birth-record string, or null. */
const DOC_NAME_RE = /([\w&()'’\-. ]+\.(?:pdf|docx?|pptx?|xlsx?|md|txt|csv|rtf))/i;

function docNameFromPayload(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  for (const key of ["basis", "source", "source_file", "file_name"]) {
    const v = p[key];
    if (typeof v !== "string") continue;
    const m = DOC_NAME_RE.exec(v);
    if (m) return m[1].trim();
  }
  return null;
}

function payloadCanvasId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const v = (payload as Record<string, unknown>).source_canvas_id;
  return typeof v === "string" && v ? v : null;
}

function payloadCitesIntake(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false;
  const v = (payload as Record<string, unknown>).source;
  return typeof v === "string" && /intake/i.test(v);
}

function withDate(label: string, iso: string | null): string {
  const d = formatFullDate(iso);
  return d ? `${label} · ${d}` : label;
}

export function deriveSourceTag(row: SourceTagInput): SourceTagResult {
  if (row.kind === "public_signal") {
    if (row.sourceUrl) {
      const page = trimmedPage(row.sourceUrl);
      if (page) {
        const date = formatFullDate(row.runDate ?? row.eventDate);
        return { label: date ? `${page} · read ${date}` : page, href: row.sourceUrl };
      }
    }
    const title = (row.sourceTitle ?? "").trim();
    if (!title || isUninformativeTitle(title)) return null;
    return { label: title };
  }

  // Declared claim — resolve through the birth record, in structural order.
  // A claim with zero signal refs is NOT defaulted: its raw_payload/basis
  // decides (this closes the no-ref bypass).
  if (row.refUpload?.fileName) {
    return { label: withDate(row.refUpload.fileName, row.refUpload.date) };
  }
  const docName = docNameFromPayload(row.rawPayload);
  if (docName) {
    return { label: withDate(docName, row.claimCreatedAt) };
  }
  if (payloadCanvasId(row.rawPayload)) {
    return { label: withDate("Declared direction canvas", row.canvasUpdatedAt) };
  }
  if (row.intakeSubmittedAt || payloadCitesIntake(row.rawPayload)) {
    return { label: withDate("Intake response", row.intakeSubmittedAt) };
  }
  return null;
}
