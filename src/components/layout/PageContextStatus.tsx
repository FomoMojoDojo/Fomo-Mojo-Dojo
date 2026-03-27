import { Building2, CheckCircle2, FlaskConical, Globe, type LucideIcon } from "lucide-react";
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
  if (!lastScoredAt) return "Not scored";
  const parsed = new Date(lastScoredAt);
  if (Number.isNaN(parsed.getTime())) return "Not scored";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(parsed);
}

function evidenceStage(signals: SourceConfidenceSignals) {
  if (signals.hasImplementedTested) return "Implemented + tested";
  if (signals.hasPrimaryEvidence && signals.hasCompanyEvidence) return "Company + primary evidence";
  if (signals.hasCompanyEvidence) return "Company evidence added";
  return "Public baseline only";
}

function confidenceScore(
  signals: SourceConfidenceSignals,
  confidencePercent?: number | null,
  publicEvidenceStatus?: string | null,
) {
  if (
    typeof confidencePercent === "number" &&
    Number.isFinite(confidencePercent) &&
    confidencePercent > 0
  ) {
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

function confidenceLevel(score: number) {
  if (score >= 70) return "High";
  if (score >= 40) return "Moderate";
  return "Low";
}

function Box({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-md border border-[#e1e6e2] bg-white px-2 py-1.5 ${className ?? ""}`.trim()}>
      <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-[#8c938f]">{label}</span>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function SourceIconPill({
  shortLabel,
  state,
  icon: Icon,
}: {
  shortLabel: string;
  state: "on" | "warning" | "off";
  icon: LucideIcon;
}) {
  const className =
    state === "on"
      ? "bg-[#EEF6E7] text-[#2E6B52] border-[#BDD8CF]"
      : state === "warning"
        ? "bg-[#FFF4EC] text-[#915E46] border-[#F1C3AC]"
        : "bg-[#F6F8FA] text-[#9AA8B0] border-[#D9E2E8]";

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 ${className}`}
      title={`${shortLabel} source`}
    >
      <Icon className="h-3 w-3" />
      <span className="font-mono text-[9px] uppercase tracking-[0.08em]">{shortLabel}</span>
    </span>
  );
}

function publicSourceState(
  publicEvidenceStatus: string | null | undefined,
  confidencePercent?: number | null,
) {
  const normalized = String(publicEvidenceStatus || "").trim().toLowerCase();
  if (
    normalized === "baseline_plus_artifacts" ||
    normalized === "public_evidence_strong"
  ) {
    return "on" as const;
  }
  if (
    normalized === "public_evidence_partial" ||
    normalized === "public_evidence_thin" ||
    normalized === "no_public_evidence" ||
    normalized === "generated_no_baseline"
  ) {
    return "warning" as const;
  }
  if (typeof confidencePercent === "number" && Number.isFinite(confidencePercent) && confidencePercent < 60) {
    return "warning" as const;
  }
  return "on" as const;
}

export default function PageContextStatus({
  lastScoredAt,
  sourceSignals,
  evidenceLabel,
  confidencePercent,
  publicEvidenceStatus,
  className,
}: PageContextStatusProps) {
  const publicState = publicSourceState(publicEvidenceStatus, confidencePercent);
  const evidenceSummary = evidenceLabel || evidenceStage(sourceSignals);
  const sourceRows = [
    { shortLabel: "Public", state: publicState, icon: Globe },
    { shortLabel: "Company", state: sourceSignals.hasCompanyEvidence ? ("on" as const) : ("off" as const), icon: Building2 },
    { shortLabel: "Primary", state: sourceSignals.hasPrimaryEvidence ? ("on" as const) : ("off" as const), icon: FlaskConical },
    { shortLabel: "Tested", state: sourceSignals.hasImplementedTested ? ("on" as const) : ("off" as const), icon: CheckCircle2 },
  ];
  const confidence = confidenceScore(sourceSignals, confidencePercent, publicEvidenceStatus);

  return (
    <div
      className={`w-full rounded-xl border border-[#d8ddd7] bg-[#fbfcfb] px-2 py-1.5 ${className ?? ""}`.trim()}
    >
      <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
        <Box label="Updated">
          <span className="font-sans text-[11px] text-[#2f3431]">{formatUpdatedDate(lastScoredAt)}</span>
        </Box>

        <Box label="Sources" className="min-h-[62px]">
          <div className="flex flex-wrap items-center gap-1.5" title={evidenceSummary}>
            {sourceRows.map((row) => (
              <SourceIconPill key={row.shortLabel} shortLabel={row.shortLabel} state={row.state} icon={row.icon} />
            ))}
          </div>
        </Box>

        <Box label="Confidence" className="min-h-[62px]">
          <div className="pt-0.5">
            <div className="mb-1 flex items-center">
              <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-[#6b7570]">
                {confidenceLevel(confidence)} confidence
              </span>
            </div>
            <div className="relative h-2 w-full overflow-hidden rounded-full border border-[#d7ddd9] bg-[#ecefed]">
              <div
                className="absolute inset-0"
                style={{ background: "linear-gradient(90deg, #d84c42 0%, #f2c649 48%, #34c37a 100%)" }}
              />
              <div
                className="absolute right-0 top-0 h-full bg-[#ecefed]"
                style={{ width: `${Math.max(0, 100 - confidence)}%` }}
              />
              <div
                className="absolute top-1/2 h-4 w-[2px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#233c4b]"
                style={{ left: `${Math.max(0, Math.min(100, confidence))}%` }}
                aria-hidden
              />
            </div>
          </div>
        </Box>
      </div>
    </div>
  );
}
