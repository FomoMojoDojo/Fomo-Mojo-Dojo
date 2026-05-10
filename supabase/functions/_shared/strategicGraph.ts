import type {
  ArtifactVersionDraft,
  DependencyState,
  DependencyStrength,
  DependencyType,
  ObjectDependencyDraft,
  StrategicActorType,
  StrategicEventDraft,
} from "../../../src/lib/strategicGraphDomain.ts";

type SupabaseClientLike = {
  from: (table: string) => {
    insert: (values: unknown) => Promise<{ data?: unknown; error?: { message?: string } | null }>;
    select: (columns?: string) => {
      eq: (column: string, value: unknown) => any;
      in: (column: string, values: unknown[]) => any;
      order?: (column: string, opts?: { ascending?: boolean }) => any;
      limit?: (value: number) => any;
      maybeSingle?: () => any;
      single?: () => any;
    };
    update: (values: unknown) => {
      eq: (column: string, value: unknown) => any;
      in: (column: string, values: unknown[]) => any;
    };
    delete: () => {
      eq: (column: string, value: unknown) => any;
      in: (column: string, values: unknown[]) => any;
      match?: (values: Record<string, unknown>) => any;
    };
  };
};

type DependencyTarget = {
  upstream_object_type: string;
  upstream_object_id: string;
  downstream_object_type: string;
  downstream_object_id: string;
  dependency_type: DependencyType;
  strength: DependencyStrength;
};

type StatusRow = {
  id: string;
  label: string;
  dependency_state?: string | null;
  stale_reason?: string | null;
  updated_at?: string | null;
};

const OBJECT_TABLES: Record<string, string> = {
  strategic_hypothesis: "strategic_hypotheses",
  job_step: "job_steps",
  odi_need: "odi_needs",
  route: "routes",
  desired_outcome: "managed_outcomes",
};

export function strategicObjectTable(objectType: string) {
  return OBJECT_TABLES[objectType] ?? objectType;
}

export async function recordStrategicEvent(
  supabase: SupabaseClientLike,
  event: StrategicEventDraft,
) {
  const { data, error } = await supabase
    .from("strategic_events")
    .insert(event)
    .select("*")
    .single();
  if (error) throw new Error(error.message || "Failed to record strategic event.");
  return data as Record<string, unknown>;
}

export async function recordBulkArtifactEvents(
  supabase: SupabaseClientLike,
  events: StrategicEventDraft[],
) {
  if (events.length === 0) return [];
  const { data, error } = await supabase
    .from("strategic_events")
    .insert(events)
    .select("*");
  if (error) throw new Error(error.message || "Failed to record strategic events.");
  return (data ?? []) as Record<string, unknown>[];
}

export async function upsertDependenciesForArtifact(
  supabase: SupabaseClientLike,
  companyId: string,
  artifact: { objectType: string; objectIds: string[] },
  dependencies: DependencyTarget[],
  options?: {
    deleteScope?: {
      downstreamUpstreamObjectTypes?: string[];
      upstreamDownstreamObjectTypes?: string[];
    };
  },
) {
  if (artifact.objectIds.length > 0) {
    let downstreamDelete = supabase
      .from("object_dependencies")
      .delete()
      .eq("company_id", companyId)
      .eq("downstream_object_type", artifact.objectType)
      .in("downstream_object_id", artifact.objectIds);
    if ((options?.deleteScope?.downstreamUpstreamObjectTypes?.length ?? 0) > 0) {
      downstreamDelete = downstreamDelete.in("upstream_object_type", options!.deleteScope!.downstreamUpstreamObjectTypes!);
    }
    const { error: deleteDownstreamError } = await downstreamDelete;
    if (deleteDownstreamError) throw new Error(deleteDownstreamError.message || "Failed clearing downstream object dependencies.");

    let upstreamDelete = supabase
      .from("object_dependencies")
      .delete()
      .eq("company_id", companyId)
      .eq("upstream_object_type", artifact.objectType)
      .in("upstream_object_id", artifact.objectIds);
    if ((options?.deleteScope?.upstreamDownstreamObjectTypes?.length ?? 0) > 0) {
      upstreamDelete = upstreamDelete.in("downstream_object_type", options!.deleteScope!.upstreamDownstreamObjectTypes!);
    }
    const { error: deleteUpstreamError } = await upstreamDelete;
    if (deleteUpstreamError) throw new Error(deleteUpstreamError.message || "Failed clearing upstream object dependencies.");
  }

  if (dependencies.length === 0) return [];
  const payload: ObjectDependencyDraft[] = dependencies.map((dependency) => ({
    company_id: companyId,
    upstream_object_type: dependency.upstream_object_type,
    upstream_object_id: dependency.upstream_object_id,
    downstream_object_type: dependency.downstream_object_type,
    downstream_object_id: dependency.downstream_object_id,
    dependency_type: dependency.dependency_type,
    strength: dependency.strength,
  }));

  const { data, error } = await supabase
    .from("object_dependencies")
    .insert(payload)
    .select("*");
  if (error) throw new Error(error.message || "Failed to write object dependencies.");
  return (data ?? []) as Record<string, unknown>[];
}

export async function getDownstreamDependents(
  supabase: SupabaseClientLike,
  companyId: string,
  upstreamObjectType: string,
  upstreamObjectIds: string[],
) {
  if (upstreamObjectIds.length === 0) return [];
  const { data, error } = await supabase
    .from("object_dependencies")
    .select("*")
    .eq("company_id", companyId)
    .eq("upstream_object_type", upstreamObjectType)
    .in("upstream_object_id", upstreamObjectIds);
  if (error) throw new Error(error.message || "Failed to load downstream dependents.");
  return (data ?? []) as Record<string, unknown>[];
}

export async function getUpstreamSupports(
  supabase: SupabaseClientLike,
  companyId: string,
  downstreamObjectType: string,
  downstreamObjectIds: string[],
) {
  if (downstreamObjectIds.length === 0) return [];
  const { data, error } = await supabase
    .from("object_dependencies")
    .select("*")
    .eq("company_id", companyId)
    .eq("downstream_object_type", downstreamObjectType)
    .in("downstream_object_id", downstreamObjectIds);
  if (error) throw new Error(error.message || "Failed to load upstream supports.");
  return (data ?? []) as Record<string, unknown>[];
}

export async function getLatestArtifactVersion(
  supabase: SupabaseClientLike,
  companyId: string,
  objectType: string,
  objectId: string,
) {
  const { data, error } = await supabase
    .from("artifact_versions")
    .select("*")
    .eq("company_id", companyId)
    .eq("object_type", objectType)
    .eq("object_id", objectId)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message || "Failed to load latest artifact version.");
  return (data ?? null) as Record<string, unknown> | null;
}

export async function snapshotArtifactVersion(
  supabase: SupabaseClientLike,
  draft: ArtifactVersionDraft,
) {
  const latest = await getLatestArtifactVersion(supabase, draft.company_id, draft.object_type, draft.object_id);
  const versionNumber = Number(latest?.version_number ?? 0) + 1;
  const payload = {
    ...draft,
    version_number: versionNumber,
  };
  const { data, error } = await supabase
    .from("artifact_versions")
    .insert(payload)
    .select("*")
    .single();
  if (error) throw new Error(error.message || "Failed to snapshot artifact version.");
  return data as Record<string, unknown>;
}

export async function restoreArtifactVersion(
  supabase: SupabaseClientLike,
  args: {
    companyId: string;
    objectType: string;
    versionId?: string;
    objectId?: string;
  },
) {
  const baseQuery = supabase
    .from("artifact_versions")
    .select("*")
    .eq("company_id", args.companyId)
    .eq("object_type", args.objectType);

  const versionRes = args.versionId
    ? await baseQuery.eq("id", args.versionId).single()
    : await baseQuery.eq("object_id", args.objectId).order("version_number", { ascending: false }).limit(1).single();

  const versionError = (versionRes as { error?: { message?: string } | null }).error;
  if (versionError) throw new Error(versionError.message || "Failed to load artifact version for restore.");
  const version = (versionRes as { data?: Record<string, unknown> | null }).data;
  if (!version) throw new Error("Artifact version not found.");

  const table = strategicObjectTable(args.objectType);
  const snapshot = (version.snapshot ?? {}) as Record<string, unknown>;
  const objectId = String(version.object_id || snapshot.id || "");
  if (!objectId) throw new Error("Artifact version is missing object id.");

  const payload = {
    ...snapshot,
    id: objectId,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase.from(table).update(payload).eq("company_id", args.companyId).eq("id", objectId);
  if (error) throw new Error(error.message || "Failed to restore artifact version.");
  return version;
}

async function updateDependentRows(
  supabase: SupabaseClientLike,
  args: {
    companyId: string;
    objectType: "odi_need" | "route" | "desired_outcome";
    objectIds: string[];
    dependencyState: DependencyState;
    staleReason: string;
    staleSinceEventId: string;
    sourceRunId: string | null;
  },
) {
  if (args.objectIds.length === 0) return [] as StatusRow[];
  const table = strategicObjectTable(args.objectType);
  const now = new Date().toISOString();
  const { data: beforeRows, error: beforeError } = await supabase
    .from(table)
    .select("*")
    .eq("company_id", args.companyId)
    .in("id", args.objectIds);
  if (beforeError) throw new Error(beforeError.message || `Failed to load ${args.objectType} rows before stale update.`);

  const patch = {
    dependency_state: args.dependencyState,
    stale_reason: args.staleReason,
    stale_since_event_id: args.staleSinceEventId,
    source_run_id: args.sourceRunId,
    updated_at: now,
  };

  const { error: updateError } = await supabase
    .from(table)
    .update(patch)
    .eq("company_id", args.companyId)
    .in("id", args.objectIds);
  if (updateError) throw new Error(updateError.message || `Failed to mark ${args.objectType} rows for review.`);

  return ((beforeRows ?? []) as Record<string, unknown>[]).map((row) => ({
    id: String(row.id || ""),
    label:
      args.objectType === "odi_need"
        ? String(row.desired_outcome || "")
        : args.objectType === "route"
          ? String(row.title || "")
          : String(row.outcome_title || row.outcome_statement || ""),
    dependency_state: String(patch.dependency_state),
    stale_reason: String(patch.stale_reason),
    updated_at: now,
  }));
}

export async function markDependentsNeedsReview(
  supabase: SupabaseClientLike,
  args: {
    companyId: string;
    dependentIdsByType: Partial<Record<"odi_need" | "route" | "desired_outcome", string[]>>;
    sourceEventId: string;
    sourceRunId: string | null;
    reason: string;
    actorType?: StrategicActorType;
  },
) {
  const actorType = args.actorType ?? "system";
  const affected: Array<{ object_type: "odi_need" | "route" | "desired_outcome"; object_id: string; label: string; dependency_state: DependencyState; stale_reason: string | null; updated_at: string | null; }> = [];
  const events: StrategicEventDraft[] = [];
  const rowsByType = new Map<"odi_need" | "route" | "desired_outcome", StatusRow[]>();

  for (const objectType of ["odi_need", "route", "desired_outcome"] as const) {
    const ids = [...new Set(args.dependentIdsByType[objectType] ?? [])].filter(Boolean);
    if (ids.length === 0) continue;
    const table = strategicObjectTable(objectType);
    const { data: beforeRows, error: beforeError } = await supabase
      .from(table)
      .select("*")
      .eq("company_id", args.companyId)
      .in("id", ids);
    if (beforeError) throw new Error(beforeError.message || `Failed to load ${objectType} rows before stale update.`);
    const rows = ((beforeRows ?? []) as Record<string, unknown>[]).map((row) => ({
      id: String(row.id || ""),
      label:
        objectType === "odi_need"
          ? String(row.desired_outcome || "")
          : objectType === "route"
            ? String(row.title || "")
            : String(row.outcome_title || row.outcome_statement || ""),
      dependency_state: "needs_review",
      stale_reason: args.reason,
      updated_at: null,
    }));
    rowsByType.set(objectType, rows);
    rows.forEach((row) => {
      events.push({
        company_id: args.companyId,
        event_type: "marked_stale",
        actor_type: actorType,
        actor_id: null,
        source_run_id: args.sourceRunId,
        object_type: objectType,
        object_id: row.id,
        previous_value: null,
        new_value: {
          dependency_state: "needs_review",
          stale_reason: args.reason,
          stale_since_event_id: args.sourceEventId,
        },
        reason: args.reason,
      });
    });
  }

  await recordBulkArtifactEvents(supabase, events);
  for (const objectType of ["odi_need", "route", "desired_outcome"] as const) {
    const ids = [...new Set(args.dependentIdsByType[objectType] ?? [])].filter(Boolean);
    const rows = rowsByType.get(objectType) ?? [];
    if (ids.length === 0 || rows.length === 0) continue;
    const updatedRows = await updateDependentRows(supabase, {
      companyId: args.companyId,
      objectType,
      objectIds: ids,
      dependencyState: "needs_review",
      staleReason: args.reason,
      staleSinceEventId: args.sourceEventId,
      sourceRunId: args.sourceRunId,
    });
    updatedRows.forEach((row) => {
      affected.push({
        object_type: objectType,
        object_id: row.id,
        label: row.label,
        dependency_state: "needs_review",
        stale_reason: row.stale_reason ?? null,
        updated_at: row.updated_at ?? null,
      });
    });
  }
  return affected;
}

export async function markDependentsContradicted(
  supabase: SupabaseClientLike,
  args: {
    companyId: string;
    dependentIdsByType: Partial<Record<"odi_need" | "route" | "desired_outcome", string[]>>;
    sourceEventId: string;
    sourceRunId: string | null;
    reason: string;
  },
) {
  const events: StrategicEventDraft[] = [];
  for (const objectType of ["odi_need", "route", "desired_outcome"] as const) {
    const ids = [...new Set(args.dependentIdsByType[objectType] ?? [])].filter(Boolean);
    const rows = await updateDependentRows(supabase, {
      companyId: args.companyId,
      objectType,
      objectIds: ids,
      dependencyState: "contradicted",
      staleReason: args.reason,
      staleSinceEventId: args.sourceEventId,
      sourceRunId: args.sourceRunId,
    });
    rows.forEach((row) => {
      events.push({
        company_id: args.companyId,
        event_type: "contradicted",
        actor_type: "system",
        actor_id: null,
        source_run_id: args.sourceRunId,
        object_type: objectType,
        object_id: row.id,
        previous_value: null,
        new_value: {
          dependency_state: "contradicted",
          stale_reason: args.reason,
          stale_since_event_id: args.sourceEventId,
        },
        reason: args.reason,
      });
    });
  }
  await recordBulkArtifactEvents(supabase, events);
  return events.length;
}

export async function clearStalenessIfResolved(
  supabase: SupabaseClientLike,
  args: {
    companyId: string;
    objectType: "job_step" | "odi_need" | "route" | "desired_outcome";
    objectIds: string[];
    staleReason?: string;
  },
) {
  if (args.objectIds.length === 0) return 0;
  const table = strategicObjectTable(args.objectType);
  let query = supabase
    .from(table)
    .update({
      dependency_state: "fresh",
      stale_reason: null,
      stale_since_event_id: null,
      last_reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("company_id", args.companyId)
    .in("id", args.objectIds);
  if (args.staleReason) {
    query = query.eq("stale_reason", args.staleReason);
  }
  const { error } = await query;
  if (error) throw new Error(error.message || `Failed to clear staleness for ${args.objectType}.`);
  return args.objectIds.length;
}
