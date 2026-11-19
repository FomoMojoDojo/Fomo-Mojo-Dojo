// ── SP-406 COUNTING, FROM STORED need_evidence ROWS (SP-429, 2026-11-19) ─────────────────────────
//
// The counting rules live HERE and nowhere else — the merger date, the bar, and the host→site map.
// Before this module they lived in a one-off file generator
// (~/dev/_diagnose-shots/2026-11-19/gen-needs-status-v2.mjs), which is why the brief's hotspots could
// not be produced from the database.
//
// NOTHING HERE IS STORED. need_evidence holds the FACTS — does this quote bear on this need, with
// what polarity, from which brand — and the signal holds the date. Whether a quote COUNTS is derived
// every time, so a recovered date (SP-408) or a changed ruling needs no reload and no backfill, and a
// stored verdict can never drift from the rule that produced it.

/** SP-406: Cox reviews from before this date were written while Cox ran its own service. */
export const COX_MERGER_DATE = "2026-08-20";
/** The bar: 3 counted reviews from 2 sites. */
export const BAR_QUOTES = 3;
export const BAR_SITES = 2;

const SITE_BY_HOST: Record<string, string> = {
  "consumeraffairs.com": "ConsumerAffairs",
  "apps.apple.com": "App Store",
  // Google Play is a DISTINCT site from the App Store — they are two stores with two review pools.
  // Folding them is what made P2 read 6 sites instead of 7 and P6 1 instead of 2.
  "play.google.com": "Google Play",
  "highspeedinternet.com": "HighSpeedInternet.com",
  "bbb.org": "BBB",
  "allconnect.com": "AllConnect",
  "trustpilot.com": "Trustpilot",
};

/** The review site a quote sat on, from its signal's source_url. */
export function siteOf(sourceUrl: string | null | undefined): string {
  let host: string;
  try { host = new URL(String(sourceUrl ?? "")).hostname.replace(/^www\./, ""); } catch { return "unknown"; }
  // every *.pissedconsumer.com brand sub-site is ONE site
  if (host.endsWith("pissedconsumer.com")) return "PissedConsumer";
  return SITE_BY_HOST[host] ?? host;
}

export type EvidenceRow = {
  bears: boolean;
  polarity: string | null;
  brand: string;
  eventDate: string | null;   // signals.event_date, 'YYYY-MM-DD' or null
  sourceUrl: string | null;
};

/** Why a quote is not counted, or null when it is. SP-406: an undated Cox review cannot be placed on
 *  either side of the merger, so it cannot speak to the service as it runs now; a pre-merger Cox
 *  review was written about a different operator. Spectrum was one operator across the window, so an
 *  undated Spectrum review still counts. */
export function uncountedReason(row: Pick<EvidenceRow, "brand" | "eventDate">): "cox_undated" | "cox_pre_merger" | null {
  if (row.brand !== "cox") return null;
  if (row.eventDate == null || row.eventDate === "") return "cox_undated";
  return row.eventDate < COX_MERGER_DATE ? "cox_pre_merger" : null;
}

export function isCounted(row: Pick<EvidenceRow, "brand" | "eventDate">): boolean {
  return uncountedReason(row) === null;
}

export type NeedTally = {
  counted: number;
  sites: string[];
  meets: boolean;
  coxUndated: number;
  coxPreMerger: number;
  byBrandPolarity: Record<string, Record<string, number>>;
};

/** The SP-406 tally for ONE need, from its bearing rows. */
export function tallyNeed(rows: readonly EvidenceRow[]): NeedTally {
  const bearing = rows.filter((r) => r.bears);
  const counted = bearing.filter(isCounted);
  const sites = [...new Set(counted.map((r) => siteOf(r.sourceUrl)))].sort();
  const byBrandPolarity: Record<string, Record<string, number>> = {};
  for (const r of counted) {
    const b = (byBrandPolarity[r.brand] ??= { working: 0, "not working": 0, mixed: 0 });
    if (r.polarity && r.polarity in b) b[r.polarity]++;
  }
  return {
    counted: counted.length,
    sites,
    meets: counted.length >= BAR_QUOTES && sites.length >= BAR_SITES,
    coxUndated: bearing.filter((r) => uncountedReason(r) === "cox_undated").length,
    coxPreMerger: bearing.filter((r) => uncountedReason(r) === "cox_pre_merger").length,
    byBrandPolarity,
  };
}
