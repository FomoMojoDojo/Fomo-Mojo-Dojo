import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { PositioningCanvas, PositioningItem } from "@/lib/types";

type PositioningCanvasRow = {
  id: string;
  company_id: string;
  competitive_alternatives_json: unknown;
  unique_attributes_json: unknown;
  value_for_customer: string;
  best_fit_customers: string;
  market_category: string;
  category_rationale: string;
  current_tagline: string;
  proposed_tagline: string;
  frameworks_used: string[];
  created_at: string;
  updated_at: string;
};

function normalizeItems(value: unknown): PositioningItem[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item, index) => {
      if (typeof item === "string") {
        const name = item.trim();
        if (!name) return null;
        return {
          id: `item-${index}`,
          name,
          description: "",
          highlighted: false,
        };
      }

      const entry = item as {
        id?: unknown;
        name?: unknown;
        title?: unknown;
        alternative?: unknown;
        attribute?: unknown;
        description?: unknown;
        detail?: unknown;
        highlighted?: unknown;
      };
      const name = (
        typeof entry?.name === "string"
          ? entry.name
          : typeof entry?.title === "string"
            ? entry.title
            : typeof entry?.alternative === "string"
              ? entry.alternative
              : typeof entry?.attribute === "string"
                ? entry.attribute
                : ""
      ).trim();
      const description = (
        typeof entry?.description === "string"
          ? entry.description
          : typeof entry?.detail === "string"
            ? entry.detail
            : ""
      ).trim();
      if (!name) return null;
      return {
        id: typeof entry?.id === "string" && entry.id.trim() ? entry.id : `item-${index}`,
        name,
        description,
        highlighted: !!entry?.highlighted,
      };
    })
    .filter((item): item is PositioningItem => item !== null);
}

function mapRow(row: PositioningCanvasRow): PositioningCanvas {
  return {
    competitive_alternatives: normalizeItems(row.competitive_alternatives_json),
    unique_attributes: normalizeItems(row.unique_attributes_json),
    value_for_customer: row.value_for_customer || "",
    best_fit_customers: row.best_fit_customers || "",
    market_category: row.market_category || "",
    category_rationale: row.category_rationale || "",
    current_tagline: row.current_tagline || "",
    proposed_tagline: row.proposed_tagline || "",
    frameworks_used: Array.isArray(row.frameworks_used) ? row.frameworks_used : [],
  };
}

type PositioningTextField =
  | "value_for_customer"
  | "best_fit_customers"
  | "market_category"
  | "category_rationale"
  | "current_tagline"
  | "proposed_tagline";

type PositioningItemsField =
  | "competitive_alternatives_json"
  | "unique_attributes_json";

type PositioningUpdateField = PositioningTextField | PositioningItemsField;

export function usePositioningCanvas(companyId?: string) {
  const [loading, setLoading] = useState(false);
  const [item, setItem] = useState<PositioningCanvas | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savingField, setSavingField] = useState<PositioningUpdateField | null>(null);

  useEffect(() => {
    if (!companyId) {
      setItem(null);
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);

      const { data, error } = await supabase
        .from("positioning_canvases")
        .select(
          "id, company_id, competitive_alternatives_json, unique_attributes_json, value_for_customer, best_fit_customers, market_category, category_rationale, current_tagline, proposed_tagline, frameworks_used, created_at, updated_at"
        )
        .eq("company_id", companyId)
        .maybeSingle();

      if (cancelled) return;

      if (error) {
        const msg = error.message.toLowerCase();
        if (
          msg.includes("could not find the table") ||
          msg.includes("positioning_canvases") ||
          msg.includes("schema cache")
        ) {
          setItem(null);
          setError(null);
        } else {
          setError(error.message);
          setItem(null);
        }
      } else {
        setItem(data ? mapRow(data as PositioningCanvasRow) : null);
      }

      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [companyId]);

  async function updateTextField(field: PositioningTextField, value: string) {
    if (!companyId) throw new Error("Select a company first.");

    setSavingField(field);
    try {
      const { data, error } = await supabase
        .from("positioning_canvases")
        .update({ [field]: String(value || "").trim() })
        .eq("company_id", companyId)
        .select(
          "id, company_id, competitive_alternatives_json, unique_attributes_json, value_for_customer, best_fit_customers, market_category, category_rationale, current_tagline, proposed_tagline, frameworks_used, created_at, updated_at"
        )
        .maybeSingle();

      if (error) {
        throw new Error(error.message || "Failed to update positioning text.");
      }

      if (data) {
        setItem(mapRow(data as PositioningCanvasRow));
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

  async function updateItemsField(field: PositioningItemsField, items: PositioningItem[]) {
    if (!companyId) throw new Error("Select a company first.");

    setSavingField(field);
    try {
      const { data, error } = await supabase
        .from("positioning_canvases")
        .update({ [field]: items })
        .eq("company_id", companyId)
        .select(
          "id, company_id, competitive_alternatives_json, unique_attributes_json, value_for_customer, best_fit_customers, market_category, category_rationale, current_tagline, proposed_tagline, frameworks_used, created_at, updated_at"
        )
        .maybeSingle();

      if (error) {
        throw new Error(error.message || "Failed to update positioning list.");
      }

      if (data) {
        setItem(mapRow(data as PositioningCanvasRow));
      } else if (item) {
        setItem({
          ...item,
          ...(field === "competitive_alternatives_json"
            ? { competitive_alternatives: items }
            : { unique_attributes: items }),
        });
      }
    } finally {
      setSavingField(null);
    }
  }

  async function updateFrameworks(frameworks: string[]) {
    if (!companyId) throw new Error("Select a company first.");

    const { data, error } = await supabase
      .from("positioning_canvases")
      .update({ frameworks_used: frameworks })
      .eq("company_id", companyId)
      .select(
        "id, company_id, competitive_alternatives_json, unique_attributes_json, value_for_customer, best_fit_customers, market_category, category_rationale, current_tagline, proposed_tagline, frameworks_used, created_at, updated_at"
      )
      .maybeSingle();

    if (error) {
      throw new Error(error.message || "Failed to update framework guidance.");
    }

    if (data) {
      setItem(mapRow(data as PositioningCanvasRow));
    } else if (item) {
      setItem({ ...item, frameworks_used: frameworks });
    }
  }

  return { loading, item, error, savingField, updateTextField, updateItemsField, updateFrameworks };
}
