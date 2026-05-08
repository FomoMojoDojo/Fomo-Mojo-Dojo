import { useEffect } from "react";
import type { OdiNeedRow } from "@/hooks/useOdiNeeds";
import type { RouteRow } from "@/views/Routes/useRoutes";
import type { EngagementPhase } from "@/lib/engagementPhase";

const c = {
  panel:     "#FAF7F6",
  card:      "#FFFFFF",
  line:      "#DDE6D1",
  charcoal:  "#233C4B",
  secondary: "#46606D",
  muted:     "#6E847F",
  coral:     "#FF7D2D",
  teal:      "#5F9B8C",
  amber:     "#FAC846",
};

const MONO = '"JetBrains Mono", ui-monospace, "SFMono-Regular", monospace';

function serviceStateInfo(state: string | null | undefined): { label: string; observation: string } {
  const s = String(state || "").toLowerCase();
  if (s === "underserved") return {
    label: "Underserved",
    observation: "There appears to be a gap between how important customers find this and how well it's currently being met. If that gap is real, it's worth paying attention to.",
  };
  if (s === "overserved") return {
    label: "Over-served",
    observation: "The signal suggests customers may be getting more than they need here. That's usually a sign effort could be redirected somewhere with more leverage.",
  };
  return {
    label: "Appropriately served",
    observation: "The pattern here looks balanced — importance and delivery are roughly in line. Worth monitoring, but probably not the most urgent priority right now.",
  };
}

function journeyLabel(key: string): string {
  const map: Record<string, string> = { customer: "Customer", revenue: "Revenue", operations: "Operations" };
  return map[key] ?? (key.charAt(0).toUpperCase() + key.slice(1));
}

const SectionLabel = ({ children }: { children: string }) => (
  <p style={{ margin: "0 0 10px", fontFamily: MONO, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.12em", color: c.muted }}>
    {children}
  </p>
);

const Divider = () => (
  <div style={{ borderTop: `1px solid ${c.line}` }} />
);

export default function NeedInspectPanel({
  open,
  onClose,
  need,
  staleNote,
  currentPhase = "outside_signals",
  // kept for caller compatibility, not used
  routes: _routes,
  onRouteSelect: _onRouteSelect,
}: {
  open: boolean;
  onClose: () => void;
  need: OdiNeedRow | null;
  staleNote?: string | null;
  currentPhase?: EngagementPhase;
  routes?: RouteRow[];
  onRouteSelect?: (routeId: string) => void;
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    if (open) document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  const stateInfo = serviceStateInfo(need?.service_state);

  const journeyKey = need?.journey_key ?? "";
  const stepNumber = need?.step_number ?? null;
  const stepLabel  = need?.step_label  ?? null;

  const contextParts = [
    journeyKey ? journeyLabel(journeyKey).toUpperCase() : null,
    stepNumber ? `CHECKPOINT ${stepNumber}` : null,
    stepLabel  ? stepLabel.toUpperCase() : null,
  ].filter(Boolean);
  const contextLine = contextParts.join(" · ");

  const sourcePath      = String(need?.source_path || "").toLowerCase();
  const isExternalOnly  = sourcePath.includes("baseline") || sourcePath.includes("public") || sourcePath.includes("benchmark");
  const state           = String(need?.service_state || "").toLowerCase();

  const stillNeeded: string[] = [];
  if (isExternalOnly) {
    stillNeeded.push("This signal comes from outside research. Confirm it with customer interviews or internal data before acting on it.");
  }
  if (state === "underserved") {
    stillNeeded.push("Validate that this gap is consistent across customer segments — a single source can overstate it.");
  } else if (state === "overserved") {
    stillNeeded.push("Check whether this reflects a real pattern or a specific context. Over-served signals sometimes normalize over time.");
  }
  if (stillNeeded.length === 0) {
    stillNeeded.push("Additional customer research would help confirm or sharpen this read.");
  }

  return (
    <>
      {/* Overlay */}
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0, zIndex: 40,
          background: "rgba(35,60,75,0.26)",
          opacity: open ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
          transition: "opacity 0.25s",
        }}
      />

      {/* Panel */}
      <div
        style={{
          position: "fixed", top: 0, right: 0, zIndex: 50,
          display: "flex", flexDirection: "column",
          width: 520, maxWidth: "100vw", height: "100vh",
          transform: open ? "translateX(0)" : "translateX(100%)",
          transition: "transform 0.28s cubic-bezier(0.4, 0, 0.2, 1)",
          background: c.panel,
          borderLeft: `1px solid ${c.line}`,
        }}
      >
        {need && (
          <>
            {staleNote && (
              <div style={{ padding: "7px 20px", borderBottom: `1px solid ${c.line}`, background: `${c.amber}18` }}>
                <span style={{ fontFamily: MONO, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.08em", color: c.muted }}>
                  {staleNote}
                </span>
              </div>
            )}

            {/* Header */}
            <div style={{ position: "relative", padding: "20px 52px 16px 20px", borderBottom: `1px solid ${c.line}` }}>
              {contextLine && (
                <p style={{ margin: "0 0 6px", fontFamily: MONO, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: c.muted }}>
                  {contextLine}
                </p>
              )}
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600, lineHeight: 1.3, color: c.charcoal }}>
                {need.desired_outcome}
              </h2>
              <button
                type="button" onClick={onClose} aria-label="Close"
                style={{
                  position: "absolute", top: 16, right: 16,
                  width: 32, height: 32,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  border: `1px solid ${c.line}`, borderRadius: 6,
                  background: c.card, color: c.secondary,
                  cursor: "pointer", fontSize: 13,
                }}
              >
                ✕
              </button>
            </div>

            {/* Body */}
            <div style={{ flex: 1, overflowY: "auto", padding: "24px 20px", display: "flex", flexDirection: "column", gap: 24 }}>

              {/* What we're noticing */}
              <section>
                <SectionLabel>What we're noticing</SectionLabel>
                <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: c.secondary }}>
                  This need appears to be{" "}
                  <strong style={{ color: c.charcoal, fontWeight: 600 }}>{stateInfo.label.toLowerCase()}</strong>.
                </p>
              </section>

              <Divider />

              {/* Why it matters */}
              <section>
                <SectionLabel>Why it matters</SectionLabel>
                <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: c.secondary }}>
                  {stateInfo.observation}
                </p>
              </section>

              <Divider />

              {/* What we still need */}
              <section>
                <SectionLabel>What we still need</SectionLabel>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {stillNeeded.map((item, i) => (
                    <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                      <span style={{ color: c.muted, flexShrink: 0, lineHeight: 1.6 }}>○</span>
                      <span style={{ fontSize: 13, lineHeight: 1.6, color: c.secondary }}>{item}</span>
                    </div>
                  ))}
                </div>
              </section>

            </div>

            {/* Footer */}
            <div style={{ padding: "16px 20px", borderTop: `1px solid ${c.line}` }}>
              <button
                type="button" onClick={onClose}
                style={{
                  display: "block", width: "100%",
                  padding: "10px 16px",
                  border: `1px solid ${c.line}`, borderRadius: 6,
                  background: c.card, color: c.secondary,
                  fontFamily: MONO, fontSize: 10,
                  textTransform: "uppercase", letterSpacing: "0.08em",
                  cursor: "pointer",
                }}
              >
                Close
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
