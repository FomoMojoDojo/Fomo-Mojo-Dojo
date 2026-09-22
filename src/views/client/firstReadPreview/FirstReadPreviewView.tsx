// First Read — 11-page client-facing surface, company-parameterized.
// Shell ported from mojomap-redesign src/pages/first-read/FirstReadPage.tsx
// @ 1f54a56 (client-facing header, ticks under identity line, quiet footer
// nav, keyboard). Data comes from useFirstReadPreviewData — real queries
// only; no fixture data is reachable from this route.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import "./firstRead.css";
import { useFirstReadPreviewData } from "./useFirstReadPreviewData";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { OperatorControlsContext, type OperatorControls, type OperatorDecision } from "./operatorControls";
import { OPERATOR_MARK, OPERATOR_STRINGS } from "./operatorStrings";
import { decideRelevance, overrideFailureMessage } from "./relevanceOverrideAction";
// Stage 2 (visual port): shell chrome — sticky Header (title / identity / segments / counter) + bottom Nav.
import { Header, Nav } from "./shell";
import { useFirstReadOpenQuestions } from "@/hooks/useFirstReadOpenQuestions";
import { MarksProvider, prefersReducedMotion, type MarksSurface } from "@/lib/firstReadMarks/MarksContext";
import { useFirstReadMarks } from "@/lib/firstReadMarks/useFirstReadMarks";
import { HEARD_BEAT_KEY, WhatWeHeard } from "@/lib/firstReadMarks/WhatWeHeard";
import { offeringQuestionKeys } from "@/lib/firstReadMarks/anchors";
import { beatsFor } from "./beats";
import { bareHost } from "./mapping";
import { CLIENT_REFINE_PREVIEW_ROUTE, FIRSTREAD_MARK_PARAM } from "@/lib/clientRefinePreview";
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
import { Spread } from "./primitives-editorial";

/**
 * Page order (reorder sweep 2026-08-24): cold → what the world sees and says → what you say
 * → the gap → what stands out → the Base (four-commitments frame, moved up) → who you serve →
 * where this points (positioning/strategy/promise) → MOJO SCORE (always mounted, product law) →
 * questions → next move. "Where you stand" is hidden (component ActWhereYouStand kept in ./acts,
 * simply not listed here, so it is restorable by re-adding one entry). Navigation is arrow keys
 * (←/→) plus Home/End only — there is no number-key jump. The `act` field now only styles the nav
 * tick (act vs gate) — it no longer drives any keyboard shortcut.
 */
// D2 (operator 2026-09-02): the operator drives the presentation by keyboard, so the footer chrome
// (Back / forward-link / Reference / Keys hint) is HIDDEN behind this flag. Keyboard nav (←/→/Home/End)
// and the progress ticks stay. A client-facing build flips this true — the components are never deleted.
const FIRST_READ_SHOW_NAV_CHROME = false;

// The reading order and "What we heard"'s place in it now live in ./beats (marks commit 3, 2026-09-22) —
// pure data, so the workspace list can read a beat's own nav label without importing this view. Re-exported
// here unchanged: every spec that pins the order through this module keeps working.
export { BEATS, HEARD_BEAT, beatsFor, beatLabel, type Beat } from "./beats";

/** Beats that render their own eyebrow inside the body (the closer's "Before you go", the siestas'
 *  none, and — stages 2–3 — the Screen/Spread beats, which take the nav label as a prop). The view's
 *  generic auto-eyebrow renders only for the remaining beats (promise / positioning / strategy). */
const EYEBROW_IN_BODY: ReadonlySet<string> = new Set([
  "arc", "next", "siesta1", "siesta2",
  "record", "yousay", "gap", "findings", "serve", "base", "offer", "score", "questions", HEARD_BEAT_KEY,
  // Stage 3b: the dark Screens use their own PROMISE_TITLE / POSITIONING_TITLE / STRATEGY_TITLE (the
  // same words as the nav label) as the eyebrow — so the label renders once, not twice.
  "promise", "positioning", "strategy",
]);

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
  // Marks (commit 2): this view is the ONLY provider of MarksContext — the affordance exists on this route alone.
  const marksStore = useFirstReadMarks(companyId);
  const beats = useMemo(() => beatsFor(marksStore.marks.length > 0), [marksStore.marks.length]);
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
  const { questions, rows: questionRows } = useFirstReadOpenQuestions(companyId);
  // The offering payload's open_questions route to the Questions beat via the SAME open-question
  // list (the existing mechanic) — appended after the DB-authority questions, never rendered as
  // verdicts on the offer beat itself. Marks (FM15): the DB rows' question_identity rides beside them.
  // Marks: the offering questions key by a text hash (async) — filled here, absent until then (not markable meanwhile).
  const [offeringKeys, setOfferingKeys] = useState<string[] | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    const texts = baseData.offeringOpenQuestions ?? [];
    if (texts.length === 0) { setOfferingKeys(undefined); return; }
    offeringQuestionKeys(texts).then((keys) => { if (!cancelled) setOfferingKeys(keys); });
    return () => { cancelled = true; };
  }, [baseData.offeringOpenQuestions]);
  const data = useMemo(
    () => ({
      ...baseData,
      questions: [...questions, ...(baseData.offeringOpenQuestions ?? [])],
      questionAnchors: (questionRows ?? []).map((r) => ({ identity: String(r.question_identity ?? ""), text: r.question_text.trim() })),
      offeringQuestionKeys: offeringKeys,
    }),
    [baseData, questions, questionRows, offeringKeys],
  );
  const [index, setIndex] = useState(0);
  // Mark link-back (FM9, 2026-09-22): ?mark=<anchor id> from the workspace list. Read ONCE — the value is
  // captured at mount so a later beat change never re-jumps, and the param is left in the URL untouched
  // (this route holds no other param and nothing writes one). An id the company does not hold, or a read
  // that has not loaded yet, simply does nothing: the page opens on its first beat, with no node and no word.
  const [searchParams] = useSearchParams();
  const [requestedMark] = useState<string | null>(() => searchParams.get(FIRSTREAD_MARK_PARAM)?.trim() || null);
  const [markJumped, setMarkJumped] = useState(false);
  const [pendingMark, setPendingMark] = useState<{ beatKey: string; kind: string; key: string } | null>(null);

  const go = useCallback((next: number) => {
    setIndex((current) => {
      const clamped = Math.min(Math.max(next, 0), beats.length - 1);
      if (clamped !== current) window.scrollTo({ top: 0, behavior: "smooth" });
      return clamped;
    });
  }, [beats.length]); // marks: the beat list grows by one when "What we heard" is present

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
          go(beats.length - 1);
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, index, beats.length]);

  const body = useMemo(() => {
    const beatKey: string = beats[index].key;
    switch (beatKey) {
      case "arc":
        // New opener (2026): the "you are here" process arc — a four-stage engagement spine (in ActArc).
        // Continue advances relative to position (go(index+1) = cold), so no future insertion re-breaks
        // the hand-off. Structure only — no findings/signal/verdict content.
        // Stage 2: the beat's nav label is the opener's eyebrow (rendered inside its Screen; the
        // generic auto-eyebrow below skips "arc" so the string renders exactly once, as before).
        return <ActArc eyebrow={beats[index].label} onContinue={() => go(index + 1)} />;
      case "cold":
        // FIX 1: relative advancement (was hardcoded go(1), which self-looped once the arc took index 0).
        return <ColdOpen read={data} onContinue={() => go(index + 1)} />;
      // Stage 3: the nine Spread beats render their nav label as the sidebar eyebrow (the generic
      // auto-eyebrow below skips them, so the string renders exactly once, as before).
      case "record":
        return <ActRecord read={data} eyebrow={beats[index].label} />;
      case "yousay":
        return <ActWhatYouSay read={data} eyebrow={beats[index].label} />;
      case "gap":
        return <ActGap read={data} eyebrow={beats[index].label} />;
      case "serve":
        return <ActWhoYouServe read={data} eyebrow={beats[index].label} />;
      case "offer":
        return <ActWhatYouOffer read={data} eyebrow={beats[index].label} />;
      case "findings":
        return <ActFindings read={data} eyebrow={beats[index].label} />;
      case "score":
        return <ScoreReveal read={data} eyebrow={beats[index].label} />;
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
        return <BaseGate eyebrow={beats[index].label} read={data} />;
      case "siesta2":
        return <ActSiesta2 />;
      case "questions":
        return <ActQuestions read={data} eyebrow={beats[index].label} />;
      case "next":
        return <ActNext isLast={index === beats.length - 1} />;
      case HEARD_BEAT_KEY:
        return (
          <Spread eyebrow={beats[index].label}>
            <WhatWeHeard read={data} beats={beats} />
          </Spread>
        );
      default:
        // Every BEATS key MUST have an explicit case above — the closer ("next") is never the fallback.
        // A missing case is a structural bug (a new beat that would otherwise render as the closer
        // mid-flow); throw so the guard catches it rather than silently showing "Next move".
        throw new Error(`FirstReadPreviewView: no body case for beat key "${beatKey}"`);
    }
  }, [data, go, index, beats]);

  const beat = beats[index];
  const goToBeat = useCallback((key: string) => { const i = beats.findIndex((b) => b.key === key); if (i >= 0) go(i); }, [beats, go]);
  // The jump runs once, after the store has loaded: seed the beat through the same goToBeat the "What we
  // heard" links use, then — in a second pass, once that beat is the one on screen and its body has mounted —
  // bring the row itself into view. A row the beat does not render (commit 4 owns that case) simply leaves
  // the reader on the right beat.
  useEffect(() => {
    if (!requestedMark || markJumped || !marksStore.loaded) return;
    setMarkJumped(true);
    const mark = marksStore.byAnchor.get(requestedMark)?.[0];
    if (!mark) return; // not a live mark of this company — open normally, silently
    setPendingMark({ beatKey: mark.beat_key, kind: mark.anchor_kind, key: mark.anchor_key });
    goToBeat(mark.beat_key);
  }, [requestedMark, markJumped, marksStore.loaded, marksStore.byAnchor, goToBeat]);
  useEffect(() => {
    if (!pendingMark || beats[index]?.key !== pendingMark.beatKey) return;
    const q = (v: string) => v.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    const sel = `[data-fr-mark-kind="${q(pendingMark.kind)}"][data-fr-mark-key="${q(pendingMark.key)}"]`;
    const id = requestAnimationFrame(() => {
      const el = document.querySelector(sel) as HTMLElement | null;
      // jsdom has no scrollIntoView; the guard keeps the unit mounts silent.
      if (el && typeof el.scrollIntoView === "function") el.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "center" });
      setPendingMark(null);
    });
    return () => cancelAnimationFrame(id);
  }, [pendingMark, beats, index]);
  const marksSurface = useMemo<Omit<MarksSurface, "openId" | "setOpenId"> | null>(() => (companyId ? {
    companyId, marks: marksStore.marks, byAnchor: marksStore.byAnchor, frozen: marksStore.frozen, currentBeat: beat.key, goToBeat,
    create: marksStore.create, append: marksStore.append, withdraw: marksStore.withdraw,
  } : null), [companyId, marksStore.marks, marksStore.byAnchor, marksStore.frozen, marksStore.create, marksStore.append, marksStore.withdraw, beat.key, goToBeat]);
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
    <MarksProvider value={marksSurface}>
    <OperatorControlsContext.Provider value={operatorControls}>
    <div className={`first-read${isSiesta ? " fr-siesta" : ""}${beat.key === "siesta2" ? " fr-siesta--dark" : ""}${FIRST_READ_SHOW_NAV_CHROME ? " fr-has-nav" : ""}`}>
      {/* Stage 2 shell: the sticky header carries the same two strings the old in-body nav did
          ("First read" + identity) and the progress segments, on EVERY beat (the cold open included).
          The "NN / N" counter is new text, so it is gated with the nav chrome (off by default). */}
      <Header
        backLink={
          // The way out (2026-09-09, re-ruled): an OPERATOR affordance, not a client element. It is
          // gated on the same `operatorControls` value every other operator node is gated on — null
          // unless the glyph toggle is on — so the default render is still the client render, with
          // no operator node and no "All companies" text anywhere on the page.
          operatorControls ? (
            <Link
              to={CLIENT_REFINE_PREVIEW_ROUTE}
              className="fr-shell-link"
              data-testid="first-read-back"
              {...{ [OPERATOR_MARK.attr]: OPERATOR_MARK.allCompanies }}
            >
              {OPERATOR_STRINGS.allCompanies}
            </Link>
          ) : null
        }
        title="First read"
        identity={identity}
        beats={beats}
        index={index}
        onGo={go}
        showCounter={FIRST_READ_SHOW_NAV_CHROME}
      />
      <div className="first-read-shell">
        <div key={beat.key} className="fr-act-enter fr-beat">
          {/* The closer renders its own eyebrow ("Before you go") inside ActNext, and the opener
              renders its nav label inside its Screen (stage 2), so suppress the auto-eyebrow for both —
              BEATS["next"].label stays "Next move" for the nav tick + forward link. */}
          {!isCold && !EYEBROW_IN_BODY.has(beat.key) ? <p className="fr-eyebrow mb-4">{beat.label}</p> : null}
          {body}
        </div>

        {/* D2: the bottom Back / forward-link / Reference / Keys bar stays behind the flag. */}
        {FIRST_READ_SHOW_NAV_CHROME ? (
          <Nav
            beats={beats}
            index={index}
            onGo={go}
            referenceName={`FIRST_READ · ${(data.company.name || "").toUpperCase()}`}
          />
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
    </MarksProvider>
  );
}
