import { Link } from "react-router-dom";
import type { StrategicAssumption } from "@/hooks/useStrategicAssumptions";

const c = {
  charcoal: "#233C4B",
  secondary: "#46606D",
  muted: "#6E847F",
  line: "#DDE6D1",
  lineFaint: "#EEF3E9",
  teal: "#5F9B8C",
  coral: "#FF7D2D",
  amber: "#C48A2A",
};

const STATUS_META: Record<
  StrategicAssumption["status"],
  { label: string; bg: string; fg: string; border: string }
> = {
  untested: { label: "Untested", bg: "#F4F6F5", fg: c.muted, border: c.line },
  validating: { label: "Validating", bg: "#FFFCE8", fg: c.amber, border: "#F3D77A" },
  validated: { label: "Validated", bg: "#EFF7F3", fg: c.teal, border: "#B5D9CC" },
  invalidated: { label: "Invalidated", bg: "#FFF0F0", fg: "#B91C1C", border: "#FECACA" },
};

const SOURCE_LABEL: Record<StrategicAssumption["source"], string> = {
  client: "Client",
  intake: "Intake",
  company: "Company",
  public: "Public",
  evidence: "Evidence",
};

export default function AssumptionSnapshot({
  assumptions,
  loading,
  tableMissing,
}: {
  assumptions: StrategicAssumption[];
  loading: boolean;
  tableMissing: boolean;
}) {
  if (tableMissing || loading) return null;
  if (assumptions.length === 0) return null;

  const byStatus = {
    untested: assumptions.filter((a) => a.status === "untested").length,
    validating: assumptions.filter((a) => a.status === "validating").length,
    validated: assumptions.filter((a) => a.status === "validated").length,
    invalidated: assumptions.filter((a) => a.status === "invalidated").length,
  };

  // Show the most important untested/validating assumptions first
  const highlighted = assumptions
    .filter((a) => a.status === "untested" || a.status === "validating")
    .slice(0, 3);

  return (
    <div
      className="rounded-xl overflow-hidden mb-4"
      style={{ border: `1px solid ${c.line}`, background: "#FFFFFF" }}
    >
      <div
        className="flex items-center justify-between gap-3 px-4 py-3"
        style={{ borderBottom: `1px solid ${c.line}` }}
      >
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: c.muted }}>
            Assumption Snapshot
          </p>
          <p className="font-sans text-[13px] font-semibold mt-0.5" style={{ color: c.charcoal }}>
            {assumptions.length} assumption{assumptions.length !== 1 ? "s" : ""} tracked
          </p>
        </div>
        <Link
          to="/strategy"
          className="font-mono text-[10px] uppercase tracking-wider hover:opacity-70 transition-opacity"
          style={{ color: c.muted }}
        >
          View all →
        </Link>
      </div>

      {/* Status summary pills */}
      <div className="flex flex-wrap gap-2 px-4 pt-3 pb-2">
        {(Object.entries(byStatus) as Array<[StrategicAssumption["status"], number]>)
          .filter(([, count]) => count > 0)
          .map(([status, count]) => {
            const meta = STATUS_META[status];
            return (
              <span
                key={status}
                className="inline-flex items-center gap-1 rounded-full border px-2 py-1 font-mono text-[9px] uppercase tracking-[0.07em]"
                style={{ borderColor: meta.border, background: meta.bg, color: meta.fg }}
              >
                <span
                  className="inline-block h-1.5 w-1.5 rounded-full"
                  style={{ background: meta.fg }}
                />
                {count} {meta.label}
              </span>
            );
          })}
      </div>

      {/* Highlighted assumptions needing attention */}
      {highlighted.length > 0 && (
        <div
          className="mx-4 mb-4 rounded-lg divide-y overflow-hidden"
          style={{ border: `1px solid ${c.line}`, borderColor: c.line }}
        >
          {highlighted.map((a) => {
            const meta = STATUS_META[a.status];
            return (
              <div key={a.id} className="flex items-start justify-between gap-3 px-3 py-2.5">
                <div className="flex items-start gap-2 min-w-0">
                  <span
                    className="mt-[2px] shrink-0 inline-block h-2 w-2 rounded-full"
                    style={{ background: meta.fg }}
                  />
                  <p className="font-sans text-[12px] leading-[1.4]" style={{ color: c.charcoal }}>
                    {a.assumption}
                  </p>
                </div>
                <div className="shrink-0 flex flex-col items-end gap-1">
                  <span
                    className="inline-flex items-center rounded border px-1.5 py-[1px] font-mono text-[9px] uppercase tracking-wider"
                    style={{ borderColor: meta.border, background: meta.bg, color: meta.fg }}
                  >
                    {meta.label}
                  </span>
                  <span
                    className="font-mono text-[9px] uppercase tracking-wider"
                    style={{ color: c.muted }}
                  >
                    {SOURCE_LABEL[a.source]}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
