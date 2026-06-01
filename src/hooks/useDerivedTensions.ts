import { useMemo } from "react";
import {
  deriveStrategicTensions,
  tensionsForContext,
  commitmentBlockers,
} from "@/lib/tensionDerivation";
import type {
  TensionDerivationInput,
  TensionContext,
  StrategicTension,
} from "@/lib/tensionTypes";

/**
 * Derives strategic tensions from a snapshot of the strategic system.
 * All tensions are computed synchronously in a useMemo — no loading state.
 *
 * Use `forContext()` to get the 1–3 tensions most relevant to a given page.
 */
export function useDerivedTensions(input: TensionDerivationInput): {
  all: StrategicTension[];
  forContext: (context: TensionContext, max?: number) => StrategicTension[];
  blockers: StrategicTension[];
  hasCritical: boolean;
  hasHigh: boolean;
} {
  const all = useMemo(
    () => deriveStrategicTensions(input),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      input.routes,
      input.needs,
      input.canvas,
      input.cascade,
      input.sourceSignals,
      input.portfolio,
      input.hypotheses,
      input.positioningStrength,
    ],
  );

  const blockers = useMemo(() => commitmentBlockers(all), [all]);
  const hasCritical = useMemo(() => all.some((t) => t.pressure === "critical"), [all]);
  const hasHigh = useMemo(() => all.some((t) => t.pressure === "high"), [all]);

  const forContext = useMemo(
    () => (context: TensionContext, max = 3) => tensionsForContext(all, context, max),
    [all],
  );

  return { all, forContext, blockers, hasCritical, hasHigh };
}
