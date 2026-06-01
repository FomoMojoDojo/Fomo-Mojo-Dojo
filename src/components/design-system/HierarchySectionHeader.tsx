import { D } from "./tokens";

/** § 01 · LABEL with top hairline. Used across all hierarchy pages. */
export function HierarchySectionHeader({ number, label }: { number: string; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 12, borderTop: `1px solid ${D.hairline}`, paddingTop: 20, marginBottom: 22 }}>
      <span style={{ fontFamily: D.mono, fontSize: 9, color: D.inkFaint, textTransform: "uppercase", letterSpacing: "0.12em" }}>
        § {number}
      </span>
      <span style={{ fontFamily: D.mono, fontSize: 10, color: "rgba(17,17,17,0.7)", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 500 }}>
        {label}
      </span>
    </div>
  );
}
