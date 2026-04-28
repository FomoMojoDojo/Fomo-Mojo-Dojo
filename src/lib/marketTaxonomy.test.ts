import { describe, expect, it } from "vitest";
import {
  STRATEGIC_MARKET_CATEGORIES,
  bestFitStrategicMarketCategory,
  buildMarketFitCheckpointSpine,
} from "@/lib/marketTaxonomy";

describe("market taxonomy category templates", () => {
  it("defines exactly 8 non-empty checkpoints for every category", () => {
    for (const category of STRATEGIC_MARKET_CATEGORIES) {
      expect(category.checkpointTemplate).toHaveLength(8);
      for (const checkpoint of category.checkpointTemplate) {
        expect(checkpoint.label.trim().length).toBeGreaterThan(0);
        expect(checkpoint.description.trim().length).toBeGreaterThan(0);
      }
    }
  });
});

describe("bestFitStrategicMarketCategory", () => {
  it("maps representative market signals to deterministic category keys", () => {
    const cases: Array<{ input: string; expectedKey: string }> = [
      { input: "enterprise software subscriptions for operations teams", expectedKey: "b2b-saas" },
      { input: "consumer mobile app for creators", expectedKey: "b2c-software" },
      { input: "advisory consulting engagements for transformation", expectedKey: "professional-services" },
      { input: "payment processing and lending services", expectedKey: "financial-services" },
      { input: "patient care coordination for clinics", expectedKey: "healthcare-services" },
      { input: "student training and curriculum delivery", expectedKey: "education-services" },
      { input: "online retail checkout optimization", expectedKey: "retail-ecommerce" },
      { input: "two-sided marketplace supply and demand matching", expectedKey: "marketplace" },
      { input: "factory production and quality control", expectedKey: "manufacturing-industrial" },
      { input: "fleet routing and shipment delivery", expectedKey: "logistics-transportation" },
      { input: "restaurant guest service and menu operations", expectedKey: "hospitality-foodservice" },
      { input: "property leasing and tenant operations", expectedKey: "real-estate-property-services" },
      { input: "grid reliability and electricity operations", expectedKey: "energy-utilities" },
      { input: "carrier broadband network services", expectedKey: "telecommunications" },
      { input: "streaming content audience growth", expectedKey: "media-entertainment" },
      { input: "municipal agency public service delivery", expectedKey: "public-sector-government" },
      { input: "donor-funded mission impact programs", expectedKey: "nonprofit-social-impact" },
      { input: "miscellaneous recurring business services", expectedKey: "general-commercial-services" },
    ];

    for (const testCase of cases) {
      expect(bestFitStrategicMarketCategory(testCase.input).key).toBe(testCase.expectedKey);
    }
  });
});

describe("buildMarketFitCheckpointSpine", () => {
  it("returns the category template for each category key and label", () => {
    for (const category of STRATEGIC_MARKET_CATEGORIES) {
      expect(buildMarketFitCheckpointSpine(category.key)).toEqual(category.checkpointTemplate);
      expect(buildMarketFitCheckpointSpine(category.label)).toEqual(category.checkpointTemplate);
    }
  });

  it("falls back to general commercial services for unknown input", () => {
    const fallback = STRATEGIC_MARKET_CATEGORIES.find((category) => category.key === "general-commercial-services");
    expect(fallback).toBeTruthy();
    expect(buildMarketFitCheckpointSpine("unknown category phrase")).toEqual(fallback?.checkpointTemplate);
    expect(buildMarketFitCheckpointSpine("")).toEqual(fallback?.checkpointTemplate);
  });
});
