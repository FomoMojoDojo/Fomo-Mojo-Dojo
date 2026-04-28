import { describe, expect, it } from "vitest";
import {
  DEFAULT_CHECKPOINT_OFFER_WEIGHTS,
  buildCheckpointOffers,
  computeWeightedPriorityScore,
} from "@/lib/checkpointOffers";

function buildCheckpointRows() {
  return Array.from({ length: 8 }, (_, index) => ({
    id: `checkpoint-${index + 1}`,
    journey_key: "customer-cafe-owners-and-specialty-venue-buyers",
    step_number: index + 1,
    step_label:
      index === 0
        ? "Execute onboarding and training"
        : index === 1
          ? "Monitor coffee quality"
          : `Checkpoint ${index + 1}`,
    description: `Description ${index + 1}`,
  }));
}

describe("buildCheckpointOffers", () => {
  it("generates 3 offers per checkpoint and always returns 8 checkpoints", () => {
    const result = buildCheckpointOffers({
      checkpoints: buildCheckpointRows(),
      opportunities: [
        {
          id: "opp-1",
          journey_key: "customer",
          step_number: 1,
          step_label: "Execute onboarding and training",
          outcome: "Improve onboarding readiness for partner cafes",
          opportunity_score: 16,
          priority_tier: "focus",
        },
        {
          id: "opp-2",
          journey_key: "customer",
          step_number: 2,
          step_label: "Monitor coffee quality",
          outcome: "Improve flavor consistency across partner locations",
          opportunity_score: 16,
          priority_tier: "focus",
        },
      ],
      needs: [
        {
          id: "need-1",
          journey_key: "customer",
          step_number: 1,
          step_label: "Execute onboarding and training",
          desired_outcome: "Minimize onboarding errors before first service",
          opportunity_score: 15,
        },
      ],
      strategyContext: {
        where_to_play: "Independent cafes and specialty venues",
        how_to_win: "Enable repeatable quality with strong training systems",
      },
      positioningContext: {
        market_category: "Specialty coffee roasting and supply",
        value_for_customer: "Reliable quality and easier barista execution",
        best_fit_customers: "Cafe owners and venue operators",
      },
    });

    expect(result).toHaveLength(8);
    for (const checkpoint of result) {
      expect(checkpoint.offers).toHaveLength(3);
      expect(checkpoint.offers[0].priority_rank).toBe(1);
      expect(checkpoint.offers[1].priority_rank).toBe(2);
      expect(checkpoint.offers[2].priority_rank).toBe(3);
    }
  });

  it("is deterministic for identical inputs", () => {
    const args = {
      checkpoints: buildCheckpointRows(),
      opportunities: [
        {
          id: "opp-1",
          journey_key: "customer",
          step_number: 1,
          step_label: "Execute onboarding and training",
          outcome: "Improve onboarding readiness for partner cafes",
          opportunity_score: 16,
          priority_tier: "focus",
        },
      ],
      needs: [
        {
          id: "need-1",
          journey_key: "customer",
          step_number: 1,
          step_label: "Execute onboarding and training",
          desired_outcome: "Reduce setup delays",
          opportunity_score: 14,
        },
      ],
      strategyContext: {
        where_to_play: "Partner cafes",
        how_to_win: "Reliable launch support",
      },
      positioningContext: {
        market_category: "Specialty coffee roasting and supply",
      },
    };
    const first = buildCheckpointOffers(args);
    const second = buildCheckpointOffers(args);
    expect(first).toEqual(second);
  });

  it("links opportunities by step number first, then by checkpoint label overlap", () => {
    const result = buildCheckpointOffers({
      checkpoints: [
        {
          id: "cp-1",
          journey_key: "customer-custom-journey",
          step_number: 1,
          step_label: "Execute onboarding and training",
          description: "",
        },
        {
          id: "cp-2",
          journey_key: "customer-custom-journey",
          step_number: 2,
          step_label: "Monitor coffee quality",
          description: "",
        },
      ],
      opportunities: [
        {
          id: "opp-number",
          journey_key: "customer",
          step_number: 1,
          step_label: "Random label",
          outcome: "Other outcome",
          opportunity_score: 12,
          priority_tier: "monitor",
        },
        {
          id: "opp-label",
          journey_key: "customer",
          step_number: null,
          step_label: "Monitor coffee quality each shift",
          outcome: "Improve quality monitoring consistency",
          opportunity_score: 13,
          priority_tier: "focus",
        },
      ],
      needs: [],
      strategyContext: {},
      positioningContext: {},
    });

    const checkpoint1 = result.find((item) => item.checkpoint_number === 1);
    const checkpoint2 = result.find((item) => item.checkpoint_number === 2);
    expect(checkpoint1?.offers[0].linked_opportunity_ids).toContain("opp-number");
    expect(checkpoint2?.offers[0].linked_opportunity_ids).toContain("opp-label");
  });

  it("generates distinct early-stage Cafe Barra offers for checkpoints 1-3", () => {
    const result = buildCheckpointOffers({
      checkpoints: [
        { id: "cp-1", journey_key: "customer-cafe-owners-and-specialty-venue-buyers", step_number: 1, step_label: "Define coffee quality needs", description: "" },
        { id: "cp-2", journey_key: "customer-cafe-owners-and-specialty-venue-buyers", step_number: 2, step_label: "Locate premium coffee suppliers", description: "" },
        { id: "cp-3", journey_key: "customer-cafe-owners-and-specialty-venue-buyers", step_number: 3, step_label: "Prepare evaluation criteria", description: "" },
        { id: "cp-4", journey_key: "customer-cafe-owners-and-specialty-venue-buyers", step_number: 4, step_label: "Confirm supplier fit", description: "" },
        { id: "cp-5", journey_key: "customer-cafe-owners-and-specialty-venue-buyers", step_number: 5, step_label: "Execute onboarding process", description: "" },
        { id: "cp-6", journey_key: "customer-cafe-owners-and-specialty-venue-buyers", step_number: 6, step_label: "Monitor coffee performance", description: "" },
        { id: "cp-7", journey_key: "customer-cafe-owners-and-specialty-venue-buyers", step_number: 7, step_label: "Modify partnership terms", description: "" },
        { id: "cp-8", journey_key: "customer-cafe-owners-and-specialty-venue-buyers", step_number: 8, step_label: "Conclude or renew partnership", description: "" },
      ],
      opportunities: [
        { id: "opp-1", journey_key: "customer", step_number: 1, outcome: "Increase clarity on coffee quality needs", opportunity_score: 13, priority_tier: "focus" },
        { id: "opp-2", journey_key: "customer", step_number: 2, outcome: "Reduce effort to locate premium suppliers", opportunity_score: 14, priority_tier: "focus" },
        { id: "opp-3", journey_key: "customer", step_number: 3, outcome: "Improve evaluation criteria quality", opportunity_score: 12, priority_tier: "focus" },
      ],
      needs: [],
      strategyContext: {
        where_to_play: "Independent cafes and specialty venues",
        how_to_win: "Repeatable quality with partner training",
      },
      positioningContext: {
        market_category: "Specialty coffee roasting and supply",
      },
    });

    const checkpoint1Top = result.find((item) => item.checkpoint_number === 1)?.offers[0]?.title;
    const checkpoint2Top = result.find((item) => item.checkpoint_number === 2)?.offers[0]?.title;
    const checkpoint3Top = result.find((item) => item.checkpoint_number === 3)?.offers[0]?.title;

    expect(checkpoint1Top).toBeTruthy();
    expect(checkpoint2Top).toBeTruthy();
    expect(checkpoint3Top).toBeTruthy();
    expect(new Set([checkpoint1Top, checkpoint2Top, checkpoint3Top]).size).toBe(3);
  });

  it("keeps Cafe Barra checkpoints 2-4 distinct (discover, evaluate, confirm)", () => {
    const result = buildCheckpointOffers({
      checkpoints: [
        { id: "cp-1", journey_key: "customer-cafe-owners-and-specialty-venue-buyers", step_number: 1, step_label: "Define coffee quality needs", description: "" },
        { id: "cp-2", journey_key: "customer-cafe-owners-and-specialty-venue-buyers", step_number: 2, step_label: "Locate premium coffee suppliers", description: "" },
        { id: "cp-3", journey_key: "customer-cafe-owners-and-specialty-venue-buyers", step_number: 3, step_label: "Prepare evaluation criteria", description: "" },
        { id: "cp-4", journey_key: "customer-cafe-owners-and-specialty-venue-buyers", step_number: 4, step_label: "Confirm supplier fit", description: "" },
        { id: "cp-5", journey_key: "customer-cafe-owners-and-specialty-venue-buyers", step_number: 5, step_label: "Execute onboarding process", description: "" },
        { id: "cp-6", journey_key: "customer-cafe-owners-and-specialty-venue-buyers", step_number: 6, step_label: "Monitor coffee performance", description: "" },
        { id: "cp-7", journey_key: "customer-cafe-owners-and-specialty-venue-buyers", step_number: 7, step_label: "Modify partnership terms", description: "" },
        { id: "cp-8", journey_key: "customer-cafe-owners-and-specialty-venue-buyers", step_number: 8, step_label: "Conclude or renew partnership", description: "" },
      ],
      opportunities: [
        { id: "opp-2", journey_key: "customer", step_number: 2, outcome: "Reduce effort to identify premium coffee suppliers", opportunity_score: 14, priority_tier: "focus" },
        { id: "opp-3", journey_key: "customer", step_number: 3, outcome: "Improve supplier evaluation criteria quality", opportunity_score: 12, priority_tier: "focus" },
        { id: "opp-4", journey_key: "customer", step_number: 4, outcome: "Increase confidence in confirming supplier fit", opportunity_score: 14, priority_tier: "focus" },
      ],
      needs: [],
      strategyContext: {
        where_to_play: "Independent cafes and specialty venues",
        how_to_win: "Repeatable quality with partner training",
      },
      positioningContext: {
        market_category: "Specialty coffee roasting and supply",
      },
    });

    const step2 = result.find((item) => item.checkpoint_number === 2)?.offers[0]?.title;
    const step3 = result.find((item) => item.checkpoint_number === 3)?.offers[0]?.title;
    const step4 = result.find((item) => item.checkpoint_number === 4)?.offers[0]?.title;

    expect(step2).toBeTruthy();
    expect(step3).toBeTruthy();
    expect(step4).toBeTruthy();
    expect(new Set([step2, step3, step4]).size).toBe(3);
  });

  it("keeps FomoMojoDojo checkpoints 3-5 distinct (prepare, confirm, execute)", () => {
    const result = buildCheckpointOffers({
      checkpoints: [
        { id: "cp-1", journey_key: "customer", step_number: 1, step_label: "Define decision need", description: "" },
        { id: "cp-2", journey_key: "customer", step_number: 2, step_label: "Locate MojoMap™", description: "" },
        { id: "cp-3", journey_key: "customer", step_number: 3, step_label: "Prepare decision data", description: "" },
        { id: "cp-4", journey_key: "customer", step_number: 4, step_label: "Confirm decision scope", description: "" },
        { id: "cp-5", journey_key: "customer", step_number: 5, step_label: "Execute strategic analysis", description: "" },
        { id: "cp-6", journey_key: "customer", step_number: 6, step_label: "Monitor decision impact", description: "" },
        { id: "cp-7", journey_key: "customer", step_number: 7, step_label: "Modify decision inputs", description: "" },
        { id: "cp-8", journey_key: "customer", step_number: 8, step_label: "Conclude decision cycle", description: "" },
      ],
      opportunities: [
        { id: "opp-3", journey_key: "customer", step_number: 3, outcome: "Reduce time and errors when preparing decision data", opportunity_score: 16, priority_tier: "focus" },
        { id: "opp-4", journey_key: "customer", step_number: 4, outcome: "Increase confidence in verifying decision scope", opportunity_score: 17, priority_tier: "focus" },
        { id: "opp-5", journey_key: "customer", step_number: 5, outcome: "Increase repeatability of analysis", opportunity_score: 13, priority_tier: "focus" },
      ],
      needs: [],
      strategyContext: {
        where_to_play: "SMB and enterprise operators making recurring strategic decisions",
        how_to_win: "Codify repeatable decision workflows with transparent analysis",
      },
      positioningContext: {
        market_category: "Strategic decision support software",
      },
    });

    const step3 = result.find((item) => item.checkpoint_number === 3)?.offers[0]?.title;
    const step4 = result.find((item) => item.checkpoint_number === 4)?.offers[0]?.title;
    const step5 = result.find((item) => item.checkpoint_number === 5)?.offers[0]?.title;

    expect(step3).toBeTruthy();
    expect(step4).toBeTruthy();
    expect(step5).toBeTruthy();
    expect(new Set([step3, step4, step5]).size).toBe(3);
  });
});

describe("computeWeightedPriorityScore", () => {
  it("applies weighted math and rounds to one decimal place", () => {
    const score = computeWeightedPriorityScore(
      {
        opportunity: 80,
        strategic_fit: 60,
        feasibility: 50,
        time_to_impact: 40,
      },
      DEFAULT_CHECKPOINT_OFFER_WEIGHTS,
    );
    expect(score).toBe(65);
  });
});
