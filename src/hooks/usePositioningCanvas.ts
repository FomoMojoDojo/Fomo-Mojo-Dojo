import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { KnownTension, PositioningCanvas, PositioningItem } from "@/lib/types";
import { captureBaseline } from "@/lib/baselineCapture";

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
  strategy_alignment: string | null;
  strategy_alignment_reason: string | null;
  strategy_alignment_evaluated_at: string | null;
  known_tensions_json: unknown;
};

function normalizeKnownTensions(value: unknown): KnownTension[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const entry = item as {
        title?: unknown;
        what_we_see?: unknown;
        what_it_is?: unknown;
        what_it_isnt?: unknown;
        resolution_condition?: unknown;
      };
      const title = typeof entry?.title === "string" ? entry.title.trim() : "";
      if (!title) return null;
      return {
        title,
        what_we_see: typeof entry?.what_we_see === "string" ? entry.what_we_see : "",
        what_it_is: typeof entry?.what_it_is === "string" ? entry.what_it_is : "",
        what_it_isnt: typeof entry?.what_it_isnt === "string" ? entry.what_it_isnt : "",
        resolution_condition:
          typeof entry?.resolution_condition === "string" ? entry.resolution_condition : "",
      };
    })
    .filter((item): item is KnownTension => item !== null);
}

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
        evidence_status?: unknown;
        basis_urls?: unknown;
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
      const evidenceStatus =
        entry?.evidence_status === "corroborated" || entry?.evidence_status === "self_reported"
          ? entry.evidence_status
          : undefined;
      return {
        id: typeof entry?.id === "string" && entry.id.trim() ? entry.id : `item-${index}`,
        name,
        description,
        highlighted: !!entry?.highlighted,
        ...(evidenceStatus ? { evidence_status: evidenceStatus } : {}),
        ...(Array.isArray(entry?.basis_urls)
          ? { basis_urls: entry.basis_urls.map(String).filter(Boolean) }
          : {}),
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
    strategy_alignment: (row.strategy_alignment as "aligned" | "off_strategy" | "unknown" | null) ?? null,
    strategy_alignment_reason: row.strategy_alignment_reason ?? null,
    strategy_alignment_evaluated_at: row.strategy_alignment_evaluated_at ?? null,
    known_tensions: normalizeKnownTensions(row.known_tensions_json),
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

export function usePositioningCanvas(companyId?: string, refreshKey = 0) {
  const [loading, setLoading] = useState(false);
  const [item, setItem] = useState<PositioningCanvas | null>(null);
  const [canvasId, setCanvasId] = useState<string | null>(null);
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
          "id, company_id, competitive_alternatives_json, unique_attributes_json, value_for_customer, best_fit_customers, market_category, category_rationale, current_tagline, proposed_tagline, frameworks_used, created_at, updated_at, strategy_alignment, strategy_alignment_reason, strategy_alignment_evaluated_at, known_tensions_json"
        )
        .eq("company_id", companyId)
        .maybeSingle();

      if (cancelled) return;

      if (error) {
        const msg = error.message.toLowerCase();
        const isTransient =
          msg.includes("could not find the table") ||
          msg.includes("positioning_canvases") ||
          msg.includes("schema cache") ||
          msg.includes("load failed") ||
          msg.includes("networkerror") ||
          msg.includes("failed to fetch");
        if (isTransient) {
          if (msg.includes("load failed") || msg.includes("networkerror") || msg.includes("failed to fetch")) {
            console.warn("[usePositioningCanvas] network error (transient):", error.message, { companyId });
          }
          setItem(null);
          setError(null);
        } else {
          setError(error.message);
          setItem(null);
        }
      } else {
        const row = data as PositioningCanvasRow | null;
        setItem(row ? mapRow(row) : null);
        setCanvasId(row?.id ?? null);
      }

      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, refreshKey]);

  async function updateTextField(
    field: PositioningTextField,
    value: string,
    opts?: { isManualInline?: boolean },
  ) {
    if (!companyId) throw new Error("Select a company first.");

    setSavingField(field);
    try {
      const patch: Record<string, unknown> = { [field]: String(value || "").trim() };
      if (opts?.isManualInline) patch.source = "manual_inline";

      const { data, error } = await supabase
        .from("positioning_canvases")
        .update(patch)
        .eq("company_id", companyId)
        .select(
          "id, company_id, competitive_alternatives_json, unique_attributes_json, value_for_customer, best_fit_customers, market_category, category_rationale, current_tagline, proposed_tagline, frameworks_used, created_at, updated_at, strategy_alignment, strategy_alignment_reason, strategy_alignment_evaluated_at, known_tensions_json"
        )
        .maybeSingle();

      if (error) {
        throw new Error(error.message || "Failed to update positioning text.");
      }

      const row = data as PositioningCanvasRow | null;
      if (row) {
        setItem(mapRow(row));
        setCanvasId(row.id);
        if (opts?.isManualInline) {
          await captureBaseline(companyId, "positioning", row.id);
        }
      } else if (item) {
        setItem({ ...item, [field]: String(value || "").trim() });
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
          "id, company_id, competitive_alternatives_json, unique_attributes_json, value_for_customer, best_fit_customers, market_category, category_rationale, current_tagline, proposed_tagline, frameworks_used, created_at, updated_at, strategy_alignment, strategy_alignment_reason, strategy_alignment_evaluated_at, known_tensions_json"
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
        "id, company_id, competitive_alternatives_json, unique_attributes_json, value_for_customer, best_fit_customers, market_category, category_rationale, current_tagline, proposed_tagline, frameworks_used, created_at, updated_at, strategy_alignment, strategy_alignment_reason, strategy_alignment_evaluated_at, known_tensions_json"
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

  return { loading, item, canvasId, error, savingField, updateTextField, updateItemsField, updateFrameworks };
}
