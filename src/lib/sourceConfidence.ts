import type { InputItem } from "@/lib/types";

export type SourceTier = "public" | "company" | "evidence" | "implemented_tested";

export type SourceConfidenceSignals = {
  uploadedFiles: number;
  hasCompanyEvidence: boolean;
  hasPrimaryEvidence: boolean;
  primaryEvidenceSignals: number;
  testedSignal: number;
  hasImplementedTested: boolean;
};

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function nestedNumber(value: unknown, path: string[]) {
  let cursor: unknown = value;
  for (const key of path) {
    const record = asRecord(cursor);
    if (!record) return null;
    cursor = record[key];
  }
  return typeof cursor === "number" && Number.isFinite(cursor) ? cursor : null;
}

export function detectTestedSignal(areaScoresJson: unknown) {
  return (
    nestedNumber(areaScoresJson, ["evidence", "implementation_tested"]) ??
    nestedNumber(areaScoresJson, ["implementation", "tested"]) ??
    nestedNumber(areaScoresJson, ["execution", "tested"]) ??
    0
  );
}

export function countUploadedInputFiles(inputs: InputItem[]) {
  return (Array.isArray(inputs) ? inputs : []).reduce(
    (sum, input) => sum + (Array.isArray(input.files) ? input.files.length : 0),
    0,
  );
}

export function buildSourceConfidenceSignals(args: {
  inputs: InputItem[];
  hasPrimaryEvidence: boolean;
  primaryEvidenceSignals: number;
  areaScoresJson?: unknown;
}): SourceConfidenceSignals {
  const uploadedFiles = countUploadedInputFiles(args.inputs);
  const testedSignal = detectTestedSignal(args.areaScoresJson);
  const hasCompanyEvidence = uploadedFiles > 0;
  const hasImplementedTested = hasCompanyEvidence && args.hasPrimaryEvidence && testedSignal >= 60;

  return {
    uploadedFiles,
    hasCompanyEvidence,
    hasPrimaryEvidence: args.hasPrimaryEvidence,
    primaryEvidenceSignals: Math.max(0, args.primaryEvidenceSignals || 0),
    testedSignal,
    hasImplementedTested,
  };
}

