import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type WorkflowStatus = 'in_progress' | 'planned' | 'parked';

export type OpportunityRow = {
  id: string;
  company_id: string;
  user_id: string;
  managed_outcome_id: string | null;
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
  const [managedOutcomeLinkAvailable, setManagedOutcomeLinkAvailable] = useState(true);

  const load = useCallback(async (id: string, args?: { cancelled?: () => boolean }) => {
    setLoading(true);
    setError(null);
    setWorkflowStatusAvailable(true);
    setManagedOutcomeLinkAvailable(true);

    const runSelect = async (includeManagedOutcome: boolean, includeWorkflow: boolean) => {
      const columns = [
        'id',
        'company_id',
        'user_id',
        includeManagedOutcome ? 'managed_outcome_id' : null,
        'outcome',
        'step_number',
        'step_label',
        'journey_key',
        'importance',
        'satisfaction',
        'opportunity_score',
        'priority_tier',
        includeWorkflow ? 'workflow_status' : null,
        'created_at',
      ]
        .filter(Boolean)
        .join(', ');

      return supabase
        .from('opportunities')
        .select(columns)
        .eq('company_id', id)
        .order('opportunity_score', { ascending: false })
        .limit(200);
    };

    let result = await runSelect(true, true);

    if (args?.cancelled?.()) return;

    const missingManagedOutcomeColumn = Boolean(
      result.error?.message &&
        /column\s+.*managed_outcome_id.*does not exist|managed_outcome_id.*does not exist/i.test(result.error.message),
    );
    const missingWorkflowColumn = Boolean(
      result.error?.message &&
        /column\s+.*workflow_status.*does not exist|workflow_status.*does not exist/i.test(result.error.message),
    );

    if (missingManagedOutcomeColumn || missingWorkflowColumn) {
      if (missingManagedOutcomeColumn) setManagedOutcomeLinkAvailable(false);
      if (missingWorkflowColumn) setWorkflowStatusAvailable(false);
      result = await runSelect(!missingManagedOutcomeColumn, !missingWorkflowColumn);

      if (args?.cancelled?.()) return;

      if (result.error) {
        setError(result.error.message);
        setItems([]);
      } else {
        const normalized = ((result.data as any[]) ?? []).map((row) => ({
          ...row,
          managed_outcome_id: missingManagedOutcomeColumn ? null : (row as any).managed_outcome_id ?? null,
          workflow_status: missingWorkflowColumn ? null : (row as any).workflow_status ?? null,
        }));
        setItems(normalized);
      }
    } else if (result.error) {
      setError(result.error.message);
      setItems([]);
    } else {
      setItems((result.data as any[]) ?? []);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    if (!companyId) {
      setItems([]);
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    void load(companyId, { cancelled: () => cancelled });

    return () => {
      cancelled = true;
    };
  }, [companyId, load]);

  return {
    loading,
    items,
    error,
    updatingWorkflowId,
    workflowStatusAvailable,
    managedOutcomeLinkAvailable,
    refetch: async () => {
      if (!companyId) return;
      await load(companyId);
    },
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
