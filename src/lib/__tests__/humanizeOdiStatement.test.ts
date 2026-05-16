import { describe, it, expect } from "vitest";
import { humanizeOdiStatement } from "../humanizeOdiStatement";

describe("disruption / risk / chance patterns", () => {
  it("cafe barra bean quality — disruption to X when Y", () => {
    const result = humanizeOdiStatement(
      "Minimize the disruption to customer-facing drink quality when the roaster transitions to a new season's origin beans",
    );
    expect(result).toBe("When switching to new seasonal beans, it's hard to protect drink quality");
  });

  it("disruption to X when Y — generic", () => {
    const result = humanizeOdiStatement("Minimize the disruption to operations when switching vendors");
    expect(result).toBe("When switching vendors, it's hard to protect operations");
  });

  it("disruption to X (no when)", () => {
    const result = humanizeOdiStatement("Minimize the disruption to the onboarding process");
    expect(result).toBe("It's hard to protect the onboarding process");
  });

  it("risk of X when Y", () => {
    const result = humanizeOdiStatement("Minimize the risk of quality issues when scaling production");
    expect(result).toBe("When scaling production, it's hard to protect quality issues");
  });

  it("chance of X (no when)", () => {
    const result = humanizeOdiStatement("Minimize the chance of customer churn");
    expect(result).toBe("It's hard to protect customer churn");
  });
});

describe("existing patterns still work", () => {
  it("time when not working", () =>
    expect(humanizeOdiStatement("Minimize the time to recover when your competitor research is not working")).toContain(
      "isn't working",
    ));

  it("time when", () =>
    expect(humanizeOdiStatement("Minimize the time to onboard a customer when they request support")).toContain(
      "it takes too long",
    ));

  it("variation", () =>
    expect(humanizeOdiStatement("Minimize variation in delivery time")).toBe("Delivery time is inconsistent"));
});
