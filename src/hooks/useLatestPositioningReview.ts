import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type ReviewFinding = {
  artifact?: string;
  field?: string;
  issue?: string;
  suggestion?: string;
};

type ReviewPayload = {
  pass?: boolean;
  severity?: string;
  summary?: string;
  findings?: ReviewFinding[];
};

type ReviewEntry = {
  key?: string;
  review?: ReviewPayload;
};

type ReviewRunRow = {
  created_at: string;
  reviews_json: unknown;
};

export type LatestPositioningReview = {
  created_at: string | null;
  pass: boolean | null;
  severity: string | null;
  summary: string | null;
  findings_count: number;
} | null;

function parsePositioningReview(row: ReviewRunRow | null): LatestPositioningReview {
  if (!row) return null;

  const entries = Array.isArray(row.reviews_json) ? (row.reviews_json as ReviewEntry[]) : [];
  const positioningEntry = entries.find((entry) => String(entry?.key || "").toLowerCase() === "positioning");
  const review = positioningEntry?.review;
  const findingsCount = Array.isArray(review?.findings) ? review.findings.length : 0;

  return {
    created_at: row.created_at ?? null,
    pass: typeof review?.pass === "boolean" ? review.pass : null,
    severity: typeof review?.severity === "string" ? review.severity : null,
    summary: typeof review?.summary === "string" ? review.summary : null,
    findings_count: findingsCount,
  };
}

function isMissingTableError(message: string) {
  const msg = message.toLowerCase();
  return (
    msg.includes("could not find the table") ||
    msg.includes("schema cache") ||
    msg.includes("research_review_runs")
  );
}

export function useLatestPositioningReview(companyId?: string) {
  const [loading, setLoading] = useState(false);
  const [item, setItem] = useState<LatestPositioningReview>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!companyId) {
      setItem(null);
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);

      const { data, error } = await supabase
        .from("research_review_runs")
        .select("created_at, reviews_json")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (cancelled) return;

      if (error) {
        if (isMissingTableError(error.message || "")) {
          setItem(null);
          setError(null);
        } else {
          setItem(null);
          setError(error.message || "Failed to load positioning review.");
        }
      } else {
        setItem(parsePositioningReview((data as ReviewRunRow | null) ?? null));
      }

      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [companyId]);

  return { loading, item, error };
}
