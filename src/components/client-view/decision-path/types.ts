import type { ClientActionSummary, ClientConfidenceLevel } from "@/lib/clientViewModel";

export type DecisionDriverTone = "risk" | "uncertain" | "progress";

export const LOVABLE_DRIVER_IDS = [
  "ownership",
  "execution",
  "risk_reduction",
  "belief",
  "proof",
  "decision",
] as const;

export type DecisionDriver = {
  id: "ownership" | "execution" | "risk_reduction" | "belief" | "proof" | "decision";
  label: "Ownership" | "Execution" | "Risk Reduction" | "Belief" | "Proof" | "Decision";
  score: number;
  summary: string;
  exists: string[];
  missing: string[];
  whyItMatters: string;
  howToImprove: string;
};

export type PrioritySignal = {
  action: ClientActionSummary;
  confidenceLevel: ClientConfidenceLevel;
  impactLift: number;
  projectedScore: number;
  impactedDriver: "Ownership" | "Execution" | "Risk Reduction" | "Belief" | "Proof" | "Decision";
  summaryLine: string;
  withoutLine: string;
  whyThisMatters: string;
  whyNow: string;
  whyNotOthers: string;
  whyLine: string;
  isSelected: boolean;
  isCommitted: boolean;
};

export type LovableDriverId =
  (typeof LOVABLE_DRIVER_IDS)[number];

export type LovableDriverState = "Breaking" | "Weak" | "Stable" | "Strong";

export type LovableDriver = {
  id: LovableDriverId;
  label: "Ownership" | "Execution" | "Risk Reduction" | "Belief" | "Proof" | "Decision";
  score: number;
  state: LovableDriverState;
  problem: string;
  explanation: string;
  consequence: string;
  unlockLine: string;
  fixLine: string;
  withoutLine: string;
};
