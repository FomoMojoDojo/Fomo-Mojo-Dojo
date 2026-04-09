import ClientModeNav from "@/components/client-view/ClientModeNav";
import ClientSignalBars from "@/components/client-view/ClientSignalBars";
import PageShell from "@/components/layout/PageShell";
import { useClientViewData } from "@/hooks/useClientViewData";

function knownVsAssumedCounts(sources: Array<{ present: boolean }>) {
  const known = sources.filter((item) => item.present).length;
  const assumed = Math.max(0, sources.length - known);
  return { known, assumed };
}

export default function ClientMapView() {
  const {
    activeCompany,
    hasCompany,
    evidence,
    confidence,
    signalStrength,
    mapStatus,
    committedAt,
    mapPrimaryOwner,
    rerunAnalysis,
    rerunningAnalysis,
    allActions,
  } = useClientViewData({ actionLimit: 5 });

  const evidenceCounts = knownVsAssumedCounts(evidence.sources);

  return (
    <PageShell bare tone="neutral">
      <div className="client-view-stage max-w-content mx-auto px-4 pb-14 pt-6 sm:px-6 md:px-9">
        <header className="mb-5">
          <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-t-muted">Foundation</p>
          <h1 className="mt-1 max-w-[700px] font-sans text-[32px] font-medium leading-[1.1] text-t-primary">
            What do we know?
          </h1>
          <p className="mt-2 max-w-[700px] font-sans text-[15px] leading-[1.6] text-t-secondary">
            Inputs, confidence, and signal quality before diagnosis.
          </p>
        </header>

        <div className="space-y-5">
          <ClientModeNav
            activeMode="foundation"
            mapStatus={mapStatus}
            committedAt={committedAt}
            primaryOwner={mapPrimaryOwner}
            onRerunAnalysis={rerunAnalysis}
            rerunning={rerunningAnalysis}
          />

          {!hasCompany ? (
            <div className="rounded-xl border border-[#d8e1de] bg-white p-5">
              <p className="font-sans text-[14px] text-t-secondary">Select a company to open Foundation.</p>
            </div>
          ) : (
            <>
              <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1.3fr_1fr]">
                <div className="rounded-2xl border border-[#d8e1de] bg-white px-4 py-4">
                  <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-t-muted">Evidence sources</p>
                  <div className="mt-2 space-y-2">
                    {evidence.sources.map((source) => (
                      <div key={`foundation-source-${source.label}`} className="flex items-center justify-between">
                        <p className="font-sans text-[14px] text-t-primary">{source.label}</p>
                        <span
                          className={`rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] ${
                            source.present
                              ? "border-forest/35 bg-forest/10 text-forest"
                              : "border-rust/35 bg-rust/10 text-rust"
                          }`}
                        >
                          {source.present ? "present" : "missing"}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 border-t border-[#e2eae6] pt-3">
                    <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-t-muted">Known vs assumed</p>
                    <p className="mt-1 font-sans text-[15px] text-t-primary">
                      Known: <span className="font-semibold">{evidenceCounts.known}</span> · Assumed:{" "}
                      <span className="font-semibold">{evidenceCounts.assumed}</span>
                    </p>
                  </div>
                </div>

                <div className="rounded-2xl border border-[#d8e1de] bg-white px-4 py-4">
                  <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-t-muted">Confidence level</p>
                  <p className="mt-2 font-sans text-[28px] font-semibold text-t-primary">{confidence.level}</p>
                  <p className="mt-1 max-w-[420px] font-sans text-[13px] leading-[1.45] text-t-secondary">
                    {confidence.explanation}
                  </p>
                  <div className="mt-4">
                    <ClientSignalBars summary={signalStrength} compact />
                  </div>
                </div>
              </section>

              <section className="rounded-2xl border border-[#d8e1de] bg-white px-4 py-4">
                <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-t-muted">Input baseline</p>
                <p className="mt-1 max-w-[740px] font-sans text-[14px] leading-[1.5] text-t-secondary">
                  {activeCompany?.name || "This company"} has {allActions.length} active opportunity signals in the current map.
                  Use these as working inputs before locking diagnosis.
                </p>
              </section>
            </>
          )}
        </div>
      </div>
    </PageShell>
  );
}
