import { describe, expect, it } from "vitest";
import { buildMarketFitCheckpointSpine } from "@/lib/marketTaxonomy";
import {
  buildCompanyVocabExclusions,
  deriveMarketDefinitionCanvas,
  JTBD_CHECKPOINT_COUNT,
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

describe("buildCompanyVocabExclusions + company-aware validation", () => {
  it("excludes industry terms found in company context fields", () => {
    const exclusions = buildCompanyVocabExclusions([
      "Acme Sourcing Co",
      "Independent cafe operators sourcing a specialty coffee offering for their venue",
      "Identify and commit to a supplier relationship that makes the offering distinctive — evaluating pricing and terms",
      "The venue owner and head buyer",
    ]);
    expect(exclusions.has("supplier")).toBe(true);
    expect(exclusions.has("pricing")).toBe(true);
    expect(exclusions.has("terms")).toBe(true);
    // genuinely prescriptive terms NOT in company context must NOT be excluded
    expect(exclusions.has("dashboard")).toBe(false);
    expect(exclusions.has("feature")).toBe(false);
  });

  it("does not flag industry vocab from company context as solution-prescriptive", () => {
    const exclusions = buildCompanyVocabExclusions([
      "Independent cafe operators sourcing specialty coffee",
      "Identify and commit to a supplier relationship — evaluating pricing and terms for the venue",
    ]);
    const steps = Array.from({ length: 8 }, (_, idx) => ({
      step_number: idx + 1,
      step_label:
        idx === 0 ? "Confirm supplier terms" : idx === 1 ? "Evaluate pricing fit" : `Checkpoint ${idx + 1}`,
      description: `Evidence-backed progress checkpoint ${idx + 1}.`,
    }));
    const result = validateEightCheckpointSpine(steps, exclusions);
    expect(result.isValid).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it("still flags genuinely prescriptive terms not in company context", () => {
    const exclusions = buildCompanyVocabExclusions([
      "Independent cafe operators sourcing specialty coffee",
    ]);
    const steps = Array.from({ length: 8 }, (_, idx) => ({
      step_number: idx + 1,
      step_label: idx === 0 ? "Launch dashboard" : `Checkpoint ${idx + 1}`,
      description: `Evidence-backed progress checkpoint ${idx + 1}.`,
    }));
    const result = validateEightCheckpointSpine(steps, exclusions);
    expect(result.isValid).toBe(false);
    expect(result.issues.some((i) => i.includes("solution-prescriptive"))).toBe(true);
  });
});

describe("manual vocab terms not in PRESCRIPTIVE_TERMS_LIST", () => {
  it("allows step labels containing manual terms even when not present in company context fields", () => {
    // 'dashboard' and 'feature' are in PRESCRIPTIVE_TERMS_LIST.
    // The company context fields don't mention them, so buildCompanyVocabExclusions won't catch them.
    // But if we manually add them to the exclusion set, the validator should accept them.
    const exclusions = new Set(["dashboard", "feature"]);
    const steps = Array.from({ length: 8 }, (_, idx) => ({
      step_number: idx + 1,
      step_label: idx === 0 ? "Review dashboard metrics" : idx === 1 ? "Evaluate feature fit" : `Checkpoint ${idx + 1}`,
      description: `Evidence-backed progress checkpoint ${idx + 1}.`,
    }));
    const result = validateEightCheckpointSpine(steps, exclusions);
    expect(result.isValid).toBe(true);
    expect(result.issues).toEqual([]);
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

  it("normalizes traditional market definition to a standard category-led format when possible", () => {
    const canvas = deriveMarketDefinitionCanvas({
      traditionalMarketDefinition: "Enterprise software for debt collection teams.",
      jobExecutor: "Collections manager",
      chooser: "COO",
      jtbd: "When collections teams are trying to recover balances, they want a repeatable workflow so they can improve recovery rates.",
    });
    const marketField = canvas.find((field) => field.key === "traditional_market_definition");
    expect(marketField?.value).toContain("Category: B2B SaaS.");
    expect(marketField?.value).toContain("Enterprise software for debt collection teams.");
  });

  it("keeps market-fit checkpoint seed compatible with 8-step local draft insertion", () => {
    const seed = buildMarketFitCheckpointSpine("professional-services");
    expect(seed).toHaveLength(JTBD_CHECKPOINT_COUNT);
    for (const step of seed) {
      expect(step.label.trim().length).toBeGreaterThan(0);
      expect(step.description.trim().length).toBeGreaterThan(0);
    }
  });
});
