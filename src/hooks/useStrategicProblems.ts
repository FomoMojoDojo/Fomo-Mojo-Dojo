import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type StrategicProblem = {
  id: string;
  statement: string;
  source: "client" | "intake" | "company" | "public" | "evidence";
  status: "open" | "reconciled";
  reconciliation_note: string | null;
  created_at: string;
  updated_at: string;
};

type StrategicProblemRow = {
  id: string;
  statement: string;
  source: string;
  status: string;
  reconciliation_note: string | null;
  created_at: string;
  updated_at: string;
};

function normalizeSource(value: unknown): StrategicProblem["source"] {
  const source = String(value || "").toLowerCase();
  if (source === "intake" || source === "company" || source === "public" || source === "evidence") {
    return source;
  }
  return "client";
}

function normalizeStatus(value: unknown): StrategicProblem["status"] {
  return String(value || "").toLowerCase() === "reconciled" ? "reconciled" : "open";
}

function mapRow(row: StrategicProblemRow): StrategicProblem {
  return {
    id: row.id,
    statement: String(row.statement || "").trim(),
    source: normalizeSource(row.source),
    status: normalizeStatus(row.status),
    reconciliation_note: row.reconciliation_note ? String(row.reconciliation_note).trim() : null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function isMissingTableError(message: string) {
  const normalized = String(message || "").toLowerCase();
  return (
    normalized.includes("could not find the table") ||
    normalized.includes("strategy_problem_statements") ||
    normalized.includes("schema cache")
  );
}

export function useStrategicProblems(companyId?: string) {
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<StrategicProblem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [tableMissing, setTableMissing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reconcilingId, setReconcilingId] = useState<string | null>(null);

  const load = async (id: string) => {
    setLoading(true);
    setError(null);
    const client = supabase as any;
    const { data, error } = await client
      .from("strategy_problem_statements")
      .select("id, statement, source, status, reconciliation_note, created_at, updated_at")
      .eq("company_id", id)
      .order("created_at", { ascending: true })
      .limit(80);

    if (error) {
      if (isMissingTableError(error.message || "")) {
        setTableMissing(true);
        setItems([]);
        setError(null);
      } else {
        setError(error.message || "Failed to load strategic problems.");
        setItems([]);
      }
      setLoading(false);
      return;
    }

    setTableMissing(false);
    setItems(((data as StrategicProblemRow[]) ?? []).map(mapRow).filter((item) => item.statement));
    setLoading(false);
  };

  useEffect(() => {
    if (!companyId) {
      setLoading(false);
      setItems([]);
      setError(null);
      setTableMissing(false);
      return;
    }

    void load(companyId);
  }, [companyId]);

  const addProblem = async (args: {
    statement: string;
    source?: StrategicProblem["source"];
    reconciliationNote?: string;
  }) => {
    if (!companyId) throw new Error("No active company selected.");
    const statement = String(args.statement || "").trim();
    if (!statement) throw new Error("Please enter a strategic problem statement.");

    setSaving(true);
    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData?.user?.id) {
        throw new Error("You must be signed in to add strategic problems.");
      }

      const client = supabase as any;
      const payload = {
        company_id: companyId,
        user_id: authData.user.id,
        statement,
        source: args.source || "client",
        status: "open",
        reconciliation_note: args.reconciliationNote?.trim() ? args.reconciliationNote.trim() : null,
      };

      const { error } = await client.from("strategy_problem_statements").insert(payload);
      if (error) throw new Error(error.message || "Failed to save strategic problem.");
      await load(companyId);
    } finally {
      setSaving(false);
    }
  };

  const setProblemStatus = async (id: string, status: StrategicProblem["status"], reconciliationNote?: string) => {
    if (!companyId) throw new Error("No active company selected.");
    setReconcilingId(id);
    try {
      const client = supabase as any;
      const { error } = await client
        .from("strategy_problem_statements")
        .update({
          status,
          reconciliation_note: reconciliationNote?.trim() ? reconciliationNote.trim() : null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .eq("company_id", companyId);
      if (error) throw new Error(error.message || "Failed to update strategic problem.");
      await load(companyId);
    } finally {
      setReconcilingId(null);
    }
  };

  return {
    loading,
    items,
    error,
    tableMissing,
    saving,
    reconcilingId,
    addProblem,
    setProblemStatus,
    refetch: async () => {
      if (!companyId) return;
      await load(companyId);
    },
  };
}
