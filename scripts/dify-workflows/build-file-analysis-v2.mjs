#!/usr/bin/env node
// Builds supabase/dify-workflows/mojomap-file-analysis.v2.yml FROM the committed v1 export (never from the
// live instance), so the methodology change is a reviewable, reproducible transform. Operator rulings
// 2026-09-14 (all signed):
//   1. the five framework nodes consume the REAL file_text; Grounding's read travels ALONGSIDE it, never in
//      its place (v1 pasted {{#Grounding.text#}} into all three prompt slots);
//   3. Grounding keeps emitting missing_information, but it can NEVER reach a framework's evidence slot —
//      a code node "Grounding Context" strips it structurally before the frameworks see the read;
//   4. Torres: a gap may MOTIVATE an opportunity finding, but that finding's evidence must be EMPTY.
//      Absence may motivate; it may not attest.
// Prompt bodies are otherwise untouched. Model, nodes, edges and features unchanged except the one added node.
import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";

const root = path.resolve(new URL(".", import.meta.url).pathname, "../..");
const v1Path = path.join(root, "supabase/dify-workflows/mojomap-file-analysis.v1.yml");
const v2Path = path.join(root, "supabase/dify-workflows/mojomap-file-analysis.v2.yml");
const d = yaml.load(fs.readFileSync(v1Path, "utf8"));
const g = d.workflow.graph;
const byTitle = (t) => g.nodes.find((n) => n.data.title === t);
const START = byTitle("User Input").id;          // 1777861850698
const GROUNDING = byTitle("Grounding").id;       // 1777908051953
const FRAMEWORKS = ["April Dunford", "JTBD", "ODI", "Strategy Cascade", "Teresa Torres"].map(byTitle);
const merge = byTitle("Framework Merge");
const CONTEXT_ID = "1789000000001"; // new node id (Dify ids are epoch-ms strings; any unique string is valid)

// ── the new code node: Grounding's read WITHOUT missing_information ──
const contextNode = {
  data: {
    code: `function main({ grounding }) {
  let g = {};
  try { g = typeof grounding === "string" ? JSON.parse(grounding) : (grounding || {}); } catch { g = {}; }
  // The frameworks may know what the read found — never what it found missing (ruling 3, 2026-09-14).
  const context = {
    summary: typeof g.summary === "string" ? g.summary : "",
    evidence: Array.isArray(g.evidence) ? g.evidence : [],
    document_signals: Array.isArray(g.document_signals) ? g.document_signals : [],
    confidence: typeof g.confidence === "string" ? g.confidence : "low",
    confidence_reason: typeof g.confidence_reason === "string" ? g.confidence_reason : "",
  };
  return { context: JSON.stringify(context, null, 2) };
}`,
    code_language: "javascript",
    outputs: { context: { children: null, type: "string" } },
    selected: false,
    title: "Grounding Context",
    type: "code",
    variables: [{ value_selector: [GROUNDING, "text"], value_type: "string", variable: "grounding" }],
  },
  height: 52,
  id: CONTEXT_ID,
  position: { x: byTitle("Grounding").position.x + 300, y: byTitle("Grounding").position.y },
  positionAbsolute: { x: byTitle("Grounding").position.x + 300, y: byTitle("Grounding").position.y },
  selected: false,
  sourcePosition: "right",
  targetPosition: "left",
  type: "custom",
  width: 242,
};
g.nodes.push(contextNode);
// edges: Grounding → Context; Context → each framework (replacing Grounding → framework)
const edge = (source, target, sourceType, targetType) => ({
  data: { isInLoop: false, sourceType, targetType },
  id: `${source}-source-${target}-target`, source, sourceHandle: "source", target, targetHandle: "target", type: "custom", zIndex: 0,
});
g.edges = g.edges.filter((e) => !(e.source === GROUNDING && FRAMEWORKS.some((f) => f.id === e.target)));
g.edges.push(edge(GROUNDING, CONTEXT_ID, "llm", "code"));
for (const f of FRAMEWORKS) g.edges.push(edge(CONTEXT_ID, f.id, "code", "llm"));

// ── prompt heads: the file, then the read ALONGSIDE ──
const HEAD = (extra) => `Uploaded file name:
{{#${START}.file_name#}}

Uploaded file content:
{{#${START}.file_text#}}
${extra}
Grounded file summary and evidence (a prior read of the same file — context only; it is not the file, and nothing in it may be quoted as evidence):
{{#${CONTEXT_ID}.context#}}
`;
const EVIDENCE_RULE = `- evidence must be a verbatim sentence or passage copied from "Uploaded file content" above — never from the grounded read, never a paraphrase, never a description of what the file lacks
- if no sentence in the file supports a finding, set evidence to "" (empty string) and lower confidence`;
const TORRES_RULE = `- a gap (something the file does NOT state) may motivate an opportunity finding; that finding's evidence must then be "" (empty string) — absence may motivate, it may not attest
- never write "missing_information", "not stated", "no mention" or any description of an absence in evidence`;

for (const f of FRAMEWORKS) {
  const user = f.data.prompt_template.find((m) => m.role === "user");
  const t = user.text;
  // v1 head: three (ODI: four) slots each filled with {{#Grounding.text#}} (JTBD carries a stray "/"; Dunford's third slot is the literal {{Grounding.text}}).
  const headEnd = t.indexOf("\nAnalyze this file");
  if (headEnd < 0) throw new Error(`no analysis body in ${f.data.title}`);
  const body = t.slice(headEnd + 1);
  const extra = f.data.title === "ODI" ? `\nSource type:\n{{#${START}.source_type#}}\n` : "";
  let next = HEAD(extra) + "\n" + body;
  // rules: append the evidence rule (all five) and the gap rule (Torres) to the node's trailing Rules block
  const rulesIdx = next.lastIndexOf("\nRules:");
  if (rulesIdx < 0) throw new Error(`no Rules block in ${f.data.title}`);
  const rules = [EVIDENCE_RULE, ...(f.data.title === "Teresa Torres" ? [TORRES_RULE] : [])].join("\n");
  next = next.slice(0, rulesIdx + "\nRules:".length) + "\n" + rules + next.slice(rulesIdx + "\nRules:".length);
  if (next.includes(`{{#${GROUNDING}.text#}}`) || next.includes("{{Grounding.text}}")) throw new Error(`${f.data.title} still references Grounding directly`);
  user.text = next;
}

fs.writeFileSync(v2Path, yaml.dump(d, { lineWidth: -1, noRefs: true, quotingType: "'" }));
console.log("wrote", path.relative(root, v2Path));
