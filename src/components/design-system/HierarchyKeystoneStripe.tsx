import { D } from "./tokens";

function splitText(text: string): [string, string] {
  const words = text.split(" ");
  const split = Math.max(2, Math.ceil(words.length * 0.45));
  return [words.slice(0, split).join(" "), words.slice(split).join(" ")];
}

interface HierarchyKeystoneStripeProps {
  eyebrow?: string;
  statement: string;
  rightValue: string | number;
  rightSub?: string;
  /** Left/right bleed in px matching parent padding (default 48) */
  bleed?: number;
}

export function HierarchyKeystoneStripe({
  eyebrow = "§ KEY MOVE",
  statement,
  rightValue,
  rightSub,
  bleed = 48,
}: HierarchyKeystoneStripeProps) {
  const [before, after] = splitText(statement);
  return (
    <div style={{
      background: D.ink,
      marginLeft: -bleed,
      width: `calc(100% + ${bleed * 2}px)`,
      padding: `28px ${bleed}px`,
      marginBottom: 48,
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 32,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontFamily: D.mono, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.14em", color: "rgba(246,246,244,0.45)", margin: "0 0 10px" }}>
          {eyebrow}
        </p>
        <p style={{ fontFamily: D.sans, fontSize: 18, fontWeight: 600, color: "#f6f6f4", lineHeight: 1.45, margin: 0, maxWidth: 580 }}>
          {before}{" "}
          <span style={{ color: D.signal }}>{after}</span>
        </p>
      </div>
      <div style={{ flexShrink: 0, textAlign: "right" }}>
        <p style={{ fontFamily: D.mono, fontSize: 52, fontWeight: 500, color: D.signal, lineHeight: 1, margin: 0, fontVariantNumeric: "tabular-nums" }}>
          {rightValue}
        </p>
        {rightSub && (
          <p style={{ fontFamily: D.mono, fontSize: 8.5, color: "rgba(246,246,244,0.45)", textTransform: "uppercase", letterSpacing: "0.12em", margin: "4px 0 0" }}>
            {rightSub}
          </p>
        )}
      </div>
    </div>
  );
}
