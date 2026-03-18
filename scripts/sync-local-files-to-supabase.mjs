#!/usr/bin/env node
import { promises as fs } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const HELP = `
Usage:
  node scripts/sync-local-files-to-supabase.mjs --company "Edgewood" --root "Client_Files/Edgewood" [--apply]

Defaults:
  - Dry-run mode unless --apply is provided

Required env:
  - VITE_SUPABASE_URL
  - SUPABASE_SERVICE_ROLE_KEY
  OR run local Supabase (supabase start) so this script can auto-detect.

Folder convention:
  Client_Files/<Company>/<input_key>/<any-subfolders>/<file>
  where input_key is one of:
  comp-alt, unique-attr, val-prop, target-aud, market-cat,
  program-model, needs-assessment, outcome-data, referral-map,
  brand-narrative, channel-strat, donor-retention, grant-pipeline, family-satisfaction
`.trim();

function parseArgs(argv) {
  const args = { company: "", root: "", apply: false };
  for (let i = 2; i < argv.length; i++) {
    const token = argv[i];
    if (token === "--company") {
      args.company = String(argv[i + 1] || "");
      i += 1;
    } else if (token === "--root") {
      args.root = String(argv[i + 1] || "");
      i += 1;
    } else if (token === "--apply") {
      args.apply = true;
    } else if (token === "--help" || token === "-h") {
      console.log(HELP);
      process.exit(0);
    } else {
      throw new Error(`Unknown arg: ${token}`);
    }
  }
  if (!args.company || !args.root) {
    throw new Error("Missing required args: --company and --root");
  }
  return args;
}

function extType(fileName) {
  const ext = path.extname(fileName).toLowerCase();
  const byExt = {
    ".pdf": "application/pdf",
    ".txt": "text/plain",
    ".md": "text/markdown",
    ".csv": "text/csv",
    ".json": "application/json",
    ".xml": "application/xml",
    ".yaml": "application/x-yaml",
    ".yml": "application/x-yaml",
    ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xls": "application/vnd.ms-excel",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".ppt": "application/vnd.ms-powerpoint",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".mp4": "video/mp4",
    ".mov": "video/quicktime",
  };
  return byExt[ext] || "application/octet-stream";
}

function normalizeRel(from, fullPath) {
  return path.relative(from, fullPath).split(path.sep).join("/");
}

async function walkFiles(dir) {
  const files = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkFiles(full)));
      continue;
    }
    if (entry.isFile()) files.push(full);
  }
  return files;
}

function locateInputKey(relPath, inputKeys) {
  const parts = relPath.split("/").filter(Boolean);
  for (const part of parts) {
    if (inputKeys.has(part)) return part;
  }
  return null;
}

function resolveSupabaseConfig() {
  const envUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
  const envServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

  if (envUrl && envServiceKey) {
    return { supabaseUrl: envUrl, serviceKey: envServiceKey, source: "env" };
  }

  try {
    const raw = execFileSync("supabase", ["status", "-o", "json"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const status = JSON.parse(raw);

    const supabaseUrl = envUrl || String(status.API_URL || "");
    const serviceKey =
      envServiceKey ||
      String(status.SERVICE_ROLE_KEY || status.SECRET_KEY || "");

    if (supabaseUrl && serviceKey) {
      return { supabaseUrl, serviceKey, source: "supabase-status" };
    }
  } catch {
    // fall through to explicit error below
  }

  return { supabaseUrl: envUrl, serviceKey: envServiceKey, source: "missing" };
}

async function main() {
  const args = parseArgs(process.argv);
  const { supabaseUrl, serviceKey, source } = resolveSupabaseConfig();

  if (!supabaseUrl || !serviceKey) {
    throw new Error(
      "Missing Supabase credentials. Set VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY, or run local Supabase for auto-detect.",
    );
  }

  const root = path.resolve(process.cwd(), args.root);
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: companies, error: companyErr } = await supabase
    .from("companies")
    .select("id,name")
    .ilike("name", args.company)
    .limit(1);
  if (companyErr) throw companyErr;
  const company = Array.isArray(companies) ? companies[0] : null;
  if (!company) throw new Error(`Company not found: ${args.company}`);

  const { data: inputs, error: inputErr } = await supabase
    .from("inputs")
    .select("id,input_key,input_label,user_id,company_id")
    .eq("company_id", company.id);
  if (inputErr) throw inputErr;
  const inputRows = Array.isArray(inputs) ? inputs : [];
  if (inputRows.length === 0) {
    throw new Error(`No inputs found for ${company.name}. Run AI Research first.`);
  }

  const inputByKey = new Map(inputRows.map((row) => [String(row.input_key), row]));
  const inputKeys = new Set(inputByKey.keys());

  const localFiles = await walkFiles(root);
  if (localFiles.length === 0) {
    console.log(`Company: ${company.name}`);
    console.log(`Root: ${root}`);
    console.log(`Credentials source: ${source}`);
    console.log("No files found under root.");
    return;
  }

  const inputIds = inputRows.map((row) => row.id);
  const { data: existingRows, error: existingErr } = await supabase
    .from("input_files")
    .select("id,input_id,file_path")
    .in("input_id", inputIds);
  if (existingErr) throw existingErr;
  const existingByPath = new Map(
    (Array.isArray(existingRows) ? existingRows : []).map((row) => [String(row.file_path), row]),
  );

  const plan = [];
  const skipped = [];

  for (const fullPath of localFiles) {
    const rel = normalizeRel(root, fullPath);
    const inputKey = locateInputKey(rel, inputKeys);
    if (!inputKey) {
      skipped.push({ rel, reason: "no_input_key_in_path" });
      continue;
    }
    const input = inputByKey.get(inputKey);
    if (!input) {
      skipped.push({ rel, reason: "input_not_found" });
      continue;
    }

    const relParts = rel.split("/");
    const keyIdx = relParts.indexOf(inputKey);
    const afterKey = relParts.slice(keyIdx + 1).join("/");
    const baseName = path.basename(fullPath);
    const tail = afterKey || baseName;
    const storagePath = `${input.user_id}/${input.id}/${tail}`;

    plan.push({
      fullPath,
      rel,
      input,
      inputKey,
      storagePath,
      contentType: extType(baseName),
      exists: existingByPath.has(storagePath),
    });
  }

  const toUpload = plan.filter((item) => !item.exists);
  console.log(`Company: ${company.name}`);
  console.log(`Root: ${root}`);
  console.log(`Credentials source: ${source}`);
  console.log(`Scanned local files: ${localFiles.length}`);
  console.log(`Matched to inputs: ${plan.length}`);
  console.log(`Already linked: ${plan.length - toUpload.length}`);
  console.log(`To upload/link: ${toUpload.length}`);
  console.log(`Skipped: ${skipped.length}`);

  if (skipped.length > 0) {
    console.log("");
    console.log("Skipped files (first 20):");
    for (const item of skipped.slice(0, 20)) {
      console.log(`- ${item.rel} (${item.reason})`);
    }
  }

  if (!args.apply) {
    console.log("");
    console.log("Dry run complete. Add --apply to upload and link files.");
    return;
  }

  let uploaded = 0;
  let linked = 0;

  for (const item of toUpload) {
    const bytes = await fs.readFile(item.fullPath);
    const { error: uploadErr } = await supabase.storage
      .from("input-files")
      .upload(item.storagePath, bytes, {
        contentType: item.contentType,
        upsert: true,
      });
    if (uploadErr) {
      console.error(`Upload failed: ${item.rel}`, uploadErr.message || uploadErr);
      continue;
    }
    uploaded += 1;

    const { error: insertErr } = await supabase.from("input_files").insert({
      input_id: item.input.id,
      file_name: path.basename(item.fullPath),
      file_type: item.contentType,
      file_path: item.storagePath,
      tags: [],
    });
    if (insertErr) {
      console.error(`DB link failed: ${item.rel}`, insertErr.message || insertErr);
      continue;
    }
    linked += 1;
  }

  console.log("");
  console.log(`Upload complete. Uploaded: ${uploaded}, Linked: ${linked}`);
}

main().catch((err) => {
  console.error(String(err?.message || err));
  console.error("");
  console.error(HELP);
  process.exit(1);
});
