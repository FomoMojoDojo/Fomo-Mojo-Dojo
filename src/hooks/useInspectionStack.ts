import { useState, useCallback } from "react";
import type { InspectionFrame } from "@/lib/inspectionStack";

export function useInspectionStack() {
  const [stack, setStack] = useState<InspectionFrame[]>([]);

  const top = stack.length > 0 ? stack[stack.length - 1] : null;
  const prev = stack.length > 1 ? stack[stack.length - 2] : null;
  const isOpen = stack.length > 0;

  const open = useCallback((frame: InspectionFrame) => {
    setStack([frame]);
  }, []);

  const push = useCallback((frame: InspectionFrame) => {
    setStack((s) => [...s, frame]);
  }, []);

  const pop = useCallback(() => {
    setStack((s) => (s.length > 1 ? s.slice(0, -1) : s));
  }, []);

  const clear = useCallback(() => {
    setStack([]);
  }, []);

  const updateTopLens = useCallback((lens: string) => {
    setStack((s) => {
      if (s.length === 0) return s;
      const last = { ...s[s.length - 1], lens } as InspectionFrame;
      return [...s.slice(0, -1), last];
    });
  }, []);

  return { stack, top, prev, isOpen, open, push, pop, clear, updateTopLens };
}
