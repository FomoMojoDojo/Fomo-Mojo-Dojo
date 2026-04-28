import { useMemo } from "react";
import { useInputs } from "@/hooks/useInputs";
import { usePrimaryEvidenceSignal } from "@/hooks/usePrimaryEvidenceSignal";
import { buildSourceConfidenceSignals } from "@/lib/sourceConfidence";
import type { InputItem } from "@/lib/types";

export function useSourceConfidence(args: {
  companyId?: string;
  areaScoresJson?: unknown;
  inputsOverride?: InputItem[];
  evidenceStatus?: string | null;
}) {
  const { query } = useInputs(args.companyId);
  const { signal: primarySignal } = usePrimaryEvidenceSignal(args.companyId);
  const inputs = args.inputsOverride ?? query.data ?? [];

  const signals = useMemo(
    () =>
      buildSourceConfidenceSignals({
        inputs,
        hasPrimaryEvidence: primarySignal.hasPrimaryEvidence,
        primaryEvidenceSignals: primarySignal.primaryCount,
        areaScoresJson: args.areaScoresJson,
        evidenceStatus: args.evidenceStatus,
      }),
    [inputs, primarySignal.hasPrimaryEvidence, primarySignal.primaryCount, args.areaScoresJson, args.evidenceStatus],
  );

  return {
    signals,
    sourceLabels: primarySignal.sourceLabels,
  };
}
