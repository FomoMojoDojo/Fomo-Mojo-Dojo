import { useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useCompany } from "@/hooks/useCompany";
import { useClientViewData } from "@/hooks/useClientViewData";
import { useRoutes } from "@/views/Routes/useRoutes";
import { CLIENT_REFINE_PREVIEW_ROUTE, CLIENT_REFINE_PREVIEW_WORKSHOP_ROUTE } from "@/lib/clientRefinePreview";
import type { RouteRow } from "@/views/Routes/useRoutes";
import "@/styles/client-refine-preview.css";

type RouteCategory = "fix" | "improve" | "create";

const CATEGORY_META: Record<RouteCategory, { label: string; subtitle: string }> = {
  fix:     { label: "Fix",     subtitle: "Address gaps that are holding back your score." },
  improve: { label: "Improve", subtitle: "Strengthen what is partially in place." },
  create:  { label: "Create",  subtitle: "Build new capabilities for growth." },
};

function stageLabel(value: string) {
  if (value === "outside") return "outside signals";
  if (value === "diagnosis" || value === "diagnose") return "diagnose";
  if (value === "focus") return "focus";
  if (value === "execution" || value === "flow") return "flow";
  return "diagnose";
}

function toSentence(value: string | null | undefined) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

// ─── Route card ───────────────────────────────────────────────────────────────

type DetailItem = { id: string; title: string; status: "complete" | "in_progress" | "missing" };

function statusGlyph(status: DetailItem["status"]) {
  if (status === "complete")    return "◉";
  if (status === "in_progress") return "◎";
  return "○";
}

function RouteCard({ route }: { route: RouteRow }) {
  const [expanded, setExpanded] = useState(false);

  const steps    = (Array.isArray(route.steps_json)    ? route.steps_json    : []) as DetailItem[];
  const evidence = (Array.isArray(route.evidence_json) ? route.evidence_json : []) as DetailItem[];
  const why      = Array.isArray(route.why_this_matters_json) ? route.why_this_matters_json : [];

  const pts    = typeof route.pts_value === "number" ? Math.round(route.pts_value) : null;
  const effort = route.effort ? String(route.effort).toUpperCase() : null;
  const completedSteps = steps.filter((s) => s.status === "complete").length;

  return (
    <div className={`crpv-r-card${expanded ? " expanded" : ""}`}>
      <button
        type="button"
        className="crpv-r-card-trigger"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="crpv-r-card-top">
          <span className="crpv-r-card-title">{route.title || "Untitled route"}</span>
          <span className="crpv-r-card-chevron">{expanded ? "▲" : "▼"}</span>
        </div>

        {route.short_description ? (
          <p className="crpv-r-card-desc">{route.short_description}</p>
        ) : null}

        <div className="crpv-r-card-meta">
          {pts !== null ? (
            <span className="crpv-r-badge">{pts > 0 ? `+${pts} PTS` : `${pts} PTS`}</span>
          ) : null}
          {effort ? <span className="crpv-r-badge">{effort} EFFORT</span> : null}
          {steps.length > 0 ? (
            <span className="crpv-r-badge-ghost">{completedSteps}/{steps.length} STEPS</span>
          ) : null}
        </div>
      </button>

      {expanded ? (
        <div className="crpv-r-card-detail">
          {steps.length > 0 ? (
            <div className="crpv-r-detail-section">
              <p className="crpv-r-detail-label">Steps</p>
              {steps.map((step) => (
                <div key={step.id} className="crpv-r-detail-row">
                  <span className={`crpv-r-dot ${step.status}`}>{statusGlyph(step.status)}</span>
                  <span>{step.title}</span>
                </div>
              ))}
            </div>
          ) : null}

          {evidence.length > 0 ? (
            <div className="crpv-r-detail-section">
              <p className="crpv-r-detail-label">Evidence needed</p>
              {evidence.map((item) => (
                <div key={item.id} className="crpv-r-detail-row">
                  <span className={`crpv-r-dot ${item.status}`}>{statusGlyph(item.status)}</span>
                  <span>{item.title}</span>
                </div>
              ))}
            </div>
          ) : null}

          {why.length > 0 ? (
            <div className="crpv-r-detail-section crpv-r-detail-why">
              <p className="crpv-r-detail-label">Why this matters</p>
              {why.map((reason, i) => (
                <div key={i} className="crpv-r-detail-row">
                  <span className="crpv-r-dot">·</span>
                  <span>{String(reason)}</span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// ─── Column ───────────────────────────────────────────────────────────────────

function RoutesColumn({ category, items }: { category: RouteCategory; items: RouteRow[] }) {
  const meta = CATEGORY_META[category];
  return (
    <section className="crpv-r-column">
      <div className="crpv-r-col-hd">
        <div className="crpv-r-col-hd-top">
          <span className="crpv-r-col-label">{meta.label}</span>
          <span className="crpv-r-col-count">{items.length}</span>
        </div>
        <p className="crpv-r-col-subtitle">{meta.subtitle}</p>
        <div className="crpv-r-col-divider" />
      </div>

      <div className="crpv-r-card-stack">
        {items.length > 0 ? (
          items.map((route) => <RouteCard key={route.id} route={route} />)
        ) : (
          <div className="crpv-r-empty">No routes in this category yet.</div>
        )}
      </div>
    </section>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ClientRefinePreviewRoutesView() {
  const navigate = useNavigate();
  const { companies, setActiveCompanyId, loading: companiesLoading } = useCompany();
  const { activeCompany, hasCompany, phase, confidence } = useClientViewData({ actionLimit: 5 });
  const { loading: routesLoading, items: routes } = useRoutes(activeCompany?.id);

  const goToMainSite    = useCallback(() => navigate("/"), [navigate]);
  const goToRefineHome  = useCallback(() => navigate(CLIENT_REFINE_PREVIEW_ROUTE), [navigate]);
  const goToWorkshop    = useCallback(() => navigate(CLIENT_REFINE_PREVIEW_WORKSHOP_ROUTE), [navigate]);

  const fix     = useMemo(() => routes.filter((r) => String(r.category).toLowerCase() === "fix"),     [routes]);
  const improve = useMemo(() => routes.filter((r) => String(r.category).toLowerCase() === "improve"), [routes]);
  const create  = useMemo(() => routes.filter((r) => String(r.category).toLowerCase() === "create"),  [routes]);

  const currentScore   = Math.round(Number(activeCompany?.mojo_score ?? 0));
  const potentialScore = Math.round(Number(activeCompany?.potential_score ?? activeCompany?.projected_score ?? 0));
  const scoreDelta     = Math.max(0, potentialScore - currentScore);

  if (!hasCompany) {
    return (
      <section className="crpv-page crpv-routes-page">
        <article className="crpv-empty-state">
          <p className="cap">Client Refine Preview · Routes</p>
          <h1>Select a company to view routes.</h1>
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
                  <small>{company.quarter || "Quarter"} · {company.archetype || "Archetype"}</small>
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
          <button type="button" className="btn ghost" onClick={goToWorkshop}>Edit strategy →</button>
          <button type="button" className="btn ghost" onClick={goToRefineHome}>← Refine Home</button>
          <button type="button" className="btn ghost crpv-main-site-btn" onClick={goToMainSite}>← Main site</button>
        </div>
      </header>

      <div className="crpv-r-stat-bar">
        <div className="crpv-r-stat">
          <span className="crpv-r-stat-val">{currentScore || "—"}</span>
          <span className="crpv-r-stat-lbl">Current</span>
        </div>
        <span className="crpv-r-stat-arrow">→</span>
        <div className="crpv-r-stat">
          <span className="crpv-r-stat-val">{potentialScore || "—"}</span>
          <span className="crpv-r-stat-lbl">Potential</span>
        </div>
        <div className="crpv-r-stat">
          <span className="crpv-r-stat-val crpv-r-stat-delta">+{scoreDelta}</span>
          <span className="crpv-r-stat-lbl">Delta</span>
        </div>
        <div className="crpv-r-stat-sep" />
        <div className="crpv-r-stat">
          <span className="crpv-r-stat-val">{routes.length}</span>
          <span className="crpv-r-stat-lbl">Routes</span>
        </div>
        <div className="crpv-r-stat">
          <span className="crpv-r-stat-val">{confidence.level.toUpperCase()}</span>
          <span className="crpv-r-stat-lbl">Confidence</span>
        </div>
      </div>

      {routesLoading ? (
        <div className="crpv-r-loading">
          <p className="cap">Loading routes…</p>
        </div>
      ) : (
        <div className="crpv-r-columns">
          <RoutesColumn category="fix"     items={fix}     />
          <RoutesColumn category="improve" items={improve} />
          <RoutesColumn category="create"  items={create}  />
        </div>
      )}
    </section>
  );
}
