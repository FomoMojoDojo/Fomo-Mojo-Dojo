import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCompany } from "@/hooks/useCompany";
import { useClientViewData } from "@/hooks/useClientViewData";
import { CLIENT_REFINE_PREVIEW_ROUTE } from "@/lib/clientRefinePreview";
import "@/styles/client-refine-preview.css";

type RouteCategory = "Fix" | "Improve" | "Create";

const ROUTE_ORDER: RouteCategory[] = ["Fix", "Improve", "Create"];

const ROUTE_FALLBACK_HEADLINE: Record<RouteCategory, string> = {
  Fix: "Resolve the highest-friction blocker first.",
  Improve: "Improve the current route where execution is unstable.",
  Create: "Create a new path only after core blockers are controlled.",
};

function toSentence(value: string | null | undefined) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function shorten(value: string, max = 72) {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1).trimEnd()}…`;
}

function stageLabel(value: string) {
  if (value === "outside") return "outside signals";
  if (value === "diagnosis" || value === "diagnose") return "diagnose";
  if (value === "focus") return "focus";
  if (value === "execution" || value === "flow") return "flow";
  return "diagnose";
}

function statusLabel(value: string) {
  if (value === "in_progress") return "In progress";
  if (value === "planned") return "Planned";
  if (value === "parked") return "Parked";
  if (value === "done") return "Done";
  return "Planned";
}

function scoreLabel(value: number) {
  const score = Number(value);
  if (!Number.isFinite(score) || score <= 0) return "n/a";
  return `${Math.round(score)}`;
}

export default function ClientRefinePreviewRoutesView() {
  const navigate = useNavigate();

  const { companies, setActiveCompanyId, loading: companiesLoading } = useCompany();
  const { activeCompany, hasCompany, allActions, topActions, phase, confidence, nextMove } = useClientViewData({ actionLimit: 5 });

  const [selectedRoute, setSelectedRoute] = useState<RouteCategory>("Fix");
  const [selectedActionId, setSelectedActionId] = useState<string | null>(null);

  const routeBuckets = useMemo(() => {
    const buckets: Record<RouteCategory, typeof allActions> = {
      Fix: [],
      Improve: [],
      Create: [],
    };

    allActions.forEach((action) => {
      buckets[action.category].push(action);
    });

    return buckets;
  }, [allActions]);

  const routeOptions = useMemo(() => {
    return ROUTE_ORDER.map((category) => {
      const lead = routeBuckets[category][0] ?? null;
      return {
        category,
        count: routeBuckets[category].length,
        available: routeBuckets[category].length > 0,
        leadTitle: toSentence(lead?.title) || ROUTE_FALLBACK_HEADLINE[category],
        leadStatus: lead ? statusLabel(lead.status) : "No route",
        leadOwner: toSentence(lead?.primaryOwner) || "Unassigned",
        assumptionsCount: lead?.assumptions.length ?? 0,
        optionTitles: routeBuckets[category]
          .slice(0, 4)
          .map((action) => toSentence(action.title))
          .filter(Boolean),
      };
    });
  }, [routeBuckets]);

  const preferredRoute = useMemo<RouteCategory>(() => {
    if (topActions[0]?.category) return topActions[0].category;
    const firstAvailable = routeOptions.find((route) => route.available);
    return firstAvailable ? firstAvailable.category : "Fix";
  }, [routeOptions, topActions]);

  const selectedRouteOption = useMemo(
    () => routeOptions.find((route) => route.category === selectedRoute) ?? routeOptions[0],
    [routeOptions, selectedRoute],
  );

  const selectedRouteActions = useMemo(
    () =>
      [...(routeBuckets[selectedRoute] ?? [])].sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.title.localeCompare(b.title);
      }),
    [routeBuckets, selectedRoute],
  );

  const selectedAction = useMemo(
    () => selectedRouteActions.find((action) => action.id === selectedActionId) ?? selectedRouteActions[0] ?? null,
    [selectedActionId, selectedRouteActions],
  );

  useEffect(() => {
    setSelectedRoute(preferredRoute);
  }, [activeCompany?.id, preferredRoute]);

  useEffect(() => {
    setSelectedActionId((previous) => {
      if (previous && selectedRouteActions.some((action) => action.id === previous)) return previous;
      return selectedRouteActions[0]?.id ?? null;
    });
  }, [selectedRouteActions, selectedRoute]);

  const goToMainSite = useCallback(() => {
    navigate("/");
  }, [navigate]);

  const goToRefineHome = useCallback(() => {
    navigate(CLIENT_REFINE_PREVIEW_ROUTE);
  }, [navigate]);

  if (!hasCompany) {
    return (
      <section className="crpv-page crpv-routes-page">
        <article className="crpv-empty-state">
          <p className="cap">Client Refine Preview · Routes</p>
          <h1>Select a company to preview route options.</h1>
          {companiesLoading ? (
            <p className="crpv-muted">Loading companies…</p>
          ) : companies.length > 0 ? (
            <div className="crpv-company-grid">
              {companies.map((company) => (
                <button
                  key={company.id}
                  type="button"
                  className="crpv-company-button"
                  onClick={() => setActiveCompanyId(company.id)}
                >
                  <span>{company.name}</span>
                  <small>
                    {company.quarter || "Quarter"} · {company.archetype || "Archetype"}
                  </small>
                </button>
              ))}
            </div>
          ) : (
            <p className="crpv-muted">No companies available.</p>
          )}
        </article>
      </section>
    );
  }

  const totalRouteActions = routeOptions.reduce((total, route) => total + route.count, 0);

  return (
    <section className="crpv-page crpv-routes-page">
      <header className="crpv-header">
        <div className="left">
          <b>Mojo</b>
          <span className="cap">
            [{toSentence(activeCompany?.name) || "COMPANY"}] · ROUTES · {stageLabel(phase).toUpperCase()}
          </span>
        </div>
        <div className="crpv-header-tools">
          <button type="button" className="btn ghost" onClick={goToRefineHome}>
            ← Refine Home
          </button>
          <button type="button" className="btn ghost crpv-main-site-btn" onClick={goToMainSite}>
            ← Main site
          </button>
        </div>
      </header>

      <div className="crpv-routes-toolbar">
        <div className="crpv-map-route-row" role="tablist" aria-label="Route categories">
          {routeOptions.map((route) => (
            <button
              key={route.category}
              type="button"
              role="tab"
              aria-selected={selectedRoute === route.category}
              className={`crpv-map-route-pill ${selectedRoute === route.category ? "active" : ""}`.trim()}
              onClick={() => setSelectedRoute(route.category)}
            >
              <span className="name">{route.category}</span>
              <span className="meta">{route.available ? `${route.count} live` : "none"}</span>
            </button>
          ))}
        </div>
        <p className="crpv-routes-subtitle">
          Current map data only · {totalRouteActions} route option{totalRouteActions === 1 ? "" : "s"} · confidence{" "}
          {confidence.level.toUpperCase()} · stage {stageLabel(phase).toUpperCase()}
        </p>
      </div>

      <div className="crpv-routes-columns">
        <aside className="crpv-routes-col crpv-routes-col-routes">
          <div className="crpv-routes-col-head">
            <p className="cap">Route options</p>
            <span className="crpv-routes-col-meta">{totalRouteActions} total</span>
          </div>
          <div className="crpv-routes-route-stack">
            {routeOptions.map((route) => (
              <button
                key={route.category}
                type="button"
                className={`crpv-routes-route-card ${route.category === selectedRoute ? "active" : ""}`.trim()}
                onClick={() => setSelectedRoute(route.category)}
              >
                <div className="top">
                  <span className="k">{route.category}</span>
                  <span className="v">{route.available ? `${route.count} live` : "none"}</span>
                </div>
                <p>{route.leadTitle}</p>
                <small>
                  {route.leadStatus} · {route.leadOwner}
                </small>
                {route.optionTitles.length > 0 ? (
                  <ul>
                    {route.optionTitles.slice(0, 2).map((item) => (
                      <li key={item}>{shorten(item, 62)}</li>
                    ))}
                  </ul>
                ) : null}
              </button>
            ))}
          </div>
        </aside>

        <section className="crpv-routes-col crpv-routes-col-actions">
          <div className="crpv-routes-col-head">
            <p className="cap">Selected route</p>
            <span className="crpv-routes-col-meta">
              {selectedRouteOption?.category || preferredRoute} · {selectedRouteActions.length} options
            </span>
          </div>
          <h2 className="crpv-routes-col-title">{selectedRouteOption?.leadTitle || toSentence(nextMove?.detail)}</h2>

          {selectedRouteActions.length > 0 ? (
            <div className="crpv-routes-action-stack">
              {selectedRouteActions.map((action) => (
                <button
                  key={action.id}
                  type="button"
                  className={`crpv-routes-action-card ${selectedAction?.id === action.id ? "active" : ""}`.trim()}
                  onClick={() => setSelectedActionId(action.id)}
                >
                  <div className="top">
                    <span className="k">{statusLabel(action.status)}</span>
                    <span className="v">Score {scoreLabel(action.score)}</span>
                  </div>
                  <p>{action.title}</p>
                  <small>
                    Owner · {toSentence(action.primaryOwner) || "Unassigned"} · Assumptions {action.assumptions.length}
                  </small>
                </button>
              ))}
            </div>
          ) : (
            <div className="crpv-routes-empty">
              <p>No options in this route yet.</p>
            </div>
          )}
        </section>

        <aside className="crpv-routes-col crpv-routes-col-detail">
          <div className="crpv-routes-col-head">
            <p className="cap">Action detail</p>
            <span className="crpv-routes-col-meta">{selectedAction ? "live data" : "no selection"}</span>
          </div>

          {selectedAction ? (
            <>
              <h3 className="crpv-routes-detail-title">{selectedAction.title}</h3>
              <div className="crpv-routes-detail-grid">
                <div className="crpv-routes-detail-row">
                  <span>Status</span>
                  <b>{statusLabel(selectedAction.status)}</b>
                </div>
                <div className="crpv-routes-detail-row">
                  <span>Score</span>
                  <b>{scoreLabel(selectedAction.score)}</b>
                </div>
                <div className="crpv-routes-detail-row">
                  <span>Primary owner</span>
                  <b>{toSentence(selectedAction.primaryOwner) || "Unassigned"}</b>
                </div>
                <div className="crpv-routes-detail-row">
                  <span>Decider</span>
                  <b>{toSentence(selectedAction.decider) || "Unassigned"}</b>
                </div>
                <div className="crpv-routes-detail-row">
                  <span>Contributors</span>
                  <b>{selectedAction.contributors.length > 0 ? selectedAction.contributors.join(", ") : "None"}</b>
                </div>
              </div>

              <p className="crpv-routes-detail-copy">{toSentence(selectedAction.whyItMatters)}</p>

              <div className="crpv-routes-detail-list">
                <h4>Assumptions</h4>
                {selectedAction.assumptions.length > 0 ? (
                  <ul>
                    {selectedAction.assumptions.slice(0, 4).map((item) => (
                      <li key={item}>{toSentence(item)}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="crpv-muted">No assumptions captured.</p>
                )}
              </div>

              <div className="crpv-routes-detail-list">
                <h4>If solved</h4>
                {selectedAction.ifSolved.length > 0 ? (
                  <ul>
                    {selectedAction.ifSolved.slice(0, 4).map((item) => (
                      <li key={item}>{toSentence(item)}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="crpv-muted">No expected outcomes captured.</p>
                )}
              </div>
            </>
          ) : (
            <div className="crpv-routes-empty">
              <p>Select a route option to view detail.</p>
            </div>
          )}

          <div className="crpv-routes-meta">
            <span>Phase · {stageLabel(phase)}</span>
            <span>Confidence · {confidence.level}</span>
            <span>Next · {toSentence(nextMove?.title) || "n/a"}</span>
          </div>

          <div className="crpv-routes-actions">
            <button type="button" className="btn primary" onClick={goToRefineHome}>
              Back to command
            </button>
            <button type="button" className="btn ghost" onClick={goToMainSite}>
              Main site
            </button>
          </div>
        </aside>
      </div>
    </section>
  );
}
