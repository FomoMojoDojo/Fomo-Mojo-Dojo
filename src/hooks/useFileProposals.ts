import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface CandidateNeed {
  desired_outcome: string;
  importance?: number;
  satisfaction?: number;
  customer_validated?: boolean;
}

export interface FileProposalRow {
  id: string;
  company_id: string;
  file_id: string;
  file_name: string;
  source_type: string;
  summary: string;
  signal_type: string;
  suggested_areas: string[];
  candidate_needs: CandidateNeed[];
  possible_gaps: string[];
  possible_routes: string[];
  confidence: 'high' | 'medium' | 'low';
  questions_to_verify: string[];
  status: 'pending' | 'accepted' | 'rejected';
  processing_state: 'queued' | 'running' | 'ready' | 'failed';
  processing_error: string | null;
  processing_started_at: string | null;
  processing_completed_at: string | null;
  applied_areas: string[];
  created_at: string;
  reviewed_at: string | null;
}

// Fetches pending and accepted proposals for a company's files.
// Rejected proposals are excluded — they remain in the DB but never surface
// in the UI or affect scoring.
export function useFileProposals(companyId: string | null | undefined) {
  return useQuery({
    queryKey: ['file-proposals', companyId],
    queryFn: async (): Promise<FileProposalRow[]> => {
      if (!companyId) return [];

      const { data, error } = await supabase
        .from('file_proposals')
        .select('*')
        .eq('company_id', companyId)
        .neq('status', 'rejected')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data ?? []) as FileProposalRow[];
    },
    refetchInterval: (query) => {
      const rows = (query.state.data ?? []) as FileProposalRow[];
      return rows.some((row) => row.processing_state === 'queued' || row.processing_state === 'running')
        ? 5000
        : false;
    },
    enabled: !!companyId,
  });
}
