#!/usr/bin/env node
import { promises as fs } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const HELP = `
Usage:
  node scripts/auto-mirror-local-files.mjs [--root "Client_Files"] [--dry-run]

Defaults:
  --root Client_Files
  apply mode (downloads files)
`.trim();

function parseArgs(argv) {
  const args = {
    root: "Client_Files",
    apply: true,
  };

  for (let i = 2; i < argv.length; i++) {
    const token = argv[i];
    if (token === "--root") {
      args.root = String(argv[i + 1] || "");
      i += 1;
    } else if (token === "--dry-run") {
      args.apply = false;
    } else if (token === "--help" || token === "-h") {
      console.log(HELP);
      process.exit(0);
    } else {
      throw new Error(`Unknown arg: ${token}`);
    }
  }

  return args;
}

async function listCompanyDirs(rootAbs) {
  const entries = await fs.readdir(rootAbs, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
}

async function main() {
  const args = parseArgs(process.argv);
  const cwd = process.cwd();
  const rootAbs = path.resolve(cwd, args.root);
  const pullScript = path.resolve(cwd, "scripts/pull-supabase-files-to-local.mjs");

  const companies = await listCompanyDirs(rootAbs);
  if (companies.length === 0) {
    console.log(`No company folders found under ${rootAbs}`);
    return;
  }

  console.log(`Auto mirror root: ${rootAbs}`);
  console.log(`Company folders: ${companies.length}`);
  console.log(`Mode: ${args.apply ? "apply" : "dry-run"}`);

  let totalOk = 0;
  let totalFail = 0;

  for (const companyName of companies) {
    const companyRoot = path.join(args.root, companyName);
    const cmdArgs = [pullScript, "--company", companyName, "--root", companyRoot];
    if (args.apply) cmdArgs.push("--apply");

    const result = spawnSync(process.execPath, cmdArgs, {
      cwd,
      encoding: "utf8",
      stdio: "pipe",
    });

    if (result.status === 0) {
      totalOk += 1;
      console.log(`\n[ok] ${companyName}`);
      if (result.stdout.trim()) console.log(result.stdout.trim());
      continue;
    }

    totalFail += 1;
    console.log(`\n[fail] ${companyName}`);
    if (result.stdout.trim()) console.log(result.stdout.trim());
    if (result.stderr.trim()) console.log(result.stderr.trim());
  }

  console.log("\nAuto mirror finished.");
  console.log(`Succeeded: ${totalOk}`);
  console.log(`Failed: ${totalFail}`);
}

main().catch((err) => {
  console.error(String(err?.message || err));
  console.error("");
  console.error(HELP);
  process.exit(1);
});
