import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type SignalBand = "outside" | "organization" | "customer";

type BandStats = {
  count: number;
  strong: number;
  gaps: number;
};

export type SignalLandscape = {
  total: number;
  byBand: {
    outside: BandStats;
    organization: BandStats;
    customer: BandStats;
  };
  dominantBand: SignalBand | null;
  missingBand: SignalBand | null;
  narrative: string;
};

type SignalRow = {
  signal_band: string;
  framing_fit: string;
  directness: string;
};

const BANDS: SignalBand[] = ["outside", "organization", "customer"];

const EMPTY_BAND_STATS = (): BandStats => ({ count: 0, strong: 0, gaps: 0 });

/**
 * Pure computation — exported for unit testing.
 * Accepts raw signal rows and returns a structured SignalLandscape.
 *
 * "strong" = framing_fit is "strong"
 * "gaps"   = directness is "weak" (thinly connected to the question at hand)
 */
export function computeSignalLandscape(signals: SignalRow[]): SignalLandscape {
  const byBand: Record<SignalBand, BandStats> = {
    outside: EMPTY_BAND_STATS(),
    organization: EMPTY_BAND_STATS(),
    customer: EMPTY_BAND_STATS(),
  };

  for (const s of signals) {
    const band = s.signal_band as SignalBand;
    if (!(band in byBand)) continue;
    byBand[band].count++;
    if (s.framing_fit === "strong") byBand[band].strong++;
    if (s.directness === "weak") byBand[band].gaps++;
  }

  const total = signals.length;

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
        b === "outside" ? "public" : b === "organization" ? "organizational" : "customer",
      )
      .join(" and ");
    narrative = `${total} signal${total === 1 ? "" : "s"} from ${bandLabel} sources. Your team's view is mapped but no customer voice is in the picture yet.`;
  } else if (byBand.customer.count < byBand.organization.count) {
    narrative = `${total} signal${total === 1 ? "" : "s"} across all three sources. Customer evidence is starting to come in but still thin compared to what your team knows internally.`;
  } else {
    narrative = `${total} signal${total === 1 ? "" : "s"} across public, organizational, and customer sources. The picture is forming from multiple angles.`;
  }

  return { total, byBand, dominantBand, missingBand, narrative };
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

      const { data, error } = await supabase
        .from("signals")
        .select("signal_band, framing_fit, directness")
        .eq("company_id", companyId)
        .limit(2000);

      if (cancelled) return;

      if (error || !data) {
        setLandscape(null);
        setLoading(false);
        return;
      }

      setLandscape(computeSignalLandscape(data as SignalRow[]));
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [companyId]);

  return { landscape, loading };
}
