#!/usr/bin/env node
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';

const HELP = `
Usage:
  node scripts/pull-supabase-files-to-local.mjs --company "Edgewood" --root "Client_Files/Edgewood" [--apply]

Defaults:
  - Dry-run mode unless --apply is provided

Credentials:
  - Uses VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY if set
  - Otherwise auto-detects from local Supabase via: supabase status -o json
`.trim();

function parseArgs(argv) {
  const args = { company: '', root: '', apply: false };
  for (let i = 2; i < argv.length; i++) {
    const token = argv[i];
    if (token === '--company') {
      args.company = String(argv[i + 1] || '');
      i += 1;
    } else if (token === '--root') {
      args.root = String(argv[i + 1] || '');
      i += 1;
    } else if (token === '--apply') {
      args.apply = true;
    } else if (token === '--help' || token === '-h') {
      console.log(HELP);
      process.exit(0);
    } else {
      throw new Error(`Unknown arg: ${token}`);
    }
  }
  if (!args.company || !args.root) {
    throw new Error('Missing required args: --company and --root');
  }
  return args;
}

function resolveSupabaseConfig() {
  const envUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
  const envServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (envUrl && envServiceKey) {
    return { supabaseUrl: envUrl, serviceKey: envServiceKey, source: 'env' };
  }

  try {
    const raw = execFileSync('supabase', ['status', '-o', 'json'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const status = JSON.parse(raw);
    const supabaseUrl = envUrl || String(status.API_URL || '');
    const serviceKey = envServiceKey || String(status.SERVICE_ROLE_KEY || status.SECRET_KEY || '');
    if (supabaseUrl && serviceKey) {
      return { supabaseUrl, serviceKey, source: 'supabase-status' };
    }
  } catch {
    // handled by missing check below
  }

  return { supabaseUrl: envUrl, serviceKey: envServiceKey, source: 'missing' };
}

function safeFileName(name) {
  return name.replace(/[/:*?"<>|]/g, '_');
}

function safeDirSegment(value) {
  const normalized = String(value || "")
    .trim()
    .replace(/[/:*?"<>|]/g, "_")
    .replace(/\s+/g, " ");
  return normalized || "General";
}

function buildInputDir(root, input) {
  const group = safeDirSegment(input.group_label || input.group_key || "General");
  const subGroup = safeDirSegment(input.sub_group || "General");
  const inputLabel = safeDirSegment(input.input_label || input.input_key || "Input");
  return path.join(root, group, subGroup, inputLabel);
}

async function fileExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function walkFiles(dir) {
  const files = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkFiles(full)));
      continue;
    }
    if (entry.isFile()) files.push(full);
  }
  return files;
}

async function removeEmptyDirsRecursively(dir) {
  let removed = 0;
  let entries = [];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return removed;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    removed += await removeEmptyDirsRecursively(path.join(dir, entry.name));
  }

  try {
    const remaining = await fs.readdir(dir);
    if (remaining.length === 0) {
      await fs.rmdir(dir);
      removed += 1;
    }
  } catch {
    // ignore
  }
  return removed;
}

async function migrateLegacyInputKeyDirs(root, inputRows) {
  let moved = 0;
  let deduped = 0;
  let removedDirs = 0;

  for (const input of inputRows) {
    const legacyDir = path.join(root, String(input.input_key || ""));
    let legacyExists = false;
    try {
      const stat = await fs.stat(legacyDir);
      legacyExists = stat.isDirectory();
    } catch {
      legacyExists = false;
    }
    if (!legacyExists) continue;

    const targetDir = buildInputDir(root, input);
    const legacyFiles = await walkFiles(legacyDir);
    for (const legacyFile of legacyFiles) {
      const relative = path.relative(legacyDir, legacyFile);
      const targetFile = path.join(targetDir, relative);
      await fs.mkdir(path.dirname(targetFile), { recursive: true });

      if (!(await fileExists(targetFile))) {
        await fs.rename(legacyFile, targetFile);
        moved += 1;
        continue;
      }

      try {
        const [legacyStat, targetStat] = await Promise.all([fs.stat(legacyFile), fs.stat(targetFile)]);
        if (legacyStat.size === targetStat.size) {
          await fs.unlink(legacyFile);
          deduped += 1;
        }
      } catch {
        // keep both when we cannot compare safely
      }
    }

    removedDirs += await removeEmptyDirsRecursively(legacyDir);
  }

  return { moved, deduped, removedDirs };
}

async function pruneEmptyLegacyInputKeyDirs(root, inputRows) {
  let removed = 0;
  for (const input of inputRows) {
    const legacyDir = path.join(root, String(input.input_key || ""));
    try {
      const entries = await fs.readdir(legacyDir);
      if (entries.length > 0) continue;
      await fs.rmdir(legacyDir);
      removed += 1;
    } catch {
      // ignore missing/not-empty directories
    }
  }
  return removed;
}

async function main() {
  const args = parseArgs(process.argv);
  const { supabaseUrl, serviceKey, source } = resolveSupabaseConfig();
  if (!supabaseUrl || !serviceKey) {
    throw new Error('Missing Supabase credentials. Set env vars or run local Supabase.');
  }

  const root = path.resolve(process.cwd(), args.root);
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: companies, error: companyErr } = await supabase
    .from('companies')
    .select('id,name')
    .ilike('name', args.company)
    .limit(1);
  if (companyErr) throw companyErr;
  const company = Array.isArray(companies) ? companies[0] : null;
  if (!company) throw new Error(`Company not found: ${args.company}`);

  const { data: inputs, error: inputErr } = await supabase
    .from('inputs')
    .select('id,input_key,input_label,group_key,group_label,sub_group')
    .eq('company_id', company.id);
  if (inputErr) throw inputErr;
  const inputRows = Array.isArray(inputs) ? inputs : [];
  if (inputRows.length === 0) {
    console.log(`Company: ${company.name}`);
    console.log(`Root: ${root}`);
    console.log(`Credentials source: ${source}`);
    console.log("No inputs found yet. Nothing to pull.");
    return;
  }

  const inputIds = inputRows.map((row) => row.id);
  const inputById = new Map(inputRows.map((row) => [row.id, row]));

  const { data: files, error: filesErr } = await supabase
    .from('input_files')
    .select('id,input_id,file_name,file_path,uploaded_at')
    .in('input_id', inputIds)
    .order('uploaded_at', { ascending: false });
  if (filesErr) throw filesErr;
  const fileRows = Array.isArray(files) ? files : [];

  const plan = [];
  for (const file of fileRows) {
    const input = inputById.get(file.input_id);
    if (!input) continue;
    const dir = buildInputDir(root, input);
    const base = safeFileName(file.file_name || path.basename(file.file_path));
    const preferred = path.join(dir, base);
    const fallback = path.join(dir, `${base.replace(/\.[^.]+$/, "")}-${String(file.id).slice(0, 8)}${path.extname(base)}`);
    const existsPreferred = await fileExists(preferred);
    const existsFallback = await fileExists(fallback);
    const localPath = existsPreferred ? preferred : fallback;
    plan.push({
      id: file.id,
      filePath: file.file_path,
      fileName: file.file_name,
      inputKey: input.input_key,
      inputLabel: input.input_label,
      groupLabel: input.group_label,
      subGroup: input.sub_group,
      localPath,
      exists: existsPreferred || existsFallback,
    });
  }

  console.log(`Company: ${company.name}`);
  console.log(`Root: ${root}`);
  console.log(`Credentials source: ${source}`);
  console.log(`Remote files: ${plan.length}`);

  const pending = plan.filter((p) => !p.exists);
  console.log(`To write: ${pending.length}`);
  console.log(`Already mirrored: ${plan.length - pending.length}`);

  if (!args.apply) {
    console.log('');
    for (const item of pending.slice(0, 20)) {
      console.log(`- ${item.groupLabel} / ${item.subGroup} / ${item.inputLabel}: ${item.fileName} -> ${item.localPath}`);
    }
    console.log('');
    console.log('Dry run complete. Add --apply to download files locally.');
    return;
  }

  let written = 0;
  for (const item of pending) {
    const { data, error } = await supabase.storage.from('input-files').download(item.filePath);
    if (error || !data) {
      console.error(`Download failed: ${item.fileName} (${item.filePath})`);
      continue;
    }
    const arrBuf = await data.arrayBuffer();
    const bytes = Buffer.from(arrBuf);
    await fs.mkdir(path.dirname(item.localPath), { recursive: true });
    await fs.writeFile(item.localPath, bytes);
    written += 1;
  }

  const migrated = await migrateLegacyInputKeyDirs(root, inputRows);
  const cleaned = await pruneEmptyLegacyInputKeyDirs(root, inputRows);

  console.log('');
  console.log(`Pull complete. Written: ${written}`);
  if (migrated.moved > 0 || migrated.deduped > 0 || migrated.removedDirs > 0) {
    console.log(`Legacy migration: moved ${migrated.moved}, deduped ${migrated.deduped}, removed dirs ${migrated.removedDirs}`);
  }
  if (cleaned > 0) {
    console.log(`Legacy empty key folders removed: ${cleaned}`);
  }
}

main().catch((err) => {
  console.error(String(err?.message || err));
  console.error('');
  console.error(HELP);
  process.exit(1);
});
