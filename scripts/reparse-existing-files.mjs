#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";

function readEnvFile(envPath) {
  if (!fs.existsSync(envPath)) return;
  const raw = fs.readFileSync(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!(key in process.env)) process.env[key] = value;
  }
}

function parseArgs(argv) {
  const result = {
    companyName: "",
    limit: 0,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--company" && argv[i + 1]) {
      result.companyName = String(argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg === "--limit" && argv[i + 1]) {
      result.limit = Number(argv[i + 1]) || 0;
      i += 1;
      continue;
    }
  }
  return result;
}

async function main() {
  const cwd = process.cwd();
  const envPath = path.join(cwd, "supabase/functions/.env.local");
  readEnvFile(envPath);

  const {
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
  } = process.env;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Load supabase/functions/.env.local first.");
  }

  const args = parseArgs(process.argv.slice(2));
  const companyFilter = args.companyName.trim().toLowerCase();

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: companies, error: companiesError } = await supabase
    .from("companies")
    .select("id,name")
    .order("name", { ascending: true });
  if (companiesError) throw companiesError;

  const selectedCompanies = (companies ?? []).filter((row) => {
    if (!companyFilter) return true;
    return String(row.name || "").toLowerCase().includes(companyFilter);
  });
  if (selectedCompanies.length === 0) {
    console.log(`No companies matched filter "${args.companyName}".`);
    return;
  }

  const selectedCompanyIds = new Set(selectedCompanies.map((row) => row.id));
  const companyNameById = new Map(selectedCompanies.map((row) => [row.id, row.name]));

  const { data: inputs, error: inputsError } = await supabase
    .from("inputs")
    .select("id,company_id,input_key,input_label,sub_group,group_key")
    .in("company_id", [...selectedCompanyIds]);
  if (inputsError) throw inputsError;

  const inputById = new Map();
  const inputAreasByCompany = new Map();
  for (const input of inputs ?? []) {
    inputById.set(input.id, input);
    if (!inputAreasByCompany.has(input.company_id)) inputAreasByCompany.set(input.company_id, []);
    inputAreasByCompany.get(input.company_id).push({
      id: input.id,
      input_key: input.input_key,
      input_label: input.input_label,
      sub_group: input.sub_group,
      group_key: input.group_key,
    });
  }

  const inputIds = [...inputById.keys()];
  if (inputIds.length === 0) {
    console.log("No inputs found for selected companies.");
    return;
  }

  const { data: files, error: filesError } = await supabase
    .from("input_files")
    .select("id,input_id,file_name,file_type,file_path,uploaded_at")
    .in("input_id", inputIds)
    .order("uploaded_at", { ascending: true });
  if (filesError) throw filesError;

  const queue = (files ?? []).filter((file) => {
    const input = inputById.get(file.input_id);
    return Boolean(input && selectedCompanyIds.has(input.company_id));
  });

  const limitedQueue = args.limit > 0 ? queue.slice(0, args.limit) : queue;
  if (limitedQueue.length === 0) {
    console.log("No files to reparse.");
    return;
  }

  console.log(`Reparsing ${limitedQueue.length} file(s) across ${selectedCompanies.length} compan${selectedCompanies.length === 1 ? "y" : "ies"}...`);
  const endpoint = `${SUPABASE_URL.replace(/\/+$/, "")}/functions/v1/analyze-file`;
  let ok = 0;
  let failed = 0;

  for (let index = 0; index < limitedQueue.length; index += 1) {
    const file = limitedQueue[index];
    const input = inputById.get(file.input_id);
    const companyId = input?.company_id;
    const companyName = companyNameById.get(companyId) || "Unknown";
    const inputAreas = inputAreasByCompany.get(companyId) ?? [];
    const label = `${index + 1}/${limitedQueue.length}`;
    process.stdout.write(`[${label}] ${companyName} :: ${file.file_name} ... `);

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          apikey: SUPABASE_SERVICE_ROLE_KEY,
        },
        body: JSON.stringify({
          fileName: file.file_name,
          filePath: file.file_path,
          fileType: file.file_type,
          inputAreas,
        }),
      });

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        failed += 1;
        process.stdout.write(`FAILED (${response.status}) ${text.slice(0, 180)}\n`);
        continue;
      }

      const payload = await response.json().catch(() => ({}));
      ok += 1;
      const extraction = String(payload?.extraction_source || "unknown");
      process.stdout.write(`ok [${extraction}]\n`);
    } catch (error) {
      failed += 1;
      process.stdout.write(`FAILED (${error instanceof Error ? error.message : "unknown"})\n`);
    }
  }

  console.log(`Done. Parsed: ${ok}, Failed: ${failed}`);
  console.log("Next step: run deep-dive analysis again for the affected company areas.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
