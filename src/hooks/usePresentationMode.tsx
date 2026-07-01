import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { safeLocalStorageGet, safeLocalStorageSet } from "@/lib/safeLocalStorage";
import { HAS_SUPABASE_CREDENTIALS } from "@/integrations/supabase/client";

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

export function PresentationModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<PresentationMode>(() => {
    // Fixture/snapshot mode (no real backend): default to the internal view so the
    // admin-only client-refine preview routes pass InternalViewOnlyRoute on load,
    // regardless of any stale stored value. The operator can still toggle.
    if (!HAS_SUPABASE_CREDENTIALS) return "internal";
    if (typeof window === "undefined") return "internal";
    return normalizeMode(safeLocalStorageGet(STORAGE_KEY));
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    safeLocalStorageSet(STORAGE_KEY, mode);
  }, [mode]);

  const value = useMemo<PresentationModeContextValue>(
    () => ({
      mode,
      setMode: (next) => setModeState(normalizeMode(next)),
      isClientView: mode === "client",
      isInternalView: mode === "internal",
    }),
    [mode],
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

