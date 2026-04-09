import ClientConstraintDiagnosis from "@/components/client-view/ClientConstraintDiagnosis";
import ClientModeNav from "@/components/client-view/ClientModeNav";
import PageShell from "@/components/layout/PageShell";
import { useClientViewData } from "@/hooks/useClientViewData";

export default function ClientDiagnosisView() {
  const {
    hasCompany,
    topActions,
    ownership,
    primaryConstraint,
    confidence,
    evidence,
    currentUserBelief,
    currentUserId,
    currentUserLabel,
    teamBeliefs,
    alignmentSummary,
    setConstraintBelief,
    setConstraintConfidence,
    mapStatus,
    committedAt,
    mapPrimaryOwner,
    rerunAnalysis,
    rerunningAnalysis,
  } = useClientViewData({ actionLimit: 3 });

  const assumptions = topActions[0]?.assumptions ?? [
    "The team agrees on the core bottleneck.",
    "Evidence quality is enough to prioritize work.",
    "Owners can act this cycle.",
  ];

  return (
    <PageShell bare tone="neutral">
      <div className="client-view-stage max-w-content mx-auto px-4 pb-14 pt-6 sm:px-6 md:px-9">
        <header className="mb-5">
          <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-t-muted">Diagnosis</p>
          <h1 className="mt-1 max-w-[700px] font-sans text-[32px] font-medium leading-[1.1] text-t-primary">
            What is the core problem?
          </h1>
          <p className="mt-2 max-w-[700px] font-sans text-[15px] leading-[1.6] text-t-secondary">
            Constraint, evidence support, and team belief alignment.
          </p>
        </header>

        <div className="space-y-5">
          <ClientModeNav
            activeMode="diagnosis"
            mapStatus={mapStatus}
            committedAt={committedAt}
            primaryOwner={mapPrimaryOwner}
            onRerunAnalysis={rerunAnalysis}
            rerunning={rerunningAnalysis}
          />

          {!hasCompany ? (
            <div className="rounded-xl border border-[#d8e1de] bg-white p-5">
              <p className="font-sans text-[14px] text-t-secondary">Select a company to open Diagnosis.</p>
            </div>
          ) : (
            <>
              <ClientConstraintDiagnosis
                constraint={primaryConstraint}
                ownership={ownership}
                confidence={confidence}
                evidence={evidence}
                currentUserBelief={currentUserBelief}
                currentUserId={currentUserId}
                currentUserLabel={currentUserLabel}
                teamBeliefs={teamBeliefs}
                alignmentSummary={alignmentSummary}
                onBeliefChange={setConstraintBelief}
                onConfidenceChange={setConstraintConfidence}
              />

              <section className="rounded-2xl border border-[#d8e1de] bg-white px-4 py-4">
                <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-t-muted">What must be true</p>
                <ul className="mt-2 space-y-1.5">
                  {assumptions.slice(0, 3).map((item) => (
                    <li key={`diagnosis-assume-${item}`} className="font-sans text-[14px] leading-[1.45] text-t-primary">
                      {item}
                    </li>
                  ))}
                </ul>
              </section>
            </>
          )}
        </div>
      </div>
    </PageShell>
  );
}
