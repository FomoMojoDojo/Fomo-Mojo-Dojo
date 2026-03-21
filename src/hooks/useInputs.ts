import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { InputItem, InputFile } from '@/lib/types';
import { useCompany } from '@/hooks/useCompany';
import { deriveInputImpact } from '@/lib/scoring/inputImpact';

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
};

function normalizeLegacyCompanyText(text: string, companyName?: string): string {
  const safeText = String(text || "");
  const target = String(companyName || "").trim();
  if (!target) return safeText;
  if (/edgewood/i.test(target)) return safeText;
  if (!/edgewood/i.test(safeText)) return safeText;
  return safeText
    .replace(/\bEdgewood Center for Children & Families\b/gi, target)
    .replace(/\bEdgewood\b/gi, target);
}

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

  let inputLabel = normalizeLegacyCompanyText(args.inputLabel, companyName);
  let subGroup = normalizeLegacyCompanyText(args.subGroup, companyName);
  let description = normalizeLegacyCompanyText(args.description, companyName);
  let whyItMatters = normalizeLegacyCompanyText(args.whyItMatters, companyName);

  const combined = `${inputLabel} ${subGroup} ${description} ${whyItMatters}`.toLowerCase();
  const notApplicable = /not applicable|not relevant|n\/a/.test(combined);
  const hasLegacyNonprofitLabel =
    (args.inputKey === "donor-retention" && /\bdonor\b/.test(combined)) ||
    (args.inputKey === "grant-pipeline" && /\bgrant\b/.test(combined)) ||
    (args.inputKey === "family-satisfaction" && /\bfamil(y|ies)\b/.test(combined));
  const shouldModernizeMarketEvidence = notApplicable || hasLegacyNonprofitLabel;

  if (shouldModernizeMarketEvidence) {
    if (args.inputKey === "donor-retention") {
      if (profile === "fintech_collections") {
        inputLabel = "Client Retention";
        subGroup = "Retention";
        if (notApplicable) description = "Client renewal and account expansion behavior";
        if (notApplicable) whyItMatters = "Protects recurring enterprise revenue";
      } else if (profile === "hospitality_coffee") {
        inputLabel = "Repeat Purchase Retention";
        subGroup = "Retention";
        if (notApplicable) description = "Reorder frequency and wholesale account retention";
        if (notApplicable) whyItMatters = "Protects recurring coffee revenue";
      } else {
        inputLabel = "Customer Retention";
        subGroup = "Retention";
        if (notApplicable) description = "Repeat purchase and reorder behavior";
        if (notApplicable) whyItMatters = "Protects recurring revenue and loyalty";
      }
    } else if (args.inputKey === "grant-pipeline") {
      if (profile === "fintech_collections") {
        inputLabel = "Enterprise Pipeline";
        subGroup = "Demand Pipeline";
        if (notApplicable) description = "Qualified creditor opportunities and procurement stages";
        if (notApplicable) whyItMatters = "Predicts near-term contracted revenue";
      } else if (profile === "hospitality_coffee") {
        inputLabel = "Wholesale Pipeline";
        subGroup = "Demand Pipeline";
        if (notApplicable) description = "Qualified cafe and restaurant partnership opportunities";
        if (notApplicable) whyItMatters = "Predicts future wholesale volume";
      } else {
        inputLabel = "Growth Pipeline";
        subGroup = "Demand Pipeline";
        if (notApplicable) description = "Qualified leads and wholesale opportunities";
        if (notApplicable) whyItMatters = "Predicts near-term revenue growth";
      }
    } else if (args.inputKey === "family-satisfaction") {
      if (profile === "fintech_collections") {
        inputLabel = "Debtor Experience Signals";
        subGroup = "Customer Experience";
        if (notApplicable) description = "Complaint trends, resolution quality, and fairness sentiment";
        if (notApplicable) whyItMatters = "Reduces compliance and reputational risk";
      } else {
        inputLabel = "Customer Experience Signals";
        subGroup = "Customer Experience";
        if (notApplicable) description = "Ratings, reviews, and partner NPS";
        if (notApplicable) whyItMatters = "Guides product quality and service improvements";
      }
    }
  }

  const needsOdiSignal = (text: string) =>
    !/\bodi\b|\bjob\b|\boutcome\b|\bimportance\b|\bsatisfaction\b/.test(String(text || "").toLowerCase());
  if (args.inputKey === "needs-assessment") {
    if (needsOdiSignal(description)) description = "ODI job map and desired outcomes by segment";
    if (needsOdiSignal(whyItMatters)) whyItMatters = "Sets importance and satisfaction gaps before solution bets";
  } else if (args.inputKey === "outcome-data") {
    if (needsOdiSignal(description)) description = "Track ODI outcome satisfaction and completion signals";
    if (needsOdiSignal(whyItMatters)) whyItMatters = "Validates progress on high-importance underserved outcomes";
  } else if (args.inputKey === "referral-map") {
    if (needsOdiSignal(description)) description = "Map decision-journey triggers and trusted acquisition sources";
    if (needsOdiSignal(whyItMatters)) whyItMatters = "Shows where customers discover, evaluate, and choose";
  }

  return { inputLabel, subGroup, description, whyItMatters };
}

const PUBLIC_SEED_COMPLETENESS_BY_KEY: Record<string, number> = {
  "comp-alt": 30,
  "unique-attr": 28,
  "val-prop": 27,
  "target-aud": 24,
  "market-cat": 25,
  "program-model": 26,
  "needs-assessment": 20,
  "outcome-data": 16,
  "referral-map": 14,
  "brand-narrative": 18,
  "channel-strat": 12,
  "donor-retention": 10,
  "grant-pipeline": 10,
  "family-satisfaction": 11,
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
        supabase.from('input_files').select('*').in('input_id', inputIds),
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
      if (dbError) throw dbError;

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

export function useDeleteInputFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, filePath }: { id: string; filePath: string }) => {
      await supabase.storage.from('input-files').remove([filePath]);
      const { error } = await supabase.from('input_files').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inputs'] }),
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
