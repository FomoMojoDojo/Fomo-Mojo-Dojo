// "What we heard" — the marks beat (commit 2 of 4, 2026-09-22; fix pass the same day). Present only when the company
// has at least one live mark (the view inserts the beat just before the closer). Groups in order: Important ·
// Interesting · Not important · Stood out to us; an empty group is not rendered. Each entry: the anchored text as
// marked, the latest note (absent when the mark has none), and a link that jumps to the anchor's beat (its label
// is the beat's own nav label — no new string). Order inside a group: beat order, then created_at.
// FM19: EVERY live mark is listed here — a mark whose row cannot be placed on the page (row_gone, or an offering
// question whose text-hash key has not filled or has changed) shows here muted; no mark is ever invisible.
import type { FirstReadPreviewData } from "@/views/client/firstReadPreview/types";
import { MARK_ATTR, useMarks } from "./MarksContext";
import { HEARD_GROUP_ORDER, MARK_STRINGS, REACTION_CHOICES } from "./strings";
import type { LiveMark } from "./useFirstReadMarks";
import { anchorId } from "./useFirstReadMarks";
import { presentAnchorIds } from "./presentAnchors";

export const HEARD_BEAT_KEY = "heard";

const GROUPS: Array<{ key: string; label: string; pick: (m: LiveMark) => boolean }> = HEARD_GROUP_ORDER.map((key) =>
  key === "our_mark"
    ? { key, label: MARK_STRINGS.stoodOut, pick: (m: LiveMark) => m.kind === "our_mark" }
    : { key, label: REACTION_CHOICES.find((c) => c.disposition === key)!.label, pick: (m: LiveMark) => m.kind === "client_reaction" && m.disposition === key },
);

/** Beat order then created_at — the reading order of the page. */
export function orderMarks(marks: readonly LiveMark[], beatIndex: (key: string) => number): LiveMark[] {
  return [...marks].sort((a, b) => (beatIndex(a.beat_key) - beatIndex(b.beat_key)) || a.created_at.localeCompare(b.created_at));
}

export function WhatWeHeard({ read, beats }: { read: FirstReadPreviewData; beats: ReadonlyArray<{ key: string; label: string }> }) {
  const ctx = useMarks();
  if (!ctx || ctx.marks.length === 0) return null;
  const beatIndex = (key: string) => { const i = beats.findIndex((b) => b.key === key); return i < 0 ? Number.MAX_SAFE_INTEGER : i; };
  const beatLabel = (key: string) => beats.find((b) => b.key === key)?.label ?? key;
  const present = presentAnchorIds(read);
  const groups = GROUPS.map((g) => ({ ...g, marks: orderMarks(ctx.marks.filter(g.pick), beatIndex) })).filter((g) => g.marks.length > 0);
  return (
    <div className="fr-heard" {...{ [MARK_ATTR]: "heard" }}>
      {groups.map((g) => (
        <section key={g.key} className="fr-heard-group" data-fr-heard-group={g.key}>
          <p className="fr-eyebrow mb-4">{g.label}</p>
          <ol className="fr-heard-list">
            {g.marks.map((m) => {
              const gone = !present.has(anchorId(m.anchor_kind, m.anchor_key)); // FM19: listed either way
              return (
                <li key={m.id} className={`fr-heard-entry${gone ? " fr-heard-entry--gone" : ""}`} data-fr-heard-entry={m.id} data-fr-mark-state={gone ? "row_gone" : "present"}>
                  <p className="fr-heard-anchor text-lg font-light leading-relaxed">{m.anchor_text}</p>
                  {m.note ? <p className="fr-heard-note">{m.note}</p> : null}
                  <button type="button" className="fr-ws-table-link fr-mono" data-fr-heard-jump={m.beat_key} onClick={() => ctx.goToBeat(m.beat_key)}>{beatLabel(m.beat_key)}</button>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}
