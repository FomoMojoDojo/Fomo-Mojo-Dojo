// The reading order of the first read — pure data, lifted out of FirstReadPreviewView (marks commit 3,
// 2026-09-22) so a surface that needs only a beat's own nav label can read it without importing the view
// and its CSS. FirstReadPreviewView re-exports every name below, so the specs that pin the order through
// the view keep importing it there; this file changes no order and no label.
import { HEARD_BEAT_KEY } from "@/lib/firstReadMarks/WhatWeHeard";
import { MARK_STRINGS } from "@/lib/firstReadMarks/strings";

// Flow restructure (operator-ruled 2026-09-02): PROMISE-FIRST unpacking arc — each page reveals what is
// behind the one before (the reverse of derivation order). "Where this points" splits into three pages
// (promise → positioning → strategy). Two siesta interludes (siesta1 after findings, siesta2 after base).
// "What you offer" moves AFTER siesta2 (downstream of the base by law). "Where you stand" stays dark.
// Siesta/promise/positioning/strategy labels are operator-signed (2026-09-02). The siesta "A moment"
// labels only surface in the nav/forward-link, which is hidden behind FIRST_READ_SHOW_NAV_CHROME.
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

/** Marks (commit 2, 2026-09-22): "What we heard" sits just before the closer and only when the company holds at
 *  least one live mark; BEATS itself stays the fixed reading order every test pins. */
export const HEARD_BEAT = { key: HEARD_BEAT_KEY, label: MARK_STRINGS.whatWeHeard, act: undefined } as const;
export type Beat = { key: string; label: string; act: number | undefined };
export function beatsFor(hasMarks: boolean): readonly Beat[] {
  if (!hasMarks) return BEATS as readonly Beat[];
  const i = BEATS.findIndex((b) => b.key === "next");
  return [...BEATS.slice(0, i), HEARD_BEAT, ...BEATS.slice(i)] as readonly Beat[];
}

/** The nav label of a beat key — the link label of a mark on any surface (no new string). */
export function beatLabel(key: string): string {
  return beatsFor(true).find((b) => b.key === key)?.label ?? key;
}

/** Reading-order position of a beat key; an unknown key sorts last. */
export function beatOrderIndex(key: string): number {
  const i = beatsFor(true).findIndex((b) => b.key === key);
  return i < 0 ? Number.MAX_SAFE_INTEGER : i;
}
