// Routes body (comp port 2a — P:409-419, fr tokens). Reads (cited in the port-2a report):
//   routes         routes (level=route, relevance_state=active) — useRoutes
//   Now/Reachable/ the LIVE score the home computes — useLiveMojoScore (computeMojoScore over claims,
//   Ceiling        routes, needs; extracted from ClientRefinePreviewView) then computeReachableScore /
//                  computeUnlockableScore exactly as the home compass (HomepageHierarchyFR.tsx:80-81);
//                  Ceiling = the compass's third value (unlockable), so the strip has three cells
//   Evidence unlock the live score's projected_raisers[0].action_description / estimated_points,
//                  rendered as the home renders the raiser lift ("+N PTS", HomepageHierarchyFR.tsx:88-89, 106)
//   accordion      routes.title / short_description; expanded: what_would_have_to_be_true[] (the
//                  "Test for this route"). assumptions_json is not a routes column (useRoutes selects *
//                  and maps it to null), and no field backs "If it's working" / "If not" — omitted.
//   controls       Regenerate conditions / Draft tests are inline chunked loops inside
//                  ClientRefinePreviewRoutesView (:505-900) and cannot be reused without restructuring
//                  that view; here they are operator-gated links to that surface, where they run.
import { useState } from "react";
import { Link } from "react-router-dom";
import { useCompany } from "@/hooks/useCompany";
import { useOdiNeeds } from "@/hooks/useOdiNeeds";
import { useRoutes } from "@/hooks/useRoutes";
import { useCompanyClaims } from "@/lib/claims/useCompanyClaims";
import { computeReachableScore, computeUnlockableScore } from "@/lib/mojoScore/projections";
import { CLIENT_REFINE_PREVIEW_ROUTES_ROUTE } from "@/lib/clientRefinePreview";
import { useOperatorControls } from "@/views/client/firstReadPreview/operatorControls";
import { OPERATOR_MARK } from "@/views/client/firstReadPreview/operatorStrings";
import { WorkspaceAbsent } from "./absent";
import { WorkspaceWorkingPage } from "./WorkspaceWorkingPage";
import { useLiveMojoScore } from "./useLiveMojoScore";
import { WORKSPACE_STRINGS } from "./workspaceNav";

const pad = (n: number) => String(n).padStart(2, "0");

export default function RoutesPage() {
  const { activeCompany } = useCompany();
  const { items, loading } = useRoutes(activeCompany?.id);
  const { needs } = useOdiNeeds(activeCompany?.id);
  const { claims: claimsMap } = useCompanyClaims(activeCompany?.id);
  const score = useLiveMojoScore(activeCompany?.id, claimsMap, items, needs);
  const operator = useOperatorControls();
  const [open, setOpen] = useState<number>(0);
  const routes = items.filter((r) => (r.level ?? "route") === "route");
  const raiser = score?.projected_raisers[0] ?? null;
  const strip = score
    ? [
        { key: "now", label: WORKSPACE_STRINGS.scoreNow, value: Math.round(score.total_score), tone: "lime" },
        { key: "reachable", label: WORKSPACE_STRINGS.scoreReachable, value: computeReachableScore(score), tone: "electric-sol" },
        { key: "ceiling", label: WORKSPACE_STRINGS.scoreCeiling, value: computeUnlockableScore(computeReachableScore(score), score), tone: "periwinkle" },
      ]
    : [];

  return (
    <WorkspaceWorkingPage eyebrow={WORKSPACE_STRINGS.routePlan} title={WORKSPACE_STRINGS.titleRoutes} count={loading ? null : routes.length} unit={WORKSPACE_STRINGS.unitRoutes}>
      {loading ? null : (
        <>
          {strip.length > 0 ? (
            <div className="fr-ws-scorestrip" data-testid="routes-scorestrip">
              {strip.map((c) => (
                <div key={c.key} className="fr-ws-scorecell" data-fr-tone={c.tone}>
                  <b className="fr-ws-scorecell-value">{c.value}</b>
                  <span className="fr-ws-scorecell-label fr-mono">{c.label}</span>
                </div>
              ))}
            </div>
          ) : null}

          {raiser?.action_description ? (
            <div className="fr-ws-band fr-ws-unlock" data-fr-tone="electric" data-testid="routes-unlock">
              <div>
                <p className="fr-ws-band-eyebrow fr-mono">{WORKSPACE_STRINGS.evidenceUnlock}</p>
                <p className="fr-ws-unlock-text">{raiser.action_description}</p>
              </div>
              {raiser.estimated_points > 0 ? <p className="fr-ws-unlock-pts fr-mono">+{raiser.estimated_points} {WORKSPACE_STRINGS.pts}</p> : null}
            </div>
          ) : null}

          <div className="fr-ws-workbench">
            <p className="fr-ws-sectionlabel fr-mono">
              <span className="fr-ws-sectionlabel-num">{pad(1)}</span>
              <span className="fr-ws-sectionlabel-slash">/</span>
              <span>{WORKSPACE_STRINGS.routeWorkbench}</span>
            </p>
            {operator ? (
              <div className="fr-ws-controls" {...{ [OPERATOR_MARK.attr]: "route-controls" }}>
                <Link to={CLIENT_REFINE_PREVIEW_ROUTES_ROUTE} className="fr-ws-control fr-mono">{WORKSPACE_STRINGS.regenerateConditions}</Link>
                <Link to={CLIENT_REFINE_PREVIEW_ROUTES_ROUTE} className="fr-ws-control fr-mono">{WORKSPACE_STRINGS.draftTests}</Link>
              </div>
            ) : null}
          </div>

          {routes.length === 0 ? (
            <WorkspaceAbsent what="routes" />
          ) : (
            <section className="fr-ws-accordion" data-testid="routes-accordion">
              {routes.map((r, i) => {
                const expanded = open === i;
                const conditions = Array.isArray(r.what_would_have_to_be_true) ? r.what_would_have_to_be_true.filter((c) => c && typeof c.condition === "string" && c.condition.trim()) : [];
                return (
                  <article key={r.id} className="fr-ws-route" data-expanded={expanded ? "true" : undefined} data-testid="routes-item">
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
                    {expanded && conditions.length > 0 ? (
                      <div className="fr-ws-route-body" data-testid="routes-item-body">
                        <p className="fr-ws-band-eyebrow fr-mono">{WORKSPACE_STRINGS.testForThisRoute}</p>
                        <ul className="fr-ws-route-conditions">
                          {conditions.map((c, ci) => (
                            <li key={ci} data-fr-satisfied={c.satisfied_flag ? "true" : "false"}>{c.condition}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </section>
          )}
        </>
      )}
    </WorkspaceWorkingPage>
  );
}
