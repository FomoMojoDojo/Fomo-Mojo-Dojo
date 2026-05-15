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
    <p style={{ margin: "0 0 10px", fontFamily: MONO, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.10em", color: c.muted, opacity: 0.75 }}>
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

  // Phase 79 evidence graph
  const insights          = route?.route_insights_json ?? null;
  const pressureShort     = insights?.pressure_short ?? null;
  const evidenceSnippets  = insights?.evidence_snippets ?? [];
  const uncertainty       = insights?.uncertainty ?? null;
  const weakeningConds    = insights?.weakening_conditions ?? [];
  const customerImpact    = insights?.customer_impact ?? null;
  const movementCondition = insights?.movement_condition ?? null;
  const linkedTensions    = route?.linked_tension_ids ?? [];
  const linkedNeeds       = route?.linked_need_ids ?? [];

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
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <span
                  style={{ fontFamily: MONO, fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.08em",
                    color: accent, borderLeft: `2px solid ${accent}`, paddingLeft: 7 }}
                >
                  {category.charAt(0).toUpperCase() + category.slice(1)}
                </span>
                <span style={{ fontFamily: MONO, fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.08em", color: c.muted }}>
                  {effort} effort
                </span>
                {pts !== null && (
                  <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 600, color: accent }}>
                    +{pts} pts
                  </span>
                )}
                {pressureShort && (
                  <span style={{ fontFamily: MONO, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.07em",
                    color: c.teal, background: `${c.teal}18`, padding: "2px 7px", borderRadius: 3 }}>
                    {pressureShort}
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
                  <ul className="space-y-2.5">
                    {noticing.map((reason, i) => (
                      <li key={i} className="flex items-start gap-2 font-sans leading-[1.6]" style={{
                        fontSize: i === 0 ? 14 : 13,
                        fontWeight: i === 0 ? 500 : 400,
                        color: c.secondary,
                        opacity: i === 0 ? 1 : 0.88,
                      }}>
                        <span style={{ color: accent, flexShrink: 0, marginTop: 2 }}>·</span>
                        <span>{reason}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="font-sans text-[13px] leading-[1.6]" style={{ color: c.muted }}>
                    No observations recorded.
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

              {/* Evidence behind this route */}
              {evidenceSnippets.length > 0 && (
                <>
                  <Divider />
                  <div>
                    <SectionLabel>Evidence behind this route</SectionLabel>
                    <div className="space-y-3">
                      {evidenceSnippets.map((snip, i) => (
                        <div key={i} style={{ borderLeft: `2px solid ${snip.confidence === "direct" ? c.teal : c.line}`, paddingLeft: 10 }}>
                          <p className="font-sans text-[13px] leading-[1.6]" style={{ color: c.secondary, margin: 0 }}>
                            {snip.text}
                          </p>
                          {snip.source_label && (
                            <p style={{ fontFamily: MONO, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.08em", color: c.muted, opacity: 0.65, margin: "4px 0 0" }}>
                              {snip.source_label}{snip.confidence === "inferred" ? " · inferred" : ""}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* Uncertainty */}
              {uncertainty && (
                <>
                  <Divider />
                  <div>
                    <SectionLabel>What we don't know yet</SectionLabel>
                    <p className="font-sans text-[13px] leading-[1.6]" style={{ color: c.secondary }}>
                      {uncertainty}
                    </p>
                  </div>
                </>
              )}

              {/* What we still need */}
              <Divider />
              <div>
                <SectionLabel>{missing.length >= 2 ? "What keeps surfacing" : "What we still need"}</SectionLabel>
                {missing.length > 0 ? (
                  <div className="space-y-1.5" style={{ opacity: 0.65 }}>
                    {missing.map((item) => (
                      <div key={item.id} className="flex items-start gap-2 font-sans text-[12px] leading-[1.55]" style={{ color: c.secondary }}>
                        <span style={{ color: c.muted, flexShrink: 0 }}>○</span>
                        <span>{item.title}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="font-sans text-[12px]" style={{ color: c.muted, opacity: 0.75 }}>
                    No gaps flagged.
                  </p>
                )}
              </div>

              {/* Weakening conditions */}
              {weakeningConds.length > 0 && (
                <>
                  <Divider />
                  <div>
                    <SectionLabel>What could undermine this</SectionLabel>
                    <div className="space-y-1.5">
                      {weakeningConds.map((cond, i) => (
                        <div key={i} className="flex items-start gap-2 font-sans text-[12px] leading-[1.55]" style={{ color: c.secondary, opacity: 0.8 }}>
                          <span style={{ color: c.coral, flexShrink: 0 }}>·</span>
                          <span>{cond}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* Customer impact + movement condition */}
              {(customerImpact || movementCondition) && (
                <>
                  <Divider />
                  {customerImpact && (
                    <div style={{ marginBottom: movementCondition ? 16 : 0 }}>
                      <SectionLabel>Customer outcome if resolved</SectionLabel>
                      <p className="font-sans text-[13px] leading-[1.6]" style={{ color: c.secondary }}>
                        {customerImpact}
                      </p>
                    </div>
                  )}
                  {movementCondition && (
                    <div>
                      <SectionLabel>What visible change would signal movement</SectionLabel>
                      <p className="font-sans text-[13px] leading-[1.6]" style={{ color: c.secondary }}>
                        {movementCondition}
                      </p>
                    </div>
                  )}
                </>
              )}

              {/* Linked tensions / needs */}
              {(linkedTensions.length > 0 || linkedNeeds.length > 0) && (
                <>
                  <Divider />
                  <div>
                    <SectionLabel>Connected to</SectionLabel>
                    <div className="flex flex-wrap gap-2">
                      {linkedTensions.length > 0 && (
                        <span style={{ fontFamily: MONO, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.07em",
                          color: c.muted, background: `${c.muted}18`, padding: "3px 8px", borderRadius: 3 }}>
                          {linkedTensions.length} tension{linkedTensions.length !== 1 ? "s" : ""}
                        </span>
                      )}
                      {linkedNeeds.length > 0 && (
                        <span style={{ fontFamily: MONO, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.07em",
                          color: c.muted, background: `${c.muted}18`, padding: "3px 8px", borderRadius: 3 }}>
                          {linkedNeeds.length} customer need{linkedNeeds.length !== 1 ? "s" : ""}
                        </span>
                      )}
                    </div>
                  </div>
                </>
              )}

            </div>

            {/* Footer */}
            <div style={{ padding: "12px 24px", borderTop: `1px solid ${c.line}`, display: "flex", justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={onClose}
                style={{
                  fontFamily: MONO, fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.08em",
                  color: c.muted, background: "none", border: "none", cursor: "pointer", padding: 0,
                }}
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
