// GATE S3 (2026-08-20) — deterministic status-conflict detection. PURE. A conflict fires when an
// AUTHORITATIVE source reports a location closed AND another source (any host) frames it as
// operating with an event/read date >= the closure date. Never a verdict — it raises the question.

export const AUTHORITATIVE_STATUS_HOSTS = ["google", "yelp", "apple", "corner.inc", "tripadvisor"];

/** Authoritative status source (Google/Yelp/Apple Maps/Corner/TripAdvisor), by host substring. */
export function isAuthoritativeHost(host: string): boolean {
  const h = (host ?? "").toLowerCase();
  return AUTHORITATIVE_STATUS_HOSTS.some((a) => h === a || h.endsWith("." + a) || h.includes(a)) ||
    /(^|\.)google\.|(^|\.)apple\./.test(h);
}

export type StatusSignal = {
  id: string;
  host: string;
  operatingStatus: string; // 'open' | 'temporarily_closed' | 'permanently_closed' | 'unknown'
  asOf: string | null; // operating_status_as_of (closure date for closed rows)
  date: string | null; // event_date ?? read date (for the operating-recency test)
  quote: string;
  referencesEntity: boolean; // the signal is about THIS location
  operatingFramed: boolean; // present-tense operating language, and not closure-classified
};

export type ConflictResult = {
  fires: boolean;
  closed: StatusSignal[]; // authoritative closed sources
  open: StatusSignal[]; // operating-framed sources at/after the closure
  closureDate: string | null; // earliest authoritative closure
};

const isClosed = (s: string) => s === "temporarily_closed" || s === "permanently_closed";

/**
 * A conflict for one entity's signal set. closureDate = the EARLIEST authoritative closure; an
 * operating mention counts only if it is at/after that date (or undated — a dateless open listing
 * still disputes). Falsification: no authoritative-closed → none; no operating-framed → none.
 */
export function detectConflict(signals: StatusSignal[]): ConflictResult {
  const ent = signals.filter((s) => s.referencesEntity);
  const closedAuth = ent.filter((s) => isClosed(s.operatingStatus) && isAuthoritativeHost(s.host));
  if (closedAuth.length === 0) return { fires: false, closed: [], open: [], closureDate: null };
  const closureDate = closedAuth.map((s) => s.asOf).filter((d): d is string => !!d).sort()[0] ?? null;
  const open = ent.filter((s) =>
    s.operatingFramed && !isClosed(s.operatingStatus) && (!closureDate || !s.date || s.date >= closureDate));
  return { fires: closedAuth.length > 0 && open.length > 0, closed: closedAuth, open, closureDate };
}
