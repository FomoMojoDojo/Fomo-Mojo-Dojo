import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Circle } from "lucide-react";
import { MetaBadge } from "@/components/ui/semantic-badges";
import type { RouteRow } from "./useRoutes";
import { alignmentLevelFromFocus, type FocusClassification } from "@/lib/initiativeFocus";
import AlignmentCircle from "@/components/ui/AlignmentCircle";

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

function effortTone(effort: string | null | undefined) {
  const key = String(effort || "").toLowerCase();
  if (key === "low") return { bg: "#EEF6E7", fg: "#5F9B8C", border: "#BDD8CF" };
  if (key === "high") return { bg: "#FFF0E6", fg: "#FF7D2D", border: "#FFD1B4" };
  return { bg: "#FFF6D8", fg: "#C68B00", border: "#F3D77A" };
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
}) {
  const [expanded, setExpanded] = useState(false);
  const completedSteps = useMemo(
    () => steps.filter((step) => step.status === "complete").length,
    [steps],
  );
  const totalSteps = steps.length;
  const points = typeof route.pts_value === "number" ? Math.round(route.pts_value) : null;
  const effort = String(route.effort || "medium").toUpperCase();
  const effortStyle = effortTone(route.effort);
  const dependencyLabel =
    String(route.category || "").toLowerCase() === "fix"
      ? "Foundation"
      : String(route.category || "").toLowerCase() === "improve"
        ? "Execution"
        : "Evidence";
  const alignmentLevel = alignmentLevelFromFocus(focus);

  return (
    <div
      className="overflow-hidden rounded-xl border"
      style={{ borderColor: c.line, background: c.paperRaised, boxShadow: "0 1px 1px rgba(0,0,0,0.03)" }}
    >
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="w-full cursor-pointer p-4 text-left"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h3 className="font-sans text-[16px] font-semibold leading-tight" style={{ color: c.charcoal }}>
              {route.title || "Untitled route"}
            </h3>
            <p className="mt-2 font-sans text-[13px] leading-[1.5]" style={{ color: c.secondary }}>
              {route.short_description || "No route description yet."}
            </p>
            <p className="mt-2 font-sans text-[12px] leading-[1.45]" style={{ color: c.secondary }}>
              <span className="font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: c.muted }}>
                Desired outcome:
              </span>{" "}
              {linkedDesiredOutcome?.statement || "Not linked yet."}
            </p>
            <p className="mt-1 font-sans text-[12px] leading-[1.45]" style={{ color: c.secondary }}>
              <span className="font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: c.muted }}>
                Indicator:
              </span>{" "}
              {linkedDesiredOutcome?.leadingIndicator || "Missing until outcome link exists."}
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="font-mono text-[11px] font-semibold" style={{ color: accent }}>
                {points !== null ? `+${points} pts` : "+0 pts"}
              </span>
              <span
                className="inline-flex items-center rounded-full border px-1.5 py-1"
                style={{ borderColor: c.line, color: c.secondary, background: "#FFFFFF" }}
              >
                <AlignmentCircle
                  level={alignmentLevel}
                  title={`Goal alignment ${alignmentLevel * 25}%`}
                />
              </span>
              <span
                className="rounded-md border px-2 py-[1px] font-mono text-[10px] uppercase tracking-[0.08em]"
                style={{ background: effortStyle.bg, color: effortStyle.fg, borderColor: effortStyle.border }}
              >
                {effort} effort
              </span>
              <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: c.muted }}>
                {completedSteps}/{totalSteps} steps
              </span>
            </div>
          </div>

          <div className="mt-0.5 shrink-0" style={{ color: c.muted }}>
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </div>
        </div>
      </button>

      {expanded ? (
        <div className="border-t px-4 pb-4 pt-3 animate-fade-in-up" style={{ borderColor: c.line, background: c.paper }}>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.12em]" style={{ color: c.muted }}>
              Steps
            </p>
            <div className="mt-2 space-y-2">
              {steps.map((step) => (
                <div key={step.id} className="flex items-start gap-2">
                  <Circle
                    className="mt-[2px] h-3.5 w-3.5"
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
                  <span className="font-sans text-[12px] leading-[1.5]" style={{ color: c.secondary }}>
                    {step.title}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.12em]" style={{ color: c.muted }}>
              Evidence Needed
            </p>
            <div className="mt-2 space-y-2">
              {evidence.map((item) => (
                <div key={item.id} className="flex items-start gap-2">
                  <Circle
                    className="mt-[2px] h-3.5 w-3.5"
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
                    className="font-sans text-[12px] leading-[1.5]"
                    style={{
                      color:
                        item.status === "complete"
                          ? c.secondary
                          : item.status === "in_progress"
                            ? c.secondary
                            : c.coral,
                    }}
                  >
                    {item.title}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 rounded-xl border p-3" style={{ borderColor: c.line, background: c.lineFaint }}>
            <p className="font-mono text-[10px] uppercase tracking-[0.12em]" style={{ color: accent }}>
              Why This Matters
            </p>
            <ul className="mt-2 space-y-1.5">
              {whyThisMatters.map((reason, index) => (
                <li
                  key={`${route.id}-why-${index}`}
                  className="flex items-start gap-2 font-sans text-[12px] leading-[1.45]"
                  style={{ color: c.secondary }}
                >
                  <span style={{ color: accent }}>·</span>
                  <span>{reason}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.1em]" style={{ color: c.muted }}>
              Depends on:
            </span>
            <MetaBadge>{dependencyLabel}</MetaBadge>
            {frameworks.slice(0, 2).map((framework) => (
              <MetaBadge key={`${route.id}-${framework}`}>{framework}</MetaBadge>
            ))}
            {onInspect && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onInspect(); }}
                className="ml-auto font-mono text-[10px] underline"
                style={{ color: c.muted, background: "none", border: "none", cursor: "pointer", padding: 0 }}
              >
                Inspect why →
              </button>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
