import type { CSSProperties } from "react";
import type { OperatingMode } from "@/lib/operatingMode";
import { OPERATING_MODE_LABELS, OPERATING_MODE_DESCRIPTIONS } from "@/lib/operatingMode";

type Props = {
  mode: OperatingMode;
  onChange: (mode: OperatingMode) => void;
  descriptorOverride?: string | null;
};

const MODES: OperatingMode[] = ["scan", "diagnose", "decide", "monitor"];

const MONO: CSSProperties = {
  fontFamily: '"JetBrains Mono", ui-monospace, monospace',
};

/**
 * Minimal operating mode selector.
 * Four mode names as spaced uppercase text — active at full opacity,
 * others dim. Descriptor line below the active mode name.
 * No borders, no backgrounds, no tabs.
 */
export function OperatingModeBar({ mode, onChange, descriptorOverride }: Props) {
  return (
    <div style={{ paddingBottom: 22 }} role="group" aria-label="Operating mode">
      {/* Mode name row */}
      <div style={{ display: "flex", alignItems: "center" }}>
        {MODES.map((m, i) => (
          <span key={m} style={{ display: "flex", alignItems: "center" }}>
            {i > 0 && (
              <span
                aria-hidden="true"
                style={{
                  ...MONO,
                  color: "rgba(255,255,255,0.16)",
                  margin: "0 10px",
                  fontSize: 10,
                  userSelect: "none",
                }}
              >
                ·
              </span>
            )}
            <button
              type="button"
              aria-pressed={m === mode}
              onClick={() => onChange(m)}
              style={{
                ...MONO,
                background: "none",
                border: "none",
                padding: 0,
                cursor: m === mode ? "default" : "pointer",
                fontSize: 10,
                letterSpacing: "0.12em",
                fontWeight: m === mode ? 600 : 400,
                color: m === mode ? "rgba(255,255,255,0.84)" : "rgba(255,255,255,0.36)",
                transition: "color 0.12s ease",
                lineHeight: 1,
              }}
            >
              {OPERATING_MODE_LABELS[m]}
            </button>
          </span>
        ))}
      </div>
      {/* Active mode descriptor */}
      <p
        style={{
          ...MONO,
          margin: "5px 0 0",
          fontSize: 9,
          letterSpacing: "0.06em",
          color: "rgba(255,255,255,0.28)",
          lineHeight: 1,
        }}
      >
        {descriptorOverride ?? OPERATING_MODE_DESCRIPTIONS[mode]}
      </p>
    </div>
  );
}
