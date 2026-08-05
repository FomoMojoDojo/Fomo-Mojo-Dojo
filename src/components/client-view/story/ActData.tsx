/*
 * GATE A — the <ActData> render guard for the client story.
 *
 * ══ THE STRUCTURAL PROPERTY IS THE POINT ═════════════════════════════════════
 * A client-view act must NEVER render its empty / absence copy while a query
 * error is held. Standing law (contest-render): a query-error is NOT empty at the
 * consumer boundary. Underneath the signed absence copy, a dropped connection was
 * rendering exactly that — e.g. "Everything you've told us turned up somewhere in
 * what we've read." — the strongest claim on the surface from the weakest cause.
 *
 * ENFORCEMENT: the data is delivered ONLY through the render-prop `children`,
 * which is a function `(data: T) => ReactNode` that this component calls ONLY in
 * the `ready` branch. The `error` branch returns the signed error state and never
 * reaches `children`. Because `state.data` is reachable ONLY when
 * `state.status === "ready"` (the discriminated union narrows it), an act's
 * data-dependent rendering — including any absence line — lives inside `children`
 * and therefore cannot be produced while an error is held.
 *
 * HONEST SCOPE OF THE GUARANTEE: this is structurally enforced for any act
 * rendered THROUGH <ActData>. It does NOT compel its own adoption — a future act
 * that reads a raw hook and renders an empty state without going through <ActData>
 * can still reintroduce the defect. Making the hooks return AsyncState (Gate B+)
 * and routing every act through this guard is what closes that gap; this component
 * makes the mistake impossible WITHIN its use, not globally by convention alone.
 *
 * Mirrors the required-prop "the prop IS the guard" shape of ActDefinition /
 * ActRecap (client story shared-render house pattern).
 */
import type { ReactNode } from "react";
import type { AsyncState } from "@/hooks/useAsyncRead";

// Client-facing error copy — OPERATOR-SIGNED (Gate A). The second sentence is
// load-bearing: it explicitly refuses the reading the empty state was making
// (a load failure is not a finding). Straight ASCII apostrophe (U+0027) + em-dash
// (U+2014, space-padded) — matches the house style of the neighbouring signed
// story strings (sayVsSee.ts, GapAct.tsx). Do not reword, shorten, or split.
export const ACT_DATA_ERROR =
  "We couldn't load this section. That's a loading problem on our side — not a finding about you.";

export function ActData<T>({
  state,
  loading = null,
  children,
}: {
  state: AsyncState<T>;
  /** What to show while the read is in flight (an act's own loading line). */
  loading?: ReactNode;
  /** Called ONLY in the ready branch — the sole path to `data`. */
  children: (data: T) => ReactNode;
}): ReactNode {
  if (state.status === "error") {
    return (
      <p className="cvs-support cvs-act-error" role="alert">
        {ACT_DATA_ERROR}
      </p>
    );
  }
  if (state.status === "loading") {
    return <>{loading}</>;
  }
  // state.status === "ready" — data is reachable here and ONLY here.
  return <>{children(state.data)}</>;
}
