import type { SourceConfidenceSignals } from "@/lib/sourceConfidence";

interface PageContextStatusProps {
  lastScoredAt?: string | null;
  sourceSignals: SourceConfidenceSignals;
  evidenceLabel?: string;
  confidencePercent?: number | null;
  publicEvidenceStatus?: string | null;
  className?: string;
}

function formatUpdatedDate(lastScoredAt?: string | null) {
  if (!lastScoredAt) return null;
  const parsed = new Date(lastScoredAt);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(parsed);
}

function confidenceScore(
  signals: SourceConfidenceSignals,
  confidencePercent?: number | null,
  publicEvidenceStatus?: string | null,
) {
  // >= 0: a genuine 0 (e.g. all claims at outside_view) renders as "0% · low".
  // null/undefined/non-finite falls through to the signal-based fallback below.
  if (typeof confidencePercent === "number" && Number.isFinite(confidencePercent) && confidencePercent >= 0) {
    return Math.max(0, Math.min(100, Math.round(confidencePercent)));
  }
  let fallback = 0;
  if (signals.hasImplementedTested) fallback = 88;
  else if (signals.hasPrimaryEvidence && signals.hasCompanyEvidence) fallback = 68;
  else if (signals.hasCompanyEvidence) fallback = 38;

  const normalized = String(publicEvidenceStatus || "").trim().toLowerCase();
  if (normalized === "generated_no_baseline") return Math.min(fallback, 55);
  if (normalized === "no_public_evidence") return Math.min(fallback, 45);
  if (normalized === "public_evidence_thin") return Math.min(fallback, 60);
  if (normalized === "public_evidence_partial") return Math.min(fallback, 72);

  return fallback;
}

function confidenceLabel(score: number) {
  if (score >= 70) return "high";
  if (score >= 40) return "moderate";
  return "low";
}

function publicSourceState(
  publicEvidenceStatus: string | null | undefined,
  confidencePercent?: number | null,
): "on" | "warning" | "off" {
  const normalized = String(publicEvidenceStatus || "").trim().toLowerCase();
  if (
    normalized === "baseline_plus_artifacts" ||
    normalized === "public_evidence_strong"
  ) {
    return "on";
  }
  if (
    normalized === "public_evidence_partial" ||
    normalized === "public_evidence_thin" ||
    normalized === "no_public_evidence" ||
    normalized === "generated_no_baseline"
  ) {
    return "warning";
  }
  if (typeof confidencePercent === "number" && Number.isFinite(confidencePercent) && confidencePercent < 60) {
    return "warning";
  }
  return "on";
}

export default function PageContextStatus({
  lastScoredAt,
  sourceSignals,
  confidencePercent,
  publicEvidenceStatus,
  className,
}: PageContextStatusProps) {
  const pubState = publicSourceState(publicEvidenceStatus, confidencePercent);
  const confidence = confidenceScore(sourceSignals, confidencePercent, publicEvidenceStatus);
  const dateStr = formatUpdatedDate(lastScoredAt);

  const parts: string[] = [];
  if (dateStr) parts.push(`Updated ${dateStr}`);
  parts.push(
    pubState === "on" ? "Outside active" :
    pubState === "warning" ? "Outside partial" :
    "Outside —",
  );
  parts.push(sourceSignals.hasCompanyEvidence ? "Org active" : "Org incomplete");
  parts.push(sourceSignals.hasPrimaryEvidence ? "Customer active" : "Customer incomplete");
  if (sourceSignals.hasImplementedTested) parts.push("Testing active");
  if (confidence > 0) parts.push(`${confidence}% · ${confidenceLabel(confidence)}`);

  return (
    <div className={`mb-2 ${className ?? ""}`.trim()}>
      <p
        style={{
          fontFamily: "monospace",
          fontSize: 9,
          color: "#9298B5",
          letterSpacing: "0.07em",
          lineHeight: 1,
          opacity: 0.52,
        }}
      >
        {parts.join(" · ")}
      </p>
    </div>
  );
}
