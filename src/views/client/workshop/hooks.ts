import { useState, useRef, useCallback, useEffect } from "react";

export function useSaveFlash() {
  const [savedField, setSavedField] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flash = useCallback((field: string) => {
    setSavedField(field);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setSavedField(null), 2200);
  }, []);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  return { savedField, flash };
}

export type ReviewStatus = "confirmed" | "flagged" | null;

const SIGNAL_REVIEW_KEY = "crpv_signal_review";

export function useSignalReview(companyId: string | undefined) {
  const [store, setStore] = useState<Record<string, ReviewStatus>>(() => {
    try { return JSON.parse(localStorage.getItem(SIGNAL_REVIEW_KEY) || "{}"); }
    catch { return {}; }
  });

  const itemKey = useCallback(
    (content: string) => `${companyId ?? ""}::${content.slice(0, 200)}`,
    [companyId],
  );

  const getStatus = useCallback(
    (content: string): ReviewStatus => store[itemKey(content)] ?? null,
    [store, itemKey],
  );

  const setStatus = useCallback(
    (content: string, s: ReviewStatus) => {
      const k = itemKey(content);
      let next: Record<string, ReviewStatus>;
      if (s === null) {
        next = { ...store };
        delete next[k];
      } else {
        next = { ...store, [k]: s };
      }
      setStore(next);
      localStorage.setItem(SIGNAL_REVIEW_KEY, JSON.stringify(next));
    },
    [store, itemKey],
  );

  return { getStatus, setStatus };
}

export type QuestionImportance = "important" | "unimportant" | null;
export interface QuestionAnnotation { importance: QuestionImportance; answer: string }

const Q_STORAGE_KEY = "crpv_question_annotations";

export function useQuestionAnnotations(companyId: string | undefined) {
  const [annotations, setAnnotations] = useState<Record<string, QuestionAnnotation>>(() => {
    try { return JSON.parse(localStorage.getItem(Q_STORAGE_KEY) || "{}"); }
    catch { return {}; }
  });

  const compoundKey = useCallback((q: string) =>
    `${companyId || ""}::${q.slice(0, 140)}`, [companyId]);

  const getAnnotation = useCallback((q: string): QuestionAnnotation =>
    annotations[compoundKey(q)] ?? { importance: null, answer: "" },
    [annotations, compoundKey]);

  const updateAnnotation = useCallback((q: string, patch: Partial<QuestionAnnotation>) => {
    const key = compoundKey(q);
    const current = annotations[key] ?? { importance: null, answer: "" };
    const next = { ...annotations, [key]: { ...current, ...patch } };
    setAnnotations(next);
    localStorage.setItem(Q_STORAGE_KEY, JSON.stringify(next));
  }, [annotations, compoundKey]);

  return { getAnnotation, updateAnnotation };
}
