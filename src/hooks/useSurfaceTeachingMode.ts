const LS_KEY = 'surface_teaching_mode';
const listeners = new Set<(v: boolean) => void>();

function getStored(): boolean {
  try { return localStorage.getItem(LS_KEY) === 'true'; } catch { return false; }
}

export function getSurfaceTeachingMode(): boolean {
  return getStored();
}

export function setSurfaceTeachingMode(value: boolean) {
  try { localStorage.setItem(LS_KEY, value ? 'true' : 'false'); } catch {}
  listeners.forEach((fn) => fn(value));
}

export function subscribeSurfaceTeachingMode(fn: (v: boolean) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

import { useState, useEffect } from 'react';

export function useSurfaceTeachingMode() {
  const [enabled, setEnabled] = useState(getStored);

  useEffect(() => {
    return subscribeSurfaceTeachingMode(setEnabled);
  }, []);

  return {
    enabled,
    toggle: () => setSurfaceTeachingMode(!enabled),
    set: setSurfaceTeachingMode,
  };
}
