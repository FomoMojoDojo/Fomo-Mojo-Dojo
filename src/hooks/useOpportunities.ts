import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type WorkflowStatus = 'in_progress' | 'planned' | 'parked';

export type OpportunityRow = {
  id: string;
  company_id: string;
  user_id: string;
  outcome: string;
  step_number: number | null;
  step_label: string | null;
  journey_key: 'customer' | 'revenue' | 'operations' | string;
  importance: number | null;
  satisfaction: number | null;
  opportunity_score: number | null;
  priority_tier: 'focus' | 'monitor' | 'defer' | string;
  workflow_status: WorkflowStatus | string | null;
  created_at?: string;
};

export function useOpportunities(companyId?: string) {
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<OpportunityRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [updatingWorkflowId, setUpdatingWorkflowId] = useState<string | null>(null);
  const [workflowStatusAvailable, setWorkflowStatusAvailable] = useState(true);

  useEffect(() => {
    if (!companyId) {
      setItems([]);
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      setWorkflowStatusAvailable(true);

      const primary = await supabase
        .from('opportunities')
        .select(
          'id, company_id, user_id, outcome, step_number, step_label, journey_key, importance, satisfaction, opportunity_score, priority_tier, workflow_status, created_at'
        )
        .eq('company_id', companyId)
        .order('opportunity_score', { ascending: false })
        .limit(200);

      if (cancelled) return;

      const missingWorkflowColumn = Boolean(
        primary.error?.message &&
          /column\s+.*workflow_status.*does not exist|workflow_status.*does not exist/i.test(primary.error.message),
      );

      if (missingWorkflowColumn) {
        setWorkflowStatusAvailable(false);
        const fallback = await supabase
          .from('opportunities')
          .select(
            'id, company_id, user_id, outcome, step_number, step_label, journey_key, importance, satisfaction, opportunity_score, priority_tier, created_at'
          )
          .eq('company_id', companyId)
          .order('opportunity_score', { ascending: false })
          .limit(200);

        if (cancelled) return;

        if (fallback.error) {
          setError(fallback.error.message);
          setItems([]);
        } else {
          const normalized = ((fallback.data as any[]) ?? []).map((row) => ({
            ...row,
            workflow_status: null,
          }));
          setItems(normalized);
        }
      } else if (primary.error) {
        setError(primary.error.message);
        setItems([]);
      } else {
        setItems((primary.data as any[]) ?? []);
      }

      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [companyId]);

  return {
    loading,
    items,
    error,
    updatingWorkflowId,
    workflowStatusAvailable,
    updateWorkflowStatus: async (opportunityId: string, workflowStatus: WorkflowStatus) => {
      if (!companyId) throw new Error('No active company selected.');
      if (!workflowStatusAvailable) {
        throw new Error('Workflow labels require the latest database migration. Please apply migrations and refresh.');
      }
      const id = String(opportunityId || '').trim();
      if (!id) throw new Error('Missing opportunity id.');
      if (!['in_progress', 'planned', 'parked'].includes(workflowStatus)) {
        throw new Error('Invalid workflow status.');
      }

      setUpdatingWorkflowId(id);
      try {
        const { error: updateError } = await supabase
          .from('opportunities')
          .update({
            workflow_status: workflowStatus,
          })
          .eq('company_id', companyId)
          .eq('id', id);

        if (updateError) throw new Error(updateError.message || 'Failed to update workflow status.');

        setItems((current) =>
          current.map((row) =>
            row.id === id
              ? {
                  ...row,
                  workflow_status: workflowStatus,
                }
              : row,
          ),
        );
      } finally {
        setUpdatingWorkflowId(null);
      }
    },
  };
}
