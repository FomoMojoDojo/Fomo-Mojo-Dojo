import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type StrategicAssumption = {
  id: string;
  assumption: string;
  source: "client" | "intake" | "company" | "public" | "evidence";
  status: "untested" | "validating" | "validated" | "invalidated";
  note: string | null;
  created_at: string;
  updated_at: string;
};

type StrategicAssumptionRow = {
  id: string;
  assumption: string;
  source: string;
  status: string;
  note: string | null;
  created_at: string;
  updated_at: string;
};

function normalizeSource(value: unknown): StrategicAssumption["source"] {
  const source = String(value || "").toLowerCase();
  if (source === "intake" || source === "company" || source === "public" || source === "evidence") {
    return source;
  }
  return "client";
}

function normalizeStatus(value: unknown): StrategicAssumption["status"] {
  const status = String(value || "").toLowerCase();
  if (status === "validating" || status === "validated" || status === "invalidated") {
    return status;
  }
  return "untested";
}

function mapRow(row: StrategicAssumptionRow): StrategicAssumption {
  return {
    id: row.id,
    assumption: String(row.assumption || "").trim(),
    source: normalizeSource(row.source),
    status: normalizeStatus(row.status),
    note: row.note ? String(row.note).trim() : null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function isMissingTableError(message: string) {
  const normalized = String(message || "").toLowerCase();
  return (
    normalized.includes("could not find the table") ||
    normalized.includes("strategy_assumptions") ||
    normalized.includes("schema cache")
  );
}

export function useStrategicAssumptions(companyId?: string) {
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<StrategicAssumption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [tableMissing, setTableMissing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const load = async (id: string) => {
    setLoading(true);
    setError(null);

    const client = supabase as any;
    const { data, error } = await client
      .from("strategy_assumptions")
      .select("id, assumption, source, status, note, created_at, updated_at")
      .eq("company_id", id)
      .order("created_at", { ascending: true })
      .limit(120);

    if (error) {
      if (isMissingTableError(error.message || "")) {
        setTableMissing(true);
        setItems([]);
        setError(null);
      } else {
        setError(error.message || "Failed to load assumptions.");
        setItems([]);
      }
      setLoading(false);
      return;
    }

    setTableMissing(false);
    setItems(((data as StrategicAssumptionRow[]) ?? []).map(mapRow).filter((item) => item.assumption));
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

  const addAssumption = async (args: {
    assumption: string;
    source?: StrategicAssumption["source"];
    status?: StrategicAssumption["status"];
    note?: string;
  }) => {
    if (!companyId) throw new Error("No active company selected.");
    const assumption = String(args.assumption || "").trim();
    if (!assumption) throw new Error("Please enter an assumption.");

    setSaving(true);
    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData?.user?.id) {
        throw new Error("You must be signed in to add assumptions.");
      }

      const client = supabase as any;
      const payload = {
        company_id: companyId,
        user_id: authData.user.id,
        assumption,
        source: args.source || "client",
        status: args.status || "untested",
        note: args.note?.trim() ? args.note.trim() : null,
      };

      const { error } = await client.from("strategy_assumptions").insert(payload);
      if (error) throw new Error(error.message || "Failed to save assumption.");
      await load(companyId);
    } finally {
      setSaving(false);
    }
  };

  const setAssumptionStatus = async (
    id: string,
    status: StrategicAssumption["status"],
    note?: string,
  ) => {
    if (!companyId) throw new Error("No active company selected.");
    setUpdatingId(id);
    try {
      const client = supabase as any;
      const { error } = await client
        .from("strategy_assumptions")
        .update({
          status,
          note: note?.trim() ? note.trim() : null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .eq("company_id", companyId);

      if (error) throw new Error(error.message || "Failed to update assumption.");
      await load(companyId);
    } finally {
      setUpdatingId(null);
    }
  };

  const updateAssumption = async (
    id: string,
    updates: {
      assumption?: string;
      source?: StrategicAssumption["source"];
      status?: StrategicAssumption["status"];
      note?: string;
    },
  ) => {
    if (!companyId) throw new Error("No active company selected.");
    const assumption = updates.assumption !== undefined ? String(updates.assumption || "").trim() : undefined;
    if (assumption !== undefined && !assumption) {
      throw new Error("Assumption text cannot be empty.");
    }

    setUpdatingId(id);
    try {
      const client = supabase as any;
      const { error } = await client
        .from("strategy_assumptions")
        .update({
          ...(assumption !== undefined ? { assumption } : {}),
          ...(updates.source ? { source: updates.source } : {}),
          ...(updates.status ? { status: updates.status } : {}),
          ...(updates.note !== undefined ? { note: updates.note.trim() ? updates.note.trim() : null } : {}),
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .eq("company_id", companyId);

      if (error) throw new Error(error.message || "Failed to update assumption.");
      await load(companyId);
    } finally {
      setUpdatingId(null);
    }
  };

  return {
    loading,
    items,
    error,
    tableMissing,
    saving,
    updatingId,
    addAssumption,
    setAssumptionStatus,
    updateAssumption,
    refetch: async () => {
      if (!companyId) return;
      await load(companyId);
    },
  };
}
