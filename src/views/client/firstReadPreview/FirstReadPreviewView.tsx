// First Read — 11-page client-facing surface, company-parameterized.
// Shell ported from mojomap-redesign src/pages/first-read/FirstReadPage.tsx
// @ 1f54a56 (client-facing header, ticks under identity line, quiet footer
// nav, keyboard). Data comes from useFirstReadPreviewData — real queries
// only; no fixture data is reachable from this route.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import "./firstRead.css";
import { useFirstReadPreviewData } from "./useFirstReadPreviewData";
import { useFirstReadOpenQuestions } from "@/hooks/useFirstReadOpenQuestions";
import { bareHost } from "./mapping";
import {
  ActArc,
  ActFindings,
  ActGap,
  ActNext,
  ActOurRead,
  ActQuestions,
  ActRecord,
  ActWhatYouSay,
  // ActWhereYouStand — component kept in ./acts (still exported/tested); "Where you stand"
  // is currently hidden (not listed in BEATS). To restore: re-add the import, the BEATS
  // entry, and the switch case below.
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
const BEATS = [
  { key: "arc", label: "Before we start", act: undefined },
  { key: "cold", label: "The first thing we saw.", act: undefined },
  { key: "record", label: "What the world sees and says", act: 1 },
  { key: "yousay", label: "What you say", act: 2 },
  { key: "gap", label: "The gap", act: 3 },
  { key: "findings", label: "What stands out", act: 4 },
  { key: "base", label: "Your Base", act: undefined },
  { key: "serve", label: "Who you serve", act: 5 },
  { key: "ourread", label: "Where this points", act: undefined },
  { key: "score", label: "Mojo Score", act: undefined },
  { key: "questions", label: "Questions", act: undefined },
  { key: "next", label: "Next move", act: undefined },
] as const;

export default function FirstReadPreviewView() {
  const { companyId } = useParams<{ companyId: string }>();
  const { data: baseData, loading, error } = useFirstReadPreviewData(companyId);
  // Questions come from the ONE open-question authority — it applies
  // the outside-only provenance gate (doc-derived questions never render).
  const { questions } = useFirstReadOpenQuestions(companyId);
  const data = useMemo(() => ({ ...baseData, questions }), [baseData, questions]);
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
    switch (BEATS[index].key) {
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
      case "findings":
        return <ActFindings read={data} />;
      case "score":
        return <ScoreReveal read={data} />;
      // case "where": return <ActWhereYouStand read={data} />;  // hidden — restore with BEATS entry + import
      case "ourread":
        return <ActOurRead read={data} />;
      case "base":
        return <BaseGate />;
      case "questions":
        return <ActQuestions read={data} />;
      default:
        return <ActNext isLast={index === BEATS.length - 1} />;
    }
  }, [data, go, index]);

  const beat = BEATS[index];
  const isCold = beat.key === "cold";
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
    <div className="first-read">
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
          {!isCold ? <p className="fr-eyebrow mb-4">{beat.label}</p> : null}
          {body}
        </div>

        {!isCold ? (
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

        {!isCold ? (
          <p className="mt-8 text-center text-[10px] font-semibold uppercase tracking-[0.2em]" style={{ color: "hsl(var(--fr-faint))" }}>
            Keys: &larr; &rarr; move · Home / End ends
          </p>
        ) : null}
      </div>
    </div>
  );
}
