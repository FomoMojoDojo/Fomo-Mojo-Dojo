// G2 (2026-11-16): the JTBD and ODI framework prompts, as committed in the file-analysis workflow DSL (which
// IS the live workflow — rule 1a; dify-workflow-guard proves the live graph equals this file).
//   JTBD: the job executor is the client's customer; reader verbs are banned; a document with no customer
//         content returns nothing; a step the company itself carries out is not the customer's job.
//   ODI:  direction + metric + object of control; ONE negative example; the "even when … missing" and
//         "still return useful" pushes are gone; no past client's name in the subject rule.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import yaml from "js-yaml";

const dsl = yaml.load(readFileSync(join(__dirname, "..", "..", "..", "supabase/dify-workflows/mojomap-file-analysis.v2.yml"), "utf8")) as {
  workflow: { graph: { nodes: Array<{ data: { title: string; prompt_template?: Array<{ role: string; text: string }> } }> } };
};
const userPrompt = (title: string) => {
  const node = dsl.workflow.graph.nodes.find((n) => n.data.title === title);
  return (node?.data.prompt_template ?? []).filter((p) => p.role === "user").map((p) => p.text).join("\n");
};

describe("JTBD", () => {
  const t = userPrompt("JTBD");
  it("names the job executor as the client's customer", () => {
    expect(t).toContain("The job executor is always the client's customer");
    expect(t).not.toMatch(/customer or team work|customer\/team action/);
  });
  it("bans reader verbs", () => expect(t).toContain("do not begin a claim with understand, analyze, review or assess"));
  it("returns nothing for a document with no customer content", () =>
    expect(t).toMatch(/no content about the client's customer doing their job .* returns an empty findings array/));
  it("keeps the company's own steps out of the customer's job", () =>
    expect(t).toContain("a step the company or its staff carries out"));
});

describe("ODI", () => {
  const t = userPrompt("ODI");
  it("requires direction, metric and object of control", () =>
    expect(t).toMatch(/a direction \(minimize or increase\), a metric .* and the object of control/));
  it("keeps exactly one negative example", () => expect(t.match(/Not an outcome:/g) ?? []).toHaveLength(1));
  it.each(["even when formal ODI survey evidence is missing", "still return useful ODI findings", "still return outcome-oriented findings", "Cafe Barra"])(
    "no longer says %s", (line) => expect(t).not.toContain(line));
  it("returns nothing when the file states no customer outcome, and never the company's own targets", () => {
    expect(t).toContain("if the file states no customer desired outcome in its own words, return an empty findings array");
    expect(t).toContain("a target the company sets for its own results");
  });
});
