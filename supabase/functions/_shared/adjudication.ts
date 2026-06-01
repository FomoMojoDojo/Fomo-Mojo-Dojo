// ONB-F2 S3: Shared adjudication logic.
// Pure decision function — no DB I/O, no edge-function dependencies.
// Used by run-agent-flow and any future discrete flow entry points.

export type ContextMode = "public_baseline" | "uploaded_only" | "uploaded_evidence_fallback" | "upload_required";
export type FlowMode = "public_only" | "uploaded_only" | "hybrid";

export type AdjudicationInput = {
  mode: FlowMode;
  baselineStatus: string;
  baselineStatusBeforePublicCollection: string;
  uploadedFileCount: number;
  existingArtifactCount: number;
  baselineQualityType?: string;
};

export type AdjudicationResult = {
  contextMode: ContextMode;
  rationale: string;
  qualityType?: string;
};

export class AdjudicationBlockedError extends Error {
  readonly statusCode: number;
  readonly status: string;
  readonly reason: string;

  constructor(args: { message: string; statusCode: number; status: string; reason: string }) {
    super(args.message);
    this.name = "AdjudicationBlockedError";
    this.statusCode = args.statusCode;
    this.status = args.status;
    this.reason = args.reason;
  }
}

const WEAK_BASELINE_STATUSES = new Set([
  "ambiguous_public_evidence",
  "insufficient_public_evidence",
]);

function isWeak(status: string): boolean {
  return WEAK_BASELINE_STATUSES.has(status);
}

export function adjudicate(input: AdjudicationInput): AdjudicationResult {
  const {
    mode,
    baselineStatus,
    baselineStatusBeforePublicCollection,
    uploadedFileCount,
    existingArtifactCount,
    baselineQualityType,
  } = input;

  const hasUploadedEvidence = uploadedFileCount > 0;
  const hasExistingArtifacts = existingArtifactCount > 0;
  const weakBaseline = isWeak(baselineStatus);
  const weakBaselineBeforePublicCollection = isWeak(baselineStatusBeforePublicCollection);
  const baselineMissing = baselineStatus === "missing";

  let contextMode: ContextMode = "public_baseline";
  let rationale = "";

  if (mode === "uploaded_only") {
    if (!hasUploadedEvidence) {
      throw new AdjudicationBlockedError({
        message: "Uploaded-only mode requires at least one uploaded file.",
        statusCode: 422,
        status: "uploaded_context_requires_files",
        reason: "No uploaded files were found for this company.",
      });
    }
    contextMode = "uploaded_only";
    rationale = "Uploaded-only mode selected, so generated outputs must rely on uploaded company evidence.";
  } else if (mode === "public_only") {
    if (weakBaseline || baselineMissing) {
      throw new AdjudicationBlockedError({
        message: "Public-only mode requires a strong public baseline.",
        statusCode: 422,
        status: "public_baseline_not_ready",
        reason: baselineMissing
          ? "No baseline run found for this company."
          : `Latest baseline status is '${baselineStatus}', which is not strong enough for public-only generation.`,
      });
    }
    contextMode = "public_baseline";
    rationale = "Public-only mode selected and baseline quality check passed.";
  } else {
    if ((weakBaseline || baselineMissing) && hasUploadedEvidence) {
      contextMode = "uploaded_only";
      rationale = baselineMissing
        ? "No public baseline run is available, so flow switched to uploaded evidence."
        : "Public baseline is weak/ambiguous, so flow switched to uploaded evidence.";
    } else if (weakBaseline && !hasUploadedEvidence) {
      if (hasExistingArtifacts || !weakBaselineBeforePublicCollection) {
        contextMode = "public_baseline";
        rationale = hasExistingArtifacts
          ? "Latest baseline is weak, but prior generated artifacts exist for this company, so flow continues with public baseline context."
          : "Latest baseline is weak, but a prior baseline status was not weak, so flow continues with public baseline context.";
      } else {
        return {
          contextMode: "upload_required",
          rationale: "Public baseline is weak and no uploaded evidence is available.",
          qualityType: baselineQualityType ?? baselineStatus,
        };
      }
    } else if (baselineMissing && !hasUploadedEvidence) {
      return {
        contextMode: "upload_required",
        rationale: "No baseline run or uploaded evidence available.",
        qualityType: baselineQualityType ?? "no_results",
      };
    } else {
      contextMode = "public_baseline";
      rationale = "Hybrid mode selected and public baseline quality check passed.";
    }
  }

  return { contextMode, rationale };
}
