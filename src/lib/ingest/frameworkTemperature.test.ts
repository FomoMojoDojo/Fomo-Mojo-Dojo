// SP-F45 (operator ruling 2026-11-17): the file-analysis workflow's six framework nodes run at temperature
// 0.2 (was 0.7); Adjudication stays at 0. The DSL file IS the workflow that is published (rule 1a), so the
// value is pinned here, on the committed file, for every file-analysis DSL that carries the ruling.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import yaml from "js-yaml";

const FRAMEWORK_NODES = ["Grounding", "April Dunford", "JTBD", "ODI", "Teresa Torres", "Strategy Cascade"];
const DSLS = ["supabase/dify-workflows/candidates/mojomap-file-analysis.v2.focus.yml"];

type Dsl = { workflow: { graph: { nodes: Array<{ data: { type: string; title: string; model?: { completion_params?: { temperature?: number } } } }> } } };

describe.each(DSLS)("%s", (file) => {
  const dsl = yaml.load(readFileSync(join(__dirname, "..", "..", "..", file), "utf8")) as Dsl;
  const llm = dsl.workflow.graph.nodes.filter((n) => n.data.type === "llm");
  const temp = (title: string) => llm.find((n) => n.data.title === title)?.data.model?.completion_params?.temperature;

  it.each(FRAMEWORK_NODES)("%s runs at temperature 0.2", (title) => expect(temp(title)).toBe(0.2));
  it("Adjudication stays at temperature 0", () => expect(temp("Adjudication")).toBe(0));
  it("has exactly these seven LLM nodes", () =>
    expect(llm.map((n) => n.data.title).sort()).toEqual([...FRAMEWORK_NODES, "Adjudication"].sort()));
});
