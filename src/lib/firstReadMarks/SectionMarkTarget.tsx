// The section anchor (commit 2, 2026-09-22): wraps a beat's headline (or the dark screens' title eyebrow). Keys by
// the beat the page is on; a static screen (arc, cold, siestas, next, base, score) yields no target — the wrapper
// renders its children untouched, exactly like every MarkTarget without a provider.
import type { ReactNode } from "react";
import { MarkTarget, useMarks } from "./MarksContext";

const STATIC_BEATS: ReadonlySet<string> = new Set(["arc", "cold", "siesta1", "siesta2", "next", "base", "score", "heard"]);

export function SectionMarkTarget({ children }: { children: ReactNode }) {
  const ctx = useMarks();
  const beat = ctx?.currentBeat ?? "";
  if (!ctx || !beat || STATIC_BEATS.has(beat)) return <>{children}</>;
  return <MarkTarget kind="section" keyVal={beat} as="span">{children}</MarkTarget>;
}
