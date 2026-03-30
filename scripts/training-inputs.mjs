#!/usr/bin/env node
import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const ROOT = process.cwd();
const TRAINING_DIR = path.join(ROOT, "Training_Inputs");
const DOCS_DIR = path.join(ROOT, "docs", "training-inputs");
const STATE_FILE = path.join(DOCS_DIR, "state.json");
const PROPOSAL_JSON = path.join(DOCS_DIR, "proposed-changes.json");
const PROPOSAL_MD = path.join(DOCS_DIR, "proposed-changes.md");
const ACTIVE_SOURCES_JSON = path.join(DOCS_DIR, "active-sources.json");
const AGENT_CONTEXT_MD = path.join(DOCS_DIR, "agent-context.md");
const OLLAMA_CONTEXT_TXT = path.join(DOCS_DIR, "ollama-context.txt");

const HELP = `
Usage:
  node scripts/training-inputs.mjs review
  node scripts/training-inputs.mjs status
  node scripts/training-inputs.mjs accept --yes

Notes:
  - review/status generates a proposal only (no active changes applied)
  - accept requires --yes and only applies the latest reviewed proposal
`.trim();

function normalizeRel(from, fullPath) {
  return path.relative(from, fullPath).split(path.sep).join("/");
}

function tagsFor(fileName) {
  const text = fileName.toLowerCase();
  const tags = new Set();

  if (text.includes("strategy by design") || text.includes("(sxd)") || text.includes("sxd")) {
    tags.add("sxd_playbook");
  }
  if (
    text.includes("market validation") ||
    text.includes("unlocking product innovation from the inside")
  ) {
    tags.add("market_validation");
  }
  if (text.includes("cards_prototype") || text.includes("strategic goal cards")) {
    tags.add("strategic_goal_cards");
  }

  if (text.includes("jtbd") || text.includes("odi") || text.includes("jobs-to-be-done")) tags.add("jtbd_odi");
  if (
    text.includes("p2w") ||
    text.includes("where-to-play") ||
    text.includes("where_to_play") ||
    text.includes("how-to-win") ||
    text.includes("how_to_win") ||
    text.includes("strategy") ||
    text.includes("cascade")
  ) {
    tags.add("strategy_choices");
  }
  if (
    text.includes("position") ||
    text.includes("category") ||
    text.includes("value") ||
    text.includes("unique") ||
    text.includes("tagline")
  ) {
    tags.add("positioning");
  }
  if (
    text.includes("heath") ||
    text.includes("switch") ||
    text.includes("upstream") ||
    text.includes("decisive") ||
    text.includes("wrap") ||
    text.includes("made-to-stick") ||
    text.includes("elevator") ||
    text.includes("moment")
  ) {
    tags.add("behavior_change");
  }
  if (
    text.includes("sprint") ||
    text.includes("workshop") ||
    text.includes("aj&smart") ||
    text.includes("checklist") ||
    text.includes("preparation")
  ) {
    tags.add("facilitation");
  }
  if (text.includes("unite")) tags.add("unite_playbook");

  if (tags.size === 0) tags.add("general_framework");
  return [...tags];
}

function impactsFor(tags) {
  const impacts = new Set();

  if (tags.includes("sxd_playbook")) {
    impacts.add("Diagnose/Focus/Flow stage guidance: strategy-execution alignment and rituals");
  }
  if (tags.includes("market_validation")) {
    impacts.add("Routes/opportunities: interest vs commitment validation and decision pathways");
  }
  if (tags.includes("strategic_goal_cards")) {
    impacts.add("Focus prioritization: defend/grow/expand strategic goal card coherence");
  }

  if (tags.includes("jtbd_odi")) {
    impacts.add("Job Steps / Opportunities: ODI wording and evidence expectations");
  }
  if (tags.includes("strategy_choices")) {
    impacts.add("Strategy + Positioning: where-to-play/category and how-to-win/attributes alignment");
  }
  if (tags.includes("positioning")) {
    impacts.add("Positioning prompts: alternatives, differentiation, category framing quality");
  }
  if (tags.includes("behavior_change")) {
    impacts.add("Routes / messaging: clarity, decision framing, action language");
  }
  if (tags.includes("facilitation")) {
    impacts.add("Process playbooks: interview/sprint cadence and workshop structure");
  }
  if (tags.includes("unite_playbook")) {
    impacts.add("Methodology docs: stage definitions and operating standards");
  }
  if (tags.includes("general_framework")) {
    impacts.add("General methodology interpretation");
  }

  return [...impacts];
}

async function fileHash(fullPath) {
  const data = await fs.readFile(fullPath);
  return crypto.createHash("sha256").update(data).digest("hex");
}

async function exists(fullPath) {
  try {
    await fs.access(fullPath);
    return true;
  } catch {
    return false;
  }
}

async function walkFiles(dir) {
  const out = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    const rel = normalizeRel(TRAINING_DIR, full);

    if (rel.startsWith("summaries/")) continue;

    if (entry.isDirectory()) {
      out.push(...(await walkFiles(full)));
      continue;
    }
    if (!entry.isFile()) continue;
    out.push(full);
  }
  return out;
}

async function scanTrainingInputs() {
  const all = await walkFiles(TRAINING_DIR);
  const files = [];

  for (const fullPath of all) {
    const rel = normalizeRel(TRAINING_DIR, fullPath);
    const stat = await fs.stat(fullPath);
    const sha256 = await fileHash(fullPath);
    const tags = tagsFor(rel);
    const impacts = impactsFor(tags);
    const summaryRel = `summaries/${rel}.md`;
    const summaryPath = path.join(TRAINING_DIR, summaryRel);
    const summaryExists = await exists(summaryPath);

    files.push({
      path: rel,
      size_bytes: stat.size,
      mtime_ms: stat.mtimeMs,
      sha256,
      tags,
      impacts,
      summary_path: summaryRel,
      summary_exists: summaryExists,
    });
  }

  files.sort((a, b) => a.path.localeCompare(b.path));
  return files;
}

function digestFiles(files) {
  const h = crypto.createHash("sha256");
  for (const file of files) {
    h.update(`${file.path}|${file.sha256}\n`);
  }
  return h.digest("hex");
}

async function readJson(filePath) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function compare(previousState, currentFiles) {
  const previousFiles = Array.isArray(previousState?.files) ? previousState.files : [];
  const prev = new Map(previousFiles.map((item) => [item.path, item]));
  const cur = new Map(currentFiles.map((item) => [item.path, item]));

  const added = [];
  const changed = [];
  const removed = [];
  const unchanged = [];

  for (const file of currentFiles) {
    const old = prev.get(file.path);
    if (!old) {
      added.push(file);
    } else if (old.sha256 !== file.sha256) {
      changed.push(file);
    } else {
      unchanged.push(file);
    }
  }

  for (const old of previousFiles) {
    if (!cur.has(old.path)) removed.push(old);
  }

  return { added, changed, removed, unchanged };
}

function renderProposalMarkdown(proposal) {
  const { comparison } = proposal;
  const lines = [];
  lines.push("# Training Inputs: Proposed Changes");
  lines.push("");
  lines.push(`Generated: ${proposal.generated_at}`);
  lines.push("");
  lines.push("This proposal is review-only. Nothing is active until acceptance.");
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- Added: ${comparison.added.length}`);
  lines.push(`- Changed: ${comparison.changed.length}`);
  lines.push(`- Removed: ${comparison.removed.length}`);
  lines.push(`- Unchanged: ${comparison.unchanged.length}`);
  lines.push(`- Files with summaries: ${proposal.current.files.filter((f) => f.summary_exists).length} / ${proposal.current.files.length}`);
  lines.push("");

  const pending = [
    ...comparison.added.map((f) => ({ status: "added", ...f })),
    ...comparison.changed.map((f) => ({ status: "changed", ...f })),
    ...comparison.removed.map((f) => ({ status: "removed", ...f })),
  ];

  if (pending.length === 0) {
    lines.push("## Pending File Changes");
    lines.push("");
    lines.push("No pending file changes.");
    lines.push("");
  } else {
    lines.push("## Pending File Changes");
    lines.push("");
    lines.push("| Status | File | Tags | Impacts | Summary |");
    lines.push("|---|---|---|---|---|");
    for (const file of pending) {
      const tags = Array.isArray(file.tags) ? file.tags.join(", ") : "n/a";
      const impacts = Array.isArray(file.impacts) ? file.impacts.join("; ") : "n/a";
      const summary = file.summary_exists ? "yes" : "missing";
      lines.push(`| ${file.status} | ${file.path} | ${tags} | ${impacts} | ${summary} |`);
    }
    lines.push("");
  }

  const impactSet = new Set();
  for (const file of [...comparison.added, ...comparison.changed]) {
    for (const impact of file.impacts || []) {
      impactSet.add(impact);
    }
  }

  lines.push("## Process Impact Preview");
  lines.push("");
  if (impactSet.size === 0) {
    lines.push("- No framework/process impact expected from current file changes.");
  } else {
    for (const impact of [...impactSet]) {
      lines.push(`- ${impact}`);
    }
  }
  lines.push("");
  lines.push("## Next Step");
  lines.push("");
  lines.push("If this proposal looks correct, run:");
  lines.push("");
  lines.push("```sh");
  lines.push("npm run training:accept -- --yes");
  lines.push("```");
  lines.push("");

  return lines.join("\n");
}

async function writeProposal(previousState, currentFiles) {
  const comparison = compare(previousState, currentFiles);
  const proposal = {
    version: 1,
    generated_at: new Date().toISOString(),
    training_root: "Training_Inputs",
    previous: {
      digest: previousState?.digest ?? null,
      generated_at: previousState?.generated_at ?? null,
    },
    current: {
      digest: digestFiles(currentFiles),
      files: currentFiles,
    },
    comparison,
  };

  await fs.mkdir(DOCS_DIR, { recursive: true });
  await fs.writeFile(PROPOSAL_JSON, JSON.stringify(proposal, null, 2) + "\n", "utf8");
  await fs.writeFile(PROPOSAL_MD, renderProposalMarkdown(proposal), "utf8");
  return proposal;
}

async function readSummaryText(summaryRel) {
  const full = path.join(TRAINING_DIR, summaryRel);
  if (!(await exists(full))) return "";
  const raw = await fs.readFile(full, "utf8");
  return String(raw || "").trim();
}

async function writeAcceptedArtifacts(acceptedFiles, proposal) {
  const acceptedAt = new Date().toISOString();
  const state = {
    version: 1,
    accepted_at: acceptedAt,
    generated_at: proposal.generated_at,
    digest: proposal.current.digest,
    files: acceptedFiles,
  };

  await fs.mkdir(DOCS_DIR, { recursive: true });
  await fs.writeFile(STATE_FILE, JSON.stringify(state, null, 2) + "\n", "utf8");

  const active = {
    version: 1,
    accepted_at: acceptedAt,
    files: acceptedFiles.map((file) => ({
      path: file.path,
      tags: file.tags,
      impacts: file.impacts,
      summary_path: file.summary_path,
      summary_exists: file.summary_exists,
      sha256: file.sha256,
    })),
  };
  await fs.writeFile(ACTIVE_SOURCES_JSON, JSON.stringify(active, null, 2) + "\n", "utf8");

  const contextLines = [];
  contextLines.push("# Training Inputs: Active Context");
  contextLines.push("");
  contextLines.push(`Accepted at: ${acceptedAt}`);
  contextLines.push("");
  contextLines.push("Use these references to refine reasoning, but do not silently change prompts/scoring without review.");
  contextLines.push("");

  const ollamaBlocks = [];
  for (const file of acceptedFiles) {
    contextLines.push(`## ${file.path}`);
    contextLines.push("");
    contextLines.push(`- Tags: ${file.tags.join(", ")}`);
    contextLines.push(`- Impacts: ${file.impacts.join("; ")}`);
    contextLines.push(`- Summary file: ${file.summary_path} (${file.summary_exists ? "present" : "missing"})`);

    const summary = file.summary_exists ? await readSummaryText(file.summary_path) : "";
    if (summary) {
      const clipped = summary.length > 1400 ? `${summary.slice(0, 1400)}...` : summary;
      contextLines.push("");
      contextLines.push("Summary excerpt:");
      contextLines.push("");
      contextLines.push(clipped);

      ollamaBlocks.push(`### ${file.path}\n${summary}`);
    }
    contextLines.push("");
  }

  if (acceptedFiles.every((file) => !file.summary_exists)) {
    contextLines.push("No summary files found yet. Add `Training_Inputs/summaries/<original-file-name>.md` files to make these usable for agent/Ollama context.");
    contextLines.push("");
  }

  await fs.writeFile(AGENT_CONTEXT_MD, contextLines.join("\n"), "utf8");

  const ollamaText =
    ollamaBlocks.length > 0
      ? ollamaBlocks.join("\n\n")
      : "No summary text available yet. Add summary files under Training_Inputs/summaries/*.md.";
  await fs.writeFile(OLLAMA_CONTEXT_TXT, ollamaText + "\n", "utf8");
}

function printReviewSummary(proposal) {
  const { added, changed, removed } = proposal.comparison;
  console.log(`Training inputs review complete.`);
  console.log(`Added: ${added.length}, Changed: ${changed.length}, Removed: ${removed.length}`);
  console.log(`Report: ${path.relative(ROOT, PROPOSAL_MD)}`);
}

async function runReview() {
  if (!(await exists(TRAINING_DIR))) {
    throw new Error("Training_Inputs folder not found.");
  }
  const currentFiles = await scanTrainingInputs();
  const previousState = await readJson(STATE_FILE);
  const proposal = await writeProposal(previousState, currentFiles);
  printReviewSummary(proposal);
}

async function runAccept(args) {
  if (!args.includes("--yes")) {
    throw new Error("accept requires --yes so changes are explicit.");
  }

  const proposal = await readJson(PROPOSAL_JSON);
  if (!proposal || !proposal.current || !Array.isArray(proposal.current.files)) {
    throw new Error("No proposal found. Run review first.");
  }

  const currentFiles = await scanTrainingInputs();
  const currentDigest = digestFiles(currentFiles);
  if (currentDigest !== proposal.current.digest) {
    throw new Error("Training_Inputs changed after review. Run review again before accept.");
  }

  await writeAcceptedArtifacts(currentFiles, proposal);
  console.log("Training inputs accepted.");
  console.log(`State: ${path.relative(ROOT, STATE_FILE)}`);
  console.log(`Agent context: ${path.relative(ROOT, AGENT_CONTEXT_MD)}`);
  console.log(`Ollama context: ${path.relative(ROOT, OLLAMA_CONTEXT_TXT)}`);
}

async function main() {
  const command = process.argv[2];
  const args = process.argv.slice(3);

  if (!command || command === "--help" || command === "-h") {
    console.log(HELP);
    process.exit(0);
  }

  if (command === "review" || command === "status") {
    await runReview();
    return;
  }

  if (command === "accept") {
    await runAccept(args);
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

main().catch((err) => {
  console.error(String(err?.message || err));
  process.exit(1);
});
