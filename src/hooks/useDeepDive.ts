import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { DeepDive } from '@/lib/types';
import { toast } from 'sonner';
import { useCompany } from '@/hooks/useCompany';

type DeepDiveRow = {
  user_id?: string;
  company_id?: string;
  area_key: string;
  why_it_matters: string;
  what_we_found: string;
  what_good_looks_like: string;
  path_forward: DeepDive['path_forward'] | null;
  holding_back: DeepDive['holding_back'] | null;
  generated_at?: string | null;
  updated_at?: string | null;
};

function mapRow(row: DeepDiveRow): DeepDive {
  return {
    area_key: row.area_key,
    why_it_matters: row.why_it_matters,
    what_we_found: row.what_we_found,
    what_good_looks_like: row.what_good_looks_like,
    path_forward: row.path_forward ?? [],
    holding_back: row.holding_back ?? [],
    generated_at: row.generated_at ?? null,
    updated_at: row.updated_at ?? null,
  };
}

export function useDeepDiveAnalyses() {
  const { activeCompany } = useCompany();
  const companyId = activeCompany?.id;

  return useQuery({
    queryKey: ['deep-dive-analyses', companyId],
    queryFn: async (): Promise<Record<string, DeepDive>> => {
      if (!companyId) return {};
      const { data, error } = await supabase
        .from('deep_dive_analyses')
        .select('*')
        .eq('company_id', companyId)
        .order('updated_at', { ascending: false, nullsFirst: false })
        .order('generated_at', { ascending: false, nullsFirst: false });
      if (error) throw error;
      const result: Record<string, DeepDive> = {};
      for (const row of (data ?? []) as DeepDiveRow[]) {
        if (!row.area_key) continue;
        // Keep the latest analysis per area (ordered above).
        if (result[row.area_key]) continue;
        result[row.area_key] = mapRow(row);
      }
      return result;
    },
    enabled: !!companyId,
  });
}

export function useGenerateDeepDive() {
  const qc = useQueryClient();
  const { activeCompany } = useCompany();

  return useMutation({
    mutationFn: async (areaKey: string): Promise<DeepDive> => {
      if (!activeCompany?.id) throw new Error('Select a company before generating a deep dive');
      const { data, error } = await supabase.functions.invoke('generate-deep-dive', {
        body: { area_key: areaKey, company_id: activeCompany?.id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as DeepDive;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['deep-dive-analyses', activeCompany?.id] });
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : 'Failed to generate analysis');
    },
  });
}
