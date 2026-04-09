import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  CLIENT_ONBOARDING_MOJOMAP_ID,
  getClientOnboardingMojoMapSeed,
  toCanonicalOnboardingMojoMap,
  type OnboardingMapConfig,
} from "../../../src/lib/clientOnboardingMojoMapConfig.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET,PUT,POST,OPTIONS",
};

type MojoMapRow = {
  id: string;
  map_json: Partial<OnboardingMapConfig> | null;
  seed_json: Partial<OnboardingMapConfig> | null;
};

type RouteAction = "map" | "reset";
type EffectiveMethod = "GET" | "PUT" | "POST";

const LEGACY_OWNERSHIP_KEYS = new Set([
  "owner",
  "ownerName",
  "approver",
  "reviewer",
  "assignee",
  "stakeholders",
  "contributors",
]);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function hasLegacyOwnershipFields(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some((item) => hasLegacyOwnershipFields(item));
  }
  const record = asRecord(value);
  if (!record) return false;
  for (const [key, nestedValue] of Object.entries(record)) {
    if (LEGACY_OWNERSHIP_KEYS.has(key)) return true;
    if (hasLegacyOwnershipFields(nestedValue)) return true;
  }
  return false;
}

function parseRoute(req: Request) {
  const url = new URL(req.url);
  const path = (url.pathname || "").replace(/\/+$/, "");
  const marker = "/functions/v1/maps";
  const markerIndex = path.toLowerCase().indexOf(marker);
  const fallbackIndex = path.toLowerCase().indexOf("/maps");
  const suffix =
    markerIndex >= 0
      ? path.slice(markerIndex + marker.length)
      : fallbackIndex >= 0
        ? path.slice(fallbackIndex + "/maps".length)
        : "";

  const segments = suffix
    .split("/")
    .filter(Boolean)
    .map((segment) => decodeURIComponent(segment));

  if (segments.length === 1) {
    return { mapId: segments[0], action: "map" as const };
  }
  if (segments.length === 2 && segments[1].toLowerCase() === "reset") {
    return { mapId: segments[0], action: "reset" as const };
  }

  return null;
}

function parseRpcRouteFromBody(
  body: Record<string, unknown> | null,
): { mapId: string; action: RouteAction; method: EffectiveMethod } | null {
  if (!body) return null;
  const op = typeof body.op === "string" ? body.op.trim().toLowerCase() : "";
  const mapId = typeof body.mapId === "string" ? body.mapId.trim() : "";
  if (!mapId) return null;

  if (op === "get") {
    return { mapId, action: "map", method: "GET" };
  }
  if (op === "put") {
    return { mapId, action: "map", method: "PUT" };
  }
  if (op === "reset") {
    return { mapId, action: "reset", method: "POST" };
  }
  return null;
}

function getSeedForMapId(mapId: string): OnboardingMapConfig | null {
  if (mapId === CLIENT_ONBOARDING_MOJOMAP_ID) {
    return getClientOnboardingMojoMapSeed();
  }
  return null;
}

function normalizeMap(map: Partial<OnboardingMapConfig>): OnboardingMapConfig {
  return toCanonicalOnboardingMojoMap(map);
}

function toText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function toStringArray(value: unknown): string[] | null {
  if (value === undefined || value === null) return null;
  if (Array.isArray(value)) {
    if (value.some((item) => typeof item !== "string")) return null;
    return value
      .map((item) => toText(item))
      .filter((item): item is string => !!item);
  }
  return null;
}

function validateOwnershipRecord(args: {
  ownership: unknown;
  label: string;
  requirePrimaryOwner: boolean;
}): string[] {
  const errors: string[] = [];
  const record = asRecord(args.ownership);
  if (!record) {
    if (args.requirePrimaryOwner) {
      errors.push(`${args.label} ownership.primaryOwner is required.`);
    }
    return errors;
  }

  const primaryOwner = toText(record.primaryOwner);
  if (args.requirePrimaryOwner && !primaryOwner) {
    errors.push(`${args.label} ownership.primaryOwner is required.`);
  }

  if (record.decider !== undefined && toText(record.decider) === null) {
    errors.push(`${args.label} ownership.decider must be a non-empty string when provided.`);
  }

  if (record.contributors !== undefined) {
    const contributors = toStringArray(record.contributors);
    if (!contributors) {
      errors.push(`${args.label} ownership.contributors must be an array of strings when provided.`);
    }
  }

  return errors;
}

function validateMapPayload(map: OnboardingMapConfig) {
  const errors: string[] = [];

  if (!String(map.id || "").trim()) errors.push("id is required.");
  if (!String(map.name || "").trim()) errors.push("name is required.");
  errors.push(
    ...validateOwnershipRecord({
      ownership: map.ownership,
      label: "map",
      requirePrimaryOwner: true,
    }),
  );
  if (!String(map.outcome?.title || "").trim()) errors.push("outcome.title is required.");
  if (!String(map.constraint?.title || "").trim()) errors.push("primary constraint title is required.");
  if (!Array.isArray(map.layers) || map.layers.length < 1) errors.push("at least one layer is required.");

  if (map.health?.overallScore !== undefined && !Number.isFinite(Number(map.health.overallScore))) {
    errors.push("overallScore must be numeric.");
  }

  const subscores = Array.isArray(map.health?.subscores) ? map.health.subscores : [];
  for (const subscore of subscores) {
    if (!Number.isFinite(Number(subscore.value))) {
      errors.push(`subscore value for "${String(subscore.label || "unknown")}" must be numeric.`);
    }
  }

  const actionGroups = Array.isArray(map.actionGroups) ? map.actionGroups : [];
  for (const group of actionGroups) {
    const items = Array.isArray(group.items) ? group.items : [];
    for (const item of items) {
      const label = `action "${String(item.title || item.id || "unknown")}"`;
      errors.push(
        ...validateOwnershipRecord({
          ownership: (item as { ownership?: unknown }).ownership,
          label,
          requirePrimaryOwner: true,
        }),
      );
    }
  }

  const layers = Array.isArray(map.layers) ? map.layers : [];
  for (const layer of layers) {
    if ((layer as { ownership?: unknown }).ownership !== undefined) {
      const layerLabel = `layer "${String(layer.title || layer.id || "unknown")}"`;
      errors.push(
        ...validateOwnershipRecord({
          ownership: (layer as { ownership?: unknown }).ownership,
          label: layerLabel,
          requirePrimaryOwner: false,
        }),
      );
    }
  }

  return errors;
}

async function extractUserAndRole(args: {
  req: Request;
  supabaseUrl: string;
  anonKey: string;
  serviceRoleClient: ReturnType<typeof createClient>;
}) {
  const authHeader = args.req.headers.get("Authorization");
  if (!authHeader) return { error: "No auth header", status: 401 as const };

  const anonClient = createClient(args.supabaseUrl, args.anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: userRes, error: authError } = await anonClient.auth.getUser();
  if (authError || !userRes?.user) {
    return { error: "Unauthorized", status: 401 as const };
  }

  const { data: roleRow, error: roleError } = await args.serviceRoleClient
    .from("user_roles")
    .select("role")
    .eq("user_id", userRes.user.id)
    .eq("role", "admin")
    .maybeSingle();

  if (roleError) {
    return { error: "Failed to verify admin role.", status: 500 as const };
  }
  if (!roleRow) {
    return { error: "Forbidden", status: 403 as const };
  }

  return { userId: userRes.user.id };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const parsedBody = req.method === "GET" ? null : await req.json().catch(() => null);
  const parsedBodyRecord = asRecord(parsedBody);

  const pathRoute = parseRoute(req);
  const rpcRoute = !pathRoute ? parseRpcRouteFromBody(parsedBodyRecord) : null;
  const route = pathRoute ?? rpcRoute;
  const effectiveMethod = (rpcRoute?.method ?? req.method) as EffectiveMethod;

  if (!route) {
    return json(
      {
        success: false,
        error:
          "Expected /maps/:id or /maps/:id/reset, or POST body { op: get|put|reset, mapId }.",
      },
      404,
    );
  }

  if (effectiveMethod === "GET" && route.action !== "map") {
    return json({ success: false, error: "GET is only supported on /maps/:id." }, 400);
  }
  if (effectiveMethod === "PUT" && route.action !== "map") {
    return json({ success: false, error: "PUT is only supported on /maps/:id." }, 400);
  }
  if (effectiveMethod === "POST" && route.action !== "reset") {
    return json({ success: false, error: "POST is only supported on /maps/:id/reset." }, 400);
  }
  if (!["GET", "PUT", "POST"].includes(effectiveMethod)) {
    return json({ success: false, error: "Method not supported." }, 400);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
      return json({ success: false, error: "Missing Supabase env vars." }, 500);
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const auth = await extractUserAndRole({
      req,
      supabaseUrl,
      anonKey,
      serviceRoleClient: supabase,
    });
    if ("error" in auth) {
      return json({ success: false, error: auth.error }, auth.status);
    }

    const mapId = String(route.mapId || "").trim();
    if (!mapId) return json({ success: false, error: "Map id is required." }, 400);

    const { data: rowData, error: rowError } = await supabase
      .from("mojo_maps")
      .select("id, map_json, seed_json")
      .eq("id", mapId)
      .maybeSingle();

    if (rowError) {
      return json({ success: false, error: rowError.message || "Failed to load map." }, 500);
    }

    const existingRow = (rowData as MojoMapRow | null) ?? null;
    const canonicalSeed = getSeedForMapId(mapId);

    if (effectiveMethod === "GET") {
      if (existingRow?.map_json) {
        const map = normalizeMap(existingRow.map_json);

        // Compatibility bridge: rewrite legacy owner fields into canonical ownership shape.
        if (hasLegacyOwnershipFields(existingRow.map_json)) {
          const { error: rewriteError } = await supabase
            .from("mojo_maps")
            .upsert(
              {
                id: mapId,
                map_json: map,
                seed_json: existingRow.seed_json
                  ? normalizeMap(existingRow.seed_json)
                  : canonicalSeed
                    ? normalizeMap(canonicalSeed)
                    : null,
                updated_by: auth.userId,
              },
              { onConflict: "id" },
            );
          if (rewriteError) {
            console.log("[maps] non-fatal canonical rewrite error:", rewriteError.message);
          }
        }

        return json({ success: true, map });
      }

      if (!canonicalSeed) {
        return json({ success: false, error: "Map not found." }, 404);
      }

      const seeded = normalizeMap({
        ...canonicalSeed,
        id: mapId,
      });
      const canonicalSeedForStorage = normalizeMap(canonicalSeed);
      const now = new Date().toISOString();

      const { error: upsertError } = await supabase
        .from("mojo_maps")
        .upsert(
          {
            id: mapId,
            map_json: {
              ...seeded,
              updatedAt: now,
            },
            seed_json: canonicalSeedForStorage,
            updated_by: auth.userId,
          },
          { onConflict: "id" },
        );

      if (upsertError) {
        console.log("[maps] non-fatal seed upsert error:", upsertError.message);
      }

      return json({
        success: true,
        map: normalizeMap({
          ...seeded,
          updatedAt: now,
        }),
      });
    }

    if (effectiveMethod === "PUT") {
      const candidatePayload = parsedBodyRecord?.map ?? parsedBodyRecord;
      const candidate = asRecord(candidatePayload) as Partial<OnboardingMapConfig> | null;
      if (!candidate || typeof candidate !== "object") {
        return json({ success: false, error: "Map payload is required." }, 400);
      }

      if (candidate.id && String(candidate.id) !== mapId) {
        return json({ success: false, error: "Map id in payload must match route id." }, 400);
      }

      const baseMap =
        (existingRow?.map_json
          ? normalizeMap(existingRow.map_json)
          : canonicalSeed) ?? null;

      if (!baseMap) {
        return json({ success: false, error: "Map not found." }, 404);
      }

      const now = new Date().toISOString();
      const merged = normalizeMap({
        ...baseMap,
        ...candidate,
        id: mapId,
        createdAt: String((candidate as { createdAt?: unknown }).createdAt || baseMap.createdAt || now),
        updatedAt: now,
      });

      const validationErrors = validateMapPayload(merged);
      if (validationErrors.length) {
        return json({ success: false, error: validationErrors.join(" ") }, 400);
      }

      const seedToStore = existingRow?.seed_json
        ? normalizeMap(existingRow.seed_json)
        : canonicalSeed
          ? normalizeMap(canonicalSeed)
          : baseMap;

      const { error: saveError } = await supabase
        .from("mojo_maps")
        .upsert(
          {
            id: mapId,
            map_json: merged,
            seed_json: seedToStore,
            updated_by: auth.userId,
          },
          { onConflict: "id" },
        );

      if (saveError) {
        return json({ success: false, error: saveError.message || "Failed to save map." }, 500);
      }

      return json({ success: true, map: merged });
    }

    const seedForReset = existingRow?.seed_json
      ? normalizeMap(existingRow.seed_json)
      : canonicalSeed
        ? normalizeMap(canonicalSeed)
        : null;

    if (!seedForReset) {
      return json({ success: false, error: "Map not found." }, 404);
    }

    const now = new Date().toISOString();
    const resetMap = normalizeMap({
      ...seedForReset,
      id: mapId,
      updatedAt: now,
    });

    const { error: resetError } = await supabase
      .from("mojo_maps")
      .upsert(
        {
          id: mapId,
          map_json: resetMap,
          seed_json: seedForReset,
          updated_by: auth.userId,
        },
        { onConflict: "id" },
      );

    if (resetError) {
      return json({ success: false, error: resetError.message || "Failed to reset map." }, 500);
    }

    return json({ success: true, map: resetMap });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected map API error.";
    return json({ success: false, error: message }, 500);
  }
});
