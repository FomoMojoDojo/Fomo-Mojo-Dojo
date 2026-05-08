import { safeLocalStorageGet, safeLocalStorageSet, safeLocalStorageRemove } from "./safeLocalStorage";

export type ActivePath = {
  routeId: string;
  stepId: string | null;
  startedAt: string;
};

function storageKey(companyId: string) {
  return `crpv:active-path:${companyId}`;
}

export function getActivePath(companyId: string): ActivePath | null {
  const raw = safeLocalStorageGet(storageKey(companyId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed.routeId === "string" && typeof parsed.startedAt === "string") {
      return parsed as ActivePath;
    }
    return null;
  } catch {
    return null;
  }
}

export function setActivePath(companyId: string, path: ActivePath): void {
  safeLocalStorageSet(storageKey(companyId), JSON.stringify(path));
}

export function clearActivePath(companyId: string): void {
  safeLocalStorageRemove(storageKey(companyId));
}
