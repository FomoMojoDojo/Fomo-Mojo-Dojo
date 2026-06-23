import { useState, useEffect, useMemo } from "react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import type { OdiNeedRow } from "@/hooks/useOdiNeeds";
import type { RouteRow } from "@/hooks/useRoutes";
import type { EngagementPhase } from "@/lib/engagementPhase";
import { needSignalTiers } from "@/lib/strategicObject";
import { LENS_TYPES, isLensCompatible, type LensType } from "@/lib/strategicObjects";
import { useFoundationProvenance } from "@/hooks/useFoundationProvenance";
import { FoundationClaimSupport } from "@/components/evidence/FoundationClaimSupport";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { StrategicEvent } from "@/lib/strategicGraphDomain";
import { rewriteJobContextPhrase, sanitizeStaleReason, humanSourceLabel } from "@/lib/needDisplayLanguage";
import { deriveNeedServedByRoutes } from "@/lib/strategicObjectRelationships";
import {
  deriveNeedRealityCard,
  deriveValidationStatus,
  type ValidationStatus,
} from "@/lib/customerRealityNarrative";
import { isSurveyValidated, needBestGuessBandLabel, needCertaintyLabel } from "@/lib/surveyVerdict";

// ─── Design tokens ────────────────────────────────────────────────────────────────

const c = {
  bg:        "#F7FBF8",
  surface:   "#FFFFFF",
  charcoal:  "#233C4B",
  secondary: "#46606D",
  muted:     "#6E847F",
  ink:       "#1A2E38",
  line:      "#DDE6D1",
  lineFaint: "#EEF3E9",
  coral:     "#FF7D2D",
  amber:     "#FAC846",
  teal:      "#5F9B8C",
};

const MONO = '"JetBrains Mono", ui-monospace, "SFMono-Regular", monospace';

// ─── Helpers ──────────────────────────────────────────────────────────────────────

function serviceStateColor(state: string): string {
  const s = String(state || "").toLowerCase();
  if (s === "underserved") return c.coral;
  if (s === "overserved")  return c.amber;
  return c.teal;
}

function serviceStateLabelText(state: string): string {
  const s = String(state || "").toLowerCase();
  if (s === "underserved") return "Underserved";
  if (s === "overserved")  return "Over-served";
  return "Served";
}

function serviceStateObservation(state: string): string {
  const s = String(state || "").toLowerCase();
  if (s === "underserved")
    return "This gap keeps surfacing — importance stays high while satisfaction lags behind.";
  if (s === "overserved")
    return "This pattern keeps recurring — effort here may consistently exceed what the signal warrants.";
  return "The pattern here looks balanced — importance and delivery are roughly in line.";
}

function journeyLabel(key: string): string {
  const map: Record<string, string> = {
    customer: "Customer", revenue: "Revenue", operations: "Operations",
  };
  return map[key] ?? (key.charAt(0).toUpperCase() + key.slice(1));
}

function scoreInterpretation(imp: number, sat: number): string {
  if (imp >= 7 && sat <= 4) return "This need consistently registers as a gap — high importance, low satisfaction.";
  if (imp >= 7 && sat >= 7) return "Well served — importance and delivery are in line. Monitor for shifts.";
  if (imp <= 3)              return "Lower priority relative to other needs right now.";
  if (sat > imp + 2)         return "Investment here consistently exceeds what the importance signal warrants.";
  return "A moderate gap — this signal has been building. Worth watching as the picture sharpens.";
}

function deriveWhatWouldChange(need: OdiNeedRow): string[] {
  const imp = need.importance ?? 0;
  const sat = need.satisfaction ?? 0;
  const state = String(need.service_state || "").toLowerCase();
  const out: string[] = [];
  if (sat < 5)               out.push("Addressing delivery here would reduce the gap signal — this gap has remained open.");
  if (imp > 7)               out.push("This need consistently ranks high — more customer research would sharpen the sustained signal.");
  if (state === "overserved") out.push("Over-serving this need may mean effort is misallocated — review with your strategy.");
  if (out.length === 0)      out.push("Additional research would help settle this signal.");
  return out;
}

function deriveStillNeeded(need: OdiNeedRow): string[] {
  const src = String(need.source_path || "").toLowerCase();
  const isExternal = src.includes("baseline") || src.includes("public") || src.includes("benchmark");
  const state = String(need.service_state || "").toLowerCase();
  const out: string[] = [];
  if (isExternal) out.push("This signal continues to rest on outside research — customer confirmation remains open.");
  if (state === "underserved") out.push("This gap keeps recurring — validate its consistency across segments before committing.");
  else if (state === "overserved") out.push("Check whether this keeps recurring or whether it's a contextual spike.");
  if (out.length === 0) out.push("Additional research would help settle this signal.");
  return out;
}

// ─── Primitive components ─────────────────────────────────────────────────────────

function Mono({ children, size = 10, color = c.muted, bold = false }: {
  children: React.ReactNode; size?: number; color?: string; bold?: boolean;
}) {
  return (
    <span style={{
      fontFamily: MONO, fontSize: size,
      textTransform: "uppercase", letterSpacing: "0.10em",
      color, fontWeight: bold ? 600 : 400,
    }}>
      {children}
    </span>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <p style={{ margin: "0 0 8px", fontFamily: MONO, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.10em", color: c.muted, opacity: 0.62 }}>
      {children}
    </p>
  );
}

function Divider() {
  return <div style={{ borderTop: `1px solid ${c.line}` }} />;
}

function Bullet({ text }: { text: string }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
      <span style={{ color: c.muted, flexShrink: 0, marginTop: 1, fontSize: 14 }}>·</span>
      <span style={{ fontFamily: "Inter, sans-serif", fontSize: 13, lineHeight: 1.6, color: c.secondary }}>
        {text}
      </span>
    </div>
  );
}

function TierGrid({ tiers }: { tiers: ReturnType<typeof needSignalTiers> }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {tiers.map((tier) => (
        <div key={tier.tier} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
          <span style={{
            fontFamily: MONO, fontSize: 9, textTransform: "uppercase",
            letterSpacing: "0.09em", color: tier.present ? c.teal : c.muted,
            opacity: tier.present ? 1 : 0.55,
            flexShrink: 0, marginTop: 1,
          }}>
            {tier.present ? "✓" : "—"}
          </span>
          <div>
            <span style={{
              fontFamily: MONO, fontSize: 9, textTransform: "uppercase",
              letterSpacing: "0.09em", color: tier.present ? c.teal : c.muted,
              opacity: tier.present ? 1 : 0.55,
            }}>
              {tier.label}
            </span>
            {tier.detail && (
              <p style={{ margin: "2px 0 0", fontFamily: "Inter, sans-serif", fontSize: 11, color: c.secondary, lineHeight: 1.4 }}>
                {tier.detail}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Inspection tabs ──────────────────────────────────────────────────────────────

// "overview" and "validation" are panel-specific — not gated by the ontology.
// "customer_reality" and "evidence" are formal LensType values, filtered via isLensCompatible.
type InspectTab = "overview" | "customer_reality" | "evidence" | "validation";

const TABS: { id: InspectTab; label: string; panelSpecific?: boolean }[] = [
  { id: "overview",         label: "Overview",              panelSpecific: true },
  { id: "customer_reality", label: "How it scored" },
  { id: "evidence",         label: "Evidence" },
  { id: "validation",       label: "What needs confirming", panelSpecific: true },
];

// ─── Shared sub-component ─────────────────────────────────────────────────────────

function RouteRelRow({
  route,
  accent,
  onInspect,
}: {
  route: { id: string; title: string };
  accent: string | null;
  onInspect?: (routeId: string) => void;
}) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "8px 10px", borderRadius: 6,
      border: `1px solid ${accent ? `${accent}40` : c.lineFaint}`,
      background: accent ? `${accent}08` : c.surface,
    }}>
      <span style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, color: c.secondary, flex: 1 }}>
        {route.title}
      </span>
      {onInspect && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onInspect(route.id); }}
          style={{
            fontFamily: MONO, fontSize: 9.5, textTransform: "uppercase",
            letterSpacing: "0.08em", color: c.muted,
            background: "none", border: "none", cursor: "pointer",
            padding: "0 0 0 8px", textDecoration: "underline", flexShrink: 0,
          }}
        >
          Inspect →
        </button>
      )}
    </div>
  );
}

// ─── Lens: Overview ───────────────────────────────────────────────────────────────

function OverviewLens({
  need,
  routes,
  onInspectRoute,
  linkedRouteIds,
}: {
  need: OdiNeedRow;
  routes: RouteRow[];
  onInspectRoute?: (routeId: string) => void;
  linkedRouteIds?: string[];
}) {
  const tiers      = needSignalTiers(need.source_path);
  // Verdict (served/underserved/overserved) only when a survey backs it; otherwise a
  // best-guess of value. Gated on provenance, never on parsing service_state.
  const surveyValidated = isSurveyValidated(need);
  const stateColor = surveyValidated ? serviceStateColor(need.service_state ?? "") : c.teal;
  const stateLabel = surveyValidated
    ? serviceStateLabelText(need.service_state ?? "")
    : needBestGuessBandLabel(need);
  const observation = surveyValidated
    ? serviceStateObservation(need.service_state ?? "")
    : "A best guess of where the value likely is, from the information on hand — not yet validated by a customer survey.";
  const srcLabel   = humanSourceLabel(need.source_path);
  const presentTiers = tiers.filter((t) => t.present);
  // Stack-confirmed routes (caller guarantees the relationship is real)
  const linkedSet = new Set(linkedRouteIds ?? []);
  const confirmedRoutes = routes.filter((r) => linkedSet.has(r.id));

  // Derived relationships for routes not already confirmed via stack
  const unconfirmedRoutes = routes.filter((r) => !linkedSet.has(r.id));
  const derivedRels = useMemo(
    () => deriveNeedServedByRoutes(need, unconfirmedRoutes),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [need.id, unconfirmedRoutes.map((r) => r.id).join(",")],
  );
  const relMap = new Map(derivedRels.map((r) => [r.toId, r]));

  // Section 1 — "Clearly serves this need": stack-confirmed + high derived
  const highDerived = unconfirmedRoutes.filter(
    (r) => relMap.get(r.id)?.strength === "high",
  );
  const clearlyServes = [...confirmedRoutes, ...highDerived];
  const clearlyServesIds = new Set(clearlyServes.map((r) => r.id));

  // Section 2 — "May serve this need": medium derived only (not already in section 1)
  const mayServe = unconfirmedRoutes.filter(
    (r) => !clearlyServesIds.has(r.id) && relMap.get(r.id)?.strength === "medium",
  );
  const mayServeIds = new Set(mayServe.map((r) => r.id));

  // Section 3 — "Routes in this project": everything else (quiet navigation)
  const primaryIds = new Set([...clearlyServesIds, ...mayServeIds]);
  const projectRoutes = routes.filter((r) => !primaryIds.has(r.id));
  const projectToShow = projectRoutes.slice(0, clearlyServes.length === 0 && mayServe.length === 0 ? 3 : 2);
  const moreProjectCount = Math.max(0, projectRoutes.length - projectToShow.length);

  return (
    <div style={{ padding: "14px 20px 24px", display: "flex", flexDirection: "column", gap: 14 }}>

      {/* Service state claim — survey verdict, or best-guess value until a survey backs it */}
      <div>
        <SectionLabel>{surveyValidated ? "What this tension means" : "Best-guess value"}</SectionLabel>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <span style={{
            fontFamily: MONO, fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.10em",
            color: stateColor, background: `${stateColor}14`, border: `1px solid ${stateColor}50`,
            borderRadius: 4, padding: "2px 7px",
          }}>
            {stateLabel}
          </span>
        </div>
        <p style={{ margin: 0, fontFamily: "Inter, sans-serif", fontSize: 13, lineHeight: 1.65, color: c.secondary }}>
          {observation}
        </p>
      </div>

      <Divider />

      {/* Source signal layers — show only present tiers, suppress absent/unclassified */}
      {(presentTiers.length > 0 || srcLabel) && (
        <div>
          <SectionLabel>Where this signal came from</SectionLabel>
          {presentTiers.length > 0 ? (
            <TierGrid tiers={presentTiers} />
          ) : (
            <p style={{ margin: 0, fontFamily: "Inter, sans-serif", fontSize: 12, color: c.muted, fontStyle: "italic" }}>
              Signal source not yet classified.
            </p>
          )}
          {srcLabel && (
            <p style={{ margin: "8px 0 0", fontFamily: "Inter, sans-serif", fontSize: 11.5, color: c.muted }}>
              {srcLabel}
            </p>
          )}
        </div>
      )}

      {/* Route relationship sections */}
      {(clearlyServes.length > 0 || mayServe.length > 0 || projectToShow.length > 0) && (
        <>
          <Divider />
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

            {/* Section 1: Directly shapes — confirmed stack link or high derived */}
            {clearlyServes.length > 0 && (
              <div>
                <SectionLabel>Directly shapes this tension</SectionLabel>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {clearlyServes.map((route) => (
                    <RouteRelRow key={route.id} route={route} accent={c.teal} onInspect={onInspectRoute} />
                  ))}
                </div>
              </div>
            )}

            {/* Section 2: Could help resolve — medium derived, with honest qualifier */}
            {mayServe.length > 0 && (
              <div>
                <SectionLabel>Could help resolve this tension</SectionLabel>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {mayServe.map((route) => (
                    <RouteRelRow key={route.id} route={route} accent={c.amber} onInspect={onInspectRoute} />
                  ))}
                </div>
                <p style={{ margin: "6px 0 0", fontFamily: "Inter, sans-serif", fontSize: 11, color: c.muted, fontStyle: "italic" }}>
                  Based on theme alignment — not yet validated.
                </p>
              </div>
            )}

            {/* Section 3: Directions this may shape — quiet navigation only */}
            {projectToShow.length > 0 && (
              <div>
                <SectionLabel>Directions this may shape</SectionLabel>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {projectToShow.map((route) => (
                    <RouteRelRow key={route.id} route={route} accent={null} onInspect={onInspectRoute} />
                  ))}
                </div>
                {moreProjectCount > 0 && (
                  <p style={{ margin: "6px 0 0", fontFamily: MONO, fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.08em", color: c.muted }}>
                    +{moreProjectCount} more
                  </p>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Lens: Customer Reality ───────────────────────────────────────────────────────

function validationBadgeStyle(status: ValidationStatus): React.CSSProperties {
  const base: React.CSSProperties = {
    fontFamily: MONO, fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.10em",
    borderRadius: 4, padding: "2px 7px", border: "1px solid",
  };
  if (status === "validated") return { ...base, color: c.teal,  backgroundColor: `${c.teal}14`,  borderColor: `${c.teal}50` };
  if (status === "inferred")  return { ...base, color: c.coral, backgroundColor: `${c.coral}14`, borderColor: `${c.coral}50` };
  return { ...base, color: c.amber, backgroundColor: `${c.amber}14`, borderColor: `${c.amber}50` };
}

function validationStatusLabel(status: ValidationStatus): string {
  if (status === "validated")   return "Backed by your research";
  if (status === "inferred")    return "From outside signals";
  return "Signal building";
}

function CustomerRealityLens({
  need,
  routes,
  onInspectRoute,
}: {
  need: OdiNeedRow;
  routes: RouteRow[];
  onInspectRoute?: (routeId: string) => void;
}) {
  const imp   = need.importance ?? 0;
  const sat   = need.satisfaction ?? 0;
  const score = need.opportunity_score ?? 0;
  const interpretation = scoreInterpretation(imp, sat);

  const card = useMemo(
    () => deriveNeedRealityCard(need, routes),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [need.id, routes.map((r) => r.id).join(",")],
  );

  const improvingRoutes = routes.filter((r) => card.improvingRouteIds.includes(r.id));

  return (
    <div style={{ padding: "14px 20px 24px", display: "flex", flexDirection: "column", gap: 14 }}>

      {/* Validation status + behavior */}
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <span style={validationBadgeStyle(card.validationStatus)}>
            {needCertaintyLabel(need) ?? validationStatusLabel(card.validationStatus)}
          </span>
        </div>
        <p style={{ margin: "0 0 6px", fontFamily: "Inter, sans-serif", fontSize: 13, lineHeight: 1.6, color: c.secondary }}>
          {card.behaviorSummary}
        </p>
        <p style={{ margin: 0, fontFamily: "Inter, sans-serif", fontSize: 12, color: c.muted }}>
          {card.evidenceNote}
        </p>
      </div>

      <Divider />

      {/* Score breakdown (compact) */}
      <div>
        <SectionLabel>Gap signal</SectionLabel>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 16, marginBottom: 8 }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontFamily: MONO, fontSize: 20, fontWeight: 600, color: imp >= 7 ? c.coral : c.secondary }}>{imp}</div>
            <div style={{ fontFamily: MONO, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.10em", color: c.muted, marginTop: 2 }}>Importance</div>
          </div>
          <div style={{ paddingBottom: 18, color: c.muted, fontFamily: MONO, fontSize: 12 }}>→</div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontFamily: MONO, fontSize: 20, fontWeight: 600, color: sat <= 4 ? c.coral : c.teal }}>{sat}</div>
            <div style={{ fontFamily: MONO, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.10em", color: c.muted, marginTop: 2 }}>Satisfaction</div>
          </div>
          <div style={{ paddingBottom: 18, color: c.muted, fontFamily: MONO, fontSize: 12 }}>→</div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontFamily: MONO, fontSize: 20, fontWeight: 600, color: score >= 14 ? c.coral : c.secondary }}>{Math.round(score)}</div>
            <div style={{ fontFamily: MONO, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.10em", color: c.muted, marginTop: 2 }}>Score</div>
          </div>
        </div>
        <p style={{
          margin: 0,
          fontFamily: "Inter, sans-serif",
          fontSize: imp >= 7 && sat <= 4 ? 13 : 12.5,
          fontWeight: imp >= 7 && sat <= 4 ? 500 : 400,
          lineHeight: 1.5,
          color: c.secondary,
        }}>
          {interpretation}
        </p>
      </div>

      {/* Routes that improve this need */}
      {improvingRoutes.length > 0 && (
        <>
          <Divider />
          <div>
            <SectionLabel>Directions this shapes</SectionLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {improvingRoutes.slice(0, 3).map((r) => {
                const cat = String(r.category || "improve").toLowerCase();
                const accent = cat === "fix" ? c.coral : cat === "create" ? c.teal : c.amber;
                return (
                  <div key={r.id} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                    <span style={{
                      fontFamily: MONO, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.10em",
                      color: accent, backgroundColor: `${accent}14`, border: `1px solid ${accent}50`,
                      borderRadius: 4, padding: "2px 6px", flexShrink: 0,
                    }}>
                      {cat}
                    </span>
                    <div style={{ flex: 1 }}>
                      <span style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, color: c.charcoal }}>{r.title}</span>
                      {onInspectRoute && (
                        <button
                          type="button"
                          onClick={() => onInspectRoute(r.id)}
                          style={{
                            fontFamily: MONO, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.08em",
                            color: c.muted, background: "none", border: "none", cursor: "pointer",
                            padding: "0 0 0 8px", textDecoration: "underline",
                          }}
                        >
                          Inspect →
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* What still needs proving */}
      <Divider />
      <div>
        <SectionLabel>What still needs proving</SectionLabel>
        <p style={{ margin: 0, fontFamily: "Inter, sans-serif", fontSize: 13, lineHeight: 1.65, color: c.secondary }}>
          {card.uncertaintyNote}
        </p>
      </div>

      {/* What would strengthen confidence */}
      <Divider />
      <div>
        <SectionLabel>What would strengthen confidence</SectionLabel>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {card.wouldStrengthenConfidence.map((item, i) => <Bullet key={i} text={item} />)}
        </div>
      </div>

    </div>
  );
}

// ─── Lens: Evidence ───────────────────────────────────────────────────────────────

function EvidenceLens({
  need,
  provenance,
  provenanceLoading,
  provenanceError,
}: {
  need: OdiNeedRow;
  provenance: ReturnType<typeof useFoundationProvenance>["data"];
  provenanceLoading: boolean;
  provenanceError: unknown;
}) {
  const srcLabel = humanSourceLabel(need.source_path);
  const tiers = needSignalTiers(need.source_path);
  const hasClassifiedSource = tiers.some((t) => t.present);

  return (
    <div style={{ padding: "14px 20px 24px", display: "flex", flexDirection: "column", gap: 14 }}>

      {/* Foundation provenance */}
      <div>
        <SectionLabel>Evidence behind this</SectionLabel>
        {provenanceLoading ? (
          <p style={{ margin: 0, fontFamily: "Inter, sans-serif", fontSize: 13, color: c.muted, fontStyle: "italic" }}>
            Loading claim support…
          </p>
        ) : provenanceError ? (
          <p style={{ margin: 0, fontFamily: "Inter, sans-serif", fontSize: 13, color: "#a12318" }}>
            {provenanceError instanceof Error ? provenanceError.message : "Failed to load claim support."}
          </p>
        ) : (
          <FoundationClaimSupport claims={provenance?.claims ?? []} mode="odi_need" />
        )}
      </div>

      <Divider />

      {/* Source classification */}
      <div>
        <SectionLabel>Where this came from</SectionLabel>
        <TierGrid tiers={tiers.filter((t) => t.present)} />
        {srcLabel && (
          <p style={{ margin: "8px 0 0", fontFamily: "Inter, sans-serif", fontSize: 12, color: c.muted }}>
            {srcLabel}
          </p>
        )}
        {!hasClassifiedSource && !srcLabel && (
          <p style={{ margin: "8px 0 0", fontFamily: "Inter, sans-serif", fontSize: 12, color: c.muted, fontStyle: "italic" }}>
            Source details not available yet.
          </p>
        )}
      </div>

    </div>
  );
}

// ─── Lens: Validation ─────────────────────────────────────────────────────────────

function ValidationLens({
  need,
  relatedEvent,
  changedStepLabel,
  reviewHighlighted,
  reviewBusy,
  stillNeeded,
  requiresReview,
  canSendBackToReview,
  onMarkReviewed,
  onReviewAction,
}: {
  need: OdiNeedRow;
  relatedEvent: StrategicEvent | null;
  changedStepLabel: string | null;
  reviewHighlighted: boolean;
  reviewBusy: "reviewed" | "send_back" | null;
  stillNeeded: string[];
  requiresReview: boolean;
  canSendBackToReview: boolean;
  onMarkReviewed?: (needId: string) => Promise<void>;
  onReviewAction: (kind: "reviewed" | "send_back") => void;
}) {
  return (
    <div style={{ padding: "14px 20px 24px", display: "flex", flexDirection: "column", gap: 14 }}>

      {/* What still needs confirming */}
      <div>
        <SectionLabel>What still needs confirming</SectionLabel>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {stillNeeded.map((item, i) => (
            <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
              <span style={{ color: c.muted, flexShrink: 0, lineHeight: 1.6 }}>○</span>
              <span style={{ fontFamily: "Inter, sans-serif", fontSize: 13, lineHeight: 1.6, color: c.secondary }}>
                {item}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Review workflow */}
      {requiresReview && (
        <>
          <Divider />
          <div
            style={{
              padding: "14px 16px",
              border: `1px solid ${reviewHighlighted ? c.coral : c.line}`,
              background: reviewHighlighted ? "#fff4ed" : c.surface,
              borderRadius: 8,
            }}
          >
            <SectionLabel>Why this needs review</SectionLabel>
            <p style={{ margin: "0 0 12px", fontFamily: "Inter, sans-serif", fontSize: 13, lineHeight: 1.6, color: c.secondary }}>
              This need should be reviewed — the job map changed since it was last assessed.
            </p>
            <div style={{ display: "grid", gap: 8 }}>
              {need.stale_reason && (
                <div>
                  <p style={{ margin: 0, fontFamily: MONO, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: c.muted }}>Reason</p>
                  <p style={{ margin: "4px 0 0", fontSize: 13, lineHeight: 1.55, color: c.charcoal }}>{sanitizeStaleReason(need.stale_reason)}</p>
                </div>
              )}
              {relatedEvent?.created_at && (
                <div>
                  <p style={{ margin: 0, fontFamily: MONO, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: c.muted }}>When this was flagged</p>
                  <p style={{ margin: "4px 0 0", fontSize: 13, lineHeight: 1.55, color: c.charcoal }}>
                    {new Date(relatedEvent.created_at).toLocaleString()}
                  </p>
                </div>
              )}
              {changedStepLabel && (
                <div>
                  <p style={{ margin: 0, fontFamily: MONO, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: c.muted }}>What changed</p>
                  <p style={{ margin: "4px 0 0", fontSize: 13, lineHeight: 1.55, color: c.charcoal }}>
                    {`Checkpoint ${need.step_number || "—"} · ${changedStepLabel}`}
                  </p>
                </div>
              )}
              {relatedEvent?.reason && (
                <div>
                  <p style={{ margin: 0, fontFamily: MONO, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: c.muted }}>Why this was flagged</p>
                  <p style={{ margin: "4px 0 0", fontSize: 13, lineHeight: 1.55, color: c.charcoal }}>{relatedEvent.reason}</p>
                </div>
              )}
            </div>
            {onMarkReviewed && (
              <div style={{ marginTop: 16 }}>
                <button
                  type="button"
                  onClick={() => onReviewAction("reviewed")}
                  disabled={reviewBusy !== null}
                  style={{
                    padding: "10px 14px",
                    border: `1px solid ${c.line}`, borderRadius: 6,
                    background: c.surface, color: c.charcoal,
                    fontFamily: MONO, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em",
                    cursor: reviewBusy !== null ? "default" : "pointer",
                  }}
                >
                  {reviewBusy === "reviewed" ? "Saving…" : "Mark reviewed"}
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {/* Send back to review */}
      {canSendBackToReview && (
        <>
          <Divider />
          <button
            type="button"
            onClick={() => onReviewAction("send_back")}
            disabled={reviewBusy !== null}
            style={{
              padding: "10px 16px",
              border: `1px solid ${c.line}`, borderRadius: 6,
              background: c.surface, color: c.secondary,
              fontFamily: MONO, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em",
              cursor: reviewBusy !== null ? "default" : "pointer",
            }}
          >
            {reviewBusy === "send_back" ? "Saving…" : "Send back to review"}
          </button>
        </>
      )}

    </div>
  );
}

// ─── Lens switcher ────────────────────────────────────────────────────────────────

function LensSwitcher({
  active,
  onChange,
}: {
  active: InspectTab;
  onChange: (tab: InspectTab) => void;
}) {
  const visibleTabs = TABS.filter((tab) => {
    if (tab.panelSpecific) return true;
    const lensType = tab.id as LensType;
    if (!LENS_TYPES.includes(lensType)) return false;
    return isLensCompatible(lensType, "customer_need");
  });

  return (
    <div style={{
      borderBottom: `1px solid ${c.lineFaint}`,
      background: c.surface,
      padding: "0 24px",
      display: "flex",
      gap: 0,
      overflowX: "auto",
    }}>
      {visibleTabs.map((tab) => {
        const isActive = active === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            style={{
              fontFamily: MONO, fontSize: 8.5, textTransform: "uppercase", letterSpacing: "0.09em",
              color: isActive ? c.charcoal : c.muted,
              background: "none", border: "none",
              borderBottom: isActive ? `1px solid ${c.charcoal}` : "1px solid transparent",
              cursor: "pointer", padding: "10px 10px",
              transition: "color 0.12s, border-color 0.12s",
              whiteSpace: "nowrap",
              fontSize: 9,
              opacity: isActive ? 1 : 0.72,
            }}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────────

export default function NeedInspectPanel({
  open,
  onClose,
  need,
  staleNote,
  currentPhase: _currentPhase = "outside_signals",
  reviewHighlighted = false,
  onMarkReviewed,
  onSendBackToReview,
  routes = [],
  onRouteSelect,
  onInspectRoute,
  linkedRouteIds,
  shellMode = false,
  initialLens,
  onLensChange,
}: {
  open: boolean;
  onClose: () => void;
  need: OdiNeedRow | null;
  staleNote?: string | null;
  currentPhase?: EngagementPhase;
  reviewHighlighted?: boolean;
  onMarkReviewed?: (needId: string) => Promise<void>;
  onSendBackToReview?: (needId: string) => Promise<void>;
  routes?: RouteRow[];
  onRouteSelect?: (routeId: string) => void;
  onInspectRoute?: (routeId: string) => void;
  /** Route IDs that have a confirmed relationship to this need (shown as "Related routes"). */
  linkedRouteIds?: string[];
  /** When true, renders body only — Sheet is owned by InspectionShell. */
  shellMode?: boolean;
  /** Starting lens tab; use key prop to remount on need change. */
  initialLens?: string;
  /** Fires when the user switches lens tabs. */
  onLensChange?: (lens: string) => void;
}) {
  const [activeTab, setActiveTab] = useState<InspectTab>(() => {
    if (initialLens && TABS.some((t) => t.id === initialLens)) return initialLens as InspectTab;
    return "overview";
  });

  function switchTab(tab: InspectTab) {
    setActiveTab(tab);
    onLensChange?.(tab);
  }
  const [relatedEvent, setRelatedEvent] = useState<StrategicEvent | null>(null);
  const [relatedStepEvent, setRelatedStepEvent] = useState<StrategicEvent | null>(null);
  const [reviewBusy, setReviewBusy] = useState<"reviewed" | "send_back" | null>(null);

  const { data: provenance, isLoading: provenanceLoading, error: provenanceError } = useFoundationProvenance({
    companyId: need?.company_id,
    objectType: "odi_need",
    objectId: need?.id,
    enabled: open && Boolean(need?.id),
  });

  // Auto-switch to validation tab when review section is highlighted
  useEffect(() => {
    if (open && reviewHighlighted) setActiveTab("validation");
  }, [open, reviewHighlighted]);

  function handleOpenChange(v: boolean) {
    if (!v) {
      onClose();
      setActiveTab("overview");
    }
  }

  // Fetch the stale event that triggered review requirement
  useEffect(() => {
    if (!open || !need?.stale_since_event_id) {
      setRelatedEvent(null);
      setRelatedStepEvent(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const eventRes = await supabase
        .from("strategic_events")
        .select("*")
        .eq("id", need.stale_since_event_id)
        .maybeSingle();
      if (cancelled) return;
      const base = (eventRes.data as StrategicEvent | null) ?? null;
      setRelatedEvent(base);
      if (!base?.source_run_id || !need.company_id) { setRelatedStepEvent(null); return; }
      const stepRes = await supabase
        .from("strategic_events")
        .select("*")
        .eq("company_id", need.company_id)
        .eq("object_type", "job_step")
        .eq("source_run_id", base.source_run_id)
        .in("event_type", ["created", "updated", "deleted", "refreshed"])
        .order("created_at", { ascending: false })
        .limit(24);
      if (cancelled) return;
      const stepEvents = (stepRes.data ?? []) as StrategicEvent[];
      const matched = stepEvents.find((e) => {
        const prev = (e.previous_value ?? {}) as Record<string, unknown>;
        const next = (e.new_value ?? {}) as Record<string, unknown>;
        return (
          Number(next.step_number ?? prev.step_number ?? 0) === Number(need.step_number ?? 0) &&
          String(next.journey_key ?? prev.journey_key ?? "").toLowerCase() === String(need.journey_key ?? "").toLowerCase()
        );
      }) ?? null;
      setRelatedStepEvent(matched);
    })();
    return () => { cancelled = true; };
  }, [need?.company_id, need?.journey_key, need?.stale_since_event_id, need?.step_number, open]);

  const changedStepLabel = useMemo(() => {
    if (!relatedStepEvent) return null;
    const prev = (relatedStepEvent.previous_value ?? {}) as Record<string, unknown>;
    const next = (relatedStepEvent.new_value ?? {}) as Record<string, unknown>;
    return String(next.step_label || prev.step_label || need?.step_label || "").trim() || null;
  }, [need?.step_label, relatedStepEvent]);

  async function handleReviewAction(kind: "reviewed" | "send_back") {
    if (!need?.id) return;
    const handler = kind === "reviewed" ? onMarkReviewed : onSendBackToReview;
    if (!handler) return;
    setReviewBusy(kind);
    try {
      await handler(need.id);
      toast.success(kind === "reviewed" ? "Need marked reviewed." : "Need sent back to review.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Need review update failed.");
    } finally {
      setReviewBusy(null);
    }
  }

  // Derived state
  const dependencyState = String((need as unknown as Record<string, unknown>)?.dependency_state || "").toLowerCase();
  const requiresReview  = ["needs_review", "stale", "contradicted", "revalidate"].includes(dependencyState);
  const canSendBackToReview = dependencyState === "fresh" && Boolean(need?.last_reviewed_at) && Boolean(onSendBackToReview);
  const stillNeeded = need ? deriveStillNeeded(need) : [];

  // Header data
  const journeyKey    = need?.journey_key ?? "";
  const stepNumber    = need?.step_number ?? null;
  const stepLabelText = need?.step_label  ?? null;
  const stepLabelDisplay = stepLabelText ? rewriteJobContextPhrase(stepLabelText) : null;
  const contextParts  = [
    journeyKey        ? journeyLabel(journeyKey).toUpperCase() : null,
    stepNumber        ? `CHECKPOINT ${stepNumber}` : null,
    stepLabelDisplay  ? stepLabelDisplay.toUpperCase() : null,
  ].filter(Boolean);
  const contextLine = contextParts.join(" · ");

  // Verdict word only when survey-backed; otherwise the best-guess value band.
  const headerSurveyValidated = isSurveyValidated(need ?? undefined);
  const stateColor = headerSurveyValidated ? serviceStateColor(need?.service_state ?? "") : c.teal;
  const stateLabelText = headerSurveyValidated
    ? serviceStateLabelText(need?.service_state ?? "")
    : needBestGuessBandLabel(need);

  // onInspectRoute takes priority over legacy onRouteSelect
  const handleInspectRoute = onInspectRoute ?? onRouteSelect;

  function body() {
    if (!need) return null;
    return (
      <div style={{
        display: "flex", flexDirection: "column",
        ...(shellMode ? { flex: 1, minHeight: 0 } : { height: "100%" }),
        background: c.bg,
      }}>

        {/* Stale banner */}
        {staleNote && (
          <div style={{
            padding: "6px 24px", display: "flex", alignItems: "center", gap: 8,
            background: `${c.amber}18`, borderBottom: `1px solid ${c.amber}50`,
          }}>
            <Mono size={9} color={c.amber}>⚑ {staleNote}</Mono>
          </div>
        )}

        {/* ── Fixed header ── */}
        <div style={{ padding: "20px 24px 16px", background: c.surface, borderBottom: `1px solid ${c.lineFaint}`, flexShrink: 0 }}>
          {/* Stats row */}
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span style={{
              fontFamily: MONO, fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.10em",
              color: stateColor, borderLeft: `2px solid ${stateColor}`,
              padding: "0 0 0 7px",
            }}>
              {stateLabelText}
            </span>
            {need.importance != null && (
              <span style={{ fontFamily: MONO, fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.10em", color: c.muted }}>
                imp {need.importance}/10
              </span>
            )}
            {need.satisfaction != null && (
              <span style={{ fontFamily: MONO, fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.10em", color: c.muted }}>
                sat {need.satisfaction}/10
              </span>
            )}
            {need.opportunity_score != null && (
              <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 600, color: c.secondary }}>
                score {Math.round(need.opportunity_score)}
              </span>
            )}
          </div>

          {/* Context line */}
          {contextLine && (
            <p style={{ margin: "0 0 6px", fontFamily: MONO, fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.10em", color: c.muted }}>
              {contextLine}
            </p>
          )}

          {/* Desired outcome */}
          <h2 style={{ margin: 0, fontFamily: "Inter, sans-serif", fontSize: 17, fontWeight: 600, lineHeight: 1.35, color: c.ink }}>
            {need.desired_outcome || "Untitled need"}
          </h2>
        </div>

        {/* ── Lens switcher ── */}
        <div style={{ flexShrink: 0 }}>
          <LensSwitcher active={activeTab} onChange={switchTab} />
        </div>

        {/* ── Scrollable content ── */}
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
          {activeTab === "overview" && (
            <OverviewLens need={need} routes={routes} onInspectRoute={handleInspectRoute} linkedRouteIds={linkedRouteIds} />
          )}
          {activeTab === "customer_reality" && (
            <CustomerRealityLens
              need={need}
              routes={routes}
              onInspectRoute={handleInspectRoute}
            />
          )}
          {activeTab === "evidence" && (
            <EvidenceLens
              need={need}
              provenance={provenance}
              provenanceLoading={provenanceLoading}
              provenanceError={provenanceError}
            />
          )}
          {activeTab === "validation" && (
            <ValidationLens
              need={need}
              relatedEvent={relatedEvent}
              changedStepLabel={changedStepLabel}
              reviewHighlighted={reviewHighlighted}
              reviewBusy={reviewBusy}
              stillNeeded={stillNeeded}
              requiresReview={requiresReview}
              canSendBackToReview={canSendBackToReview}
              onMarkReviewed={onMarkReviewed}
              onReviewAction={(kind) => void handleReviewAction(kind)}
            />
          )}
        </div>

        {/* ── Footer ── */}
        <div style={{
          padding: "12px 24px",
          borderTop: `1px solid ${c.lineFaint}`,
          background: c.surface,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexShrink: 0,
        }}>
          <Mono size={9} color={c.muted}>
            {TABS.find((t) => t.id === activeTab)?.label ?? activeTab}
          </Mono>
          <button
            type="button"
            onClick={() => handleOpenChange(false)}
            style={{
              fontFamily: MONO, fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.10em",
              color: c.muted, background: "none",
              border: "none",
              padding: 0, cursor: "pointer",
            }}
          >
            Close
          </button>
        </div>

      </div>
    );
  }

  if (shellMode) {
    return body();
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="right"
        className="sm:max-w-[600px] flex flex-col p-0 overflow-hidden"
        aria-label={need ? `Inspect need: ${need.desired_outcome?.slice(0, 60) ?? ""}` : "Need inspection panel"}
      >
        {body()}
      </SheetContent>
    </Sheet>
  );
}
