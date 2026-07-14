// CV-2c date-badge resolution — pure helpers, story-view layer only.
// Render-only: nothing here is banked to the DB, and nothing may guess a
// source date. Two badge forms exist:
//   AS OF <MMM YYYY>    — only when a genuine source date exists for the
//                         finding's underlying signal (raw_payload.date, or
//                         an evidence_ledger item matched to the same
//                         THIRD-PARTY source URL — the company's own domain
//                         never yields a source date; that would stamp the
//                         homepage-crawl date onto synthesis findings).
//   CAPTURED <MMM YYYY> — capture-time fallback (signal capture time, else
//                         finding creation). Phrased as capture; never
//                         implies the market said it then or that it was
//                         re-verified since. Absolute month-year only.

export type DateBadge = { kind: "as_of" | "captured"; label: string };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Defensive parse of source-date strings seen in the data: "YYYY-MM-DD",
// "YYYY-MM", "YYYY". Anything else (garbled, empty, out-of-range) → null,
// which falls back to CAPTURED — never a guessed date.
export function parseSourceDate(raw: unknown): { year: number; month: number | null } | null {
  if (typeof raw !== "string") return null;
  const m = raw.trim().match(/^(\d{4})(?:-(\d{1,2})(?:-\d{1,2})?)?$/);
  if (!m) return null;
  const year = Number(m[1]);
  if (year < 1990 || year > 2100) return null;
  const month = m[2] ? Number(m[2]) : null;
  if (month !== null && (month < 1 || month > 12)) return null;
  return { year, month };
}

export function formatMonthYear(d: { year: number; month: number | null }): string {
  return d.month === null ? String(d.year) : `${MONTHS[d.month - 1]} ${d.year}`;
}

function formatIsoMonthYear(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = new Date(iso);
  if (isNaN(t.getTime())) return null;
  return `${MONTHS[t.getUTCMonth()]} ${t.getUTCFullYear()}`;
}

// URL normalization for ledger matching: scheme + www + trailing slashes
// stripped, lowercased. Exact-equality match only.
export function normalizeUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const n = url.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/+$/, "");
  return n || null;
}

const AMBIGUOUS = Symbol("ambiguous");

// Build normalized-URL → source-date map from the preferred baseline run's
// evidence_ledger. A URL with more than one distinct date is AMBIGUOUS and
// never matches (fallback, never guess).
export function buildLedgerDateMap(preferredRun: unknown): Map<string, string | typeof AMBIGUOUS> {
  const map = new Map<string, string | typeof AMBIGUOUS>();
  if (!preferredRun || typeof preferredRun !== "object") return map;
  const result = (preferredRun as { result_json?: unknown }).result_json;
  if (!result || typeof result !== "object") return map;
  const ledger = (result as { evidence_ledger?: unknown }).evidence_ledger;
  if (!Array.isArray(ledger)) return map;
  for (const item of ledger) {
    if (!item || typeof item !== "object") continue;
    const url = normalizeUrl((item as { url?: unknown }).url as string);
    const date = (item as { date?: unknown }).date;
    if (!url || typeof date !== "string" || !date.trim()) continue;
    const existing = map.get(url);
    if (existing === undefined) map.set(url, date);
    else if (existing !== date) map.set(url, AMBIGUOUS);
  }
  return map;
}

export function resolveDateBadge(input: {
  // finding's origin-signal fields (null when absent)
  sourceUrl: string | null;
  signalRawDate: string | null; // signals.raw_payload->>'date'
  signalCapturedAt: string | null; // signals.created_at
  findingCreatedAt: string | null; // findings.created_at
  companyDomain: string | null;
  ledgerDates: Map<string, string | typeof AMBIGUOUS>;
}): DateBadge | null {
  const normUrl = normalizeUrl(input.sourceUrl);
  const host = normUrl ? normUrl.split("/")[0] : null;
  const thirdParty = Boolean(host && input.companyDomain && host !== input.companyDomain)
    || Boolean(host && !input.companyDomain);

  // AS OF — genuine source date, third-party sources only.
  if (thirdParty) {
    const own = parseSourceDate(input.signalRawDate);
    if (own) return { kind: "as_of", label: `As of ${formatMonthYear(own)}` };
    const ledger = normUrl ? input.ledgerDates.get(normUrl) : undefined;
    if (typeof ledger === "string") {
      const parsed = parseSourceDate(ledger);
      if (parsed) return { kind: "as_of", label: `As of ${formatMonthYear(parsed)}` };
    }
  }

  // CAPTURED — capture-time fallback: signal capture time (when the source
  // was ingested), else finding creation time (synthesis moment).
  const captured = formatIsoMonthYear(input.signalCapturedAt) ?? formatIsoMonthYear(input.findingCreatedAt);
  return captured ? { kind: "captured", label: `Captured ${captured}` } : null;
}
