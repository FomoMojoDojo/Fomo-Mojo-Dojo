/*
 * FirstReadView — the presenter-driven five-act First Read rail. Sibling to
 * ClientStoryView, same shell/palette. Mounted at /first-read/:companyId
 * (admin-gated). Presenter drives on their machine and screen-shares; the client
 * never logs in.
 *
 * Reuse law: the story-surface acts mount UNCHANGED. They read
 * useCompany().activeCompany for scoping, so this view points the active company
 * at the route's :companyId and waits until it matches before rendering them —
 * no edits to their internals or their signed copy.
 */

import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useCompany } from "@/hooks/useCompany";
import { usePublicBaseline } from "@/hooks/usePublicBaseline";
import { CLIENT_STORY_THEME_KEY, type ClientStoryTheme } from "@/lib/clientStoryView";
import StandardsShell from "@/components/client-view/story/standards/StandardsShell";
import FrontDoorMapAct from "@/components/client-view/story/standards/FrontDoorMapAct";
import OutsideHeroAct from "@/components/client-view/story/OutsideHeroAct";
import OutsideFindingsAct from "@/components/client-view/story/OutsideFindingsAct";
import MovementShell from "@/components/client-view/story/movement/MovementShell";
import MarketAct from "@/components/client-view/story/movement/MarketAct";
import PositionAct from "@/components/client-view/story/movement/PositionAct";
import OutsideNextMoveAct from "@/components/client-view/story/OutsideNextMoveAct";
import GapAct from "@/components/client-view/story/GapAct";
import TheCheckAct from "@/components/client-view/story/check/TheCheckAct";
import "@/styles/client-story.css";

// ── Act framing — the meeting-script rail. Client-visible; PENDING OPERATOR
//    SIGNATURE (Gate 3). One eyebrow (act name) + one framing sentence each.
const ACTS = [
  { key: "standard", name: "The Standard", line: "Every industry has a standard shape — here's yours, before we look at you." },
  { key: "mirror", name: "The Mirror", line: "What the outside record shows about you — reached without a single document from you." },
  { key: "check", name: "The Check", line: "Now you tell us where we're right, where we're close, and where we're wrong." },
  { key: "gap", name: "The Gap", line: "Where the outside read runs out — the questions only you can answer." },
  { key: "proposal", name: "The Proposal", line: "Where this goes next." },
] as const;

function readStoredTheme(): ClientStoryTheme {
  if (typeof window === "undefined") return "dark";
  try {
    const raw = window.localStorage.getItem(CLIENT_STORY_THEME_KEY);
    if (raw === "dark" || raw === "light") return raw;
  } catch {
    /* ignore */
  }
  return "dark";
}

export default function FirstReadView() {
  const { companyId } = useParams();
  const navigate = useNavigate();
  const { activeCompany, setActiveCompanyId } = useCompany();
  const [theme, setTheme] = useState<ClientStoryTheme>(readStoredTheme);
  const [step, setStep] = useState(0);

  // Point the reused acts at this route's company.
  useEffect(() => {
    if (companyId && activeCompany?.id !== companyId) setActiveCompanyId(companyId);
  }, [companyId, activeCompany?.id, setActiveCompanyId]);

  useEffect(() => {
    try {
      window.localStorage.setItem(CLIENT_STORY_THEME_KEY, theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  const { preferredRun } = usePublicBaseline(companyId);

  const go = useCallback((delta: number) => {
    setStep((s) => Math.min(ACTS.length - 1, Math.max(0, s + delta)));
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "auto" });
  }, []);

  // Keyboard arrows (nice-to-have).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  const ready = !!companyId && activeCompany?.id === companyId;
  const act = ACTS[step];

  const renderAct = () => {
    switch (act.key) {
      case "standard":
        return (
          <StandardsShell>
            <FrontDoorMapAct />
          </StandardsShell>
        );
      case "mirror":
        return (
          <>
            <OutsideHeroAct preferredRun={preferredRun} />
            <OutsideFindingsAct preferredRun={preferredRun} />
            <MovementShell>
              <MarketAct />
              <PositionAct />
            </MovementShell>
          </>
        );
      case "check":
        return <TheCheckAct companyId={companyId!} />;
      case "gap":
        return <GapAct preferredRun={preferredRun} />;
      case "proposal":
        return (
          <>
            <OutsideNextMoveAct onStartDiagnose={() => navigate("/diagnosis")} />
            <p className="cvs-fr-devnote">
              ⚠ Dev note (not shown to clients): the generated one-screen proposal renders here at
              Gate 4. This act currently closes on the Start Diagnose control only.
            </p>
          </>
        );
      default:
        return null;
    }
  };

  return (
    <div className="cvs-story" data-mm-theme={theme}>
      <header className="cvs-rail">
        <div className="cvs-rail-inner">
          <div className="cvs-rail-left">
            <p className="cvs-rail-kicker">First Read{activeCompany?.name ? ` · ${activeCompany.name}` : ""}</p>
            <nav className="cvs-rail-phases" aria-label="First Read acts">
              {ACTS.map((a, i) => (
                <button
                  key={a.key}
                  type="button"
                  className={`cvs-phase ${i === step ? "is-active" : ""}`}
                  aria-current={i === step ? "page" : undefined}
                  onClick={() => setStep(i)}
                >
                  {a.name}
                </button>
              ))}
            </nav>
          </div>
          <div className="cvs-rail-controls">
            <span className="cvs-buildchip">Presenter rail</span>
            <div className="cvs-toggle" role="group" aria-label="Theme">
              <button type="button" className={`cvs-toggle-btn ${theme === "dark" ? "is-active" : ""}`} onClick={() => setTheme("dark")}>
                Dark
              </button>
              <button type="button" className={`cvs-toggle-btn ${theme === "light" ? "is-active" : ""}`} onClick={() => setTheme("light")}>
                Light
              </button>
            </div>
          </div>
        </div>
      </header>

      <main>
        <div className="cvs-fr-actframe">
          <p className="cvs-fr-actcount">Act {step + 1} / {ACTS.length}</p>
          <p className="cvs-act-eyebrow">{act.name}</p>
          <p className="cvs-support cvs-fr-actline">{act.line}</p>
        </div>

        {ready ? renderAct() : <p className="cvs-support">Loading company…</p>}

        <div className="cvs-fr-nav">
          <button type="button" className="cvs-pill-ghost" disabled={step === 0} onClick={() => go(-1)}>
            ← Back
          </button>
          <span className="cvs-fr-nav-count">{step + 1} / {ACTS.length}</span>
          <button type="button" className="cvs-pill-primary" disabled={step === ACTS.length - 1} onClick={() => go(1)}>
            Next →
          </button>
        </div>
      </main>
    </div>
  );
}
