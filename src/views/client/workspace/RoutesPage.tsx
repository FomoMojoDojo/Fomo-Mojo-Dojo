// Routes body (comp port 2a — P:409-419, fr tokens). Reads (cited in the port-2a report):
//   routes         routes (relevance_state=active) — useRoutes(companyId, routesRefreshKey); the accordion
//                  lists level=route, and each route's legs (parent_id) ride under it for the Tier 1 controls
//   Now/Reachable/ the LIVE score the home computes — useLiveMojoScore (computeMojoScore over claims,
//   Ceiling        routes, needs; extracted from ClientRefinePreviewView) then computeReachableScore /
//                  computeUnlockableScore exactly as the home compass (HomepageHierarchyFR.tsx:80-81);
//                  Ceiling = the compass's third value (unlockable), so the strip has three cells
//   Evidence unlock REMOVED (operator ruling 3, 2026-09-12): the "+N PTS" banner paired a contributor's
//                  headroom-to-100 with a canned sentence from a different producer — a false claim
//                  (display-honesty defect). Nothing replaces it yet. The score band above is unchanged.
//   accordion      routes.title / short_description; expanded: what_would_have_to_be_true[] (the
//                  "Test for this route"). assumptions_json is not a routes column (useRoutes selects *
//                  and maps it to null), and no field backs "If it's working" / "If not" — omitted.
//   chosen path    companies.selected_route_id (useCompany) — seeded into useRouteDecision, re-read after a write
//   controls       Regenerate conditions / Draft tests are inline chunked loops inside
//                  ClientRefinePreviewRoutesView (:505-900) and cannot be reused without restructuring
//                  that view; here they are operator-gated links to that surface, where they run.
//
// Tier 1 controls (2026-09-12) — per expanded route, every one operator-gated (OperatorControlsContext)
// AND gated exactly as the Workshop Routes tab, through the SAME hooks / components the tab uses:
//   Choose this path → / Deselect  useRouteDecision (moved from RoutesOrgPanel) — isAdmin + non-frozen (ruling 2)
//   Check for drift (route, leg)   useDriftScan.checkSurfaceGated — governance.drift.scan (ruling 1, both surfaces)
//   DriftBadge → DriftDetailPanel  Accept as aligned — governance.drift.review; Propose route changes —
//                                  useRouteProposalHandlers.handleGenerateRouteProposal — structure.route.generate
//   Generate / Regenerate test     LegTestPanel (routes/components, as-is) — isAdmin + non-frozen; per-leg body (ruling 4)
import { useCallback, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useCapability } from "@/hooks/useCapability";
import { useCompany } from "@/hooks/useCompany";
import { useDriftScan } from "@/hooks/useDriftScan";
import { useOdiNeeds } from "@/hooks/useOdiNeeds";
import { useRouteDecision } from "@/hooks/useRouteDecision";
import { useRouteProposalHandlers } from "@/hooks/useRouteProposalHandlers";
import { useRoutes, type RouteRow } from "@/hooks/useRoutes";
import { useCompanyClaims } from "@/lib/claims/useCompanyClaims";
import { isFrozenCompany } from "@/lib/frozenCompanies";
import { computeReachableScore, computeUnlockableScore } from "@/lib/mojoScore/projections";
import { CLIENT_REFINE_PREVIEW_ROUTES_ROUTE } from "@/lib/clientRefinePreview";
import DriftBadge from "@/components/drift/DriftBadge";
import DriftDetailPanel from "@/components/drift/DriftDetailPanel";
import { LegTestPanel } from "@/views/client/routes/components";
import { useOperatorControls } from "@/views/client/firstReadPreview/operatorControls";
import { OPERATOR_MARK } from "@/views/client/firstReadPreview/operatorStrings";
import { WorkspaceAbsent } from "./absent";
import { WorkspaceWorkingPage } from "./WorkspaceWorkingPage";
import { useLiveMojoScore } from "./useLiveMojoScore";
import { WORKSPACE_STRINGS } from "./workspaceNav";

const pad = (n: number) => String(n).padStart(2, "0");
const mark = (v: string) => ({ [OPERATOR_MARK.attr]: v });

type WrapCond = { condition?: string; satisfied_flag?: boolean; leg_class?: string; test_declined?: boolean; test_declined_reason?: string; test_declined_retry_reason?: string };
const condsOf = (r: RouteRow): WrapCond[] => (Array.isArray(r.what_would_have_to_be_true) ? (r.what_would_have_to_be_true as WrapCond[]) : []);

export default function RoutesPage() {
  const { activeCompany, refetch: refetchCompany } = useCompany();
  const companyId = activeCompany?.id;
  const [routesRefreshKey, setRoutesRefreshKey] = useState(0);
  const bumpRoutes = useCallback(() => setRoutesRefreshKey((k) => k + 1), []);
  const { items, loading } = useRoutes(companyId, routesRefreshKey);
  const { needs } = useOdiNeeds(companyId);
  const { claims: claimsMap } = useCompanyClaims(companyId);
  const score = useLiveMojoScore(companyId, claimsMap, items, needs);
  const operator = useOperatorControls();
  const gated = Boolean(operator);
  const { isAdmin } = useAuth();
  const frozen = isFrozenCompany(companyId);
  // The tab's gates, same keys / same rule.
  const showChoose = gated && isAdmin && !frozen;
  const canScan = useCapability("governance.drift.scan", companyId);
  const decision = useRouteDecision(activeCompany);
  const { handleGenerateRouteProposal } = useRouteProposalHandlers(companyId);
  const [driftBadgeRefreshKey, setDriftBadgeRefreshKey] = useState(0);
  const onDriftAssessed = useCallback(() => setDriftBadgeRefreshKey((k) => k + 1), []);
  const { checkingSurfaceId, checkSurfaceGated } = useDriftScan(companyId, { canScan, onAssessed: onDriftAssessed });
  const [driftPanelId, setDriftPanelId] = useState<string | null>(null);
  const [legTestRefreshKey, setLegTestRefreshKey] = useState(0);
  const onLegTestGenerated = useCallback(() => { setLegTestRefreshKey((k) => k + 1); bumpRoutes(); }, [bumpRoutes]);
  const [choosing, setChoosing] = useState(false);
  const [open, setOpen] = useState<number>(0);

  const routes = items.filter((r) => (r.level ?? "route") === "route");
  const legsByParent = useMemo(() => {
    const m = new Map<string, RouteRow[]>();
    for (const leg of items) {
      if (leg.level !== "leg" && leg.level !== "action") continue;
      if (!leg.parent_id) continue;
      m.set(leg.parent_id, [...(m.get(leg.parent_id) ?? []), leg]);
    }
    return m;
  }, [items]);
  // Choose / clear: the moved hook writes; the page then re-reads the company row, and the marker below
  // follows THAT read (companies.selected_route_id) — never the click (the Job Map's choose discipline).
  const chosenId = activeCompany?.selected_route_id ?? null;
  const choose = async (route: RouteRow) => {
    setChoosing(true);
    try { await decision.chooseRoute(route); await refetchCompany(); } finally { setChoosing(false); }
  };
  const clear = async () => {
    setChoosing(true);
    try { await decision.clearRoute(); await refetchCompany(); } finally { setChoosing(false); }
  };

  const strip = score
    ? [
        { key: "now", label: WORKSPACE_STRINGS.scoreNow, value: Math.round(score.total_score), tone: "lime" },
        { key: "reachable", label: WORKSPACE_STRINGS.scoreReachable, value: computeReachableScore(score), tone: "electric-sol" },
        { key: "ceiling", label: WORKSPACE_STRINGS.scoreCeiling, value: computeUnlockableScore(computeReachableScore(score), score), tone: "periwinkle" },
      ]
    : [];

  const driftControls = (surfaceId: string, kind: "route" | "leg") => (
    <span className="fr-ws-route-drift">
      <button
        type="button"
        className="fr-ws-control fr-mono"
        disabled={checkingSurfaceId === surfaceId || !canScan}
        onClick={(e) => { e.stopPropagation(); checkSurfaceGated("route", surfaceId); }}
        {...mark(`check-drift-${kind}`)}
        data-testid={`routes-check-drift-${kind}`}
        data-fr-surface-id={surfaceId}
      >
        {checkingSurfaceId === surfaceId ? WORKSPACE_STRINGS.working : WORKSPACE_STRINGS.checkForDrift}
      </button>
      <span {...mark(`drift-badge-${kind}`)} data-testid={`routes-drift-badge-${kind}`} data-fr-surface-id={surfaceId}>
        <DriftBadge surfaceType="route" surfaceId={surfaceId} phase={activeCompany?.engagement_phase} refreshKey={driftBadgeRefreshKey} onClick={(a) => setDriftPanelId(a.surface_id)} />
      </span>
    </span>
  );

  return (
    <WorkspaceWorkingPage eyebrow={WORKSPACE_STRINGS.routePlan} title={WORKSPACE_STRINGS.titleRoutes} count={loading ? null : routes.length} unit={WORKSPACE_STRINGS.unitRoutes}>
      {loading ? null : (
        <>
          {strip.length > 0 ? (
            <div className="fr-ws-scorestrip" data-testid="routes-scorestrip" data-fr-region="score-strip">
              {strip.map((c) => (
                <div key={c.key} className="fr-ws-scorecell" data-fr-tone={c.tone}>
                  <b className="fr-ws-scorecell-value">{c.value}</b>
                  <span className="fr-ws-scorecell-label fr-mono">{c.label}</span>
                </div>
              ))}
            </div>
          ) : null}

          <div className="fr-ws-workbench" data-fr-region="workbench">
            <p className="fr-ws-sectionlabel fr-mono">
              <span className="fr-ws-sectionlabel-num">{pad(1)}</span>
              <span className="fr-ws-sectionlabel-slash">/</span>
              <span>{WORKSPACE_STRINGS.routeWorkbench}</span>
            </p>
            {operator ? (
              <div className="fr-ws-controls" {...mark("route-controls")}>
                <Link to={CLIENT_REFINE_PREVIEW_ROUTES_ROUTE} className="fr-ws-control fr-mono">{WORKSPACE_STRINGS.regenerateConditions}</Link>
                <Link to={CLIENT_REFINE_PREVIEW_ROUTES_ROUTE} className="fr-ws-control fr-mono">{WORKSPACE_STRINGS.draftTests}</Link>
              </div>
            ) : null}
          </div>

          {routes.length === 0 ? (
            <WorkspaceAbsent what="routes" />
          ) : (
            <section className="fr-ws-accordion" data-testid="routes-accordion" data-fr-region="accordion">
              {routes.map((r, i) => {
                const expanded = open === i;
                const conditions = condsOf(r).filter((c) => c && typeof c.condition === "string" && c.condition.trim());
                const legs = legsByParent.get(r.id) ?? [];
                const isChosen = !!chosenId && chosenId === r.id;
                return (
                  <article key={r.id} className="fr-ws-route" data-expanded={expanded ? "true" : undefined} data-testid="routes-item" data-fr-route-id={r.id} data-fr-chosen={isChosen ? "true" : undefined}>
                    <button type="button" className="fr-ws-route-head" aria-expanded={expanded} onClick={() => setOpen(expanded ? -1 : i)}>
                      <span className="fr-ws-route-num fr-mono">{pad(i + 1)}</span>
                      <span className="fr-ws-route-text">
                        <span className="fr-ws-route-title">{r.title}</span>
                        {r.short_description ? <span className="fr-ws-route-desc">{r.short_description}</span> : null}
                      </span>
                      <svg className="fr-ws-route-glyph" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                        {expanded ? <path d="M3 6 L8 11 L13 6" fill="none" stroke="currentColor" strokeWidth="1.25" /> : <path d="M8 3 V13 M3 8 H13" fill="none" stroke="currentColor" strokeWidth="1.25" />}
                      </svg>
                    </button>
                    {expanded ? (
                      <div className="fr-ws-route-body" data-testid="routes-item-body">
                        {gated ? (
                          <div className="fr-ws-route-actions" data-testid="routes-actions" data-fr-region="route-actions">
                            {showChoose ? (
                              <span className="fr-ws-route-choose" {...mark("choose-path")} data-testid="routes-choose">
                                {chosenId ? (
                                  <span className={`fr-tag fr-mono${isChosen ? " fr-ws-route-chosen" : ""}`} data-testid="routes-chosen-marker">
                                    {isChosen ? WORKSPACE_STRINGS.chosenPath : WORKSPACE_STRINGS.workingHypothesis}
                                  </span>
                                ) : null}
                                <button type="button" className="fr-ws-control fr-mono" disabled={choosing} onClick={() => { if (isChosen) void clear(); else void choose(r); }} data-testid="routes-choose-btn">
                                  {choosing ? WORKSPACE_STRINGS.working : isChosen ? WORKSPACE_STRINGS.deselect : WORKSPACE_STRINGS.chooseThisPath}
                                </button>
                              </span>
                            ) : null}
                            {driftControls(r.id, "route")}
                          </div>
                        ) : null}
                        {conditions.length > 0 ? (
                          <>
                            <p className="fr-ws-band-eyebrow fr-mono">{WORKSPACE_STRINGS.testForThisRoute}</p>
                            <ul className="fr-ws-route-conditions">
                              {conditions.map((c, ci) => (
                                <li key={ci} data-fr-satisfied={c.satisfied_flag ? "true" : "false"}>{c.condition}</li>
                              ))}
                            </ul>
                          </>
                        ) : null}
                        {gated && legs.length > 0 ? (
                          <div className="fr-ws-legs" {...mark("legs")} data-testid="routes-legs">
                            <p className="fr-ws-band-eyebrow fr-mono">{legs.length} {legs.length === 1 ? WORKSPACE_STRINGS.leg : WORKSPACE_STRINGS.legs}</p>
                            {legs.map((leg, li) => {
                              const head = condsOf(leg)[0];
                              const isTestLeg = leg.provenance_type === "internal_hypothesis" && head?.leg_class === "test";
                              const declinedReason = head?.test_declined ? String(head?.test_declined_reason ?? "") : null;
                              const declinedRetryReason = head?.test_declined && head?.test_declined_retry_reason ? String(head.test_declined_retry_reason) : null;
                              return (
                                <div key={leg.id} className="fr-ws-leg" data-testid="routes-leg" data-fr-leg-id={leg.id} data-fr-test-leg={isTestLeg ? "true" : undefined} data-fr-declined={declinedReason !== null ? "true" : undefined}>
                                  <div className="fr-ws-leg-head">
                                    <span className="fr-ws-route-num fr-mono">{pad(li + 1)}</span>
                                    <span className="fr-ws-route-text">
                                      <span className="fr-ws-route-title">{(leg.title || "").replace(/\s*[—–]+\s*$/, "").trimEnd()}</span>
                                      {leg.short_description ? <span className="fr-ws-route-desc">{leg.short_description}</span> : null}
                                    </span>
                                    {driftControls(leg.id, "leg")}
                                  </div>
                                  {isTestLeg ? (
                                    <div className="fr-ws-legtest" {...mark("leg-test")} data-testid="routes-leg-test">
                                      <LegTestPanel legId={leg.id} companyId={leg.company_id} refreshKey={legTestRefreshKey} onGenerated={onLegTestGenerated} declinedReason={declinedReason} declinedRetryReason={declinedRetryReason} />
                                    </div>
                                  ) : null}
                                </div>
                              );
                            })}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </section>
          )}
        </>
      )}
      {gated && driftPanelId ? (
        <DriftDetailPanel
          open
          onClose={() => setDriftPanelId(null)}
          surfaceType="route"
          surfaceId={driftPanelId}
          refreshKey={driftBadgeRefreshKey}
          onRefresh={onDriftAssessed}
          onProposeChanges={() => handleGenerateRouteProposal(driftPanelId)}
          proposeChangesLabel={WORKSPACE_STRINGS.proposeRouteChanges}
        />
      ) : null}
    </WorkspaceWorkingPage>
  );
}
