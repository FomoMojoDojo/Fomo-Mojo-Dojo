import { useMemo, useState } from "react";
import { FoundationClaimSupport } from "@/components/evidence/FoundationClaimSupport";
import { useStrategicHypotheses } from "@/hooks/useStrategicHypotheses";

const c = {
  panel: "#FFFFFF",
  line: "#DDE6D1",
  ink: "#233C4B",
  muted: "#6E847F",
  soft: "#F7F6F2",
};

function badgeTone(state: string) {
  switch (state) {
    case "strengthened":
      return { bg: "#edf8f4", border: "#5f9b8c", text: "#285f53" };
    case "emerging":
      return { bg: "#fef7ea", border: "#e8b347", text: "#8d6324" };
    case "contradicted":
      return { bg: "#fff2f0", border: "#ef4444", text: "#a12318" };
    case "reframed":
      return { bg: "#f5f0ff", border: "#a78bfa", text: "#5b43a0" };
    case "retired":
      return { bg: "#f3f4f6", border: "#cbd5e1", text: "#52606d" };
    default:
      return { bg: "#f7f7f5", border: "#cbd5e1", text: "#5f6b76" };
  }
}

function formatWhen(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function aggregateSourceMix(rows: Parameters<typeof FoundationClaimSupport>[0]["claims"]) {
  return rows.reduce(
    (acc, row) => {
      acc.outside += row.supportShape.outside;
      acc.organization += row.supportShape.organization;
      acc.customer += row.supportShape.customer;
      return acc;
    },
    { outside: 0, organization: 0, customer: 0 },
  );
}

export default function StrategicHypothesesPanel({ companyId }: { companyId: string }) {
  const { data, isLoading, error } = useStrategicHypotheses(companyId);
  const [statusFilter, setStatusFilter] = useState("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const rows = useMemo(() => {
    const all = data ?? [];
    if (statusFilter === "all") return all;
    if (statusFilter === "journey") return all.filter((row) => row.hypothesis.journey_key != null);
    return all.filter((row) => row.hypothesis.hypothesis_state === statusFilter);
  }, [data, statusFilter]);

  return (
    <section className="rounded-2xl p-5 shadow-sm" style={{ background: c.panel, border: `1px solid ${c.line}` }}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="font-sans text-[18px] font-semibold" style={{ color: c.ink }}>
            Strategic Hypotheses
          </div>
          <div className="mt-1 font-mono text-[11px] tracking-[0.06em]" style={{ color: c.muted }}>
            Outside View should stay directional. These are hypotheses, not commitments.
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="rounded-lg border px-3 py-2 text-sm" style={{ borderColor: c.line, background: c.soft }}>
            <option value="all">All states</option>
            <option value="inferred">Inferred</option>
            <option value="emerging">Emerging</option>
            <option value="strengthened">Strengthened</option>
            <option value="contradicted">Contradicted</option>
            <option value="reframed">Reframed</option>
            <option value="retired">Retired</option>
            <option value="journey">Journey hypotheses</option>
          </select>
          <div className="font-mono text-[11px] tracking-[0.06em]" style={{ color: c.muted }}>
            {(data ?? []).length} hypotheses
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="mt-4 font-mono text-[11px] tracking-[0.06em]" style={{ color: c.muted }}>
          Loading hypotheses…
        </div>
      ) : error ? (
        <div className="mt-4 font-mono text-[11px] tracking-[0.06em]" style={{ color: "#a33" }}>
          {(error as Error).message}
        </div>
      ) : rows.length === 0 ? (
        <div className="mt-4 rounded-xl border p-4" style={{ borderColor: c.line, background: c.soft }}>
          <p className="m-0 text-[13px] leading-6" style={{ color: c.muted }}>
            No strategic hypotheses have been generated yet. Run an outside evidence path to create directional hypotheses from current claims.
          </p>
        </div>
      ) : (
        <div className="mt-4 grid gap-4">
          {rows.map((row) => {
            const stateTone = badgeTone(row.hypothesis.hypothesis_state);
            const expanded = expandedId === row.hypothesis.id;
            const sourceMix = aggregateSourceMix(row.supportingClaims);
            return (
              <div key={row.hypothesis.id} className="rounded-xl border" style={{ borderColor: c.line, background: row.hypothesis.is_active ? "#fff" : c.soft }}>
                <button
                  type="button"
                  onClick={() => setExpandedId((current) => current === row.hypothesis.id ? null : row.hypothesis.id)}
                  className="w-full text-left px-4 py-4"
                  style={{ background: "none", border: "none" }}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <span style={{ padding: "3px 8px", borderRadius: 999, border: `1px solid ${stateTone.border}`, background: stateTone.bg, color: stateTone.text, fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                          {row.hypothesis.hypothesis_state.replace(/_/g, " ")}
                        </span>
                        <span className="font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: c.muted }}>
                          {row.hypothesis.hypothesis_kind.replace(/_/g, " ")}
                        </span>
                        {row.hypothesis.journey_key ? (
                          <span style={{ padding: "2px 7px", borderRadius: 999, border: "1px solid #a3c9f5", background: "#eff6ff", color: "#1d4ed8", fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                            {row.hypothesis.journey_key.replace(/_/g, " ")}
                          </span>
                        ) : null}
                        {row.hypothesis.topic ? (
                          <span className="font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: c.muted }}>
                            {row.hypothesis.topic}
                          </span>
                        ) : null}
                      </div>
                      <div className="font-sans text-[15px] leading-6" style={{ color: c.ink }}>
                        {row.hypothesis.statement}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: c.muted }}>
                        <span>confidence {row.hypothesis.confidence}</span>
                        <span>validation {row.hypothesis.validation_state}</span>
                        <span>support {row.supportingClaims.length}</span>
                        <span>weakening {row.weakeningClaims.length}</span>
                        <span>source mix O {sourceMix.outside} · Org {sourceMix.organization} · C {sourceMix.customer}</span>
                        {row.latestEventAt ? <span>updated {formatWhen(row.latestEventAt)}</span> : null}
                      </div>
                    </div>
                  </div>
                </button>
                {expanded ? (
                  <div className="border-t px-4 py-4 grid gap-4" style={{ borderColor: c.line }}>
                    <div>
                      <div className="font-mono text-[10px] uppercase tracking-[0.08em] mb-2" style={{ color: c.muted }}>
                        What must be true
                      </div>
                      {(row.hypothesis.what_must_be_true ?? []).length > 0 ? (
                        <div className="grid gap-2">
                          {(row.hypothesis.what_must_be_true ?? []).map((line) => (
                            <div key={line} className="rounded-lg border px-3 py-3 text-[13px] leading-6" style={{ borderColor: c.line, background: c.soft, color: c.ink }}>
                              {line}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="font-mono text-[11px] tracking-[0.06em]" style={{ color: c.muted }}>
                          No explicit assumptions captured yet.
                        </div>
                      )}
                    </div>

                    <div>
                      <div className="font-mono text-[10px] uppercase tracking-[0.08em] mb-2" style={{ color: c.muted }}>
                        Supporting evidence
                      </div>
                      <FoundationClaimSupport claims={row.supportingClaims} mode="job_step" />
                    </div>

                    <div>
                      <div className="font-mono text-[10px] uppercase tracking-[0.08em] mb-2" style={{ color: c.muted }}>
                        Weakening evidence
                      </div>
                      <FoundationClaimSupport claims={row.weakeningClaims} mode="job_step" />
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
