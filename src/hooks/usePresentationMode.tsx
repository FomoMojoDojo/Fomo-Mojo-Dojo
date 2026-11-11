import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "@/hooks/useAuth";
import { safeLocalStorageGet, safeLocalStorageSet } from "@/lib/safeLocalStorage";

export type PresentationMode = "internal" | "client";

type PresentationModeContextValue = {
  mode: PresentationMode;
  setMode: (next: PresentationMode) => void;
  isClientView: boolean;
  isInternalView: boolean;
};

const STORAGE_KEY = "mojo.presentation.mode";

const PresentationModeContext = createContext<PresentationModeContextValue | undefined>(undefined);

function normalizeMode(value: unknown): PresentationMode {
  return value === "client" ? "client" : "internal";
}

// U6 part 1 (2026-11-11) — A NON-ADMIN IS ALWAYS CLIENT PRESENTATION, DERIVED FROM isAdmin.
//
// This mode used to come from localStorage alone, for everyone. Two consequences, both measured on
// 2026-11-10: `internal` is the default for a browser that has never stored anything, so a member's
// first-ever visit arrived in OPERATOR presentation; and a member could switch themselves into it at
// will, because the switch is a localStorage write and the key is theirs to set.
//
// So for a non-admin the stored value is not consulted and `setMode` does nothing. The operator
// switch stays exactly as it was for an admin — this removes an operator CONTROL from a client, not
// the control itself.
//
// IT IS NOT PERSISTED FOR A NON-ADMIN. Writing "client" into the key would overwrite an operator's
// own preference on a shared browser, and the derived value needs no storage to survive a reload:
// isAdmin does that.
export function PresentationModeProvider({ children }: { children: ReactNode }) {
  const { user, isAdmin, loading: authLoading } = useAuth();
  const [stored, setStored] = useState<PresentationMode>(() => {
    if (typeof window === "undefined") return "internal";
    return normalizeMode(safeLocalStorageGet(STORAGE_KEY));
  });

  // IT APPLIES TO A SIGNED-IN NON-ADMIN, AND ONLY TO ONE.
  //
  // A SIGNED-OUT visitor is not a non-admin account; they are nobody, and their mode must stay the
  // stored one. Forcing client mode on them changed which door they met: measured 2026-11-11, a
  // signed-out visit to /legacy/strategy stopped being "AdminGuard redirects, carrying
  // /legacy/strategy" and became "the client-mode bounce sends them to /, which carries / instead" —
  // so the deep link U6-45 exists to preserve was silently dropped. zz-signed-out-routes caught it.
  //
  // WHILE AUTH IS LOADING the stored value also stands. isAdmin is false until the user_roles lookup
  // answers, so forcing client mode during the gap would flash the client shell at an operator on
  // every reload.
  const forceClient = !authLoading && !!user && !isAdmin;
  const mode: PresentationMode = forceClient ? "client" : stored;

  // IT IS WRITTEN WHEN AN OPERATOR SWITCHES, AND AT NO OTHER TIME (U6 part 1).
  //
  // An effect used to persist the mode on every mount, which meant the key was RE-CREATED with the
  // default immediately after sign-out cleared it — so "sign-out clears mojo.presentation.mode" was
  // observably false one page load later, and zz-member-landing (f) caught it. The default needs no
  // storage: an absent key already reads as "internal".
  const setMode = useCallback((next: PresentationMode) => {
    // The operator switch is not available to a client. It is removed from THEM, not removed.
    if (forceClient) return;
    const normalized = normalizeMode(next);
    setStored(normalized);
    if (typeof window !== "undefined") safeLocalStorageSet(STORAGE_KEY, normalized);
  }, [forceClient]);

  const value = useMemo<PresentationModeContextValue>(
    () => ({
      mode,
      setMode,
      isClientView: mode === "client",
      isInternalView: mode === "internal",
    }),
    [mode, setMode],
  );

  return <PresentationModeContext.Provider value={value}>{children}</PresentationModeContext.Provider>;
}

export function usePresentationMode() {
  const context = useContext(PresentationModeContext);
  if (!context) {
    throw new Error("usePresentationMode must be used within PresentationModeProvider");
  }
  return context;
}

