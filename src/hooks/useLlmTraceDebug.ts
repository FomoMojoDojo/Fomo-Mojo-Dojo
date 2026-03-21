import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "mojomap_debug_llm_trace";

function readStoredValue() {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function useLlmTraceDebug() {
  const [enabled, setEnabled] = useState<boolean>(() => readStoredValue());

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY) return;
      setEnabled(event.newValue === "1");
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const update = useCallback((next: boolean) => {
    setEnabled(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
    } catch {
      // ignore localStorage errors
    }
  }, []);

  const toggle = useCallback(() => {
    update(!enabled);
  }, [enabled, update]);

  return { enabled, setEnabled: update, toggle };
}

