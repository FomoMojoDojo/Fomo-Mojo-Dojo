import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

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
  created_at?: string;
};

export function useOpportunities(companyId?: string) {
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<OpportunityRow[]>([]);
  const [error, setError] = useState<string | null>(null);

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

      const { data, error } = await supabase
        .from('opportunities')
        .select(
          'id, company_id, user_id, outcome, step_number, step_label, journey_key, importance, satisfaction, opportunity_score, priority_tier, created_at'
        )
        .eq('company_id', companyId)
        .order('opportunity_score', { ascending: false })
        .limit(200);

      if (cancelled) return;

      if (error) {
        setError(error.message);
        setItems([]);
      } else {
        setItems((data as any[]) ?? []);
      }

      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [companyId]);

  return { loading, items, error };
}