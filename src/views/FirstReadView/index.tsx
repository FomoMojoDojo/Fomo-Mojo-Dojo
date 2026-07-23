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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
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
import GapAct from "@/components/client-view/story/GapAct";
import TheCheckAct from "@/components/client-view/story/check/TheCheckAct";
import ProposalAct from "@/components/client-view/story/check/ProposalAct";
import ActUnderConstruction from "@/components/client-view/story/ActUnderConstruction";
import FirstReadNav from "./FirstReadNav";
import { FR_ACTS } from "@/lib/firstRead/acts";
import { createSessionEnsurer } from "@/lib/firstRead/lazyMint";
import "@/styles/client-story.css";

// FR-V2-1 — the rail's act sequence is the v2 five, single-sourced with the export
// (FR_ACTS). name = the client-facing title (OPERATOR-SIGNED 2026-07-23, in acts.ts).
const ACTS = FR_ACTS.map((a) => ({ key: a.key, name: a.title, line: a.line }));

// Terminal not-found copy — presenter-screen, OPERATOR-SIGNED 2026-07-23 (Gate 4).
const NOT_FOUND = "No company matches this link — it may have the wrong id, or the company was removed.";

// A generous backstop so the wait can never be infinite even if the company list
// never resolves. The real terminator is the list finishing load (see notFound);
// this only guards a pathological stall and never preempts a slow-but-valid load.
const RESOLVE_TIMEOUT_MS = 15000;

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
  const { activeCompany, setActiveCompanyId, companies, loading: companiesLoading } = useCompany();
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

  // The meeting's session — the most recent open|proposal_issued session for this
  // company. Owned here and shared by Act 3 (capture) and Act 5 (proposal), so
  // issuance in Act 5 flips Act 3 to its frozen state.
  const [sessionId, setSessionId] = useState<string>("");
  const resolveSession = useCallback(async () => {
    if (!companyId) return;
    const { data } = await supabase
      .from("first_read_sessions")
      .select("id")
      .eq("company_id", companyId)
      .in("status", ["open", "proposal_issued"])
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setSessionId((data as { id: string } | null)?.id ?? "");
  }, [companyId]);
  useEffect(() => {
    void resolveSession();
  }, [resolveSession]);

  // FR-V2-1 LAZY-MINT. No session is minted on load; the FIRST verdict tap mints the
  // open session, then records the verdict. createSessionEnsurer owns the single-flight
  // guarantee (rapid taps can never create a second session — no double-mint).
  const sessionIdRef = useRef(sessionId);
  useEffect(() => { sessionIdRef.current = sessionId; }, [sessionId]);
  const ensureSession = useMemo(
    () => createSessionEnsurer({
      supabase,
      companyId,
      getSessionId: () => sessionIdRef.current,
      setSessionId: (id) => { sessionIdRef.current = id; setSessionId(id); },
    }),
    [companyId],
  );

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

  // Bounded not-found. The company list always resolves (loading -> false on every
  // path); once it has, an id that isn't in it is dead. `waitElapsed` is a
  // defensive backstop only. A slow-but-valid resolve keeps companiesLoading true
  // and stays "Loading" — never a false not-found.
  const [waitElapsed, setWaitElapsed] = useState(false);
  useEffect(() => {
    setWaitElapsed(false);
    const t = setTimeout(() => setWaitElapsed(true), RESOLVE_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [companyId]);

  const ready = !!companyId && activeCompany?.id === companyId;
  const companyKnown = !!companyId && companies.some((c) => c.id === companyId);
  const notFound = !!companyId && !ready && ((!companiesLoading && !companyKnown) || waitElapsed);
  const act = ACTS[step];

  const renderAct = () => {
    switch (act.key) {
      // Acts 1–2: honest placeholders this gate (V2-2 / V2-3 build the content).
      case "say":
      case "why_outside":
        return <ActUnderConstruction />;
      // Act 3 — today's Mirror content, re-slotted.
      case "outside_shows":
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
      // Act 4 — today's Check, unchanged machinery; lazy-mint on first verdict.
      case "check":
        return (
          <TheCheckAct companyId={companyId!} sessionId={sessionId} ensureSession={ensureSession} />
        );
      // Act 5 — the job map (norm exhibit) + Gap + Proposal folded (restructure = V2-8/9).
      case "help":
        return (
          <>
            <StandardsShell>
              <FrontDoorMapAct />
            </StandardsShell>
            <GapAct preferredRun={preferredRun} />
            <ProposalAct
              companyId={companyId}
              sessionId={sessionId}
              onIssued={resolveSession}
              onStartDiagnose={() => navigate("/diagnosis")}
            />
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
            <p className="cvs-rail-kicker">First Read{!notFound && activeCompany?.name ? ` · ${activeCompany.name}` : ""}</p>
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

      {/* paddingBottom clears the fixed FirstReadNav bar so no content hides behind it. */}
      <main style={{ paddingBottom: 120 }}>
        <div className="cvs-fr-actframe">
          <p className="cvs-fr-actcount">Act {step + 1} / {ACTS.length}</p>
          <p className="cvs-act-eyebrow">{act.name}</p>
          <p className="cvs-support cvs-fr-actline">{act.line}</p>
        </div>

        {notFound ? (
          <p className="cvs-support cvs-fr-notfound">{NOT_FOUND}</p>
        ) : ready ? (
          renderAct()
        ) : (
          <p className="cvs-support">Loading company…</p>
        )}

        <FirstReadNav step={step} total={ACTS.length} onBack={() => go(-1)} onNext={() => go(1)} />
      </main>
    </div>
  );
}
