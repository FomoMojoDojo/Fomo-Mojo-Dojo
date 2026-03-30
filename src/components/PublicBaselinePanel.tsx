import { usePublicBaseline } from "@/hooks/usePublicBaseline";
import { useAuth } from "@/hooks/useAuth";
import { useLlmTraceDebug } from "@/hooks/useLlmTraceDebug";
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
  run_ledger?: {
    provider?: string;
    model?: string;
    endpoint?: string;
    path?: string;
    local_only?: boolean;
    generated_at?: string;
  };
  category_archetype?: string;
  lens_card?: {
    economic_engine?: string;
  };
  evidence_ledger?: EvidenceLedgerItem[];
  top_hypotheses?: string[];
  open_questions?: string[];
  message_alignment?: {
    company_claim_posture?: string;
    outside_voice_posture?: string;
    alignment_status?: string;
    alignment_summary?: string;
  };
  outside_voice_signals?: Array<{
    perspective?: string;
    source_type?: string;
    signal?: string;
    sentiment?: string;
    alignment?: string;
    url?: string;
    confidence?: number;
  }>;
};

type BaselineDiagnostics = {
  query_runs?: Array<{
    key?: string;
    label?: string;
    query?: string;
    raw_count?: number;
    sample_urls?: string[];
  }>;
  source_type_coverage?: Array<{
    source_type?: string;
    enabled?: boolean;
    excluded?: boolean;
    annotated_count?: number;
    policy_allowed_count?: number;
    candidate_count?: number;
    direct_evidence_count?: number;
    extracted_count?: number;
    final_evidence_count?: number;
  }>;
};

function diagnosticsFromSourcesJson(value: unknown): BaselineDiagnostics | null {
  if (!value || typeof value !== "object") return null;
  const diagnostics = (value as Record<string, unknown>).diagnostics;
  if (!diagnostics || typeof diagnostics !== "object") return null;
  return diagnostics as BaselineDiagnostics;
}

function prettySourceTypeLabel(value: string) {
  switch (value) {
    case "profile_or_company_page":
      return "Profile/company";
    case "third_party_profile":
      return "Third-party profile";
    case "employee_review":
      return "Employee review";
    case "customer_review":
      return "Customer review";
    case "community_discussion":
      return "Community discussion";
    case "review_signal":
      return "Review signal";
    case "news_signal":
      return "News signal";
    case "public_web":
      return "Public web";
    default:
      return value.replaceAll("_", " ");
  }
}

function evidenceCandidateCountFromSourcesJson(value: unknown) {
  if (!value || typeof value !== "object") return 0;
  const record = value as Record<string, unknown>;
  const selected = Array.isArray(record.selected_sources) ? record.selected_sources.length : 0;
  const annotated = Array.isArray(record.annotated_sources) ? record.annotated_sources.length : 0;
  const top = Array.isArray(record.annotated_top) ? record.annotated_top.length : 0;
  if (selected > 0) return selected;
  if (annotated > 0) return annotated;
  return top;
}

export function PublicBaselinePanel({ companyId }: { companyId: string }) {
  const { isAdmin } = useAuth();
  const { enabled: llmTraceEnabled } = useLlmTraceDebug();
  const { loading, run, preferredRun, error } = usePublicBaseline(companyId);
  const displayRun = preferredRun ?? run;

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

  if (!displayRun) {
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

  const showingPriorRun = Boolean(run && displayRun && run.id !== displayRun.id);
  const r = (displayRun.result_json ?? {}) as PublicBaselineResult;
  const lens = r.lens_card ?? {};
  const ledger = Array.isArray(r.evidence_ledger) ? r.evidence_ledger : [];
  const evidenceCandidates = evidenceCandidateCountFromSourcesJson(displayRun.sources_json);
  const diagnostics = diagnosticsFromSourcesJson(displayRun.sources_json);
  const queryRuns = Array.isArray(diagnostics?.query_runs) ? diagnostics.query_runs : [];
  const sourceCoverage = Array.isArray(diagnostics?.source_type_coverage) ? diagnostics.source_type_coverage : [];
  const topLedger = ledger.slice(0, 6);
  const confidences = ledger
    .map((item) => (typeof item?.confidence === "number" ? item.confidence : null))
    .filter((value: number | null): value is number => value !== null);
  const avgConfidence = confidences.length
    ? Math.round(confidences.reduce((sum, value) => sum + value, 0) / confidences.length)
    : null;
  const topHypotheses = Array.isArray(r.top_hypotheses) ? r.top_hypotheses.slice(0, 4) : [];
  const openQuestions = Array.isArray(r.open_questions) ? r.open_questions.slice(0, 4) : [];
  const alignment = r.message_alignment ?? {};
  const outsideSignals = Array.isArray(r.outside_voice_signals) ? r.outside_voice_signals.slice(0, 4) : [];
  const outsideSignalConfidences = outsideSignals
    .map((item) => (typeof item?.confidence === "number" ? item.confidence : null))
    .filter((value: number | null): value is number => value !== null);
  const avgOutsideConfidence = outsideSignalConfidences.length
    ? Math.round(outsideSignalConfidences.reduce((sum, value) => sum + value, 0) / outsideSignalConfidences.length)
    : 0;
  const alignmentValidationScore = outsideSignals.length
    ? Math.max(20, Math.min(55, Math.round(avgOutsideConfidence * 0.55)))
    : 15;
  const baselineStatus = typeof r.status === "string" ? r.status : "baseline_available";
  const baselineReason = typeof r.reason === "string" ? r.reason : null;
  const runLedger = r.run_ledger ?? {};
  const runProvider = String(runLedger.provider || "openai_public");
  const runModel = String(runLedger.model || "unknown");
  const runPath = String(runLedger.path || "public_web_research");
  const providerLabel =
    runProvider === "openai_public"
      ? "OpenAI (Public)"
      : runProvider === "ollama_local"
        ? "Ollama (Local)"
        : runProvider.replaceAll("_", " ");
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
            <MetaBadge>Run #{displayRun.id}</MetaBadge>
            <MetaBadge>{new Date(displayRun.created_at).toLocaleString()}</MetaBadge>
            {showingPriorRun ? <MetaBadge>Showing latest usable baseline</MetaBadge> : null}
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
        {showingPriorRun ? (
          <div className="md:col-span-2 rounded-xl border border-[#F1C3AC] bg-[#FFF7F2] p-3">
            <div className="font-mono text-[10px] uppercase tracking-wide text-[#9a4f27]">
              Latest run was weak
            </div>
            <div className="mt-1 font-sans text-[12px] text-[#7a4f36]">
              Showing run #{displayRun.id} because it contains richer baseline context than the latest run.
            </div>
          </div>
        ) : null}

        <div className="border border-border rounded-xl p-3 bg-muted/10">
          <div className="font-mono text-[10px] text-muted-foreground uppercase tracking-wide">
            Source Path
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <MetaBadge>Public web research only</MetaBadge>
            {llmTraceEnabled && isAdmin ? (
              <>
                <MetaBadge>{providerLabel}</MetaBadge>
                <MetaBadge>{runModel}</MetaBadge>
                <MetaBadge>{runPath.replaceAll("_", " ")}</MetaBadge>
              </>
            ) : null}
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
            <ScoreChip label="Evidence" value={evidenceCandidates} />
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
            Message Alignment
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <MetaBadge>{alignment.alignment_status || "unknown"}</MetaBadge>
            <ScoreChip label="Validation" value={alignmentValidationScore} />
          </div>
          <div className="mt-2 font-sans text-[12px] italic text-muted-foreground">
            {alignment.outside_voice_posture || "Outside voice unknown."}
          </div>
          <div className="mt-2 font-sans text-[12px] text-muted-foreground">
            Public-web inference only. This has not been hard-validated with primary customer interviews, internal data, or direct stakeholder testing.
          </div>
          <div className="font-sans text-[12px] text-foreground mt-2">
            {alignment.alignment_summary || "No message-alignment summary captured."}
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

        <div className="border border-border rounded-xl p-3 bg-muted/10">
          <div className="font-mono text-[10px] text-muted-foreground uppercase tracking-wide">
            Outside Voice Signals
          </div>
          {outsideSignals.length === 0 ? (
            <div className="font-sans text-[12px] text-muted-foreground mt-1">
              No explicit employee, customer, or market signals captured.
            </div>
          ) : (
            <div className="mt-2 space-y-2">
              {outsideSignals.map((item, index) => (
                <div key={`${item.url ?? "signal"}-${index}`} className="rounded-lg border border-border bg-white p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <MetaBadge>{item.perspective || "outside voice"}</MetaBadge>
                    <MetaBadge>{item.sentiment || "unknown sentiment"}</MetaBadge>
                    <MetaBadge>{item.alignment || "unknown alignment"}</MetaBadge>
                    <ScoreChip label="Conf" value={item.confidence} />
                  </div>
                  <div className="mt-2 font-sans text-[12px] text-foreground">
                    {item.signal || "No outside-voice summary captured."}
                  </div>
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

        <div className="border border-border rounded-xl p-3 bg-muted/10 md:col-span-2">
          <div className="font-mono text-[10px] text-muted-foreground uppercase tracking-wide">
            Source Run Diagnostics
          </div>
          {queryRuns.length === 0 && sourceCoverage.length === 0 ? (
            <div className="font-sans text-[12px] text-muted-foreground mt-2">
              No diagnostics recorded for this run.
            </div>
          ) : (
            <div className="mt-2 grid grid-cols-1 gap-3 lg:grid-cols-2">
              <div className="space-y-2">
                <div className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                  Queries Attempted
                </div>
                {queryRuns.slice(0, 10).map((entry, index) => (
                  <div key={`${entry.key || "q"}-${index}`} className="rounded-lg border border-border bg-white p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-sans text-[12px] font-medium text-foreground">
                        {entry.label || entry.key || `Query ${index + 1}`}
                      </div>
                      <ScoreChip label="Hits" value={entry.raw_count ?? 0} />
                    </div>
                    <div className="mt-1 font-mono text-[10px] text-muted-foreground break-all">
                      {entry.query || "n/a"}
                    </div>
                  </div>
                ))}
              </div>

              <div className="space-y-2">
                <div className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                  Source Type Coverage
                </div>
                {sourceCoverage.slice(0, 12).map((entry, index) => {
                  const sourceType = String(entry.source_type || "public_web");
                  return (
                    <div key={`${sourceType}-${index}`} className="rounded-lg border border-border bg-white p-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-sans text-[12px] font-medium text-foreground">
                          {prettySourceTypeLabel(sourceType)}
                        </div>
                        <MetaBadge>{entry.enabled === false ? "excluded" : "active"}</MetaBadge>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <ScoreChip label="Search" value={entry.annotated_count ?? 0} />
                        <ScoreChip label="Allowed" value={entry.policy_allowed_count ?? 0} />
                        <ScoreChip label="Cand" value={entry.candidate_count ?? 0} />
                        <ScoreChip label="Extracted" value={entry.extracted_count ?? 0} />
                        <ScoreChip label="Final" value={entry.final_evidence_count ?? 0} />
                      </div>
                    </div>
                  );
                })}
              </div>
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
