import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ensureRequiredFrameworkKeys } from "@/lib/opportunityTreeSemantics";

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

type ManagedOutcomeInput = {
  journey_key: string;
  outcome_title: string;
  outcome_statement: string;
  leading_indicator: string;
  target_direction: string;
  evidence_basis: string;
  confidence: number;
  frameworks_used?: string[];
};

function normalizeManagedOutcomeRow(row: ManagedOutcomeRow): ManagedOutcome {
  return {
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
  };
}

export function useManagedOutcomes(companyId?: string) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
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
        const normalized = ((data as ManagedOutcomeRow[] | null) ?? [])
          .map(normalizeManagedOutcomeRow)
          .sort((a, b) => {
            if (a.journey_key !== b.journey_key) return a.journey_key.localeCompare(b.journey_key);
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
          });
        setItems(normalized);
      }

      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [companyId]);

  async function createManagedOutcome(input: ManagedOutcomeInput) {
    if (!companyId) throw new Error("No company selected.");
    setSaving(true);
    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw new Error(authError.message || "Failed to resolve current user.");
      const userId = authData.user?.id;
      if (!userId) throw new Error("You must be signed in to add desired outcomes.");

      const payload = {
        company_id: companyId,
        user_id: userId,
        journey_key: String(input.journey_key || "").trim() || "customer",
        outcome_title: String(input.outcome_title || "").trim(),
        outcome_statement: String(input.outcome_statement || "").trim(),
        leading_indicator: String(input.leading_indicator || "").trim(),
        target_direction: String(input.target_direction || "").trim() || "increase",
        evidence_basis: String(input.evidence_basis || "").trim(),
        confidence: Number.isFinite(Number(input.confidence)) ? Number(input.confidence) : 55,
        frameworks_used: ensureRequiredFrameworkKeys(
          Array.isArray(input.frameworks_used) && input.frameworks_used.length > 0
            ? input.frameworks_used
            : ["odi", "teresa_torres"],
        ),
      };

      const { data, error } = await supabase
        .from("managed_outcomes")
        .insert(payload)
        .select("id, company_id, user_id, journey_key, outcome_title, outcome_statement, leading_indicator, target_direction, evidence_basis, confidence, frameworks_used, created_at, updated_at")
        .single();

      if (error) throw new Error(error.message || "Failed to add desired outcome.");
      const normalized = normalizeManagedOutcomeRow(data as ManagedOutcomeRow);
      setItems((current) =>
        [...current, normalized].sort((a, b) => {
          if (a.journey_key !== b.journey_key) return a.journey_key.localeCompare(b.journey_key);
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        }),
      );
      return normalized;
    } finally {
      setSaving(false);
    }
  }

  async function updateManagedOutcome(id: string, input: Partial<ManagedOutcomeInput>) {
    if (!companyId) throw new Error("No company selected.");
    const outcomeId = String(id || "").trim();
    if (!outcomeId) throw new Error("Missing desired outcome id.");
    setSaving(true);
    try {
      const patch: Record<string, unknown> = {};
      if (input.journey_key !== undefined) patch.journey_key = String(input.journey_key || "").trim() || "customer";
      if (input.outcome_title !== undefined) patch.outcome_title = String(input.outcome_title || "").trim();
      if (input.outcome_statement !== undefined) patch.outcome_statement = String(input.outcome_statement || "").trim();
      if (input.leading_indicator !== undefined) patch.leading_indicator = String(input.leading_indicator || "").trim();
      if (input.target_direction !== undefined) patch.target_direction = String(input.target_direction || "").trim() || "increase";
      if (input.evidence_basis !== undefined) patch.evidence_basis = String(input.evidence_basis || "").trim();
      if (input.confidence !== undefined && Number.isFinite(Number(input.confidence))) patch.confidence = Number(input.confidence);
      if (input.frameworks_used !== undefined && Array.isArray(input.frameworks_used)) {
        patch.frameworks_used = ensureRequiredFrameworkKeys(input.frameworks_used);
      }

      const { data, error } = await supabase
        .from("managed_outcomes")
        .update(patch)
        .eq("company_id", companyId)
        .eq("id", outcomeId)
        .select("id, company_id, user_id, journey_key, outcome_title, outcome_statement, leading_indicator, target_direction, evidence_basis, confidence, frameworks_used, created_at, updated_at")
        .single();

      if (error) throw new Error(error.message || "Failed to update desired outcome.");
      const normalized = normalizeManagedOutcomeRow(data as ManagedOutcomeRow);
      setItems((current) => current.map((item) => (item.id === normalized.id ? normalized : item)));
      return normalized;
    } finally {
      setSaving(false);
    }
  }

  return { loading, saving, items, error, createManagedOutcome, updateManagedOutcome };
}
