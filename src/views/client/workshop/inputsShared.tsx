// INPUTS — shared proposal/area types, helpers and the two panels, MOVED verbatim from InputsTab.tsx
// (Inputs Tier 1 lift, 2026-09-11) so the workspace Inputs page renders the same review panel and
// delete confirm the tab does. InputsTab imports everything back from here; InputsTab.lift.test.tsx
// proves its controls still call the same functions with the same arguments.
import { useState, useEffect, type Dispatch, type SetStateAction } from "react";
import type { FileProposalRow } from "@/hooks/useFileProposals";
import { isInternalFileTag, makeAreaSupportTag } from "@/lib/fileTags";

export const WORKSHOP_TAGS = [
  "Positioning", "Job Map", "Model", "Opportunities", "General",
] as const;
export type WorkshopTag = (typeof WORKSHOP_TAGS)[number];

export type ProcessingStatus = "processed" | "uploading" | "uploaded";

export const LABEL_TINY: React.CSSProperties = {
  fontFamily: "monospace", fontSize: 9, letterSpacing: "0.1em",
  textTransform: "uppercase", color: "#999",
};

export type ProposalAcceptPayload = {
  areas: FoundationArea[];
  selectedCounts: {
    positioningUpdates: number;
    jobSteps: number;
    needs: number;
    outcomes: number;
    gaps: number;
    routes: number;
    experiments: number;
  };
};

export type FoundationArea = "Positioning" | "Job Map" | "Opportunities" | "Model" | "Routes";

export const FOUNDATION_AREAS: FoundationArea[] = [
  "Positioning", "Job Map", "Opportunities", "Model", "Routes",
];

// Reverse map: FoundationArea → __area:* key used by the analyze-file system.
export const FOUNDATION_AREA_TO_AREA_KEY: Record<FoundationArea, string> = {
  Positioning:   "positioning",
  "Job Map":     "jobmap",
  Model:         "strategy",
  Opportunities: "odi",
  Routes:        "routes",
};

// Forward map: __area:* key → FoundationArea (for reading back).
export const AREA_KEY_TO_FOUNDATION: Record<string, FoundationArea> = {
  positioning: "Positioning",
  strategy:    "Model",
  market:      "Opportunities",
  odi:         "Opportunities",
  jobmap:      "Job Map",
  job_map:     "Job Map",
  routes:      "Routes",
  competitive: "Positioning",
  brand:       "Positioning",
};

export function applyAreaTags(existingTags: string[] | null | undefined, newAreas: FoundationArea[]): string[] {
  const stripped = (existingTags ?? []).filter((t) => !isInternalFileTag(t));
  const newAreaTags = newAreas
    .map((area) => makeAreaSupportTag(FOUNDATION_AREA_TO_AREA_KEY[area]))
    .filter(Boolean);
  return [...stripped, ...newAreaTags];
}

export interface SourceRow {
  id:                string;
  type:              "social" | "interview" | "survey" | "file" | "note" | "intake";
  title:             string;
  source:            string;
  date:              string;
  status:            "early signal" | "internal input";
  areas:             FoundationArea[];
  inFoundation:      boolean;
  rawTags?:          string[] | null;
  workshopTag?:      WorkshopTag | null;
  suggestedTag?:     WorkshopTag;
  processingStatus:  ProcessingStatus;
  linkedNeeds:       string[];
  filePath?:         string;
  fileType?:         string;
}

export const isFileBacked = (t: SourceRow["type"]) => t === "file" || t === "intake";

export function areaDisplayLabel(area: FoundationArea): string {
  return area === "Model" ? "Strategy" : area;
}

export function fileProposalProcessingBadgeStyle(proposal: FileProposalRow): React.CSSProperties {
  switch (proposal.processing_state) {
    case "queued":
      return {
        ...MONO,
        fontSize: 8,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        color: "#8b5e00",
        background: "#fff6db",
        border: "1px solid #edd48b",
        borderRadius: 999,
        padding: "2px 6px",
        display: "inline-flex",
        alignItems: "center",
        width: "fit-content",
      };
    case "running":
      return {
        ...MONO,
        fontSize: 8,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        color: "#9a4f00",
        background: "#fff1e2",
        border: "1px solid #efc28f",
        borderRadius: 999,
        padding: "2px 6px",
        display: "inline-flex",
        alignItems: "center",
        width: "fit-content",
      };
    case "failed":
      return {
        ...MONO,
        fontSize: 8,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        color: "#a5281f",
        background: "#fdeceb",
        border: "1px solid #efb6b1",
        borderRadius: 999,
        padding: "2px 6px",
        display: "inline-flex",
        alignItems: "center",
        width: "fit-content",
      };
    case "ready":
    default:
      return {
        ...MONO,
        fontSize: 8,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        color: "#1a8f5a",
        background: "#ebf8f1",
        border: "1px solid #b8d8c8",
        borderRadius: 999,
        padding: "2px 6px",
        display: "inline-flex",
        alignItems: "center",
        width: "fit-content",
      };
  }
}

export function fileProposalProcessingBadgeText(proposal: FileProposalRow): string {
  switch (proposal.processing_state) {
    case "queued":
      return "Analysis queued";
    case "running":
      return "Analyzing";
    case "failed":
      return "Analysis failed";
    case "ready":
    default:
      return "Analysis ready";
  }
}

export function fileProposalReviewCountsText(proposal: FileProposalRow): string {
  const parts: string[] = [];
  const needCount = proposal.candidate_needs.length;
  const routeCount = proposal.possible_routes.length;
  const gapCount = proposal.possible_gaps.length;
  const frameworkCount = proposal.framework_results.reduce((sum, framework) => sum + framework.findings.length, 0);
  const experimentCount = proposal.experiments_to_run.length;

  if (needCount > 0) parts.push(`${needCount} opp${needCount === 1 ? "" : "s"}`);
  if (routeCount > 0) parts.push(`${routeCount} route${routeCount === 1 ? "" : "s"}`);
  if (gapCount > 0) parts.push(`${gapCount} gap${gapCount === 1 ? "" : "s"}`);
  if (frameworkCount > 0) parts.push(`${frameworkCount} finding${frameworkCount === 1 ? "" : "s"}`);
  if (experimentCount > 0) parts.push(`${experimentCount} experiment${experimentCount === 1 ? "" : "s"}`);

  return parts.length > 0 ? ` (${parts.join(", ")})` : "";
}

export function isProposalStale(proposal: FileProposalRow): boolean {
  if (proposal.processing_state !== "queued" && proposal.processing_state !== "running") return false;
  const startedAt = proposal.processing_started_at ?? proposal.created_at;
  const startedMs = Date.parse(startedAt);
  if (!Number.isFinite(startedMs)) return false;
  return Date.now() - startedMs > 10 * 60 * 1000;
}

export function isQueuedPlaceholderSummary(summary: string): boolean {
  const s = summary.trim();
  return s === "Dify analysis queued. Results will appear when processing finishes."
    || s === "Analysis queued. Results will appear when processing finishes.";
}

export function proposalPriority(proposal: FileProposalRow): number {
  if (proposal.processing_state === "ready") return 4;
  if (proposal.processing_state === "failed") return 3;
  if (proposal.processing_state === "running") return 2;
  if (proposal.processing_state === "queued") return 1;
  return 0;
}

export function inferSuggestedAreasFromProposal(proposal: FileProposalRow): FoundationArea[] {
  const areas = new Set<FoundationArea>();
  if (proposal.candidate_positioning_updates.length > 0) areas.add("Positioning");
  if (proposal.candidate_job_steps.length > 0) areas.add("Job Map");
  if (proposal.candidate_needs.length > 0) areas.add("Opportunities");
  if (proposal.candidate_outcomes.length > 0) areas.add("Model");
  if (proposal.possible_routes.length > 0 || proposal.experiments_to_run.length > 0) areas.add("Routes");
  return FOUNDATION_AREAS.filter((area) => areas.has(area));
}

export function proposalProgressPercent(proposal: FileProposalRow): number {
  if (proposal.processing_state === "ready") return 100;
  if (proposal.processing_state === "failed") return 100;
  const startedAt = proposal.processing_started_at ?? proposal.created_at;
  const startedMs = Date.parse(startedAt);
  if (!Number.isFinite(startedMs)) {
    return proposal.processing_state === "queued" ? 8 : 18;
  }
  const elapsedSeconds = Math.max(0, (Date.now() - startedMs) / 1000);
  if (proposal.processing_state === "queued") {
    return Math.min(20, 6 + elapsedSeconds * 0.5);
  }
  return Math.min(92, 18 + elapsedSeconds * 0.45);
}

export const MONO: React.CSSProperties = { fontFamily: "monospace" };

export function DeleteConfirmPanel({
  row,
  deleting,
  onClose,
  onConfirm,
}: {
  row: SourceRow;
  deleting: boolean;
  onClose: () => void;
  onConfirm: (mode: "file-only" | "file-and-unlink") => void;
}) {
  return (
    <div style={{
      background: "#fdf8f7", border: "1px solid #e8cfc7", borderRadius: 4,
      padding: "16px 20px", margin: "2px 0 8px",
    }}>
      <div style={{ ...LABEL_TINY, marginBottom: 10 }}>Remove file</div>
      <p style={{ ...MONO, fontSize: 11, color: "#555", margin: "0 0 8px", lineHeight: 1.5 }}>
        This file is applied in:
      </p>
      <ul style={{ margin: "0 0 12px", padding: "0 0 0 14px" }}>
        {row.areas.map((area) => (
          <li key={area} style={{ ...MONO, fontSize: 11, color: "#444", marginBottom: 3 }}>
            {areaDisplayLabel(area)}
          </li>
        ))}
      </ul>
      <p style={{ ...MONO, fontSize: 10, color: "#888", margin: "0 0 14px" }}>
        What would you like to do?
      </p>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <button
          type="button"
          disabled={deleting}
          onClick={() => onConfirm("file-only")}
          style={{
            ...MONO, fontSize: 10, letterSpacing: "0.05em", textTransform: "uppercase",
            fontWeight: 600, color: deleting ? "#ccc" : "#fff",
            background: deleting ? "#eee" : "#c0392b",
            border: "none", borderRadius: 3, padding: "6px 14px",
            cursor: deleting ? "default" : "pointer",
          }}
        >
          Remove file only
        </button>
        <button
          type="button"
          disabled={deleting}
          onClick={() => onConfirm("file-and-unlink")}
          style={{
            ...MONO, fontSize: 10, letterSpacing: "0.05em", textTransform: "uppercase",
            color: deleting ? "#ccc" : "#c0392b",
            background: "#fdf8f7", border: "1px solid #e8cfc7",
            borderRadius: 3, padding: "6px 14px",
            cursor: deleting ? "default" : "pointer",
          }}
        >
          Remove file and unlink
        </button>
        <button
          type="button"
          onClick={onClose}
          style={{
            ...MONO, fontSize: 10, letterSpacing: "0.04em", textTransform: "uppercase",
            color: "#aaa", background: "none", border: "none", cursor: "pointer",
          }}
        >
          Cancel
        </button>
      </div>
      <p style={{ ...MONO, fontSize: 9, color: "#c8c2ba", margin: "12px 0 0", lineHeight: 1.5 }}>
        Foundation content — needs, routes, positioning, strategy — will not be deleted.
      </p>
    </div>
  );
}

export function ProposalReviewPanel({
  proposal,
  onClose,
  onAccept,
  onDismiss,
  onReject,
  canAccept = true,
}: {
  proposal: FileProposalRow;
  onClose: () => void;
  onAccept: (payload: ProposalAcceptPayload) => void;
  onDismiss: () => void;
  onReject: () => void;
  /** Workspace gate (governance.proposal.apply): false hides the Accept control. The tab passes nothing. */
  canAccept?: boolean;
}) {
  const isProcessing = proposal.processing_state === "queued" || proposal.processing_state === "running";
  const isFailed = proposal.processing_state === "failed";
  const isReady = proposal.processing_state === "ready";
  const showSummary = Boolean(proposal.summary) && !(isProcessing && isQueuedPlaceholderSummary(proposal.summary));
  const initialAreas = inferSuggestedAreasFromProposal(proposal);

  const evidence = proposal.evidence;
  const frameworkResults = proposal.framework_results;
  const positioningUpdates = proposal.candidate_positioning_updates;
  const jobSteps = proposal.candidate_job_steps;
  const needs = proposal.candidate_needs;
  const outcomes = proposal.candidate_outcomes;
  const gaps = proposal.possible_gaps;
  const routes = proposal.possible_routes;
  const experiments = proposal.experiments_to_run;
  const contradictions = proposal.contradictions;
  const questions = proposal.questions_to_verify;

  const [selectedAreas, setSelectedAreas] = useState<Set<FoundationArea>>(() => new Set(initialAreas));
  const [positioningChecked, setPositioningChecked] = useState<Set<number>>(() => new Set(positioningUpdates.map((_, i) => i)));
  const [jobStepChecked, setJobStepChecked] = useState<Set<number>>(() => new Set(jobSteps.map((_, i) => i)));
  const [needChecked, setNeedChecked] = useState<Set<number>>(() => new Set(needs.map((_, i) => i)));
  const [outcomeChecked, setOutcomeChecked] = useState<Set<number>>(() => new Set(outcomes.map((_, i) => i)));
  const [gapChecked, setGapChecked] = useState<Set<number>>(() => new Set());
  const [routeChecked, setRouteChecked] = useState<Set<number>>(() => new Set(routes.map((_, i) => i)));
  const [experimentChecked, setExperimentChecked] = useState<Set<number>>(() => new Set(experiments.map((_, i) => i)));

  useEffect(() => {
    setSelectedAreas(new Set(initialAreas));
    setPositioningChecked(new Set(positioningUpdates.map((_, i) => i)));
    setJobStepChecked(new Set(jobSteps.map((_, i) => i)));
    setNeedChecked(new Set(needs.map((_, i) => i)));
    setOutcomeChecked(new Set(outcomes.map((_, i) => i)));
    setGapChecked(new Set());
    setRouteChecked(new Set(routes.map((_, i) => i)));
    setExperimentChecked(new Set(experiments.map((_, i) => i)));
  }, [proposal.id, proposal.processing_state, positioningUpdates, jobSteps, needs, outcomes, routes, experiments]);

  function toggleArea(area: FoundationArea) {
    setSelectedAreas((prev) => {
      const next = new Set(prev);
      if (next.has(area)) next.delete(area);
      else next.add(area);
      return next;
    });
  }

  function toggleChecked(index: number, setter: Dispatch<SetStateAction<Set<number>>>) {
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  const totalSelected =
    selectedAreas.size +
    positioningChecked.size +
    jobStepChecked.size +
    needChecked.size +
    outcomeChecked.size +
    gapChecked.size +
    routeChecked.size +
    experimentChecked.size;

  function buildPayload(): ProposalAcceptPayload {
    return {
      areas: [...selectedAreas],
      selectedCounts: {
        positioningUpdates: positioningChecked.size,
        jobSteps: jobStepChecked.size,
        needs: needChecked.size,
        outcomes: outcomeChecked.size,
        gaps: gapChecked.size,
        routes: routeChecked.size,
        experiments: experimentChecked.size,
      },
    };
  }

  const confidenceColor =
    proposal.confidence === "high" ? "#1a8f5a"
    : proposal.confidence === "medium" ? "#c97700"
    : "#888";

  const CHECKBOX_STYLE: React.CSSProperties = {
    marginTop: 2,
    cursor: "pointer",
    accentColor: "#2d8a60",
  };

  return (
    <div style={{
      background: "#f5faf7", border: "1px solid #b8d8c8", borderRadius: 4,
      padding: "16px 20px", margin: "2px 0 8px",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
        <div style={{ ...LABEL_TINY }}>Evidence Analysis</div>
        <span style={{ ...MONO, fontSize: 9, color: confidenceColor, letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 700 }}>
          {proposal.confidence} confidence
        </span>
      </div>

      {proposal.signal_type && (
        <p style={{ ...MONO, fontSize: 10, color: "#888", margin: "0 0 8px" }}>
          Detected as: <span style={{ color: "#555" }}>{proposal.signal_type}</span>
        </p>
      )}

      {showSummary && (
        <p style={{ ...MONO, fontSize: 11, color: "#444", margin: "0 0 14px", lineHeight: 1.6 }}>
          {proposal.summary}
        </p>
      )}

      {evidence.length > 0 && (
        <div style={{ marginBottom: 16, borderTop: "1px solid #d4e8dc", paddingTop: 12 }}>
          <div style={{ ...LABEL_TINY, marginBottom: 6 }}>Evidence from file</div>
          <ul style={{ margin: 0, padding: "0 0 0 14px" }}>
            {evidence.map((item, i) => (
              <li key={i} style={{ ...MONO, fontSize: 10, color: "#555", lineHeight: 1.5, marginBottom: 4 }}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      {frameworkResults.length > 0 && (
        <div style={{ marginBottom: 16, borderTop: "1px solid #d4e8dc", paddingTop: 12 }}>
          <div style={{ ...LABEL_TINY, marginBottom: 8 }}>Signal patterns</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {frameworkResults.map((framework, i) => (
              <div key={`${framework.framework}-${i}`}>
                <div style={{ ...MONO, fontSize: 10, color: "#444", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>
                  {framework.framework.replace(/_/g, " ")}
                </div>
                {framework.findings.length > 0 ? (
                  <ul style={{ margin: 0, padding: "0 0 0 14px" }}>
                    {framework.findings.map((finding, idx) => (
                      <li key={idx} style={{ ...MONO, fontSize: 10, color: "#555", lineHeight: 1.5, marginBottom: 4 }}>
                        <span style={{ color: "#333" }}>{finding.claim}</span>
                        {finding.evidence && <span style={{ color: "#888" }}> — {finding.evidence}</span>}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p style={{ ...MONO, fontSize: 10, color: "#999", margin: 0 }}>No findings returned.</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {isProcessing && (
        <div style={{ margin: "0 0 14px" }}>
          <p style={{ ...MONO, fontSize: 10, color: "#888", margin: "0 0 8px", lineHeight: 1.6 }}>
            {proposal.processing_state === "queued"
              ? "Analysis queued. This panel updates automatically."
              : "Analysis running. This panel updates automatically."}
          </p>
          <div style={{ height: 6, borderRadius: 999, background: "#dcebe3", overflow: "hidden" }}>
            <div
              style={{
                height: "100%",
                width: `${proposalProgressPercent(proposal)}%`,
                background: "#2d8a60",
                transition: "width 0.6s ease",
              }}
            />
          </div>
        </div>
      )}

      {isFailed && proposal.processing_error && (
        <p style={{ ...MONO, fontSize: 10, color: "#c0392b", margin: "0 0 14px", lineHeight: 1.6 }}>
          Analysis failed: {proposal.processing_error}
        </p>
      )}

      <div style={{ marginBottom: 16 }}>
        <div style={{ ...LABEL_TINY, marginBottom: 8 }}>Suggested foundation areas</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 18px" }}>
          {FOUNDATION_AREAS.map((area) => {
            const isSuggested = initialAreas.includes(area);
            return (
              <label key={area} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", userSelect: "none", opacity: isSuggested ? 1 : 0.4 }}>
                <input
                  type="checkbox"
                  checked={selectedAreas.has(area)}
                  onChange={() => toggleArea(area)}
                  disabled={!isReady}
                  style={CHECKBOX_STYLE}
                />
                <span style={{ ...MONO, fontSize: 11, color: selectedAreas.has(area) ? "#333" : "#aaa" }}>
                  {areaDisplayLabel(area)}
                </span>
              </label>
            );
          })}
        </div>
      </div>

      {positioningUpdates.length > 0 && (
        <div style={{ marginBottom: 16, borderTop: "1px solid #d4e8dc", paddingTop: 12 }}>
          <div style={{ ...LABEL_TINY, marginBottom: 8 }}>Positioning updates</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {positioningUpdates.map((update, i) => (
              <label key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, cursor: "pointer", userSelect: "none" }}>
                <input
                  type="checkbox"
                  checked={positioningChecked.has(i)}
                  onChange={() => toggleChecked(i, setPositioningChecked)}
                  disabled={!isReady}
                  style={CHECKBOX_STYLE}
                />
                <span style={{ ...MONO, fontSize: 10, color: "#555", lineHeight: 1.5 }}>
                  <span style={{ color: "#333" }}>{update.field}</span>: {update.suggested_update}
                  {update.current_issue && <span style={{ color: "#888" }}> — {update.current_issue}</span>}
                </span>
              </label>
            ))}
          </div>
        </div>
      )}

      {jobSteps.length > 0 && (
        <div style={{ marginBottom: 16, borderTop: "1px solid #d4e8dc", paddingTop: 12 }}>
          <div style={{ ...LABEL_TINY, marginBottom: 8 }}>Job map updates</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {jobSteps.map((step, i) => (
              <label key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, cursor: "pointer", userSelect: "none" }}>
                <input
                  type="checkbox"
                  checked={jobStepChecked.has(i)}
                  onChange={() => toggleChecked(i, setJobStepChecked)}
                  disabled={!isReady}
                  style={CHECKBOX_STYLE}
                />
                <span style={{ ...MONO, fontSize: 10, color: "#555", lineHeight: 1.5 }}>
                  <span style={{ color: "#333" }}>{step.step_label}</span>
                  {step.step_description && <span style={{ color: "#888" }}> — {step.step_description}</span>}
                </span>
              </label>
            ))}
          </div>
        </div>
      )}

      {needs.length > 0 && (
        <div style={{ marginBottom: 16, borderTop: "1px solid #d4e8dc", paddingTop: 12 }}>
          <div style={{ ...LABEL_TINY, marginBottom: 8 }}>Opportunities / needs</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {needs.map((n, i) => (
              <label key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, cursor: "pointer", userSelect: "none" }}>
                <input
                  type="checkbox"
                  checked={needChecked.has(i)}
                  onChange={() => toggleChecked(i, setNeedChecked)}
                  disabled={!isReady}
                  style={CHECKBOX_STYLE}
                />
                <span style={{ ...MONO, fontSize: 10, color: "#444", lineHeight: 1.5 }}>
                  {n.desired_outcome}
                  {typeof n.importance === "number" && <span style={{ color: "#bbb", marginLeft: 6 }}>imp {n.importance}/10</span>}
                </span>
              </label>
            ))}
          </div>
        </div>
      )}

      {outcomes.length > 0 && (
        <div style={{ marginBottom: 16, borderTop: "1px solid #d4e8dc", paddingTop: 12 }}>
          <div style={{ ...LABEL_TINY, marginBottom: 8 }}>Outcomes</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {outcomes.map((outcome, i) => (
              <label key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, cursor: "pointer", userSelect: "none" }}>
                <input
                  type="checkbox"
                  checked={outcomeChecked.has(i)}
                  onChange={() => toggleChecked(i, setOutcomeChecked)}
                  disabled={!isReady}
                  style={CHECKBOX_STYLE}
                />
                <span style={{ ...MONO, fontSize: 10, color: "#555", lineHeight: 1.5 }}>
                  <span style={{ color: "#333" }}>{outcome.outcome}</span>
                  {outcome.related_opportunities.length > 0 && (
                    <span style={{ color: "#888" }}> — linked to {outcome.related_opportunities.join(", ")}</span>
                  )}
                </span>
              </label>
            ))}
          </div>
        </div>
      )}

      {routes.length > 0 && (
        <div style={{ marginBottom: 16, borderTop: "1px solid #d4e8dc", paddingTop: 12 }}>
          <div style={{ ...LABEL_TINY, marginBottom: 8 }}>Routes</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {routes.map((route, i) => (
              <label key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, cursor: "pointer", userSelect: "none" }}>
                <input
                  type="checkbox"
                  checked={routeChecked.has(i)}
                  onChange={() => toggleChecked(i, setRouteChecked)}
                  disabled={!isReady}
                  style={CHECKBOX_STYLE}
                />
                <span style={{ ...MONO, fontSize: 10, color: "#555", lineHeight: 1.5 }}>
                  <span style={{ color: "#333" }}>{route.title}</span>
                  {route.why_this_could_matter && <span style={{ color: "#888" }}> — {route.why_this_could_matter}</span>}
                </span>
              </label>
            ))}
          </div>
        </div>
      )}

      {experiments.length > 0 && (
        <div style={{ marginBottom: 16, borderTop: "1px solid #d4e8dc", paddingTop: 12 }}>
          <div style={{ ...LABEL_TINY, marginBottom: 8 }}>Experiments to run</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {experiments.map((experiment, i) => (
              <label key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, cursor: "pointer", userSelect: "none" }}>
                <input
                  type="checkbox"
                  checked={experimentChecked.has(i)}
                  onChange={() => toggleChecked(i, setExperimentChecked)}
                  disabled={!isReady}
                  style={CHECKBOX_STYLE}
                />
                <span style={{ ...MONO, fontSize: 10, color: "#555", lineHeight: 1.5 }}>
                  <span style={{ color: "#333" }}>{experiment.experiment}</span>
                  {experiment.what_it_tests && <span style={{ color: "#888" }}> — tests {experiment.what_it_tests}</span>}
                </span>
              </label>
            ))}
          </div>
        </div>
      )}

      {gaps.length > 0 && (
        <div style={{ marginBottom: 16, borderTop: "1px solid #d4e8dc", paddingTop: 12 }}>
          <div style={{ ...LABEL_TINY, marginBottom: 8 }}>Gaps</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {gaps.map((gap, i) => (
              <label key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, cursor: "pointer", userSelect: "none" }}>
                <input
                  type="checkbox"
                  checked={gapChecked.has(i)}
                  onChange={() => toggleChecked(i, setGapChecked)}
                  disabled={!isReady}
                  style={CHECKBOX_STYLE}
                />
                <span style={{ ...MONO, fontSize: 10, color: "#555", lineHeight: 1.5 }}>{gap}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {contradictions.length > 0 && (
        <div style={{ marginBottom: 16, borderTop: "1px solid #d4e8dc", paddingTop: 12 }}>
          <div style={{ ...LABEL_TINY, marginBottom: 6 }}>Contradictions</div>
          <ul style={{ margin: 0, padding: "0 0 0 12px" }}>
            {contradictions.map((item, i) => (
              <li key={i} style={{ ...MONO, fontSize: 10, color: "#888", marginBottom: 3, lineHeight: 1.4 }}>
                <span style={{ color: "#555" }}>{item.claim}</span>
                {item.conflicts_with && <span> — conflicts with {item.conflicts_with}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {questions.length > 0 && (
        <div style={{ marginBottom: 16, borderTop: "1px solid #d4e8dc", paddingTop: 12 }}>
          <div style={{ ...LABEL_TINY, marginBottom: 6 }}>Questions to verify</div>
          <ul style={{ margin: 0, padding: "0 0 0 12px" }}>
            {questions.map((q, i) => (
              <li key={i} style={{ ...MONO, fontSize: 10, color: "#888", marginBottom: 3, fontStyle: "italic", lineHeight: 1.4 }}>{q}</li>
            ))}
          </ul>
        </div>
      )}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", borderTop: "1px solid #d4e8dc", paddingTop: 12 }}>
        {canAccept && (
        <button
          type="button"
          disabled={!isReady || totalSelected === 0}
          onClick={() => onAccept(buildPayload())}
          style={{
            ...MONO, fontSize: 10, letterSpacing: "0.05em", textTransform: "uppercase",
            fontWeight: 600,
            color: !isReady || totalSelected === 0 ? "#ccc" : "#fff",
            background: !isReady || totalSelected === 0 ? "#eee" : "#2d8a60",
            border: "none", borderRadius: 3, padding: "6px 14px",
            cursor: !isReady || totalSelected === 0 ? "default" : "pointer",
          }}
        >
          Accept{totalSelected > 0 ? ` ${totalSelected} selected` : ""}
        </button>
        )}
        {isProcessing ? (
          <button
            type="button"
            onClick={onDismiss}
            style={{
              ...MONO, fontSize: 10, letterSpacing: "0.05em", textTransform: "uppercase",
              color: "#c0392b",
              background: "#f5faf7", border: "1px solid #b8d8c8",
              borderRadius: 3, padding: "6px 14px", cursor: "pointer",
            }}
          >
            Dismiss run
          </button>
        ) : (
          <button
            type="button"
            onClick={onReject}
            style={{
              ...MONO, fontSize: 10, letterSpacing: "0.05em", textTransform: "uppercase",
              color: "#c0392b",
              background: "#f5faf7", border: "1px solid #b8d8c8",
              borderRadius: 3, padding: "6px 14px", cursor: "pointer",
            }}
          >
            Reject
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          style={{
            ...MONO, fontSize: 10, letterSpacing: "0.04em", textTransform: "uppercase",
            color: "#aaa", background: "none", border: "none", cursor: "pointer",
          }}
        >
          Cancel
        </button>
      </div>
      <p style={{ ...MONO, fontSize: 9, color: "#c8c2ba", margin: "12px 0 0", lineHeight: 1.5 }}>
        {isReady
          ? "Checked items are accepted for review. Only area tags are applied for now; structured items are not auto-created."
          : isFailed
            ? "This analysis did not complete cleanly. Retry from the file row if needed."
            : "This analysis is still processing. You can dismiss it if it is stuck, or wait for it to finish."}
      </p>
    </div>
  );
}
