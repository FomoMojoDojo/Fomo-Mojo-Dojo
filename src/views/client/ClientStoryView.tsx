import { useEffect, useState } from "react";
import type { ClientSystemPhase } from "@/hooks/useClientMapInteractionState";
import { CLIENT_PHASE_NAV_ITEMS } from "@/lib/clientPhaseRoutes";
import {
  CLIENT_STORY_PALETTE_KEY,
  CLIENT_STORY_THEME_KEY,
  type ClientStoryPalette,
  type ClientStoryTheme,
} from "@/lib/clientStoryView";
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
  outside: [
    { eyebrow: "Outside View · Before you told us anything", role: "Hero + Mojo Score", awaiting: "CV-1" },
    { eyebrow: "What else stands out", role: "Sourced findings", awaiting: "CV-2" },
    { eyebrow: "So what", role: "Consequence + one open question", awaiting: "CV-2" },
    { eyebrow: "Next move", role: "Take this read inside", awaiting: "CV-2" },
  ],
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
  const [palette, setPalette] = useState<ClientStoryPalette>(() =>
    readStored(CLIENT_STORY_PALETTE_KEY, ["neutral", "warm"] as const, "neutral"),
  );
  const [phase, setPhase] = useState<"outside" | "diagnosis">("outside");

  useEffect(() => {
    try {
      window.localStorage.setItem(CLIENT_STORY_THEME_KEY, theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  useEffect(() => {
    try {
      window.localStorage.setItem(CLIENT_STORY_PALETTE_KEY, palette);
    } catch {
      /* ignore */
    }
  }, [palette]);

  const selectPhase = (next: ClientSystemPhase) => {
    if (DISABLED_PHASES.has(next)) return;
    if (next === "outside" || next === "diagnosis") {
      setPhase(next);
      window.scrollTo({ top: 0, behavior: "auto" });
    }
  };

  const acts = SCAFFOLD_ACTS[phase];

  return (
    <div className="mm-story" data-mm-theme={theme} data-mm-palette={palette}>
      <header className="mm-rail">
        <div className="mm-rail-inner">
          <div className="mm-rail-left">
            <p className="mm-rail-kicker">Decision Path</p>
            <nav className="mm-rail-phases" aria-label="Decision Path phases">
              {CLIENT_PHASE_NAV_ITEMS.map((item) => {
                const disabled = DISABLED_PHASES.has(item.phase);
                const active = item.phase === phase;
                return (
                  <button
                    key={item.phase}
                    type="button"
                    className={`mm-phase ${active ? "is-active" : ""}`}
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

          <div className="mm-rail-controls">
            {/* Build-phase palette control (operator ruling: cheapest honest
                mechanism). Removed once the palette is locked. */}
            <span className="mm-buildchip">CV-0 shell</span>
            <div className="mm-toggle" role="group" aria-label="Palette">
              <span className="mm-toggle-label">Palette</span>
              <button
                type="button"
                className={`mm-toggle-btn ${palette === "neutral" ? "is-active" : ""}`}
                onClick={() => setPalette("neutral")}
              >
                Neutral
              </button>
              <button
                type="button"
                className={`mm-toggle-btn ${palette === "warm" ? "is-active" : ""}`}
                onClick={() => setPalette("warm")}
              >
                Warm
              </button>
            </div>
            <div className="mm-toggle" role="group" aria-label="Theme">
              <button
                type="button"
                className={`mm-toggle-btn ${theme === "dark" ? "is-active" : ""}`}
                onClick={() => setTheme("dark")}
              >
                Dark
              </button>
              <button
                type="button"
                className={`mm-toggle-btn ${theme === "light" ? "is-active" : ""}`}
                onClick={() => setTheme("light")}
              >
                Light
              </button>
            </div>
          </div>
        </div>
      </header>

      <p className="mm-meta">{META_LINE[phase]}</p>

      <main>
        {acts.map((act, index) => (
          <section className="mm-act" key={`${phase}-${index}`} aria-label={`Act ${index + 1} scaffold`}>
            <p className="mm-act-eyebrow">{act.eyebrow}</p>
            <div className="mm-scaffold">
              <span className="mm-scaffold-tag">Scaffold · awaiting {act.awaiting}</span>
              <p className="mm-scaffold-title">{act.role}</p>
              <p className="mm-scaffold-note">
                CV-0 shell — no data wired. This block marks where the “{act.role}” act will render once
                {` ${act.awaiting}`} lands. It is a build-phase placeholder, not a finding.
              </p>
            </div>
          </section>
        ))}
      </main>
    </div>
  );
}
