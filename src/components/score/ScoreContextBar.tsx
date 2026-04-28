import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import { type EvidenceBand, BAND_LABELS } from "@/lib/evidenceBands";

export interface ScoreContextBarProps {
  currentScore: number;
  reachableScore: number;
  unlockableScore: number;
  routesCount: number;
  confidenceLabel: string;
  evidenceBand?: EvidenceBand;
}

// ─── Local helpers ────────────────────────────────────────────────────────────

const BAND_ORDER: EvidenceBand[] = [
  "hypothesis_only",
  "directional_not_validated",
  "customer_evidenced",
  "market_validated",
  "proven_path",
  "sustained_performance",
];

function nextBandLabel(band: EvidenceBand): string | null {
  const idx = BAND_ORDER.indexOf(band);
  const next = idx >= 0 && idx < BAND_ORDER.length - 1 ? BAND_ORDER[idx + 1] : null;
  return next ? BAND_LABELS[next] : null;
}

function confidenceToBand(label: string): EvidenceBand {
  const l = label.toLowerCase();
  if (l === "high" || l === "strong") return "market_validated";
  if (l === "medium" || l === "moderate") return "customer_evidenced";
  if (l === "low") return "directional_not_validated";
  return "directional_not_validated";
}

function bandUnlockActions(band: EvidenceBand): string[] {
  switch (band) {
    case "hypothesis_only":
      return [
        "Add evidence items that confirm demand for this capability.",
        "Link routes to customer-validated needs.",
        "Run a research baseline to establish outside signals.",
      ];
    case "directional_not_validated":
      return [
        "Validate critical assumptions with customer research.",
        "Link routes to customer-validated needs.",
        "Add supporting evidence with confirmed or in-progress status.",
      ];
    case "customer_evidenced":
      return [
        "Add market comparison or competitive signals.",
        "Resolve flagged evidence gaps to reach Market-Validated.",
        "Confirm unproven critical conditions in each route.",
      ];
    case "market_validated":
      return [
        "Complete route steps to build implementation confidence.",
        "Track outcomes against intended impact.",
      ];
    case "proven_path":
      return [
        "Record and maintain outcomes against each route's intended impact.",
      ];
    default:
      return ["Continue closing evidence gaps to strengthen confidence."];
  }
}

// ─── Unlockable tooltip content ───────────────────────────────────────────────

function UnlockableTooltipBody({
  band,
}: {
  band: EvidenceBand;
}) {
  const next = nextBandLabel(band);
  const actions = bandUnlockActions(band);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
        <span style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.1em", opacity: 0.55 }}>
          Evidence band
        </span>
        <span style={{ fontSize: 10, fontWeight: 600, textAlign: "right" }}>
          {BAND_LABELS[band]}
        </span>
      </div>

      <p style={{ margin: 0 }}>
        Unlockable shows what becomes possible if the missing evidence is validated.
      </p>

      {actions.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.1em", opacity: 0.55 }}>
            {next ? `To reach ${next}` : "To strengthen confidence"}
          </span>
          {actions.map((action, i) => (
            <div key={i} style={{ display: "flex", gap: 6 }}>
              <span style={{ flexShrink: 0, opacity: 0.55 }}>·</span>
              <span>{action}</span>
            </div>
          ))}
        </div>
      )}

      <p style={{ margin: 0, opacity: 0.65, fontStyle: "italic" }}>
        To unlock the next band, prove the conditions that matter most.
      </p>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ScoreContextBar({
  currentScore,
  reachableScore,
  unlockableScore,
  routesCount,
  confidenceLabel,
  evidenceBand,
}: ScoreContextBarProps) {
  const scoreDelta = Math.max(0, reachableScore - currentScore);
  const band: EvidenceBand = evidenceBand ?? confidenceToBand(confidenceLabel);

  return (
    <TooltipProvider delayDuration={120}>
      <div className="crpv-r-stat-bar">
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="crpv-r-stat" tabIndex={0}>
              <span className="crpv-r-stat-val">{currentScore || "—"}</span>
              <span className="crpv-r-stat-lbl">Current</span>
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="crpv-stat-tooltip">
            Where you stand today based on current evidence, alignment, and readiness.
          </TooltipContent>
        </Tooltip>

        <span className="crpv-r-stat-arrow">→</span>

        <Tooltip>
          <TooltipTrigger asChild>
            <div className="crpv-r-stat" tabIndex={0}>
              <span className="crpv-r-stat-val">{reachableScore || "—"}</span>
              <span className="crpv-r-stat-lbl">Reachable</span>
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="crpv-stat-tooltip">
            How far you can improve within the current evidence level by fixing known gaps.
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <div className="crpv-r-stat" tabIndex={0}>
              <span className="crpv-r-stat-val crpv-r-stat-delta">+{scoreDelta}</span>
              <span className="crpv-r-stat-lbl">Delta</span>
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="crpv-stat-tooltip">
            The improvement available without needing new validation.
          </TooltipContent>
        </Tooltip>

        {unlockableScore > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="crpv-r-stat crpv-r-stat-unlockable" tabIndex={0}>
                <span className="crpv-r-stat-val">{unlockableScore}</span>
                <span className="crpv-r-stat-lbl">Unlockable</span>
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="crpv-stat-tooltip" style={{ maxWidth: 280 }}>
              <UnlockableTooltipBody band={band} />
            </TooltipContent>
          </Tooltip>
        )}

        <div className="crpv-r-stat-sep" />

        <Tooltip>
          <TooltipTrigger asChild>
            <div className="crpv-r-stat" tabIndex={0}>
              <span className="crpv-r-stat-val">{routesCount}</span>
              <span className="crpv-r-stat-lbl">Routes</span>
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="crpv-stat-tooltip">
            The number of possible paths currently identified.
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <div className="crpv-r-stat" tabIndex={0}>
              <span className="crpv-r-stat-val">{confidenceLabel.toUpperCase()}</span>
              <span className="crpv-r-stat-lbl">Confidence</span>
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="crpv-stat-tooltip">
            How strongly the current recommendation is supported by evidence.
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}
