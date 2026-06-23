/**
 * StrategicDirectionInspectPanel — canonical object inspection surface for StrategicDirection.
 *
 * Architecture: third canonical inspection surface in the strategic object graph, following
 * RouteInspectPanel and NeedInspectPanel. Uses the same shellMode / lens-switcher / footer
 * rhythm. StrategicDirection is a per-company singleton, so objectId == companyId.
 *
 * Lenses implemented (mapped to LENS_SUPPORTED_OBJECTS["strategic_direction"]):
 *   overview        — panel-specific landing state
 *   strategy_cascade — how the direction holds together as a cascade
 *   positioning     — what claim space this direction pushes toward
 *   evidence        — source distribution, gaps, customer validation status
 *   validation      — assumptions, what could make this wrong
 *
 * Read-only. Editing happens in Strategy and Positioning pages.
 */

import { useState, useMemo } from "react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useStrategyCascade } from "@/hooks/useStrategyCascade";
import { usePositioningCanvas } from "@/hooks/usePositioningCanvas";
import type { RouteRow } from "@/hooks/useRoutes";
import type { StrategyCascade, CascadeItem, CascadeAssumption } from "@/lib/types";
import { LENS_TYPES, isLensCompatible, type LensType } from "@/lib/strategicObjects";
import { deriveDirectionRealizesRoutes } from "@/lib/strategicObjectRelationships";
import {
  buildPositioningLensNarrative,
  type PositioningPosture,
  type CoherenceSignal,
} from "@/lib/positioningLensNarrative";
import type { OdiNeedRow } from "@/hooks/useOdiNeeds";
import {
  buildCustomerRealityNarrative,
  type CustomerRealityPosture,
} from "@/lib/customerRealityNarrative";

// ─── Design tokens ───────────────────────────────────────────────────────────────

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

// ─── Primitive components ────────────────────────────────────────────────────────

function Mono({ children, size = 10, color = c.muted, bold = false }: {
  children: React.ReactNode; size?: number; color?: string; bold?: boolean;
}) {
  return (
    <span style={{ fontFamily: MONO, fontSize: size, textTransform: "uppercase", letterSpacing: "0.10em", color, fontWeight: bold ? 600 : 400 }}>
      {children}
    </span>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <p style={{ margin: "0 0 8px", fontFamily: MONO, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.10em", color: c.muted, opacity: 0.75 }}>
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
      <span style={{ fontFamily: "Inter, sans-serif", fontSize: 13, lineHeight: 1.6, color: c.secondary }}>{text}</span>
    </div>
  );
}

function ProseBlock({ text, placeholder }: { text: string; placeholder?: string }) {
  if (!text.trim()) {
    return (
      <p style={{ margin: 0, fontFamily: "Inter, sans-serif", fontSize: 13, color: c.muted, fontStyle: "italic" }}>
        {placeholder ?? "Not yet defined."}
      </p>
    );
  }
  return (
    <p style={{ margin: 0, fontFamily: "Inter, sans-serif", fontSize: 13, lineHeight: 1.65, color: c.secondary }}>
      {text}
    </p>
  );
}

function CapabilityRow({ item }: { item: CascadeItem }) {
  const statusColor =
    item.status === "strong" ? c.teal :
    item.status === "developing" ? c.amber : c.coral;
  const statusLabel =
    item.status === "strong" ? "Strong" :
    item.status === "developing" ? "Building" : "Gap";

  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12,
      padding: "5px 0 5px 10px", borderLeft: `2px solid ${statusColor}40` }}>
      <span style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, color: c.secondary, flex: 1, lineHeight: 1.5 }}>
        {item.name}
      </span>
      <span style={{
        fontFamily: MONO, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.07em",
        color: statusColor, flexShrink: 0,
      }}>
        {statusLabel}
      </span>
    </div>
  );
}

// ─── Confidence posture derivation ────────────────────────────────────────────────

function deriveConfidencePosture(cascade: StrategyCascade | null): {
  label: "none" | "low" | "moderate" | "strong";
  description: string;
  caveats: string[];
} {
  if (!cascade) return { label: "none", description: "No strategic direction defined yet.", caveats: [] };

  const hasAspiration = cascade.winning_aspiration.trim().length > 20;
  const hasWhereToPlay = cascade.where_to_play.trim().length > 20;
  const hasHowToWin = cascade.how_to_win.trim().length > 20;
  const hasCapabilities = cascade.capabilities.length > 0;
  const coreCount = [hasAspiration, hasWhereToPlay, hasHowToWin].filter(Boolean).length;
  const untestedCount = cascade.assumptions.filter((a) => !a.tested).length;

  const caveats: string[] = [];
  if (untestedCount > 0) caveats.push(`${untestedCount} assumption${untestedCount > 1 ? "s" : ""} still untested.`);
  if (!hasCapabilities) caveats.push("Capabilities not yet mapped to this direction.");

  if (coreCount === 3 && untestedCount === 0) {
    return { label: "strong", description: "Core cascade is complete with all assumptions tested.", caveats };
  }
  if (coreCount === 3) {
    return { label: "moderate", description: "Core strategic direction is defined — validation of underlying assumptions would strengthen confidence.", caveats };
  }
  if (coreCount >= 2) {
    return { label: "low", description: "Strategic direction is partially defined. Complete the cascade to improve confidence.", caveats };
  }
  return { label: "none", description: "Strategic direction is not yet defined.", caveats };
}

function confidenceColor(label: string): string {
  if (label === "strong") return c.teal;
  if (label === "moderate") return c.amber;
  if (label === "low") return c.coral;
  return c.muted;
}

// ─── Lens: Overview ───────────────────────────────────────────────────────────────

function OverviewLens({
  cascade,
  cascadeLoading,
  companyId,
  routes,
  onInspectRoute,
}: {
  cascade: StrategyCascade | null;
  cascadeLoading: boolean;
  companyId: string;
  routes: RouteRow[];
  onInspectRoute?: (routeId: string) => void;
}) {
  const posture = deriveConfidencePosture(cascade);
  const color = confidenceColor(posture.label);
  const untestedAssumptions = (cascade?.assumptions ?? []).filter((a) => !a.tested).slice(0, 3);

  // Derive which routes genuinely align with the direction
  const derivedRels = useMemo(
    () => cascade ? deriveDirectionRealizesRoutes(cascade, companyId, routes) : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cascade?.winning_aspiration, cascade?.where_to_play, cascade?.how_to_win, companyId, routes.map((r) => r.id).join(",")],
  );
  const relMap = new Map(derivedRels.map((r) => [r.toId, r]));

  // HIGH or MEDIUM → "Routes aligned with this direction"
  const alignedRoutes = routes
    .filter((r) => {
      const rel = relMap.get(r.id);
      return rel && rel.strength !== "low";
    })
    .slice(0, 5);
  const alignedIds = new Set(alignedRoutes.map((r) => r.id));

  // Remaining → "Routes in this project" (quiet navigation, no implied relationship)
  const projectRoutes = routes.filter((r) => !alignedIds.has(r.id)).slice(0, 3);
  const moreAlignedCount = Math.max(0, routes.filter((r) => !alignedIds.has(r.id) === false && !alignedRoutes.some((a) => a.id === r.id)).length);
  const moreProjectCount = Math.max(0, routes.filter((r) => !alignedIds.has(r.id)).length - 3);

  if (cascadeLoading) {
    return (
      <div style={{ padding: "24px", fontFamily: "Inter, sans-serif", fontSize: 13, color: c.muted, fontStyle: "italic" }}>
        Loading strategic direction…
      </div>
    );
  }

  if (!cascade) {
    return (
      <div style={{ padding: "24px", fontFamily: "Inter, sans-serif", fontSize: 13, color: c.muted, fontStyle: "italic" }}>
        No strategic direction defined yet. Set it in the Strategy workshop.
      </div>
    );
  }

  return (
    <div style={{ padding: "20px 24px 32px", display: "flex", flexDirection: "column", gap: 20 }}>

      {/* Winning aspiration */}
      <div>
        <SectionLabel>What we are betting on</SectionLabel>
        <ProseBlock text={cascade.winning_aspiration} placeholder="Winning aspiration not yet set." />
      </div>

      <Divider />

      {/* Where / How */}
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div>
          <SectionLabel>Where we play</SectionLabel>
          <ProseBlock text={cascade.where_to_play} placeholder="Where-to-play not yet set." />
        </div>
        <div>
          <SectionLabel>How we win</SectionLabel>
          <ProseBlock text={cascade.how_to_win} placeholder="How-to-win not yet set." />
        </div>
      </div>

      <Divider />

      {/* Confidence posture */}
      <div>
        <SectionLabel>Confidence posture</SectionLabel>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <span style={{
            fontFamily: MONO, fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.09em",
            color, borderLeft: `2px solid ${color}`, paddingLeft: 7,
          }}>
            {posture.label === "none" ? "Undefined" : posture.label.charAt(0).toUpperCase() + posture.label.slice(1)}
          </span>
        </div>
        <p style={{ margin: 0, fontFamily: "Inter, sans-serif", fontSize: 13, lineHeight: 1.6, color: c.secondary }}>
          {posture.description}
        </p>
        {posture.caveats.length > 0 && (
          <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
            {posture.caveats.map((c_, i) => (
              <p key={i} style={{ margin: 0, fontFamily: "Inter, sans-serif", fontSize: 12, color: c.muted }}>
                {c_}
              </p>
            ))}
          </div>
        )}
      </div>

      {/* Key untested assumptions */}
      {untestedAssumptions.length > 0 && (
        <>
          <Divider />
          <div>
            <SectionLabel>Key assumptions not yet tested</SectionLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {untestedAssumptions.map((a, i) => (
                <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                  <span style={{ color: c.coral, flexShrink: 0, lineHeight: 1.6 }}>○</span>
                  <span style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, lineHeight: 1.55, color: c.secondary }}>
                    {a.assumption}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Route relationship sections */}
      {(alignedRoutes.length > 0 || projectRoutes.length > 0) && (
        <>
          <Divider />
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

            {/* Aligned routes — high or medium derived alignment */}
            {alignedRoutes.length > 0 && (
              <div>
                <SectionLabel>Routes aligned with this direction</SectionLabel>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {alignedRoutes.map((route) => {
                    const rel     = relMap.get(route.id);
                    const catKey  = String(route.category || "improve").toLowerCase();
                    const catColor = catKey === "fix" ? c.coral : catKey === "improve" ? c.amber : c.teal;
                    const accent  = rel?.strength === "high" ? c.teal : c.amber;
                    return (
                      <div key={route.id} style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        padding: "5px 0 5px 10px",
                        borderLeft: `2px solid ${accent}60`,
                      }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ fontFamily: MONO, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.08em", color: catColor, marginRight: 8 }}>
                            {catKey}
                          </span>
                          <span style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, color: c.secondary }}>
                            {route.title}
                          </span>
                          {rel && (
                            <span style={{ marginLeft: 8, fontFamily: MONO, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.06em", color: accent, opacity: 0.8 }}>
                              {rel.strength === "high" ? "✓ direct" : "~ aligned"}
                            </span>
                          )}
                        </div>
                        {onInspectRoute && (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); onInspectRoute(route.id); }}
                            style={{ fontFamily: MONO, fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.08em", color: c.muted, background: "none", border: "none", cursor: "pointer", padding: "0 0 0 8px", textDecoration: "underline", flexShrink: 0 }}
                          >
                            Inspect →
                          </button>
                        )}
                      </div>
                    );
                  })}
                  {moreAlignedCount > 0 && (
                    <p style={{ margin: 0, fontFamily: MONO, fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.08em", color: c.muted }}>
                      +{moreAlignedCount} more aligned routes
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Project routes — quiet navigation, no implied relationship */}
            {projectRoutes.length > 0 && (
              <div>
                <SectionLabel>Routes in this project</SectionLabel>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {projectRoutes.map((route) => {
                    const catKey   = String(route.category || "improve").toLowerCase();
                    const catColor = catKey === "fix" ? c.coral : catKey === "improve" ? c.amber : c.teal;
                    return (
                      <div key={route.id} style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        padding: "5px 0 5px 10px",
                        borderLeft: `2px solid ${c.line}`,
                      }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ fontFamily: MONO, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.08em", color: catColor, marginRight: 8 }}>
                            {catKey}
                          </span>
                          <span style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, color: c.secondary }}>
                            {route.title}
                          </span>
                        </div>
                        {onInspectRoute && (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); onInspectRoute(route.id); }}
                            style={{ fontFamily: MONO, fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.08em", color: c.muted, background: "none", border: "none", cursor: "pointer", padding: "0 0 0 8px", textDecoration: "underline", flexShrink: 0 }}
                          >
                            Inspect →
                          </button>
                        )}
                      </div>
                    );
                  })}
                  {moreProjectCount > 0 && (
                    <p style={{ margin: 0, fontFamily: MONO, fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.08em", color: c.muted }}>
                      +{moreProjectCount} more routes
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Lens: Strategy Cascade ────────────────────────────────────────────────────────

function StrategyCascadeLens({ cascade, cascadeLoading }: { cascade: StrategyCascade | null; cascadeLoading: boolean }) {
  if (cascadeLoading) return <div style={{ padding: "24px", fontFamily: "Inter, sans-serif", fontSize: 13, color: c.muted, fontStyle: "italic" }}>Loading…</div>;
  if (!cascade) return <div style={{ padding: "24px", fontFamily: "Inter, sans-serif", fontSize: 13, color: c.muted, fontStyle: "italic" }}>No cascade defined yet.</div>;

  const strongCaps = cascade.capabilities.filter((cap) => cap.status === "strong");
  const gapCaps = cascade.capabilities.filter((cap) => cap.status === "gap");

  return (
    <div style={{ padding: "20px 24px 32px", display: "flex", flexDirection: "column", gap: 20 }}>

      {/* What we're winning at */}
      <div>
        <SectionLabel>What we're winning at</SectionLabel>
        <ProseBlock text={cascade.winning_aspiration} placeholder="Not yet defined." />
      </div>

      <Divider />

      {/* Where we compete */}
      <div>
        <SectionLabel>Where we compete</SectionLabel>
        <ProseBlock text={cascade.where_to_play} placeholder="Not yet defined." />
      </div>

      <Divider />

      {/* How we create advantage */}
      <div>
        <SectionLabel>How we create advantage</SectionLabel>
        <ProseBlock text={cascade.how_to_win} placeholder="Not yet defined." />
      </div>

      {/* Capabilities */}
      {cascade.capabilities.length > 0 && (
        <>
          <Divider />
          <div>
            <SectionLabel>
              {`Capabilities — ${strongCaps.length} strong, ${gapCaps.length} gap${gapCaps.length !== 1 ? "s" : ""}`}
            </SectionLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {cascade.capabilities.map((cap, i) => <CapabilityRow key={i} item={cap} />)}
            </div>
          </div>
        </>
      )}

      {/* Operating processes */}
      {cascade.management_systems.length > 0 && (
        <>
          <Divider />
          <div>
            <SectionLabel>Operating processes</SectionLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {cascade.management_systems.map((sys, i) => <CapabilityRow key={i} item={sys} />)}
            </div>
          </div>
        </>
      )}

      {cascade.capabilities.length === 0 && cascade.management_systems.length === 0 && (
        <p style={{ fontFamily: "Inter, sans-serif", fontSize: 13, color: c.muted, fontStyle: "italic" }}>
          Capabilities and operating processes not yet mapped. Add them in the Strategy workshop.
        </p>
      )}
    </div>
  );
}

// ─── Lens: Positioning ─────────────────────────────────────────────────────────────

function postureColor(posture: PositioningPosture): string {
  switch (posture) {
    case "coherent":     return c.teal;
    case "emerging":     return c.amber;
    case "fragmented":   return c.coral;
    case "contradicted": return c.coral;
    case "inherited":    return c.muted;
  }
}

function coherenceBadgeStyle(signal: CoherenceSignal): React.CSSProperties {
  const base: React.CSSProperties = {
    fontFamily: MONO, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.09em",
    borderLeft: "2px solid", paddingLeft: 7,
  };
  if (signal === "reinforces") return { ...base, color: c.teal,  borderLeftColor: c.teal };
  if (signal === "weakens")    return { ...base, color: c.coral, borderLeftColor: c.coral };
  if (signal === "mixed")      return { ...base, color: c.amber, borderLeftColor: c.amber };
  return { ...base, color: c.muted, borderLeftColor: c.muted };
}

function PositioningLens({
  positioningLoading,
  positioning,
  cascade,
  routes,
}: {
  positioningLoading: boolean;
  positioning: import("@/lib/types").PositioningCanvas | null;
  cascade: StrategyCascade | null;
  routes: RouteRow[];
}) {
  const narrative = useMemo(
    () => buildPositioningLensNarrative(positioning, cascade, routes),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [positioning, cascade, routes.map((r) => r.id).join(",")],
  );

  if (positioningLoading) return <div style={{ padding: "24px", fontFamily: "Inter, sans-serif", fontSize: 13, color: c.muted, fontStyle: "italic" }}>Loading…</div>;

  const postureAccent = postureColor(narrative.posture);

  return (
    <div style={{ padding: "20px 24px 32px", display: "flex", flexDirection: "column", gap: 20 }}>

      {/* Posture headline */}
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <span style={{
            fontFamily: MONO, fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.09em",
            color: postureAccent, borderLeft: `2px solid ${postureAccent}`, paddingLeft: 7,
          }}>
            {narrative.posture}
          </span>
        </div>
        <p style={{ margin: 0, fontFamily: "Inter, sans-serif", fontSize: 13.5, lineHeight: 1.55, fontWeight: 500, color: c.ink }}>
          {narrative.postureHeadline}
        </p>
      </div>

      {/* Market perception vs. intended identity */}
      {(narrative.marketPerception || narrative.intendedIdentity) && (
        <>
          <Divider />
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {narrative.marketPerception && (
              <div>
                <SectionLabel>Market perception</SectionLabel>
                <p style={{ margin: 0, fontFamily: "Inter, sans-serif", fontSize: 13, lineHeight: 1.6, color: c.secondary }}>
                  {narrative.marketPerception}
                </p>
              </div>
            )}
            {narrative.intendedIdentity && (
              <div>
                <SectionLabel>Strategic direction</SectionLabel>
                <p style={{ margin: 0, fontFamily: "Inter, sans-serif", fontSize: 13, lineHeight: 1.6, color: c.secondary }}>
                  {narrative.intendedIdentity}
                </p>
              </div>
            )}
          </div>
        </>
      )}

      {/* Tensions */}
      {narrative.tensions.length > 0 && (
        <>
          <Divider />
          <div>
            <SectionLabel>Tensions</SectionLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {narrative.tensions.map((t, i) => (
                <div key={i} style={{ borderLeft: `2px solid ${c.coral}60`, paddingLeft: 10 }}>
                  <p style={{ margin: "0 0 2px", fontFamily: MONO, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.10em", color: c.coral }}>
                    {t.between} vs. {t.and}
                  </p>
                  <p style={{ margin: 0, fontFamily: "Inter, sans-serif", fontSize: 12.5, lineHeight: 1.5, color: c.secondary }}>
                    {t.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Reinforcing routes */}
      {narrative.reinforcingRoutes.length > 0 && (
        <>
          <Divider />
          <div>
            <SectionLabel>Routes reinforcing this direction</SectionLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {narrative.reinforcingRoutes.map((r) => (
                <div key={r.routeId} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                  <span style={coherenceBadgeStyle(r.coherenceSignal)}>
                    {r.category}
                  </span>
                  <div>
                    <p style={{ margin: "0 0 2px", fontFamily: "Inter, sans-serif", fontSize: 12.5, fontWeight: 500, color: c.charcoal }}>
                      {r.routeTitle}
                    </p>
                    <p style={{ margin: 0, fontFamily: "Inter, sans-serif", fontSize: 12, lineHeight: 1.5, color: c.muted }}>
                      {r.claimReinforced}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Contradicting routes */}
      {narrative.contradictingRoutes.length > 0 && (
        <>
          <Divider />
          <div>
            <SectionLabel>Routes sending conflicting signals</SectionLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {narrative.contradictingRoutes.map((r) => (
                <div key={r.routeId} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                  <span style={coherenceBadgeStyle(r.coherenceSignal)}>
                    {r.category}
                  </span>
                  <div>
                    <p style={{ margin: "0 0 2px", fontFamily: "Inter, sans-serif", fontSize: 12.5, fontWeight: 500, color: c.charcoal }}>
                      {r.routeTitle}
                    </p>
                    {r.tensionNavigated && (
                      <p style={{ margin: 0, fontFamily: "Inter, sans-serif", fontSize: 12, lineHeight: 1.5, color: c.coral }}>
                        {r.tensionNavigated}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Customer proof status */}
      <Divider />
      <div>
        <SectionLabel>Customer validation status</SectionLabel>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <span style={{
            fontFamily: MONO, fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.09em",
            color: narrative.customerProofStatus === "present" ? c.teal : narrative.customerProofStatus === "partial" ? c.amber : c.coral,
            borderLeft: `2px solid ${narrative.customerProofStatus === "present" ? c.teal : narrative.customerProofStatus === "partial" ? c.amber : c.coral}`,
            paddingLeft: 7,
          }}>
            {narrative.customerProofStatus}
          </span>
        </div>
        <p style={{ margin: 0, fontFamily: "Inter, sans-serif", fontSize: 12.5, lineHeight: 1.5, color: c.muted }}>
          {narrative.customerProofNote}
        </p>
      </div>

      {/* What would strengthen */}
      {narrative.wouldStrengthen.length > 0 && (
        <>
          <Divider />
          <div>
            <SectionLabel>What would strengthen this</SectionLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {narrative.wouldStrengthen.map((s, i) => (
                <Bullet key={i} text={s} />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Lens: Evidence ───────────────────────────────────────────────────────────────

function EvidenceLens({
  cascade,
  positioning,
  cascadeLoading,
}: {
  cascade: StrategyCascade | null;
  positioning: import("@/lib/types").PositioningCanvas | null;
  cascadeLoading: boolean;
}) {
  if (cascadeLoading) return <div style={{ padding: "24px", fontFamily: "Inter, sans-serif", fontSize: 13, color: c.muted, fontStyle: "italic" }}>Loading…</div>;

  type TierCell = { label: string; present: boolean; detail: string };
  const tiers: TierCell[] = [
    {
      label: "Outside Signals",
      present: !!(positioning?.competitive_alternatives.length || positioning?.market_category),
      detail: positioning?.market_category ? `Market: ${positioning.market_category}` : "Competitive alternatives mapped.",
    },
    {
      label: "Organization Signals",
      present: !!(cascade?.capabilities.length || cascade?.management_systems.length),
      detail: cascade?.capabilities.length
        ? `${cascade.capabilities.length} capabilities mapped.`
        : "No org capabilities recorded.",
    },
    {
      label: "Customer Signals",
      present: false,
      detail: "Not yet classified.",
    },
    {
      label: "Market Validation",
      present: false,
      detail: "Not yet classified.",
    },
  ];

  const inPlace: string[] = [];
  const missing: string[] = [];

  if (cascade?.winning_aspiration.trim().length) inPlace.push("Winning aspiration");
  else missing.push("Winning aspiration");
  if (cascade?.where_to_play.trim().length) inPlace.push("Where to play");
  else missing.push("Where to play");
  if (cascade?.how_to_win.trim().length) inPlace.push("How to win");
  else missing.push("How to win");
  if (cascade && cascade.capabilities.length > 0) inPlace.push("Capabilities");
  else missing.push("Capabilities");
  if (positioning?.value_for_customer?.trim()) inPlace.push("Positioning value statement");
  else missing.push("Positioning value statement");
  if (positioning?.best_fit_customers?.trim()) inPlace.push("Best-fit customer profile");
  else missing.push("Best-fit customer profile");

  const untestedCount = (cascade?.assumptions ?? []).filter((a) => !a.tested).length;

  return (
    <div style={{ padding: "20px 24px 32px", display: "flex", flexDirection: "column", gap: 20 }}>

      {/* Source tier grid */}
      <div>
        <SectionLabel>Source signal layers</SectionLabel>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 }}>
          {tiers.map((tier) => (
            <div key={tier.label} style={{
              padding: "4px 0 4px 10px",
              borderLeft: `2px solid ${tier.present ? c.teal : c.line}`,
            }}>
              <div style={{ fontFamily: MONO, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.09em",
                color: tier.present ? c.teal : c.muted, opacity: tier.present ? 1 : 0.65 }}>
                {tier.present ? "✓" : "—"}&nbsp;&nbsp;{tier.label}
              </div>
              {tier.present && (
                <p style={{ margin: "3px 0 0", fontFamily: "Inter, sans-serif", fontSize: 11, color: c.secondary, lineHeight: 1.4 }}>
                  {tier.detail}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>

      <Divider />

      {/* What's in place */}
      {inPlace.length > 0 && (
        <div>
          <SectionLabel>What's in place</SectionLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {inPlace.map((item) => (
              <div key={item} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ color: c.teal, fontSize: 11 }}>◉</span>
                <span style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, color: c.secondary }}>{item}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* What's missing */}
      {missing.length > 0 && (
        <>
          <Divider />
          <div>
            <SectionLabel>What's missing</SectionLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {missing.map((item) => (
                <div key={item} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ color: c.coral, fontSize: 11 }}>○</span>
                  <span style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, color: c.muted }}>{item}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Customer validation */}
      <Divider />
      <div>
        <SectionLabel>Customer validation</SectionLabel>
        <p style={{ margin: 0, fontFamily: "Inter, sans-serif", fontSize: 13, lineHeight: 1.6, color: c.secondary }}>
          {untestedCount > 0
            ? `${untestedCount} assumption${untestedCount > 1 ? "s" : ""} underlying this direction have not been validated with customers. Validate them in the Validation tab.`
            : (cascade?.assumptions.length ?? 0) > 0
              ? "All recorded assumptions have been tested. Customer validation is in place."
              : "No assumptions recorded yet. Run analysis to surface what needs validation."}
        </p>
      </div>
    </div>
  );
}

// ─── Lens: Validation ─────────────────────────────────────────────────────────────

function ValidationLens({ cascade, cascadeLoading }: { cascade: StrategyCascade | null; cascadeLoading: boolean }) {
  if (cascadeLoading) return <div style={{ padding: "24px", fontFamily: "Inter, sans-serif", fontSize: 13, color: c.muted, fontStyle: "italic" }}>Loading…</div>;
  if (!cascade) return <div style={{ padding: "24px", fontFamily: "Inter, sans-serif", fontSize: 13, color: c.muted, fontStyle: "italic" }}>No direction to validate yet.</div>;

  const assumptions = cascade.assumptions;
  const tested = assumptions.filter((a) => a.tested);
  const untested = assumptions.filter((a) => !a.tested);

  function deriveWouldRaiseConfidence(cascade: StrategyCascade): string[] {
    const out: string[] = [];
    if (untested.length > 0) out.push("Validating untested assumptions would directly raise confidence in this direction.");
    if (!cascade.capabilities.length) out.push("Mapping capabilities would clarify how this direction is resourced.");
    if (!cascade.management_systems.length) out.push("Defining operating processes would show how this direction is reinforced day-to-day.");
    if (out.length === 0) out.push("Continue strengthening evidence across the source layers shown in the Evidence tab.");
    return out;
  }

  const raisers = deriveWouldRaiseConfidence(cascade);

  // Surface a directional contradiction if how-to-win and capabilities diverge
  const gapCaps = cascade.capabilities.filter((c) => c.status === "gap");
  const contradictions: string[] = [];
  if (gapCaps.length > 0 && cascade.how_to_win.trim().length > 0) {
    contradictions.push(`${gapCaps.length} capability gap${gapCaps.length > 1 ? "s" : ""} may conflict with the "how to win" — resolve these before committing to this direction.`);
  }

  return (
    <div style={{ padding: "20px 24px 32px", display: "flex", flexDirection: "column", gap: 20 }}>

      {/* Assumptions list */}
      <div>
        <SectionLabel>
          {assumptions.length > 0
            ? `${assumptions.length} assumption${assumptions.length !== 1 ? "s" : ""} — ${tested.length} tested, ${untested.length} not`
            : "Underlying assumptions"}
        </SectionLabel>

        {assumptions.length === 0 ? (
          <p style={{ margin: 0, fontFamily: "Inter, sans-serif", fontSize: 13, color: c.muted, fontStyle: "italic" }}>
            No assumptions recorded yet. Add them in the Strategy workshop.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {assumptions.map((assumption: CascadeAssumption, i: number) => (
              <div key={i} style={{
                padding: "4px 0 4px 10px",
                borderLeft: `2px solid ${assumption.tested ? c.teal : c.coral}60`,
              }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                  <p style={{ margin: 0, fontFamily: "Inter, sans-serif", fontSize: 12.5, lineHeight: 1.55, color: c.charcoal, flex: 1 }}>
                    {assumption.assumption}
                  </p>
                  <span style={{
                    fontFamily: MONO, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.07em",
                    color: assumption.tested ? c.teal : c.coral, flexShrink: 0,
                  }}>
                    {assumption.tested ? "Tested" : "Untested"}
                  </span>
                </div>
                {assumption.note && (
                  <p style={{ margin: "4px 0 0", fontFamily: "Inter, sans-serif", fontSize: 11.5, color: c.muted, lineHeight: 1.4 }}>
                    {assumption.note}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* What would raise confidence */}
      <Divider />
      <div>
        <SectionLabel>What would raise confidence</SectionLabel>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {raisers.map((r, i) => (
            <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
              <span style={{ color: c.muted, flexShrink: 0, marginTop: 1, fontSize: 14 }}>·</span>
              <span style={{ fontFamily: "Inter, sans-serif", fontSize: 13, lineHeight: 1.6, color: c.secondary }}>{r}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Contradictions */}
      {contradictions.length > 0 && (
        <>
          <Divider />
          <div>
            <SectionLabel>Contradictions to watch</SectionLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {contradictions.map((con, i) => (
                <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "3px 0 3px 10px", borderLeft: `2px solid ${c.amber}70` }}>
                  <span style={{ color: c.amber, flexShrink: 0, lineHeight: 1.6, fontSize: 12 }}>⚑</span>
                  <span style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, lineHeight: 1.55, color: c.secondary }}>{con}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Lens switcher ────────────────────────────────────────────────────────────────

type DirectionInspectTab = "overview" | Extract<LensType, "customer_reality" | "strategy_cascade" | "positioning" | "evidence" | "validation">;

const TABS: { id: DirectionInspectTab; label: string }[] = [
  { id: "overview",         label: "Overview" },
  { id: "customer_reality", label: "Customer Reality" },
  { id: "strategy_cascade", label: "Cascade" },
  { id: "positioning",      label: "Positioning" },
  { id: "evidence",         label: "Evidence" },
  { id: "validation",       label: "Validation" },
];

// Compile-time guard: non-overview tabs must be valid LensType values.
const _tabCheck = TABS.slice(1).map((t) => { const _: LensType = t.id; return _; });
void _tabCheck;

// ─── Lens: Customer Reality ───────────────────────────────────────────────────────

function customerPostureColor(posture: CustomerRealityPosture): string {
  switch (posture) {
    case "grounded":     return c.teal;
    case "converging":   return c.teal;
    case "directional":  return c.amber;
    case "fragmented":   return c.amber;
    case "contradicted": return c.coral;
    case "inferred":     return c.muted;
  }
}

function DirectionCustomerRealityLens({
  needs,
  routes,
  cascade,
}: {
  needs: OdiNeedRow[];
  routes: RouteRow[];
  cascade: StrategyCascade | null;
}) {
  const narrative = useMemo(
    () => buildCustomerRealityNarrative(needs, routes, cascade),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [needs.map((n) => n.id).join(","), routes.map((r) => r.id).join(","), cascade],
  );

  const accent = customerPostureColor(narrative.posture);

  return (
    <div style={{ padding: "20px 24px 32px", display: "flex", flexDirection: "column", gap: 20 }}>

      {/* Posture + headline */}
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <span style={{
            fontFamily: MONO, fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.09em",
            color: accent, borderLeft: `2px solid ${accent}`, paddingLeft: 7,
          }}>
            {narrative.posture}
          </span>
        </div>
        <p style={{ margin: 0, fontFamily: "Inter, sans-serif", fontSize: 13.5, lineHeight: 1.55, fontWeight: 500, color: c.ink }}>
          {narrative.postureHeadline}
        </p>
      </div>

      {/* Validated vs inferred counts */}
      <Divider />
      <div style={{ display: "flex", gap: 20 }}>
        <div>
          <div style={{ fontFamily: MONO, fontSize: 20, fontWeight: 600, color: narrative.validatedNeedCount > 0 ? c.teal : c.muted }}>
            {narrative.validatedNeedCount}
          </div>
          <div style={{ fontFamily: MONO, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.10em", color: c.muted, marginTop: 2 }}>
            Validated
          </div>
        </div>
        <div>
          <div style={{ fontFamily: MONO, fontSize: 20, fontWeight: 600, color: narrative.inferredNeedCount > 0 ? c.amber : c.muted }}>
            {narrative.inferredNeedCount}
          </div>
          <div style={{ fontFamily: MONO, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.10em", color: c.muted, marginTop: 2 }}>
            Inferred
          </div>
        </div>
        <div>
          <div style={{ fontFamily: MONO, fontSize: 20, fontWeight: 600, color: c.secondary }}>
            {needs.length - narrative.validatedNeedCount - narrative.inferredNeedCount}
          </div>
          <div style={{ fontFamily: MONO, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.10em", color: c.muted, marginTop: 2 }}>
            Directional
          </div>
        </div>
      </div>

      {/* High-priority gaps */}
      {narrative.highPriorityGaps.length > 0 && (
        <>
          <Divider />
          <div>
            <SectionLabel>High-priority customer gaps</SectionLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {narrative.highPriorityGaps.map((gap) => (
                <div key={gap.needId} style={{ padding: "4px 0 4px 10px", borderLeft: `2px solid ${c.line}` }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                    <p style={{ margin: 0, fontFamily: "Inter, sans-serif", fontSize: 12.5, lineHeight: 1.5, color: c.charcoal, flex: 1 }}>
                      {gap.outcome}
                    </p>
                    <span style={{ fontFamily: MONO, fontSize: 9.5, color: c.coral, flexShrink: 0 }}>
                      {gap.score}pts
                    </span>
                  </div>
                  <span style={{
                    fontFamily: MONO, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.09em",
                    color: gap.status === "validated" ? c.teal : gap.status === "inferred" ? c.coral : c.amber,
                    marginTop: 3, display: "block",
                  }}>
                    {gap.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Direction grounding */}
      <Divider />
      <div>
        <SectionLabel>Direction grounding</SectionLabel>
        <p style={{ margin: 0, fontFamily: "Inter, sans-serif", fontSize: 13, lineHeight: 1.65, color: c.secondary }}>
          {narrative.directionGrounding}
        </p>
      </div>

      {/* Friction patterns */}
      {narrative.frictionPatterns.length > 0 && (
        <>
          <Divider />
          <div>
            <SectionLabel>Customer friction patterns</SectionLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {narrative.frictionPatterns.map((p, i) => <Bullet key={i} text={p} />)}
            </div>
          </div>
        </>
      )}

      {/* Conflicts */}
      {narrative.conflicts.length > 0 && (
        <>
          <Divider />
          <div>
            <SectionLabel>Tensions</SectionLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {narrative.conflicts.map((con, i) => (
                <div key={i} style={{
                  borderLeft: `2px solid ${con.severity === "warning" ? c.coral : c.amber}60`,
                  paddingLeft: 10,
                }}>
                  <p style={{ margin: 0, fontFamily: "Inter, sans-serif", fontSize: 12.5, lineHeight: 1.5, color: c.secondary }}>
                    {con.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Unresolved questions */}
      <Divider />
      <div>
        <SectionLabel>Unresolved customer questions</SectionLabel>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {narrative.unresolved.map((q, i) => <Bullet key={i} text={q} />)}
        </div>
      </div>

      {/* What would resolve */}
      <Divider />
      <div>
        <SectionLabel>What would improve grounding</SectionLabel>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {narrative.wouldResolve.map((r, i) => <Bullet key={i} text={r} />)}
        </div>
      </div>
    </div>
  );
}

// ─── Lens switcher ────────────────────────────────────────────────────────────────

function LensSwitcher({ active, onChange }: { active: DirectionInspectTab; onChange: (t: DirectionInspectTab) => void }) {
  const visibleTabs = TABS.filter((tab) => {
    if (tab.id === "overview") return true;
    const lensType = tab.id as LensType;
    if (!LENS_TYPES.includes(lensType)) return false;
    return isLensCompatible(lensType, "strategic_direction");
  });

  return (
    <div style={{ borderBottom: `1px solid ${c.lineFaint}`, background: c.surface, padding: "0 24px", display: "flex", gap: 0, overflowX: "auto" }}>
      {visibleTabs.map((tab) => {
        const isActive = active === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            style={{
              fontFamily: MONO, fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.10em",
              color: isActive ? c.charcoal : c.muted,
              background: "none", border: "none",
              borderBottom: isActive ? `2px solid ${c.charcoal}` : "2px solid transparent",
              cursor: "pointer", padding: "10px 12px",
              transition: "color 0.12s, border-color 0.12s",
              whiteSpace: "nowrap",
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

export type StrategicDirectionInspectPanelProps = {
  open: boolean;
  onClose: () => void;
  /** Company ID — direction is a per-company singleton. */
  companyId: string | null;
  /** Routes to show in the Overview linked-routes section. */
  routes?: RouteRow[];
  /** Customer needs — used by the Customer Reality lens. */
  needs?: OdiNeedRow[];
  /** When true, renders body only — Sheet is owned by InspectionShell. */
  shellMode?: boolean;
  /** Starting lens tab; respected only on first mount (use key to remount). */
  initialLens?: string;
  /** Fires when the user switches lens tabs. */
  onLensChange?: (lens: string) => void;
  /** Fires when the user clicks "Inspect →" on a route in the Overview. */
  onInspectRoute?: (routeId: string) => void;
};

export default function StrategicDirectionInspectPanel({
  open,
  onClose,
  companyId,
  routes = [],
  needs = [],
  shellMode = false,
  initialLens,
  onLensChange,
  onInspectRoute,
}: StrategicDirectionInspectPanelProps) {
  const [activeTab, setActiveTab] = useState<DirectionInspectTab>(() => {
    if (initialLens && TABS.some((t) => t.id === initialLens)) return initialLens as DirectionInspectTab;
    return "overview";
  });

  function switchTab(tab: DirectionInspectTab) {
    setActiveTab(tab);
    onLensChange?.(tab);
  }

  const { loading: cascadeLoading, item: cascade } = useStrategyCascade(companyId ?? undefined);
  const { loading: positioningLoading, item: positioning } = usePositioningCanvas(companyId ?? undefined);

  function handleOpenChange(v: boolean) {
    if (!v) {
      onClose();
      setActiveTab("overview");
    }
  }

  function body() {
    return (
      <div style={{
        display: "flex", flexDirection: "column",
        ...(shellMode ? { flex: 1, minHeight: 0 } : { height: "100%" }),
        background: c.bg,
      }}>
        {/* ── Fixed header ── */}
        <div style={{ padding: "20px 24px 16px", background: c.surface, borderBottom: `1px solid ${c.lineFaint}`, flexShrink: 0 }}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span style={{
              fontFamily: MONO, fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.09em",
              color: c.teal, borderLeft: `2px solid ${c.teal}`, paddingLeft: 7,
            }}>
              Strategic Direction
            </span>
          </div>
          <h2 style={{ margin: 0, fontFamily: "Inter, sans-serif", fontSize: 19, fontWeight: 600, lineHeight: 1.3, color: c.ink }}>
            {cascade?.winning_aspiration?.trim() || "Strategic direction"}
          </h2>
          {cascade?.winning_aspiration && cascade?.where_to_play?.trim() && (
            <p style={{ margin: "6px 0 0", fontFamily: "Inter, sans-serif", fontSize: 12.5, lineHeight: 1.45, color: c.muted }}>
              {`Playing in: ${cascade.where_to_play.split(/[,;.]/, 1)[0].trim()}`}
            </p>
          )}
        </div>

        {/* ── Lens switcher ── */}
        <div style={{ flexShrink: 0 }}>
          <LensSwitcher active={activeTab} onChange={switchTab} />
        </div>

        {/* ── Scrollable content ── */}
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
          {activeTab === "overview" && (
            <OverviewLens
              cascade={cascade}
              cascadeLoading={cascadeLoading}
              companyId={companyId ?? ""}
              routes={routes}
              onInspectRoute={onInspectRoute}
            />
          )}
          {activeTab === "customer_reality" && (
            <DirectionCustomerRealityLens
              needs={needs}
              routes={routes}
              cascade={cascade ?? null}
            />
          )}
          {activeTab === "strategy_cascade" && (
            <StrategyCascadeLens cascade={cascade} cascadeLoading={cascadeLoading} />
          )}
          {activeTab === "positioning" && (
            <PositioningLens
              positioning={positioning}
              positioningLoading={positioningLoading}
              cascade={cascade ?? null}
              routes={routes}
            />
          )}
          {activeTab === "evidence" && (
            <EvidenceLens cascade={cascade} positioning={positioning} cascadeLoading={cascadeLoading} />
          )}
          {activeTab === "validation" && (
            <ValidationLens cascade={cascade} cascadeLoading={cascadeLoading} />
          )}
        </div>

        {/* ── Footer ── */}
        <div style={{
          padding: "12px 24px",
          borderTop: `1px solid ${c.lineFaint}`,
          background: c.surface,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          flexShrink: 0,
        }}>
          <Mono size={9} color={c.muted}>
            {activeTab === "overview" ? "direction overview" : `${activeTab.replace(/_/g, " ")} lens`}
          </Mono>
          <button
            type="button"
            onClick={() => handleOpenChange(false)}
            style={{
              fontFamily: MONO, fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.09em",
              color: c.muted, background: "none",
              border: "none", padding: 0, cursor: "pointer",
            }}
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  if (shellMode) return body();

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="right"
        className="sm:max-w-[600px] flex flex-col p-0 overflow-hidden"
        aria-label="Strategic direction inspection"
      >
        {body()}
      </SheetContent>
    </Sheet>
  );
}
