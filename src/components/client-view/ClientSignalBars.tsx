import type { ClientSignalStrengthSummary } from "@/lib/clientViewModel";

type ClientSignalBarsProps = {
  summary: ClientSignalStrengthSummary;
  compact?: boolean;
};

function barTone(level: "Low" | "Medium" | "High") {
  if (level === "High") return "bg-forest";
  if (level === "Medium") return "bg-amber";
  return "bg-rust";
}

function levelLabel(level: "Low" | "Medium" | "High") {
  if (level === "High") return "High";
  if (level === "Medium") return "Medium";
  return "Low";
}

export default function ClientSignalBars({ summary, compact = false }: ClientSignalBarsProps) {
  const rows = [summary.proof, summary.ownership, summary.execution];

  return (
    <section className={`rounded-xl border border-[#d8e1de] bg-white ${compact ? "p-3" : "p-4"}`}>
      <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-t-muted">System Signals</p>
      <div className="mt-3 space-y-2.5">
        {rows.map((row) => (
          <div key={row.label}>
            <div className="mb-1 flex items-center justify-between">
              <p className="font-sans text-[13px] text-t-primary">{row.label}</p>
              <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-t-muted">{levelLabel(row.level)}</p>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#edf3f0]">
              <div
                className={`h-full rounded-full ${barTone(row.level)}`}
                style={{ width: `${Math.max(4, Math.min(100, row.value))}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
