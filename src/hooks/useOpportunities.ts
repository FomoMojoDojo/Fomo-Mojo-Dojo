import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type WorkflowStatus = 'in_progress' | 'planned' | 'parked';

export type OpportunityRow = {
  id: string;
  company_id: string;
  user_id: string;
  managed_outcome_id: string | null;
  parent_opportunity_id: string | null;
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

    const runSelect = async (includeManagedOutcome: boolean, includeWorkflow: boolean, includeParent: boolean) => {
      const columns = [
        'id',
        'company_id',
        'user_id',
        includeManagedOutcome ? 'managed_outcome_id' : null,
        includeParent ? 'parent_opportunity_id' : null,
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

    const attempts: Array<{ includeManagedOutcome: boolean; includeWorkflow: boolean; includeParent: boolean }> = [
      { includeManagedOutcome: true, includeWorkflow: true, includeParent: true },
      { includeManagedOutcome: true, includeWorkflow: true, includeParent: false },
      { includeManagedOutcome: false, includeWorkflow: true, includeParent: false },
      { includeManagedOutcome: false, includeWorkflow: false, includeParent: false },
    ];

    let resolved: { includeManagedOutcome: boolean; includeWorkflow: boolean; includeParent: boolean } | null = null;
    let result: Awaited<ReturnType<typeof runSelect>> | null = null;

    for (const attempt of attempts) {
      result = await runSelect(attempt.includeManagedOutcome, attempt.includeWorkflow, attempt.includeParent);
      if (args?.cancelled?.()) return;
      if (!result.error) {
        resolved = attempt;
        break;
      }
    }

    if (!result || result.error || !resolved) {
      setError(String(result?.error?.message || 'Failed to load opportunities.'));
      setItems([]);
      setLoading(false);
      return;
    }

    setManagedOutcomeLinkAvailable(resolved.includeManagedOutcome);
    setWorkflowStatusAvailable(resolved.includeWorkflow);
    const normalized = ((result.data as any[]) ?? []).map((row) => ({
      ...row,
      managed_outcome_id: resolved.includeManagedOutcome ? (row as any).managed_outcome_id ?? null : null,
      parent_opportunity_id: resolved.includeParent ? (row as any).parent_opportunity_id ?? null : null,
      workflow_status: resolved.includeWorkflow ? (row as any).workflow_status ?? null : null,
    }));
    setItems(normalized);

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

  // Real-time sync: keep workflow_status in sync across all hook instances
  // (e.g. Opportunities kanban and MapView cards update each other automatically)
  useEffect(() => {
    if (!companyId) return;

    const channel = supabase
      .channel(`opportunities_workflow:${companyId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'opportunities',
          filter: `company_id=eq.${companyId}`,
        },
        (payload) => {
          const updated = payload.new as Record<string, unknown>;
          if (!updated?.id) return;
          setItems((current) =>
            current.map((row) => {
              if (row.id !== updated.id) return row;
              return {
                ...row,
                ...(updated.workflow_status !== undefined
                  ? { workflow_status: updated.workflow_status as WorkflowStatus | null }
                  : {}),
                ...(updated.priority_tier !== undefined
                  ? { priority_tier: updated.priority_tier as string }
                  : {}),
              };
            }),
          );
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [companyId]);

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
    updateWorkflowAndPriority: async (
      opportunityId: string,
      workflowStatus: WorkflowStatus,
      priorityTier: 'focus' | 'monitor' | 'defer',
    ) => {
      if (!companyId) throw new Error('No active company selected.');
      if (!workflowStatusAvailable) {
        throw new Error('Workflow labels require the latest database migration. Please apply migrations and refresh.');
      }
      const id = String(opportunityId || '').trim();
      if (!id) throw new Error('Missing opportunity id.');

      setUpdatingWorkflowId(id);
      try {
        const { error: updateError } = await supabase
          .from('opportunities')
          .update({ workflow_status: workflowStatus, priority_tier: priorityTier })
          .eq('company_id', companyId)
          .eq('id', id);

        if (updateError) throw new Error(updateError.message || 'Failed to update opportunity status.');

        setItems((current) =>
          current.map((row) =>
            row.id === id
              ? { ...row, workflow_status: workflowStatus, priority_tier: priorityTier }
              : row,
          ),
        );
      } finally {
        setUpdatingWorkflowId(null);
      }
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
