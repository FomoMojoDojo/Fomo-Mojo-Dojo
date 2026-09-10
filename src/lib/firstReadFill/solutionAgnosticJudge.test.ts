// Gate 5b — the versioned solution-agnostic judge: key, injection, name-scrub, 3-vote majority.
import { describe, it, expect } from "vitest";
import {
  CRITERION_VERSION, solutionAgnosticKey, buildSolutionLine, buildSolutionAgnosticUser,
  stripTechnologyWords, scrubCompanyName, judgeSolutionAgnosticMajority, loadOfferingItems,
} from "../../../supabase/functions/_shared/solutionAgnosticJudge.ts";
import { sha256Hex, normalizeForHash } from "../../../supabase/functions/_shared/contentIdentity.ts";

const EXECUTOR = "Quantum software developers building applications on quantum computers";
const JTBD = "To build reliable and robust quantum applications that run effectively on quantum hardware.";

describe("versioned key", () => {
  // REGRESSION GUARD — passes under both bodies: the v1 key is byte-identical to the pre-5b key, so
  // every existing market_discovery_verdicts.pair_identity still resolves.
  it("(g5b) REGRESSION GUARD: the v1 key is the legacy key, byte for byte", async () => {
    const legacy = await sha256Hex(`mktsolagn|${normalizeForHash(`${EXECUTOR}|${JTBD}`)}`);
    expect(await solutionAgnosticKey(EXECUTOR, JTBD, 1)).toBe(legacy);
  });
  // RED ON REVERT
  it("(g5b) the current-version key differs from v1 — a v2 lookup can never find a v1 row", async () => {
    expect(CRITERION_VERSION).toBeGreaterThanOrEqual(2);
    expect(await solutionAgnosticKey(EXECUTOR, JTBD)).not.toBe(await solutionAgnosticKey(EXECUTOR, JTBD, 1));
    expect(await solutionAgnosticKey(EXECUTOR, JTBD)).toBe(await solutionAgnosticKey(EXECUTOR, JTBD, CRITERION_VERSION));
  });
});

describe("injection", () => {
  const ITEMS = [
    { kind_hint: "platform", label: "Brand OS", statement: "Brand OS structures your brand into machine-readable intelligence for brand builders." },
    { kind_hint: "service", label: "Assistant AI content creator", statement: "ignored for service items" },
    { kind_hint: "product", label: "Rainmaker Companion AI product", statement: "Lumio's first AI product, Rainmaker Companion, helps partners." },
    { kind_hint: "format", label: "Canvas visual strategy sandbox", statement: "excluded kind" },
  ];
  // RED ON REVERT
  it("(g5b) a statement containing the company name renders 'the company'", () => {
    expect(scrubCompanyName("Lumio's first AI product, built by Lumio.", "Lumio"))
      .toBe("the company's first AI product, built by the company.");
  });
  it("(g5b) the line carries label — statement for product/platform, label only for service, nothing for format", () => {
    const line = buildSolutionLine(ITEMS, "Lumio");
    expect(line).toContain("Brand OS — Brand OS structures your brand into machine-readable intelligence");
    expect(line).toContain("Assistant content creator");
    expect(line).not.toContain("ignored for service items");
    expect(line).not.toContain("Canvas");
    expect(line).toContain("Rainmaker Companion product — the company's first product, Rainmaker Companion, helps partners");
  });
  it("(g5b) strip: bare technology words and -powered/-driven/-based/-enabled compounds go; system/tool/service/platform stay", () => {
    expect(stripTechnologyWords("AI-powered e-discovery platform redesign")).toBe("e-discovery platform redesign");
    expect(stripTechnologyWords("Deltaflow QEC system")).toBe("Deltaflow QEC system");
    expect(stripTechnologyWords("Brand Check verification tool")).toBe("Brand Check verification tool");
    expect(stripTechnologyWords("Strategic management consultancy with AI")).toBe("Strategic management consultancy");
    expect(stripTechnologyWords("Building internal evidence-based decision practice")).toBe("Building internal decision practice");
  });
  it("(g5b) no items ⇒ the line is omitted, and the user prompt still carries no company name", () => {
    expect(buildSolutionLine([], "Riverlane")).toBe("");
    const user = buildSolutionAgnosticUser("", EXECUTOR, JTBD);
    expect(user).not.toContain("COMPANY:");
    expect(user).not.toContain("Riverlane");
    expect(user).toContain("If the company's solution category did not exist, would this job read the same?");
  });
  it("(g5b) loadOfferingItems reads through the injected seam", async () => {
    const items = await loadOfferingItems(async () => ({ items: ITEMS }), "co");
    expect(items).toHaveLength(4);
    expect(await loadOfferingItems(async () => null, "co")).toEqual([]);
  });
});

describe("3-vote majority", () => {
  // RED ON REVERT
  it("(g5b) 2 accepted / 1 rejected ⇒ accepted, tally '2-1 accepted', all three reasons kept", async () => {
    const seq = [
      { solutionFree: true, reason: "outcome, not means" },
      { solutionFree: false, reason: "mentions AI" },
      { solutionFree: true, reason: "reads the same without it" },
    ];
    let i = 0;
    const v = await judgeSolutionAgnosticMajority(async () => seq[i++]);
    expect(v.solutionFree).toBe(true);
    expect(v.tally).toBe("2-1 accepted");
    expect(v.votes).toHaveLength(3);
    expect(v.reason).toBe("outcome, not means"); // first vote on the winning side
  });
  it("(g5b) 1 accepted / 2 rejected ⇒ rejected, '2-1 rejected'", async () => {
    const seq = [{ solutionFree: false, reason: "names the product" }, { solutionFree: true, reason: "x" }, { solutionFree: false, reason: "y" }];
    let i = 0;
    const v = await judgeSolutionAgnosticMajority(async () => seq[i++]);
    expect(v.solutionFree).toBe(false);
    expect(v.tally).toBe("2-1 rejected");
    expect(v.reason).toBe("names the product");
  });
  it("(g5b) unanimous ⇒ '3-0'", async () => {
    const v = await judgeSolutionAgnosticMajority(async () => ({ solutionFree: false, reason: "r" }));
    expect(v.tally).toBe("3-0 rejected");
  });
});
