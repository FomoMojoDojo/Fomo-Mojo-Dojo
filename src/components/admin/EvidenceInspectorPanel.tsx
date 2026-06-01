import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEvidenceGraph } from "@/hooks/useEvidenceGraph";
import type { Claim, Signal } from "@/lib/evidenceDomain";

const c = {
  panel: "#FFFFFF",
  line: "#DDE6D1",
  ink: "#233C4B",
  muted: "#6E847F",
  soft: "#F7F6F2",
  deprioText: "#9aab9a",
  deprioBg: "#f4f7f4",
  actionDepriorize: "#a33",
  actionRestore: "#2a6e3f",
};

type Props = {
  companyId: string;
};

function uniq(values: Array<string | null | undefined>) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

export default function EvidenceInspectorPanel({ companyId }: Props) {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useEvidenceGraph(companyId);
  const [bandFilter, setBandFilter] = useState("all");
  const [sourceTypeFilter, setSourceTypeFilter] = useState("all");
  const [topicFilter, setTopicFilter] = useState("all");
  const [frameworkFilter, setFrameworkFilter] = useState("all");
  const [showDeprioritized, setShowDeprioritized] = useState(false);
  const [selectedSignalId, setSelectedSignalId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const signals = data?.signals ?? [];
  const claims = data?.claims ?? [];
  const refs = data?.refs ?? [];

  const signalOptions = useMemo(
    () => ({
      bands: uniq(signals.map((signal) => signal.signal_band)),
      sourceTypes: uniq(signals.map((signal) => signal.source_type)),
      topics: uniq(signals.map((signal) => signal.topic)),
      frameworks: uniq(signals.map((signal) => signal.framework)),
    }),
    [signals],
  );

  const filteredSignals = useMemo(
    () =>
      signals.filter((signal) => {
        if (!showDeprioritized && signal.relevance_state === "deprioritized") return false;
        if (bandFilter !== "all" && signal.signal_band !== bandFilter) return false;
        if (sourceTypeFilter !== "all" && signal.source_type !== sourceTypeFilter) return false;
        if (topicFilter !== "all" && String(signal.topic || "") !== topicFilter) return false;
        if (frameworkFilter !== "all" && String(signal.framework || "") !== frameworkFilter) return false;
        return true;
      }),
    [signals, showDeprioritized, bandFilter, sourceTypeFilter, topicFilter, frameworkFilter],
  );

  const claimsById = useMemo(() => new Map(claims.map((claim) => [claim.id, claim])), [claims]);
  const refsBySignalId = useMemo(() => {
    const map = new Map<string, typeof refs>();
    refs.forEach((ref) => {
      const bucket = map.get(ref.signal_id) ?? [];
      bucket.push(ref);
      map.set(ref.signal_id, bucket);
    });
    return map;
  }, [refs]);

  const selectedSignal = filteredSignals.find((signal) => signal.id === selectedSignalId) ?? filteredSignals[0] ?? null;
  const selectedSignalRefs = selectedSignal ? (refsBySignalId.get(selectedSignal.id) ?? []) : [];

  const claimLinkedSignalCount = useMemo(() => {
    const counts = new Map<string, number>();
    refs.forEach((ref) => counts.set(ref.claim_id, (counts.get(ref.claim_id) ?? 0) + 1));
    return counts;
  }, [refs]);

  const deprioritizedCount = useMemo(
    () => signals.filter((s) => s.relevance_state === "deprioritized").length,
    [signals],
  );

  async function setRelevanceState(signalId: string, nextState: "active" | "deprioritized") {
    setSavingId(signalId);
    setActionError(null);
    const { error: updateError } = await supabase
      .from("signals")
      .update({ relevance_state: nextState })
      .eq("id", signalId);
    setSavingId(null);
    if (updateError) {
      setActionError(updateError.message);
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["evidence-graph", companyId] });
  }

  return (
    <section
      className="rounded-2xl p-5 shadow-sm"
      style={{ background: c.panel, border: `1px solid ${c.line}` }}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="font-sans text-[18px] font-semibold" style={{ color: c.ink }}>
            Evidence Inspector
          </div>
          <div className="mt-1 font-mono text-[11px] tracking-[0.06em]" style={{ color: c.muted }}>
            Phase 1 substrate debug view — signals and derived claims only
          </div>
        </div>
        <div className="font-mono text-[11px] tracking-[0.06em] text-right" style={{ color: c.muted }}>
          {signals.length} signals · {claims.length} claims
          {deprioritizedCount > 0 ? (
            <div style={{ color: c.deprioText }}>{deprioritizedCount} deprioritized</div>
          ) : null}
        </div>
      </div>

      {isLoading ? (
        <div className="mt-4 font-mono text-[11px] tracking-[0.06em]" style={{ color: c.muted }}>
          Loading evidence graph…
        </div>
      ) : error ? (
        <div className="mt-4 font-mono text-[11px] tracking-[0.06em]" style={{ color: "#a33" }}>
          {(error as Error).message}
        </div>
      ) : (
        <div className="mt-4 grid gap-6 lg:grid-cols-[1.25fr_0.95fr]">
          <div className="space-y-4">
            <div className="grid gap-2 md:grid-cols-4">
              <select value={bandFilter} onChange={(event) => setBandFilter(event.target.value)} className="rounded-lg border px-3 py-2 text-sm" style={{ borderColor: c.line, background: c.soft }}>
                <option value="all">All bands</option>
                {signalOptions.bands.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
              <select value={sourceTypeFilter} onChange={(event) => setSourceTypeFilter(event.target.value)} className="rounded-lg border px-3 py-2 text-sm" style={{ borderColor: c.line, background: c.soft }}>
                <option value="all">All source types</option>
                {signalOptions.sourceTypes.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
              <select value={topicFilter} onChange={(event) => setTopicFilter(event.target.value)} className="rounded-lg border px-3 py-2 text-sm" style={{ borderColor: c.line, background: c.soft }}>
                <option value="all">All topics</option>
                {signalOptions.topics.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
              <select value={frameworkFilter} onChange={(event) => setFrameworkFilter(event.target.value)} className="rounded-lg border px-3 py-2 text-sm" style={{ borderColor: c.line, background: c.soft }}>
                <option value="all">All frameworks</option>
                {signalOptions.frameworks.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </div>

            {deprioritizedCount > 0 ? (
              <label className="flex items-center gap-2 cursor-pointer select-none" style={{ color: c.muted }}>
                <input
                  type="checkbox"
                  checked={showDeprioritized}
                  onChange={(e) => setShowDeprioritized(e.target.checked)}
                  className="rounded"
                />
                <span className="font-mono text-[11px] tracking-[0.06em]">
                  Show deprioritized ({deprioritizedCount})
                </span>
              </label>
            ) : null}

            <div className="rounded-xl border overflow-hidden" style={{ borderColor: c.line }}>
              <div className="grid grid-cols-[120px_1fr_110px] gap-3 px-4 py-2 font-mono text-[10px] tracking-[0.08em] uppercase" style={{ color: c.muted, background: c.soft }}>
                <div>Band</div>
                <div>Signal</div>
                <div>Confidence</div>
              </div>
              <div className="max-h-[420px] overflow-auto divide-y" style={{ borderColor: c.line }}>
                {filteredSignals.map((signal) => {
                  const isDeprioritized = signal.relevance_state === "deprioritized";
                  const isSelected = selectedSignal?.id === signal.id;
                  return (
                    <button
                      key={signal.id}
                      type="button"
                      onClick={() => setSelectedSignalId(signal.id)}
                      className="w-full grid grid-cols-[120px_1fr_110px] gap-3 px-4 py-3 text-left hover:bg-[#fafaf7]"
                      style={{ background: isSelected ? "#fafaf7" : isDeprioritized ? c.deprioBg : "#fff" }}
                    >
                      <div
                        className="font-mono text-[10px] uppercase tracking-[0.08em]"
                        style={{ color: isDeprioritized ? c.deprioText : c.muted }}
                      >
                        {signal.signal_band}
                      </div>
                      <div>
                        <div
                          className="font-sans text-[13px] leading-5"
                          style={{
                            color: isDeprioritized ? c.deprioText : c.ink,
                            textDecoration: isDeprioritized ? "line-through" : "none",
                          }}
                        >
                          {signal.claim_text}
                        </div>
                        <div className="mt-1 font-mono text-[10px] tracking-[0.06em]" style={{ color: c.deprioText }}>
                          {isDeprioritized ? "deprioritized · " : ""}
                          {signal.source_type}{signal.framework ? ` · ${signal.framework}` : ""}{signal.topic ? ` · ${signal.topic}` : ""}
                        </div>
                      </div>
                      <div
                        className="font-mono text-[10px] uppercase tracking-[0.08em]"
                        style={{ color: isDeprioritized ? c.deprioText : c.muted }}
                      >
                        {signal.confidence_to_use}
                      </div>
                    </button>
                  );
                })}
                {filteredSignals.length === 0 ? (
                  <div className="px-4 py-8 font-mono text-[11px] tracking-[0.06em]" style={{ color: c.muted }}>
                    No signals match the current filters.
                  </div>
                ) : null}
              </div>
            </div>

            <div className="rounded-xl border p-4" style={{ borderColor: c.line, background: c.soft }}>
              <div className="font-mono text-[11px] uppercase tracking-[0.08em]" style={{ color: c.muted }}>
                Claims
              </div>
              <div className="mt-3 space-y-3 max-h-[320px] overflow-auto">
                {claims.map((claim) => (
                  <div key={claim.id} className="rounded-lg border p-3" style={{ borderColor: c.line, background: "#fff" }}>
                    <div className="font-sans text-[13px] leading-5" style={{ color: c.ink }}>
                      {claim.statement}
                    </div>
                    <div className="mt-2 font-mono text-[10px] tracking-[0.06em]" style={{ color: c.muted }}>
                      {claim.claim_type} · {claim.triangulation_state} · {claim.confidence}
                    </div>
                    <div className="mt-2 font-mono text-[10px] tracking-[0.06em]" style={{ color: c.muted }}>
                      Outside {claim.outside_support_count} · Org {claim.organization_support_count} · Customer {claim.customer_support_count} · Linked signals {claimLinkedSignalCount.get(claim.id) ?? 0}
                    </div>
                  </div>
                ))}
                {claims.length === 0 ? (
                  <div className="font-mono text-[11px] tracking-[0.06em]" style={{ color: c.muted }}>
                    No claims derived yet.
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <div className="rounded-xl border p-4" style={{ borderColor: c.line, background: c.soft }}>
            <div className="font-mono text-[11px] uppercase tracking-[0.08em]" style={{ color: c.muted }}>
              Signal detail
            </div>
            {selectedSignal ? (
              <div className="mt-3 space-y-3">
                <div
                  className="font-sans text-[15px] leading-6"
                  style={{
                    color: selectedSignal.relevance_state === "deprioritized" ? c.deprioText : c.ink,
                    textDecoration: selectedSignal.relevance_state === "deprioritized" ? "line-through" : "none",
                  }}
                >
                  {selectedSignal.claim_text}
                </div>
                <div className="font-mono text-[10px] tracking-[0.06em]" style={{ color: c.muted }}>
                  {selectedSignal.signal_band} · {selectedSignal.source_type} · {selectedSignal.evidence_type} · {selectedSignal.validation_status}
                </div>

                <div className="flex items-center gap-2">
                  {selectedSignal.relevance_state === "deprioritized" ? (
                    <button
                      type="button"
                      disabled={savingId === selectedSignal.id}
                      onClick={() => setRelevanceState(selectedSignal.id, "active")}
                      className="rounded px-3 py-1.5 font-mono text-[11px] tracking-[0.06em]"
                      style={{
                        background: "#e8f4ec",
                        color: c.actionRestore,
                        border: `1px solid #b8d9c3`,
                        opacity: savingId === selectedSignal.id ? 0.6 : 1,
                        cursor: savingId === selectedSignal.id ? "wait" : "pointer",
                      }}
                    >
                      {savingId === selectedSignal.id ? "Restoring…" : "Restore to active"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={savingId === selectedSignal.id}
                      onClick={() => setRelevanceState(selectedSignal.id, "deprioritized")}
                      className="rounded px-3 py-1.5 font-mono text-[11px] tracking-[0.06em]"
                      style={{
                        background: "#fdf0f0",
                        color: c.actionDepriorize,
                        border: `1px solid #e8c4c4`,
                        opacity: savingId === selectedSignal.id ? 0.6 : 1,
                        cursor: savingId === selectedSignal.id ? "wait" : "pointer",
                      }}
                    >
                      {savingId === selectedSignal.id ? "Deprioritizing…" : "Deprioritize"}
                    </button>
                  )}
                  {selectedSignal.relevance_state === "deprioritized" ? (
                    <span className="font-mono text-[10px] tracking-[0.06em]" style={{ color: c.deprioText }}>
                      off-strategy · zero weight in scoring
                    </span>
                  ) : null}
                </div>

                {actionError ? (
                  <div className="font-mono text-[11px] tracking-[0.06em]" style={{ color: "#a33" }}>
                    {actionError}
                  </div>
                ) : null}

                {selectedSignal.evidence_excerpt ? (
                  <div className="rounded-lg border p-3 text-[13px] leading-6" style={{ borderColor: c.line, background: "#fff", color: c.ink }}>
                    {selectedSignal.evidence_excerpt}
                  </div>
                ) : null}
                <div className="space-y-1 font-mono text-[11px] tracking-[0.06em]" style={{ color: c.muted }}>
                  <div>Source title: {selectedSignal.source_title || "—"}</div>
                  <div>Source ref: {selectedSignal.source_id || "—"}</div>
                  <div>Framework/topic: {selectedSignal.framework || "—"} / {selectedSignal.topic || "—"}</div>
                  {selectedSignal.source_url ? <div>URL: {selectedSignal.source_url}</div> : null}
                </div>
                <div>
                  <div className="font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: c.muted }}>
                    Linked claims
                  </div>
                  <div className="mt-2 space-y-2">
                    {selectedSignalRefs.map((ref) => {
                      const claim = claimsById.get(ref.claim_id);
                      return (
                        <div key={ref.id} className="rounded-lg border p-3" style={{ borderColor: c.line, background: "#fff" }}>
                          <div className="font-sans text-[13px]" style={{ color: c.ink }}>
                            {claim?.statement || ref.claim_id}
                          </div>
                          <div className="mt-1 font-mono text-[10px] tracking-[0.06em]" style={{ color: c.muted }}>
                            {ref.relationship}{claim ? ` · ${claim.triangulation_state} · ${claim.confidence}` : ""}
                          </div>
                        </div>
                      );
                    })}
                    {selectedSignalRefs.length === 0 ? (
                      <div className="font-mono text-[11px] tracking-[0.06em]" style={{ color: c.muted }}>
                        No linked claims yet.
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-3 font-mono text-[11px] tracking-[0.06em]" style={{ color: c.muted }}>
                No signal selected.
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
