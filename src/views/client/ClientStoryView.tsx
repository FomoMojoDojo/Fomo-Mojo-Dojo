import { useEffect, useState } from "react";
import type { ClientSystemPhase } from "@/hooks/useClientMapInteractionState";
import { useCompany } from "@/hooks/useCompany";
import StandardsShell from "@/components/client-view/story/standards/StandardsShell";
import FrontDoorMapAct from "@/components/client-view/story/standards/FrontDoorMapAct";
import { usePublicBaseline } from "@/hooks/usePublicBaseline";
import { CLIENT_PHASE_NAV_ITEMS } from "@/lib/clientPhaseRoutes";
import { CLIENT_STORY_THEME_KEY, type ClientStoryTheme } from "@/lib/clientStoryView";
import OutsideHeroAct from "@/components/client-view/story/OutsideHeroAct";
import OutsideFindingsAct from "@/components/client-view/story/OutsideFindingsAct";
import OutsideQuestionAct from "@/components/client-view/story/OutsideQuestionAct";
import OutsideNextMoveAct from "@/components/client-view/story/OutsideNextMoveAct";
import MovementShell from "@/components/client-view/story/movement/MovementShell";
import MarketAct from "@/components/client-view/story/movement/MarketAct";
import PositionAct from "@/components/client-view/story/movement/PositionAct";
import DiagnoseMarketAct from "@/components/client-view/story/diagnose/DiagnoseMarketAct";
import "@/styles/client-story.css";

/*
 * ClientStoryView — CV-0 chrome + palette shell for the client-facing
 * "story mode" surface (/client-view). Full-bleed (no PageShell): the phase
 * rail is the only chrome, per the design reference.
 *
 * Outside phase: all acts real (CV-1/CV-2). Diagnose phase: the markets say-vs-see
 * act (DiagnoseMarketAct) plus ONE operator-signed honest-empty bridging to the
 * CV-3 say-vs-see acts (position/audience/root) that are not yet built.
 */

// Focus / Flow are disabled per the reference (only Outside / Diagnose switch).
const DISABLED_PHASES: ReadonlySet<ClientSystemPhase> = new Set(["focus", "execution"]);

// ── Diagnosis honest-empty — OPERATOR-SIGNED 2026-08-03 (FR-DIAG-EMPTY) ───────
// Replaces the six CV-0 build scaffolds with ONE honest-empty: the signed bridge
// shown after the markets act until the CV-3 say-vs-see acts (position / audience
// / root) land. Reuses the established .cvs-dg-notready shape + voice from
// DiagnoseMarketAct — no new class, no scaffold markup.
const DIAGNOSIS_REST_HEADLINE = "The rest of your diagnosis is still being prepared.";
const DIAGNOSIS_REST_PROMPT =
  "You've seen how your markets read against the outside. The rest — where your position, audience, and root causes line up or diverge — comes next.";

const META_LINE: Record<"outside" | "diagnosis", string> = {
  outside: "Read from public signals · Story mode",
  diagnosis: "Your side · The outside's side",
};

function readStored<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw && (allowed as readonly string[]).includes(raw)) return raw as T;
  } catch {
    /* localStorage unavailable — fall through to default */
  }
  return fallback;
}

export default function ClientStoryView() {
  const [theme, setTheme] = useState<ClientStoryTheme>(() =>
    readStored(CLIENT_STORY_THEME_KEY, ["dark", "light"] as const, "dark"),
  );
  const [phase, setPhase] = useState<"outside" | "diagnosis">("outside");

  // Fetched once here; the Outside acts share it (open question + the
  // evidence_ledger date map for CV-2c badges).
  const { activeCompany } = useCompany();
  const { preferredRun, loading: baselineLoading } = usePublicBaseline(activeCompany?.id);

  useEffect(() => {
    try {
      window.localStorage.setItem(CLIENT_STORY_THEME_KEY, theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  const selectPhase = (next: ClientSystemPhase) => {
    if (DISABLED_PHASES.has(next)) return;
    if (next === "outside" || next === "diagnosis") {
      setPhase(next);
      window.scrollTo({ top: 0, behavior: "auto" });
    }
  };

  return (
    <div className="cvs-story" data-mm-theme={theme}>
      <header className="cvs-rail">
        <div className="cvs-rail-inner">
          <div className="cvs-rail-left">
            <p className="cvs-rail-kicker">Decision Path</p>
            <nav className="cvs-rail-phases" aria-label="Decision Path phases">
              {CLIENT_PHASE_NAV_ITEMS.map((item) => {
                const disabled = DISABLED_PHASES.has(item.phase);
                const active = item.phase === phase;
                return (
                  <button
                    key={item.phase}
                    type="button"
                    className={`cvs-phase ${active ? "is-active" : ""}`}
                    disabled={disabled}
                    aria-current={active ? "page" : undefined}
                    aria-disabled={disabled || undefined}
                    onClick={() => selectPhase(item.phase)}
                  >
                    {item.label}
                  </button>
                );
              })}
            </nav>
          </div>

          <div className="cvs-rail-controls">
            {/* FR-DIAG-EMPTY: the "CV-0 shell" build chip is deleted — build status
                is operator-only, never client-facing. No replacement. */}
            <div className="cvs-toggle" role="group" aria-label="Theme">
              <button
                type="button"
                className={`cvs-toggle-btn ${theme === "dark" ? "is-active" : ""}`}
                onClick={() => setTheme("dark")}
              >
                Dark
              </button>
              <button
                type="button"
                className={`cvs-toggle-btn ${theme === "light" ? "is-active" : ""}`}
                onClick={() => setTheme("light")}
              >
                Light
              </button>
            </div>
          </div>
        </div>
      </header>

      <p className="cvs-meta">{META_LINE[phase]}</p>

      <main>
        {/* Outside page: all four acts real (CV-1 + CV-2). Diagnose stays scaffolds. */}
        {phase === "outside" ? (
          <>
            {/* FD-3: the cold-open industry-standard job map — the standard shape,
                shown BEFORE any reading of this company. Reference register
                (StandardsShell), stands permanently at the top of Outside. */}
            <StandardsShell>
              <FrontDoorMapAct />
            </StandardsShell>
            <OutsideHeroAct preferredRun={preferredRun} />
            <OutsideFindingsAct preferredRun={preferredRun} />
            <OutsideQuestionAct companyId={activeCompany?.id} />
            <OutsideNextMoveAct onStartDiagnose={() => selectPhase("diagnosis")} />
            {/* MPD-3: the inferred-strategy movement — a distinct register
                from the evidence acts above. Acts A and B: both readings of
                THIS company's public footprint. */}
            <MovementShell>
              <MarketAct />
              <PositionAct />
            </MovementShell>
          </>
        ) : null}
        {/* MPD-D + FR-DIAG-EMPTY: the Diagnose markets say/see act, then ONE
            operator-signed honest-empty bridging to the not-yet-built CV-3 acts.
            The empty is its OWN sibling section — never nested in DiagnoseMarketAct
            — and renders only in the diagnosis phase (never where the Outside
            phase's real acts live). */}
        {phase === "diagnosis" ? (
          <>
            <DiagnoseMarketAct />
            <section className="cvs-act cvs-dg" aria-label="Diagnose — the rest is being prepared">
              <div className="cvs-dg-notready">
                <p className="cvs-dg-notready-headline">{DIAGNOSIS_REST_HEADLINE}</p>
                <p className="cvs-dg-notready-prompt">{DIAGNOSIS_REST_PROMPT}</p>
              </div>
            </section>
          </>
        ) : null}
      </main>
    </div>
  );
}
