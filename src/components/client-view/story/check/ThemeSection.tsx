// First Read ROLLUP (Gate 1) — presentational only. A theme is a plain headline + an optional
// featured exhibit (Gate 2 sets which item; Gate 1 renders whatever is passed) + a collapsed
// "…and N more like this" tail. Pure chrome: it renders the children it is given and never reads
// data or writes verdicts. The batteries inside the tail are untouched here (Gate 3 removes them).

import type { ReactNode } from "react";
import { moreLabel, EXPANSION_FRAMING } from "@/lib/firstRead/themeCopy";

export function ThemeHeadline({ children }: { children: ReactNode }) {
  return <h3 className="cvs-theme-headline">{children}</h3>;
}

/**
 * The collapsed tail. When `count` is 0 there is nothing to fold, so the children render directly
 * (an honest empty section still shows its own copy — never a "…and 0 more" toggle over nothing).
 * Collapsed by default: the overview stays calm; the full set is one click away.
 */
export function ThemeMore({ count, children }: { count: number; children: ReactNode }) {
  if (count <= 0) return <>{children}</>;
  return (
    <details className="cvs-theme-more">
      <summary className="cvs-theme-more-summary">{moreLabel(count)}</summary>
      <p className="cvs-theme-more-framing">{EXPANSION_FRAMING}</p>
      {children}
    </details>
  );
}
