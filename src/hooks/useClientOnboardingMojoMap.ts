import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchMojoMapById,
  resetMojoMapById,
  saveMojoMapById,
} from "@/lib/clientOnboardingMojoMapApi";
import {
  CLIENT_ONBOARDING_MOJOMAP_ID,
  getClientOnboardingMojoMapSeed,
  type OnboardingMapConfig,
} from "@/lib/clientOnboardingMojoMapConfig";

function mapQueryKey(mapId: string) {
  return ["mojo-map", mapId] as const;
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}

type UseClientOnboardingMojoMapOptions = {
  mapId?: string;
  enabled?: boolean;
};

export function useClientOnboardingMojoMap(options: UseClientOnboardingMojoMapOptions = {}) {
  const mapId = options.mapId ?? CLIENT_ONBOARDING_MOJOMAP_ID;
  const enabled = options.enabled ?? true;
  const queryClient = useQueryClient();
  const seedFallback = getClientOnboardingMojoMapSeed();

  const query = useQuery({
    queryKey: mapQueryKey(mapId),
    queryFn: async () => await fetchMojoMapById(mapId),
    enabled,
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: 30_000,
  });

  const saveMutation = useMutation({
    mutationFn: async (map: OnboardingMapConfig) => await saveMojoMapById(mapId, map),
    onSuccess: (savedMap) => {
      queryClient.setQueryData(mapQueryKey(mapId), savedMap);
    },
  });

  const resetMutation = useMutation({
    mutationFn: async () => await resetMojoMapById(mapId),
    onSuccess: (resetMap) => {
      queryClient.setQueryData(mapQueryKey(mapId), resetMap);
    },
  });

  async function refetchMap() {
    const result = await query.refetch();
    return result.data ?? seedFallback;
  }

  return {
    mapId,
    map: query.data ?? seedFallback,
    loading: enabled ? query.isLoading : false,
    fetching: enabled ? query.isFetching : false,
    usingSeedFallback: !!query.error,
    error: query.error ? getErrorMessage(query.error, "Unable to load map data.") : null,
    saveMap: saveMutation.mutateAsync,
    resetMap: resetMutation.mutateAsync,
    refetchMap,
    isSaving: saveMutation.isPending,
    isResetting: resetMutation.isPending,
  };
}
