// MO-2 commit 2 — THE single source-host helper.
//
// Five copies of `new URL(url).hostname.replace(/^www\./, "")` had grown across
// useStandingFindings, useSignalLandscape, useStrategicDelta,
// StrategicDirectionDelta and decisionPathAdapter. One rule, one place.
//
// Two callers wanted slightly different things, so both are here rather than
// re-forking: `sourceHost` is the bare host, `sourceHostLower` lowercases it for
// comparison keys. Neither throws — an unparseable or empty url yields null, and
// callers render plain text in that case (honest degrade, never a dead link).

/** Bare display host: "https://www.trustpilot.com/review/x" -> "trustpilot.com". */
export function sourceHost(url: string | null | undefined): string | null {
  const raw = String(url ?? "").trim();
  if (!raw) return null;
  try {
    const normalized = raw.startsWith("http://") || raw.startsWith("https://") ? raw : `https://${raw}`;
    return new URL(normalized).hostname.replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

/** Same, lowercased — for comparison keys (own-domain suppression, dedup). */
export function sourceHostLower(url: string | null | undefined): string {
  return (sourceHost(url) ?? "").toLowerCase();
}

/**
 * The operator-SIGNED label for an outbound source link (MO-2).
 *
 * Exact signed wording: "Source page — opens live; wording captured {date}".
 * The split is load-bearing: the link proves THE PAGE, the date stamps OUR
 * READING of it. Public runs are moment-in-time — the page may have changed or
 * gone since capture, and the label must not imply the live page still says what
 * we recorded.
 *
 * Verifying the exact WORDING is CV-2e's job (verbatim-quote capture), which is
 * its own queued gate. This label deliberately does not claim to do that.
 *
 * No capture date on hand → the bare signed stem, never an invented date.
 */
export function sourceLinkTitle(capturedAt?: string | null): string {
  const raw = String(capturedAt ?? "").trim();
  if (!raw) return "Source page — opens live";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "Source page — opens live";
  const date = d.toISOString().slice(0, 10);
  return `Source page — opens live; wording captured ${date}`;
}
