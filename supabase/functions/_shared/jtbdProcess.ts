export type JtbdCheckpointKey =
  | "define"
  | "locate"
  | "prepare"
  | "confirm"
  | "execute"
  | "monitor"
  | "modify"
  | "conclude";

export type JtbdCheckpoint = {
  stepNumber: number;
  key: JtbdCheckpointKey;
  canonicalLabel: string;
  description: string;
};

export type JtbdProcessStepDraft = {
  step_number?: number | null;
  step_label?: string | null;
  description?: string | null;
  designed?: boolean | null;
  has_gap?: boolean | null;
  evidence_status?: "evidenced" | "implied" | "unclear" | string | null;
  evidence_basis?: string | null;
  evidence_confidence?: number | null;
  gap_note?: string | null;
};

export const JTBD_ODI_CHECKPOINTS: ReadonlyArray<JtbdCheckpoint> = [
  {
    stepNumber: 1,
    key: "define",
    canonicalLabel: "Define desired progress",
    description:
      "Clarify the progress the job executor is trying to make and the result that would count as success.",
  },
  {
    stepNumber: 2,
    key: "locate",
    canonicalLabel: "Locate viable options",
    description:
      "Identify the options, resources, and sources of information that could help accomplish the job.",
  },
  {
    stepNumber: 3,
    key: "prepare",
    canonicalLabel: "Prepare required conditions",
    description:
      "Get the prerequisites, inputs, and conditions in place before the core task begins.",
  },
  {
    stepNumber: 4,
    key: "confirm",
    canonicalLabel: "Confirm readiness",
    description:
      "Confirm the chosen path, inputs, and conditions are good enough to proceed.",
  },
  {
    stepNumber: 5,
    key: "execute",
    canonicalLabel: "Perform the core task",
    description:
      "Carry out the core task required to create the intended progress.",
  },
  {
    stepNumber: 6,
    key: "monitor",
    canonicalLabel: "Monitor results",
    description:
      "Track progress, quality, and emerging signals while the job is underway.",
  },
  {
    stepNumber: 7,
    key: "modify",
    canonicalLabel: "Adjust the approach",
    description:
      "Adjust the approach when conditions shift or outcomes fall short.",
  },
  {
    stepNumber: 8,
    key: "conclude",
    canonicalLabel: "Conclude and learn",
    description:
      "Confirm the result, close the effort cleanly, and capture what should change next time.",
  },
] as const;

export const JTBD_CHECKPOINT_COUNT = JTBD_ODI_CHECKPOINTS.length;

const CHECKPOINT_BY_NUMBER = new Map(
  JTBD_ODI_CHECKPOINTS.map((checkpoint) => [checkpoint.stepNumber, checkpoint]),
);

const PRESCRIPTIVE_TERMS_LIST = [
  "feature", "dashboard", "portal", "campaign", "launch", "tool", "app", "platform",
  "build", "implement", "rollout", "workflow automation", "automation workflow",
  "template", "mvp", "ui", "productize", "standardize", "integrate", "promote",
  "negotiate", "supplier", "vendor", "pricing", "terms", "partnership",
  "onboarding", "mojomap", "mojoscore",
];

const SOLUTION_PRESCRIPTIVE_PATTERN = new RegExp(
  `\\b(${PRESCRIPTIVE_TERMS_LIST.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`,
  "i",
);

const NON_ODI_PROCESS_PATTERN =
  /\b(awareness|acquisition|activation|retention|engagement|pipeline stage|marketing funnel|sales funnel|consulting process|delivery process|implementation plan)\b/i;

function safeStepNumber(value: number | null | undefined) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.round(numeric));
}

function safeText(value: string | null | undefined) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function validateActionLabel(value: string) {
  const compact = safeText(value);
  if (!compact) return "";
  const words = compact.split(/\s+/);
  if (words.length < 2 || words.length > 8) return "";
  if (containsSolutionPrescriptiveLanguage(compact) || containsNonOdiProcessLanguage(compact)) return "";
  return compact;
}

export function checkpointForStepNumber(stepNumber: number) {
  const resolved = CHECKPOINT_BY_NUMBER.get(Math.max(1, Math.min(JTBD_CHECKPOINT_COUNT, Math.round(stepNumber))));
  return resolved || JTBD_ODI_CHECKPOINTS[0];
}

export function buildDefaultCheckpointSeed() {
  return JTBD_ODI_CHECKPOINTS.map((checkpoint) => ({
    step_number: checkpoint.stepNumber,
    step_label: checkpoint.canonicalLabel,
    description: checkpoint.description,
  }));
}

export function buildCompanyVocabExclusions(fields: string[]): Set<string> {
  const combined = fields.join(" ").toLowerCase();
  const result = new Set<string>();
  for (const term of PRESCRIPTIVE_TERMS_LIST) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`\\b${escaped}\\b`, "i").test(combined)) result.add(term);
  }
  return result;
}

export function containsSolutionPrescriptiveLanguage(
  value: string | null | undefined,
  excludedTerms?: Set<string>,
): boolean {
  const text = String(value || "");
  if (!excludedTerms || excludedTerms.size === 0) {
    return SOLUTION_PRESCRIPTIVE_PATTERN.test(text);
  }
  for (const term of PRESCRIPTIVE_TERMS_LIST) {
    if (excludedTerms.has(term)) continue;
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`\\b${escaped}\\b`, "i").test(text)) return true;
  }
  return false;
}

export function containsNonOdiProcessLanguage(value: string | null | undefined) {
  return NON_ODI_PROCESS_PATTERN.test(String(value || ""));
}

export function validateEightCheckpointSpine(steps: JtbdProcessStepDraft[], excludedTerms?: Set<string>) {
  const issues: string[] = [];
  if (!Array.isArray(steps) || steps.length !== JTBD_CHECKPOINT_COUNT) {
    issues.push(`Expected ${JTBD_CHECKPOINT_COUNT} checkpoints but received ${Array.isArray(steps) ? steps.length : 0}.`);
    return { isValid: false, issues };
  }

  const numbers = steps.map((step) => safeStepNumber(step.step_number));
  for (let idx = 0; idx < JTBD_CHECKPOINT_COUNT; idx += 1) {
    if (numbers[idx] !== idx + 1) {
      issues.push("Step numbers must be sequential from 1 to 8.");
      break;
    }
  }

  for (const step of steps) {
    const label = safeText(step.step_label);
    const description = safeText(step.description);
    if (!label) issues.push(`Step ${safeStepNumber(step.step_number) || "?"} is missing a label.`);
    if (!description) issues.push(`Step ${safeStepNumber(step.step_number) || "?"} is missing a description.`);
    if (containsSolutionPrescriptiveLanguage(label, excludedTerms) || containsSolutionPrescriptiveLanguage(description, excludedTerms)) {
      issues.push(`Step ${safeStepNumber(step.step_number) || "?"} includes solution-prescriptive language.`);
    }
    if (containsNonOdiProcessLanguage(label)) {
      issues.push(`Step ${safeStepNumber(step.step_number) || "?"} uses non-SDS process wording.`);
    }
  }

  return {
    isValid: issues.length === 0,
    issues,
  };
}

export function normalizeToEightCheckpointSpine(
  steps: JtbdProcessStepDraft[],
  options?: {
    defaultEvidenceBasis?: string;
    defaultConfidence?: number;
    defaultGapNote?: string;
    // Substitution-fix gate: under strict (require_model) content mode, any fill
    // or replacement of label/description text is a loud failure, never silent.
    strictModelContent?: boolean;
  },
) {
  const byStep = new Map<number, JtbdProcessStepDraft>();
  for (const step of Array.isArray(steps) ? steps : []) {
    const number = safeStepNumber(step?.step_number);
    if (!number || number > JTBD_CHECKPOINT_COUNT) continue;
    if (!byStep.has(number)) byStep.set(number, step);
  }

  const defaults = {
    defaultEvidenceBasis:
      options?.defaultEvidenceBasis ||
      "The first pass was too weak to trust, so this was reset to the required 8-step customer sequence. Validate each step with direct customer evidence.",
    defaultConfidence: Number.isFinite(Number(options?.defaultConfidence))
      ? Math.max(0, Math.min(100, Math.round(Number(options?.defaultConfidence))))
      : 45,
    defaultGapNote:
      options?.defaultGapNote ||
      "Capture the exact reason this step breaks down for this customer before changing the process.",
  };

  if (options?.strictModelContent) {
    const missing = JTBD_ODI_CHECKPOINTS.filter((c) => !byStep.has(c.stepNumber)).map((c) => c.stepNumber);
    if (missing.length > 0) {
      throw new Error(
        `strict model content: customer spine is missing checkpoint(s) ${missing.join(", ")} — refusing canonical-row substitution.`,
      );
    }
  }

  return JTBD_ODI_CHECKPOINTS.map((checkpoint) => {
    const existing = byStep.get(checkpoint.stepNumber);
    const existingLabel = validateActionLabel(safeText(existing?.step_label));
    const existingDescription = safeText(existing?.description);
    if (options?.strictModelContent) {
      if (!existingLabel) {
        throw new Error(
          `strict model content: checkpoint ${checkpoint.stepNumber} label ${JSON.stringify(safeText(existing?.step_label))} failed validation — refusing canonical-label substitution.`,
        );
      }
      if (!existingDescription) {
        throw new Error(
          `strict model content: checkpoint ${checkpoint.stepNumber} has no description — refusing template-description substitution.`,
        );
      }
    }
    const fallbackGap = existing?.has_gap ? safeText(existing?.gap_note) : defaults.defaultGapNote;
    return {
      step_number: checkpoint.stepNumber,
      step_label: existingLabel || checkpoint.canonicalLabel,
      description: existingDescription || checkpoint.description,
      designed: typeof existing?.designed === "boolean" ? existing.designed : false,
      has_gap: typeof existing?.has_gap === "boolean" ? existing.has_gap : true,
      evidence_status: safeText(existing?.evidence_status) || "unclear",
      evidence_basis: safeText(existing?.evidence_basis) || defaults.defaultEvidenceBasis,
      evidence_confidence:
        Number.isFinite(Number(existing?.evidence_confidence))
          ? Math.max(0, Math.min(100, Math.round(Number(existing?.evidence_confidence))))
          : defaults.defaultConfidence,
      gap_note: fallbackGap,
    } as JtbdProcessStepDraft;
  });
}
