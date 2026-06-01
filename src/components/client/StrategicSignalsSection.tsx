import { useState } from "react";
import type {
  StrategicSignalSurface,
  StrategicSignalGroup,
  StrategicSignal,
  SignalPolarity,
  SignalMovement,
} from "@/lib/strategicSignals";

// ─── Design tokens (inline-only — portal-safe) ────────────────────────────────

const c = {
  teal:      "#5F9B8C",
  tealDim:   "#EBF3F1",
  amber:     "#C89F38",
  coralDeep: "#A85A3E",
  coral:     "#C4745A",
  ink:       "#2A3D3B",
  secondary: "#46606D",
  muted:     "#6E847F",
  faint:     "#9BB0AC",
  line:      "#DDE6D1",
  lineFaint: "#EEF3E9",
};

const MONO = '"JetBrains Mono", ui-monospace, monospace';
const SANS = '"Inter", sans-serif';

// ─── Polarity color / marker maps ─────────────────────────────────────────────

const POLARITY_COLOR: Record<SignalPolarity, string> = {
  accelerating:  c.teal,
  reinforcing:   c.teal,
  weakening:     c.amber,
  contradictory: c.coral,
  blocked:       c.coral,
  unresolved:    c.faint,
};

const POLARITY_MARKER: Record<SignalPolarity, string> = {
  accelerating:  "↑",
  reinforcing:   "◈",
  weakening:     "↓",
  contradictory: "⊘",
  blocked:       "⊗",
  unresolved:    "○",
};

// Movement tints the marker color for direction cue
function movementTint(movement: SignalMovement, base: string): string {
  if (movement === "strengthening") return c.teal;
  if (movement === "weakening")     return c.coral;
  if (movement === "emerging")      return c.teal;
  return base;
}

// One-word trend label for non-neutral movements — small, editorial
function movementWord(movement: SignalMovement): string | null {
  if (movement === "strengthening") return "gaining";
  if (movement === "weakening")     return "weakening";
  if (movement === "emerging")      return "forming";
  return null; // unchanged / unresolved: no label
}

function movementWordColor(movement: SignalMovement): string {
  if (movement === "strengthening") return c.teal;
  if (movement === "weakening")     return c.coral;
  if (movement === "emerging")      return c.teal;
  return c.faint;
}

// ─── Signal row ───────────────────────────────────────────────────────────────

function SignalRow({
  signal,
  onInspectRoute,
  isLast,
  compact = false,
}: {
  signal: StrategicSignal;
  onInspectRoute?: (routeId: string) => void;
  isLast: boolean;
  compact?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const baseColor = POLARITY_COLOR[signal.polarity];
  const markerColor = movementTint(signal.movement, baseColor);
  const marker = POLARITY_MARKER[signal.polarity];
  const canExpand = Boolean(signal.whyItMatters);
  const trend = movementWord(signal.movement);
  const trendColor = movementWordColor(signal.movement);

  return (
    <div style={{ paddingBottom: isLast ? 0 : 10 }}>
      <div
        style={{
          display: "flex", alignItems: "flex-start", gap: 10,
          cursor: canExpand ? "pointer" : "default",
          padding: "3px 0",
        }}
        onClick={() => { if (canExpand) setExpanded((v) => !v); }}
        role={canExpand ? "button" : undefined}
        tabIndex={canExpand ? 0 : undefined}
        onKeyDown={(e) => { if (canExpand && (e.key === "Enter" || e.key === " ")) setExpanded((v) => !v); }}
      >
        {/* Polarity marker */}
        <span style={{
          fontFamily: MONO, fontSize: 10, color: markerColor, flexShrink: 0,
          lineHeight: "20px", width: 10, textAlign: "center",
          transition: "color 0.15s ease",
        }}>
          {marker}
        </span>

        {/* Statement + optional trend word */}
        <span style={{ flex: 1 }}>
          <span style={{ fontFamily: SANS, fontSize: compact ? 12 : 13, lineHeight: compact ? 1.48 : 1.55, color: c.secondary }}>
            {signal.statement}
          </span>
          {trend && (
            <span style={{
              fontFamily: MONO, fontSize: 8, textTransform: "lowercase",
              letterSpacing: "0.06em", color: trendColor,
              marginLeft: 6, opacity: 0.85,
            }}>
              {trend}
            </span>
          )}
        </span>

        {/* Expand indicator — only when expandable */}
        {canExpand && (
          <span style={{
            fontFamily: MONO, fontSize: 8, color: c.muted,
            flexShrink: 0, lineHeight: "20px", opacity: expanded ? 1 : 0.75,
          }}>
            {expanded ? "▲" : "▼"}
          </span>
        )}
      </div>

      {/* Expanded context */}
      {expanded && signal.whyItMatters && (
        <div style={{ paddingLeft: 20, paddingTop: 4, paddingBottom: 6 }}>
          <p style={{
            margin: 0, fontFamily: SANS, fontSize: 12, lineHeight: 1.65,
            color: c.muted,
          }}>
            {signal.whyItMatters}
          </p>
          {signal.linkedRouteId && onInspectRoute && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onInspectRoute(signal.linkedRouteId!); }}
              style={{
                marginTop: 5, fontFamily: MONO, fontSize: 9, textTransform: "uppercase",
                letterSpacing: "0.07em", color: c.teal, background: "none",
                border: "none", cursor: "pointer", padding: 0,
              }}
            >
              Inspect route →
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Signal group ─────────────────────────────────────────────────────────────

function SignalGroupBlock({
  group,
  onInspectRoute,
  compact = false,
}: {
  group: StrategicSignalGroup;
  onInspectRoute?: (routeId: string) => void;
  compact?: boolean;
}) {
  return (
    <div style={{ marginBottom: compact ? 12 : 18 }}>
      {/* Group label */}
      <div style={{ marginBottom: compact ? 4 : 6 }}>
        <span style={{
          fontFamily: MONO, fontSize: compact ? 8 : 9, textTransform: "uppercase",
          letterSpacing: "0.09em", color: c.muted,
        }}>
          {group.label}
        </span>
      </div>

      {/* Signal rows */}
      <div>
        {group.signals.map((signal, i) => (
          <SignalRow
            key={signal.id}
            signal={signal}
            onInspectRoute={onInspectRoute}
            isLast={i === group.signals.length - 1}
            compact={compact}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptySignals() {
  return (
    <p style={{
      fontFamily: SANS, fontSize: 12.5, color: c.faint, lineHeight: 1.65,
      margin: "14px 0 0", fontStyle: "italic",
    }}>
      No signals visible yet — more evidence is needed before the system can surface a read.
    </p>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export default function StrategicSignalsSection({
  signals,
  onInspectRoute,
  onInspectDirection,
  compact = false,
}: {
  signals: StrategicSignalSurface;
  onInspectRoute?: (routeId: string) => void;
  onInspectDirection?: () => void;
  compact?: boolean;
}) {
  if (signals.totalCount === 0) {
    return <EmptySignals />;
  }

  return (
    <div style={{ marginTop: compact ? 14 : 28, width: "min(820px, 100%)" }}>
      {/* Section header — minimal, secondary */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        marginBottom: compact ? 10 : 14,
        borderTop: `1px solid ${c.lineFaint}`,
        paddingTop: compact ? 10 : 14,
      }}>
        <span style={{
          fontFamily: MONO, fontSize: compact ? 8 : 9, textTransform: "uppercase",
          letterSpacing: "0.09em", color: c.muted,
        }}>
          Strategic signals
        </span>
        {onInspectDirection && (
          <button
            type="button"
            onClick={onInspectDirection}
            style={{
              fontFamily: MONO, fontSize: 8, textTransform: "uppercase",
              letterSpacing: "0.07em", color: c.teal, background: "none",
              border: "none", cursor: "pointer", padding: 0,
            }}
          >
            Direction →
          </button>
        )}
      </div>

      {/* Groups */}
      {signals.groups.map((group) => (
        <SignalGroupBlock
          key={group.polarity}
          group={group}
          onInspectRoute={onInspectRoute}
          compact={compact}
        />
      ))}
    </div>
  );
}
