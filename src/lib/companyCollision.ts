// Gate 2 — create-new-instance: collision detection + instance cloning.
//
// The birth-only law (cold-start guard) means an existing company can never be
// re-researched in place. The friendly front door: when an operator adds a company
// whose NAME or normalized URL already exists, offer "Create a new instance?" —
// a fresh EMPTY company that clones the original's website + curation columns
// (public_source_filters_json, manual_industry_vocab — the columns research-company
// actually reads at birth; excluded_signals_json deliberately NOT cloned, it is the
// original's evidence history), records lineage via companies.instance_of, and is
// then cold-started as a normal new company. The ORIGINAL is never written.
//
// Collision policy (operator-signed): SOFT check only — no DB unique constraint.
// Matching: lower(trim(name)) equality OR normalized-website equality (lowercase
// host, strip protocol + www. + trailing slash). The companies table is small
// (single-digit rows); we match client-side for normalization flexibility.

import { supabase } from "@/integrations/supabase/client";

export type CompanyCollision = {
  id: string;
  name: string;
  website: string | null;
};

// Shared URL prefixer (was duplicated locally in AdminCompanies + the workshop view).
export function sanitizeWebsite(url?: string): string {
  const trimmed = String(url || "").trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

// Normalize a website for duplicate MATCHING (never for storage): lowercase,
// strip protocol, leading www., trailing slashes. "https://www.Foo.com/" and
// "foo.com" collide.
export function normalizeWebsiteForMatch(url?: string): string {
  const s = String(url || "").trim().toLowerCase();
  if (!s) return "";
  return s
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/+$/, "");
}

const normName = (name?: string | null) => String(name || "").trim().toLowerCase();

// Does {name or website} collide with an existing company? Returns the first
// colliding company, or null. Soft check — racing admins can still dupe; accepted.
export async function findCompanyCollision(
  name: string,
  website?: string,
): Promise<CompanyCollision | null> {
  const { data, error } = await supabase.from("companies").select("id,name,website");
  if (error || !Array.isArray(data)) return null; // fail-open: never block create on a read hiccup
  const wantName = normName(name);
  const wantSite = normalizeWebsiteForMatch(website);
  for (const row of data) {
    const rowName = normName(row?.name);
    const rowSite = normalizeWebsiteForMatch(row?.website ?? "");
    if (wantName && rowName === wantName) return { id: row.id, name: row.name, website: row.website ?? null };
    if (wantSite && rowSite && rowSite === wantSite) return { id: row.id, name: row.name, website: row.website ?? null };
  }
  return null;
}

// "{name} (2)", incrementing until free — so the prompt's default OK always succeeds.
export async function suggestInstanceName(baseName: string): Promise<string> {
  const { data } = await supabase.from("companies").select("name");
  const taken = new Set(((data ?? []) as Array<{ name?: string | null }>).map((r) => normName(r?.name)));
  const base = String(baseName || "").trim().replace(/\s*\(\d+\)\s*$/, "");
  for (let n = 2; n < 100; n += 1) {
    const candidate = `${base} (${n})`;
    if (!taken.has(normName(candidate))) return candidate;
  }
  return `${base} (${Date.now()})`; // pathological fallback, never expected
}

// How many uploaded evidence files the original carries (drives the opt-in checkbox).
export async function countUploadedFiles(companyId: string): Promise<number> {
  const { data: inputRows } = await supabase
    .from("inputs").select("id").eq("company_id", companyId);
  const ids = ((inputRows ?? []) as Array<{ id: string }>).map((r) => r.id);
  if (ids.length === 0) return 0;
  const { count } = await supabase
    .from("input_files").select("id", { count: "exact", head: true })
    .in("input_id", ids);
  return count ?? 0;
}

// Mirrors useInputs' private path sanitizers (upload convention:
// {userId}/{companySeg}/{inputKeySeg}/{inputId}/{fileName}).
function sanitizePathSegment(value: string) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "x";
}

export type InstanceCloneResult = {
  companyId: string;
  companyName: string;
  website: string;
  filesCopied: number;
  fileFailures: string[]; // file names that failed storage copy (row NOT cloned for those)
};

// Create the new instance: fresh EMPTY company cloning website + curation columns,
// instance_of = original.id. Optionally clone uploaded evidence (inputs + input_files
// rows re-keyed to the new company, storage objects PHYSICALLY COPIED to a new path
// prefix — file_path is never shared between companies). Files are copied BEFORE the
// caller fires cold start. The original company is only ever SELECTed.
export async function createCompanyInstance(args: {
  originalId: string;
  newName: string;
  userId: string;
  copyFiles: boolean;
}): Promise<InstanceCloneResult> {
  const { data: original, error: origErr } = await supabase
    .from("companies")
    .select("id,name,website,public_source_filters_json,manual_industry_vocab")
    .eq("id", args.originalId)
    .single();
  if (origErr || !original) throw new Error(origErr?.message || "Original company not found.");

  const { data: created, error: insErr } = await supabase
    .from("companies")
    .insert({
      name: args.newName.trim(),
      website: original.website ?? null,
      public_source_filters_json: original.public_source_filters_json,
      manual_industry_vocab: original.manual_industry_vocab,
      instance_of: original.id,
      created_by: args.userId,
    })
    .select("id,name,website")
    .single();
  if (insErr || !created?.id) throw new Error(insErr?.message || "Failed to create the new instance.");

  const result: InstanceCloneResult = {
    companyId: created.id,
    companyName: created.name,
    website: created.website ?? "",
    filesCopied: 0,
    fileFailures: [],
  };
  if (!args.copyFiles) return result;

  // Clone uploaded evidence. Row-per-row so one bad file never aborts the rest.
  const { data: inputRows } = await supabase
    .from("inputs")
    .select("*")
    .eq("company_id", args.originalId);
  const inputs = (inputRows ?? []) as Array<Record<string, unknown>>;
  for (const input of inputs) {
    const oldInputId = String(input.id);
    const { data: newInput, error: inpErr } = await supabase
      .from("inputs")
      .insert({
        user_id: input.user_id as string,
        input_key: input.input_key as string,
        input_label: input.input_label as string,
        group_key: input.group_key as never,
        group_label: input.group_label as string,
        sub_group: (input.sub_group as string | null) ?? null,
        completeness: (input.completeness as number | null) ?? undefined,
        status: input.status as never,
        score_impact: (input.score_impact as number | null) ?? undefined,
        impact_tier: input.impact_tier as never,
        description: (input.description as string | null) ?? null,
        why_it_matters: (input.why_it_matters as string | null) ?? null,
        company_id: created.id,
        frameworks_used: (input.frameworks_used as string[] | null) ?? undefined,
      })
      .select("id")
      .single();
    if (inpErr || !newInput?.id) {
      result.fileFailures.push(`input "${String(input.input_label || input.input_key)}"`);
      continue;
    }

    const { data: fileRows } = await supabase
      .from("input_files")
      .select("*")
      .eq("input_id", oldInputId);
    for (const file of (fileRows ?? []) as Array<Record<string, unknown>>) {
      const oldPath = String(file.file_path || "");
      const baseName = oldPath.split("/").pop() || String(file.file_name || "file");
      const newPath = [
        args.userId,
        sanitizePathSegment(created.name),
        sanitizePathSegment(String(input.input_key || "input")),
        String(newInput.id),
        baseName,
      ].join("/");
      const { error: copyErr } = await supabase.storage.from("input-files").copy(oldPath, newPath);
      if (copyErr) {
        result.fileFailures.push(String(file.file_name || baseName));
        continue; // row NOT cloned — never point a row at the original's storage object
      }
      const { error: fileErr } = await supabase.from("input_files").insert({
        input_id: newInput.id,
        file_name: file.file_name as string,
        file_type: (file.file_type as string | null) ?? null,
        file_path: newPath,
        tags: (file.tags as string[] | null) ?? undefined,
      });
      if (fileErr) result.fileFailures.push(String(file.file_name || baseName));
      else result.filesCopied += 1;
    }
  }

  return result;
}
