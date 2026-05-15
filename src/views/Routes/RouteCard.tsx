import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Circle } from "lucide-react";
import type { RouteRow } from "./useRoutes";
import { alignmentLevelFromFocus, type FocusClassification } from "@/lib/initiativeFocus";
import AlignmentCircle from "@/components/ui/AlignmentCircle";
import type { StrategicTension } from "@/lib/tensionTypes";
import ClaimStateBadge from "@/components/claims/ClaimStateBadge";
import type { ClaimState } from "@/lib/claimState";

const c = {
  line: "#DDE6D1",
  paper: "#F7FBF8",
  paperRaised: "#FFFFFF",
  lineFaint: "#EEF3E9",
  charcoal: "#233C4B",
  secondary: "#46606D",
  muted: "#6E847F",
  coral: "#FF7D2D",
  amber: "#FAC846",
  teal: "#5F9B8C",
};

const COMMITMENT_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  commit:   { label: "Holding",           color: "#5F9B8C" },
  scale:    { label: "Holding",           color: "#5F9B8C" },
  validate: { label: "Validating",        color: "#FAC846" },
  explore:  { label: "Not yet warranted", color: "#9298B5" },
  pause:    { label: "Fragile",           color: "#FF7D2D" },
  unwind:   { label: "Remains blocked",   color: "#c44233" },
};

type DetailStep = {
  id: string;
  title: string;
  status: "complete" | "in_progress" | "missing";
};

type DetailEvidence = {
  id: string;
  title: string;
  status: "complete" | "in_progress" | "missing";
};

function effortColor(effort: string | null | undefined) {
  const key = String(effort || "").toLowerCase();
  if (key === "low") return c.teal;
  if (key === "high") return c.coral;
  return c.amber;
}

export type { DetailStep, DetailEvidence };

export default function RouteCard({
  route,
  accent,
  steps,
  evidence,
  whyThisMatters,
  frameworks,
  linkedDesiredOutcome,
  focus,
  onInspect,
  isSelected = false,
  isOtherSelected = false,
  onSelect,
  commitmentState,
  sequencingNarrative,
  commitmentRationale,
  routeTensions = [],
  claimId,
  claimState,
}: {
  route: RouteRow;
  accent: string;
  steps: DetailStep[];
  evidence: DetailEvidence[];
  whyThisMatters: string[];
  frameworks: string[];
  linkedDesiredOutcome?: {
    statement: string;
    leadingIndicator: string;
  } | null;
  focus?: FocusClassification;
  onInspect?: () => void;
  isSelected?: boolean;
  isOtherSelected?: boolean;
  onSelect?: () => void;
  commitmentState?: string;
  sequencingNarrative?: string | null;
  commitmentRationale?: string | null;
  routeTensions?: StrategicTension[];
  parentDecisionLabel?: string | null;
  isParentDestabilizing?: boolean;
  claimId?: string | null;
  claimState?: ClaimState | null;
}) {
  // TEMP DIAGNOSTIC — remove after badge confirmed visible
  console.warn("[RouteCard]", route?.title ?? "unknown", {
    claimId: route?.claim_id,
    claimState: claimState,
  });

  const [expanded, setExpanded] = useState(false);
  const completedSteps = useMemo(
    () => steps.filter((step) => step.status === "complete").length,
    [steps],
  );
  const totalSteps = steps.length;
  const points = typeof route.pts_value === "number" ? Math.round(route.pts_value) : null;
  const effort = String(route.effort || "medium");
  const effortCol = effortColor(route.effort);
  const alignmentLevel = alignmentLevelFromFocus(focus);
  const commitmentStatus = commitmentState ? (COMMITMENT_STATUS_LABELS[commitmentState] ?? null) : null;
  const missingCount = evidence.filter((e) => e.status === "missing").length;
  const hasBlocker = routeTensions.some((t) => t.isCommitmentBlocker);
  const isCommitted = commitmentState === "commit" || commitmentState === "scale";
  const contentOpacity =
    commitmentState === "commit" || commitmentState === "scale" ? 1.0 :
    commitmentState === "validate" ? 0.96 :
    commitmentState === "explore"  ? 0.91 :
    commitmentState === "pause"    ? 0.85 :
    commitmentState === "unwind"   ? 0.80 : 1.0;

  return (
    <div
      className="overflow-hidden"
      style={{
        borderLeft: isSelected ? `3px solid ${c.teal}` : `1px solid transparent`,
        borderBottom: `1px solid ${c.lineFaint}`,
        paddingLeft: isSelected ? 1 : 3,
        background: "transparent",
        opacity: isOtherSelected ? (isCommitted ? 0.65 : 0.35) : 1,
        transition: "opacity 0.2s, border-color 0.15s",
      }}
    >
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="w-full cursor-pointer px-4 pt-4 pb-3 text-left"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-sans text-[16px] font-semibold leading-tight" style={{ color: c.charcoal }}>
                {route.title || "Untitled route"}
              </h3>
              {isSelected && (
                <span
                  className="font-mono text-[9px] uppercase tracking-[0.12em]"
                  style={{ color: c.teal }}
                >
                  Chosen path
                </span>
              )}
              {commitmentStatus && !isSelected && (
                <span
                  className="font-mono text-[9px] uppercase tracking-[0.1em]"
                  style={{ color: commitmentStatus.color }}
                >
                  {commitmentStatus.label}
                </span>
              )}
            </div>
            {parentDecisionLabel && (
              <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.1em]" style={{ color: isParentDestabilizing ? "#c44233" : c.muted, opacity: 0.75 }}>
                {isParentDestabilizing ? "⊗ " : "· "}{parentDecisionLabel}
              </p>
            )}
            <p className="mt-2 font-sans text-[13px] leading-[1.5]" style={{ color: c.secondary }}>
              {route.short_description || "No route description yet."}
            </p>
            {linkedDesiredOutcome?.statement && (
              <p className="mt-1.5 font-sans text-[12px] leading-[1.45]" style={{ color: c.muted }}>
                {linkedDesiredOutcome.statement}
              </p>
            )}
            {!expanded && whyThisMatters.length > 0 && (
              <p className="mt-2 font-sans text-[12px] leading-[1.5]" style={{ color: c.secondary, fontStyle: "italic" }}>
                <span style={{ color: accent, fontStyle: "normal", marginRight: 5 }}>·</span>
                {whyThisMatters[0]}
              </p>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-3">
              {claimId && claimState && (
                <ClaimStateBadge state={claimState} claimId={claimId} size="sm" />
              )}
              <span className="font-mono text-[11px] font-semibold" style={{ color: accent }}>
                {points !== null ? `+${points} pts` : "+0 pts"}
              </span>
              <AlignmentCircle
                level={alignmentLevel}
                title={`Goal alignment ${alignmentLevel * 25}%`}
              />
              <span
                className="font-mono text-[10px] uppercase tracking-[0.08em]"
                style={{ color: effortCol }}
              >
                {effort}
              </span>
              <div className="ml-auto flex items-center gap-2">
                {missingCount > 0 && (
                  <span className="font-mono text-[9px] uppercase tracking-[0.07em]" style={{ color: c.muted, opacity: 0.6 }}>
                    {commitmentState === "pause" || commitmentState === "unwind"
                      ? "still unresolved"
                      : commitmentState === "commit" || commitmentState === "scale"
                        ? "gaps remain"
                        : "unresolved"}
                  </span>
                )}
                {hasBlocker && (
                  <span className="font-mono text-[9px]" style={{ color: c.coral, opacity: 0.5 }}>⊗</span>
                )}
                <span className="font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: c.muted }}>
                  {completedSteps}/{totalSteps} steps
                </span>
              </div>
            </div>
          </div>

          <div className="mt-0.5 shrink-0" style={{ color: c.muted, opacity: 0.5 }}>
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </div>
        </div>
      </button>

      {expanded ? (
        <div className="px-4 pb-4 pt-0" style={{ borderTop: `1px solid ${c.lineFaint}`, background: "transparent", opacity: contentOpacity }}>
          <div className="pt-3" style={{ opacity: 0.9 }}>
            <p className="font-mono text-[9.5px] uppercase tracking-[0.10em]" style={{ color: c.muted, opacity: 0.65 }}>
              Steps
            </p>
            <div className="mt-1.5 space-y-1.5">
              {steps.map((step) => (
                <div key={step.id} className="flex items-start gap-2">
                  <Circle
                    className="mt-[2px] h-3 w-3 shrink-0"
                    style={{
                      color:
                        step.status === "complete"
                          ? c.teal
                          : step.status === "in_progress"
                            ? c.amber
                            : c.muted,
                      fill: step.status === "complete" ? c.teal : "transparent",
                    }}
                  />
                  <span
                    className="font-sans text-[11.5px] leading-[1.5]"
                    style={{
                      color: step.status === "complete" ? c.secondary : c.muted,
                      opacity: step.status === "complete" ? 1 : step.status === "in_progress" ? 0.82 : 0.65,
                    }}
                  >
                    {step.title}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-3" style={{ opacity: 0.9 }}>
            <p className="font-mono text-[9.5px] uppercase tracking-[0.10em]" style={{ color: c.muted, opacity: 0.65 }}>
              Evidence
            </p>
            <div className="mt-1.5 space-y-1.5">
              {evidence.map((item) => (
                <div key={item.id} className="flex items-start gap-2">
                  <Circle
                    className="mt-[2px] h-3 w-3 shrink-0"
                    style={{
                      color:
                        item.status === "complete"
                          ? c.teal
                          : item.status === "in_progress"
                            ? c.amber
                            : c.coral,
                      fill: item.status === "complete" ? c.teal : "transparent",
                    }}
                  />
                  <span
                    className="font-sans text-[11.5px] leading-[1.5]"
                    style={{
                      color: item.status === "missing" ? c.coral : item.status === "complete" ? c.secondary : c.muted,
                      opacity: item.status === "missing" ? 0.75 : item.status === "in_progress" ? 0.82 : 1,
                    }}
                  >
                    {item.title}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {whyThisMatters.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <p className="font-mono text-[9px] uppercase tracking-[0.10em]" style={{ color: c.muted, opacity: 0.75 }}>
                Why this matters
              </p>
              <div className="mt-2 space-y-1.5">
                {whyThisMatters.map((reason, index) => (
                  <p
                    key={`${route.id}-why-${index}`}
                    className="font-sans leading-[1.5]"
                    style={{
                      fontSize: index === 0 ? 13 : 12,
                      fontWeight: index === 0 ? 500 : 400,
                      color: c.secondary,
                      opacity: index === 0 ? 1 : 0.82,
                    }}
                  >
                    <span style={{ color: accent, marginRight: 5 }}>·</span>
                    {reason}
                  </p>
                ))}
              </div>
            </div>
          )}

          {(sequencingNarrative || commitmentRationale) && (
            <div style={{ marginTop: 14, paddingTop: 10, borderTop: `1px solid ${c.lineFaint}` }}>
              {sequencingNarrative && (
                <p className="font-sans leading-[1.5]" style={{
                  fontSize: hasBlocker ? 13 : 12,
                  fontWeight: hasBlocker ? 500 : 400,
                  color: c.secondary,
                }}>
                  <span className="font-mono text-[9px] uppercase tracking-[0.1em]" style={{ color: c.muted }}>Sequencing · </span>
                  {sequencingNarrative}
                </p>
              )}
              {commitmentRationale && !sequencingNarrative && (
                <p className="font-sans text-[12px] leading-[1.5]" style={{ color: c.secondary }}>
                  {commitmentRationale}
                </p>
              )}
            </div>
          )}

          {routeTensions.length > 0 && (
            <div style={{ marginTop: 12 }}>
              {routeTensions.map((tension) => {
                const isBlocker = tension.isCommitmentBlocker;
                const tensionColor = isBlocker ? "#c44233" : tension.pressure === "high" ? "#b56c1a" : c.muted;
                return (
                  <div key={tension.id} style={{ paddingLeft: 10, borderLeft: `2px solid ${tensionColor}`, marginBottom: 6 }}>
                    <p className="font-sans text-[11px] leading-[1.45]" style={{ color: tensionColor }}>
                      {isBlocker ? "⊗ " : "· "}{tension.statement}
                    </p>
                  </div>
                );
              })}
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <span className="font-mono text-[10px] uppercase tracking-[0.1em]" style={{ color: c.muted }}>
              {frameworks.length > 0 ? frameworks.slice(0, 2).join(" · ") : "Research inputs"}
            </span>
            <div className="ml-auto flex items-center gap-4">
              {onSelect && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onSelect(); }}
                  className="font-mono text-[10px] underline"
                  style={{
                    color: isSelected ? c.coral : c.teal,
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    padding: 0,
                  }}
                >
                  {isSelected ? "Deselect" : "Choose this path →"}
                </button>
              )}
              {onInspect && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onInspect(); }}
                  className="font-mono text-[10px] underline"
                  style={{ color: c.muted, background: "none", border: "none", cursor: "pointer", padding: 0 }}
                >
                  Inspect why →
                </button>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
