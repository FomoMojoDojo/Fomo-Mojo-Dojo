// Phase-aware framework activation map (Deno/edge-function environment).
//
// Parallel of src/lib/phaseFrameworks.ts — keep both in sync.
// Uses string literals throughout to avoid cross-environment import issues.

import type { FrameworkKey } from "./frameworkLibrary.ts";

export type EngagementPhase =
  | "outside_signals"
  | "validate_outside"
  | "diagnose"
  | "validate_diagnose"
  | "focus"
  | "validate_focus"
  | "flow"
  | "validate_flow";

export const PHASE_FRAMEWORK_MAP: Record<EngagementPhase, FrameworkKey[]> = {
  outside_signals: [
    "april_dunford",
    "odi",
    "market_validation",
  ],
  validate_outside: [
    "april_dunford",
    "market_validation",
  ],
  diagnose: [
    "odi",
    "teresa_torres",
    "strategy_cascade",
    "sxd",
  ],
  validate_diagnose: [
    "odi",
    "teresa_torres",
    "strategy_cascade",
  ],
  focus: [
    "odi",
    "april_dunford",
    "strategy_cascade",
    "strategic_goal_cards",
    "positioning_first",
    "working_playbook",
  ],
  validate_focus: [
    "strategy_cascade",
    "strategic_goal_cards",
    "working_playbook",
  ],
  flow: [
    "working_playbook",
    "strategic_goal_cards",
    "heath_brothers",
  ],
  validate_flow: [
    "working_playbook",
    "heath_brothers",
  ],
};

export function getFrameworksForPhase(phase: string): FrameworkKey[] {
  return (
    PHASE_FRAMEWORK_MAP[phase as EngagementPhase] ??
    PHASE_FRAMEWORK_MAP["outside_signals"]
  );
}

// LLM guardrail text injected into council-review system prompt per phase.
export const PHASE_GUARDRAIL_TEXT: Record<EngagementPhase, string> = {
  outside_signals:
    "GUARDRAIL: This engagement is in the Outside Signals phase. " +
    "Do NOT recommend routes, prioritize opportunities, or suggest execution actions. " +
    "Produce ONLY: signals observed, possible gaps, contradictions, hypotheses, " +
    "and questions worth investigating.",

  validate_outside:
    "GUARDRAIL: This engagement is in the initial Validate checkpoint. " +
    "Present findings to the client in observational terms. " +
    "Do NOT recommend execution or route selection. " +
    "Focus on: what was observed, possible gaps, and questions the client should answer.",

  diagnose:
    "GUARDRAIL: This engagement is in the Diagnose phase. " +
    "Build working hypotheses from evidence. Do NOT recommend final priorities or routes. " +
    "Focus on: synthesising signals, identifying unmet needs, surfacing contradictions, " +
    "and refining assumptions.",

  validate_diagnose:
    "GUARDRAIL: This engagement is in the Diagnose Validate checkpoint. " +
    "Present working hypotheses — distinguish evidence-supported claims from assumptions. " +
    "Do NOT recommend route execution or final prioritization. " +
    "Focus on: hypothesis clarity, contradiction resolution, and alignment before committing direction.",

  focus:
    "This engagement is in the Focus phase. " +
    "Evidence-backed prioritization and route recommendations are now appropriate. " +
    "Produce: recommended opportunities, route guidance, tradeoff framing, and sequencing.",

  validate_focus:
    "This engagement is in the Focus Validate checkpoint. " +
    "Confirm the chosen desired outcome and path forward. " +
    "Produce: evidence summary for the chosen route, tradeoffs, and alignment check. " +
    "Execution guidance is still premature.",

  flow:
    "This engagement is in the Flow phase. " +
    "Execution guidance, ownership, and progress tracking are appropriate. " +
    "Produce: execution steps, owner assignments, monitoring recommendations, and assumption tracking.",

  validate_flow:
    "This engagement is in the Flow Validate checkpoint — measurement and habit review. " +
    "Produce: leading indicator analysis, habit and cadence assessment, drift signals, " +
    "and recommendation to continue, pivot, or close the loop.",
};

export function getPhaseGuardrailText(phase: string): string {
  return (
    PHASE_GUARDRAIL_TEXT[phase as EngagementPhase] ??
    PHASE_GUARDRAIL_TEXT["outside_signals"]
  );
}
