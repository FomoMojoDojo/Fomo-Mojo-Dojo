// Frozen reference fixtures — SELECT-only, never written by conditions generation
// or regeneration. Keep in sync with the edge-function guard
// (supabase/functions/generate-step-conditions/index.ts). Remove when CB1/CB2 retire.
export const FROZEN_COMPANY_IDS = new Set<string>([
  "58b2b15b-bada-4bcd-9c12-b7e66a37d0bc", // Cafe Barra (CB1)
  "fd3f7f63-968b-4698-b946-3d6b6450d79d", // Cafe Barra 2 (CB2)
]);

export const isFrozenCompany = (id?: string | null): boolean => !!id && FROZEN_COMPANY_IDS.has(id);
