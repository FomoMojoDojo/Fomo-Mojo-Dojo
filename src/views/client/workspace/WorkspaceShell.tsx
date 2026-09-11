// WORKSPACE SHELL (comp port 1, 2026-09-11 — S:19-199 in fr tokens). The one frame for
// /preview/client-refine/workspace/*: `.first-read` root, the First Read Header (MojoMap / identity),
// the operator glyph fixed bottom-left (state only, never persisted), a bottom-CENTRE cluster
// (prev · map · next, S:89-122), the launcher overlay, and the keyed page wrapper that replays
// fr-fade-up with a stage direction.
//
// Header third slot (ruling 3): the per-company phase, derived exactly as the home derives it
// (useFlooredEngagementPhase → stageLabel), never a page word.
// LAW: the default render carries zero [data-fr-operator] nodes — every operator node is gated on the
// same OperatorControlsContext value the First Read gates on (null unless the glyph is on).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import "@/views/client/firstReadPreview/firstRead.css";
import { Header } from "@/views/client/firstReadPreview/shell";
import { OperatorControlsContext, type OperatorControls } from "@/views/client/firstReadPreview/operatorControls";
import { OPERATOR_MARK, OPERATOR_STRINGS } from "@/views/client/firstReadPreview/operatorStrings";
import { useCompany } from "@/hooks/useCompany";
import { useOdiNeeds } from "@/hooks/useOdiNeeds";
import { engagementDayFrom } from "@/lib/engagementDay";
import { stageLabel } from "@/lib/phaseDisplay";
import { toSentence } from "@/views/client/home/shared";
import { WorkspaceStageContext, type StageDirection } from "./workspaceContext";
import { WorkspaceLauncher } from "./WorkspaceLauncher";
import { useFlooredEngagementPhase } from "./useFlooredEngagementPhase";
import { WORKSPACE_STRINGS, arrowNeighbour, workspacePageForPathname, workspacePagePath, type WorkspacePage } from "./workspaceNav";

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));
}

function Arrow({ dir, target, onGo }: { dir: "prev" | "next"; target: WorkspacePage | null; onGo: (dir: "prev" | "next") => void }) {
  const aria = dir === "prev" ? WORKSPACE_STRINGS.previous : WORKSPACE_STRINGS.next;
  return (
    <button
      type="button"
      className="fr-ws-arrow fr-mono"
      onClick={() => onGo(dir)}
      disabled={!target}
      aria-disabled={!target}
      aria-label={target ? `${aria}: ${target.label}` : aria}
      title={target?.label}
      data-fr-arrow={dir}
    >
      {target ? <span className="fr-ws-arrow-label fr-mono" aria-hidden="true">{target.label}</span> : null}
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        {dir === "prev"
          ? <path d="M13 8 H3 M7 4 L3 8 L7 12" fill="none" stroke="currentColor" strokeWidth="1.25" />
          : <path d="M3 8 H13 M9 4 L13 8 L9 12" fill="none" stroke="currentColor" strokeWidth="1.25" />}
      </svg>
    </button>
  );
}

export default function WorkspaceShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const { activeCompany } = useCompany();
  const { needs } = useOdiNeeds(activeCompany?.id);
  const page = workspacePageForPathname(location.pathname);

  // Operator switch — the First Read's own affordance, verbatim: state only, never persisted.
  const [operatorOn, setOperatorOn] = useState(false);
  const operatorControls = useMemo<OperatorControls | null>(
    () => (operatorOn ? { decide: async () => {} } : null),
    [operatorOn],
  );

  // Stage: direction + key for the keyed wrapper. A route change resets the key.
  const [direction, setDirection] = useState<StageDirection>("fwd");
  const [stageKey, setStageKey] = useState("");
  useEffect(() => { setStageKey(""); }, [location.pathname]);
  const setStage = useCallback((dir: StageDirection, key: string) => { setDirection(dir); setStageKey(key); }, []);
  const stage = useMemo(() => ({ direction, stageKey, setStage }), [direction, stageKey, setStage]);

  const [launcherOpen, setLauncherOpen] = useState(false);
  const squareRef = useRef<HTMLButtonElement>(null);
  const openLauncher = useCallback(() => setLauncherOpen(true), []);
  const closeLauncher = useCallback(() => { setLauncherOpen(false); squareRef.current?.focus(); }, []);

  const prev = arrowNeighbour(page, "prev");
  const next = arrowNeighbour(page, "next");
  const goArrow = useCallback((dir: "prev" | "next") => {
    const target = dir === "prev" ? prev : next;
    if (!target) return;
    setDirection(dir === "next" ? "fwd" : "back");
    navigate(workspacePagePath(target));
  }, [navigate, next, prev]);

  // Keyboard: ←/→ within the page's group only (wrapping). Same guards as the First Read; the
  // launcher owns its own keys (Esc) while open.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (launcherOpen || isTypingTarget(event.target)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if ((event.key === " " || event.key === "Enter") && target && target.closest("button, a, [role='button']")) return;
      if (event.key === "ArrowRight") { event.preventDefault(); goArrow("next"); }
      else if (event.key === "ArrowLeft") { event.preventDefault(); goArrow("prev"); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goArrow, launcherOpen]);

  const engagementDay = engagementDayFrom(activeCompany?.engagement_started_at);
  const phase = useFlooredEngagementPhase(activeCompany, needs);
  const identity = (
    <span className="fr-workspace-identity" data-testid="workspace-identity">
      [{toSentence(activeCompany?.name) || WORKSPACE_STRINGS.companyFallback}] · {WORKSPACE_STRINGS.day} {engagementDay ?? WORKSPACE_STRINGS.dayFallback} · {stageLabel(phase).toUpperCase()}
    </span>
  );

  return (
    <OperatorControlsContext.Provider value={operatorControls}>
      <WorkspaceStageContext.Provider value={stage}>
        <div className="first-read fr-workspace-page" data-testid="workspace-root" data-fr-page={page.key} data-fr-group={page.group}>
          <Header
            title={WORKSPACE_STRINGS.title}
            identity={identity}
            right={
              // Operator-only chrome in the Header's right slot (S:77-79 in the comp; on the home this is
              // the operator's scan control). Gated on the same value every operator node is gated on.
              operatorControls ? (
                <span className="fr-ws-scan fr-mono" {...{ [OPERATOR_MARK.attr]: "scan" }}>
                  {WORKSPACE_STRINGS.scanAllSurfaces}
                </span>
              ) : null
            }
          />
          <div className="first-read-shell fr-ws-shell">
            <div
              key={`${location.pathname}#${stageKey}`}
              className="fr-act-enter fr-beat fr-workspace-stage"
              data-fr-stage={direction}
              data-testid="workspace-stage"
            >
              <Outlet />
            </div>
          </div>

          {/* Bottom-centre cluster (S:89-122): prev · map · next; arrows hide while the map is open. */}
          <div className="fr-ws-cluster" data-testid="workspace-cluster" data-open={launcherOpen ? "true" : undefined}>
            {!launcherOpen ? <Arrow dir="prev" target={prev} onGo={goArrow} /> : null}
            <button
              ref={squareRef}
              type="button"
              className="fr-ws-map"
              onClick={openLauncher}
              aria-label={WORKSPACE_STRINGS.openMap}
              aria-expanded={launcherOpen}
              data-testid="workspace-square"
            >
              <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
                <rect x="2.5" y="2.5" width="6" height="6" fill="none" stroke="currentColor" strokeWidth="1.25" />
                <rect x="11.5" y="2.5" width="6" height="6" fill="none" stroke="currentColor" strokeWidth="1.25" />
                <rect x="2.5" y="11.5" width="6" height="6" fill="none" stroke="currentColor" strokeWidth="1.25" />
                <rect x="11.5" y="11.5" width="6" height="6" fill="none" stroke="currentColor" strokeWidth="1.25" />
              </svg>
            </button>
            {!launcherOpen ? <Arrow dir="next" target={next} onGo={goArrow} /> : null}
          </div>

          {launcherOpen ? (
            <WorkspaceLauncher
              activeKey={page.key}
              companyName={toSentence(activeCompany?.name) || null}
              companyId={activeCompany?.id ?? null}
              onClose={closeLauncher}
              onNavigate={() => { setDirection("fwd"); }}
            />
          ) : null}

          {/* Operator switch — verbatim from the First Read: fixed bottom-left, glyph only. */}
          <button
            type="button"
            className="fixed bottom-6 left-6 flex h-8 w-8 items-center justify-center transition-opacity"
            style={{ color: "hsl(var(--fr-muted))", opacity: operatorOn ? 1 : 0.35, zIndex: 300 }}
            data-fr-operator-switch={operatorOn ? "on" : "off"}
            aria-label={OPERATOR_STRINGS.switchAriaLabel}
            aria-pressed={operatorOn}
            onClick={() => setOperatorOn((v) => !v)}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
              <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.25" />
              <circle cx="8" cy="8" r="2" fill="currentColor" />
            </svg>
          </button>
        </div>
      </WorkspaceStageContext.Provider>
    </OperatorControlsContext.Provider>
  );
}
