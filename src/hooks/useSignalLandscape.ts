import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type SignalBand = "outside" | "organization" | "customer";

type BandStats = {
  count: number;
  strong: number;
  gaps: number;
};

// Signal-basis recount (operator-signed definition, 2026-06-11): the client-facing
// "public" number is INDEPENDENT OUTSIDE VOICE ONLY — voice_class =
// outside_voice_about_client, non-syndicated, deduplicated by content identity
// (URL + normalized text, the system's standing unit of evidence). The old number
// counted the client's own words, competitor statements, and duplicate copies as
// evidence about the client. The breakdown shows the whole public picture honestly;
// the sum reconciles to the raw outside total — nothing silently dropped.
export type PublicBreakdown = {
  independent: number;        // the headline: ovac, non-syndicated, deduped
  ownVoice: number;           // client_voice rows collected from public scans
  competitorsMarket: number;  // competitor_voice + market_context
  syndicatedExcluded: number; // ovac stamped syndicated_from_client = true
  duplicatesMerged: number;   // ovac non-syndicated rows beyond their first content identity
  rawOutsideTotal: number;    // = sum of the five above, always
};

export type SignalLandscape = {
  total: number;
  byBand: {
    outside: BandStats;
    organization: BandStats;
    customer: BandStats;
  };
  publicBreakdown: PublicBreakdown;
  dominantBand: SignalBand | null;
  missingBand: SignalBand | null;
  narrative: string;
};

type SignalRow = {
  signal_band: string;
  framing_fit: string;
  directness: string;
  voice_class?: string | null;
  syndicated_from_client?: boolean | null;
  source_url?: string | null;
  claim_text?: string | null;
  evidence_excerpt?: string | null;
  raw_payload?: { bucket?: string; source_type?: string } | null;
};

const BANDS: SignalBand[] = ["outside", "organization", "customer"];

const EMPTY_BAND_STATS = (): BandStats => ({ count: 0, strong: 0, gaps: 0 });

function normalizedWords(text: string): string {
  return String(text || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean)
    .join(" ");
}

function urlHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function isCompanySource(row: SignalRow, companyHost: string): boolean {
  const host = urlHost(String(row.source_url || ""));
  return (
    (!!host && !!companyHost && (host === companyHost || host.endsWith(`.${companyHost}`))) ||
    String(row.raw_payload?.source_type || "") === "profile_or_company_page" ||
    String(row.raw_payload?.bucket || "") === "company_claim"
  );
}

// Deterministic mirror of the edge judges' classifyVoice fallback for NULL legacy
// rows (documented accepted residual; see _shared/claimProvenance.ts). No LLM, no
// stamping — read-only classification at render time. Unstamped rows count as
// independent until a judge pass stamps them (lazy-stamping philosophy).
function classifyOutsideRow(
  row: SignalRow,
  companyHost: string,
): "client_voice" | "outside_voice_about_client" | "competitor_voice" | "market_context" {
  // The deterministic company-source guard overrides any label, mirroring the judges.
  if (isCompanySource(row, companyHost)) return "client_voice";
  const labeled = String(row.voice_class || "").trim();
  if (labeled === "client_voice" || labeled === "competitor_voice" || labeled === "market_context" || labeled === "outside_voice_about_client") {
    return labeled as "client_voice" | "outside_voice_about_client" | "competitor_voice" | "market_context";
  }
  return "outside_voice_about_client";
}

/**
 * Pure computation — exported for unit testing.
 *
 * "strong" = framing_fit is "strong"; "gaps" = directness is "weak". For the outside
 * band these are computed over the INDEPENDENT deduped set (first occurrence of each
 * content identity wins), so the quality stats describe the same evidence the count does.
 *
 * No recency window: the chip describes the accumulated evidence base. The judges'
 * supplement window governs admission to JUDGMENTS, not the inventory description.
 */
export function computeSignalLandscape(signals: SignalRow[], companyHost = ""): SignalLandscape {
  const byBand: Record<SignalBand, BandStats> = {
    outside: EMPTY_BAND_STATS(),
    organization: EMPTY_BAND_STATS(),
    customer: EMPTY_BAND_STATS(),
  };
  const breakdown: PublicBreakdown = {
    independent: 0,
    ownVoice: 0,
    competitorsMarket: 0,
    syndicatedExcluded: 0,
    duplicatesMerged: 0,
    rawOutsideTotal: 0,
  };

  const seenIdentities = new Set<string>();

  for (const s of signals) {
    const band = s.signal_band as SignalBand;
    if (!(band in byBand)) continue;

    if (band !== "outside") {
      byBand[band].count++;
      if (s.framing_fit === "strong") byBand[band].strong++;
      if (s.directness === "weak") byBand[band].gaps++;
      continue;
    }

    breakdown.rawOutsideTotal++;
    const voiceClass = classifyOutsideRow(s, companyHost);
    if (voiceClass === "client_voice") {
      breakdown.ownVoice++;
      continue;
    }
    if (voiceClass === "competitor_voice" || voiceClass === "market_context") {
      breakdown.competitorsMarket++;
      continue;
    }
    // outside_voice_about_client
    if (s.syndicated_from_client === true) {
      breakdown.syndicatedExcluded++;
      continue;
    }
    const identity = `${String(s.source_url || "").trim()}::${normalizedWords(String(s.claim_text || s.evidence_excerpt || ""))}`;
    if (seenIdentities.has(identity)) {
      breakdown.duplicatesMerged++;
      continue;
    }
    seenIdentities.add(identity);
    breakdown.independent++;
    byBand.outside.count++;
    if (s.framing_fit === "strong") byBand.outside.strong++;
    if (s.directness === "weak") byBand.outside.gaps++;
  }

  const total = byBand.outside.count + byBand.organization.count + byBand.customer.count;

  const dominantBand = BANDS.reduce<SignalBand | null>((max, b) => {
    if (max === null) return b;
    return byBand[b].count > byBand[max].count ? b : max;
  }, null);

  let missingBand: SignalBand | null = null;
  if (byBand.customer.count === 0) {
    missingBand = "customer";
  } else {
    missingBand = BANDS.reduce<SignalBand | null>((min, b) => {
      if (min === null) return b;
      return byBand[b].count < byBand[min].count ? b : min;
    }, null);
  }

  const presentBands = BANDS.filter((b) => byBand[b].count > 0);

  let narrative: string;
  if (total === 0) {
    narrative = "No signals collected yet. Add evidence to start building the picture.";
  } else if (byBand.customer.count === 0) {
    const bandLabel = presentBands
      .map((b) =>
        b === "outside" ? "independent public" : b === "organization" ? "organizational" : "customer",
      )
      .join(" and ");
    narrative = `${total} signal${total === 1 ? "" : "s"} from ${bandLabel} sources. Your team's view is mapped but no customer voice is in the picture yet.`;
  } else if (byBand.customer.count < byBand.organization.count) {
    narrative = `${total} signal${total === 1 ? "" : "s"} across all three sources. Customer evidence is starting to come in but still thin compared to what your team knows internally.`;
  } else {
    narrative = `${total} signal${total === 1 ? "" : "s"} across public, organizational, and customer sources. The picture is forming from multiple angles.`;
  }

  return { total, byBand, publicBreakdown: breakdown, dominantBand, missingBand, narrative };
}

export function useSignalLandscape(companyId: string | undefined) {
  const [landscape, setLandscape] = useState<SignalLandscape | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!companyId) {
      setLandscape(null);
      setLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      setLoading(true);

      // Read-only on both queries — no stamping, no writes, ever, from a render path.
      const [{ data: companyRow }, { data, error }] = await Promise.all([
        supabase.from("companies").select("website").eq("id", companyId).maybeSingle(),
        supabase
          .from("signals")
          .select("signal_band, framing_fit, directness, voice_class, syndicated_from_client, source_url, claim_text, evidence_excerpt, raw_payload")
          .eq("company_id", companyId)
          .eq("relevance_state", "active")
          .limit(2000),
      ]);

      if (cancelled) return;

      if (error || !data) {
        setLandscape(null);
        setLoading(false);
        return;
      }

      const companyHost = urlHost(String((companyRow as { website?: string } | null)?.website || ""));
      setLandscape(computeSignalLandscape(data as SignalRow[], companyHost));
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [companyId]);

  return { landscape, loading };
}
