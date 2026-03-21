import type { InputItem } from "@/lib/types";

const BASE_IMPACT_BY_INPUT_KEY: Record<string, number> = {
  "comp-alt": 9.0,
  "unique-attr": 8.0,
  "val-prop": 7.0,
  "target-aud": 6.0,
  "market-cat": 7.0,
  "program-model": 6.0,
  "needs-assessment": 5.0,
  "outcome-data": 6.0,
  "referral-map": 5.5,
  "brand-narrative": 5.0,
  "channel-strat": 5.5,
  "donor-retention": 4.5,
  "grant-pipeline": 4.5,
  "family-satisfaction": 4.0,
};

export function getInputBaseImpact(inputKey: string): number {
  const key = String(inputKey || "").trim();
  return BASE_IMPACT_BY_INPUT_KEY[key] ?? 4.5;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

function tierForScore(score: number): InputItem["impact_tier"] {
  if (score >= 6) return "high";
  if (score >= 3) return "med";
  return "low";
}

export function deriveInputImpact(args: {
  inputKey: string;
  completeness: number;
  status: InputItem["status"];
  subitemsDone?: number;
  subitemsTotal?: number;
  filesCount?: number;
}): { scoreImpact: number; impactTier: InputItem["impact_tier"] } {
  const base = getInputBaseImpact(args.inputKey);
  const completeness = clamp(Number(args.completeness) || 0, 0, 100);
  const status = args.status;

  if (status === "complete" || completeness >= 100) {
    return { scoreImpact: 0, impactTier: "done" };
  }

  const subitemsDone = Math.max(0, Number(args.subitemsDone) || 0);
  const subitemsTotal = Math.max(0, Number(args.subitemsTotal) || 0);
  const filesCount = Math.max(0, Number(args.filesCount) || 0);

  const checklistProgress = subitemsTotal > 0 ? clamp(subitemsDone / subitemsTotal, 0, 1) : completeness / 100;
  const remainingWork = clamp(1 - checklistProgress, 0.12, 1);
  const statusBias = status === "gap" ? 1.08 : status === "not_started" ? 1.02 : 1;
  const evidenceBias = filesCount >= 3 ? 0.92 : filesCount > 0 ? 0.96 : 1;

  const scoreImpact = round1(clamp(base * (0.35 + 0.65 * remainingWork) * statusBias * evidenceBias, 0.5, 10));
  return { scoreImpact, impactTier: tierForScore(scoreImpact) };
}
