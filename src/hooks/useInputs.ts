import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { InputItem, InputFile } from '@/lib/types';
import { useCompany } from '@/hooks/useCompany';
import { deriveInputImpact } from '@/lib/scoring/inputImpact';
import { STANDARD_INPUT_AREAS } from '@/lib/inputTaxonomy';

type InputRow = {
  id: string;
  company_id: string;
  input_key: InputItem['input_key'];
  input_label: string;
  group_key: InputItem['group_key'];
  group_label: string;
  sub_group: string;
  completeness: number;
  status: InputItem['status'];
  score_impact: number | string | null;
  impact_tier: InputItem['impact_tier'];
  description: string;
  why_it_matters: string;
};

type InputSubitemRow = {
  id: string;
  input_id: string;
  sort_order: number;
  name: string;
  done: boolean;
};

type InputFileRow = {
  id: string;
  input_id: string;
  file_name: string;
  file_type: string;
  file_path: string;
  tags: string[] | null;
  uploaded_at: string;
  archived_at: string | null;
  archived_by: string | null;
  archive_reason: string | null;
  archive_source: string | null;
  restored_at: string | null;
  restored_by: string | null;
};


type LocalInputProfile = "generic" | "fintech_collections" | "hospitality_coffee";

function inferLocalInputProfile(companyName?: string): LocalInputProfile {
  const text = String(companyName || "").toLowerCase();
  if (/\bindebted\b|\bdebt\b|\bcollections?\b|\bcreditor\b|\bfintech\b/.test(text)) {
    return "fintech_collections";
  }
  if (/\bcafe\b|\bcoffee\b|\broast|\broastery\b|\bbarra\b/.test(text)) {
    return "hospitality_coffee";
  }
  return "generic";
}

function contextualizeInputText(args: {
  inputKey: string;
  inputLabel: string;
  subGroup: string;
  description: string;
  whyItMatters: string;
  companyName?: string;
}): { inputLabel: string; subGroup: string; description: string; whyItMatters: string } {
  const companyName = String(args.companyName || "").trim();
  const profile = inferLocalInputProfile(companyName);

  let inputLabel = args.inputLabel;
  let subGroup = args.subGroup;
  let description = args.description;
  let whyItMatters = args.whyItMatters;

  const needsOdiSignal = (text: string) =>
    !/\bodi\b|\bjob\b|\boutcome\b|\bimportance\b|\bsatisfaction\b/.test(String(text || "").toLowerCase());
  if (args.inputKey === "customer-research") {
    if (needsOdiSignal(description)) description = "Customer checkpoint map and desired outcomes by segment";
    if (needsOdiSignal(whyItMatters)) whyItMatters = "Shows what matters most and where current results are falling short";
  } else if (args.inputKey === "outcome-evidence") {
    if (needsOdiSignal(description)) description = "Track desired outcome satisfaction and completion signals";
    if (needsOdiSignal(whyItMatters)) whyItMatters = "Confirms progress on high-importance outcomes that are still underserved";
  } else if (args.inputKey === "acquisition-map") {
    if (needsOdiSignal(description)) description = "Map decision triggers and trusted channels customers use";
    if (needsOdiSignal(whyItMatters)) whyItMatters = "Shows where customers discover, evaluate, and choose with confidence";
  }

  return { inputLabel, subGroup, description, whyItMatters };
}

const PUBLIC_SEED_COMPLETENESS_BY_KEY: Record<string, number> = {
  "comp-alt": 30,
  "unique-attr": 28,
  "val-prop": 27,
  "target-aud": 24,
  "market-cat": 25,
  "operating-model": 26,
  "customer-research": 20,
  "outcome-evidence": 16,
  "acquisition-map": 14,
  "brand-narrative": 18,
  "channel-strat": 12,
  "retention-signals": 10,
  "demand-pipeline": 10,
  "customer-signals": 11,
};

function inferPublicSeed(row: InputRow) {
  const existingCompleteness = Number(row.completeness);
  const existingStatus = String(row.status || "").toLowerCase();
  if (Number.isFinite(existingCompleteness) && existingCompleteness > 0) {
    return {
      completeness: existingCompleteness,
      status: row.status,
    };
  }

  if (existingStatus === "complete" || existingStatus === "partial" || existingStatus === "gap") {
    return {
      completeness: Math.max(0, existingCompleteness || 0),
      status: row.status,
    };
  }

  const key = String(row.input_key || "").trim();
  const base = PUBLIC_SEED_COMPLETENESS_BY_KEY[key] ?? 10;
  const text = `${String(row.description || "")} ${String(row.why_it_matters || "")}`.toLowerCase();

  const hasSubstance = text.replace(/\s+/g, " ").trim().length >= 30;
  if (!hasSubstance) {
    return {
      completeness: 0,
      status: "not_started" as InputItem["status"],
    };
  }

  const uncertain =
    text.includes("unknown") ||
    text.includes("unclear") ||
    text.includes("not public") ||
    text.includes("not evidenced") ||
    text.includes("thin evidence") ||
    text.includes("needs verification");

  const seeded = Math.max(0, Math.min(48, Math.round(base * (uncertain ? 0.45 : 1))));
  return {
    completeness: seeded,
    status: (seeded >= 8 ? "partial" : "not_started") as InputItem["status"],
  };
}

function mapInput(
  row: InputRow,
  subitems: InputSubitemRow[],
  files: InputFileRow[],
  companyName?: string,
): InputItem {
  const seeded = inferPublicSeed(row);
  const subitemsForRow = subitems
    .filter((s) => s.input_id === row.id)
    .sort((a, b) => a.sort_order - b.sort_order);
  const filesForRow = files.filter((f) => f.input_id === row.id);
  const dynamicImpact = deriveInputImpact({
    inputKey: String(row.input_key || ""),
    completeness: seeded.completeness,
    status: seeded.status,
    subitemsDone: subitemsForRow.filter((s) => s.done).length,
    subitemsTotal: subitemsForRow.length,
    filesCount: filesForRow.length,
  });
  const contextText = contextualizeInputText({
    inputKey: String(row.input_key || ""),
    inputLabel: String(row.input_label || ""),
    subGroup: String(row.sub_group || ""),
    description: String(row.description || ""),
    whyItMatters: String(row.why_it_matters || ""),
    companyName,
  });

  return {
    id: row.id,
    input_key: row.input_key,
    input_label: contextText.inputLabel,
    group_key: row.group_key,
    group_label: row.group_label,
    sub_group: contextText.subGroup,
    completeness: seeded.completeness,
    status: seeded.status,
    score_impact: dynamicImpact.scoreImpact,
    impact_tier: dynamicImpact.impactTier,
    description: contextText.description,
    why_it_matters: contextText.whyItMatters,
    subitems: subitemsForRow
      .map((s) => ({ id: s.id, sort_order: s.sort_order, name: s.name, done: s.done })),
    files: filesForRow
      .map((f) => ({
        id: f.id,
        file_name: f.file_name,
        file_type: f.file_type,
        file_url: f.file_path,
        tags: f.tags ?? [],
        uploaded_at: f.uploaded_at,
      })),
  };
}

function sanitizePathSegment(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "unknown";
}

function sanitizeFileName(name: string) {
  return String(name || "file")
    .replace(/[\\/]/g, "_")
    .replace(/\s+/g, " ")
    .trim() || `file-${Date.now()}`;
}

export function useInputs(companyIdOverride?: string) {
  const qc = useQueryClient();
  const { activeCompany } = useCompany();
  const companyId = companyIdOverride ?? activeCompany?.id;

  const query = useQuery({
    queryKey: ['inputs', companyId, 'company-scope-v2'],
    queryFn: async (): Promise<InputItem[]> => {
      if (!companyId) return [];
      const { data: companyRow } = await supabase
        .from('companies')
        .select('name')
        .eq('id', companyId)
        .maybeSingle();
      const companyNameForContext = typeof companyRow?.name === "string" ? companyRow.name : undefined;

      const { data: inputs, error: e1 } = await supabase
        .from('inputs')
        .select('*')
        .eq('company_id', companyId)
        .order('group_key')
        .order('input_label');
      if (e1) throw e1;

      const inputRows = (inputs ?? []) as InputRow[];
      if (inputRows.length === 0) return [];

      const inputIds = inputRows.map((row) => row.id);

      const [{ data: subs, error: e2 }, { data: files, error: e3 }] = await Promise.all([
        supabase.from('input_subitems').select('*').in('input_id', inputIds),
        supabase.from('input_files').select('*').in('input_id', inputIds).is('archived_at', null),
      ]);

      if (e2) throw e2;
      if (e3) throw e3;

      return inputRows.map((row) =>
        mapInput(
          row,
          (subs ?? []) as InputSubitemRow[],
          (files ?? []) as InputFileRow[],
          companyNameForContext,
        )
      );
    },
    enabled: !!companyId,
  });


  // Manual re-seed function
  const reseed = async () => {
    qc.invalidateQueries({ queryKey: ['inputs', companyId] });
  };

  return { query, reseed };
}

export function useToggleSubitem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, done }: { id: string; done: boolean }) => {
      const { error } = await supabase.from('input_subitems').update({ done }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inputs'] }),
  });
}

// Non-destructive scaffold: insert the standard input areas for a company that has
// none (or is missing some), without running research-company. Idempotent — only
// inserts keys not already present. See src/lib/inputTaxonomy.ts.
export function useSeedInputs() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ companyId }: { companyId: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not signed in');

      const { data: existing, error: readErr } = await supabase
        .from('inputs')
        .select('input_key')
        .eq('company_id', companyId);
      if (readErr) throw readErr;

      const present = new Set((existing ?? []).map((r) => String(r.input_key)));
      const toInsert = STANDARD_INPUT_AREAS
        .filter((area) => !present.has(area.input_key))
        .map((area) => ({
          company_id: companyId,
          user_id: user.id,
          input_key: area.input_key,
          input_label: area.input_label,
          group_key: area.group_key,
          group_label: area.group_label,
          description: '',
          status: 'not_started' as const,
          completeness: 0,
        }));

      if (toInsert.length === 0) return { inserted: 0 };

      const { error: insertErr } = await supabase.from('inputs').insert(toInsert);
      if (insertErr) throw insertErr;
      return { inserted: toInsert.length };
    },
    onSuccess: (_data, { companyId }) => {
      qc.invalidateQueries({ queryKey: ['inputs', companyId] });
      qc.invalidateQueries({ queryKey: ['inputs'] });
    },
  });
}

export function useUploadInputFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      inputId,
      inputKey,
      companyName,
      file,
      tags,
    }: {
      inputId: string;
      inputKey?: string;
      companyName?: string;
      file: File;
      tags?: string[];
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const safeCompany = sanitizePathSegment(companyName || "company");
      const safeInputKey = sanitizePathSegment(inputKey || "input");
      const safeFile = sanitizeFileName(file.name);
      const filePath = `${user.id}/${safeCompany}/${safeInputKey}/${inputId}/${Date.now()}-${safeFile}`;
      const normalizedTags = Array.from(
        new Set([...(Array.isArray(tags) ? tags : []), "Company"]),
      );

      const { error: uploadError } = await supabase.storage.from('input-files').upload(filePath, file);
      if (uploadError) throw uploadError;

      const { data: insertedRow, error: dbError } = await supabase
        .from('input_files')
        .insert({
          input_id: inputId,
          file_name: file.name,
          file_type: file.type || file.name.split('.').pop() || '',
          file_path: filePath,
          tags: normalizedTags,
        })
        .select('id, file_path, uploaded_at')
        .single();
      if (dbError || !insertedRow?.id) {
        // Guardrail: never allow a storage upload to look successful if DB linkage failed.
        const { error: rollbackError } = await supabase.storage.from('input-files').remove([filePath]);
        const baseMessage = dbError?.message || 'Missing inserted input_files row id';
        const rollbackMessage = rollbackError?.message ? ` Rollback remove failed: ${rollbackError.message}` : '';
        throw new Error(
          `Upload aborted: file reached storage but database link failed (${baseMessage}).${rollbackMessage}`
        );
      }

      // If this input uses a single checklist item, treat first uploaded evidence as satisfying it.
      const { data: subitems, error: subitemsError } = await supabase
        .from('input_subitems')
        .select('id, done')
        .eq('input_id', inputId)
        .order('sort_order', { ascending: true });
      if (subitemsError) throw subitemsError;

      const rows = (subitems ?? []) as Array<{ id: string; done: boolean }>;
      if (rows.length === 1 && !rows[0].done) {
        const { error: toggleError } = await supabase
          .from('input_subitems')
          .update({ done: true })
          .eq('id', rows[0].id);
        if (toggleError) throw toggleError;
      }

      return {
        id: insertedRow?.id as string | undefined,
        filePath,
        uploadedAt: (insertedRow?.uploaded_at as string | null | undefined) ?? null,
      };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inputs'] }),
  });
}

export function useArchiveInputFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      reason = 'user_removed',
      source = 'ui',
    }: { id: string; filePath?: string; reason?: string; source?: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from('input_files').update({
        archived_at: new Date().toISOString(),
        archived_by: user?.id ?? null,
        archive_reason: reason,
        archive_source: source,
      }).eq('id', id);
      if (error) throw error;
      // storage blob is intentionally NOT removed
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inputs'] });
      qc.invalidateQueries({ queryKey: ['company-files'] });
    },
  });
}

/** @deprecated Use useArchiveInputFile — blobs are preserved via soft archive. */
export function useDeleteInputFile() {
  return useArchiveInputFile();
}

export function useRestoreInputFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from('input_files').update({
        archived_at: null,
        archived_by: null,
        archive_reason: null,
        archive_source: null,
        restored_at: new Date().toISOString(),
        restored_by: user?.id ?? null,
      }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inputs'] });
      qc.invalidateQueries({ queryKey: ['company-files'] });
      qc.invalidateQueries({ queryKey: ['archived-files'] });
    },
  });
}

export function useArchivedInputFiles(companyId: string | null | undefined) {
  return useQuery({
    queryKey: ['archived-files', companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data: inputRows } = await supabase
        .from('inputs')
        .select('id')
        .eq('company_id', companyId);
      const inputIds = (inputRows ?? []).map((r: { id: string }) => r.id);
      if (inputIds.length === 0) return [];
      const { data, error } = await supabase
        .from('input_files')
        .select('*')
        .in('input_id', inputIds)
        .not('archived_at', 'is', null)
        .order('archived_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as InputFileRow[];
    },
    enabled: !!companyId,
  });
}

export function useUpdateFileTags() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, tags }: { id: string; tags: string[] }) => {
      const { error } = await supabase.from('input_files').update({ tags }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inputs'] }),
  });
}

export function getFileDownloadUrl(filePath: string): string {
  const { data } = supabase.storage.from('input-files').getPublicUrl(filePath);
  return data.publicUrl;
}

export async function getFileSignedUrl(filePath: string): Promise<string> {
  const { data, error } = await supabase.storage.from('input-files').createSignedUrl(filePath, 3600);
  if (error) throw error;
  return data.signedUrl;
}
