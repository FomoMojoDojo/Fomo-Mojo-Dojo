import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface CompanyFileRow {
  id: string;
  input_id: string;
  file_name: string;
  file_type: string;
  file_path: string;
  tags: string[] | null;
  uploaded_at: string;
}

// Fetches all input_files for a company by joining through inputs.company_id.
// Intentionally lightweight — avoids the full useInputs overhead.
export function useCompanyFiles(companyId: string | null | undefined) {
  return useQuery({
    queryKey: ['company-files', companyId],
    queryFn: async (): Promise<CompanyFileRow[]> => {
      if (!companyId) return [];

      const { data: inputRows, error: e1 } = await supabase
        .from('inputs')
        .select('id')
        .eq('company_id', companyId);
      if (e1) throw e1;

      const inputIds = (inputRows ?? []).map((r: { id: string }) => r.id);
      if (inputIds.length === 0) return [];

      const { data: files, error: e2 } = await supabase
        .from('input_files')
        .select('*')
        .in('input_id', inputIds)
        .order('uploaded_at', { ascending: false });
      if (e2) throw e2;

      return (files ?? []) as CompanyFileRow[];
    },
    enabled: !!companyId,
  });
}
