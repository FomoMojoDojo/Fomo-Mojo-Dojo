// First Read — 11-page client-facing surface, company-parameterized.
// Shell ported from mojomap-redesign src/pages/first-read/FirstReadPage.tsx
// @ 1f54a56 (client-facing header, ticks under identity line, quiet footer
// nav, keyboard). Data comes from useFirstReadPreviewData — real queries
// only; no fixture data is reachable from this route.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import "./firstRead.css";
import { useFirstReadPreviewData } from "./useFirstReadPreviewData";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { OperatorControlsContext, type OperatorControls, type OperatorDecision } from "./operatorControls";
import { OPERATOR_STRINGS } from "./operatorStrings";
import { decideRelevance, overrideFailureMessage } from "./relevanceOverrideAction";
import { useFirstReadOpenQuestions } from "@/hooks/useFirstReadOpenQuestions";
import { bareHost } from "./mapping";
import {
  ActArc,
  ActFindings,
  ActGap,
  ActNext,
  // ActOurRead — "Where this points" split into ActPromise / ActPositioning / ActStrategy (flow
  // restructure 2026-09-02); component kept in ./acts (dark), like ActWhereYouStand.
  ActPromise,
  ActPositioning,
  ActStrategy,
  ActSiesta1,
  ActSiesta2,
  ActQuestions,
  ActRecord,
  ActWhatYouSay,
  // ActWhereYouStand — component kept in ./acts (still exported/tested); "Where you stand"
  // is currently hidden (not listed in BEATS). To restore: re-add the import, the BEATS
  // entry, and the switch case below.
  ActWhatYouOffer,
  ActWhoYouServe,
  BaseGate,
  ColdOpen,
  ScoreReveal,
} from "./acts";

/**
 * Page order (reorder sweep 2026-08-24): cold → what the world sees and says → what you say
 * → the gap → what stands out → the Base (four-commitments frame, moved up) → who you serve →
 * where this points (positioning/strategy/promise) → MOJO SCORE (always mounted, product law) →
 * questions → next move. "Where you stand" is hidden (component ActWhereYouStand kept in ./acts,
 * simply not listed here, so it is restorable by re-adding one entry). Navigation is arrow keys
 * (←/→) plus Home/End only — there is no number-key jump. The `act` field now only styles the nav
 * tick (act vs gate) — it no longer drives any keyboard shortcut.
 */
// Flow restructure (operator-ruled 2026-09-02): PROMISE-FIRST unpacking arc — each page reveals what is
// behind the one before (the reverse of derivation order). "Where this points" splits into three pages
// (promise → positioning → strategy). Two siesta interludes (siesta1 after findings, siesta2 after base).
// "What you offer" moves AFTER siesta2 (downstream of the base by law). "Where you stand" stays dark.
// Siesta/promise/positioning/strategy labels are operator-signed (2026-09-02). The siesta "A moment"
// labels only surface in the nav/forward-link, which is hidden behind FIRST_READ_SHOW_NAV_CHROME.
// D2 (operator 2026-09-02): the operator drives the presentation by keyboard, so the footer chrome
// (Back / forward-link / Reference / Keys hint) is HIDDEN behind this flag. Keyboard nav (←/→/Home/End)
// and the progress ticks stay. A client-facing build flips this true — the components are never deleted.
const FIRST_READ_SHOW_NAV_CHROME = false;

export const BEATS = [
  { key: "arc", label: "Before we start", act: undefined },
  { key: "cold", label: "The first thing we saw.", act: undefined },
  { key: "record", label: "What the world sees and says", act: 1 },
  { key: "yousay", label: "What you say", act: 2 },
  { key: "gap", label: "The gap", act: 3 },
  { key: "findings", label: "What stands out", act: 4 },
  { key: "siesta1", label: "A moment", act: undefined },
  { key: "promise", label: "Your promise", act: undefined },
  { key: "positioning", label: "Your positioning", act: undefined },
  { key: "strategy", label: "Your strategy", act: undefined },
  { key: "serve", label: "Who you serve", act: 5 },
  { key: "base", label: "Your Base", act: undefined },
  { key: "siesta2", label: "A moment", act: undefined },
  { key: "offer", label: "What you offer", act: 5 },
  { key: "score", label: "Mojo Score", act: undefined },
  { key: "questions", label: "Questions", act: undefined },
  { key: "next", label: "Next move", act: undefined },
] as const;

/** react-query is present under the app router; a bare test mount has no client — invalidation is then a no-op. */
function useOptionalQueryClient() {
  try {
    return useQueryClient();
  } catch {
    return null;
  }
}

export default function FirstReadPreviewView() {
  const { companyId } = useParams<{ companyId: string }>();
  // OPERATOR OVERRIDE (stage 3, 2026-09-03): the preview re-reads after a decision (refreshKey — this
  // hook is plain state, not react-query) and invalidates the react-query readers of claim_deltas so no
  // surface holds a stale verdict. This view is the ONLY provider of OperatorControlsContext: it mounts
  // solely under the admin preview route, so client views structurally never render the controls.
  const [refreshKey, setRefreshKey] = useState(0);
  const { data: baseData, loading, error } = useFirstReadPreviewData(companyId, refreshKey);
  const queryClient = useOptionalQueryClient();
  // RULE (a) (operator ruling 2026-09-03): this preview is the surface shown on screen in client meetings,
  // so the operator affordance is OFF by default and lives in component state ONLY — no localStorage,
  // no sessionStorage, no URL param. A hard reload lands on the client render. When on, the context is
  // provided and every operator node (controls, provenance tags, struck-pairs blocks) renders; when off
  // the context is null and the preview is byte-identical to the client render.
  const [operatorOn, setOperatorOn] = useState(false);
  const operatorControls = useMemo<OperatorControls | null>(() => {
    if (!companyId || !operatorOn) return null;
    return {
      decide: async ({ pair, verdict, reason }: OperatorDecision) => {
        // A withdrawal also awaits refresh-relevance-step (decideRelevance) so this refresh shows the machine verdict.
        const res = await decideRelevance(supabase, supabase.functions, { companyId, contentIdentity: pair.contentIdentity, verdict, reason });
        const failure = overrideFailureMessage(res);
        if (failure) throw new Error(failure);
        await queryClient?.invalidateQueries({ queryKey: ["strategic-delta", companyId] });
        setRefreshKey((k) => k + 1);
      },
    };
  }, [companyId, queryClient, operatorOn]);
  // Questions come from the ONE open-question authority — it applies
  // the outside-only provenance gate (doc-derived questions never render).
  const { questions } = useFirstReadOpenQuestions(companyId);
  // The offering payload's open_questions route to the Questions beat via the SAME open-question
  // list (the existing mechanic) — appended after the DB-authority questions, never rendered as
  // verdicts on the offer beat itself.
  const data = useMemo(
    () => ({ ...baseData, questions: [...questions, ...(baseData.offeringOpenQuestions ?? [])] }),
    [baseData, questions],
  );
  const [index, setIndex] = useState(0);

  const go = useCallback((next: number) => {
    setIndex((current) => {
      const clamped = Math.min(Math.max(next, 0), BEATS.length - 1);
      if (clamped !== current) window.scrollTo({ top: 0, behavior: "smooth" });
      return clamped;
    });
  }, []);

  // Company switch resets to the cold open.
  useEffect(() => {
    setIndex(0);
  }, [companyId]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.isContentEditable ||
          ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
      ) {
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      // Leave Enter/Space to focused controls (expander, ticks, links).
      if (
        (event.key === " " || event.key === "Enter") &&
        target &&
        target.closest("button, a, [role='button']")
      ) {
        return;
      }

      switch (event.key) {
        case "ArrowRight":
        case "PageDown":
          event.preventDefault();
          go(index + 1);
          break;
        case "ArrowLeft":
        case "PageUp":
          event.preventDefault();
          go(index - 1);
          break;
        case " ":
        case "Enter":
          event.preventDefault();
          go(index + 1);
          break;
        case "Home":
          event.preventDefault();
          go(0);
          break;
        case "End":
          event.preventDefault();
          go(BEATS.length - 1);
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, index]);

  const body = useMemo(() => {
    const beatKey: string = BEATS[index].key;
    switch (beatKey) {
      case "arc":
        // New opener (2026): the "you are here" process arc — a four-stage engagement spine (in ActArc).
        // Continue advances relative to position (go(index+1) = cold), so no future insertion re-breaks
        // the hand-off. Structure only — no findings/signal/verdict content.
        return <ActArc onContinue={() => go(index + 1)} />;
      case "cold":
        // FIX 1: relative advancement (was hardcoded go(1), which self-looped once the arc took index 0).
        return <ColdOpen read={data} onContinue={() => go(index + 1)} />;
      case "record":
        return <ActRecord read={data} />;
      case "yousay":
        return <ActWhatYouSay read={data} />;
      case "gap":
        return <ActGap read={data} />;
      case "serve":
        return <ActWhoYouServe read={data} />;
      case "offer":
        return <ActWhatYouOffer read={data} />;
      case "findings":
        return <ActFindings read={data} />;
      case "score":
        return <ScoreReveal read={data} />;
      // case "where": return <ActWhereYouStand read={data} />;  // hidden — restore with BEATS entry + import
      case "siesta1":
        return <ActSiesta1 />;
      case "promise":
        return <ActPromise read={data} />;
      case "positioning":
        return <ActPositioning read={data} />;
      case "strategy":
        return <ActStrategy read={data} />;
      case "base":
        return <BaseGate />;
      case "siesta2":
        return <ActSiesta2 />;
      case "questions":
        return <ActQuestions read={data} />;
      case "next":
        return <ActNext isLast={index === BEATS.length - 1} />;
      default:
        // Every BEATS key MUST have an explicit case above — the closer ("next") is never the fallback.
        // A missing case is a structural bug (a new beat that would otherwise render as the closer
        // mid-flow); throw so the guard catches it rather than silently showing "Next move".
        throw new Error(`FirstReadPreviewView: no body case for beat key "${beatKey}"`);
    }
  }, [data, go, index]);

  const beat = BEATS[index];
  const isCold = beat.key === "cold";
  const isSiesta = beat.key === "siesta1" || beat.key === "siesta2";
  const host = bareHost(data.company?.website);
  const identity = data.company
    ? `${data.company.name}${host ? ` · ${host}` : ""}`
    : companyId ?? "";

  if (loading) {
    return (
      <div className="first-read">
        <div className="first-read-shell">
          <p className="fr-eyebrow">Loading the read…</p>
        </div>
      </div>
    );
  }

  if (error || !data.company) {
    return (
      <div className="first-read">
        <div className="first-read-shell">
          <p className="fr-eyebrow">First read</p>
          <p className="mt-4 text-sm font-light" style={{ color: "hsl(var(--fr-muted))" }}>
            {error ?? "Company not found."}
          </p>
        </div>
      </div>
    );
  }

  return (
    // D1: a siesta is visibly a break — full-page accent ground (--fr-accent), white type. The break
    // class scopes the inversion of the header + progress ticks so they stay legible (never global).
    <OperatorControlsContext.Provider value={operatorControls}>
    <div className={`first-read${isSiesta ? " fr-siesta" : ""}`}>
      <div className="first-read-shell">
        {!isCold ? (
          <nav className="mb-16 flex flex-col gap-4">
            <div className="flex flex-col">
              <span className="fr-eyebrow mb-1">First read</span>
              <span className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: "hsl(var(--fr-muted))" }}>
                {identity}
              </span>
            </div>
            <div className="flex gap-1.5">
              {BEATS.map((b, i) => (
                <button
                  key={b.key}
                  type="button"
                  aria-label={b.label}
                  onClick={() => go(i)}
                  className="fr-progress-tick"
                  data-kind={b.act !== undefined ? "act" : "gate"}
                  data-state={i === index ? "current" : i < index ? "done" : "todo"}
                />
              ))}
            </div>
          </nav>
        ) : null}

        <div key={beat.key} className="fr-act-enter">
          {/* The closer renders its own eyebrow ("Before you go") inside ActNext, so suppress the
              auto-eyebrow here — BEATS["next"].label stays "Next move" for the nav tick + forward link. */}
          {!isCold && beat.key !== "next" && beat.key !== "siesta1" && beat.key !== "siesta2" ? <p className="fr-eyebrow mb-4">{beat.label}</p> : null}
          {body}
        </div>

        {FIRST_READ_SHOW_NAV_CHROME && !isCold ? (
          <footer className="mt-16 flex items-center justify-between">
            <button
              type="button"
              onClick={() => go(index - 1)}
              className="fr-link-muted group flex items-center gap-3 text-xs font-bold uppercase tracking-[0.2em] transition-colors"
            >
              <span className="text-lg leading-none transition-transform group-hover:-translate-x-1">&larr;</span> Back
            </button>
            <div className="flex items-center gap-12">
              <div className="hidden flex-col items-end md:flex">
                <span className="fr-eyebrow mb-1">Reference</span>
                <span className="text-[10px] font-bold">
                  FIRST_READ · {(data.company.name || "").toUpperCase()}
                </span>
              </div>
              {index < BEATS.length - 1 ? (
                <button
                  type="button"
                  onClick={() => go(index + 1)}
                  className="fr-link-ink group flex items-center gap-3 text-xs font-bold uppercase tracking-[0.2em] transition-colors"
                >
                  {BEATS[index + 1].label}{" "}
                  <span className="text-lg leading-none transition-transform group-hover:translate-x-1">&rarr;</span>
                </button>
              ) : null}
            </div>
          </footer>
        ) : null}

        {FIRST_READ_SHOW_NAV_CHROME && !isCold ? (
          <p className="mt-8 text-center text-[10px] font-semibold uppercase tracking-[0.2em]" style={{ color: "hsl(var(--fr-faint))" }}>
            Keys: &larr; &rarr; move · Home / End ends
          </p>
        ) : null}
      </div>
      {/* Operator switch (rule (a), edited 2026-09-03): the operator's own affordance, not a client element —
          fixed bottom-left, glyph only (circle-with-dot), muted while off, full while on. No text node; the
          aria strings are the only strings. State only — never persisted. */}
      <button
        type="button"
        className="fixed bottom-6 left-6 flex h-8 w-8 items-center justify-center transition-opacity"
        style={{ color: "hsl(var(--fr-muted))", opacity: operatorOn ? 1 : 0.35 }}
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
    </OperatorControlsContext.Provider>
  );
}
