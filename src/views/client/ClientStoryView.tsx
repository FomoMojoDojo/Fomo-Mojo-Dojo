import { useEffect, useState } from "react";
import type { ClientSystemPhase } from "@/hooks/useClientMapInteractionState";
import { useCompany } from "@/hooks/useCompany";
import { usePublicBaseline } from "@/hooks/usePublicBaseline";
import { CLIENT_PHASE_NAV_ITEMS } from "@/lib/clientPhaseRoutes";
import { CLIENT_STORY_THEME_KEY, type ClientStoryTheme } from "@/lib/clientStoryView";
import OutsideHeroAct from "@/components/client-view/story/OutsideHeroAct";
import OutsideFindingsAct from "@/components/client-view/story/OutsideFindingsAct";
import OutsideQuestionAct from "@/components/client-view/story/OutsideQuestionAct";
import OutsideNextMoveAct from "@/components/client-view/story/OutsideNextMoveAct";
import MovementShell from "@/components/client-view/story/movement/MovementShell";
import MarketAct from "@/components/client-view/story/movement/MarketAct";
import DiagnoseMarketAct from "@/components/client-view/story/diagnose/DiagnoseMarketAct";
import "@/styles/client-story.css";

/*
 * ClientStoryView — CV-0 chrome + palette shell for the client-facing
 * "story mode" surface (/client-view). Full-bleed (no PageShell): the phase
 * rail is the only chrome, per the design reference.
 *
 * CV-0 scope: chrome, both palettes, empty act scaffold ONLY. No data is
 * read or rendered here. The scaffold blocks are deliberately marked as
 * placeholders so pacing can be judged before content lands (CV-1+).
 */

// Focus / Flow are disabled per the reference (only Outside / Diagnose switch).
const DISABLED_PHASES: ReadonlySet<ClientSystemPhase> = new Set(["focus", "execution"]);

type ScaffoldAct = { eyebrow: string; role: string; awaiting: string };

// Empty act scaffolds per phase. Order + count follow the design reference so
// the one-idea-per-viewport pacing can be judged now. "The Pause" (Diagnose
// Act 6) is intentionally omitted — held until a real two-futures generator
// exists (operator ruling 3), with no placeholder.
const SCAFFOLD_ACTS: Record<"outside" | "diagnosis", ScaffoldAct[]> = {
  // Outside acts are all real as of CV-2 (rendered directly, not from this list).
  outside: [],
  diagnosis: [
    { eyebrow: "Diagnose · Your side, rebuilt from your own documents", role: "Hero + Mojo Score (moves)", awaiting: "CV-3" },
    { eyebrow: "Gap 01 · Position", role: "Say vs. See", awaiting: "CV-3" },
    { eyebrow: "Gap 02 · Audience", role: "Say vs. See", awaiting: "CV-3" },
    { eyebrow: "Match · The one that holds", role: "Say vs. See (the single green moment)", awaiting: "CV-3" },
    { eyebrow: "Root · Where it starts", role: "Say vs. See", awaiting: "CV-3" },
    // The Pause (Act 6) is held — no scaffold, no placeholder.
    { eyebrow: "Next move", role: "Unproven claims → customer lens", awaiting: "CV-4" },
  ],
};

const META_LINE: Record<"outside" | "diagnosis", string> = {
  outside: "Read from public signals · Story mode",
  diagnosis: "Rebuilt from your own documents · Public footprint",
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

  const acts = SCAFFOLD_ACTS[phase];

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
            {/* Build-phase chip; palette control removed — warm is the only
                palette (CV-2 amendment 3). */}
            <span className="cvs-buildchip">CV-0 shell</span>
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
            <OutsideHeroAct preferredRun={preferredRun} />
            <OutsideFindingsAct preferredRun={preferredRun} />
            <OutsideQuestionAct preferredRun={preferredRun} loading={baselineLoading} />
            <OutsideNextMoveAct onStartDiagnose={() => selectPhase("diagnosis")} />
            {/* MPD-3: the inferred-strategy movement — a distinct register
                from the evidence acts above. Act A only; Acts B/C later. */}
            <MovementShell>
              <MarketAct />
            </MovementShell>
          </>
        ) : null}
        {/* MPD-D: the Diagnose say/see act (markets) — mounts alongside the
            remaining CV-3/CV-4 scaffolds, which stay until those acts land. */}
        {phase === "diagnosis" ? <DiagnoseMarketAct /> : null}
        {acts.map((act, index) => {
          return (
            <section className="cvs-act" key={`${phase}-${index}`} aria-label={`Act ${index + 1} scaffold`}>
              <p className="cvs-act-eyebrow">{act.eyebrow}</p>
              <div className="cvs-scaffold">
                <span className="cvs-scaffold-tag">Scaffold · awaiting {act.awaiting}</span>
                <p className="cvs-scaffold-title">{act.role}</p>
                <p className="cvs-scaffold-note">
                  CV-0 shell — no data wired. This block marks where the “{act.role}” act will render once
                  {` ${act.awaiting}`} lands. It is a build-phase placeholder, not a finding.
                </p>
              </div>
            </section>
          );
        })}
      </main>
    </div>
  );
}
