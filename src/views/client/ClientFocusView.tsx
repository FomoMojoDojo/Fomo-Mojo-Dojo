import { useState } from "react";
import { Link } from "react-router-dom";
import ClientModeNav from "@/components/client-view/ClientModeNav";
import ClientNextMoveCenter from "@/components/client-view/ClientNextMoveCenter";
import ClientOwnerAssignDialog from "@/components/client-view/ClientOwnerAssignDialog";
import PageShell from "@/components/layout/PageShell";
import { useClientViewData } from "@/hooks/useClientViewData";
import { useHashAnchorScroll } from "@/hooks/useHashAnchorScroll";
import type { ClientActionStatus, ClientConfidenceLevel } from "@/lib/clientViewModel";

export default function ClientFocusView() {
  useHashAnchorScroll();
  const [ownerDialogActionId, setOwnerDialogActionId] = useState<string | null>(null);

  const {
    hasCompany,
    topActions,
    nextMove,
    whatThisMeans,
    evidence,
    mapStatus,
    committedAt,
    mapPrimaryOwner,
    getActionConfidenceLevel,
    setActionConfidence,
    ownerOptions,
    assignActionOwner,
    setActionStatus,
    addOwnerOption,
    commitMap,
    rerunAnalysis,
    rerunningAnalysis,
    opportunitiesLoading,
    opportunitiesError,
  } = useClientViewData({ actionLimit: 3 });
  const ownerDialogAction = topActions.find((action) => action.id === ownerDialogActionId) ?? null;

  return (
    <PageShell bare tone="neutral">
      <div className="client-view-stage max-w-content mx-auto px-4 pb-14 pt-6 sm:px-6 md:px-9">
        <header className="mb-5">
          <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-t-muted">Execution</p>
          <h1 className="mt-1 max-w-[640px] font-sans text-[30px] font-medium text-t-primary">What do we do now?</h1>
          <p className="mt-2 max-w-[640px] font-sans text-[15px] leading-[1.7] text-t-secondary">
            Priority order, ownership, and immediate next action.
          </p>
        </header>

        <div className="space-y-4">
          <ClientModeNav
            activeMode="execution"
            mapStatus={mapStatus}
            committedAt={committedAt}
            primaryOwner={mapPrimaryOwner}
            onRerunAnalysis={rerunAnalysis}
            rerunning={rerunningAnalysis}
          />

          {!hasCompany ? (
            <div className="rounded-xl border border-[#d8e1de] bg-white p-5">
              <p className="font-sans text-[14px] text-t-secondary">Select a company to view Focus.</p>
            </div>
          ) : (
            <>
            {opportunitiesLoading ? (
              <div className="rounded-xl border border-[#d8e1de] bg-white p-4">
                <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-t-muted">Loading focus…</p>
              </div>
            ) : opportunitiesError ? (
              <div className="rounded-xl border border-rust/25 bg-white p-4">
                <p className="font-sans text-[13px] text-rust">Failed to load opportunities: {opportunitiesError}</p>
              </div>
            ) : (
              <section id="client-next-move" className="rounded-xl border border-[#d8e1de] bg-white p-4 scroll-mt-16">
                <div className="mb-3">
                  <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-t-muted">Action view</p>
                </div>
                {topActions.length === 0 ? (
                  <p className="font-sans text-[13px] text-t-secondary">No priorities available yet.</p>
                ) : (
                  <div className="space-y-3">
                    <div className="rounded-2xl bg-[#233c4b] p-5 text-white shadow-sm">
                      <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#b7d2d8]">Priority 1</p>
                      <p className="mt-2 max-w-[680px] font-sans text-[28px] font-semibold leading-[1.2]">
                        {topActions[0].title}
                      </p>
                      <p className="mt-2 font-sans text-[14px] leading-[1.45] text-[#d5e7ec]">{topActions[0].whyItMatters}</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setOwnerDialogActionId(topActions[0].id)}
                          className={`rounded-full border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.08em] ${
                            topActions[0].primaryOwner
                              ? "border-white/35 bg-white/15 text-white"
                              : "border-rust/45 bg-rust/20 text-[#ffe4d4]"
                          }`}
                        >
                          {topActions[0].primaryOwner ? `Owner: ${topActions[0].primaryOwner}` : "Assign owner"}
                        </button>
                        <select
                          value={topActions[0].status}
                          onChange={(event) => setActionStatus(topActions[0].id, event.target.value as ClientActionStatus)}
                          className="h-7 rounded-full border border-white/30 bg-white/10 px-2.5 font-mono text-[10px] uppercase tracking-[0.08em] text-white"
                        >
                          <option value="planned">Planned</option>
                          <option value="in_progress">In Progress</option>
                          <option value="done">Done</option>
                        </select>
                        <select
                          value={getActionConfidenceLevel(topActions[0].id)}
                          onChange={(event) => setActionConfidence(topActions[0].id, event.target.value as ClientConfidenceLevel)}
                          className="h-7 rounded-full border border-white/30 bg-white/10 px-2.5 font-mono text-[10px] uppercase tracking-[0.08em] text-white"
                        >
                          <option value="Low">Low confidence</option>
                          <option value="Medium">Medium confidence</option>
                          <option value="High">High confidence</option>
                        </select>
                      </div>
                      <div className="mt-3 grid grid-cols-1 gap-2 xl:grid-cols-2">
                        <div>
                          <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#b7d2d8]">What must be true</p>
                          <ul className="mt-1 space-y-1">
                            {topActions[0].assumptions.slice(0, 3).map((item) => (
                              <li key={`${topActions[0].id}-assume-${item}`} className="font-sans text-[12px] leading-[1.4] text-[#d5e7ec]">
                                {item}
                              </li>
                            ))}
                          </ul>
                        </div>
                        <div>
                          <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#b7d2d8]">How we will know this worked</p>
                          <ul className="mt-1 space-y-1">
                            {topActions[0].successCriteria.slice(0, 3).map((item) => (
                              <li key={`${topActions[0].id}-success-${item}`} className="font-sans text-[12px] leading-[1.4] text-[#d5e7ec]">
                                {item}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                      <div className="mt-4">
                        <ClientNextMoveCenter
                          nextMove={nextMove}
                          supportText={whatThisMeans[2]}
                          mapStatus={mapStatus}
                          ownerOptions={ownerOptions}
                          onCommit={commitMap}
                        />
                      </div>
                    </div>

                    {topActions.length > 1 ? (
                      <div className="space-y-2 pt-2">
                        {topActions.slice(1, 3).map((action, index) => (
                          <article
                            key={action.id}
                            className={`rounded-lg border-b border-[#dbe6e1] pb-3 ${
                              action.status === "done"
                                ? "bg-forest/10"
                                : action.status === "in_progress"
                                  ? "bg-forest/5"
                                  : "bg-transparent"
                            }`}
                          >
                            <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-t-muted">
                              Priority {index + 2}
                            </p>
                            <p className="mt-1 max-w-[680px] font-sans text-[18px] font-semibold text-t-primary">{action.title}</p>
                            <p className="mt-1 font-sans text-[14px] leading-[1.45] text-t-secondary">{action.whyItMatters}</p>
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                onClick={() => setOwnerDialogActionId(action.id)}
                                className={`rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.08em] ${
                                  action.primaryOwner
                                    ? "border-forest/35 bg-forest/10 text-forest"
                                    : "border-rust/35 bg-rust/10 text-rust"
                                }`}
                              >
                                {action.primaryOwner ? `Owner: ${action.primaryOwner}` : "Assign owner"}
                              </button>
                              <select
                                value={action.status}
                                onChange={(event) => setActionStatus(action.id, event.target.value as ClientActionStatus)}
                                className="h-7 rounded-full border border-[#d8e1de] bg-white px-2.5 font-mono text-[10px] uppercase tracking-[0.08em] text-t-secondary"
                              >
                                <option value="planned">Planned</option>
                                <option value="in_progress">In Progress</option>
                                <option value="done">Done</option>
                              </select>
                              <select
                                value={getActionConfidenceLevel(action.id)}
                                onChange={(event) => setActionConfidence(action.id, event.target.value as ClientConfidenceLevel)}
                                className="h-7 rounded-full border border-[#d8e1de] bg-white px-2.5 font-mono text-[10px] uppercase tracking-[0.08em] text-t-secondary"
                              >
                                <option value="Low">Low confidence</option>
                                <option value="Medium">Medium confidence</option>
                                <option value="High">High confidence</option>
                              </select>
                            </div>
                            <div className="mt-2 flex flex-wrap gap-2">
                              {evidence.sources.map((source) => (
                                <span
                                  key={`${action.id}-evidence-${source.label}`}
                                  className={`rounded-full border px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em] ${
                                    source.present
                                      ? "border-forest/35 bg-forest/10 text-forest"
                                      : "border-rust/35 bg-rust/10 text-rust"
                                  }`}
                                >
                                  {source.label}: {source.present ? "present" : "missing"}
                                </span>
                              ))}
                            </div>
                          </article>
                        ))}
                      </div>
                    ) : null}
                  </div>
                )}
              </section>
            )}

            <div className="flex justify-end">
              <Link
                to="/learning"
                className="rounded-full bg-[#233c4b] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-white transition-opacity hover:opacity-85"
              >
                Open learning
              </Link>
            </div>
            </>
          )}
        </div>
      </div>
      <ClientOwnerAssignDialog
        open={Boolean(ownerDialogAction)}
        onOpenChange={(open) => {
          if (!open) setOwnerDialogActionId(null);
        }}
        actionTitle={ownerDialogAction?.title || "Action"}
        ownerOptions={ownerOptions}
        currentOwner={ownerDialogAction?.primaryOwner || null}
        onAssign={(owner) => {
          if (!ownerDialogAction) return;
          assignActionOwner(ownerDialogAction.id, owner);
        }}
        onAddUser={addOwnerOption}
      />
    </PageShell>
  );
}
