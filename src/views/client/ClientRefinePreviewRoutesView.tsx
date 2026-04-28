import { useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useCompany } from "@/hooks/useCompany";
import { useClientViewData } from "@/hooks/useClientViewData";
import { useRoutes } from "@/views/Routes/useRoutes";
import { CLIENT_REFINE_PREVIEW_ROUTE, CLIENT_REFINE_PREVIEW_WORKSHOP_ROUTE } from "@/lib/clientRefinePreview";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import ScoreContextBar from "@/components/score/ScoreContextBar";
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

// ─── Client route inspect panel ───────────────────────────────────────────────

function deriveClientWhyReasons(route: RouteRow): string[] {
  const stored = Array.isArray(route.why_this_matters_json) ? route.why_this_matters_json.map(String).filter(Boolean) : [];
  if (stored.length > 0) return stored;
  const category = String(route.category || "").toLowerCase();
  const desc = route.short_description ? String(route.short_description).trim() : "";
  const reasons: string[] = [];
  if (desc) reasons.push(desc);
  if (category === "fix") {
    reasons.push("This gap is actively limiting your score and customer outcomes.");
    if (reasons.length < 2) reasons.push("Addressing this now prevents the gap from compounding over time.");
  } else if (category === "improve") {
    reasons.push("Strengthening this area would measurably improve your readiness score.");
    if (reasons.length < 2) reasons.push("Partial progress exists — this route closes the remaining gap.");
  } else {
    reasons.push("Building this capability would unlock growth opportunities not currently available.");
    if (reasons.length < 2) reasons.push("This reflects unmet demand in your customer or market signals.");
  }
  return reasons.slice(0, 3);
}

type EvidenceItem = { id: string; title: string; status: "complete" | "in_progress" | "missing" };

function deriveClientEvidence(route: RouteRow): EvidenceItem[] {
  const stored = (Array.isArray(route.evidence_json) ? route.evidence_json : []) as EvidenceItem[];
  if (stored.length > 0) return stored;
  const category = String(route.category || "").toLowerCase();
  if (category === "fix") {
    return [
      { id: `${route.id}-ev-1`, title: "Current-state evidence for the identified gap", status: "missing" },
      { id: `${route.id}-ev-2`, title: "Decision owner and turnaround timing confirmed", status: "missing" },
    ];
  }
  if (category === "improve") {
    return [
      { id: `${route.id}-ev-1`, title: "Improvement owner and baseline metric defined", status: "in_progress" },
      { id: `${route.id}-ev-2`, title: "Target state and success metric confirmed", status: "missing" },
    ];
  }
  return [
    { id: `${route.id}-ev-1`, title: "New capability owner and pilot scope defined", status: "missing" },
    { id: `${route.id}-ev-2`, title: "Demand validation evidence gathered", status: "missing" },
  ];
}

function ClientRouteInspectPanel({
  open,
  onClose,
  route,
}: {
  open: boolean;
  onClose: () => void;
  route: RouteRow | null;
}) {
  if (!route) return null;

  const why = deriveClientWhyReasons(route);
  const evidence = deriveClientEvidence(route);
  const supporting = evidence.filter((e) => e.status !== "missing");
  const missing = evidence.filter((e) => e.status === "missing");
  const category = String(route.category || "").toLowerCase();
  const pts = typeof route.pts_value === "number" ? Math.round(route.pts_value) : null;
  const effort = route.effort ? String(route.effort).toUpperCase() : null;

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent side="right" className="sm:max-w-[480px] overflow-y-auto flex flex-col gap-0 p-0">
        <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
          <div className="crpv-inspect-hd" style={{ borderBottom: "1px solid #d9d9d9" }}>
            <div className="crpv-inspect-badges">
              {category && <span className="crpv-r-badge">{category.toUpperCase()}</span>}
              {effort && <span className="crpv-r-badge">{effort} EFFORT</span>}
              {pts !== null && <span className="crpv-r-badge">{pts > 0 ? `+${pts}` : `${pts}`} PTS</span>}
            </div>
            <p className="crpv-inspect-title" style={{ color: "#111111" }}>{route.title || "Untitled route"}</p>
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px", display: "flex", flexDirection: "column", gap: 20 }}>
            <div className="crpv-inspect-section">
              <p className="crpv-inspect-section-label" style={{ color: "#999999" }}>Why this was flagged</p>
              <ul className="crpv-inspect-bullets">
                {why.map((reason, i) => (
                  <li key={i} className="crpv-inspect-bullet" style={{ color: "#555555" }}>
                    <span className="crpv-inspect-dot" style={{ color: "#999999" }}>·</span>
                    <span>{reason}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div style={{ height: 1, background: "#d9d9d9" }} />

            <div className="crpv-inspect-section">
              <p className="crpv-inspect-section-label" style={{ color: "#999999" }}>Evidence</p>
              {supporting.length > 0 && (
                <div className="crpv-inspect-evidence-group">
                  <p className="crpv-inspect-sub-label">Supporting</p>
                  {supporting.map((item) => (
                    <div key={item.id} className="crpv-r-detail-row">
                      <span className={`crpv-r-dot ${item.status}`} title={statusTip(item.status)}>{statusGlyph(item.status)}</span>
                      <span style={{ color: "#555555" }}>{item.title}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="crpv-inspect-evidence-group">
                <p className="crpv-inspect-sub-label crpv-inspect-sub-label--gap">Needs attention</p>
                {missing.length > 0 ? (
                  missing.map((item) => (
                    <div key={item.id} className="crpv-r-detail-row crpv-r-detail-row--missing">
                      <span className="crpv-r-dot missing" title="Missing — not yet addressed">○</span>
                      <span style={{ color: "#ff7d2d" }}>{item.title}</span>
                    </div>
                  ))
                ) : (
                  <p className="crpv-inspect-empty" style={{ color: "#999999" }}>No gaps flagged for this route.</p>
                )}
              </div>
            </div>
          </div>

          <div style={{ padding: "16px 24px", borderTop: "1px solid #d9d9d9" }}>
            <button type="button" className="crpv-inspect-close" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ─── Route card ───────────────────────────────────────────────────────────────

type DetailItem = { id: string; title: string; status: "complete" | "in_progress" | "missing" };

function statusGlyph(status: DetailItem["status"]) {
  if (status === "complete")    return "◉";
  if (status === "in_progress") return "◎";
  return "○";
}

function statusTip(status: DetailItem["status"]) {
  if (status === "complete")    return "Complete";
  if (status === "in_progress") return "In progress";
  return "Missing — not yet addressed";
}

function RouteCard({ route, onInspect }: { route: RouteRow; onInspect?: () => void }) {
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
                  <span className={`crpv-r-dot ${step.status}`} title={statusTip(step.status)}>{statusGlyph(step.status)}</span>
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
                  <span className={`crpv-r-dot ${item.status}`} title={statusTip(item.status)}>{statusGlyph(item.status)}</span>
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

          {onInspect && (
            <div className="crpv-r-detail-section">
              <button
                type="button"
                className="crpv-r-inspect-btn"
                onClick={(e) => { e.stopPropagation(); onInspect(); }}
              >
                Inspect why →
              </button>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

// ─── Column ───────────────────────────────────────────────────────────────────

function RoutesColumn({
  category,
  items,
  onInspect,
}: {
  category: RouteCategory;
  items: RouteRow[];
  onInspect?: (route: RouteRow) => void;
}) {
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
          items.map((route) => (
            <RouteCard
              key={route.id}
              route={route}
              onInspect={onInspect ? () => onInspect(route) : undefined}
            />
          ))
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
  const [inspectRoute, setInspectRoute] = useState<RouteRow | null>(null);

  const goToMainSite    = useCallback(() => navigate("/"), [navigate]);
  const goToRefineHome  = useCallback(() => navigate(CLIENT_REFINE_PREVIEW_ROUTE), [navigate]);
  const goToWorkshop    = useCallback(() => navigate(CLIENT_REFINE_PREVIEW_WORKSHOP_ROUTE), [navigate]);

  const fix     = useMemo(() => routes.filter((r) => String(r.category).toLowerCase() === "fix"),     [routes]);
  const improve = useMemo(() => routes.filter((r) => String(r.category).toLowerCase() === "improve"), [routes]);
  const create  = useMemo(() => routes.filter((r) => String(r.category).toLowerCase() === "create"),  [routes]);

  const currentScore    = Math.round(Number(activeCompany?.mojo_score ?? 0));
  const potentialScore  = Math.round(Number(activeCompany?.potential_score ?? 0));
  const unlockableScore = Math.round(Number(activeCompany?.projected_score ?? 0));

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

      <ScoreContextBar
        currentScore={currentScore}
        reachableScore={potentialScore}
        unlockableScore={unlockableScore}
        routesCount={routes.length}
        confidenceLabel={confidence.level}
      />

      {routesLoading ? (
        <div className="crpv-r-loading">
          <p className="cap">Loading routes…</p>
        </div>
      ) : (
        <div className="crpv-r-columns">
          <RoutesColumn category="fix"     items={fix}     onInspect={setInspectRoute} />
          <RoutesColumn category="improve" items={improve} onInspect={setInspectRoute} />
          <RoutesColumn category="create"  items={create}  onInspect={setInspectRoute} />
        </div>
      )}

      <ClientRouteInspectPanel
        open={!!inspectRoute}
        onClose={() => setInspectRoute(null)}
        route={inspectRoute}
      />
    </section>
  );
}
