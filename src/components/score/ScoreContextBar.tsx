import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import { type EvidenceBand, BAND_LABELS } from "@/lib/evidenceBands";

export interface ScoreContextBarProps {
  currentScore: number;
  reachableScore: number;
  unlockableScore: number;
  routesCount: number;
  confidenceLabel: string;
  evidenceBand?: EvidenceBand;
  ceilingReason?: string | null;
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
  if (l.includes("strong"))                    return "market_validated";
  if (l.includes("building") || l === "high" || l.includes("medium") || l.includes("moderate")) return "customer_evidenced";
  return "directional_not_validated";
}

// Shorten posture labels ("Strong readiness" → "STRONG") for the confidence chip
function abbreviatePostureLabel(label: string): string {
  const l = label.toLowerCase();
  if (l.includes("strong"))       return "STRONG";
  if (l.includes("building"))     return "BUILDING";
  if (l.includes("directional"))  return "DIRECTIONAL";
  if (l.includes("fragile"))      return "FRAGILE";
  if (l.includes("insufficient")) return "INSUFFICIENT";
  return label.toUpperCase();
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
        "Track results against what each route was intended to achieve.",
      ];
    case "proven_path":
      return [
        "Record and maintain results against each route's intended purpose.",
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
        Potential readiness unlocked if the deeper constraints are resolved.
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
  ceilingReason,
}: ScoreContextBarProps) {
  const scoreDelta = Math.max(0, reachableScore - currentScore);
  const band: EvidenceBand = evidenceBand ?? confidenceToBand(confidenceLabel);

  return (
    <TooltipProvider delayDuration={120}>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div className="crpv-r-stat-bar">
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="crpv-r-stat" tabIndex={0}>
                <span className="crpv-r-stat-val">{currentScore || "—"}</span>
                <span className="crpv-r-stat-lbl">Current</span>
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="crpv-stat-tooltip">
              Confidence-adjusted readiness to commit to this strategic direction right now.
            </TooltipContent>
          </Tooltip>

          <span className="crpv-r-stat-arrow">→</span>

          <Tooltip>
            <TooltipTrigger asChild>
              <div className="crpv-r-stat" tabIndex={0}>
                <span className="crpv-r-stat-val">{reachableScore || "—"}</span>
                <span className="crpv-r-stat-lbl">Reachable now</span>
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="crpv-stat-tooltip">
              What becomes reachable if the top active blocker or unlock path resolves.
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <div className="crpv-r-stat crpv-r-stat--dim" tabIndex={0}>
                <span className="crpv-r-stat-val crpv-r-stat-delta">+{scoreDelta}</span>
                <span className="crpv-r-stat-lbl">Delta</span>
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="crpv-stat-tooltip">
              Near-term gain available — reachable now minus current readiness.
            </TooltipContent>
          </Tooltip>

          {unlockableScore > reachableScore && (
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
              <div className="crpv-r-stat crpv-r-stat--dim" tabIndex={0}>
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
                <span className="crpv-r-stat-val">{abbreviatePostureLabel(confidenceLabel)}</span>
                <span className="crpv-r-stat-lbl">Readiness</span>
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="crpv-stat-tooltip">
              {confidenceLabel} — anatomy-derived posture based on evidence environment and strategic signals.
            </TooltipContent>
          </Tooltip>
        </div>

        {ceilingReason && (
          <div
            className="crpv-r-stat-bar"
            style={{ borderTop: "none", paddingTop: 4, paddingBottom: 6, gap: 6, fontSize: 10, color: "#b06a3c", opacity: 0.85 }}
          >
            <span style={{ flexShrink: 0 }}>⌧</span>
            <span>Structural upside constrained — {ceilingReason.replace(/\.$/, "").toLowerCase()}.</span>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
