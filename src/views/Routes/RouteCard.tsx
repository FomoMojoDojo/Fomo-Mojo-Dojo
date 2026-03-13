import { useMemo, useState } from "react";
import { Check, ChevronDown, ChevronUp, Circle, Loader2 } from "lucide-react";
import { MetaBadge, ScoreChip, TierBadge } from "@/components/ui/semantic-badges";
import type { RouteRow } from "./useRoutes";

const c = {
  line: "#DDE6D1",
  paper: "#FFFFFF",
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

function statusIcon(status: DetailStep["status"]) {
  if (status === "complete") return <Check className="h-3.5 w-3.5" style={{ color: c.teal }} />;
  if (status === "in_progress") return <Loader2 className="h-3.5 w-3.5 animate-spin" style={{ color: c.amber }} />;
  return <Circle className="h-3.5 w-3.5" style={{ color: c.coral }} />;
}

function toneForCategory(category: string) {
  if (category === "fix") return "focus";
  if (category === "create") return "defer";
  return "monitor";
}

export default function RouteCard({
  route,
  accent,
  steps,
  evidence,
  whyThisMatters,
  frameworks,
}: {
  route: RouteRow;
  accent: string;
  steps: DetailStep[];
  evidence: DetailEvidence[];
  whyThisMatters: string[];
  frameworks: string[];
}) {
  const [expanded, setExpanded] = useState(false);
  const categoryLabel = String(route.category || "improve");
  const typeLabel = String(route.type || "");
  const showTypeBadge =
    typeLabel.trim().length > 0 &&
    typeLabel.trim().toLowerCase() !== categoryLabel.trim().toLowerCase();

  const completedSteps = useMemo(
    () => steps.filter((step) => step.status === "complete").length,
    [steps],
  );

  return (
    <div
      className="overflow-hidden rounded-2xl border"
      style={{ borderColor: c.line, background: c.paper, boxShadow: "0 1px 2px rgba(0,0,0,0.03)" }}
    >
      <div className="h-[5px] w-full" style={{ background: accent }} />

      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="w-full cursor-pointer p-5 text-left"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <TierBadge tone={toneForCategory(categoryLabel) as "focus" | "monitor" | "defer"}>
                {categoryLabel}
              </TierBadge>
              {showTypeBadge ? <MetaBadge>{typeLabel}</MetaBadge> : null}
              {typeof route.sort_order === "number" ? <MetaBadge>#{route.sort_order}</MetaBadge> : null}
            </div>

            <h3 className="font-sans text-[16px] font-semibold leading-tight" style={{ color: c.charcoal }}>
              {route.title || "Untitled route"}
            </h3>
            <p className="mt-2 font-sans text-[13px] leading-[1.65]" style={{ color: c.secondary }}>
              {route.short_description || "No route description yet."}
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              {typeof route.pts_value === "number" ? <ScoreChip label="Pts" value={route.pts_value} /> : null}
              {route.effort ? <MetaBadge>{route.effort} effort</MetaBadge> : null}
              <MetaBadge>{`${completedSteps}/${steps.length} steps`}</MetaBadge>
            </div>
          </div>

          <div className="mt-0.5 shrink-0" style={{ color: c.muted }}>
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </div>
        </div>
      </button>

      {expanded ? (
        <div className="border-t px-5 pb-5 pt-4 animate-fade-in-up" style={{ borderColor: c.line }}>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.1fr_0.9fr]">
            <div className="space-y-4">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.1em]" style={{ color: c.muted }}>
                  Steps
                </p>
                <div className="mt-2 space-y-2">
                  {steps.map((step) => (
                    <div key={step.id} className="flex items-start gap-2">
                      <div className="pt-0.5">{statusIcon(step.status)}</div>
                      <span
                        className="font-sans text-[12px] leading-[1.55]"
                        style={{
                          color: step.status === "complete" ? c.muted : c.secondary,
                          textDecoration: step.status === "complete" ? "line-through" : "none",
                        }}
                      >
                        {step.title}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.1em]" style={{ color: c.muted }}>
                  Evidence Needed
                </p>
                <div className="mt-2 space-y-2">
                  {evidence.map((item) => (
                    <div key={item.id} className="flex items-start gap-2">
                      <div className="pt-0.5">{statusIcon(item.status)}</div>
                      <span
                        className="font-sans text-[11px] leading-[1.55]"
                        style={{
                          color:
                            item.status === "complete"
                              ? c.muted
                              : item.status === "in_progress"
                                ? c.secondary
                                : c.coral,
                          textDecoration: item.status === "complete" ? "line-through" : "none",
                        }}
                      >
                        {item.title}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-xl border px-3 py-2" style={{ borderColor: c.line, background: c.lineFaint }}>
                <p className="font-mono text-[10px] uppercase tracking-[0.1em]" style={{ color: c.muted }}>
                  Detail Source
                </p>
                <p className="mt-1 font-sans text-[11px] leading-[1.55]" style={{ color: c.secondary }}>
                  These next steps, evidence gaps, and rationale are inferred from linked routes, opportunities, and job steps. Confirm them before treating them as final.
                </p>
              </div>

              <div className="rounded-xl border p-4" style={{ borderColor: c.line, background: c.lineFaint }}>
                <p className="font-mono text-[10px] uppercase tracking-[0.1em]" style={{ color: c.muted }}>
                  Why This Matters
                </p>
                <ul className="mt-2 space-y-2">
                  {whyThisMatters.map((reason, index) => (
                    <li
                      key={`${route.id}-why-${index}`}
                      className="flex items-start gap-2 font-sans text-[12px] leading-[1.6]"
                      style={{ color: c.secondary }}
                    >
                      <span style={{ color: accent }}>•</span>
                      <span>{reason}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {frameworks.length > 0 ? (
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.1em]" style={{ color: c.muted }}>
                    Frameworks Used
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {frameworks.map((framework) => (
                      <MetaBadge key={`${route.id}-${framework}`}>{framework}</MetaBadge>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
