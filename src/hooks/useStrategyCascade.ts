import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { StrategyCascade, CascadeAssumption, CascadeItem } from "@/lib/types";

type StrategyCascadeRow = {
  id: string;
  company_id: string;
  winning_aspiration: string;
  where_to_play: string;
  how_to_win: string;
  capabilities_json: unknown;
  management_systems_json: unknown;
  assumptions_json: unknown;
  frameworks_used: string[];
  created_at: string;
  updated_at: string;
};

function isStatus(value: unknown): value is CascadeItem["status"] {
  return value === "strong" || value === "developing" || value === "gap";
}

function normalizeItems(value: unknown): CascadeItem[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      const entry = item as { name?: unknown; status?: unknown; note?: unknown };
      const name = typeof entry?.name === "string" ? entry.name.trim() : "";
      const status = isStatus(entry?.status) ? entry.status : "developing";
      const note = typeof entry?.note === "string" ? entry.note.trim() : "";
      if (!name) return null;
      return note ? { name, status, note } : { name, status };
    })
    .filter((item): item is CascadeItem => item !== null);
}

function normalizeAssumptions(value: unknown): CascadeAssumption[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      const entry = item as { assumption?: unknown; tested?: unknown; note?: unknown; outcome?: unknown };
      const assumption = typeof entry?.assumption === "string" ? entry.assumption.trim() : "";
      if (!assumption) return null;
      const note =
        typeof entry?.note === "string"
          ? entry.note.trim()
          : typeof entry?.outcome === "string"
            ? entry.outcome.trim()
            : "";
      return note
        ? { assumption, tested: !!entry?.tested, note, outcome: note }
        : { assumption, tested: !!entry?.tested };
    })
    .filter((item): item is CascadeAssumption => item !== null);
}

function mapRow(row: StrategyCascadeRow): StrategyCascade {
  return {
    winning_aspiration: row.winning_aspiration || "",
    where_to_play: row.where_to_play || "",
    how_to_win: row.how_to_win || "",
    capabilities: normalizeItems(row.capabilities_json),
    management_systems: normalizeItems(row.management_systems_json),
    assumptions: normalizeAssumptions(row.assumptions_json),
  };
}

export function useStrategyCascade(companyId?: string) {
  const [loading, setLoading] = useState(false);
  const [item, setItem] = useState<StrategyCascade | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savingField, setSavingField] = useState<"winning_aspiration" | "where_to_play" | "how_to_win" | null>(null);

  useEffect(() => {
    if (!companyId) {
      setItem(null);
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      setItem(null);
      setLoading(true);
      setError(null);

      const { data, error } = await supabase
        .from("strategy_cascades")
        .select(
          "id, company_id, winning_aspiration, where_to_play, how_to_win, capabilities_json, management_systems_json, assumptions_json, frameworks_used, created_at, updated_at"
        )
        .eq("company_id", companyId)
        .maybeSingle();

      if (cancelled) return;

      if (error) {
        const msg = error.message.toLowerCase();
        if (
          msg.includes("could not find the table") ||
          msg.includes("strategy_cascades") ||
          msg.includes("schema cache")
        ) {
          setItem(null);
          setError(null);
        } else {
          setError(error.message);
          setItem(null);
        }
      } else {
        setItem(data ? mapRow(data as StrategyCascadeRow) : null);
      }

      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [companyId]);

  async function updateNarrativeField(
    field: "winning_aspiration" | "where_to_play" | "how_to_win",
    value: string,
  ) {
    if (!companyId) throw new Error("Select a company first.");

    setSavingField(field);
    try {
      const { data, error } = await supabase
        .from("strategy_cascades")
        .update({ [field]: String(value || "").trim() })
        .eq("company_id", companyId)
        .select(
          "id, company_id, winning_aspiration, where_to_play, how_to_win, capabilities_json, management_systems_json, assumptions_json, frameworks_used, created_at, updated_at"
        )
        .maybeSingle();

      if (error) {
        throw new Error(error.message || "Failed to update strategy narrative.");
      }

      if (data) {
        setItem(mapRow(data as StrategyCascadeRow));
      } else if (item) {
        setItem({
          ...item,
          [field]: String(value || "").trim(),
        });
      }
    } finally {
      setSavingField(null);
    }
  }

  async function updateListField(
    field: "capabilities_json" | "management_systems_json",
    items: CascadeItem[],
  ) {
    if (!companyId) throw new Error("Select a company first.");

    const { data, error } = await supabase
      .from("strategy_cascades")
      .update({ [field]: items })
      .eq("company_id", companyId)
      .select(
        "id, company_id, winning_aspiration, where_to_play, how_to_win, capabilities_json, management_systems_json, assumptions_json, frameworks_used, created_at, updated_at"
      )
      .maybeSingle();

    if (error) throw new Error(error.message || "Failed to update strategy list.");

    if (data) {
      setItem(mapRow(data as StrategyCascadeRow));
    } else if (item) {
      setItem({
        ...item,
        ...(field === "capabilities_json"
          ? { capabilities: items }
          : { management_systems: items }),
      });
    }
  }

  return { loading, item, error, savingField, updateNarrativeField, updateListField };
}
