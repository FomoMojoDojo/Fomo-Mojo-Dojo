import type { ClientSystemPhase } from "@/hooks/useClientMapInteractionState";
import { CLIENT_PHASE_NAV_ITEMS } from "@/lib/clientPhaseRoutes";

type DecisionPhaseNavProps = {
  activePhase: ClientSystemPhase;
  onSelectPhase: (phase: ClientSystemPhase) => void;
  theme: "dark" | "light";
  onThemeChange: (theme: "dark" | "light") => void;
};

export default function DecisionPhaseNav({
  activePhase,
  onSelectPhase,
  theme,
  onThemeChange,
}: DecisionPhaseNavProps) {
  return (
    <section className="cv-phase-nav decision-reveal" style={{ ["--reveal-index" as string]: 0.5 }}>
      <div className="cv-phase-nav-topline">
        <p className="cv-phase-nav-kicker">Decision Path</p>
        <div className="cv-theme-toggle" role="group" aria-label="Client view theme">
          <button
            type="button"
            className={`cv-theme-toggle-btn ${theme === "dark" ? "is-active" : ""}`}
            onClick={() => onThemeChange("dark")}
          >
            Dark
          </button>
          <button
            type="button"
            className={`cv-theme-toggle-btn ${theme === "light" ? "is-active" : ""}`}
            onClick={() => onThemeChange("light")}
          >
            Light
          </button>
        </div>
      </div>

      <div className="cv-phase-nav-links" aria-label="Decision Path phases">
        {CLIENT_PHASE_NAV_ITEMS.map((item, index) => {
          const active = item.phase === activePhase;
          return (
            <span key={item.phase} className="cv-phase-link-group">
              <button
                type="button"
                aria-current={active ? "step" : undefined}
                className={`cv-phase-link ${active ? "is-active" : ""}`}
                onClick={() => onSelectPhase(item.phase)}
              >
                {item.label}
              </button>
              {index < CLIENT_PHASE_NAV_ITEMS.length - 1 ? (
                <span className="cv-phase-link-separator" aria-hidden>
                  /
                </span>
              ) : null}
            </span>
          );
        })}
      </div>
    </section>
  );
}
