import { describe, expect, it } from "vitest";
import {
  deriveMarketDefinitionCanvas,
  validateEightCheckpointSpine,
} from "@/lib/jtbdProcess";

describe("validateEightCheckpointSpine", () => {
  it("accepts a complete custom-labeled 8-checkpoint sequence", () => {
    const result = validateEightCheckpointSpine(
      Array.from({ length: 8 }, (_, idx) => ({
        step_number: idx + 1,
        step_label: `Custom checkpoint ${idx + 1}`,
        description: `Evidence-backed progress checkpoint ${idx + 1}.`,
      })),
    );
    expect(result.isValid).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it("rejects missing checkpoints and out-of-order numbering", () => {
    const result = validateEightCheckpointSpine([
      { step_number: 1, step_label: "Define scope", description: "Define desired progress." },
      { step_number: 3, step_label: "Prepare context", description: "Prepare before commitment." },
      { step_number: 4, step_label: "Confirm fit", description: "Confirm fit before action." },
    ]);
    expect(result.isValid).toBe(false);
    expect(result.issues.some((issue) => issue.includes("Expected 8 checkpoints"))).toBe(true);
  });

  it("flags solution-prescriptive and non-SDS wording", () => {
    const result = validateEightCheckpointSpine(
      Array.from({ length: 8 }, (_, idx) => ({
        step_number: idx + 1,
        step_label:
          idx === 0
            ? "Launch dashboard"
            : idx === 1
              ? "Acquisition funnel review"
              : `Checkpoint ${idx + 1} action`,
        description:
          idx === 1
            ? "This uses acquisition funnel language and should be rejected."
            : `Description for checkpoint ${idx + 1}.`,
      })),
    );
    expect(result.isValid).toBe(false);
    expect(result.issues.some((issue) => issue.includes("solution-prescriptive"))).toBe(true);
    expect(result.issues.some((issue) => issue.includes("non-SDS process wording"))).toBe(true);
  });
});

describe("deriveMarketDefinitionCanvas", () => {
  it("maps values deterministically from provided context", () => {
    const first = deriveMarketDefinitionCanvas({
      traditionalMarketDefinition: "Mid-market B2B teams scaling repeatable onboarding.",
      executorDetermination: "Customer map and evidence both indicate onboarding leads as executor.",
      jobExecutor: "Onboarding lead",
      chooser: "COO and implementation sponsor",
      functionOfProductStatement: "Help onboarding leads create consistent activation outcomes.",
      otherProductsContext: "Compared against manual onboarding workflows and internal spreadsheets.",
      abstractedJobStatement: "Decision owner can deliver reliable activation outcomes each cycle.",
      jtbd: "When onboarding leads are trying to launch a new account, they want a repeatable path so they can reduce time-to-value.",
    });
    const second = deriveMarketDefinitionCanvas({
      traditionalMarketDefinition: "Mid-market B2B teams scaling repeatable onboarding.",
      executorDetermination: "Customer map and evidence both indicate onboarding leads as executor.",
      jobExecutor: "Onboarding lead",
      chooser: "COO and implementation sponsor",
      functionOfProductStatement: "Help onboarding leads create consistent activation outcomes.",
      otherProductsContext: "Compared against manual onboarding workflows and internal spreadsheets.",
      abstractedJobStatement: "Decision owner can deliver reliable activation outcomes each cycle.",
      jtbd: "When onboarding leads are trying to launch a new account, they want a repeatable path so they can reduce time-to-value.",
    });

    expect(first).toEqual(second);
    expect(first.map((field) => field.key)).toEqual([
      "traditional_market_definition",
      "executor_determination",
      "abstracted_executor",
      "function_of_product_statement",
      "other_products_context",
      "abstracted_job_statement",
      "jtbd",
      "chooser",
    ]);
  });
});
