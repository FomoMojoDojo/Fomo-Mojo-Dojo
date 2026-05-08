import { useMemo } from "react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import type { RouteRow } from "./useRoutes";
import type { OpportunityRow } from "@/hooks/useOpportunities";
import type { JobStepRow } from "@/hooks/useJobSteps";
import type { FocusClassification } from "@/lib/initiativeFocus";
import { deriveInitiativeContext } from "@/lib/initiativeFocus";
import { routeDetail } from "./routeDetail";
import type { EngagementPhase } from "@/lib/engagementPhase";

const c = {
  charcoal: "#233C4B",
  secondary: "#46606D",
  muted:     "#6E847F",
  line:      "#DDE6D1",
  paper:     "#F7FBF8",
  coral:     "#FF7D2D",
  amber:     "#FAC846",
  teal:      "#5F9B8C",
};

const MONO = '"JetBrains Mono", ui-monospace, "SFMono-Regular", monospace';

function categoryAccent(category: string): string {
  if (category === "fix")     return c.coral;
  if (category === "improve") return c.amber;
  return c.teal;
}

function SectionLabel({ children }: { children: string }) {
  return (
    <p style={{ margin: "0 0 10px", fontFamily: MONO, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.12em", color: c.muted }}>
      {children}
    </p>
  );
}

function Divider() {
  return <div style={{ borderTop: `1px solid ${c.line}` }} />;
}

export default function RouteInspectPanel({
  open,
  onClose,
  route,
  opportunities,
  steps,
  initiativeContext,
  opportunityFocusById,
  linkedDesiredOutcome,
  staleNote,
  currentPhase = "outside_signals",
}: {
  open: boolean;
  onClose: () => void;
  route: RouteRow | null;
  opportunities: OpportunityRow[];
  steps: JobStepRow[];
  initiativeContext: ReturnType<typeof deriveInitiativeContext>;
  opportunityFocusById: Map<string, FocusClassification>;
  areaScoresJson?: unknown;
  linkedDesiredOutcome?: { statement: string; leadingIndicator: string } | null;
  staleNote?: string | null;
  currentPhase?: EngagementPhase;
}) {
  const detail = useMemo(() => {
    if (!route) return null;
    return routeDetail({ route, opportunities, steps, initiativeContext, opportunityFocusById });
  }, [route, opportunities, steps, initiativeContext, opportunityFocusById]);

  const category       = String(route?.category || "improve").toLowerCase();
  const accent         = categoryAccent(category);
  const pts            = typeof route?.pts_value === "number" ? Math.round(route.pts_value) : null;
  const effort         = String(route?.effort || "medium").toUpperCase();
  const whyThisMatters = detail?.whyThisMatters ?? [];
  const evidence       = detail?.evidence ?? [];
  const missing        = evidence.filter((e) => e.status === "missing");

  // "What we're noticing" — primary observation
  const noticing: string[] = whyThisMatters.length > 0
    ? whyThisMatters
    : route?.short_description
      ? [route.short_description]
      : [];

  // "Why it matters" — linked outcome or secondary why
  const whyItMatters: string | null =
    linkedDesiredOutcome?.statement
    ?? (whyThisMatters.length > 1 ? whyThisMatters[1] : null);

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent side="right" className="sm:max-w-[480px] overflow-y-auto flex flex-col gap-0 p-0">
        {route ? (
          <div style={{ display: "flex", flexDirection: "column", height: "100%", background: c.paper }}>

            {staleNote && (
              <div className="px-6 py-2 flex items-center gap-2 border-b" style={{ background: `${c.amber}18`, borderColor: c.amber }}>
                <span className="font-mono text-[9px] uppercase tracking-[0.08em]" style={{ color: c.amber }}>
                  {staleNote}
                </span>
              </div>
            )}

            {/* Header */}
            <div className="px-6 pt-6 pb-4 border-b" style={{ borderColor: c.line }}>
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span
                  className="rounded-md px-2 py-[2px] font-mono text-[10px] uppercase tracking-[0.08em] border"
                  style={{ color: accent, borderColor: accent, background: `${accent}14` }}
                >
                  {category.charAt(0).toUpperCase() + category.slice(1)}
                </span>
                <span className="font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: c.muted }}>
                  {effort} EFFORT
                </span>
                {pts !== null && (
                  <span className="font-mono text-[11px] font-semibold" style={{ color: accent }}>
                    +{pts} pts reachable
                  </span>
                )}
              </div>
              <h2 className="font-sans text-[18px] font-semibold leading-tight" style={{ color: c.charcoal }}>
                {route.title || "Untitled route"}
              </h2>
            </div>

            {/* Body */}
            <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }} className="px-6 py-5 space-y-6">

              {/* What we're noticing */}
              <div>
                <SectionLabel>What we're noticing</SectionLabel>
                {noticing.length > 0 ? (
                  <ul className="space-y-2">
                    {noticing.map((reason, i) => (
                      <li key={i} className="flex items-start gap-2 font-sans text-[13px] leading-[1.6]" style={{ color: c.secondary }}>
                        <span style={{ color: accent, flexShrink: 0 }}>·</span>
                        <span>{reason}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="font-sans text-[13px] leading-[1.6]" style={{ color: c.muted }}>
                    No observations recorded for this route yet.
                  </p>
                )}
              </div>

              {whyItMatters && (
                <>
                  <Divider />
                  <div>
                    <SectionLabel>Why it matters</SectionLabel>
                    <p className="font-sans text-[13px] leading-[1.6]" style={{ color: c.secondary }}>
                      {whyItMatters}
                    </p>
                  </div>
                </>
              )}

              {/* What we still need */}
              <Divider />
              <div>
                <SectionLabel>What we still need</SectionLabel>
                {missing.length > 0 ? (
                  <div className="space-y-2">
                    {missing.map((item) => (
                      <div key={item.id} className="flex items-start gap-2 font-sans text-[13px] leading-[1.6]" style={{ color: c.secondary }}>
                        <span style={{ color: c.muted, flexShrink: 0 }}>○</span>
                        <span>{item.title}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="font-sans text-[13px]" style={{ color: c.muted }}>
                    Nothing flagged as missing right now.
                  </p>
                )}
              </div>

            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t" style={{ borderColor: c.line }}>
              <button
                type="button"
                onClick={onClose}
                className="w-full rounded-full border py-2 font-mono text-[10px] uppercase tracking-[0.08em]"
                style={{ borderColor: c.line, color: c.secondary }}
              >
                Close
              </button>
            </div>

          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
