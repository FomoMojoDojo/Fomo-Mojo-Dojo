#!/usr/bin/env bash
# GUARD — the LIVE Dify file-analysis workflow is the committed DSL (signed 1a, 2026-09-14: REQUIRED, so the
# repo cannot drift from what is running unnoticed). Exports the published version in-process and compares
# its graph (nodes' data, edges) canonically with supabase/dify-workflows/mojomap-file-analysis.v2.yml.
# Also proves the v2 methodology facts on the LIVE graph: every framework node reads the start node's
# file_text; none references Grounding.text; the Grounding Context node strips missing_information.
set -euo pipefail
cd "$(dirname "$0")/../.."
API=docker-api-1
docker cp scripts/dify-workflows/export_file_analysis.py $API:/tmp/export.py >/dev/null
docker exec -e OUT=/tmp/live.yml $API sh -c 'cd /app/api && .venv/bin/flask shell < /tmp/export.py' 2>/dev/null | grep -o "exported .*" || { echo "FAIL: export"; exit 1; }
docker cp $API:/tmp/live.yml /tmp/dify-live.yml >/dev/null
node - <<'JS'
const yaml = require("js-yaml"); const fs = require("fs");
const canon = (p) => { const d = yaml.load(fs.readFileSync(p, "utf8")); const g = d.workflow.graph;
  const nodes = g.nodes.map((n) => ({ id: n.id, data: n.data })).sort((a, b) => a.id.localeCompare(b.id));
  const edges = g.edges.map((e) => `${e.source}->${e.target}`).sort();
  return { nodes, edges, d }; };
const live = canon("/tmp/dify-live.yml"), repo = canon("supabase/dify-workflows/mojomap-file-analysis.v2.yml");
const j = (x) => JSON.stringify(x);
if (j(live.edges) !== j(repo.edges)) { console.log("FAIL: edges differ\n live", live.edges.join(" "), "\n repo", repo.edges.join(" ")); process.exit(1); }
for (let i = 0; i < Math.max(live.nodes.length, repo.nodes.length); i++) {
  const a = live.nodes[i], b = repo.nodes[i];
  if (!a || !b || a.id !== b.id || j(a.data) !== j(b.data)) { console.log(`FAIL: node ${a?.id ?? "∅"} / ${b?.id ?? "∅"} (${a?.data?.title ?? ""}) differs between live and repo`); process.exit(1); }
}
const byTitle = (t) => live.nodes.find((n) => n.data.title === t);
const START = byTitle("User Input").id, GROUND = byTitle("Grounding").id, CTX = byTitle("Grounding Context");
if (!CTX) { console.log("FAIL: no Grounding Context node live"); process.exit(1); }
// Execute the live node's code on a Grounding read that carries missing_information: the context it emits must not.
const main = new Function(CTX.data.code + "\nreturn main;")();
const out = main({ grounding: JSON.stringify({ summary: "s", evidence: ["e1"], document_signals: ["d"], missing_information: ["financial performance"], confidence: "low", confidence_reason: "thin" }) });
if (typeof out.context !== "string" || /missing_information|financial performance/.test(out.context) || !/"summary": "s"/.test(out.context) || !/e1/.test(out.context)) { console.log("FAIL: Grounding Context does not strip missing_information (or drops the read):", out.context); process.exit(1); }
for (const t of ["April Dunford", "JTBD", "ODI", "Strategy Cascade", "Teresa Torres"]) {
  const s = j(byTitle(t).data.prompt_template);
  if (!s.includes(`{{#${START}.file_text#}}`)) { console.log(`FAIL: ${t} does not read file_text`); process.exit(1); }
  if (s.includes(`{{#${GROUND}.text#}}`) || s.includes("{{Grounding.text}}")) { console.log(`FAIL: ${t} still reads Grounding.text`); process.exit(1); }
  if (!s.includes(`{{#${CTX.id}.context#}}`)) { console.log(`FAIL: ${t} lacks the grounding context alongside`); process.exit(1); }
}
const tor = j(byTitle("Teresa Torres").data.prompt_template);
if (!/absence may motivate, it may not attest/.test(tor)) { console.log("FAIL: Torres gap rule missing"); process.exit(1); }
console.log(`live graph == committed v2 (${live.nodes.length} nodes, ${live.edges.length} edges); frameworks read file_text; Grounding Context strips missing_information; Torres gap rule present`);
JS
echo "GUARD OK"
