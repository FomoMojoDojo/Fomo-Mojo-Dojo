// First Read (8-beat) — pure mapping functions, per operator rulings R2/R4/R5.
// Kept pure and separate so the rulings are testable without I/O.

import type { FRGapVerdict, SignalStrength } from "./types";

/**
 * R4 (signed): strong = recurrence-confirmed across independent sources;
 * moderate = single-source medium confidence; thin = low confidence.
 * Unruled edge (single-source HIGH confidence) fails toward the weaker
 * bucket (moderate), consistent with R4's structure.
 */
export function strengthForSignal(
  confidence: string | null | undefined,
  recurrenceConfirmed: boolean,
): SignalStrength {
  if (recurrenceConfirmed) return "strong";
  if ((confidence ?? "").toLowerCase() === "low") return "thin";
  return "moderate";
}

/**
 * R5 (signed): echoed→CONFIRMED, divergent→CONTRADICTED,
 * internally_silent→UNSPOKEN. publicly_silent stays OFF this surface (null).
 */
export function verdictForDeltaType(deltaType: string): FRGapVerdict | null {
  switch (deltaType) {
    case "echoed":
      return "confirmed";
    case "divergent":
      return "contradicted";
    case "internally_silent":
      return "unspoken";
    default:
      return null;
  }
}

/**
 * R2: element grouping only where the declared topic maps trivially;
 * everything else stays ungrouped. Never hand-map ambiguous topics.
 */
export function facetForTopic(topic: string | null | undefined): "Market" | "Positioning" | null {
  const t = (topic ?? "").trim().toLowerCase();
  if (t === "market") return "Market";
  if (t === "positioning") return "Positioning";
  return null;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** "2026-03-14" → "March 2026". Null/invalid → null (MOST RECENT omitted). */
export function formatMonthYear(isoDate: string | null | undefined): string | null {
  if (!isoDate) return null;
  const m = /^(\d{4})-(\d{2})/.exec(isoDate);
  if (!m) return null;
  const monthIndex = Number(m[2]) - 1;
  if (monthIndex < 0 || monthIndex > 11) return null;
  return `${MONTHS[monthIndex]} ${m[1]}`;
}

/** Bare host for the header identity line ("https://x.com/a" → "x.com"). */
export function bareHost(website: string | null | undefined): string | null {
  if (!website) return null;
  try {
    const url = new URL(website.includes("://") ? website : `https://${website}`);
    return url.hostname.replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}
