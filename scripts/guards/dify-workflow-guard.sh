#!/usr/bin/env bash
# GUARD — the LIVE Dify workflows are the committed DSLs (signed 1a, 2026-09-14: REQUIRED, so the
# repo cannot drift from what is running unnoticed). Exports each published version in-process and compares
# its graph (nodes' data, edges) canonically with the committed file.
#
# TWO WORKFLOWS (Q6, ruling 2026-11-06):
#   file-analysis  app 2b694256… → supabase/dify-workflows/mojomap-file-analysis.v2.yml
#   mojo-analysis  app 5db4c6b2… → supabase/dify-workflows/mojomap-mojo-analysis.v1.yml
# For mojo-analysis the guard additionally asserts THE OPTION B FACT: every llm node runs on
# langgenius/ollama/ollama, so the workflow — which GETs company, inputs, job steps, opportunities,
# positioning, strategic problems and strategy cascades from our REST — reaches no outside model.
#
# CREDENTIALS ARE REDACTED ON BOTH SIDES. Dify's include_secret=False strips only its own
# environment-variable secrets; the service key typed into the mojo-analysis http-request nodes'
# `headers` strings comes out of the exporter VERBATIM (14 occurrences, found 2026-11-06 before any
# commit). scripts/dify-workflows/redact-dsl.cjs neutralises those values on the live export and the
# committed file alike, so the comparison still catches a repointed model, a changed URL or an edited
# prompt — it only stops the guard from requiring a live key to sit in git.
# Also proves the v2 methodology facts on the LIVE graph: every framework node reads the start node's
# file_text; none references Grounding.text; the Grounding Context node strips missing_information.
set -euo pipefail
cd "$(dirname "$0")/../.."
API=docker-api-1

# C1 (ruling, 2026-11-06): THE GUARD CLEANS UP ITS OWN EXPORTS.
# The mojo-analysis export carries the Supabase service key verbatim in its http-request nodes'
# `headers` strings — Dify's include_secret=False strips only its own environment-variable secrets.
# Every run therefore writes a live credential to /tmp here AND to /tmp inside the API container, and
# before this trap each run left both behind. Same discipline as the network guard's listeners: a
# guard that opens something restores it, on every exit path including a failure.
cleanup_exports() {
  rm -f /tmp/dify-live.yml /tmp/dify-mojo-live.yml
  docker exec "$API" sh -c 'rm -f /tmp/live.yml /tmp/mojo-live.yml /tmp/export.py' >/dev/null 2>&1 || true
}
trap cleanup_exports EXIT
docker cp scripts/dify-workflows/export_file_analysis.py $API:/tmp/export.py >/dev/null
docker exec -e OUT=/tmp/live.yml $API sh -c 'cd /app/api && .venv/bin/flask shell < /tmp/export.py' 2>/dev/null | grep -o "exported .*" || { echo "FAIL: export"; exit 1; }
docker cp $API:/tmp/live.yml /tmp/dify-live.yml >/dev/null
# Q6: the second workflow, same exporter, its own APP_ID.
docker exec -e OUT=/tmp/mojo-live.yml -e APP_ID=5db4c6b2-793b-4d49-8ca7-12f379956a22 $API sh -c 'cd /app/api && .venv/bin/flask shell < /tmp/export.py' 2>/dev/null | grep -o "exported .*" || { echo "FAIL: export (mojo-analysis)"; exit 1; }
docker cp $API:/tmp/mojo-live.yml /tmp/dify-mojo-live.yml >/dev/null
node - <<'JS'
const yaml = require("js-yaml"); const fs = require("fs");
const { redact } = require(process.cwd() + "/scripts/dify-workflows/redact-dsl.cjs");
// Q6: redact BEFORE parsing, identically on both sides.
const canon = (p) => { const d = yaml.load(redact(fs.readFileSync(p, "utf8"))); const g = d.workflow.graph;
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

// ── Q6 (2026-11-06): mojo-analysis — committed DSL present, matches live, and ALL-LOCAL ──────────
const REPO_MOJO = "supabase/dify-workflows/mojomap-mojo-analysis.v1.yml";
if (!fs.existsSync(REPO_MOJO)) { console.log(`FAIL: ${REPO_MOJO} is missing — the live mojo-analysis workflow is uncommitted`); process.exit(1); }
const mLive = canon("/tmp/dify-mojo-live.yml"), mRepo = canon(REPO_MOJO);
if (j(mLive.edges) !== j(mRepo.edges)) { console.log("FAIL: mojo-analysis edges differ\n live", mLive.edges.join(" "), "\n repo", mRepo.edges.join(" ")); process.exit(1); }
for (let i = 0; i < Math.max(mLive.nodes.length, mRepo.nodes.length); i++) {
  const a = mLive.nodes[i], b = mRepo.nodes[i];
  if (!a || !b || a.id !== b.id || j(a.data) !== j(b.data)) { console.log(`FAIL: mojo-analysis node ${a?.id ?? "\u2205"} / ${b?.id ?? "\u2205"} (${a?.data?.title ?? ""}) differs between live and repo`); process.exit(1); }
}
// THE OPTION B FACT, asserted on the LIVE graph (not the committed copy): every llm node is local.
const mLlm = mLive.nodes.filter((n) => n.data?.type === "llm");
if (mLlm.length === 0) { console.log("FAIL: mojo-analysis has no llm nodes — the check would be vacuous"); process.exit(1); }
for (const n of mLlm) {
  const prov = n.data?.model?.provider;
  if (prov !== "langgenius/ollama/ollama") { console.log(`FAIL: mojo-analysis llm node "${n.data?.title}" runs on ${prov} — not langgenius/ollama/ollama`); process.exit(1); }
}
// No tool / agent node could add an egress the model-provider check would not see.
const mBadKinds = [...new Set(mLive.nodes.map((n) => n.data?.type))].filter((t) => ["tool", "agent", "plugin"].includes(t));
if (mBadKinds.length) { console.log(`FAIL: mojo-analysis carries ${mBadKinds.join("/")} node(s) — an egress this guard does not inspect`); process.exit(1); }
// The redaction must have actually fired — otherwise a future export could smuggle a live key into git.
if (/sb_secret_(?!REDACTED)/.test(redact(fs.readFileSync(REPO_MOJO, "utf8")))) { console.log(`FAIL: ${REPO_MOJO} carries an unredacted sb_secret`); process.exit(1); }
console.log(`live mojo graph == committed v1 (${mLive.nodes.length} nodes, ${mLive.edges.length} edges); all ${mLlm.length} llm nodes on langgenius/ollama/ollama; no tool/agent nodes; no unredacted secret`);
JS
echo "GUARD OK"
