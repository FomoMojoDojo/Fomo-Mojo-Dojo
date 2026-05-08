// Phase-aware framework activation map (browser environment).
//
// Controls which frameworks are active for a given engagement phase.
// Used by inspect panels and (via the Deno copy) by council-review.
//
// A parallel copy exists at supabase/functions/_shared/phaseFrameworks.ts
// for the Deno/edge-function environment. Keep both in sync.

import type { EngagementPhase } from "@/lib/engagementPhase";

// Mirrors FrameworkKey from supabase/functions/_shared/frameworkLibrary.ts.
// Duplicated here to avoid importing Deno-only code into the browser bundle.
export type FrameworkKey =
  | "odi"
  | "april_dunford"
  | "teresa_torres"
  | "heath_brothers"
  | "strategy_cascade"
  | "sxd"
  | "market_validation"
  | "strategic_goal_cards"
  | "working_playbook"
  | "positioning_first";

export const PHASE_FRAMEWORK_MAP: Record<EngagementPhase, FrameworkKey[]> = {
  // ── Observational — detect patterns, surface hypotheses only
  outside_signals: [
    "april_dunford",      // detect positioning inconsistencies + audience ambiguity
    "odi",                // lightweight — possible gaps and contradictions only
    "market_validation",  // category/market contradictions
  ],

  // ── Presentational — show findings, assess fit
  validate_outside: [
    "april_dunford",      // framing for initial client conversation
    "market_validation",  // market context for the presentation
  ],

  // ── Diagnostic — synthesise, refine, build evidence
  diagnose: [
    "odi",
    "teresa_torres",
    "strategy_cascade",
    "sxd",
  ],

  // ── Synthesis — align on working hypotheses before committing direction
  validate_diagnose: [
    "odi",
    "teresa_torres",
    "strategy_cascade",
  ],

  // ── Decisional — choose, prioritise, commit
  focus: [
    "odi",
    "april_dunford",
    "strategy_cascade",
    "strategic_goal_cards",
    "positioning_first",
    "working_playbook",
  ],

  // ── Confirmational — confirm chosen path, ensure stakeholder alignment
  validate_focus: [
    "strategy_cascade",
    "strategic_goal_cards",
    "working_playbook",
  ],

  // ── Executional — execute, monitor, iterate
  flow: [
    "working_playbook",
    "strategic_goal_cards",
    "heath_brothers",
  ],

  // ── Reflective — measurement, habit questions, drift signals
  validate_flow: [
    "working_playbook",
    "heath_brothers",
  ],
};

export function getFrameworksForPhase(phase: EngagementPhase): FrameworkKey[] {
  return PHASE_FRAMEWORK_MAP[phase] ?? PHASE_FRAMEWORK_MAP["outside_signals"];
}
