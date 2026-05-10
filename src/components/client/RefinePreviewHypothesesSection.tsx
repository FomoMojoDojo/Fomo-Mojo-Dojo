import { useMemo, useState } from "react";
import { useStrategicHypotheses, type HypothesisProvenanceCard } from "@/hooks/useStrategicHypotheses";
import { scoreHypothesisEditorial, sortHypothesesForPhase, type HypothesisPriorityMode } from "@/lib/refinePreviewPhaseOrchestration";

function aggregateSourceMix(rows: HypothesisProvenanceCard["supportingClaims"]) {
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

function confidenceNarrative(level: string) {
  if (level === "high") return "Supported across multiple evidence sources";
  if (level === "medium") return "Emerging multi-source support";
  return "Directional signal only";
}

function validationNarrative(level: string) {
  if (level === "directional") return "Directional only";
  if (level === "validated") return "Validated";
  if (level === "contradicted") return "Conflicting evidence present";
  return "Not yet validated";
}

function hypothesisKindNarrative(kind: string) {
  if (kind === "inferred_tension") return "Tension to resolve";
  if (kind === "candidate_assumption") return "Assumption to test";
  return "Directional hypothesis";
}

function stateNarrative(state: string) {
  if (state === "strengthened") return "Holding across sources";
  if (state === "emerging") return "Building support";
  if (state === "contradicted") return "Evidence in conflict";
  if (state === "reframed") return "Recently reframed";
  if (state === "retired") return "No longer active";
  return "Early read";
}

function sourceMixNarrative(sourceMix: { outside: number; organization: number; customer: number }) {
  const hasOutside = sourceMix.outside > 0;
  const hasOrganization = sourceMix.organization > 0;
  const hasCustomer = sourceMix.customer > 0;

  if (hasCustomer && hasOrganization && hasOutside) {
    return "This is showing up across public, internal, and customer evidence.";
  }
  if (hasCustomer && hasOrganization) {
    return "This is showing up in both customer and internal evidence.";
  }
  if (hasCustomer && hasOutside) {
    return "This is showing up in customer evidence and public signals.";
  }
  if (hasCustomer) {
    return "This is based on customer evidence.";
  }
  if (hasOrganization && hasOutside) {
    return "This is showing up in outside and internal evidence, but we have not validated it with customers yet.";
  }
  if (hasOrganization) {
    return "This is based on internal evidence only. We have not validated it with customers yet.";
  }
  if (hasOutside) {
    return "This is based on public signals only. We have not validated it with internal or customer evidence yet.";
  }
  return "Evidence support is still thin.";
}

function supportingSummary(row: HypothesisProvenanceCard) {
  const evidenceThreads = row.supportingClaims.length;
  const sourceMix = aggregateSourceMix(row.supportingClaims);
  if (evidenceThreads <= 0) return "This is still a weak read from the evidence we have so far.";
  if (sourceMix.outside > 0 && sourceMix.organization === 0 && sourceMix.customer === 0) {
    return evidenceThreads > 1
      ? "This is showing up in outside evidence, but not enough to treat as fact."
      : "This is based on public signals only.";
  }
  return sourceMixNarrative(sourceMix);
}

function weakeningSummary(row: HypothesisProvenanceCard) {
  if (row.hypothesis.hypothesis_kind === "inferred_tension" && row.weakeningClaims.length === 0) {
    return "This is being held open as a tension because the current evidence does not settle it cleanly.";
  }
  if (row.weakeningClaims.length === 0) {
    return "Nothing is directly weakening this yet, but it still needs more proof.";
  }
  if (row.weakeningClaims.length === 1) {
    return "One conflicting evidence thread is already visible.";
  }
  return `${row.weakeningClaims.length} conflicting evidence threads are already visible.`;
}

function specificTruths(row: HypothesisProvenanceCard) {
  const generic = new Set([
    "Further evidence must confirm that this directional pattern matters in real decisions.",
    "Customer evidence must eventually confirm this internal strategic assumption.",
    "Customer or market evidence must confirm that this tension changes real buyer behavior.",
  ]);

  return (row.hypothesis.what_must_be_true ?? []).filter((item) => !generic.has(item));
}

function claimSupportLabel(row: HypothesisProvenanceCard["supportingClaims"][number]) {
  if (row.contradictionCount > 0) return "Conflicting evidence present";
  if (row.supportShape.customer > 0) return "Customer-backed";
  if (row.supportShape.organization > 0 && row.supportShape.outside > 0) return "Public and internal support";
  if (row.supportShape.organization > 0) return "Internal support";
  if (row.supportShape.outside > 0) return "Public signal";
  return "Thin support";
}

function claimSourceMixNarrative(row: HypothesisProvenanceCard["supportingClaims"][number]) {
  const mix = row.supportShape;
  if (mix.customer > 0 && mix.organization > 0 && mix.outside > 0) return "Evidence comes from customer, internal, and public sources.";
  if (mix.customer > 0 && mix.organization > 0) return "Evidence comes from customer and internal sources.";
  if (mix.customer > 0 && mix.outside > 0) return "Evidence comes from customer and public sources.";
  if (mix.customer > 0) return "Evidence comes from customer sources.";
  if (mix.organization > 0 && mix.outside > 0) return "Evidence comes from internal and public sources.";
  if (mix.organization > 0) return "Evidence comes from internal sources.";
  if (mix.outside > 0) return "Evidence comes from public signals.";
  return "Evidence support is still limited.";
}

function strongestExcerpt(row: HypothesisProvenanceCard["supportingClaims"][number]) {
  return row.strongestSupportingSignal?.evidence_excerpt || row.strongestSupportingSignal?.claim_text || null;
}

function sortPriority(row: HypothesisProvenanceCard) {
  const kindScore =
    row.hypothesis.hypothesis_kind === "inferred_tension"
      ? 30
      : row.hypothesis.hypothesis_kind === "candidate_assumption"
        ? 20
        : 10;
  const confidenceScore =
    row.hypothesis.confidence === "high"
      ? 3
      : row.hypothesis.confidence === "medium"
        ? 2
        : 1;
  const sourceMix = aggregateSourceMix(row.supportingClaims);
  const sourceScore =
    (sourceMix.customer > 0 ? 6 : 0) +
    (sourceMix.organization > 0 ? 3 : 0) +
    (sourceMix.outside > 0 ? 2 : 0);
  return kindScore + confidenceScore + sourceScore;
}

export function getRefinePreviewActiveHypotheses(
  rows: HypothesisProvenanceCard[],
  maxItems = 4,
  priorityMode: HypothesisPriorityMode = "balanced",
  phase?: "Pre-Diagnosis" | "Diagnose" | "Focus" | "Flow",
) {
  const activeRows = rows.filter((row) => row.hypothesis.is_active);
  const editorialPhase = phase === "Pre-Diagnosis" ? "outside_signals" : phase === "Diagnose" ? "diagnose" : phase === "Focus" ? "focus" : phase === "Flow" ? "flow" : undefined;
  const ordered = priorityMode === "balanced"
    ? [...activeRows].sort((a, b) => {
        const left = editorialPhase ? scoreHypothesisEditorial(a, editorialPhase) : sortPriority(a);
        const right = editorialPhase ? scoreHypothesisEditorial(b, editorialPhase) : sortPriority(b);
        return right - left;
      })
    : sortHypothesesForPhase(activeRows, priorityMode);
  return ordered.slice(0, maxItems);
}

function tensionWhyItMatters(row: HypothesisProvenanceCard) {
  if (row.hypothesis.hypothesis_kind !== "inferred_tension") return null;
  if ((row.hypothesis.what_must_be_true ?? []).length > 0) {
    return "If this tension holds, it changes what needs to be validated next.";
  }
  return "If this tension is real, the current strategic read is still unstable.";
}

export default function RefinePreviewHypothesesSection({
  companyId,
  phaseLabel,
  maxItems = 4,
  rows,
  showHeader = true,
  excludeHypothesisId,
  introCopy,
  note,
  priorityMode = "balanced",
  sectionLabel,
  title,
  emptyCopy,
  compressAfterLead = false,
}: {
  companyId?: string;
  phaseLabel: "Pre-Diagnosis" | "Diagnose" | "Focus" | "Flow";
  maxItems?: number;
  rows?: HypothesisProvenanceCard[];
  showHeader?: boolean;
  excludeHypothesisId?: string | null;
  introCopy?: string;
  note?: string;
  priorityMode?: HypothesisPriorityMode;
  sectionLabel?: string;
  title?: string | null;
  emptyCopy?: string;
  compressAfterLead?: boolean;
}) {
  const { data, isLoading, error } = useStrategicHypotheses(companyId);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const activeRows = useMemo(
    () => getRefinePreviewActiveHypotheses(rows ?? data ?? [], maxItems, priorityMode, phaseLabel),
    [data, maxItems, phaseLabel, priorityMode, rows],
  );

  const visibleRows = useMemo(() => {
    if (!excludeHypothesisId) return activeRows;
    const filtered = activeRows.filter((row) => row.hypothesis.id !== excludeHypothesisId);
    return filtered;
  }, [activeRows, excludeHypothesisId]);

  return (
    <section className={`crpv-hypotheses-section ${showHeader ? "" : "headerless"}`.trim()} aria-label="What appears true">
      {showHeader ? (
        <div className="crpv-hypotheses-header">
          <p className="cap">{sectionLabel || `What appears true · ${phaseLabel}`}</p>
          {title === null ? null : <h2>{title || "Early read"}</h2>}
          <p className="crpv-hypotheses-copy">
            {introCopy || "These are early reads from the evidence we have so far. They should change as we learn more."}
          </p>
          {note ? <p className="crpv-hypotheses-note">{note}</p> : null}
        </div>
      ) : null}

      {isLoading ? (
        <div className="crpv-hypotheses-empty">Loading directional hypotheses…</div>
      ) : error ? (
        <div className="crpv-hypotheses-empty">{(error as Error).message}</div>
      ) : activeRows.length === 0 ? (
        <div className="crpv-hypotheses-empty">
          {emptyCopy || "No directional hypotheses are visible yet. More outside or diagnosis evidence is needed before the system can surface a strategic read."}
        </div>
      ) : visibleRows.length === 0 ? null : (
        <div className="crpv-hypotheses-grid">
          {visibleRows.map((row) => {
            const expanded = expandedId === row.hypothesis.id;
            const isTension = row.hypothesis.hypothesis_kind === "inferred_tension";
            const isLead = visibleRows[0]?.hypothesis.id === row.hypothesis.id;
            const quiet = compressAfterLead && !isLead && !expanded;
            return (
              <article
                key={row.hypothesis.id}
                className={`crpv-hypothesis-card ${isTension ? "is-tension" : ""} ${quiet ? "is-quiet" : ""}`.trim()}
              >
                <div className="crpv-hypothesis-topline">
                  <span className="crpv-hypothesis-kind">{hypothesisKindNarrative(row.hypothesis.hypothesis_kind)}</span>
                  <span className="crpv-hypothesis-state">{stateNarrative(row.hypothesis.hypothesis_state)}</span>
                </div>
                <h3>{row.hypothesis.statement}</h3>

                {quiet ? (
                  <div className="crpv-hypothesis-quiet-summary">
                    <p>{supportingSummary(row)}</p>
                  </div>
                ) : (
                  <>
                    <div className="crpv-hypothesis-read">
                      <div>
                        <span className="cap">Confidence read</span>
                        <p>{confidenceNarrative(row.hypothesis.confidence)}</p>
                      </div>
                      <div>
                        <span className="cap">Validation</span>
                        <p>{validationNarrative(row.hypothesis.validation_state)}</p>
                      </div>
                    </div>

                    {isTension ? (
                      <div className="crpv-hypothesis-tension-callout">
                        <span className="cap">Why this tension matters</span>
                        <p>{tensionWhyItMatters(row)}</p>
                      </div>
                    ) : null}

                    <div className="crpv-hypothesis-summary">
                      <div>
                        <span className="cap">Why this appears true</span>
                        <p>{supportingSummary(row)}</p>
                      </div>
                      <div>
                        <span className="cap">What weakens this</span>
                        <p>{weakeningSummary(row)}</p>
                      </div>
                    </div>

                    <div className="crpv-hypothesis-truths">
                      <span className="cap">What must be true</span>
                      <div className="crpv-hypothesis-truth-list">
                        {specificTruths(row).length > 0 ? (
                          specificTruths(row).slice(0, 3).map((item) => (
                            <div key={item} className="crpv-hypothesis-truth">
                              {item}
                            </div>
                          ))
                        ) : (
                          <div className="crpv-hypothesis-truth">We need to test whether this actually affects customer or stakeholder decisions.</div>
                        )}
                      </div>
                    </div>
                  </>
                )}

                <div className="crpv-hypothesis-actions">
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={() => setExpandedId((current) => (current === row.hypothesis.id ? null : row.hypothesis.id))}
                  >
                    {expanded ? "Hide evidence" : "See evidence"}
                  </button>
                </div>

                {expanded ? (
                  <div className="crpv-hypothesis-detail">
                    <div className="crpv-hypothesis-detail-block">
                      <div className="crpv-hypothesis-detail-title">Supporting evidence</div>
                      <div className="crpv-hypothesis-claim-list">
                        {row.supportingClaims.map((claim) => (
                          <div key={claim.claim.id} className="crpv-hypothesis-claim-card">
                            <div className="crpv-hypothesis-claim-topline">
                              <span>{claimSupportLabel(claim)}</span>
                            </div>
                            <p className="crpv-hypothesis-claim-text">{claim.claim.statement}</p>
                            <p className="crpv-hypothesis-claim-meta">{claimSourceMixNarrative(claim)}</p>
                            {strongestExcerpt(claim) ? (
                              <p className="crpv-hypothesis-claim-excerpt">{strongestExcerpt(claim)}</p>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="crpv-hypothesis-detail-block">
                      <div className="crpv-hypothesis-detail-title">Weakening evidence</div>
                      {row.weakeningClaims.length > 0 ? (
                        <div className="crpv-hypothesis-claim-list">
                          {row.weakeningClaims.map((claim) => (
                            <div key={claim.claim.id} className="crpv-hypothesis-claim-card is-weakening">
                              <div className="crpv-hypothesis-claim-topline">
                                <span>Weakening evidence</span>
                              </div>
                              <p className="crpv-hypothesis-claim-text">{claim.claim.statement}</p>
                              <p className="crpv-hypothesis-claim-meta">{claimSourceMixNarrative(claim)}</p>
                              {strongestExcerpt(claim) ? (
                                <p className="crpv-hypothesis-claim-excerpt">{strongestExcerpt(claim)}</p>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div
                          style={{
                            border: "1px solid #d7ded1",
                            background: "#fbfaf6",
                            padding: "12px 14px",
                            fontSize: 13,
                            lineHeight: 1.6,
                            color: "#54656a",
                          }}
                        >
                          No direct weakening evidence is linked yet.
                        </div>
                      )}
                    </div>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
