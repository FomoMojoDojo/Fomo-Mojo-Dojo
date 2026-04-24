import { useMemo } from "react";
import PageShell from "@/components/layout/PageShell";
import { useCompany } from "@/hooks/useCompany";
import { useClientViewData } from "@/hooks/useClientViewData";
import "@/styles/client-refine-preview.css";

function toSentence(value: string | null | undefined) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function statusLabel(value: string) {
  if (value === "in_progress") return "In progress";
  if (value === "planned") return "Planned";
  if (value === "parked") return "Parked";
  if (value === "done") return "Done";
  return "Planned";
}

function confidencePercent(level: "Low" | "Medium" | "High") {
  if (level === "High") return 82;
  if (level === "Medium") return 58;
  return 34;
}

export default function ClientRefinePreviewView() {
  const { companies, setActiveCompanyId, loading: companiesLoading } = useCompany();
  const {
    activeCompany,
    hasCompany,
    topActions,
    primaryConstraint,
    nextMove,
    confidence,
    evidence,
    inputCoverage,
    signalStrength,
    phase,
    primaryDesiredOutcome,
  } = useClientViewData({ actionLimit: 4 });

  const headline = useMemo(() => {
    const nextMoveDetail = toSentence(nextMove?.detail);
    const constraintDetail = toSentence(primaryConstraint?.detail);
    return (
      nextMoveDetail ||
      constraintDetail ||
      "Define the single highest-leverage next move from current evidence."
    );
  }, [nextMove?.detail, primaryConstraint?.detail]);

  const strongestSignal = useMemo(() => {
    const rows = [signalStrength.proof, signalStrength.ownership, signalStrength.execution];
    return rows.sort((a, b) => b.value - a.value)[0];
  }, [signalStrength.execution, signalStrength.ownership, signalStrength.proof]);

  const evidenceLine = useMemo(() => {
    const present = evidence.sources.filter((source) => source.present).map((source) => source.label);
    if (present.length === 0) return "No evidence sources are currently present.";
    return `Active evidence sources: ${present.join(", ")}.`;
  }, [evidence.sources]);

  return (
    <PageShell bare tone="neutral" mainClassName="max-w-none px-0 pb-0 pt-0">
      <section className="crpv-page">
        <div className="crpv-shell">
          {!hasCompany ? (
            <article className="crpv-card crpv-empty">
              <p className="crpv-cap">Client Refine Preview · Read-only</p>
              <h1>Select a company to open the refine preview.</h1>
              {companiesLoading ? (
                <p className="crpv-muted">Loading companies…</p>
              ) : companies.length > 0 ? (
                <div className="crpv-company-grid">
                  {companies.map((company) => (
                    <button
                      key={company.id}
                      type="button"
                      className="crpv-ghost-button"
                      onClick={() => setActiveCompanyId(company.id)}
                    >
                      <span>{company.name}</span>
                      <small>{company.quarter || "Quarter"} · {company.archetype || "Archetype"}</small>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="crpv-muted">No companies available.</p>
              )}
            </article>
          ) : (
            <>
              <header className="crpv-card crpv-command">
                <div className="crpv-header-row">
                  <div>
                    <p className="crpv-cap">Client Refine Preview · Read-only</p>
                    <h1>{toSentence(activeCompany?.name) || "Selected Company"}</h1>
                  </div>
                  <div className="crpv-phase-chip">{phase.toUpperCase()}</div>
                </div>
                <p className="crpv-headline">{headline}</p>
                <div className="crpv-metrics">
                  <div>
                    <p className="crpv-cap">Mojo Score</p>
                    <p className="crpv-value">{activeCompany?.mojo_score ?? "—"}</p>
                  </div>
                  <div>
                    <p className="crpv-cap">Confidence</p>
                    <p className="crpv-value">{confidence.level}</p>
                  </div>
                  <div>
                    <p className="crpv-cap">Input Coverage</p>
                    <p className="crpv-value">{Math.round(inputCoverage.overallCoverage)}%</p>
                  </div>
                </div>
                <div className="crpv-cta-row" aria-hidden>
                  <span>✓ Agree</span>
                  <span>Disagree</span>
                  <span>Need Evidence</span>
                </div>
              </header>

              <div className="crpv-grid">
                <article className="crpv-card">
                  <p className="crpv-cap">Map</p>
                  <div className="crpv-map">
                    <div className="crpv-map-step is-done">Start</div>
                    <div className="crpv-map-link" />
                    <div className="crpv-map-step is-current">You Are Here</div>
                    <div className="crpv-map-link" />
                    <div className="crpv-map-step">Next Move</div>
                    <div className="crpv-map-link" />
                    <div className="crpv-map-step">Desired</div>
                  </div>
                  <p className="crpv-muted">
                    This preview mirrors current selected-company data and does not write or mutate records.
                  </p>
                </article>

                <article className="crpv-card">
                  <p className="crpv-cap">Top Actions</p>
                  <ul className="crpv-list">
                    {topActions.length > 0 ? (
                      topActions.map((action) => (
                        <li key={action.id}>
                          <div>
                            <p className="crpv-list-title">{toSentence(action.title)}</p>
                            <p className="crpv-list-meta">
                              {action.category} · {statusLabel(action.status)} · Score {action.score}
                            </p>
                          </div>
                          <div className="crpv-owner">
                            {toSentence(action.primaryOwner) || "Unassigned"}
                          </div>
                        </li>
                      ))
                    ) : (
                      <li className="is-empty">No mapped actions yet for this company.</li>
                    )}
                  </ul>
                </article>
              </div>

              <div className="crpv-grid crpv-grid-context">
                <article className="crpv-card">
                  <p className="crpv-cap">Why this</p>
                  <p className="crpv-body">
                    {toSentence(topActions[0]?.whyItMatters) || "No clear rationale captured yet."}
                  </p>
                </article>
                <article className="crpv-card">
                  <p className="crpv-cap">What’s blocking</p>
                  <p className="crpv-body">
                    {toSentence(primaryConstraint?.detail) || "No primary blocker has been captured yet."}
                  </p>
                </article>
                <article className="crpv-card">
                  <p className="crpv-cap">Signals</p>
                  <p className="crpv-body">
                    Strongest signal is <strong>{strongestSignal.label}</strong> at{" "}
                    <strong>{Math.round(strongestSignal.value)}%</strong>. {evidenceLine}
                  </p>
                </article>
                <article className="crpv-card">
                  <p className="crpv-cap">Progress</p>
                  <p className="crpv-body">
                    Confidence is currently <strong>{confidence.level}</strong> with a projected progress index of{" "}
                    <strong>{confidencePercent(confidence.level)}%</strong>.
                  </p>
                  <p className="crpv-subtle">
                    Desired outcome: {toSentence(primaryDesiredOutcome?.statement) || "Not defined yet."}
                  </p>
                </article>
              </div>
            </>
          )}
        </div>
      </section>
    </PageShell>
  );
}
