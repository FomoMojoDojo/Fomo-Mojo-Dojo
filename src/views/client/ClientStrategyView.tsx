import { useMemo } from "react";
import ClientModeNav from "@/components/client-view/ClientModeNav";
import PageShell from "@/components/layout/PageShell";
import { useClientViewData } from "@/hooks/useClientViewData";
import { useHashAnchorScroll } from "@/hooks/useHashAnchorScroll";
import { useStrategyCascade } from "@/hooks/useStrategyCascade";

function fallbackDirection(companyName?: string | null) {
  if (companyName?.trim()) {
    return `Build a clear, owned path to better decisions for ${companyName}.`;
  }
  return "Build a clear, owned path to better decisions.";
}

function singleDirectionSentence(value: string) {
  const cleaned = value.replace(/\s+/g, " ").trim();
  if (!cleaned) return "Focus the team on one clear decision path.";
  const firstSentence = cleaned.split(/(?<=[.?!])\s+/)[0]?.trim();
  return firstSentence && firstSentence.length > 0 ? firstSentence : cleaned;
}

function singleLine(value: string) {
  const cleaned = value.replace(/\s+/g, " ").trim();
  return cleaned.length > 160 ? `${cleaned.slice(0, 157).trimEnd()}...` : cleaned;
}

export default function ClientStrategyView() {
  useHashAnchorScroll();

  const {
    activeCompany,
    hasCompany,
    topActions,
    mapStatus,
    committedAt,
    mapPrimaryOwner,
    rerunAnalysis,
    rerunningAnalysis,
  } = useClientViewData({ actionLimit: 4 });
  const { item: cascade } = useStrategyCascade(activeCompany?.id);

  const directionRaw = cascade?.how_to_win?.trim() || cascade?.winning_aspiration?.trim() || fallbackDirection(activeCompany?.name);
  const direction = singleLine(singleDirectionSentence(directionRaw));
  const toWin = useMemo(() => {
    const top = topActions[0];
    if (!top) {
      return "Execute one owned priority end-to-end before expanding scope.";
    }
    return singleLine(`Prove value by executing "${top.title}" with clear ownership.`);
  }, [topActions]);

  const notDoing = useMemo(() => {
    if (topActions.length >= 3) {
      return "No new Create work until Fix and Improve priorities are stable.";
    }
    return "No parallel priorities until ownership and execution rhythm are clear.";
  }, [topActions.length]);

  return (
    <PageShell bare tone="neutral">
      <div className="client-view-stage max-w-content mx-auto px-4 pb-14 pt-6 sm:px-6 md:px-9">
        <header className="mb-5">
          <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-t-muted">Decision</p>
          <h1 className="mt-1 max-w-[640px] font-sans text-[30px] font-medium text-t-primary">What are we choosing?</h1>
          <p className="mt-2 max-w-[640px] font-sans text-[15px] leading-[1.7] text-t-secondary">
            Direction, trade-offs, and what we are not doing.
          </p>
        </header>

        <div className="space-y-4">
          <ClientModeNav
            activeMode="decision"
            mapStatus={mapStatus}
            committedAt={committedAt}
            primaryOwner={mapPrimaryOwner}
            onRerunAnalysis={rerunAnalysis}
            rerunning={rerunningAnalysis}
          />

          {!hasCompany ? (
            <div className="rounded-xl border border-[#d8e1de] bg-white p-5">
              <p className="font-sans text-[14px] text-t-secondary">Select a company to view strategy.</p>
            </div>
          ) : (
            <section className="space-y-5 rounded-3xl bg-white px-6 py-6">
              <div className="space-y-4">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-t-muted">Direction</p>
                  <p className="mt-1 max-w-[820px] font-sans text-[36px] font-semibold leading-[1.15] text-t-primary">{direction}</p>
                </div>
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-t-muted">To Win</p>
                  <p className="mt-1 max-w-[820px] font-sans text-[22px] leading-[1.3] text-t-primary">{toWin}</p>
                </div>
                <div className="rounded-lg bg-[#fff8f3] px-3 py-2">
                  <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-t-muted">Not Doing</p>
                  <p className="mt-1 max-w-[820px] font-sans text-[18px] leading-[1.35] text-t-primary">{notDoing}</p>
                </div>
              </div>
            </section>
          )}
        </div>
      </div>
    </PageShell>
  );
}
