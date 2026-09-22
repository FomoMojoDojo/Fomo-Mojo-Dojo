// First-read marks — the affordance (commit 2 of 4, 2026-09-22; fix pass FM5/FM17–FM21 the same day). LAW: the
// ONLY provider is FirstReadPreviewView on /preview/client-refine/first-read/<company>; every component here
// renders its children untouched — and NO [data-fr-mark] node — when the context is absent (client story,
// presenter rail, MarketAct, exports) or when the company is frozen. A markable row wraps itself in <MarkTarget>
// (FM17: pointer cursor + faint outline on hover, the class is on markable rows only); a click on the row opens
// the box, a click on anything that already has a behaviour (a link, a button, a listbox option, a folded-list
// control, the box itself) keeps that behaviour and never opens it.
// The box (FM21): on top the three reaction choices (Interesting · Important · Not important — single choice,
// nothing preselected, FM18) sharing ONE note field; under a thin divider "Stood out to us" with its own note
// field, shown when picked. A row takes one reaction and one "Stood out to us". Picking a choice is enough to
// save (FM5): the note is optional; typed text survives every choice switch for the life of the box. Closing —
// the x button (aria-label "Close"), Escape, a click outside (FM20) — SAVES what changed: a new mark through
// create_first_read_mark, an existing one through append_first_read_mark_note only when its note or disposition
// changed; nothing picked and nothing changed writes nothing. A failed save shows S6 and keeps the box and its
// text. While the box is open no key reaches the beat navigation (the box stops propagation). The box opens with
// a ~150 ms fade + slide unless the reader prefers reduced motion (then no motion at all).
// Match rule until commit 4: match and wording_changed both highlight the row; a mark whose row cannot be placed
// shows in "What we heard" (FM19 — never invisible).
import React, { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { hashAnchorText, type AnchorKind } from "./anchors";
import { MARK_STRINGS, REACTION_CHOICES } from "./strings";
import { anchorId, emptyToNull, type LiveMark, type MarkDisposition, type MarkKind, type MarkWrite } from "./useFirstReadMarks";

export const MARK_ATTR = "data-fr-mark";

export type MarksSurface = {
  companyId: string;
  marks: LiveMark[];
  byAnchor: Map<string, LiveMark[]>;
  frozen: boolean;
  /** The beat the page is on — every row's anchor records it. */
  currentBeat: string;
  /** Jump to a beat by key (the "What we heard" links). */
  goToBeat: (key: string) => void;
  create: (args: { beatKey: string; anchor: { anchor_kind: AnchorKind; anchor_key: string; anchor_text: string; sha: string }; kind: MarkKind; disposition: MarkDisposition | null; note: string | null }) => Promise<MarkWrite>;
  append: (markId: string, note: string | null, disposition: MarkDisposition | null) => Promise<MarkWrite>;
  withdraw: (markId: string) => Promise<MarkWrite>;
  /** Which target's box is open (one at a time). */
  openId: string | null;
  setOpenId: React.Dispatch<React.SetStateAction<string | null>>;
};

/** null = no marks on this surface (the default everywhere except the admin preview). */
export const MarksContext = createContext<MarksSurface | null>(null);
export function useMarks(): MarksSurface | null {
  return useContext(MarksContext);
}

/** The controls' own nodes never take a row click; existing behaviours are kept as they are. */
const KEEPS_ITS_BEHAVIOUR = "a, button, input, textarea, select, summary, label, [role='button'], [role='option'], [role='listbox'], [contenteditable='true']";

/** FM20: the opening motion is off when the reader prefers reduced motion (checked at open time; jsdom-safe). */
export function prefersReducedMotion(): boolean {
  try { return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; }
}

/** The glyphs — one per kind, drawn inline with the existing tokens (no new tokens, no text). */
function KindIcon({ kind }: { kind: MarkKind }) {
  const color = kind === "client_reaction" ? "hsl(var(--fr-electric))" : "hsl(var(--fr-lime))";
  return kind === "client_reaction" ? (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" focusable="false" data-fr-mark-icon="client_reaction">
      <path d="M2 3.5A1.5 1.5 0 0 1 3.5 2h9A1.5 1.5 0 0 1 14 3.5v6A1.5 1.5 0 0 1 12.5 11H7l-3.5 3v-3H3.5A1.5 1.5 0 0 1 2 9.5v-6Z" fill={color} />
    </svg>
  ) : (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" focusable="false" data-fr-mark-icon="our_mark">
      <path d="M8 1.5l1.9 4.1 4.4.5-3.3 3 .9 4.4L8 11.3l-3.9 2.2.9-4.4-3.3-3 4.4-.5L8 1.5Z" fill={color} />
    </svg>
  );
}

type TargetProps = {
  kind: AnchorKind;
  /** The durable key; null → the row is not markable (rendered untouched). */
  keyVal: string | null | undefined;
  /** The anchored text; omitted → the wrapper's own rendered text at click time (headlines). */
  text?: string;
  /** The beat this anchor belongs to; default = the page's current beat. */
  beat?: string;
  as?: "div" | "span";
  className?: string;
  children: ReactNode;
};

/** Wraps one markable row / group header / headline. Inert (children only) without a provider or on a frozen company. */
export function MarkTarget({ kind, keyVal, text, beat, as = "div", className, children }: TargetProps) {
  const ctx = useMarks();
  const myId = useId();
  const bodyRef = useRef<HTMLElement | null>(null);
  const key = (keyVal ?? "").trim();
  if (!ctx || ctx.frozen || !key) return <>{children}</>;
  const marks = ctx.byAnchor.get(anchorId(kind, key)) ?? [];
  const open = ctx.openId === myId;
  const Tag = as;
  const onClick = (event: React.MouseEvent<HTMLElement>) => {
    const t = event.target as HTMLElement;
    if (t.closest(`[${MARK_ATTR}="box"]`)) return; // the box handles itself
    if (t.closest(KEEPS_ITS_BEHAVIOUR) && !t.closest(`[${MARK_ATTR}="icons"]`)) return; // existing behaviour wins
    if (window.getSelection?.()?.toString()) return; // the reader is selecting text
    event.stopPropagation(); // a nested target (a quote under a finding) never opens its parent too
    ctx.setOpenId(open ? null : myId);
  };
  const anchorText = () => (text ?? bodyRef.current?.textContent ?? "").trim();
  return (
    <Tag
      className={`fr-mark-target${marks.length ? " fr-mark-target--marked" : ""}${className ? ` ${className}` : ""}`}
      {...{ [MARK_ATTR]: "target" }}
      data-fr-mark-kind={kind}
      data-fr-mark-key={key}
      data-fr-marked={marks.length ? marks.map((m) => m.kind).sort().join("+") : undefined}
      onClick={onClick}
    >
      <Tag ref={bodyRef as never} className="fr-mark-body">{children}</Tag>
      {marks.length ? (
        <span className="fr-mark-icons" {...{ [MARK_ATTR]: "icons" }} aria-hidden="true">
          {marks.map((m) => <KindIcon key={m.id} kind={m.kind} />)}
        </span>
      ) : null}
      {open ? <MarkBox targetId={myId} kind={kind} anchorKey={key} anchorText={anchorText()} beat={beat ?? ctx.currentBeat} marks={marks} /> : null}
    </Tag>
  );
}

/** The box (FM21): the reaction choices with their shared note, then "Stood out to us" with its own. Saves on close; never on keystroke. */
function MarkBox({ targetId, kind, anchorKey, anchorText, beat, marks }: { targetId: string; kind: AnchorKind; anchorKey: string; anchorText: string; beat: string; marks: LiveMark[] }) {
  const ctx = useMarks()!;
  const reaction = marks.find((m) => m.kind === "client_reaction");
  const ours = marks.find((m) => m.kind === "our_mark");
  // FM18: nothing preselected on a fresh row; an existing mark shows as it is
  const [disposition, setDisposition] = useState<MarkDisposition | null>(reaction?.disposition ?? null);
  const [reactionNote, setReactionNote] = useState<string>(reaction?.note ?? "");
  const [oursPicked, setOursPicked] = useState<boolean>(Boolean(ours));
  const [oursNote, setOursNote] = useState<string>(ours?.note ?? "");
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [motion] = useState<"enter" | "none">(() => (prefersReducedMotion() ? "none" : "enter"));
  const boxRef = useRef<HTMLDivElement | null>(null);
  const firstRef = useRef<HTMLButtonElement | null>(null);
  const state = useRef({ disposition, reactionNote, oursPicked, oursNote });
  state.current = { disposition, reactionNote, oursPicked, oursNote };
  useEffect(() => { firstRef.current?.focus(); }, []);

  /** The save rule (FM5/FM21), then close. A failed write keeps the box (S6) and its text. */
  const closeAndSave = useCallback(async () => {
    if (busy) return;
    const { disposition: d, reactionNote: rn, oursPicked: op, oursNote: on } = state.current;
    const needsAnchor = (!reaction && d !== null) || (!ours && op);
    let result: MarkWrite = { ok: true };
    setBusy(true);
    try {
      const anchor = needsAnchor ? { anchor_kind: kind, anchor_key: anchorKey, anchor_text: anchorText, sha: await hashAnchorText(anchorText) } : null;
      // the reaction: one per row — append when its note or disposition changed; create when a choice is picked
      if (reaction) {
        const nextNote = emptyToNull(rn);
        const noteChanged = nextNote !== emptyToNull(reaction.note);
        const dispositionChanged = d !== null && d !== reaction.disposition;
        if (noteChanged || dispositionChanged) result = await ctx.append(reaction.id, nextNote, dispositionChanged ? d : null);
      } else if (d !== null) {
        result = await ctx.create({ beatKey: beat, anchor: anchor!, kind: "client_reaction", disposition: d, note: emptyToNull(rn) });
      }
      if (!result.ok) return;
      // our mark: one per row — append when its note changed; create when picked
      if (ours) {
        const nextNote = emptyToNull(on);
        if (nextNote !== emptyToNull(ours.note)) result = await ctx.append(ours.id, nextNote, null);
      } else if (op) {
        result = await ctx.create({ beatKey: beat, anchor: anchor!, kind: "our_mark", disposition: null, note: emptyToNull(on) });
      }
    } finally {
      setBusy(false);
      if (!result.ok) setFailed(true);
      else ctx.setOpenId((cur) => (cur === targetId ? null : cur)); // never close a box another row opened meanwhile
    }
  }, [busy, ctx, reaction, ours, beat, kind, anchorKey, anchorText, targetId]);

  // a click outside the box closes it (and saves); Escape inside does the same; keys never reach beat navigation
  useEffect(() => {
    const onDown = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) void closeAndSave(); };
    document.addEventListener("mousedown", onDown, true);
    return () => document.removeEventListener("mousedown", onDown, true);
  }, [closeAndSave]);
  const onKeyDown = (e: React.KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === "Escape") { e.preventDefault(); void closeAndSave(); }
  };
  // picking: a single reaction (a fresh pick can be undone by clicking it again; an existing reaction changes, never
  // unpicks — the withdraw is the way out); "Stood out to us" toggles the same way. Typed text is never cleared.
  const pickReaction = (d: MarkDisposition) => { setDisposition((cur) => (cur === d && !reaction ? null : d)); setFailed(false); };
  const pickOurs = () => { setOursPicked((cur) => (ours ? true : !cur)); setFailed(false); };
  const onWithdraw = async (existing: LiveMark) => {
    if (busy) return;
    setBusy(true);
    const r = await ctx.withdraw(existing.id);
    setBusy(false);
    if (!r.ok) { setFailed(true); return; }
    ctx.setOpenId((cur) => (cur === targetId ? null : cur));
  };
  const close = () => { void closeAndSave(); };
  return (
    <div ref={boxRef} className="fr-mark-box" {...{ [MARK_ATTR]: "box" }} data-fr-mark-target={targetId} data-fr-mark-motion={motion} onKeyDown={onKeyDown} onClick={(e) => e.stopPropagation()}>
      <button type="button" className="fr-mark-close" {...{ [MARK_ATTR]: "close" }} aria-label={MARK_STRINGS.close} disabled={busy} onClick={close}>
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" focusable="false"><path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
      </button>
      <div className="fr-mark-choices" role="group">
        {REACTION_CHOICES.map((c, i) => (
          <button key={c.disposition} ref={i === 0 ? firstRef : undefined} type="button" className="fr-ws-control fr-mono" aria-pressed={disposition === c.disposition} data-fr-mark-choice={c.disposition} onClick={() => pickReaction(c.disposition)}>{c.label}</button>
        ))}
      </div>
      <textarea className="fr-mark-note" {...{ [MARK_ATTR]: "note" }} data-fr-mark-note-for="client_reaction" value={reactionNote} onChange={(e) => { setReactionNote(e.target.value); setFailed(false); }} rows={3} />
      {reaction ? (
        <button type="button" className="fr-ws-control fr-mono" data-fr-tone="danger" {...{ [MARK_ATTR]: "withdraw" }} data-fr-mark-withdraw="client_reaction" disabled={busy} onClick={() => { void onWithdraw(reaction); }}>{MARK_STRINGS.withdraw}</button>
      ) : null}
      <hr className="fr-mark-divider" />
      <div className="fr-mark-choices" role="group">
        <button type="button" className="fr-ws-control fr-mono" aria-pressed={oursPicked} data-fr-mark-choice="our_mark" onClick={pickOurs}>{MARK_STRINGS.stoodOut}</button>
      </div>
      {oursPicked ? (
        <textarea className="fr-mark-note" {...{ [MARK_ATTR]: "note" }} data-fr-mark-note-for="our_mark" value={oursNote} onChange={(e) => { setOursNote(e.target.value); setFailed(false); }} rows={3} />
      ) : null}
      {ours ? (
        <button type="button" className="fr-ws-control fr-mono" data-fr-tone="danger" {...{ [MARK_ATTR]: "withdraw" }} data-fr-mark-withdraw="our_mark" disabled={busy} onClick={() => { void onWithdraw(ours); }}>{MARK_STRINGS.withdraw}</button>
      ) : null}
      {failed ? <p className="fr-ws-analysis-refused fr-mono" {...{ [MARK_ATTR]: "failed" }}>{MARK_STRINGS.saveFailed}</p> : null}
    </div>
  );
}

/** The provider — mounted by FirstReadPreviewView only. */
export function MarksProvider({ value, children }: { value: Omit<MarksSurface, "openId" | "setOpenId"> | null; children: ReactNode }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const surface = useMemo<MarksSurface | null>(() => (value ? { ...value, openId, setOpenId } : null), [value, openId]);
  return <MarksContext.Provider value={surface}>{children}</MarksContext.Provider>;
}
