import type { TierCellData } from "@/lib/strategicObject";

const MONO = '"JetBrains Mono", ui-monospace, "SFMono-Regular", monospace';

const c = {
  inkSoft: "#555555",
  inkFaint: "#999999",
  line: "#d9d9d9",
  lineSoft: "#f5f5f5",
  teal: "#5f9b8c",
  tealFaint: "rgba(95,155,140,0.08)",
};

// Renders a grid of source-layer cells.
// Pass only the tiers you want displayed — Customer Signals should be omitted from `cells`
// if no customer evidence exists (not shown as "Not yet classified.").
export default function TierAlignmentGrid({ cells }: { cells: TierCellData[] }) {
  if (cells.length === 0) return null;

  const cols = Math.min(cells.length, 2);

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: `repeat(${cols}, 1fr)`,
      gap: 6,
    }}>
      {cells.map((cell) => (
        <div
          key={cell.tier}
          style={{
            border: `1px solid ${cell.present ? c.teal : c.line}`,
            background: cell.present ? c.tealFaint : c.lineSoft,
            padding: "8px 10px",
            borderRadius: 0,
          }}
        >
          <p style={{
            margin: "0 0 2px",
            fontFamily: MONO,
            fontSize: 9,
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            color: cell.present ? c.teal : c.inkFaint,
          }}>
            {cell.label}
          </p>
          <p style={{
            margin: 0,
            fontSize: 11,
            lineHeight: 1.4,
            color: cell.present ? c.inkSoft : c.inkFaint,
          }}>
            {cell.present ? (cell.detail ?? "Present") : "Not yet classified."}
          </p>
        </div>
      ))}
    </div>
  );
}
