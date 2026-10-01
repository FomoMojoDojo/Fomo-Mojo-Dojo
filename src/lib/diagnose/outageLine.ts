// DIAGNOSE OUTAGE LINE (CV4, signed 2026-10-01) — the one thing Diagnose may say about a failed search.
//
// THE LAW. A failed search shows ONLY the signed line:
//     "Search couldn't be reached — nothing was checked · {date}"
// It is WORKSPACE_STRINGS.searchUnavailableState (workspaceNav.ts:183), formatted by
// searchUnavailableLine (workspaceNav.ts:303). This module IMPORTS that function. It must never
// hold a copy of the string: a copy drifts, and a drifted copy is a differently-worded claim about
// what was checked.
//
// WHAT THIS REPLACES. OutsideEmptyState (OutsidePanels.tsx:158-186) branches on run.created_at
// alone, so a 'search_unavailable' run — which still writes a row with a created_at — falls into
// its "Scanned {date} — none found." branch (:173). That sentence asserts a completed look that
// found nothing, when nothing was looked at. Diagnose does not mount that component and does not
// carry that sentence; this module returns the signed line or null, and null means render nothing.
//
// NULL IS NOT AN EMPTY STATE. When there is no pending outage this returns null, and the caller
// renders nothing at all. It must not be swapped for a "no problems" or "all clear" sentence —
// absence of an outage is not a finding.

import { searchUnavailableLine } from "@/views/client/workspace/workspaceNav";
import type { BaselineRun } from "./latestRun";

/**
 * The outage line for a pending outage run, or null.
 *
 * `outageRun` is selectLatestRuns().outageRun — already gated on being newer than the evidence run,
 * so this function never decides whether an outage is current. It only words it.
 */
export function diagnoseOutageLine(outageRun: BaselineRun | null): string | null {
  if (!outageRun) return null;
  return searchUnavailableLine(outageRun.created_at);
}
