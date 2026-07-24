import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useClientViewData } from "@/hooks/useClientViewData";
import { useStrategyCascade } from "@/hooks/useStrategyCascade";
import { useSourceConfidence } from "@/hooks/useSourceConfidence";
import { usePublicBaseline } from "@/hooks/usePublicBaseline";
import { useDriftScan } from "@/hooks/useDriftScan";
import { WorkshopSidebar, type SidebarTabKey } from "@/components/client/WorkshopSidebar";
import { StrategicDirectionDelta } from "@/components/strategy/StrategicDirectionDelta";
import { SignalRecurrenceControl } from "@/components/strategy/SignalRecurrenceControl";
import { StandingFindings } from "@/components/strategy/StandingFindings";
import { ContestedFindings } from "@/components/strategy/ContestedFindings";
import { ExtractsFeedControl } from "@/components/strategy/ExtractsFeedControl";
import StrategyInspectPanel from "@/views/Strategy/StrategyInspectPanel";
import DriftBadge from "@/components/drift/DriftBadge";
import DriftDetailPanel from "@/components/drift/DriftDetailPanel";
import { baselineOf } from "./workshop/helpers";
import {
  CLIENT_REFINE_PREVIEW_ROUTE,
  CLIENT_REFINE_PREVIEW_WORKSHOP_ROUTE,
  CLIENT_REFINE_PREVIEW_COMPANY_ROUTE,
  CLIENT_REFINE_PREVIEW_MEMBERS_ROUTE,
  CLIENT_REFINE_PREVIEW_EXTRACTS_ROUTE,
} from "@/lib/clientRefinePreview";
import "@/styles/client-refine-preview.css";

// The Extracts page (the first deliberate read-gate): our internal AI-extract read
// of the strategy — Direction Delta, Standing Findings, Drift, Provenance/Inspect —
// pulled off the client-facing Strategy page into an operator-only view. Operator-
// only via the route's AdminModeRoute>InternalViewOnlyRoute double-gate. Route is
// named generally (/extracts) so other surfaces' extracts can join later.
const SECTION_HEADER: React.CSSProperties = {
  fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
  fontSize: 10,
  textTransform: "uppercase",
  letterSpacing: "0.13em",
  color: "#9298B5",
  margin: "0 0 12px",
};

export default function ClientRefinePreviewExtractsView() {
  const navigate = useNavigate();
  const { activeCompany } = useClientViewData({ actionLimit: 0 });
  const companyId = activeCompany?.id;
  const phase = activeCompany?.engagement_phase;

  const { item: cascade } = useStrategyCascade(companyId);
  const cascadeId = cascade?.id ?? null;
  const { signals: sourceSignals } = useSourceConfidence({
    companyId,
    areaScoresJson: activeCompany?.area_scores_json,
    evidenceStatus: activeCompany?.evidence_status,
  });
  const { preferredRun: baselineRun } = usePublicBaseline(companyId);
  const baseline = baselineOf(baselineRun);
  const { checkingSurfaceId, checkSurface } = useDriftScan(companyId);

  const [driftRefreshKey, setDriftRefreshKey] = useState(0);
  const [driftDetail, setDriftDetail] = useState<{ surfaceType: string; surfaceId: string } | null>(null);
  const [inspectOpen, setInspectOpen] = useState(false);

  function goTab(tab: SidebarTabKey) {
    navigate(`${CLIENT_REFINE_PREVIEW_WORKSHOP_ROUTE}?tab=${tab}`);
  }

  function runDriftCheck() {
    if (!cascadeId) return;
    checkSurface("cascade", cascadeId, () => setDriftRefreshKey((k) => k + 1), () => {});
  }

  return (
    <div className="crpv-page" style={{ display: "flex", flexDirection: "column", minHeight: "100dvh" }}>
      <div className="crpv-ws-body" style={{ flex: 1 }}>
        <WorkshopSidebar
          activeTab="__extracts__"
          onTabClick={goTab}
          onHome={() => navigate(CLIENT_REFINE_PREVIEW_ROUTE)}
          onCompany={() => navigate(CLIENT_REFINE_PREVIEW_COMPANY_ROUTE)}
          onMembers={() => navigate(CLIENT_REFINE_PREVIEW_MEMBERS_ROUTE)}
          onExtracts={() => navigate(CLIENT_REFINE_PREVIEW_EXTRACTS_ROUTE)}
        />

        <div className="crpv-ws-content-col" style={{ overflowY: "auto" }}>
          <div style={{ padding: "32px 36px" }}>
            <h1 style={{ margin: "0 0 6px", fontSize: 22, color: "#1e3340" }}>Extracts</h1>
            <p style={{ margin: "0 0 28px", fontSize: 14, color: "#6e847f" }}>
              Our internal read of this strategy — not shown to clients.
            </p>

            {!companyId ? (
              <p style={{ fontSize: 13, color: "#8a9a95" }}>Select a company to view its extracts.</p>
            ) : (
              <>
                {/* OC-3: the contested-findings judgment queue. Self-quiets when there
                    are no contests (open or resolved), so it only appears when there's
                    something to judge or a resolution trail to show.
                    OC-2d: the corrections-feed control mounts above it (the same signed
                    button, no fork) when a First Read session with verdicts exists — this
                    is what BIRTHS the contests the queue then renders. */}
                <section style={{ marginBottom: 36 }}>
                  <ExtractsFeedControl companyId={companyId} />
                  <ContestedFindings companyId={companyId} />
                </section>

                <section style={{ marginBottom: 36 }}>
                  <p style={SECTION_HEADER}>Direction Delta</p>
                  <StrategicDirectionDelta companyId={companyId} />
                </section>

                <section style={{ marginBottom: 36 }}>
                  <p style={SECTION_HEADER}>Signal Recurrence</p>
                  <p style={{ margin: "0 0 12px", fontSize: 12, color: "#6e847f" }}>
                    Which public signals independently corroborate each other — and which findings they back.
                  </p>
                  <SignalRecurrenceControl companyId={companyId} />
                </section>

                <section style={{ marginBottom: 36 }}>
                  <p style={SECTION_HEADER}>Standing Findings</p>
                  <StandingFindings companyId={companyId} />
                </section>

                <section style={{ marginBottom: 36 }}>
                  <p style={SECTION_HEADER}>Provenance &amp; Inspect</p>
                  <button
                    type="button"
                    className="crpv-ws-need-inspect-btn"
                    onClick={() => setInspectOpen(true)}
                    disabled={!cascade}
                  >
                    Inspect strategy →
                  </button>
                </section>

                <section style={{ marginBottom: 36 }}>
                  <p style={SECTION_HEADER}>Drift</p>
                  {cascadeId && (
                    <div style={{ marginBottom: 12 }}>
                      <DriftBadge
                        surfaceType="cascade"
                        surfaceId={cascadeId}
                        phase={phase}
                        refreshKey={driftRefreshKey}
                        onClick={(a) => setDriftDetail({ surfaceType: "cascade", surfaceId: a.surface_id })}
                      />
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={runDriftCheck}
                    disabled={!cascadeId || checkingSurfaceId === cascadeId}
                    style={{ fontFamily: '"IBM Plex Mono", ui-monospace, monospace', fontSize: 10, letterSpacing: "0.06em", color: checkingSurfaceId === cascadeId ? "rgba(17,17,17,0.25)" : "rgba(17,17,17,0.45)", background: "none", border: "1px solid rgba(17,17,17,0.15)", cursor: !cascadeId || checkingSurfaceId === cascadeId ? "default" : "pointer", padding: "4px 10px", borderRadius: 2 }}
                  >
                    {checkingSurfaceId === cascadeId ? "Checking…" : "Check for drift"}
                  </button>
                </section>
              </>
            )}
          </div>
        </div>
      </div>

      <StrategyInspectPanel
        open={inspectOpen}
        onClose={() => setInspectOpen(false)}
        cascade={cascade}
        frameworksUsed={[]}
        signals={sourceSignals}
        hasBaseline={baseline !== null}
      />

      {driftDetail && (
        <DriftDetailPanel
          open
          onClose={() => setDriftDetail(null)}
          surfaceType={driftDetail.surfaceType}
          surfaceId={driftDetail.surfaceId}
          refreshKey={driftRefreshKey}
          onRefresh={() => setDriftRefreshKey((k) => k + 1)}
        />
      )}
    </div>
  );
}
