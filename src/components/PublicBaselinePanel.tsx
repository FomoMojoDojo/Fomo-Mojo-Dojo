import { usePublicBaseline } from "@/hooks/usePublicBaseline";
import { MetaBadge, ScoreChip, StateBadge } from "@/components/ui/semantic-badges";

type EvidenceLedgerItem = {
  bucket?: string;
  signal_strength?: string;
  confidence?: number;
  snippet?: string;
  url?: string;
};

type PublicBaselineResult = {
  status?: string;
  reason?: string;
  category_archetype?: string;
  lens_card?: {
    economic_engine?: string;
  };
  evidence_ledger?: EvidenceLedgerItem[];
  top_hypotheses?: string[];
  open_questions?: string[];
};

export function PublicBaselinePanel({ companyId }: { companyId: string }) {
  const { loading, run, error } = usePublicBaseline(companyId);

  if (loading) {
    return (
      <div className="bg-white border border-border rounded-2xl p-4 shadow-sm">
        <div className="font-mono text-[10px] text-muted-foreground uppercase tracking-wide">
          Loading baseline…
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white border border-border rounded-2xl p-4 shadow-sm">
        <div className="font-mono text-[10px] text-danger uppercase tracking-wide">
          Failed to load baseline: {error}
        </div>
      </div>
    );
  }

  if (!run) {
    return (
      <div className="bg-white border border-border rounded-2xl p-4 shadow-sm">
        <div className="font-sans text-[14px] font-semibold text-foreground">
          Public Baseline
        </div>
        <div className="font-mono text-[10px] text-muted-foreground uppercase tracking-wide mt-1">
          No baseline run yet.
        </div>
      </div>
    );
  }

  const r = (run.result_json ?? {}) as PublicBaselineResult;
  const lens = r.lens_card ?? {};
  const ledger = Array.isArray(r.evidence_ledger) ? r.evidence_ledger : [];
  const sources = Array.isArray(run.sources_json) ? run.sources_json : [];
  const topLedger = ledger.slice(0, 6);
  const confidences = ledger
    .map((item) => (typeof item?.confidence === "number" ? item.confidence : null))
    .filter((value: number | null): value is number => value !== null);
  const avgConfidence = confidences.length
    ? Math.round(confidences.reduce((sum, value) => sum + value, 0) / confidences.length)
    : null;
  const topHypotheses = Array.isArray(r.top_hypotheses) ? r.top_hypotheses.slice(0, 4) : [];
  const openQuestions = Array.isArray(r.open_questions) ? r.open_questions.slice(0, 4) : [];
  const baselineStatus = typeof r.status === "string" ? r.status : "baseline_available";
  const baselineReason = typeof r.reason === "string" ? r.reason : null;
  const statusTone =
    baselineStatus.includes("error") || baselineStatus.includes("fail")
      ? "gap"
      : baselineStatus.includes("question") || baselineStatus.includes("partial")
        ? "overserved"
        : "designed";

  return (
    <div className="bg-white border border-border rounded-2xl p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-sans text-[14px] font-semibold text-foreground">
            Public Baseline
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <MetaBadge>Run #{run.id}</MetaBadge>
            <MetaBadge>{new Date(run.created_at).toLocaleString()}</MetaBadge>
          </div>
        </div>

        <button
          type="button"
          onClick={() => window.location.reload()}
          className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-md border border-border bg-white hover:bg-muted/40 transition-colors"
          title="Quick refresh"
        >
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
        <div className="border border-border rounded-xl p-3 bg-muted/10">
          <div className="font-mono text-[10px] text-muted-foreground uppercase tracking-wide">
            Source Path
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <MetaBadge>Public web research only</MetaBadge>
            <StateBadge tone={statusTone}>{baselineStatus.replaceAll("_", " ")}</StateBadge>
          </div>
          {baselineReason ? (
            <div className="font-sans text-[12px] text-muted-foreground mt-1">
              {baselineReason}
            </div>
          ) : null}
        </div>

        <div className="border border-border rounded-xl p-3 bg-muted/10">
          <div className="font-mono text-[10px] text-muted-foreground uppercase tracking-wide">
            Evidence Quality
          </div>
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            <ScoreChip label="Ledger" value={ledger.length} />
            <ScoreChip label="Sources" value={sources.length} />
            <ScoreChip label="Conf" value={avgConfidence} />
          </div>
        </div>

        <div className="border border-border rounded-xl p-3 bg-muted/10">
          <div className="font-mono text-[10px] text-muted-foreground uppercase tracking-wide">
            Category Archetype
          </div>
          <div className="font-sans text-[12px] text-foreground mt-1">
            {r.category_archetype || "Unknown"}
          </div>
        </div>

        <div className="border border-border rounded-xl p-3 bg-muted/10">
          <div className="font-mono text-[10px] text-muted-foreground uppercase tracking-wide">
            Economic Engine
          </div>
          <div className="font-sans text-[12px] text-foreground mt-1">
            {lens.economic_engine || "Unknown"}
          </div>
        </div>

        <div className="border border-border rounded-xl p-3 bg-muted/10">
          <div className="font-mono text-[10px] text-muted-foreground uppercase tracking-wide">
            Top Hypotheses
          </div>
          {topHypotheses.length === 0 ? (
            <div className="font-sans text-[12px] text-muted-foreground mt-1">
              No explicit hypotheses captured.
            </div>
          ) : (
            <div className="mt-2 space-y-2">
              {topHypotheses.map((item: string, index: number) => (
                <div key={`${item}-${index}`} className="font-sans text-[12px] text-foreground">
                  {item}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border border-border rounded-xl p-3 bg-muted/10">
          <div className="font-mono text-[10px] text-muted-foreground uppercase tracking-wide">
            Open Questions
          </div>
          {openQuestions.length === 0 ? (
            <div className="font-sans text-[12px] text-muted-foreground mt-1">
              No open questions captured.
            </div>
          ) : (
            <div className="mt-2 space-y-2">
              {openQuestions.map((item: string, index: number) => (
                <div key={`${item}-${index}`} className="font-sans text-[12px] text-foreground">
                  {item}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border border-border rounded-xl p-3 bg-muted/10 md:col-span-2">
          <div className="font-mono text-[10px] text-muted-foreground uppercase tracking-wide">
            Evidence Ledger (Top 6)
          </div>

          {topLedger.length === 0 ? (
            <div className="font-mono text-[10px] text-muted-foreground uppercase tracking-wide mt-2">
              No ledger items found.
            </div>
          ) : (
            <div className="mt-2 space-y-2">
              {topLedger.map((item, i: number) => (
                <div
                  key={`${item.url ?? "u"}-${i}`}
                  className="border border-border rounded-lg p-3 bg-white"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-sans text-[12px] font-semibold text-foreground">
                      {item.bucket || "Signal"}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <MetaBadge>{item.signal_strength || "unknown"}</MetaBadge>
                      <ScoreChip label="Conf" value={item.confidence} />
                    </div>
                  </div>

                  {item.snippet && (
                    <div className="font-mono text-[10px] text-muted-foreground mt-1">
                      {item.snippet}
                    </div>
                  )}

                  {item.url && (
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noreferrer"
                      className="font-mono text-[10px] text-foreground/80 hover:text-foreground hover:underline mt-2 inline-block break-all"
                    >
                      {item.url}
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
