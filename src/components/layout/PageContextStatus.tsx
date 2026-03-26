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
    <div className={`rounded-md border border-[#e1e6e2] bg-white px-2.5 py-2 ${className ?? ""}`.trim()}>
      <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-[#8c938f]">{label}</span>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function SourceLight({
  label,
  state,
}: {
  label: string;
  state: "on" | "warning" | "off";
}) {
  const dotClassName =
    state === "on"
      ? "bg-[#34d399] border-[#34d399]"
      : state === "warning"
        ? "bg-[#f59e0b] border-[#f59e0b]"
        : "bg-transparent border-white/30";

  return (
    <div className="flex items-center gap-2 py-0.5">
      <span
        className={`h-2 w-2 rounded-full border ${dotClassName}`}
      />
      <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#6b7570]">{label}</span>
    </div>
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
  const sourceRows = [
    { label: "Public", state: publicState },
    { label: "Company", state: sourceSignals.hasCompanyEvidence ? ("on" as const) : ("off" as const) },
    { label: "Primary Evidence", state: sourceSignals.hasPrimaryEvidence ? ("on" as const) : ("off" as const) },
    { label: "Implemented + Tested", state: sourceSignals.hasImplementedTested ? ("on" as const) : ("off" as const) },
  ];
  const confidence = confidenceScore(sourceSignals, confidencePercent, publicEvidenceStatus);

  return (
    <div
      className={`w-full rounded-xl border border-[#d8ddd7] bg-[#fbfcfb] px-2.5 py-2 ${className ?? ""}`.trim()}
    >
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
        <Box label="Updated">
          <span className="font-sans text-[12px] text-[#2f3431]">{formatUpdatedDate(lastScoredAt)}</span>
        </Box>

        <Box label="Evidence">
          <span className="font-sans text-[12px] text-[#2f3431]">{evidenceLabel || evidenceStage(sourceSignals)}</span>
        </Box>

        <Box label="Sources">
          <div className="space-y-0.5">
            {sourceRows.map((row) => (
              <SourceLight key={row.label} label={row.label} state={row.state} />
            ))}
          </div>
        </Box>

        <Box label="Confidence">
          <div className="pt-1">
            <div className="relative h-2.5 w-full overflow-hidden rounded-full border border-[#d7ddd9] bg-[#ecefed]">
              <div
                className="absolute inset-0"
                style={{ background: "linear-gradient(90deg, #d84c42 0%, #f2c649 48%, #34c37a 100%)" }}
              />
              <div
                className="absolute right-0 top-0 h-full bg-[#ecefed]"
                style={{ width: `${Math.max(0, 100 - confidence)}%` }}
              />
            </div>
          </div>
        </Box>
      </div>
    </div>
  );
}
