/**
 * TensionBlock — compact contextual display of strategic tensions.
 *
 * Design principles:
 * - 1–3 tensions per context. Never a dashboard.
 * - Preserve ambiguity. Never over-summarize.
 * - Inline styles only (works inside Radix portals / Sheet panels).
 * - Tensions are suggestions, not conclusions.
 */

import type { StrategicTension, TensionContext } from "@/lib/tensionTypes";
import { TENSION_STATUS_LABELS } from "@/lib/tensionDerivation";

// ─── Styling constants ────────────────────────────────────────────────────────

const PRESSURE_COLORS = {
  critical: { fg: "#c44233", border: "#f4c1bb" },
  high:     { fg: "#b56c1a", border: "#f3d4a0" },
  medium:   { fg: "#6e847f", border: "#c8d8ca" },
  low:      { fg: "#9298B5", border: "#d8dde8" },
} as const;

const PRESSURE_LABELS = {
  critical: "CRITICAL",
  high:     "HIGH",
  medium:   "MEDIUM",
  low:      "LOW",
} as const;

// ─── Section header labels per context ────────────────────────────────────────

const CONTEXT_LABELS: Record<TensionContext, { header: string; subheader: string }> = {
  routes:     { header: "Strategic tensions",     subheader: "What remains unresolved" },
  strategy:   { header: "Strategic tensions",     subheader: "Where direction may break down" },
  positioning:{ header: "Market tensions",        subheader: "What the market may not yet believe" },
  needs:      { header: "Customer tensions",      subheader: "Competing customer pressures" },
  council:    { header: "Active tensions",        subheader: "First-class review material" },
};

// ─── Single tension row ────────────────────────────────────────────────────────

interface TensionRowProps {
  tension: StrategicTension;
  showBlocker?: boolean;
  lead?: boolean;
}

function TensionRow({ tension, showBlocker = true, lead = false }: TensionRowProps) {
  const colors = PRESSURE_COLORS[tension.pressure];
  const pressureLabel = PRESSURE_LABELS[tension.pressure];
  const statusLabel = TENSION_STATUS_LABELS[tension.status];

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 4,
        paddingLeft: lead ? 16 : 10,
        borderLeft: lead ? `4px solid ${colors.border}` : `2px solid ${colors.border}`,
      }}
    >
      {/* Statement row */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
        {/* Tension glyph */}
        <span
          style={{
            fontFamily: "monospace",
            fontSize: lead ? 14 : 11,
            color: colors.fg,
            lineHeight: lead ? "26px" : "18px",
            flexShrink: 0,
            userSelect: "none",
          }}
          aria-hidden
        >
          ⊗
        </span>
        <p
          style={{
            fontFamily: "sans-serif",
            fontSize: lead ? 20 : 13,
            fontWeight: lead ? 600 : 400,
            lineHeight: lead ? "1.35" : "1.45",
            color: "#233c4b",
            margin: 0,
            flex: 1,
          }}
        >
          {tension.statement}
        </p>
      </div>

      {/* Detail sub-line */}
      {tension.detail && (
        <p
          style={{
            fontFamily: "sans-serif",
            fontSize: 11,
            lineHeight: "1.5",
            color: "#6e847f",
            margin: 0,
            paddingLeft: 19,
          }}
        >
          {tension.detail}
        </p>
      )}

      {/* Meta row: pressure + status + blocker note */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 8,
          paddingLeft: 19,
        }}
      >
        <span
          style={{
            fontFamily: "monospace",
            fontSize: 9,
            letterSpacing: "0.14em",
            color: colors.fg,
            textTransform: "uppercase",
          }}
        >
          {pressureLabel}
        </span>
        <span
          style={{
            fontFamily: "monospace",
            fontSize: 9,
            letterSpacing: "0.1em",
            color: "#9298B5",
            textTransform: "uppercase",
          }}
        >
          {statusLabel}
        </span>
        {showBlocker && tension.is_commitment_blocker && (
          <span
            style={{
              fontFamily: "monospace",
              fontSize: 9,
              letterSpacing: "0.1em",
              color: "#c44233",
              textTransform: "uppercase",
            }}
          >
            · Blocks commitment
          </span>
        )}
        {tension.validation_requirements.length > 0 && (
          <span
            style={{
              fontFamily: "monospace",
              fontSize: 9,
              letterSpacing: "0.08em",
              color: "#9298B5",
            }}
          >
            · {tension.validation_requirements[0]}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Main export ───────────────────────────────────────────────────────────────

interface TensionBlockProps {
  tensions: StrategicTension[];
  context: TensionContext;
  /** Override section header */
  header?: string;
  /** Show the section header row. Default true. */
  showHeader?: boolean;
  /** Show commitment-blocker callout when any tension blocks. Default true. */
  showBlockerCallout?: boolean;
  /** Render the first tension row at lead/dominant element weight */
  lead?: boolean;
  /** Additional container style */
  style?: React.CSSProperties;
}

export default function TensionBlock({
  tensions,
  context,
  header,
  showHeader = true,
  showBlockerCallout = true,
  lead = false,
  style,
}: TensionBlockProps) {
  if (tensions.length === 0) return null;

  const labels = CONTEXT_LABELS[context];
  const blockers = tensions.filter((t) => t.is_commitment_blocker);
  const hasCritical = tensions.some((t) => t.pressure === "critical");
  const headerColor = hasCritical ? "#c44233" : tensions[0]?.pressure === "high" ? "#b56c1a" : "#6e847f";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0, ...style }}>
      {/* Section header */}
      {showHeader && (
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 12 }}>
          <p
            style={{
              fontFamily: "monospace",
              fontSize: 9,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: headerColor,
              margin: 0,
            }}
          >
            {header ?? labels.header}
          </p>
          <p
            style={{
              fontFamily: "monospace",
              fontSize: 9,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "#9298B5",
              margin: 0,
            }}
          >
            {labels.subheader}
          </p>
          <span
            style={{
              fontFamily: "monospace",
              fontSize: 9,
              color: "#9298B5",
              marginLeft: "auto",
            }}
          >
            {tensions.length}
          </span>
        </div>
      )}

      {/* Commitment blocker callout */}
      {showBlockerCallout && blockers.length > 0 && (
        <div
          style={{
            borderLeft: "2px solid #c44233",
            paddingLeft: 10,
            paddingTop: 6,
            paddingBottom: 6,
            marginBottom: 12,
          }}
        >
          <p
            style={{
              fontFamily: "monospace",
              fontSize: 9,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "#c44233",
              margin: 0,
            }}
          >
            {blockers.length === 1
              ? "1 tension is blocking safe route commitment"
              : `${blockers.length} tensions are blocking safe route commitment`}
          </p>
        </div>
      )}

      {/* Tension rows */}
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {tensions.map((tension, i) => (
          <TensionRow key={tension.id} tension={tension} showBlocker={showBlockerCallout} lead={lead && i === 0} />
        ))}
      </div>
    </div>
  );
}
