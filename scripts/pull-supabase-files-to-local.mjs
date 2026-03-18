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

async function fileExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
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
    .select('id,input_key')
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
    const dir = path.join(root, input.input_key);
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
      console.log(`- ${item.inputKey}: ${item.fileName} -> ${item.localPath}`);
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

  console.log('');
  console.log(`Pull complete. Written: ${written}`);
}

main().catch((err) => {
  console.error(String(err?.message || err));
  console.error('');
  console.error(HELP);
  process.exit(1);
});
