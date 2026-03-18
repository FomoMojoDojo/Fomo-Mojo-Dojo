import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { InputItem, InputFile } from '@/lib/types';
import { useCompany } from '@/hooks/useCompany';

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
};

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

function mapInput(row: InputRow, subitems: InputSubitemRow[], files: InputFileRow[]): InputItem {
  const seeded = inferPublicSeed(row);
  return {
    id: row.id,
    input_key: row.input_key,
    input_label: row.input_label,
    group_key: row.group_key,
    group_label: row.group_label,
    sub_group: row.sub_group,
    completeness: seeded.completeness,
    status: seeded.status,
    score_impact: Number(row.score_impact),
    impact_tier: row.impact_tier,
    description: row.description,
    why_it_matters: row.why_it_matters,
    subitems: subitems
      .filter((s) => s.input_id === row.id)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((s) => ({ id: s.id, sort_order: s.sort_order, name: s.name, done: s.done })),
    files: files
      .filter((f) => f.input_id === row.id)
      .map((f) => ({ id: f.id, file_name: f.file_name, file_type: f.file_type, file_url: f.file_path, tags: f.tags ?? [] })),
  };
}

export function useInputs() {
  const qc = useQueryClient();
  const { activeCompany } = useCompany();
  const companyId = activeCompany?.id;

  const query = useQuery({
    queryKey: ['inputs', companyId],
    queryFn: async (): Promise<InputItem[]> => {
      if (!companyId) return [];
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
        mapInput(row, (subs ?? []) as InputSubitemRow[], (files ?? []) as InputFileRow[])
      );
    },
    enabled: !!companyId,
  });


  // Manual re-seed function
  const reseed = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.functions.invoke('seed-inputs', { body: { company_id: companyId } });
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
    mutationFn: async ({ inputId, file, tags }: { inputId: string; file: File; tags?: string[] }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const filePath = `${user.id}/${inputId}/${Date.now()}-${file.name}`;
      const { error: uploadError } = await supabase.storage.from('input-files').upload(filePath, file);
      if (uploadError) throw uploadError;

      const { error: dbError } = await supabase.from('input_files').insert({
        input_id: inputId,
        file_name: file.name,
        file_type: file.type || file.name.split('.').pop() || '',
        file_path: filePath,
        tags: tags ?? [],
      });
      if (dbError) throw dbError;
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
