import { D } from "./tokens";

export function Eyebrow({ segments }: { segments: string[] }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: D.signal, display: "inline-block", flexShrink: 0 }} />
      <span style={{ fontFamily: D.mono, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.16em", color: "rgba(17,17,17,0.4)" }}>
        {segments.join(" · ")}
      </span>
    </div>
  );
}
