import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type ManagedOutcome = {
  id: string;
  journey_key: string;
  outcome_title: string;
  outcome_statement: string;
  leading_indicator: string;
  target_direction: string;
  evidence_basis: string;
  confidence: number;
  frameworks_used: string[];
  created_at: string;
  updated_at: string;
};

type ManagedOutcomeRow = ManagedOutcome & {
  company_id: string;
  user_id: string;
};

export function useManagedOutcomes(companyId?: string) {
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<ManagedOutcome[]>([]);
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
        .from("managed_outcomes")
        .select("id, company_id, user_id, journey_key, outcome_title, outcome_statement, leading_indicator, target_direction, evidence_basis, confidence, frameworks_used, created_at, updated_at")
        .eq("company_id", companyId)
        .order("journey_key", { ascending: true });

      if (cancelled) return;

      if (error) {
        const msg = error.message.toLowerCase();
        if (
          msg.includes("could not find the table") ||
          msg.includes("managed_outcomes") ||
          msg.includes("schema cache")
        ) {
          setItems([]);
          setError(null);
        } else {
          setItems([]);
          setError(error.message);
        }
      } else {
        setItems(((data as ManagedOutcomeRow[] | null) ?? []).map((row) => ({
          id: row.id,
          journey_key: row.journey_key,
          outcome_title: row.outcome_title,
          outcome_statement: row.outcome_statement,
          leading_indicator: row.leading_indicator,
          target_direction: row.target_direction,
          evidence_basis: row.evidence_basis,
          confidence: row.confidence,
          frameworks_used: row.frameworks_used,
          created_at: row.created_at,
          updated_at: row.updated_at,
        })));
      }

      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [companyId]);

  return { loading, items, error };
}
