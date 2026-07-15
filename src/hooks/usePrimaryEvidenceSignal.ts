import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type PrimaryEvidenceSignal = {
  hasPrimaryEvidence: boolean;
  primaryCount: number;
  totalOdiNeeds: number;
  sourceLabels: string[];
};

const NON_PRIMARY_MARKERS = [
  "public_research",
  "web",
  "generated",
  "inferred",
  "secondary",
  "desk_research",
];

const PRIMARY_MARKERS = [
  "interview",
  "survey",
  "primary_research",
  "odi_interview",
  "odi_survey",
  "customer_research",
  "voice_of_customer",
];

function normalizePath(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function isPrimarySourcePath(sourcePath: string) {
  const normalized = normalizePath(sourcePath);
  if (!normalized) return false;
  if (NON_PRIMARY_MARKERS.some((marker) => normalized.includes(marker))) return false;
  return PRIMARY_MARKERS.some((marker) => normalized.includes(marker));
}

function isMissingTableError(message: string) {
  const msg = message.toLowerCase();
  return (
    msg.includes("could not find the table") ||
    msg.includes("schema cache") ||
    msg.includes("odi_needs") ||
    msg.includes("odi_market_definitions")
  );
}

export function usePrimaryEvidenceSignal(companyId?: string) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signal, setSignal] = useState<PrimaryEvidenceSignal>({
    hasPrimaryEvidence: false,
    primaryCount: 0,
    totalOdiNeeds: 0,
    sourceLabels: [],
  });

  useEffect(() => {
    if (!companyId) {
      setLoading(false);
      setError(null);
      setSignal({
        hasPrimaryEvidence: false,
        primaryCount: 0,
        totalOdiNeeds: 0,
        sourceLabels: [],
      });
      return;
    }

    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);

      const [needsRes, marketRes] = await Promise.all([
        supabase
          .from("odi_needs")
          .select("source_path")
          .eq("company_id", companyId),
        // MPD-0: constrained to the spine journey — an unfiltered maybeSingle()
        // throws PostgREST multiple-rows on any company with >1 market def
        // (live bug on Edgewood's 2 rows before this guard).
        supabase
          .from("odi_market_definitions")
          .select("source_path")
          .eq("company_id", companyId)
          .eq("journey_key", "customer")
          .maybeSingle(),
      ]);

      if (cancelled) return;

      if (needsRes.error && !isMissingTableError(needsRes.error.message || "")) {
        setError(needsRes.error.message || "Failed to load Strategic Decision System evidence sources.");
        setLoading(false);
        return;
      }

      if (marketRes.error && !isMissingTableError(marketRes.error.message || "")) {
        setError(marketRes.error.message || "Failed to load Strategic Decision System evidence sources.");
        setLoading(false);
        return;
      }

      const needsRows = Array.isArray(needsRes.data) ? needsRes.data : [];
      const needPaths = needsRows.map((row) => normalizePath((row as { source_path?: string | null })?.source_path));
      const primaryNeedPaths = needPaths.filter((path) => isPrimarySourcePath(path));
      const marketPath = normalizePath((marketRes.data as { source_path?: string | null } | null)?.source_path);
      const marketPrimary = isPrimarySourcePath(marketPath);

      const primaryCount = primaryNeedPaths.length + (marketPrimary ? 1 : 0);
      const totalOdiNeeds = needsRows.length;
      const hasPrimaryEvidence =
        primaryNeedPaths.length >= 3 || (primaryNeedPaths.length >= 1 && marketPrimary);

      const sourceLabels = Array.from(
        new Set(
          [...primaryNeedPaths, ...(marketPrimary ? [marketPath] : [])]
            .map((value) => value.replace(/[_-]+/g, " ").trim())
            .filter(Boolean),
        ),
      ).slice(0, 4);

      setSignal({
        hasPrimaryEvidence,
        primaryCount,
        totalOdiNeeds,
        sourceLabels,
      });
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [companyId]);

  return { loading, error, signal };
}
