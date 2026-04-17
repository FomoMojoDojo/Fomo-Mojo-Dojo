import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ensureRequiredFrameworkKeys } from "@/lib/opportunityTreeSemantics";
import {
  composeDesiredOutcomeFromParts,
  deriveDesiredOutcomeParts,
  humanizeOutcomeLanguage,
  normalizeDesiredOutcomeDirection,
  normalizeOutcomeLevel,
  validateDesiredOutcomeParts,
  type OutcomeLevel,
} from "@/lib/desiredOutcome";

export type ManagedOutcome = {
  id: string;
  journey_key: string;
  outcome_title: string;
  outcome_statement: string;
  leading_indicator: string;
  target_direction: string;
  direction: string;
  metric: string;
  actor: string;
  action: string;
  object: string;
  context: string;
  constraint: string | null;
  is_primary: boolean;
  level: OutcomeLevel | null;
  stage: string | null;
  evidence_level: string | null;
  why_this_level: string | null;
  why_behavioral: string | null;
  leading_indicators: string[];
  lagging_indicators: string[];
  related_opportunity_areas: string[];
  evidence_basis: string;
  confidence: number;
  frameworks_used: string[];
  created_at: string;
  updated_at: string;
};

type ManagedOutcomeRow = {
  id: string;
  company_id: string;
  user_id: string;
  journey_key: string;
  outcome_title: string;
  outcome_statement: string;
  leading_indicator: string;
  target_direction: string;
  direction?: string | null;
  metric?: string | null;
  actor?: string | null;
  action?: string | null;
  object?: string | null;
  context?: string | null;
  constraint?: string | null;
  is_primary?: boolean | null;
  level?: string | null;
  stage?: string | null;
  evidence_level?: string | null;
  why_this_level?: string | null;
  why_behavioral?: string | null;
  leading_indicators?: string[] | null;
  lagging_indicators?: string[] | null;
  related_opportunity_areas?: string[] | null;
  evidence_basis: string;
  confidence: number;
  frameworks_used: string[];
  created_at: string;
  updated_at: string;
};

type ManagedOutcomeInput = {
  journey_key: string;
  outcome_title?: string;
  outcome_statement?: string;
  leading_indicator?: string;
  target_direction?: string;
  direction?: string;
  metric?: string;
  actor?: string;
  action?: string;
  object?: string;
  context?: string;
  constraint?: string | null;
  is_primary?: boolean;
  level?: OutcomeLevel | null;
  evidence_basis: string;
  confidence: number;
  frameworks_used?: string[];
};

function isMissingManagedOutcomeColumnError(message: string) {
  const lower = String(message || "").toLowerCase();
  const newColumns = "direction|metric|actor|action|object|context|constraint|is_primary|level|stage|evidence_level|why_this_level|why_behavioral|leading_indicators|lagging_indicators|related_opportunity_areas";
  return new RegExp(`column\\s+.*(${newColumns}).*does not exist`, "i").test(lower)
    || (lower.includes("does not exist") && new RegExp(newColumns).test(lower));
}

function normalizeManagedOutcomeRow(row: ManagedOutcomeRow): ManagedOutcome {
  const derived = deriveDesiredOutcomeParts({
    journey_key: row.journey_key,
    outcome_statement: row.outcome_statement,
    leading_indicator: row.leading_indicator,
    target_direction: row.target_direction,
    direction: row.direction,
    metric: row.metric,
    actor: row.actor,
    action: row.action,
    object: row.object,
    context: row.context,
    constraint: row.constraint,
    is_primary: row.is_primary,
    level: row.level,
  });
  const composed = composeDesiredOutcomeFromParts(derived);

  return {
    id: row.id,
    journey_key: row.journey_key,
    outcome_title: humanizeOutcomeLanguage(composed.outcome_statement || row.outcome_title),
    outcome_statement: humanizeOutcomeLanguage(composed.outcome_statement),
    leading_indicator: humanizeOutcomeLanguage(composed.leading_indicator),
    target_direction: normalizeDesiredOutcomeDirection(composed.target_direction || row.target_direction),
    direction: normalizeDesiredOutcomeDirection(row.direction || composed.direction),
    metric: humanizeOutcomeLanguage(row.metric || composed.metric),
    actor: humanizeOutcomeLanguage(row.actor || composed.actor),
    action: humanizeOutcomeLanguage(row.action || composed.action),
    object: humanizeOutcomeLanguage(row.object || composed.object),
    context: humanizeOutcomeLanguage(row.context || composed.context),
    constraint: row.constraint ? humanizeOutcomeLanguage(row.constraint) : null,
    is_primary: row.is_primary === true,
    level: normalizeOutcomeLevel(row.level),
    stage: row.stage ?? null,
    evidence_level: row.evidence_level ?? null,
    why_this_level: row.why_this_level ?? null,
    why_behavioral: row.why_behavioral ?? null,
    leading_indicators: Array.isArray(row.leading_indicators) ? row.leading_indicators : [],
    lagging_indicators: Array.isArray(row.lagging_indicators) ? row.lagging_indicators : [],
    related_opportunity_areas: Array.isArray(row.related_opportunity_areas)
      ? row.related_opportunity_areas
      : [],
    evidence_basis: String(row.evidence_basis || "").trim(),
    confidence: Number.isFinite(Number(row.confidence)) ? Number(row.confidence) : 55,
    frameworks_used: ensureRequiredFrameworkKeys(row.frameworks_used || []),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function sortManagedOutcomes(items: ManagedOutcome[]) {
  return [...items].sort((a, b) => {
    if (a.journey_key !== b.journey_key) return a.journey_key.localeCompare(b.journey_key);
    if (a.is_primary !== b.is_primary) return a.is_primary ? -1 : 1;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}

function normalizeInputToOutcome(input: ManagedOutcomeInput) {
  const base = deriveDesiredOutcomeParts({
    journey_key: input.journey_key,
    outcome_statement: input.outcome_statement,
    leading_indicator: input.leading_indicator,
    target_direction: input.target_direction,
    direction: input.direction,
    metric: input.metric,
    actor: input.actor,
    action: input.action,
    object: input.object,
    context: input.context,
    constraint: input.constraint,
    is_primary: input.is_primary,
    level: input.level,
  });
  const validation = validateDesiredOutcomeParts(base);
  if (!validation.valid) {
    throw new Error(
      `Desired outcome needs clear direction, metric, object, and context. (${validation.reasons.join(", ")})`,
    );
  }

  const composed = validation.normalized;
  const sentence = composed.outcome_statement;

  return {
    journey_key: String(input.journey_key || "").trim() || "customer",
    outcome_title: humanizeOutcomeLanguage(input.outcome_title || sentence),
    outcome_statement: sentence,
    leading_indicator: composed.leading_indicator,
    target_direction: composed.target_direction,
    direction: composed.direction,
    metric: composed.metric,
    actor: composed.actor,
    action: composed.action,
    object: composed.object,
    context: composed.context,
    constraint: composed.constraint || null,
    is_primary: composed.is_primary === true,
    level: composed.level ?? null,
    evidence_basis: String(input.evidence_basis || "").trim() || "Team-authored desired outcome.",
    confidence: Number.isFinite(Number(input.confidence)) ? Number(input.confidence) : 55,
    frameworks_used: ensureRequiredFrameworkKeys(
      Array.isArray(input.frameworks_used) && input.frameworks_used.length > 0
        ? input.frameworks_used
        : ["odi", "teresa_torres"],
    ),
  };
}

function selectColumns(includeStructured: boolean, includePrimary: boolean) {
  return [
    "id",
    "company_id",
    "user_id",
    "journey_key",
    "outcome_title",
    "outcome_statement",
    "leading_indicator",
    "target_direction",
    includeStructured ? "direction" : null,
    includeStructured ? "metric" : null,
    includeStructured ? "actor" : null,
    includeStructured ? "action" : null,
    includeStructured ? "object" : null,
    includeStructured ? "context" : null,
    includeStructured ? "constraint" : null,
    includeStructured ? "level" : null,
    includeStructured ? "stage" : null,
    includeStructured ? "evidence_level" : null,
    includeStructured ? "why_this_level" : null,
    includeStructured ? "why_behavioral" : null,
    includeStructured ? "leading_indicators" : null,
    includeStructured ? "lagging_indicators" : null,
    includeStructured ? "related_opportunity_areas" : null,
    includePrimary ? "is_primary" : null,
    "evidence_basis",
    "confidence",
    "frameworks_used",
    "created_at",
    "updated_at",
  ]
    .filter(Boolean)
    .join(", ");
}

export function useManagedOutcomes(companyId?: string) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [items, setItems] = useState<ManagedOutcome[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [structuredColumnsAvailable, setStructuredColumnsAvailable] = useState(true);
  const [primaryColumnAvailable, setPrimaryColumnAvailable] = useState(true);

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
      setStructuredColumnsAvailable(true);
      setPrimaryColumnAvailable(true);

      const runSelect = async (includeStructured: boolean, includePrimary: boolean) =>
        supabase
          .from("managed_outcomes")
          .select(selectColumns(includeStructured, includePrimary))
          .eq("company_id", companyId)
          .order("journey_key", { ascending: true });

      let result = await runSelect(true, true);

      if (cancelled) return;

      if (result.error && isMissingManagedOutcomeColumnError(result.error.message || "")) {
        setStructuredColumnsAvailable(false);
        setPrimaryColumnAvailable(false);
        result = await runSelect(false, false);
      }

      if (cancelled) return;

      if (result.error) {
        const msg = String(result.error.message || "").toLowerCase();
        if (msg.includes("could not find the table") || msg.includes("managed_outcomes") || msg.includes("schema cache")) {
          setItems([]);
          setError(null);
        } else {
          setItems([]);
          setError(result.error.message);
        }
      } else {
        const rows = ((result.data as ManagedOutcomeRow[] | null) ?? []).map((row) => ({
          ...row,
          direction: row.direction ?? null,
          metric: row.metric ?? null,
          actor: row.actor ?? null,
          action: row.action ?? null,
          object: row.object ?? null,
          context: row.context ?? null,
          constraint: row.constraint ?? null,
          is_primary: row.is_primary ?? false,
          level: row.level ?? null,
          stage: row.stage ?? null,
          evidence_level: row.evidence_level ?? null,
          why_this_level: row.why_this_level ?? null,
          why_behavioral: row.why_behavioral ?? null,
          leading_indicators: row.leading_indicators ?? [],
          lagging_indicators: row.lagging_indicators ?? [],
          related_opportunity_areas: row.related_opportunity_areas ?? [],
        }));
        setItems(sortManagedOutcomes(rows.map(normalizeManagedOutcomeRow)));
      }

      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [companyId]);

  const hasPrimary = useMemo(() => items.some((item) => item.is_primary), [items]);

  async function createManagedOutcome(input: ManagedOutcomeInput) {
    if (!companyId) throw new Error("No company selected.");
    setSaving(true);
    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw new Error(authError.message || "Failed to resolve current user.");
      const userId = authData.user?.id;
      if (!userId) throw new Error("You must be signed in to add desired outcomes.");

      const normalized = normalizeInputToOutcome(input);
      const isPrimary = input.is_primary ?? !hasPrimary;

      if (isPrimary && primaryColumnAvailable) {
        await supabase
          .from("managed_outcomes")
          .update({ is_primary: false })
          .eq("company_id", companyId);
      }

      const payload = {
        company_id: companyId,
        user_id: userId,
        ...normalized,
        is_primary: primaryColumnAvailable ? isPrimary : undefined,
      };

      let insert = await supabase
        .from("managed_outcomes")
        .insert(payload)
        .select(selectColumns(structuredColumnsAvailable, primaryColumnAvailable))
        .single();

      if (insert.error && isMissingManagedOutcomeColumnError(insert.error.message || "")) {
        setStructuredColumnsAvailable(false);
        setPrimaryColumnAvailable(false);
        const fallbackPayload = {
          company_id: companyId,
          user_id: userId,
          journey_key: normalized.journey_key,
          outcome_title: normalized.outcome_title,
          outcome_statement: normalized.outcome_statement,
          leading_indicator: normalized.leading_indicator,
          target_direction: normalized.target_direction,
          evidence_basis: normalized.evidence_basis,
          confidence: normalized.confidence,
          frameworks_used: normalized.frameworks_used,
        };
        insert = await supabase
          .from("managed_outcomes")
          .insert(fallbackPayload)
          .select(selectColumns(false, false))
          .single();
      }

      if (insert.error) throw new Error(insert.error.message || "Failed to add desired outcome.");
      const normalizedRow = normalizeManagedOutcomeRow(insert.data as ManagedOutcomeRow);
      setItems((current) => {
        const next = isPrimary
          ? current.map((item) => ({ ...item, is_primary: item.id === normalizedRow.id ? true : false }))
          : current;
        return sortManagedOutcomes([...next.filter((item) => item.id !== normalizedRow.id), normalizedRow]);
      });
      return normalizedRow;
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
      const current = items.find((item) => item.id === outcomeId);
      if (!current) throw new Error("Desired outcome not found.");

      const normalized = normalizeInputToOutcome({
        journey_key: input.journey_key ?? current.journey_key,
        outcome_title: input.outcome_title ?? current.outcome_title,
        outcome_statement: input.outcome_statement ?? current.outcome_statement,
        leading_indicator: input.leading_indicator ?? current.leading_indicator,
        target_direction: input.target_direction ?? current.target_direction,
        direction: input.direction ?? current.direction,
        metric: input.metric ?? current.metric,
        actor: input.actor ?? current.actor,
        action: input.action ?? current.action,
        object: input.object ?? current.object,
        context: input.context ?? current.context,
        constraint: input.constraint ?? current.constraint,
        is_primary: input.is_primary ?? current.is_primary,
        level: input.level ?? current.level,
        evidence_basis: input.evidence_basis ?? current.evidence_basis,
        confidence: input.confidence ?? current.confidence,
        frameworks_used: input.frameworks_used ?? current.frameworks_used,
      });

      const nextPrimary = input.is_primary ?? current.is_primary;
      if (nextPrimary && primaryColumnAvailable) {
        await supabase
          .from("managed_outcomes")
          .update({ is_primary: false })
          .eq("company_id", companyId)
          .neq("id", outcomeId);
      }

      let patch: Record<string, unknown> = {
        journey_key: normalized.journey_key,
        outcome_title: normalized.outcome_title,
        outcome_statement: normalized.outcome_statement,
        leading_indicator: normalized.leading_indicator,
        target_direction: normalized.target_direction,
        direction: normalized.direction,
        metric: normalized.metric,
        actor: normalized.actor,
        action: normalized.action,
        object: normalized.object,
        context: normalized.context,
        constraint: normalized.constraint,
        level: normalized.level ?? null,
        evidence_basis: normalized.evidence_basis,
        confidence: normalized.confidence,
        frameworks_used: ensureRequiredFrameworkKeys(normalized.frameworks_used),
      };

      if (primaryColumnAvailable && input.is_primary !== undefined) {
        patch.is_primary = Boolean(input.is_primary);
      }

      let update = await supabase
        .from("managed_outcomes")
        .update(patch)
        .eq("company_id", companyId)
        .eq("id", outcomeId)
        .select(selectColumns(structuredColumnsAvailable, primaryColumnAvailable))
        .single();

      if (update.error && isMissingManagedOutcomeColumnError(update.error.message || "")) {
        setStructuredColumnsAvailable(false);
        setPrimaryColumnAvailable(false);
        patch = {
          journey_key: normalized.journey_key,
          outcome_title: normalized.outcome_title,
          outcome_statement: normalized.outcome_statement,
          leading_indicator: normalized.leading_indicator,
          target_direction: normalized.target_direction,
          evidence_basis: normalized.evidence_basis,
          confidence: normalized.confidence,
          frameworks_used: ensureRequiredFrameworkKeys(normalized.frameworks_used),
        };
        update = await supabase
          .from("managed_outcomes")
          .update(patch)
          .eq("company_id", companyId)
          .eq("id", outcomeId)
          .select(selectColumns(false, false))
          .single();
      }

      if (update.error) throw new Error(update.error.message || "Failed to update desired outcome.");
      const normalizedRow = normalizeManagedOutcomeRow(update.data as ManagedOutcomeRow);
      setItems((currentItems) =>
        sortManagedOutcomes(
          currentItems.map((item) => {
            if (item.id === normalizedRow.id) return normalizedRow;
            if (nextPrimary) return { ...item, is_primary: false };
            return item;
          }),
        ),
      );
      return normalizedRow;
    } finally {
      setSaving(false);
    }
  }

  return { loading, saving, items, error, createManagedOutcome, updateManagedOutcome };
}
