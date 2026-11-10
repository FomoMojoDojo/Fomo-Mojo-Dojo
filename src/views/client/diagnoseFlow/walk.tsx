// DIAGNOSE · WALK CHROME (spec "Walk chrome"). NO STRING LITERALS — every word is a prop.
//
// PAGE STATE, NO WRITES (rulings P2/P3). Keep/Fix, the none-yet press, added lines and the composer
// all live in one reducer held by DiagnoseFlowView. Nothing is persisted: no table, no localStorage,
// no mutation. Reloading loses it, which is the intent — slice 1 is read-only and the confirmation
// store is P6.
import { createContext, useContext, useMemo, useReducer, useState, type ReactNode } from "react";
import { SHARED, WALK } from "./strings";

// ── page state ───────────────────────────────────────────────────────────────────────────────────

export type ScreenState = {
  readonly decisions: Readonly<Record<string, "keep" | "fix">>;
  readonly noneYet: boolean;
  readonly added: readonly string[];
  /** null = the composer is in Add mode; a number = Fix mode on that 1-based item index. */
  readonly fixing: number | null;
};

const EMPTY: ScreenState = { decisions: {}, noneYet: false, added: [], fixing: null };

type Action =
  | { type: "decide"; screen: string; id: string; decision: "keep" | "fix" }
  | { type: "noneYet"; screen: string }
  | { type: "add"; screen: string; text: string }
  | { type: "fix"; screen: string; index: number }
  | { type: "cancelFix"; screen: string };

type AllState = Readonly<Record<string, ScreenState>>;

function reduceScreen(s: ScreenState, action: Action): ScreenState {
  switch (action.type) {
    case "decide":
      return { ...s, decisions: { ...s.decisions, [action.id]: action.decision } };
    case "noneYet":
      return { ...s, noneYet: !s.noneYet };
    case "add":
      return { ...s, added: [...s.added, action.text], fixing: null };
    case "fix":
      return { ...s, fixing: action.index };
    case "cancelFix":
      return { ...s, fixing: null };
  }
}

function reducer(all: AllState, action: Action): AllState {
  const current = all[action.screen] ?? EMPTY;
  return { ...all, [action.screen]: reduceScreen(current, action) };
}

type PageStateApi = {
  readonly get: (screen: string) => ScreenState;
  readonly decide: (screen: string, id: string, decision: "keep" | "fix") => void;
  readonly toggleNoneYet: (screen: string) => void;
  readonly add: (screen: string, text: string) => void;
  readonly startFix: (screen: string, index: number) => void;
  readonly cancelFix: (screen: string) => void;
};

const PageStateContext = createContext<PageStateApi | null>(null);

export function PageStateProvider({ children }: { children: ReactNode }) {
  const [all, dispatch] = useReducer(reducer, {} as AllState);
  const api = useMemo<PageStateApi>(() => ({
    get: (screen) => all[screen] ?? EMPTY,
    decide: (screen, id, decision) => dispatch({ type: "decide", screen, id, decision }),
    toggleNoneYet: (screen) => dispatch({ type: "noneYet", screen }),
    add: (screen, text) => dispatch({ type: "add", screen, text }),
    startFix: (screen, index) => dispatch({ type: "fix", screen, index }),
    cancelFix: (screen) => dispatch({ type: "cancelFix", screen }),
  }), [all]);
  return <PageStateContext.Provider value={api}>{children}</PageStateContext.Provider>;
}

export function usePageState(screen: string) {
  const api = useContext(PageStateContext);
  if (!api) throw new Error("usePageState outside PageStateProvider");
  return useMemo(() => ({
    state: api.get(screen),
    decide: (id: string, decision: "keep" | "fix") => api.decide(screen, id, decision),
    toggleNoneYet: () => api.toggleNoneYet(screen),
    add: (text: string) => api.add(screen, text),
    startFix: (index: number) => api.startFix(screen, index),
    cancelFix: () => api.cancelFix(screen),
  }), [api, screen]);
}

// ── chrome ───────────────────────────────────────────────────────────────────────────────────────

export function Breadcrumb({ company, phase }: { company: string; phase: string }) {
  return (
    <div className="dg-crumb">
      <span className="dg-crumb-brand">{SHARED.brand}</span>
      <span className="dg-crumb-sep">/</span>
      <span className="dg-crumb-name">{company}</span>
      <span className="dg-phase">{phase}</span>
    </div>
  );
}

/** THE SCORE BLOCK — far right, full bar height, square (SCORE RULE / P13).
 *  Today's computed number ONLY: no 34/52 text, no track, no marks, and never a hand-set figure.
 *  A company with no score shows no number rather than a zero. */
export function ScoreBlock({ score, app = false }: { score: number | null; app?: boolean }) {
  return (
    <div className={`dg-score${app ? " dg-score--app" : ""}`} data-dg-score>
      <span className="dg-mono">{SHARED.scoreLabel}</span>
      {score === null ? null : (
        <span className="dg-score-row">
          <span className="dg-dot" />
          <span className="dg-score-value">{score}</span>
        </span>
      )}
    </div>
  );
}

export function ProgressSegments({ index, total }: { index: number; total: number }) {
  return (
    <>
      <div className="dg-segments" role="list">
        {Array.from({ length: total }, (_, i) => (
          <span
            key={i}
            role="listitem"
            className="dg-segment"
            data-state={i === index ? "current" : i < index ? "done" : "todo"}
          />
        ))}
      </div>
      <span className="dg-mono">{WALK.counter(index + 1, total)}</span>
    </>
  );
}

/** The composer + none-yet, bottom-bar left. In Fix mode it carries the mono "Fixing item n" label,
 *  a Cancel link, and its button reads Save. */
export function Composer({
  placeholder,
  noneYetLabel,
  screen,
}: {
  placeholder: string;
  noneYetLabel: string;
  screen: string;
}) {
  const page = usePageState(screen);
  const [draft, setDraft] = useState("");
  const fixing = page.state.fixing;
  const submit = () => {
    if (draft.trim().length === 0) return;
    page.add(draft.trim());
    setDraft("");
  };
  return (
    <div className="dg-bottom-left">
      {fixing === null ? null : (
        <span className="dg-mono">{WALK.fixingItem(fixing)}</span>
      )}
      <div className="dg-composer">
        <span className="dg-composer-field">
          <input
            className="dg-composer-input"
            type="text"
            placeholder={placeholder}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } }}
          />
          <button type="button" className="dg-next" onClick={submit}>
            {fixing === null ? WALK.add : WALK.save}
          </button>
        </span>
        {fixing === null ? (
          <button
            type="button"
            className="dg-noneyet"
            aria-pressed={page.state.noneYet}
            onClick={page.toggleNoneYet}
          >
            {page.state.noneYet ? `✓ ${noneYetLabel}` : noneYetLabel}
          </button>
        ) : (
          <button type="button" className="dg-ghost" onClick={page.cancelFix}>{WALK.cancel}</button>
        )}
      </div>
      <span className="dg-small">{WALK.blankIsAnAnswer}</span>
    </div>
  );
}

/** THE WALK SHELL: header (breadcrumb · segments · Back · Next), hero, two columns, bottom bar. */
export function WalkScreen({
  company,
  tone,
  index,
  total,
  eyebrow,
  headline,
  lede,
  sourceLabel,
  sourceText,
  patternLabel,
  pattern,
  exampleLabel,
  example,
  onTheMapLabel,
  countLine,
  backLabel,
  onBack,
  nextLabel,
  onNext,
  composerPlaceholder,
  noneYetLabel,
  screen,
  score,
  children,
  extra,
}: {
  company: string;
  tone: "base" | "goal" | "market";
  index: number;
  total: number;
  eyebrow: string;
  headline: ReactNode;
  lede?: string;
  sourceLabel: string;
  sourceText: string;
  patternLabel: string;
  pattern: string;
  exampleLabel: string;
  example: string;
  onTheMapLabel: string;
  countLine?: string | null;
  backLabel: string;
  onBack: () => void;
  nextLabel: string;
  onNext: () => void;
  composerPlaceholder: string;
  noneYetLabel: string;
  screen: string;
  score: number | null;
  children: ReactNode;
  extra?: ReactNode;
}) {
  return (
    <div className="dg-page" data-dg-tone={tone} data-dg-screen={screen}>
      <header className="dg-header">
        <Breadcrumb company={company} phase={SHARED.phaseVisit} />
        <div className="dg-header-right">
          <ProgressSegments index={index} total={total} />
          <button type="button" className="dg-ghost" onClick={onBack}>{backLabel}</button>
          <button type="button" className="dg-next dg-pill" onClick={onNext}>{nextLabel}</button>
        </div>
      </header>

      <div className="dg-walk dg-enter">
        <div className="dg-walk-hero">
          <span className="dg-mono">{eyebrow}</span>
          <h1 className="dg-h">{headline}</h1>
          {lede ? <p className="dg-lede">{lede}</p> : null}
        </div>

        <aside className="dg-walk-left">
          <div className="dg-walk-group">
            <span className="dg-mono">{sourceLabel}</span>
            <p className="dg-small">{sourceText}</p>
          </div>
          <div className="dg-walk-group">
            <span className="dg-mono">{patternLabel}</span>
            <p className="dg-pattern">{pattern}</p>
            <p className="dg-small">{exampleLabel} {example}</p>
          </div>
        </aside>

        <section className="dg-walk-right">
          <span className="dg-mono">{onTheMapLabel}</span>
          {countLine ? <span className="dg-small">{countLine}</span> : null}
          <div className="dg-rows">{children}</div>
          {extra}
        </section>
      </div>

      <footer className="dg-bottom">
        <Composer placeholder={composerPlaceholder} noneYetLabel={noneYetLabel} screen={screen} />
        <ScoreBlock score={score} />
      </footer>
    </div>
  );
}

/** The hero's final stop in dot green (spec). Split at the last `.` or `?`. */
export function Headline({ text }: { text: string }) {
  const last = text.length > 0 ? text[text.length - 1] : "";
  if (last !== "." && last !== "?") return <>{text}</>;
  return (
    <>
      {text.slice(0, -1)}
      <span className="dg-h-stop">{last}</span>
    </>
  );
}
