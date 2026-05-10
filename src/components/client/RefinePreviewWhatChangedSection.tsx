import { useEffect, useMemo, useState } from "react";
import { useStrategicChangeSummary } from "@/hooks/useStrategicChangeSummary";
import { useStrategicHypotheses, type HypothesisProvenanceCard } from "@/hooks/useStrategicHypotheses";
import { buildRefinePreviewMovementItems } from "@/lib/refinePreviewMovement";
import { filterMovementForPhase } from "@/lib/refinePreviewPhaseOrchestration";
import type { RouteRationale } from "@/lib/routeRationale";

export default function RefinePreviewWhatChangedSection({
  companyId,
  phaseLabel,
  rows,
  routeRationales,
  introCopy,
  defaultVisibleCount = 2,
  defaultExpanded = false,
  suppressLowSignal = false,
}: {
  companyId?: string;
  phaseLabel: "Pre-Diagnosis" | "Diagnose" | "Focus" | "Flow";
  rows?: HypothesisProvenanceCard[];
  routeRationales?: RouteRationale[];
  introCopy?: string;
  defaultVisibleCount?: number;
  defaultExpanded?: boolean;
  suppressLowSignal?: boolean;
}) {
  const { data: hypothesisRows = [], isLoading: hypothesesLoading, error: hypothesesError } = useStrategicHypotheses(rows ? undefined : companyId);
  const { data: changeSummary, isLoading: changeLoading, error: changeError } = useStrategicChangeSummary(companyId);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(defaultExpanded);

  useEffect(() => {
    setShowAll(defaultExpanded);
  }, [defaultExpanded, companyId, phaseLabel]);

  const sourceRows = rows ?? hypothesisRows;
  const editorialPhase = phaseLabel === "Pre-Diagnosis" ? "outside_signals" : phaseLabel === "Diagnose" ? "diagnose" : phaseLabel === "Focus" ? "focus" : "flow";

  const movementItems = useMemo(
    () =>
      filterMovementForPhase(buildRefinePreviewMovementItems({
        activeRows: sourceRows.filter((row) => row.hypothesis.is_active),
        allRows: sourceRows,
        phaseLabel,
        changeSummary: changeSummary ?? null,
        routeRationales,
      }), editorialPhase),
    [changeSummary, editorialPhase, phaseLabel, routeRationales, sourceRows],
  );
  const visibleItems = useMemo(
    () => (showAll ? movementItems : movementItems.slice(0, defaultVisibleCount)),
    [defaultVisibleCount, movementItems, showAll],
  );
  const hasMore = movementItems.length > defaultVisibleCount;
  const blockingError = movementItems.length === 0 ? ((hypothesesError || changeError) as Error | null) : null;
  const showLoading = movementItems.length === 0 && (hypothesesLoading || changeLoading);
  if (suppressLowSignal && movementItems.length === 0 && !showLoading && !blockingError) {
    return null;
  }

  return (
    <section className="crpv-movement-section" aria-label="What changed">
      <div className="crpv-movement-header">
        <p className="cap">What changed</p>
        <p className="crpv-movement-copy">{introCopy || "Recent shifts in confidence and evidence."}</p>
      </div>

      {showLoading ? (
        <div className="crpv-movement-empty">Reading how the current view is moving…</div>
      ) : blockingError ? (
        <div className="crpv-movement-empty">{blockingError.message}</div>
      ) : movementItems.length === 0 ? (
        <div className="crpv-movement-empty">
          We have not seen enough movement yet to say the read is shifting. More evidence is needed before confidence can move.
        </div>
      ) : (
        <div className="crpv-movement-list">
          {visibleItems.map((item) => {
            const expanded = expandedId === item.id;
            return (
              <article key={item.id} className={`crpv-movement-card is-${item.tone}`.trim()}>
                <div className="crpv-movement-topline">
                  <span className="crpv-movement-when">{item.when}</span>
                </div>
                <h3>{item.headline}</h3>
                <div className="crpv-movement-body">
                  <p>{item.whyItMatters}</p>
                  <p>{item.confidenceImplication}</p>
                </div>
                {item.evidenceLines.length > 0 ? (
                  <div className="crpv-movement-actions">
                    <button
                      type="button"
                      className="btn ghost"
                      onClick={() => setExpandedId((current) => (current === item.id ? null : item.id))}
                    >
                      {expanded ? "Hide context" : "See why"}
                    </button>
                  </div>
                ) : null}
                {expanded ? (
                  <div className="crpv-movement-detail">
                    <span className="cap">What is behind this</span>
                    <div className="crpv-movement-detail-list">
                      {item.evidenceLines.map((line) => (
                        <div key={line} className="crpv-movement-detail-line">
                          {line}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </article>
            );
          })}
          {hasMore ? (
            <div className="crpv-movement-more">
              <button
                type="button"
                className="btn ghost"
                onClick={() => setShowAll((current) => !current)}
              >
                {showAll ? "Show less" : `Show more (${movementItems.length - defaultVisibleCount})`}
              </button>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
