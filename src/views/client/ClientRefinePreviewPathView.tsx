import { useNavigate } from "react-router-dom";
import { useClientViewData } from "@/hooks/useClientViewData";
import { useCompany } from "@/hooks/useCompany";
import { useRoutes } from "@/hooks/useRoutes";
import { getActivePath, clearActivePath } from "@/lib/activePath";
import { CLIENT_REFINE_PREVIEW_WORKSHOP_ROUTE } from "@/lib/clientRefinePreview";
import { routeRelativeTime } from "@/lib/routeDecision";
import "@/styles/client-refine-preview.css";

const CATEGORY_LABEL: Record<string, string> = {
  fix:     "Under Pressure",
  improve: "Under Validation",
  create:  "Directional",
};

const STATUS_GLYPH: Record<string, string> = {
  complete:    "◉",
  in_progress: "◎",
  missing:     "○",
};

function statusGlyph(status: string) {
  return STATUS_GLYPH[status] ?? "○";
}

export default function ClientRefinePreviewPathView() {
  const navigate = useNavigate();
  const { loading: companyLoading } = useCompany();
  const { activeCompany } = useClientViewData({ actionLimit: 0 });
  const { items: routes, loading: routesLoading } = useRoutes(activeCompany?.id);

  const companyId = activeCompany?.id ?? null;
  const activePath = companyId ? getActivePath(companyId) : null;
  const route = activePath ? routes.find((r) => r.id === activePath.routeId) ?? null : null;

  const steps   = Array.isArray(route?.steps_json)            ? route.steps_json    : [];
  const why     = Array.isArray(route?.why_this_matters_json) ? route.why_this_matters_json : [];
  const blockers = (Array.isArray(route?.evidence_json) ? route.evidence_json : [])
    .filter((ev: { status: string }) => ev.status === "missing");

  const loading = companyLoading || routesLoading;

  const completedSteps = steps.filter((s) => s.status === "complete").length;

  const currentFocusStep =
    steps.find((s) => s.id === activePath?.stepId) ??
    steps.find((s) => s.status !== "complete") ??
    null;

  const currentFocusIdx = steps.findIndex((s) => s.id === currentFocusStep?.id);
  const upNextStep =
    currentFocusIdx >= 0 && currentFocusIdx + 1 < steps.length
      ? steps[currentFocusIdx + 1]
      : null;

  const whySentence =
    route?.short_description ||
    (why.length > 0 ? String(why[0]) : null);

  const catLabel =
    CATEGORY_LABEL[String(route?.category).toLowerCase()] ?? String(route?.category ?? "");

  function handleAbandon() {
    if (companyId) clearActivePath(companyId);
    navigate(CLIENT_REFINE_PREVIEW_WORKSHOP_ROUTE);
  }

  const labelStyle = {
    fontSize: 9,
    fontFamily: "monospace",
    letterSpacing: "0.1em",
    color: "#999",
    textTransform: "uppercase" as const,
    margin: "0 0 8px",
  };

  return (
    <div className="crpv-page" style={{ minHeight: "100vh", background: "#fafaf9" }}>
      {/* top nav */}
      <div style={{ borderBottom: "1px solid #e8e6e0", background: "#fff", padding: "14px 32px", display: "flex", alignItems: "center", gap: 20 }}>
        <button
          type="button"
          onClick={() => navigate(CLIENT_REFINE_PREVIEW_WORKSHOP_ROUTE)}
          style={{ fontSize: 12, color: "#888", background: "none", border: "none", cursor: "pointer", padding: 0, textDecoration: "underline" }}
        >
          ← Workshop
        </button>
        <span style={{ fontSize: 9, fontFamily: "monospace", letterSpacing: "0.1em", color: "#bbb", textTransform: "uppercase" }}>
          Active path
        </span>
      </div>

      <div style={{ maxWidth: 560, margin: "0 auto", padding: "48px 32px 80px" }}>
        {loading ? (
          <p style={{ fontSize: 13, color: "#999" }}>Loading…</p>
        ) : !activePath || !route ? (
          <div style={{ textAlign: "center", paddingTop: 80 }}>
            <p style={{ fontSize: 13, color: "#999", marginBottom: 16 }}>
              No active route yet. Return to the workshop to start one.
            </p>
            <button
              type="button"
              onClick={() => navigate(CLIENT_REFINE_PREVIEW_WORKSHOP_ROUTE)}
              style={{ fontSize: 12, color: "#555", textDecoration: "underline", background: "none", border: "none", cursor: "pointer" }}
            >
              ← Back to workshop
            </button>
          </div>
        ) : (
          <>
            {/* CURRENT FOCUS */}
            {currentFocusStep && (
              <div style={{ marginBottom: 48 }}>
                <p style={labelStyle}>Current focus</p>
                <p style={{ fontSize: 20, fontWeight: 600, color: "#111", margin: 0, lineHeight: 1.3 }}>
                  {currentFocusStep.title}
                </p>
              </div>
            )}

            {/* ACTIVE ROUTE */}
            <div style={{ marginBottom: 40 }}>
              <p style={labelStyle}>Active route</p>
              {catLabel && (
                <span style={{ fontSize: 9, fontFamily: "monospace", letterSpacing: "0.1em", color: "#999", textTransform: "uppercase", background: "#f2f0eb", borderRadius: 3, padding: "2px 6px", display: "inline-block", marginBottom: 8 }}>
                  {catLabel}
                </span>
              )}
              <p style={{ fontSize: 15, fontWeight: 600, color: "#111", margin: "0 0 6px", lineHeight: 1.35 }}>
                {route.title}
              </p>
              <p style={{ fontSize: 11, color: "#bbb", margin: 0, fontFamily: "monospace" }}>
                Started {routeRelativeTime(activePath.startedAt)}
              </p>
            </div>

            {/* WHY THIS */}
            {whySentence && (
              <div style={{ marginBottom: 40 }}>
                <p style={labelStyle}>Why this route</p>
                <p style={{ fontSize: 13, color: "#555", margin: 0, lineHeight: 1.6 }}>
                  {whySentence}
                </p>
              </div>
            )}

            {/* PROGRESS */}
            {steps.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <p style={labelStyle}>Progress</p>
                <p style={{ fontSize: 12, color: "#888", margin: 0, fontFamily: "monospace" }}>
                  {completedSteps} of {steps.length} done
                </p>
              </div>
            )}

            {/* STEPS */}
            {steps.length > 0 && (
              <div style={{ marginBottom: 40 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {steps.map((step, i) => {
                    const isActive = step.id === activePath.stepId;
                    return (
                      <div key={step.id ?? i} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                        <span style={{ fontSize: 13, color: step.status === "missing" ? "#ccc" : "#5f9b8c", flexShrink: 0, lineHeight: 1.5 }}>
                          {statusGlyph(step.status)}
                        </span>
                        <span style={{ fontSize: 13, color: step.status === "missing" ? "#bbb" : "#333", lineHeight: 1.5, flex: 1 }}>
                          {step.title}
                        </span>
                        {isActive && (
                          <span style={{ fontSize: 9, fontFamily: "monospace", letterSpacing: "0.08em", color: "#999", textTransform: "uppercase", flexShrink: 0, paddingTop: 3 }}>
                            Now
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* BLOCKERS */}
            {blockers.length > 0 && (
              <div style={{ marginBottom: 40 }}>
                <p style={labelStyle}>Blockers</p>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {blockers.map((ev: { id?: string; title: string; status: string }, i: number) => (
                    <div key={ev.id ?? i} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                      <span style={{ fontSize: 13, color: "#ccc", flexShrink: 0, lineHeight: 1.5 }}>○</span>
                      <span style={{ fontSize: 13, color: "#555", lineHeight: 1.5 }}>
                        {ev.title}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* UP NEXT */}
            {upNextStep && (
              <div style={{ marginBottom: 40 }}>
                <p style={labelStyle}>Up next</p>
                <p style={{ fontSize: 13, color: "#555", margin: 0, lineHeight: 1.6 }}>
                  {upNextStep.title}
                </p>
              </div>
            )}

            {/* Change path */}
            <div style={{ borderTop: "1px solid #e8e6e0", paddingTop: 24 }}>
              <button
                type="button"
                onClick={handleAbandon}
                style={{ fontSize: 11, color: "#bbb", textDecoration: "underline", background: "none", border: "none", cursor: "pointer", padding: 0 }}
              >
                Switch routes
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
