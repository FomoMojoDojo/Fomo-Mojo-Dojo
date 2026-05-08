import { safeLocalStorageGet, safeLocalStorageSet, safeLocalStorageRemove } from "./safeLocalStorage";

export type OutcomeFocus = {
  outcomeText: string | null;
  opportunityId: string | null;
};

function storageKey(companyId: string) {
  return `crpv:outcome-focus:${companyId}`;
}

export function getOutcomeFocus(companyId: string): OutcomeFocus {
  const raw = safeLocalStorageGet(storageKey(companyId));
  if (!raw) return { outcomeText: null, opportunityId: null };
  try {
    const parsed = JSON.parse(raw);
    return {
      outcomeText: typeof parsed.outcomeText === "string" ? parsed.outcomeText : null,
      opportunityId: typeof parsed.opportunityId === "string" ? parsed.opportunityId : null,
    };
  } catch {
    return { outcomeText: null, opportunityId: null };
  }
}

export function setOutcomeFocus(companyId: string, focus: OutcomeFocus): void {
  safeLocalStorageSet(storageKey(companyId), JSON.stringify(focus));
}

export function clearOutcomeFocus(companyId: string): void {
  safeLocalStorageRemove(storageKey(companyId));
}
