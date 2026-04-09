import { supabase } from "@/integrations/supabase/client";
import {
  type OnboardingMapConfig,
} from "@/lib/clientOnboardingMojoMapConfig";

type MapApiSuccess = {
  success: true;
  map: OnboardingMapConfig;
};

type MapApiFailure = {
  success: false;
  error: string;
};

type MapApiResponse = MapApiSuccess | MapApiFailure;

type MapsRpcPayload = {
  op: "get" | "put" | "reset";
  mapId: string;
  map?: OnboardingMapConfig;
};

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}

async function extractInvokeErrorMessage(error: unknown, fallback: string) {
  const responseLike = (error as { context?: Response }).context;
  if (!responseLike) return getErrorMessage(error, fallback);

  try {
    const payload = await responseLike.clone().json();
    if (
      payload &&
      typeof payload === "object" &&
      typeof (payload as { error?: unknown }).error === "string"
    ) {
      return String((payload as { error: string }).error);
    }
  } catch {
    // fall through to status fallback
  }

  return `${fallback} (${responseLike.status})`;
}

async function invokeMapsEndpoint(
  payload: MapsRpcPayload,
): Promise<OnboardingMapConfig> {
  const { data, error } = await supabase.functions.invoke<MapApiResponse>("maps", {
    method: "POST",
    body: payload,
  });

  if (error) {
    const message = await extractInvokeErrorMessage(error, "Map API request failed.");
    throw new Error(message);
  }

  if (!data) throw new Error("Map API returned an empty response.");
  if (!data.success) throw new Error(data.error || "Map API request failed.");
  if (!data.map || typeof data.map !== "object") {
    throw new Error("Map API returned invalid map data.");
  }

  return data.map;
}

export async function fetchMojoMapById(mapId: string): Promise<OnboardingMapConfig> {
  return await invokeMapsEndpoint({
    op: "get",
    mapId,
  });
}

export async function saveMojoMapById(
  mapId: string,
  map: OnboardingMapConfig,
): Promise<OnboardingMapConfig> {
  return await invokeMapsEndpoint({
    op: "put",
    mapId,
    map,
  });
}

export async function resetMojoMapById(mapId: string): Promise<OnboardingMapConfig> {
  return await invokeMapsEndpoint({
    op: "reset",
    mapId,
  });
}
