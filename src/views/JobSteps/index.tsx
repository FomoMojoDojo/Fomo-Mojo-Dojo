import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { FunctionsHttpError } from "@supabase/supabase-js";
import TopNav from "@/components/layout/TopNav";
import AiBoundaryNote from "@/components/AiBoundaryNote";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { useJobSteps, type JobStepRow } from "@/hooks/useJobSteps";
import { useOdiNeeds, type OdiMarketDefinitionRow, type OdiNeedRow } from "@/hooks/useOdiNeeds";
import { usePublicBaseline } from "@/hooks/usePublicBaseline";
import { useStrategyCascade } from "@/hooks/useStrategyCascade";
import { useStrategicProblems } from "@/hooks/useStrategicProblems";
import { useInputs } from "@/hooks/useInputs";
import { useLatestLocalAlignment, useRunLocalAlignment } from "@/hooks/useLocalAlignment";
import { useSourceConfidence } from "@/hooks/useSourceConfidence";
import { usePositioningCanvas } from "@/hooks/usePositioningCanvas";
import type { InputItem, PositioningCanvas } from "@/lib/types";
import { opportunityActionFromNeedScore, opportunityActionTone } from "@/lib/opportunityLabels";
import {
  JTBD_CHECKPOINT_COUNT,
  JTBD_ODI_CHECKPOINTS,
  deriveMarketDefinitionCanvas,
} from "@/lib/jtbdProcess";
import { MetaBadge, ScoreChip, StateBadge } from "@/components/ui/semantic-badges";
import NeedInspectPanel from "@/components/needs/NeedInspectPanel";
import SdsTerm from "@/components/ui/sds-term";
import PageContextStatus from "@/components/layout/PageContextStatus";
import { AreaAlignmentPanel } from "@/components/alignment/AreaAlignmentPanel";
import TensionBlock from "@/components/tensions/TensionBlock";
import { deriveStrategicTensions, tensionsForContext as filterTensionsForContext } from "@/lib/tensionDerivation";
import type { StrategicTension } from "@/lib/tensionTypes";
import GenericAuditTraceNote from "@/components/diagnostics/GenericAuditTraceNote";
import { isGenericAuditCompany } from "@/lib/genericAudit";
import { useCompanyClaims } from "@/lib/claims/useCompanyClaims";
import ClaimStateBadge from "@/components/claims/ClaimStateBadge";
import {
  safeText,
  isPublicSourcePath,
  sourcePathLabel,
  formatNeedScore,
  normalizeAudienceSignal,
  normalizeClause,
  joinWithAnd,
  trimToWordLimit,
  stripLeadIn,
  firstClause,
  concisePhrase,
  parseJtbdParts,
  normalizeFrameOfReference,
  normalizeRoleLabel,
  shouldUseLocalMapFallback,
  shouldAttemptBaselineRetry,
  isMissingTableError,
} from "./helpers/textUtils";
import {
  isGenericAudienceLabel,
  isLikelyJobActionLabel,
  isInvalidAudienceLabel,
  isGenericJtbdStatement,
  isGenericJourneySubtitle,
  isTraditionalMarketDefinition,
  isGenericRoleLabel,
  isOrganizationSegmentLabel,
  isDraftPlaceholderStep,
  hasAssessedGap,
  isBareOdiStageLabel,
} from "./helpers/validation";
import {
  type JourneyKey,
  type JourneyGroup,
  normalizeJourneyKey,
  titleFromKey,
  subtitleFromKey,
  titleCaseFromKey,
  fallbackStyleForJourney,
  LOCAL_ODI_STEP_SEED,
  checkpointSeedForJourneyKey,
  groupJourneys,
} from "./helpers/journeyUtils";
import {
  rankedNeedsByOpportunity,
  audienceFromJourneyTitle,
  jtbdFromJourneyTitle,
  chooserFromJourneyTitle,
  marketContextFromJourney,
  deriveBestGuessJtbd,
  deriveOdiDunfordMarketContext,
  deriveAbstractedExecutor,
  deriveFunctionOfProductStatement,
  deriveAbstractedJobStatement,
  deriveOtherProductsContext,
  type OtherProductsContextGroup,
  deriveOtherProductsContextGroups,
  deriveExecutorDetermination,
  firstSpecificRole,
  inferRolesFromSignals,
  inferRoleFromBestFitCustomers,
} from "./helpers/derivation";
import {
  type SuggestedJourneyOption,
  inferRevenueMapTitle,
  inferSuggestedJourneyOptions,
} from "./helpers/inferenceUtils";

const c = {
  bg: "#faf7f6",
  panel: "#FFFFFF",
  card: "#ffffff",
  paper: "#FFFFFF",
  line: "#DDE6D1",
  lineFaint: "#EEF3E9",
  charcoal: "#233C4B",
  secondary: "#46606D",
  muted: "#6E847F",
  faint: "#C8D8CA",
  coral: "#FF7D2D",
  teal: "#5F9B8C",
  slate: "#233C4B",
  gap: "#FF7D2D",
  empty: "#E7EEDC",
  designedDot: "#7B8F66",
};

const STEP_CARD_WIDTH = "250px";
const STEP_DETAIL_BLOCK_HEIGHT = "96px";


type JourneyDraftMap = Record<string, { title: string; subtitle: string }>;

const JOURNEY_STYLE: Record<
  string,
  { rail: string; dot: string; preview?: string }
> = {
  customer: { rail: c.coral, dot: c.coral },
  revenue: { rail: c.teal, dot: c.teal, preview: "Project preview" },
  operations: { rail: c.slate, dot: c.slate },
};


function NeedActionBadge({ label }: { label: "Fix" | "Improve" | "Create" }) {
  const tone = opportunityActionTone(label);
  return (
    <span
      className="font-mono text-[9px] uppercase tracking-[0.1em]"
      style={{ color: tone.fg }}
    >
      {label}
    </span>
  );
}






async function describeJobMapInvokeError(error: unknown) {
  const maybeContext = (() => {
    if (!error || typeof error !== "object") return null;
    const candidate = (error as { context?: { text?: () => Promise<string> } }).context;
    if (!candidate || typeof candidate.text !== "function") return null;
    return candidate;
  })();

  if (error instanceof FunctionsHttpError || maybeContext) {
    const payloadText = await (maybeContext?.text?.() ?? Promise.resolve("")).catch(() => "");
    const payload = (() => {
      if (!payloadText) return null;
      try {
        return JSON.parse(payloadText) as {
          error?: string;
          status?: string;
          message?: string;
        };
      } catch {
        return null;
      }
    })();

    const status = String(payload?.status || "");
    if (status === "job_map_selection_required") {
      return "Choose at least one checkpoint map, then run research.";
    }
    if (status === "customer_job_map_required") {
      return "Include a customer checkpoint map so opportunities can anchor to the primary job performer.";
    }

    return String(payload?.message || payload?.error || payloadText || error.message);
  }

  return error instanceof Error ? error.message : String(error);
}


class InvokeTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvokeTimeoutError";
  }
}

async function invokeFunctionWithTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      fn(),
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(
            new InvokeTimeoutError(
              "Map generation is still running in the background. This can take a few minutes for full evidence-backed generation.",
            ),
          );
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}


function TimelineRow({
  steps,
  color,
}: {
  steps: JobStepRow[];
  color: string;
}) {
  return (
    <div className="flex gap-3 px-5 py-4">
      {steps.map((step, index) => {
        const evidenced = step.evidence_status === "evidenced";
        const implied = step.evidence_status === "implied";
        const active = evidenced || implied || !!step.designed;
        const bg = evidenced ? color : implied ? `${color}B3` : c.empty;
        const text = evidenced || implied ? "#fff" : c.muted;

        return (
          <div key={step.id} className="w-[250px] shrink-0" style={{ width: STEP_CARD_WIDTH }}>
            <div className="flex items-center">
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-mono text-[12px] font-bold"
                style={{ background: bg, color: text }}
              >
                {step.step_number ?? "—"}
              </div>
              {index < steps.length - 1 ? (
                <div
                  className="ml-2 h-[3px] flex-1 rounded-full"
                  style={{ background: active ? `${color}40` : c.line }}
                />
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function StepCard({
  step,
  onSaveText,
  saving,
}: {
  step: JobStepRow;
  onSaveText?: (stepId: string, values: { step_label: string; description: string }) => Promise<void>;
  saving?: boolean;
}) {
  const draftPlaceholder = isDraftPlaceholderStep(step);
  const assessedGap = hasAssessedGap(step);
  const [isEditing, setIsEditing] = useState(false);
  const [labelDraft, setLabelDraft] = useState(safeText(step.step_label, "Untitled checkpoint"));
  const [descriptionDraft, setDescriptionDraft] = useState(safeText(step.description, ""));

  useEffect(() => {
    if (isEditing) return;
    setLabelDraft(safeText(step.step_label, "Untitled checkpoint"));
    setDescriptionDraft(safeText(step.description, ""));
  }, [step.step_label, step.description, isEditing]);

  const handleSaveEdit = async () => {
    if (!onSaveText) {
      setIsEditing(false);
      return;
    }
    const nextLabel = labelDraft.trim();
    if (!nextLabel) {
      toast.error("Checkpoint label cannot be empty.");
      return;
    }
    try {
      await onSaveText(step.id, {
        step_label: nextLabel,
        description: descriptionDraft.trim(),
      });
      setIsEditing(false);
      toast.success("Checkpoint updated.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update checkpoint.");
    }
  };

  const evidenceTone =
    draftPlaceholder
      ? { label: "Not Assessed", color: c.muted, bg: "#F3F4EF", border: c.line }
      : step.evidence_status === "evidenced"
      ? { label: "Evidenced", color: c.teal, bg: "#EEF6E7", border: "#BDD8CF" }
      : step.evidence_status === "implied"
        ? { label: "Implied", color: c.slate, bg: "#EDF4F6", border: "#C4D7DE" }
        : { label: "Unclear", color: c.gap, bg: "#FFF0E6", border: "#FFD1B4" };

  return (
    <div
      className="flex h-full w-[250px] shrink-0 flex-col overflow-hidden"
      style={{
        width: STEP_CARD_WIDTH,
        background: c.paper,
        borderLeft: assessedGap ? `3px solid #E7C3A4` : `2px solid ${c.line}`,
        borderTop: `1px solid ${c.line}`,
        borderRight: `1px solid ${c.line}`,
        borderBottom: `1px solid ${c.line}`,
      }}
    >
      <div className="flex min-h-[440px] flex-1 flex-col p-4">
        <div>
          <div className="flex items-center justify-between gap-2">
            <p className="font-mono text-[10px] uppercase tracking-[0.12em]" style={{ color: c.muted }}>
              Checkpoint {step.step_number ?? "—"}
            </p>
            {!isEditing ? (
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                disabled={!!saving}
                className="font-mono text-[9px] uppercase tracking-[0.08em] underline disabled:opacity-50"
                style={{ color: c.muted, background: "none", border: "none", cursor: "pointer", padding: 0 }}
              >
                Edit
              </button>
            ) : (
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    setIsEditing(false);
                    setLabelDraft(safeText(step.step_label, "Untitled checkpoint"));
                    setDescriptionDraft(safeText(step.description, ""));
                  }}
                  disabled={!!saving}
                  className="font-mono text-[9px] uppercase tracking-[0.08em] underline disabled:opacity-50"
                  style={{ color: c.muted, background: "none", border: "none", cursor: "pointer", padding: 0 }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveEdit}
                  disabled={!!saving}
                  className="font-mono text-[9px] uppercase tracking-[0.08em] underline disabled:opacity-50"
                  style={{ color: c.teal, background: "none", border: "none", cursor: "pointer", padding: 0 }}
                >
                  {saving ? "Saving…" : "Save"}
                </button>
              </div>
            )}
          </div>
          {!isEditing ? (
            <>
              <p className="mt-2 font-sans text-[14px] font-bold leading-tight" style={{ color: c.charcoal }}>
                {isBareOdiStageLabel(step.step_label) ? "Untitled checkpoint" : safeText(step.step_label, "Untitled checkpoint")}
              </p>
              <p className="mt-2 font-sans text-[12px] leading-[1.55]" style={{ color: c.secondary }}>
                {safeText(step.description, "No description yet.")}
              </p>
            </>
          ) : (
            <div className="mt-2 space-y-2">
              <input
                value={labelDraft}
                onChange={(event) => setLabelDraft(event.target.value)}
                className="w-full rounded-lg border px-2.5 py-2 font-sans text-[12px] outline-none"
                style={{ borderColor: c.line, color: c.charcoal, background: "#fff" }}
                placeholder="Checkpoint title"
              />
              <textarea
                value={descriptionDraft}
                onChange={(event) => setDescriptionDraft(event.target.value)}
                className="min-h-[74px] w-full rounded-lg border px-2.5 py-2 font-sans text-[12px] leading-[1.5] outline-none"
                style={{ borderColor: c.line, color: c.secondary, background: "#fff" }}
                placeholder="Checkpoint description"
              />
            </div>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span
            className="font-mono text-[10px] uppercase tracking-[0.1em]"
            style={{ color: evidenceTone.color }}
          >
            {evidenceTone.label}
          </span>
          <MetaBadge>Conf {step.evidence_confidence ?? 0}</MetaBadge>
        </div>

        <div className="mt-4" style={{ minHeight: STEP_DETAIL_BLOCK_HEIGHT }}>
          <p className="font-mono text-[9px] uppercase tracking-[0.08em]" style={{ color: c.muted, opacity: 0.75 }}>
            Evidence Basis
          </p>
          <p className="mt-1 font-sans text-[12px] leading-[1.55]" style={{ color: c.secondary }}>
            {safeText(
              step.evidence_basis,
              draftPlaceholder
                ? "This is a starter checkpoint. Add customer evidence to make it specific."
                : "No evidence note has been captured yet.",
            )}
          </p>
        </div>

        {assessedGap ? (
          <div className="mt-3" style={{ minHeight: STEP_DETAIL_BLOCK_HEIGHT }}>
            <p className="font-mono text-[9px] font-bold uppercase tracking-[0.1em]" style={{ color: c.gap }}>
              · Gap Identified
            </p>
            <p className="mt-1 font-sans text-[12px] leading-[1.55]" style={{ color: c.gap }}>
              {safeText(step.gap_note, "A gap is flagged here, but we still need clear evidence showing why it is happening.")}
            </p>
          </div>
        ) : draftPlaceholder ? (
          <div className="mt-3" style={{ minHeight: STEP_DETAIL_BLOCK_HEIGHT }}>
            <p className="font-mono text-[9px] font-bold uppercase tracking-[0.1em]" style={{ color: c.muted }}>
              Needs Assessment
            </p>
            <p className="mt-1 font-sans text-[12px] leading-[1.55]" style={{ color: c.secondary }}>
              This checkpoint is still a draft. Run research to confirm whether a real gap exists and what is causing it.
            </p>
          </div>
        ) : (
          <div style={{ minHeight: STEP_DETAIL_BLOCK_HEIGHT }} className="mt-3" />
        )}
      </div>

      <div
        className="flex min-h-[34px] items-center border-t px-4 py-2"
        style={{ borderColor: c.line }}
      >
        {assessedGap ? (
          <span className="flex items-center gap-1 font-mono text-[10px] font-bold uppercase tracking-[0.08em]" style={{ color: c.gap }}>
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: c.gap }} />
            Gap
          </span>
        ) : draftPlaceholder ? (
          <span className="font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: c.muted }}>
            Draft
          </span>
        ) : (
          <span className="font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: c.muted }}>
            {step.designed ? "Designed" : evidenceTone.label}
          </span>
        )}
      </div>
    </div>
  );
}

function titleCaseJourney(key: string) {
  if (key === "customer") return "Customer";
  if (key === "revenue") return "Revenue";
  if (key === "operations") return "Operations";
  return titleCaseFromKey(key);
}

const INNOVATION_STRATEGIES = [
  { key: "differentiated", label: "Differentiated", desc: "Target underserved outcomes in the mainstream market with a better solution than current alternatives." },
  { key: "dominant", label: "Dominant", desc: "Address all key outcomes better than any competitor — suitable when resources allow a full-market play." },
  { key: "disruptive", label: "Disruptive", desc: "Target overserved or non-consuming segments with a simpler, more affordable solution." },
  { key: "discrete", label: "Discrete", desc: "Build a unique solution for a distinct segment with unique outcome priorities not served by the mainstream." },
] as const;

function OdiContextSection({
  companyName,
  marketDefinition,
  odiError,
  needs,
  marketContext,
  activeCustomerJourneyTitle,
  activeCustomerJourneySubtitle,
  onRemovePublicMarketContext,
  onRemovePublicMarketContextAndRerun,
  removingPublicMarketContextAction,
  onSaveContextEdits,
  savingContextEdits,
  positioningCanvas,
  hasUploadedFiles,
  onResetPublicResearchArtifacts,
  resettingPublicResearchArtifacts,
  onUpdateInnovationStrategy,
}: {
  companyName?: string | null;
  marketDefinition: OdiMarketDefinitionRow | null;
  odiError?: string | null;
  needs: OdiNeedRow[];
  marketContext?: string;
  activeCustomerJourneyTitle?: string | null;
  activeCustomerJourneySubtitle?: string | null;
  onRemovePublicMarketContext?: () => void;
  onRemovePublicMarketContextAndRerun?: () => void;
  removingPublicMarketContextAction?: "remove" | "remove_and_rerun" | null;
  onSaveContextEdits?: (values: {
    marketContext: string;
    jobExecutor: string;
    chooser: string;
    jtbd: string;
  }) => Promise<void>;
  savingContextEdits?: boolean;
  positioningCanvas?: PositioningCanvas | null;
  hasUploadedFiles?: boolean;
  onResetPublicResearchArtifacts?: () => void;
  resettingPublicResearchArtifacts?: boolean;
  onUpdateInnovationStrategy?: (strategy: string) => Promise<void>;
}) {
  const derivedExecutor = audienceFromJourneyTitle(activeCustomerJourneyTitle);
  const derivedJtbd = jtbdFromJourneyTitle(activeCustomerJourneyTitle);
  const derivedChooser = chooserFromJourneyTitle(activeCustomerJourneyTitle);
  const storedExecutor = safeText(marketDefinition?.job_executor, "");
  const storedChooser = safeText(marketDefinition?.chooser, "");
  const storedJtbd = safeText(marketDefinition?.jtbd, "");
  const companyExecutorFallback = safeText(companyName, "")
    ? `${safeText(companyName, "")} customer`
    : "Primary job performer";

  const storedExecutorClean = isInvalidAudienceLabel(storedExecutor) ? "" : storedExecutor;
  const storedChooserClean = isInvalidAudienceLabel(storedChooser) ? "" : storedChooser;
  const derivedExecutorClean = isInvalidAudienceLabel(derivedExecutor) ? "" : derivedExecutor;
  const derivedChooserClean = isInvalidAudienceLabel(derivedChooser) ? "" : derivedChooser;
  const storedJtbdClean = isGenericJtbdStatement(storedJtbd) ? "" : storedJtbd;
  const derivedJtbdClean = isGenericJtbdStatement(derivedJtbd) ? "" : derivedJtbd;
  const bestFitCustomers = safeText(positioningCanvas?.best_fit_customers, "");
  const inferredExecutor = inferRoleFromBestFitCustomers(bestFitCustomers, { chooser: false });
  const inferredChooser = inferRoleFromBestFitCustomers(bestFitCustomers, { chooser: true });
  const inferredRoles = inferRolesFromSignals({
    bestFitCustomers,
    valueForCustomer: positioningCanvas?.value_for_customer,
    marketContext,
    needs,
  });

  const jobExecutor = firstSpecificRole(
    storedExecutorClean,
    derivedExecutorClean,
    inferredExecutor,
    inferredRoles.executor,
    storedChooserClean,
  );
  const resolvedJobExecutor = safeText(
    jobExecutor,
    safeText(inferredRoles.executor, companyExecutorFallback),
  );
  const chooser = firstSpecificRole(
    storedChooserClean,
    derivedChooserClean,
    inferredChooser,
    inferredRoles.chooser,
    isGenericRoleLabel(resolvedJobExecutor) ? "" : `${resolvedJobExecutor} decision owner`,
  );
  const resolvedChooser = safeText(
    chooser,
    safeText(inferredRoles.chooser, "Executive sponsor"),
  );
  const jtbd = deriveBestGuessJtbd({
    storedJtbd: storedJtbdClean,
    derivedJtbd: derivedJtbdClean,
    executor: resolvedJobExecutor,
    needs,
    valueForCustomer: positioningCanvas?.value_for_customer,
  });
  const traditionalMarketFallback = safeText(
    marketContextFromJourney({
      title: activeCustomerJourneyTitle,
      subtitle: activeCustomerJourneySubtitle,
      fallback: safeText(marketContext, ""),
    }),
    "",
  );
  const market = safeText(
    deriveOdiDunfordMarketContext({
      marketContext: traditionalMarketFallback,
      jobExecutor: resolvedJobExecutor,
      chooser: resolvedChooser,
      jtbd,
      needs,
      positioningCanvas,
    }),
    "No market context captured yet.",
  );
  const marketSource = sourcePathLabel(marketDefinition?.source_path);
  const publicNeedCount = needs.filter((item) => isPublicSourcePath(item.source_path)).length;
  const uploadedNeedCount = Math.max(0, needs.length - publicNeedCount);
  const hasPublicMarketContext = Boolean(marketDefinition?.source_path) && isPublicSourcePath(marketDefinition?.source_path);
  const [editingContext, setEditingContext] = useState(false);
  const [marketDraft, setMarketDraft] = useState(market);
  const [jobExecutorDraft, setJobExecutorDraft] = useState(resolvedJobExecutor);
  const [chooserDraft, setChooserDraft] = useState(resolvedChooser);
  const [jtbdDraft, setJtbdDraft] = useState(jtbd);
  const [savingStrategy, setSavingStrategy] = useState(false);
  const currentStrategy = String(marketDefinition?.innovation_strategy || "").trim().toLowerCase() || null;

  useEffect(() => {
    if (editingContext) return;
    setMarketDraft(market);
    setJobExecutorDraft(resolvedJobExecutor);
    setChooserDraft(resolvedChooser);
    setJtbdDraft(jtbd);
  }, [editingContext, market, resolvedJobExecutor, resolvedChooser, jtbd]);

  const handleSaveContext = async () => {
    if (!onSaveContextEdits) return;
    const nextMarket = marketDraft.trim();
    const nextExecutor = jobExecutorDraft.trim();
    const nextChooser = chooserDraft.trim();
    const nextJtbd = jtbdDraft.trim();
    if (!nextMarket || !nextExecutor || !nextChooser || !nextJtbd) {
      toast.error("Market context, job executor, chooser, and job statement are all required.");
      return;
    }
    const confirmed = window.confirm(
      "Save these market context edits?\n\nThis will update Strategic Decision System market context (executor, chooser, job statement) and then regenerate downstream strategy artifacts (job checkpoints, opportunities, routes, and related strategy outputs).",
    );
    if (!confirmed) return;
    try {
      await onSaveContextEdits({
        marketContext: nextMarket,
        jobExecutor: nextExecutor,
        chooser: nextChooser,
        jtbd: nextJtbd,
      });
      setEditingContext(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save market context edits.");
    }
  };

  return (
    <section
      style={{ borderTop: `1px solid ${c.line}`, paddingTop: 24, paddingBottom: 24 }}
    >
      <div className="mb-5">
        <div className="flex items-center gap-2">
          <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.14em]" style={{ color: "#9298B5" }}>Customer signal layer — what matters and how well it is served</p>
          <h2 className="font-sans text-[24px] font-semibold" style={{ color: c.charcoal }}>
            <SdsTerm short />{" "}Needs & Market Context
          </h2>
          <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.1em]" style={{ color: "#B0B8D0" }}>From: job structure · research data &nbsp;·&nbsp; Feeds: strategy priority and route targeting</p>
          <MetaBadge>{marketSource}</MetaBadge>
          <MetaBadge>{`Needs: ${publicNeedCount} public / ${uploadedNeedCount} uploaded`}</MetaBadge>
          {onSaveContextEdits ? (
            <button
              type="button"
              onClick={() => {
                if (editingContext) {
                  setEditingContext(false);
                  return;
                }
                setMarketDraft(market);
                setJobExecutorDraft(resolvedJobExecutor);
                setChooserDraft(resolvedChooser);
                setJtbdDraft(jtbd);
                setEditingContext(true);
              }}
              disabled={!!savingContextEdits}
              className="font-mono text-[10px] uppercase tracking-[0.08em] underline disabled:opacity-50"
              style={{ color: c.muted, background: "none", border: "none", cursor: "pointer", padding: 0 }}
            >
              {editingContext ? "Cancel Edit" : "Edit Context"}
            </button>
          ) : null}
        </div>
        <p className="mt-1 max-w-4xl font-sans text-[14px]" style={{ color: c.secondary }}>
          Public and uploaded-company signals are shown side by side through local alignment. Use this panel to spot mismatches before trusting Strategic Decision System priorities.
        </p>
        {odiError ? (
          <p className="mt-2 font-sans text-[13px]" style={{ color: c.gap }}>
            Strategic Decision System data load warning: {odiError}
          </p>
        ) : null}
        {hasPublicMarketContext && onRemovePublicMarketContext ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {hasUploadedFiles && onRemovePublicMarketContextAndRerun ? (
              <button
                type="button"
                onClick={onRemovePublicMarketContextAndRerun}
                disabled={Boolean(removingPublicMarketContextAction)}
                className="font-mono text-[10px] uppercase tracking-[0.08em] underline disabled:opacity-50"
                style={{ color: c.muted, background: "none", border: "none", cursor: "pointer", padding: 0 }}
              >
                {removingPublicMarketContextAction === "remove_and_rerun"
                  ? "Removing + Re-running…"
                  : "Remove + Re-run Uploaded Files"}
              </button>
            ) : null}
            <button
              type="button"
              onClick={onRemovePublicMarketContext}
              disabled={Boolean(removingPublicMarketContextAction)}
              className="font-mono text-[10px] uppercase tracking-[0.08em] underline disabled:opacity-50"
              style={{ color: c.coral, background: "none", border: "none", cursor: "pointer", padding: 0 }}
            >
              {removingPublicMarketContextAction === "remove"
                ? "Removing…"
                : hasUploadedFiles && onRemovePublicMarketContextAndRerun
                  ? "Remove Only"
                  : "Remove Public Market Context"}
            </button>
          </div>
        ) : null}
        {onResetPublicResearchArtifacts ? (
          <div className="mt-3">
            <button
              type="button"
              onClick={onResetPublicResearchArtifacts}
              disabled={Boolean(removingPublicMarketContextAction) || !!resettingPublicResearchArtifacts}
              className="font-mono text-[10px] uppercase tracking-[0.08em] underline disabled:opacity-50"
              style={{ color: "#915E46", background: "none", border: "none", cursor: "pointer", padding: 0 }}
              title="Remove generated public-research artifacts (map, opportunities, routes, baseline snapshots) while keeping uploaded files"
            >
              {resettingPublicResearchArtifacts ? "Resetting…" : "Reset False Public Research Artifacts"}
            </button>
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <div style={{ borderLeft: `2px solid ${c.line}`, paddingLeft: 16 }}>
          <p className="font-mono text-[10px] uppercase tracking-[0.1em]" style={{ color: c.muted }}>
            Market Context
          </p>
          {editingContext ? (
            <textarea
              value={marketDraft}
              onChange={(event) => setMarketDraft(event.target.value)}
              className="mt-2 min-h-[126px] w-full rounded-lg border px-2.5 py-2 font-sans text-[13px] leading-[1.55] outline-none"
              style={{ borderColor: c.line, color: c.secondary, background: "#fff" }}
              placeholder="Define the specific market context for this company."
            />
          ) : (
            <p className="mt-2 font-sans text-[13px] leading-[1.55]" style={{ color: c.secondary }}>
              {market}
            </p>
          )}
        </div>

        <div style={{ borderLeft: `2px solid ${c.line}`, paddingLeft: 16 }}>
          <p className="font-mono text-[10px] uppercase tracking-[0.1em]" style={{ color: c.muted }}>
            Job Executor
          </p>
          {editingContext ? (
            <input
              value={jobExecutorDraft}
              onChange={(event) => setJobExecutorDraft(event.target.value)}
              className="mt-2 w-full rounded-lg border px-2.5 py-2 font-sans text-[14px] font-semibold outline-none"
              style={{ borderColor: c.line, color: c.charcoal, background: "#fff" }}
              placeholder="Who performs the core job?"
            />
          ) : (
            <p className="mt-2 font-sans text-[15px] font-semibold" style={{ color: c.charcoal }}>
              {resolvedJobExecutor}
            </p>
          )}
          <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.1em]" style={{ color: c.muted }}>
            Chooser
          </p>
          {editingContext ? (
            <input
              value={chooserDraft}
              onChange={(event) => setChooserDraft(event.target.value)}
              className="mt-2 w-full rounded-lg border px-2.5 py-2 font-sans text-[13px] outline-none"
              style={{ borderColor: c.line, color: c.secondary, background: "#fff" }}
              placeholder="Who chooses/approves the solution?"
            />
          ) : (
            <p className="mt-2 font-sans text-[13px]" style={{ color: c.secondary }}>
              {resolvedChooser}
            </p>
          )}
        </div>

        <div className="lg:col-span-1" style={{ borderLeft: `2px solid ${c.line}`, paddingLeft: 16 }}>
          <p className="font-mono text-[10px] uppercase tracking-[0.1em]" style={{ color: c.muted }}>
            Job to Be Done
          </p>
          {editingContext ? (
            <>
              <textarea
                value={jtbdDraft}
                onChange={(event) => setJtbdDraft(event.target.value)}
                className="mt-2 min-h-[126px] w-full rounded-lg border px-2.5 py-2 font-sans text-[14px] font-semibold leading-[1.45] outline-none"
                style={{ borderColor: c.line, color: c.charcoal, background: "#fff" }}
                placeholder="When [job executor] is trying to..., they want to..., so they can..."
              />
              <p className="mt-2 font-sans text-[12px] italic leading-[1.6]" style={{ color: c.muted }}>
                Keep the job statement stable and solution-agnostic. Focus on enduring progress, not a specific product flow.
              </p>
            </>
          ) : (
            <p className="mt-2 font-sans text-[15px] font-semibold leading-[1.45]" style={{ color: c.charcoal }}>
              {jtbd}
            </p>
          )}
        </div>
      </div>
      {editingContext ? (
        <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-3">
          <div className="lg:col-start-3">
            <div
              className="mb-2"
              style={{ borderLeft: "2px solid #F1C3AC", paddingLeft: 12, paddingTop: 8, paddingBottom: 8 }}
            >
              <p className="font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: "#915E46" }}>
                Save Impact
              </p>
              <p className="mt-1 font-sans text-[12px] leading-[1.55]" style={{ color: "#6C4638" }}>
                Saving updates Strategic Decision System market context (executor, chooser, job statement), then regenerates downstream strategy artifacts (job checkpoints, opportunities, routes, and strategy outputs).
              </p>
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleSaveContext}
                disabled={!!savingContextEdits}
                className="border px-4 py-2 font-mono text-[10px] uppercase tracking-[0.08em] disabled:opacity-50"
                style={{ borderColor: "#D46A2D", color: "#FFFFFF", background: "#D46A2D" }}
              >
                {savingContextEdits ? "Saving + Refreshing…" : "Save Context"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {onUpdateInnovationStrategy ? (
        <div className="mt-5">
          <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: c.muted }}>
            Innovation Strategy
          </p>
          <p className="mb-3 font-sans text-[13px]" style={{ color: c.secondary }}>
            Select the strategy that best matches the opportunity landscape. This shapes how solutions should be framed and prioritized.
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {INNOVATION_STRATEGIES.map((s) => {
              const isSelected = currentStrategy === s.key;
              return (
                <button
                  key={s.key}
                  type="button"
                  disabled={savingStrategy}
                  onClick={async () => {
                    if (isSelected) return;
                    setSavingStrategy(true);
                    try {
                      await onUpdateInnovationStrategy(s.key);
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : "Failed to save strategy.");
                    } finally {
                      setSavingStrategy(false);
                    }
                  }}
                  className="border p-3 text-left transition-colors disabled:opacity-60"
                  style={{
                    borderColor: isSelected ? c.coral : c.line,
                    borderLeftWidth: isSelected ? 3 : 1,
                    background: isSelected ? "#FFF4EC" : c.card,
                  }}
                >
                  <p className="font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: isSelected ? c.coral : c.secondary }}>
                    {s.label}
                  </p>
                  <p className="mt-1 font-sans text-[11px] leading-[1.55]" style={{ color: c.secondary }}>
                    {s.desc}
                  </p>
                </button>
              );
            })}
          </div>
          {savingStrategy ? (
            <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: c.muted }}>
              Saving…
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function ProcessFidelitySection({
  marketDefinition,
  marketContext,
  customerJourney,
  activeCustomerJourneyTitle,
  needs,
  positioningCanvas,
}: {
  marketDefinition: OdiMarketDefinitionRow | null;
  marketContext?: string | null;
  customerJourney?: JourneyGroup | null;
  activeCustomerJourneyTitle?: string | null;
  needs: OdiNeedRow[];
  positioningCanvas?: PositioningCanvas | null;
}) {
  const market = safeText(marketContext, "No market context captured yet.");
  const storedExecutor = safeText(marketDefinition?.job_executor, "");
  const storedChooser = safeText(marketDefinition?.chooser, "");
  const derivedExecutor = audienceFromJourneyTitle(activeCustomerJourneyTitle);
  const derivedChooser = chooserFromJourneyTitle(activeCustomerJourneyTitle);
  const bestFitCustomers = safeText(positioningCanvas?.best_fit_customers, "");
  const inferredExecutor = inferRoleFromBestFitCustomers(bestFitCustomers, { chooser: false });
  const inferredChooser = inferRoleFromBestFitCustomers(bestFitCustomers, { chooser: true });
  const inferredRoles = inferRolesFromSignals({
    bestFitCustomers,
    valueForCustomer: positioningCanvas?.value_for_customer,
    marketContext,
    needs,
  });
  const executor = firstSpecificRole(
    isInvalidAudienceLabel(storedExecutor) ? "" : storedExecutor,
    isInvalidAudienceLabel(derivedExecutor) ? "" : derivedExecutor,
    inferredExecutor,
    inferredRoles.executor,
  );
  const resolvedExecutor = safeText(
    executor,
    safeText(inferredRoles.executor, "Primary job performer"),
  );
  const chooser = firstSpecificRole(
    isInvalidAudienceLabel(storedChooser) ? "" : storedChooser,
    isInvalidAudienceLabel(derivedChooser) ? "" : derivedChooser,
    inferredChooser,
    inferredRoles.chooser,
    isGenericRoleLabel(resolvedExecutor) ? "" : `${resolvedExecutor} decision owner`,
  );
  const resolvedChooser = safeText(
    chooser,
    safeText(inferredRoles.chooser, "Executive sponsor"),
  );
  const storedJtbd = safeText(marketDefinition?.jtbd, "");
  const derivedJtbd = jtbdFromJourneyTitle(activeCustomerJourneyTitle);
  const jtbd = deriveBestGuessJtbd({
    storedJtbd: isGenericJtbdStatement(storedJtbd) ? "" : storedJtbd,
    derivedJtbd: isGenericJtbdStatement(derivedJtbd) ? "" : derivedJtbd,
    executor: resolvedExecutor,
    needs,
    valueForCustomer: positioningCanvas?.value_for_customer,
  });
  const abstractedExecutor = deriveAbstractedExecutor(resolvedExecutor);
  const functionOfProduct = deriveFunctionOfProductStatement(jtbd, resolvedExecutor);
  const abstractedJob = deriveAbstractedJobStatement(jtbd, abstractedExecutor);
  const executorDetermination = deriveExecutorDetermination({
    activeCustomerJourneyTitle,
    marketDefinitionExecutor: marketDefinition?.job_executor,
    marketDefinitionChooser: marketDefinition?.chooser,
  });
  const otherProductsContextGroups = deriveOtherProductsContextGroups({
    marketContext: market,
    needs,
    positioningCanvas,
  });
  const canvasFields = deriveMarketDefinitionCanvas({
    traditionalMarketDefinition: market,
    executorDetermination,
    jobExecutor: resolvedExecutor,
    chooser: resolvedChooser,
    functionOfProductStatement: functionOfProduct,
    otherProductsContext: deriveOtherProductsContext(market, needs),
    abstractedJobStatement: abstractedJob,
    jtbd,
  });
  const customerSteps = Array.isArray(customerJourney?.steps) ? customerJourney?.steps : [];
  const customerStepByNumber = new Map<number, JobStepRow>();
  for (const step of customerSteps) {
    const stepNumber = Number(step.step_number);
    if (!Number.isFinite(stepNumber)) continue;
    const normalized = Math.max(1, Math.min(JTBD_CHECKPOINT_COUNT, Math.round(stepNumber)));
    if (!customerStepByNumber.has(normalized)) customerStepByNumber.set(normalized, step);
  }

  const rankedNeeds = needs
    .slice()
    .sort((a, b) => {
      const scoreDiff = (b.opportunity_score ?? 0) - (a.opportunity_score ?? 0);
      if (scoreDiff !== 0) return scoreDiff;
      const sortDiff = (a.sort_order ?? Number.MAX_SAFE_INTEGER) - (b.sort_order ?? Number.MAX_SAFE_INTEGER);
      if (sortDiff !== 0) return sortDiff;
      return String(a.id).localeCompare(String(b.id));
    })
    .slice(0, 12);

  return (
    <section
      style={{ borderTop: `1px solid ${c.line}`, paddingTop: 24, paddingBottom: 24 }}
    >
      <div className="mb-5">
        <h2 className="font-sans text-[24px] font-semibold" style={{ color: c.charcoal }}>
          Process Fidelity
        </h2>
        <p className="mt-1 max-w-5xl font-sans text-[14px]" style={{ color: c.secondary }}>
          This section translates current company evidence into a clear market definition canvas, an 8-checkpoint customer job spine, and Strategic Decision System needs linked to exact checkpoints.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="xl:col-span-5" style={{ borderLeft: `2px solid ${c.line}`, paddingLeft: 16 }}>
          <p className="font-mono text-[10px] uppercase tracking-[0.1em]" style={{ color: c.muted }}>
            Derived Market Definition Canvas
          </p>
          <div className="mt-3 space-y-3">
            {canvasFields.map((field) => (
              <div key={field.key} style={{ borderLeft: `2px solid ${c.line}`, paddingLeft: 10, paddingTop: 8, paddingBottom: 8 }}>
                <p className="font-mono text-[10px] uppercase tracking-[0.09em]" style={{ color: c.muted }}>
                  {field.label}
                </p>
                {field.key === "other_products_context" ? (
                  <div className="mt-2 space-y-2">
                    {otherProductsContextGroups.map((group, index) => (
                      <div
                        key={`${group.alternative}-${index}`}
                        style={{ borderLeft: `1px solid ${c.line}`, paddingLeft: 10, paddingTop: 6, paddingBottom: 6 }}
                      >
                        <p className="font-sans text-[13px] font-semibold leading-[1.35]" style={{ color: c.charcoal }}>
                          {group.alternative}
                        </p>
                        <p className="mt-1 font-sans text-[12px] leading-[1.55]" style={{ color: c.secondary }}>
                          {group.context}
                        </p>
                        <p className="mt-1 font-sans text-[11px] leading-[1.5]" style={{ color: c.muted }}>
                          Comparison pressure: {group.comparisonPressure}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-1 font-sans text-[13px] leading-[1.55]" style={{ color: c.secondary }}>
                    {field.value}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="xl:col-span-7" style={{ borderLeft: `2px solid ${c.line}`, paddingLeft: 16 }}>
          <p className="font-mono text-[10px] uppercase tracking-[0.1em]" style={{ color: c.muted }}>
            8-Checkpoint Spine
          </p>
          <p className="mt-1 font-sans text-[13px]" style={{ color: c.secondary }}>
            Customer map checkpoints are fixed at 1–8. Labels can be customized, but sequence cannot break.
          </p>

          <div className="mt-3 space-y-2">
            {JTBD_ODI_CHECKPOINTS.map((checkpoint) => {
              const row = customerStepByNumber.get(checkpoint.stepNumber);
              const evidenceStatus = safeText(row?.evidence_status, "unclear").toLowerCase();
              const statusLabel =
                evidenceStatus === "evidenced"
                  ? "Evidenced"
                  : evidenceStatus === "implied"
                    ? "Implied"
                    : row
                      ? "Unclear"
                      : "Missing";
              const statusTone =
                statusLabel === "Evidenced"
                  ? { bg: "#EEF6E7", border: "#BDD8CF", color: c.teal }
                  : statusLabel === "Implied"
                    ? { bg: "#EDF4F6", border: "#C4D7DE", color: c.slate }
                    : statusLabel === "Missing"
                      ? { bg: "#FFF4EC", border: "#F1C3AC", color: c.gap }
                      : { bg: "#F3F4EF", border: c.line, color: c.muted };
              const hasGap = row?.has_gap === true && !isDraftPlaceholderStep(row);
              return (
                <div
                  key={`checkpoint-${checkpoint.stepNumber}`}
                  style={{ borderBottom: `1px solid ${c.line}`, paddingTop: 10, paddingBottom: 10 }}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: c.muted }}>
                        Checkpoint {checkpoint.stepNumber} · {checkpoint.key.toUpperCase()}
                      </p>
                      <p className="mt-1 font-sans text-[15px] font-semibold leading-[1.35]" style={{ color: c.charcoal }}>
                        {isBareOdiStageLabel(row?.step_label) ? checkpoint.canonicalLabel : safeText(row?.step_label, checkpoint.canonicalLabel)}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className="font-mono text-[9px] uppercase tracking-[0.1em]"
                        style={{ color: statusTone.color }}
                      >
                        {statusLabel}
                      </span>
                      <span
                        className="font-mono text-[9px] uppercase tracking-[0.1em]"
                        style={{ color: hasGap ? c.gap : c.muted }}
                      >
                        {hasGap ? "Gap Flagged" : row ? "No Gap Flagged" : "Gap Unknown"}
                      </span>
                    </div>
                  </div>
                  <p className="mt-2 font-sans text-[13px] leading-[1.55]" style={{ color: c.secondary }}>
                    {safeText(row?.description, checkpoint.description)}
                  </p>
                  <p className="mt-1 font-sans text-[12px] leading-[1.5]" style={{ color: c.muted }}>
                    Evidence: {safeText(row?.evidence_basis, "No evidence rationale recorded yet.")}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="mt-4" style={{ borderLeft: `2px solid ${c.line}`, paddingLeft: 16 }}>
        <p className="font-mono text-[10px] uppercase tracking-[0.1em]" style={{ color: c.muted }}>
          <SdsTerm short />{" "}Needs Linked To Checkpoints
        </p>
        <p className="mt-1 font-sans text-[13px]" style={{ color: c.secondary }}>
          Needs stay ranked by opportunity score and always show the checkpoint anchor used to evaluate the checkpoint map.
        </p>
        {rankedNeeds.length === 0 ? (
          <p className="mt-3 font-sans text-[13px]" style={{ color: c.secondary }}>
            No Strategic Decision System needs are available yet.
          </p>
        ) : (
          <div className="mt-3 space-y-2">
            {rankedNeeds.map((need, index) => {
              const stepNumber = Number(need.step_number);
              const anchorNumber = Number.isFinite(stepNumber)
                ? Math.max(1, Math.min(JTBD_CHECKPOINT_COUNT, Math.round(stepNumber)))
                : 1;
              const rawStepLabelFromNeed = isBareOdiStageLabel(need.step_label) ? "" : safeText(need.step_label, "");
              const rawStepLabelFromStep = customerStepByNumber.get(anchorNumber)?.step_label;
              const resolvedStepLabel = isBareOdiStageLabel(rawStepLabelFromStep) ? "" : safeText(rawStepLabelFromStep, "");
              const stepLabel = rawStepLabelFromNeed || resolvedStepLabel || JTBD_ODI_CHECKPOINTS[anchorNumber - 1].canonicalLabel;
              return (
                <div
                  key={need.id}
                  style={{ borderBottom: `1px solid ${c.line}`, paddingTop: 10, paddingBottom: 10 }}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: c.muted }}>
                      Rank {String(index + 1).padStart(2, "0")} · Checkpoint {anchorNumber} · {stepLabel}
                    </p>
                    <p className="font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: c.secondary }}>
                      Opp {formatNeedScore(need.opportunity_score)} · I {need.importance} · S {need.satisfaction}
                    </p>
                  </div>
                  <p className="mt-1 font-sans text-[14px] leading-[1.5]" style={{ color: c.charcoal }}>
                    {need.desired_outcome}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

function OdiNeedsListSection({
  companyId,
  needs,
  onRemoveNeed,
  removingNeedId,
  onRemovePublicNeeds,
  removingPublicNeeds,
  onReorderNeeds,
  reorderingNeeds,
  onUpdateNeedText,
  updatingNeedId,
  onUpdateNeedScores,
  currentPhase,
  hasPrimaryEvidence,
  needsTensions = [],
}: {
  companyId?: string;
  needs: OdiNeedRow[];
  onRemoveNeed?: (needId: string) => void;
  removingNeedId?: string | null;
  onRemovePublicNeeds?: () => void;
  removingPublicNeeds?: boolean;
  onReorderNeeds?: (orderedNeedIds: string[]) => Promise<void>;
  reorderingNeeds?: boolean;
  onUpdateNeedText?: (needId: string, values: { desired_outcome: string }) => Promise<void>;
  updatingNeedId?: string | null;
  onUpdateNeedScores?: (needId: string, importance: number, satisfaction: number) => Promise<void>;
  currentPhase?: import("@/lib/engagementPhase").EngagementPhase;
  hasPrimaryEvidence?: boolean;
  needsTensions?: StrategicTension[];
}) {
  type NeedOrderMode = "suggested" | "custom";
  const hasManualNeedOverride = (rows: OdiNeedRow[]) =>
    rows.some((row) =>
      Array.isArray(row.frameworks_used) &&
      row.frameworks_used.some((flag) => String(flag || "").trim().toLowerCase() === "manual_override"),
    );
  const sortNeedItems = (rows: OdiNeedRow[]) => [...rows].sort((a, b) => {
    const aSort = Number.isFinite(Number(a.sort_order)) ? Number(a.sort_order) : Number.MAX_SAFE_INTEGER;
    const bSort = Number.isFinite(Number(b.sort_order)) ? Number(b.sort_order) : Number.MAX_SAFE_INTEGER;
    if (aSort !== bSort) return aSort - bSort;
    const scoreDiff = (b.opportunity_score ?? 0) - (a.opportunity_score ?? 0);
    if (scoreDiff !== 0) return scoreDiff;
    return (b.importance ?? 0) - (a.importance ?? 0);
  });
  const sortSuggestedItems = (rows: OdiNeedRow[]) => [...rows].sort((a, b) => {
    const scoreDiff = (b.opportunity_score ?? 0) - (a.opportunity_score ?? 0);
    if (scoreDiff !== 0) return scoreDiff;
    const importanceDiff = (b.importance ?? 0) - (a.importance ?? 0);
    if (importanceDiff !== 0) return importanceDiff;
    const satisfactionDiff = (a.satisfaction ?? 0) - (b.satisfaction ?? 0);
    if (satisfactionDiff !== 0) return satisfactionDiff;
    return String(a.id).localeCompare(String(b.id));
  });
  const [needItems, setNeedItems] = useState<OdiNeedRow[]>(() =>
    hasManualNeedOverride(needs) ? sortNeedItems(needs) : sortSuggestedItems(needs),
  );
  const [orderMode, setOrderMode] = useState<NeedOrderMode>(() =>
    hasManualNeedOverride(needs) ? "custom" : "suggested",
  );
  const [inspectNeed, setInspectNeed] = useState<OdiNeedRow | null>(null);
  const { claims: claimsMap } = useCompanyClaims(companyId);
  const [draggingNeedId, setDraggingNeedId] = useState<string | null>(null);
  const [dragOverNeedId, setDragOverNeedId] = useState<string | null>(null);
  const [editingNeedId, setEditingNeedId] = useState<string | null>(null);
  const [needDrafts, setNeedDrafts] = useState<Record<string, string>>({});
  const [scoreDrafts, setScoreDrafts] = useState<Record<string, { importance: number; satisfaction: number }>>({});
  const [savingScoresId, setSavingScoresId] = useState<string | null>(null);
  const customLabelStorageKey = companyId ? `odi-needs-custom-label:${companyId}` : null;
  const [customLabel, setCustomLabel] = useState("Custom");
  const [customLabelDraft, setCustomLabelDraft] = useState("Custom");
  const [isRenamingCustomLabel, setIsRenamingCustomLabel] = useState(false);
  const reorderNeedItems = (items: OdiNeedRow[], fromId: string, toId: string) => {
    const fromIndex = items.findIndex((item) => item.id === fromId);
    const toIndex = items.findIndex((item) => item.id === toId);
    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return items;
    const next = [...items];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    return next.map((item, index) => ({ ...item, sort_order: index + 1 }));
  };

  useEffect(() => {
    const useCustomOrder = hasManualNeedOverride(needs);
    setNeedItems(useCustomOrder ? sortNeedItems(needs) : sortSuggestedItems(needs));
    setOrderMode((current) => (useCustomOrder ? current : "suggested"));
    setDraggingNeedId(null);
    setDragOverNeedId(null);
    setEditingNeedId(null);
  }, [needs]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!customLabelStorageKey) {
      setCustomLabel("Custom");
      setCustomLabelDraft("Custom");
      return;
    }
    const stored = window.localStorage.getItem(customLabelStorageKey);
    const nextLabel = String(stored || "").trim() || "Custom";
    setCustomLabel(nextLabel);
    setCustomLabelDraft(nextLabel);
  }, [customLabelStorageKey]);

  const suggestedItems = useMemo(() => sortSuggestedItems(needs), [needs]);
  const suggestedOrderIds = suggestedItems.map((item) => item.id);

  const underservedNeeds = useMemo(() => suggestedItems.filter((n) => n.service_state === "under_served"), [suggestedItems]);
  const overservedNeeds  = useMemo(() => suggestedItems.filter((n) => n.service_state === "over_served"),  [suggestedItems]);
  const highScoreNeeds   = useMemo(() => suggestedItems.filter((n) => (n.opportunity_score ?? 0) >= 10),   [suggestedItems]);
  const topPriorityNeed  = suggestedItems[0] ?? null;

  const needsEditorialHeadline = needs.length === 0
    ? "No customer needs loaded yet."
    : underservedNeeds.length > 0
      ? `${underservedNeeds.length} underserved ${underservedNeeds.length === 1 ? "need" : "needs"} identified.`
      : highScoreNeeds.length > 0
        ? `${highScoreNeeds.length} high-priority ${highScoreNeeds.length === 1 ? "need" : "needs"} — score above threshold.`
        : `${needs.length} customer ${needs.length === 1 ? "need" : "needs"} mapped — no critical gaps at this threshold.`;

  const needsEditorialContext = underservedNeeds.length > 0 && overservedNeeds.length > 0
    ? `${underservedNeeds.length} under-served and ${overservedNeeds.length} over-served — review allocation balance.`
    : underservedNeeds.length > 0
      ? `Focus on ${underservedNeeds.length} under-served ${underservedNeeds.length === 1 ? "outcome" : "outcomes"} before broadening scope.`
      : overservedNeeds.length > 0
        ? `${overservedNeeds.length} over-served ${overservedNeeds.length === 1 ? "outcome" : "outcomes"} — may indicate misallocated effort.`
        : "Customer reality is relatively balanced — monitor for shifts.";
  const customOrderIds = needItems.map((item) => item.id);
  const needNumberById = useMemo(
    () =>
      new Map<string, string>(
        suggestedItems.map((item, index) => [item.id, String(index + 1).padStart(3, "0")]),
      ),
    [suggestedItems],
  );
  const hasCustomOrder =
    hasManualNeedOverride(needs) ||
    suggestedOrderIds.length === customOrderIds.length &&
    suggestedOrderIds.some((id, index) => customOrderIds[index] !== id);
  const visibleNeedItems = orderMode === "suggested" ? suggestedItems : needItems;
  const customOrderLabel = customLabel.trim() || "Custom";

  const publicNeedCount = visibleNeedItems.filter((item) => isPublicSourcePath(item.source_path)).length;

  return (
    <section
      style={{ borderTop: `1px solid ${c.line}`, paddingTop: 24, paddingBottom: 24 }}
    >
      <div>
        <div>
          <div className="mb-5">

            {/* ── EDITORIAL NEEDS STATE ──────────────────────────────── */}
            <div style={{ paddingBottom: 20, marginBottom: 20, borderBottom: `2px solid ${c.line}` }}>
              <p className="font-mono text-[10px] uppercase tracking-[0.18em]" style={{ color: c.muted }}>
                Customer needs · {needs.length} total
              </p>
              <h2 className="mt-3 font-sans font-semibold leading-[1.25] max-w-2xl" style={{ fontSize: 36, color: c.charcoal }}>
                {needsEditorialHeadline}
              </h2>
              <p className="mt-2 font-sans text-[14px] leading-[1.5] max-w-xl" style={{ color: c.secondary }}>
                {needsEditorialContext}
              </p>
              <p className="mt-3 font-mono text-[10px]" style={{ color: c.muted }}>
                Customer research: {hasPrimaryEvidence ? "active" : "incomplete"} · {underservedNeeds.length + overservedNeeds.length > 0 ? `${underservedNeeds.length} under · ${overservedNeeds.length} over` : "no service-state gaps"}
              </p>
              {(underservedNeeds.length > 0 || overservedNeeds.length > 0) && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {underservedNeeds.length > 0 && (
                    <span className="font-mono text-[9px] uppercase tracking-[0.14em] px-2 py-[3px]" style={{ border: `1px solid ${c.coral}`, color: c.coral }}>
                      {underservedNeeds.length} underserved
                    </span>
                  )}
                  {overservedNeeds.length > 0 && (
                    <span className="font-mono text-[9px] uppercase tracking-[0.14em] px-2 py-[3px]" style={{ border: `1px solid ${c.line}`, color: c.muted }}>
                      {overservedNeeds.length} overserved
                    </span>
                  )}
                </div>
              )}
              {topPriorityNeed && (
                <div className="mt-4" style={{ borderLeft: `3px solid ${c.coral}`, paddingLeft: 14 }}>
                  <p className="mb-1 font-mono text-[9px] uppercase tracking-[0.14em]" style={{ color: c.coral }}>Top priority</p>
                  <p className="font-sans text-[15px] font-semibold leading-[1.4]" style={{ color: c.charcoal }}>
                    {topPriorityNeed.desired_outcome}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-3">
                    {topPriorityNeed.opportunity_score != null && (
                      <span className="font-mono text-[9px] uppercase tracking-[0.08em]" style={{ color: c.muted }}>
                        Score {topPriorityNeed.opportunity_score}
                      </span>
                    )}
                    {topPriorityNeed.importance != null && (
                      <span className="font-mono text-[9px] uppercase tracking-[0.08em]" style={{ color: c.muted }}>
                        Importance {topPriorityNeed.importance}
                      </span>
                    )}
                    {topPriorityNeed.service_state === "under_served" && (
                      <span className="font-mono text-[9px] uppercase tracking-[0.08em]" style={{ color: c.coral }}>Underserved</span>
                    )}
                  </div>
                </div>
              )}
              {needsTensions.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <TensionBlock tensions={needsTensions} context="needs" showBlockerCallout={false} />
                </div>
              )}
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setOrderMode("suggested")}
                className="font-mono text-[10px] uppercase tracking-[0.08em]"
                style={{
                  background: "none", border: "none", cursor: "pointer", padding: "6px 0 8px",
                  color: orderMode === "suggested" ? c.charcoal : c.muted,
                  borderBottom: orderMode === "suggested" ? `2px solid ${c.coral}` : "2px solid transparent",
                  marginBottom: -1,
                }}
              >
                Generated
              </button>
              <button
                type="button"
                onClick={() => setOrderMode("custom")}
                className="font-mono text-[10px] uppercase tracking-[0.08em]"
                style={{
                  background: "none", border: "none", cursor: "pointer", padding: "6px 0 8px",
                  color: orderMode === "custom" ? c.charcoal : c.muted,
                  borderBottom: orderMode === "custom" ? `2px solid ${c.teal}` : "2px solid transparent",
                  marginBottom: -1,
                }}
              >
                {customOrderLabel}
              </button>
              {hasCustomOrder ? (
                <MetaBadge>{customOrderLabel} saved</MetaBadge>
              ) : (
                <MetaBadge>Using generated order</MetaBadge>
              )}
              <button
                type="button"
                onClick={() => {
                  setCustomLabelDraft(customOrderLabel);
                  setIsRenamingCustomLabel((current) => !current);
                }}
                className="font-mono text-[10px] uppercase tracking-[0.08em] underline"
                style={{ color: c.muted, background: "none", border: "none", cursor: "pointer", padding: 0 }}
              >
                {isRenamingCustomLabel ? "Close Rename" : "Rename Custom"}
              </button>
            </div>
            {isRenamingCustomLabel ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <input
                  value={customLabelDraft}
                  onChange={(event) => setCustomLabelDraft(event.target.value)}
                  className="w-full max-w-[260px] rounded-lg border px-2.5 py-2 font-sans text-[12px] outline-none"
                  style={{ borderColor: c.line, color: c.charcoal, background: "#fff" }}
                  placeholder="Custom"
                />
                <button
                  type="button"
                  onClick={() => {
                    const nextLabel = customLabelDraft.trim() || "Custom";
                    setCustomLabel(nextLabel);
                    setCustomLabelDraft(nextLabel);
                    setIsRenamingCustomLabel(false);
                    if (typeof window !== "undefined" && customLabelStorageKey) {
                      window.localStorage.setItem(customLabelStorageKey, nextLabel);
                    }
                  }}
                  className="font-mono text-[10px] uppercase tracking-[0.08em] underline"
                  style={{ color: c.teal, background: "none", border: "none", cursor: "pointer", padding: 0 }}
                >
                  Save Name
                </button>
              </div>
            ) : null}
            <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: c.muted }}>
              {orderMode === "suggested"
                ? "Viewing generated rank"
                : reorderingNeeds
                  ? "Saving your order…"
                  : `Drag needs to reorder ${customOrderLabel.toLowerCase()}`}
            </p>
            {publicNeedCount > 0 && onRemovePublicNeeds ? (
              <div className="mt-3">
                <button
                  type="button"
                  onClick={onRemovePublicNeeds}
                  disabled={!!removingPublicNeeds}
                  className="font-mono text-[10px] uppercase tracking-[0.08em] underline disabled:opacity-50"
                  style={{ color: c.coral, background: "none", border: "none", cursor: "pointer", padding: 0 }}
                >
                  {removingPublicNeeds ? "Removing…" : `Remove Public Needs (${publicNeedCount})`}
                </button>
              </div>
            ) : null}
          </div>

          {visibleNeedItems.length === 0 ? (
            <p className="font-sans text-[13px]" style={{ color: c.secondary }}>
              No Strategic Decision System needs identified yet from current evidence.
            </p>
          ) : (
            <div className="space-y-4">
              {visibleNeedItems.map((item) => (
                <div
                  key={item.id}
                  draggable={orderMode === "custom" && !reorderingNeeds && editingNeedId !== item.id}
                  onDragStart={() => {
                    if (orderMode !== "custom" || reorderingNeeds || editingNeedId === item.id) return;
                    setDraggingNeedId(item.id);
                  }}
                  onDragOver={(event) => {
                    if (orderMode !== "custom" || reorderingNeeds || !draggingNeedId || draggingNeedId === item.id) return;
                    event.preventDefault();
                    setDragOverNeedId(item.id);
                  }}
                  onDrop={async (event) => {
                    event.preventDefault();
                    if (orderMode !== "custom" || !onReorderNeeds || reorderingNeeds || !draggingNeedId || draggingNeedId === item.id) {
                      setDragOverNeedId(null);
                      return;
                    }
                    const next = reorderNeedItems(needItems, draggingNeedId, item.id);
                    setNeedItems(next);
                    setDraggingNeedId(null);
                    setDragOverNeedId(null);
                    try {
                      await onReorderNeeds(next.map((entry) => entry.id));
                    } catch (err) {
                      setNeedItems(sortNeedItems(needs));
                      toast.error(err instanceof Error ? err.message : "Failed to reorder needs.");
                    }
                  }}
                  onDragEnd={() => {
                    setDraggingNeedId(null);
                    setDragOverNeedId(null);
                  }}
                  style={{
                    borderBottom: `1px solid ${c.lineFaint}`,
                    background: dragOverNeedId === item.id ? "#FFF4EC" : "transparent",
                    cursor: orderMode !== "custom" || reorderingNeeds ? "default" : "grab",
                    opacity: draggingNeedId === item.id ? 0.72 : 1,
                  }}
                >
                  {(() => {
                    const actionLabel = opportunityActionFromNeedScore(item.opportunity_score);
                    const actionTone = opportunityActionTone(actionLabel);
                    const stepContext = item.step_number ? `Checkpoint ${item.step_number}` : "Checkpoint —";
                    const stepDetail = item.step_label ? ` · ${item.step_label}` : "";
                    const oppScore = item.opportunity_score ?? 0;
                    const needPressure = oppScore >= 14 ? "high" : oppScore >= 6 ? "medium" : "low";
                    return (
                      <>
                        <div style={{
                          paddingTop: needPressure === "high" ? 22 : needPressure === "medium" ? 16 : 12,
                          paddingBottom: needPressure === "high" ? 18 : needPressure === "medium" ? 12 : 10,
                          opacity: needPressure === "low" ? 0.75 : 1,
                        }}>
                          <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
                            <div className="min-w-0">
                              <div className="mb-2 flex items-center gap-2">
                                <span
                                  className="shrink-0 w-9 font-mono text-[11px] uppercase tracking-[0.08em] text-left"
                                  style={{ color: c.secondary }}
                                  title="Stable need number based on suggested priority"
                                >
                                  {needNumberById.get(item.id) || "—"}
                                </span>
                                <span className="font-mono text-[10px] uppercase tracking-[0.08em] whitespace-nowrap" style={{ color: c.secondary }}>
                                  {titleCaseJourney(item.journey_key)} · {stepContext}
                                </span>
                              </div>
                            </div>
                            <div className="shrink-0">
                              <p className="font-mono text-[10px] uppercase tracking-[0.06em] whitespace-nowrap text-right" style={{ color: c.secondary }}>
                                Opp Score {formatNeedScore(item.opportunity_score)}
                              </p>
                            </div>
                          </div>

                          {editingNeedId === item.id ? (
                            <textarea
                              value={needDrafts[item.id] ?? item.desired_outcome}
                              onChange={(event) =>
                                setNeedDrafts((current) => ({ ...current, [item.id]: event.target.value }))
                              }
                              className="min-h-[84px] w-full rounded-lg border px-2.5 py-2 font-sans text-[13px] leading-[1.5] outline-none"
                              style={{ borderColor: c.line, color: c.charcoal, background: "#fff" }}
                              placeholder="Desired outcome"
                            />
                          ) : (
                            <p className="font-sans leading-[1.5]" style={{
                              fontSize: needPressure === "high" ? 18 : needPressure === "medium" ? 17 : 15,
                              fontWeight: needPressure === "high" ? 600 : 500,
                              color: c.charcoal,
                            }}>
                              {item.desired_outcome}
                            </p>
                          )}

                          <p className="mt-2 font-sans text-[12px]" style={{ color: c.secondary }}>
                            <span className="font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: c.muted }}>
                              Job checkpoint context:
                            </span>{" "}
                            {stepContext}
                            {stepDetail}
                          </p>

                          <div className="mt-3 border-t pt-2" style={{ borderColor: c.lineFaint }}>
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex min-w-0 flex-wrap items-center gap-2">
                                <NeedActionBadge label={actionLabel} />
                                <StateBadge tone={item.service_state} />
                                <MetaBadge>{sourcePathLabel(item.source_path)}</MetaBadge>
                                {(() => {
                                  const claim = claimsMap.get(item.id);
                                  return claim ? <ClaimStateBadge state={claim.state} claimId={item.id} size="sm" /> : null;
                                })()}
                              </div>
                              {onUpdateNeedScores ? (() => {
                                const draft = scoreDrafts[item.id];
                                const curImp = draft?.importance ?? (item.importance ?? 5);
                                const curSat = draft?.satisfaction ?? (item.satisfaction ?? 5);
                                const isDirty = draft !== undefined && (draft.importance !== (item.importance ?? 5) || draft.satisfaction !== (item.satisfaction ?? 5));
                                return (
                                  <div className="flex items-center gap-2">
                                    <div className="flex flex-col gap-1">
                                      <div className="flex items-center gap-1.5">
                                        <span className="font-mono text-[9px] uppercase tracking-[0.08em] w-5" style={{ color: c.muted }}>I</span>
                                        <input
                                          type="range"
                                          min={0}
                                          max={10}
                                          step={1}
                                          value={curImp}
                                          className="h-1 w-[80px] cursor-pointer accent-current"
                                          style={{ accentColor: c.coral }}
                                          onChange={(e) => setScoreDrafts((prev) => ({ ...prev, [item.id]: { importance: Number(e.target.value), satisfaction: curSat } }))}
                                        />
                                        <span className="font-mono text-[10px] w-4 text-right" style={{ color: c.charcoal }}>{curImp}</span>
                                      </div>
                                      <div className="flex items-center gap-1.5">
                                        <span className="font-mono text-[9px] uppercase tracking-[0.08em] w-5" style={{ color: c.muted }}>S</span>
                                        <input
                                          type="range"
                                          min={0}
                                          max={10}
                                          step={1}
                                          value={curSat}
                                          className="h-1 w-[80px] cursor-pointer"
                                          style={{ accentColor: c.teal }}
                                          onChange={(e) => setScoreDrafts((prev) => ({ ...prev, [item.id]: { importance: curImp, satisfaction: Number(e.target.value) } }))}
                                        />
                                        <span className="font-mono text-[10px] w-4 text-right" style={{ color: c.charcoal }}>{curSat}</span>
                                      </div>
                                    </div>
                                    {isDirty ? (
                                      <button
                                        type="button"
                                        disabled={savingScoresId === item.id}
                                        onClick={async () => {
                                          setSavingScoresId(item.id);
                                          try {
                                            await onUpdateNeedScores(item.id, curImp, curSat);
                                            setScoreDrafts((prev) => {
                                              const next = { ...prev };
                                              delete next[item.id];
                                              return next;
                                            });
                                          } finally {
                                            setSavingScoresId(null);
                                          }
                                        }}
                                        className="rounded-full border px-2 py-1 font-mono text-[9px] uppercase tracking-[0.08em] disabled:opacity-50"
                                        style={{ borderColor: c.line, color: "#1F6A5B", background: "#EEF6E7" }}
                                      >
                                        {savingScoresId === item.id ? "…" : "Save"}
                                      </button>
                                    ) : null}
                                  </div>
                                );
                              })() : (
                                <p className="font-mono text-[10px] uppercase tracking-[0.08em] whitespace-nowrap" style={{ color: c.secondary }}>
                                  I {item.importance ?? "—"} · S {item.satisfaction ?? "—"}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      </>
                    );
                  })()}
                  <div className="px-4 pb-4">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setInspectNeed(item)}
                        className="font-mono text-[10px] underline"
                        style={{ color: c.muted, background: "none", border: "none", cursor: "pointer", padding: 0 }}
                      >
                        Inspect why →
                      </button>
                      <div className="ml-auto flex gap-2">
                      {onRemoveNeed ? (
                        <>
                          {editingNeedId === item.id ? (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingNeedId(null);
                                  setNeedDrafts((current) => {
                                    const next = { ...current };
                                    delete next[item.id];
                                    return next;
                                  });
                                }}
                                disabled={updatingNeedId === item.id}
                                className="font-mono text-[10px] uppercase tracking-[0.08em] underline disabled:opacity-50"
                                style={{ color: c.muted, background: "none", border: "none", cursor: "pointer", padding: 0 }}
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                onClick={async () => {
                                  if (!onUpdateNeedText) return;
                                  const draftValue = String(needDrafts[item.id] ?? item.desired_outcome).trim();
                                  if (!draftValue) {
                                    toast.error("Need text cannot be empty.");
                                    return;
                                  }
                                  try {
                                    await onUpdateNeedText(item.id, { desired_outcome: draftValue });
                                    setNeedItems((current) =>
                                      current.map((row) =>
                                        row.id === item.id ? { ...row, desired_outcome: draftValue } : row,
                                      ),
                                    );
                                    setEditingNeedId(null);
                                    setNeedDrafts((current) => {
                                      const next = { ...current };
                                      delete next[item.id];
                                      return next;
                                    });
                                    toast.success("Need updated.");
                                  } catch (err) {
                                    toast.error(err instanceof Error ? err.message : "Failed to update need.");
                                  }
                                }}
                                disabled={updatingNeedId === item.id}
                                className="font-mono text-[10px] uppercase tracking-[0.08em] underline disabled:opacity-50"
                                style={{ color: c.teal, background: "none", border: "none", cursor: "pointer", padding: 0 }}
                              >
                                {updatingNeedId === item.id ? "Saving…" : "Save"}
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingNeedId(item.id);
                                setNeedDrafts((current) => ({
                                  ...current,
                                  [item.id]: current[item.id] ?? item.desired_outcome,
                                }));
                              }}
                              disabled={updatingNeedId === item.id}
                              className="font-mono text-[10px] uppercase tracking-[0.08em] underline disabled:opacity-50"
                              style={{ color: c.muted, background: "none", border: "none", cursor: "pointer", padding: 0 }}
                            >
                              Edit
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => onRemoveNeed(item.id)}
                            disabled={removingNeedId === item.id || updatingNeedId === item.id}
                            className="font-mono text-[10px] uppercase tracking-[0.08em] underline disabled:opacity-50"
                            style={{ color: c.coral, background: "none", border: "none", cursor: "pointer", padding: 0 }}
                          >
                            {removingNeedId === item.id ? "Removing…" : "Remove Need"}
                          </button>
                        </>
                      ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <NeedInspectPanel
        open={!!inspectNeed}
        onClose={() => setInspectNeed(null)}
        need={inspectNeed}
        currentPhase={currentPhase}
      />
    </section>
  );
}

function JourneySection({
  journey,
  onRemove,
  removing,
  onUpdateStepText,
  updatingStepId,
}: {
  journey: JourneyGroup;
  onRemove: (key: JourneyKey) => void;
  removing: boolean;
  onUpdateStepText: (stepId: string, values: { step_label: string; description: string }) => Promise<void>;
  updatingStepId: string | null;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const style = JOURNEY_STYLE[journey.key] ?? fallbackStyleForJourney(journey.key);
  const { rail, dot, preview } = style;
  const designedCount = journey.steps.filter((step) => step.designed).length;
  const evidencedCount = journey.steps.filter((step) => step.evidence_status === "evidenced").length;
  const gapsCount = journey.steps.filter((step) => hasAssessedGap(step)).length;
  const pendingAssessmentCount = journey.steps.filter((step) => isDraftPlaceholderStep(step)).length;

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const checkScroll = () => {
      setCanScrollLeft(el.scrollLeft > 4);
      setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
    };

    checkScroll();
    el.addEventListener("scroll", checkScroll);
    window.addEventListener("resize", checkScroll);

    return () => {
      el.removeEventListener("scroll", checkScroll);
      window.removeEventListener("resize", checkScroll);
    };
  }, [journey.steps.length]);

  const scrollByCards = (direction: -1 | 1) => {
    scrollRef.current?.scrollBy({ left: direction * 340, behavior: "smooth" });
  };

  return (
    <section
      style={{
        borderTop: `1px solid ${c.line}`,
        background: "transparent",
      }}
    >
      <div className="h-full w-[6px]" style={{ background: rail, float: "left" }} />
      <div className="ml-[6px] px-6 py-6">
        <div className="mb-3 flex items-start justify-between gap-4">
          <div>
            {preview ? (
              <div
                className="mb-2 inline-flex rounded-sm px-2 py-1 font-mono text-[10px] uppercase tracking-[0.08em]"
                style={{ background: "#2c2925", color: "#fff" }}
              >
                {preview}
              </div>
            ) : null}
            <h2 className="font-sans text-[24px] font-semibold leading-tight" style={{ color: c.charcoal }}>
              {journey.title}
            </h2>
            {!isGenericJourneySubtitle(journey.subtitle) && (
              <p className="mt-1 max-w-4xl font-sans text-[14px]" style={{ color: c.secondary }}>
                {journey.subtitle}
              </p>
            )}
          </div>

          <div className="mt-1 flex items-center gap-5 whitespace-nowrap">
            <span className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.08em]" style={{ color: c.secondary }}>
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: c.designedDot }} />
              {designedCount} designed
            </span>
            <span className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.08em]" style={{ color: c.secondary }}>
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: c.teal }} />
              {evidencedCount} evidenced
            </span>
            <span className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.08em]" style={{ color: c.secondary }}>
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: c.gap }} />
              {gapsCount} gaps
            </span>
            <span className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.08em]" style={{ color: c.secondary }}>
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: c.muted }} />
              {pendingAssessmentCount} pending
            </span>
            <button
              type="button"
              onClick={() => onRemove(journey.key)}
              disabled={removing}
              className="font-mono text-[10px] uppercase tracking-[0.08em] underline disabled:opacity-50"
              style={{ color: c.muted, background: "none", border: "none", cursor: "pointer", padding: 0 }}
            >
              {removing ? "Removing…" : "Remove Map"}
            </button>
          </div>
        </div>

        <div className="relative mt-1">
          {canScrollLeft ? (
            <button
              type="button"
              aria-label="Scroll left"
              onClick={() => scrollByCards(-1)}
              className="absolute left-2 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border"
              style={{ background: c.card, borderColor: c.line, color: c.secondary }}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          ) : null}

          <div ref={scrollRef} className="overflow-x-auto pb-1">
            <div className="inline-block min-w-full">
              <TimelineRow steps={journey.steps} color={dot} />

              <div className="flex gap-3 px-5">
              {journey.steps.map((step) => (
                <StepCard
                  key={step.id}
                  step={step}
                  onSaveText={onUpdateStepText}
                  saving={updatingStepId === step.id}
                />
              ))}
              </div>
            </div>
          </div>

          {canScrollRight ? (
            <button
              type="button"
              aria-label="Scroll right"
              onClick={() => scrollByCards(1)}
              className="absolute right-2 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border"
              style={{ background: c.card, borderColor: c.line, color: c.secondary }}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function SuggestedMapsSection({
  options,
  drafts,
  onDraftChange,
  onAddMap,
  runningKey,
}: {
  options: SuggestedJourneyOption[];
  drafts: JourneyDraftMap;
  onDraftChange: (key: string, field: "title" | "subtitle", value: string) => void;
  onAddMap: (key: string) => void;
  runningKey: string | null;
}) {
  if (options.length === 0) return null;

  return (
    <section
      style={{ borderTop: `1px solid ${c.line}`, paddingTop: 24, paddingBottom: 24 }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-sans text-[18px] font-semibold" style={{ color: c.charcoal }}>
            Choose Checkpoint Maps
          </p>
          <p className="mt-1 font-sans text-[13px]" style={{ color: c.secondary }}>
            Add maps one at a time. You can edit title/subtitle first, then click add.
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
        {options.map((option) => (
          <div
            key={option.key}
            style={{ borderLeft: `2px solid ${c.line}`, paddingLeft: 14, paddingTop: 12, paddingBottom: 12 }}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <MetaBadge>{titleCaseJourney(option.key)}</MetaBadge>
              <ScoreChip label="Confidence" value={option.confidence} />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <MetaBadge>Public signal</MetaBadge>
            </div>
            <p
              className="mt-2 font-sans text-[16px] font-semibold leading-[1.3] break-words"
              style={{ color: c.charcoal }}
              title={drafts[option.key]?.title || option.title}
            >
              {drafts[option.key]?.title || option.title}
            </p>
            <p
              className="mt-1 font-sans text-[12px] leading-[1.55] break-words"
              style={{ color: c.secondary }}
              title={option.rationale}
            >
              {option.rationale}
            </p>
            <div className="mt-3 grid grid-cols-1 gap-2">
              <input
                value={drafts[option.key]?.title || option.title}
                onChange={(event) => onDraftChange(option.key, "title", event.target.value)}
                className="w-full rounded-lg border px-2.5 py-2 font-sans text-[12px] outline-none"
                style={{ borderColor: c.line, color: c.charcoal, background: "#fff" }}
                placeholder="Map title"
              />
              <textarea
                value={drafts[option.key]?.subtitle || option.subtitle}
                onChange={(event) => onDraftChange(option.key, "subtitle", event.target.value)}
                className="min-h-[62px] w-full rounded-lg border px-2.5 py-2 font-sans text-[12px] outline-none"
                style={{ borderColor: c.line, color: c.secondary, background: "#fff" }}
                placeholder="Map subtitle"
              />
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <span />
              <button
                type="button"
                onClick={() => onAddMap(option.key)}
                disabled={runningKey !== null}
                className="border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.08em] disabled:opacity-50"
                style={{ borderColor: c.line, color: c.secondary, background: c.card }}
              >
                {runningKey === option.key ? "Adding…" : "Add Map"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function JobStepsView() {
  const { activeCompany } = useCompany();
  const auditMode = isGenericAuditCompany(activeCompany);
  const activeCompanyId = activeCompany?.id ?? null;
  const {
    loading,
    items,
    error,
    updatingStepId,
    updateStepText,
    removingJourneyKey,
    removeJourneyMap,
    refetch: refetchJobSteps,
  } = useJobSteps(activeCompanyId ?? undefined);
  const { run: baselineRun, refetch: refetchBaseline } = usePublicBaseline(activeCompanyId ?? undefined);
  const { item: strategyCascade } = useStrategyCascade(activeCompanyId ?? undefined);
  const { item: positioningCanvas } = usePositioningCanvas(activeCompanyId ?? undefined);
  const { items: strategicProblems } = useStrategicProblems(activeCompanyId ?? undefined);
  const { query: inputsQuery } = useInputs(activeCompanyId ?? undefined);
  const [odiRefreshKey, setOdiRefreshKey] = useState(0);
  const { marketDefinition, needs, error: odiError, updateNeedScores, updateMarketDefinition } = useOdiNeeds(activeCompanyId ?? undefined, odiRefreshKey);
  const { data: localAlignment } = useLatestLocalAlignment(activeCompanyId ?? undefined);
  const runLocalAlignment = useRunLocalAlignment(activeCompanyId ?? undefined);
  const { signals: sourceSignals } = useSourceConfidence({
    companyId: activeCompanyId ?? undefined,
    areaScoresJson: activeCompany?.area_scores_json,
    evidenceStatus: activeCompany?.evidence_status,
  });
  const allNeedsTensions = useMemo(
    () => deriveStrategicTensions({ needs, sourceSignals }),
    [needs, sourceSignals],
  );
  const needsTensions = filterTensionsForContext(allNeedsTensions, "needs", 3);
  const [journeyDrafts, setJourneyDrafts] = useState<JourneyDraftMap>({});
  const [customMapDraft, setCustomMapDraft] = useState({ key: "", title: "", subtitle: "" });
  const [runningJourneyKey, setRunningJourneyKey] = useState<string | null>(null);
  const [showChooseMaps, setShowChooseMaps] = useState(true);
  const [showCustomMapForm, setShowCustomMapForm] = useState(false);
  const [recentlyRemovedKeysByCompany, setRecentlyRemovedKeysByCompany] = useState<Record<string, string[]>>({});
  const [removingNeedId, setRemovingNeedId] = useState<string | null>(null);
  const [updatingNeedId, setUpdatingNeedId] = useState<string | null>(null);
  const [reorderingNeeds, setReorderingNeeds] = useState(false);
  const [removingPublicNeeds, setRemovingPublicNeeds] = useState(false);
  const [removingPublicMarketContextAction, setRemovingPublicMarketContextAction] = useState<"remove" | "remove_and_rerun" | null>(null);
  const [resettingPublicResearchArtifacts, setResettingPublicResearchArtifacts] = useState(false);
  const [savingOdiContext, setSavingOdiContext] = useState(false);

  const scopedBaselineRun = useMemo(() => {
    if (!activeCompanyId || !baselineRun) return null;
    return baselineRun?.company_id === activeCompanyId ? baselineRun : null;
  }, [activeCompanyId, baselineRun]);

  const recentlyRemovedKeys = useMemo(() => {
    if (!activeCompanyId) return [];
    return recentlyRemovedKeysByCompany[activeCompanyId] ?? [];
  }, [activeCompanyId, recentlyRemovedKeysByCompany]);
  const marketAlignment = localAlignment?.areas?.market ?? null;
  const odiAlignment = localAlignment?.areas?.odi ?? null;
  const uploadedFileCount = useMemo(
    () => (inputsQuery.data ?? []).reduce((sum, input) => sum + input.files.length, 0),
    [inputsQuery.data],
  );

  useEffect(() => {
    setJourneyDrafts({});
    setCustomMapDraft({ key: "", title: "", subtitle: "" });
    setRunningJourneyKey(null);
    setShowChooseMaps(true);
    setShowCustomMapForm(false);
  }, [activeCompanyId]);

  const journeys = useMemo(() => groupJourneys(items), [items]);
  const activeCustomerJourneyTitle = useMemo(() => {
    const customerJourney = journeys.find((journey) => journey.key === "customer");
    if (customerJourney) return customerJourney.title;
    const customCustomerJourney = journeys.find((journey) => journey.key.startsWith("customer-"));
    return customCustomerJourney?.title ?? null;
  }, [journeys]);
  const activeCustomerJourneySubtitle = useMemo(() => {
    const customerJourney = journeys.find((journey) => journey.key === "customer");
    if (customerJourney) return customerJourney.subtitle;
    const customCustomerJourney = journeys.find((journey) => journey.key.startsWith("customer-"));
    return customCustomerJourney?.subtitle ?? null;
  }, [journeys]);
  const activeCustomerJourneyGroup = useMemo(() => {
    const customerJourney = journeys.find((journey) => journey.key === "customer");
    if (customerJourney) return customerJourney;
    return journeys.find((journey) => journey.key.startsWith("customer-")) ?? null;
  }, [journeys]);
  const totalGaps = useMemo(
    () => journeys.reduce((sum, journey) => sum + journey.steps.filter((step) => hasAssessedGap(step)).length, 0),
    [journeys]
  );
  const totalStepCount = useMemo(
    () => journeys.reduce((sum, journey) => sum + journey.steps.length, 0),
    [journeys]
  );
  const jobMapEditorialHeadline =
    journeys.length === 0 ? "No customer journey checkpoints defined yet."
    : totalGaps > 0 ? `${totalGaps} confirmed ${totalGaps === 1 ? "gap" : "gaps"} across ${journeys.length} ${journeys.length === 1 ? "journey" : "journeys"}.`
    : totalStepCount > 0 ? `${totalStepCount} checkpoints defined — no confirmed gaps yet.`
    : "Journeys defined — run research to generate checkpoints.";
  const pendingAssessmentTotal = useMemo(
    () =>
      journeys.reduce((sum, journey) => sum + journey.steps.filter((step) => isDraftPlaceholderStep(step)).length, 0),
    [journeys],
  );
  const suggestedJourneyOptions = useMemo(() => {
    const inferred = inferSuggestedJourneyOptions({
      baselineRun: scopedBaselineRun,
      journeys,
      inputs: inputsQuery.data ?? [],
      strategicProblems,
      whereToPlay: strategyCascade?.where_to_play ?? "",
      howToWin: strategyCascade?.how_to_win ?? "",
    });
    const byKey = new Map<JourneyKey, SuggestedJourneyOption>(inferred.map((option) => [option.key, option]));
    for (const key of recentlyRemovedKeys) {
      if (!byKey.has(key)) {
        byKey.set(key, {
          key,
          title: titleFromKey(key),
          subtitle: subtitleFromKey(key),
          confidence: 70,
          rationale: "Previously removed map. Add it again any time.",
        });
      }
    }
    return Array.from(byKey.values()).sort((a, b) => b.confidence - a.confidence);
  }, [scopedBaselineRun, journeys, recentlyRemovedKeys, inputsQuery.data, strategicProblems, strategyCascade?.where_to_play, strategyCascade?.how_to_win]);
  useEffect(() => {
    setJourneyDrafts((previous) => {
      const next = { ...previous };
      for (const option of suggestedJourneyOptions) {
        const current = next[option.key] || { title: "", subtitle: "" };
        next[option.key] = {
          title: safeText(current.title, option.title),
          subtitle: safeText(current.subtitle, option.subtitle),
        };
      }
      return next;
    });
  }, [suggestedJourneyOptions]);

  const updateJourneyDraft = (key: string, field: "title" | "subtitle", value: string) => {
    setJourneyDrafts((previous) => ({
      ...previous,
      [key]: {
        ...previous[key],
        [field]: value,
      },
    }));
  };

  const insertLocalDraftMap = async (args: {
    key: string;
    title: string;
    subtitle: string;
    checkpointSeed?: Array<{ label: string; description: string }>;
  }) => {
    if (!activeCompanyId) throw new Error("No active company selected.");
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData?.user?.id) {
      throw new Error("Sign in required to add a local checkpoint map draft.");
    }

    const { data: existingRows, error: existingErr } = await supabase
      .from("job_steps")
      .select("id")
      .eq("company_id", activeCompanyId)
      .eq("journey_key", args.key)
      .limit(1);
    if (existingErr) throw new Error(existingErr.message || "Failed to verify existing map.");
    if ((existingRows ?? []).length > 0) return false;

    const draftCheckpointSeed = Array.isArray(args.checkpointSeed) && args.checkpointSeed.length === JTBD_CHECKPOINT_COUNT
      ? args.checkpointSeed
      : LOCAL_ODI_STEP_SEED;
    const rows = draftCheckpointSeed.map((seed, index) => ({
      company_id: activeCompanyId,
      user_id: authData.user.id,
      // Phase 2 Gate 1: operator-authored steps are inadmissible to external prompt
      // framing (council decision 3 — same standing as internal).
      provenance_type: "operator_authored",
      journey_key: args.key,
      journey_title: args.title,
      journey_subtitle: args.subtitle,
      step_number: index + 1,
      step_label: seed.label,
      description: seed.description,
      designed: false,
      has_gap: true,
      evidence_status: "unclear",
      evidence_basis: "Local draft step generated without external model run.",
      evidence_confidence: 20,
      gap_note: "Awaiting evidence-backed research and validation.",
    }));

    const { error: insertErr } = await supabase.from("job_steps").insert(rows);
    if (insertErr) throw new Error(insertErr.message || "Failed to insert local checkpoint map draft.");
    return true;
  };

  const currentSelectedMapsForSynthesis = () => {
    const maps = journeys.map((journey) => ({
      journey_key: journey.key,
      journey_title: safeText(journey.title, titleFromKey(journey.key)),
      journey_subtitle: safeText(journey.subtitle, subtitleFromKey(journey.key)),
    }));
    if (maps.length === 0) {
      return [
        {
          journey_key: "customer",
          journey_title: titleFromKey("customer"),
          journey_subtitle: subtitleFromKey("customer"),
        },
      ];
    }
    return maps;
  };

  const invokeLocalJobMapSynthesis = async (args: {
    selectedJobMaps: Array<{ journey_key: string; journey_title: string; journey_subtitle: string }>;
    trigger: string;
  }) => {
    if (!activeCompany?.id) throw new Error("Select a company before running local synthesis.");

    const invocation = await supabase.functions.invoke("local-jobmap-synthesis", {
      body: {
        company_id: activeCompany.id,
        selected_job_maps: args.selectedJobMaps,
        trigger: args.trigger,
      },
    });

    if (invocation.error) {
      throw new Error(await describeJobMapInvokeError(invocation.error));
    }

    const payload =
      invocation.data && typeof invocation.data === "object"
        ? (invocation.data as {
            error?: unknown;
            summary?: {
              selected_maps?: number;
              journeys_generated?: number;
              steps_inserted?: number;
              odi_needs_inserted?: number;
              affected_artifacts_marked?: number;
            };
            artifacts?: {
              journeys?: Array<{ journey_key?: string; journey_title?: string; step_count?: number }>;
            };
          })
        : null;

    if (payload?.error) {
      throw new Error(String(payload.error));
    }

    return payload;
  };

  const runAddMap = async (args: {
    key: string;
    title?: string;
    subtitle?: string;
    source?: "suggested" | "custom";
  }) => {
    if (!activeCompany?.id) {
      toast.error("Select a company before running journey research.");
      return;
    }
    const key = normalizeJourneyKey(args.key);
    if (!key) {
      toast.error("Enter a valid map key.");
      return;
    }

    try {
      setRunningJourneyKey(key);
      const { data: activeLock } = await supabase
        .from("company_run_locks")
        .select("operation, started_at, expires_at")
        .eq("company_id", activeCompany.id)
        .maybeSingle();

      if (activeLock?.operation === "research") {
        const started = activeLock.started_at
          ? new Date(activeLock.started_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
          : "recently";
        toast.message(`Research is already running (started ${started}). We’ll keep this map request queued after it completes.`);
        return;
      }

      const jobMap = {
        journey_key: key,
        journey_title: safeText(args.title, titleFromKey(key)),
        journey_subtitle: safeText(args.subtitle, subtitleFromKey(key)),
        source: args.source || "custom",
      };
      const existingCustomerJourney = journeys.find((journey) => journey.key === "customer");
      const customerSupportMap =
        key !== "customer" && existingCustomerJourney
          ? {
              journey_key: "customer",
              journey_title: safeText(existingCustomerJourney.title, titleFromKey("customer")),
              journey_subtitle: safeText(existingCustomerJourney.subtitle, subtitleFromKey("customer")),
              source: "existing" as const,
            }
          : null;
      const jobMapsPayload = customerSupportMap ? [customerSupportMap, jobMap] : [jobMap];

      // DEPRECATED: this re-ran research-company (cold-start) on an existing company
      // to add/rebuild a journey map = re-birth, now blocked by the cold-start guard.
      // Invoke neutralized — it resolves a benign deprecation result and makes NO
      // research-company call. To start fresh, create a NEW company (+ Add Client).
      const runResearchMap = async () =>
        invokeFunctionWithTimeout(
          () =>
            Promise.resolve({
              data: {
                error: "research_rerun_deprecated",
                message: "Adding maps via re-research is disabled. To start fresh, create a new company (+ Add Client).",
                journeys: [key],
                maps: jobMapsPayload.length,
              },
              error: null,
            }),
          90_000,
        );

      let data: { error?: unknown; message?: unknown } | null = null;
      let invokeError: unknown;
      try {
        const first = await runResearchMap();
        data =
          first?.data && typeof first.data === "object"
            ? (first.data as { error?: unknown; message?: unknown })
            : null;
        invokeError = first?.error;
      } catch (err) {
        if (err instanceof InvokeTimeoutError) {
          await Promise.all([refetchJobSteps(), refetchBaseline()]);
          toast.message(err.message);
          return;
        }
        throw err;
      }
      let invokeMessage = invokeError ? await describeJobMapInvokeError(invokeError) : "";

      if (invokeError && shouldAttemptBaselineRetry(invokeMessage)) {
        toast.message("Refreshing public baseline, then retrying map generation once.");
        const { error: baselineErr } = await supabase.functions.invoke("public-baseline", {
          body: {
            company_id: activeCompany.id,
            company_name: activeCompany.name,
            website: activeCompany.website ?? "",
          },
        });
        if (!baselineErr) {
          await refetchBaseline();
          try {
            const retry = await runResearchMap();
            data =
              retry?.data && typeof retry.data === "object"
                ? (retry.data as { error?: unknown; message?: unknown })
                : null;
            invokeError = retry?.error;
          } catch (retryErr) {
            if (retryErr instanceof InvokeTimeoutError) {
              await Promise.all([refetchJobSteps(), refetchBaseline()]);
              toast.message(retryErr.message);
              return;
            }
            throw retryErr;
          }
          invokeMessage = invokeError ? await describeJobMapInvokeError(invokeError) : "";
        } else {
          const baselineMessage = await describeJobMapInvokeError(baselineErr);
          invokeMessage = `${invokeMessage}. Baseline refresh failed: ${baselineMessage}`;
        }
      }

      if (invokeError) {
        if (shouldUseLocalMapFallback(invokeMessage)) {
          let localSynthesisPayload:
            | {
                summary?: {
                  journeys_generated?: number;
                  odi_needs_inserted?: number;
                  affected_artifacts_marked?: number;
                };
                artifacts?: {
                  journeys?: Array<{ journey_key?: string }>;
                };
              }
            | null = null;
          let localSynthesisError: string | null = null;

          try {
            localSynthesisPayload = await invokeLocalJobMapSynthesis({
              selectedJobMaps: jobMapsPayload.map((entry) => ({
                journey_key: entry.journey_key,
                journey_title: entry.journey_title,
                journey_subtitle: entry.journey_subtitle,
              })),
              trigger: `jobsteps_add_map:${key}`,
            });
          } catch (synthesisErr) {
            localSynthesisError = synthesisErr instanceof Error ? synthesisErr.message : String(synthesisErr);
          }

          const generatedJourneyKeys = new Set(
            (localSynthesisPayload?.artifacts?.journeys ?? [])
              .map((entry) => normalizeJourneyKey(entry?.journey_key))
              .filter(Boolean),
          );
          let insertedDraft = false;
          if (!generatedJourneyKeys.has(key)) {
            insertedDraft = await insertLocalDraftMap({
              key,
              title: jobMap.journey_title,
              subtitle: jobMap.journey_subtitle,
              checkpointSeed: checkpointSeedForJourneyKey(key),
            });
          }

            await Promise.all([refetchJobSteps(), refetchBaseline()]);
          if (generatedJourneyKeys.has(key)) {
            const affectedArtifacts = Number(localSynthesisPayload?.summary?.affected_artifacts_marked ?? 0);
            toast.success(
              `${titleCaseJourney(key)} map generated from local synthesis (${localSynthesisPayload?.summary?.journeys_generated ?? 0} map(s), ${affectedArtifacts} dependent item${affectedArtifacts === 1 ? "" : "s"} marked for review).`,
            );
          } else if (insertedDraft) {
            toast.success(`${titleCaseJourney(key)} map added as a local draft.`);
            toast.message(
              localSynthesisError
                ? `Local synthesis was unavailable (${localSynthesisError}).`
                : "Local synthesis did not return the requested map key, so a draft was added.",
            );
          } else {
            toast.message(`${titleCaseJourney(key)} map already exists.`);
          }
          return;
        }
        throw new Error(invokeMessage);
      }
      if (data?.error) {
        throw new Error(String(data.message || data.error));
      }

      await Promise.all([refetchJobSteps(), refetchBaseline()]);
      if (activeCompanyId) {
        setRecentlyRemovedKeysByCompany((previous) => ({
          ...previous,
          [activeCompanyId]: (previous[activeCompanyId] ?? []).filter((removed) => removed !== key),
        }));
      }
      toast.success(`${titleCaseJourney(key)} map added.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add checkpoint map.");
    } finally {
      setRunningJourneyKey(null);
    }
  };

  const addMap = async (key: string) => {
    const draft = journeyDrafts[key];
    const suggested = suggestedJourneyOptions.find((option) => option.key === key);
    const fallbackTitle = suggested?.title || titleFromKey(key);
    const fallbackSubtitle = suggested?.subtitle || subtitleFromKey(key);
    await runAddMap({
      key,
      title: safeText(draft?.title, fallbackTitle),
      subtitle: safeText(draft?.subtitle, fallbackSubtitle),
      source: draft?.title || draft?.subtitle ? "custom" : "suggested",
    });
  };

  const addCustomMap = async () => {
    const derivedKey = normalizeJourneyKey(customMapDraft.key || customMapDraft.title);
    if (!derivedKey) {
      toast.error("Enter a custom map key or title.");
      return;
    }
    await runAddMap({
      key: derivedKey,
      title: safeText(customMapDraft.title, titleFromKey(derivedKey)),
      subtitle: safeText(customMapDraft.subtitle, subtitleFromKey(derivedKey)),
      source: "custom",
    });
    setCustomMapDraft({ key: "", title: "", subtitle: "" });
  };

  const handleUpdateStepText = async (
    stepId: string,
    values: { step_label: string; description: string },
  ) => {
    await updateStepText(stepId, values);
  };

  const handleReorderNeeds = async (orderedNeedIds: string[]) => {
    if (!activeCompanyId) throw new Error("Select a company before reordering needs.");
    const ids = Array.isArray(orderedNeedIds)
      ? orderedNeedIds.map((entry) => String(entry || "").trim()).filter(Boolean)
      : [];
    if (ids.length === 0) return;

    const expectedNeedIds = needs.map((item) => item.id).sort();
    const sortedIds = [...ids].sort();
    if (
      expectedNeedIds.length !== sortedIds.length ||
      expectedNeedIds.some((id, index) => id !== sortedIds[index])
    ) {
      throw new Error("Need reorder payload did not match current needs.");
    }

    setReorderingNeeds(true);
    try {
      const needById = new Map(needs.map((item) => [item.id, item]));
      const updateCalls = ids.map((id, index) =>
        {
          const current = needById.get(id);
          const nextFrameworks = Array.from(
            new Set([...(current?.frameworks_used ?? []), "manual_override"]),
          );
          return supabase
            .from("odi_needs")
            .update({ sort_order: index + 1, frameworks_used: nextFrameworks })
            .eq("company_id", activeCompanyId)
            .eq("id", id);
        },
      );
      const results = await Promise.all(updateCalls);
      const errors = results
        .map((result) => result.error?.message)
        .filter((message): message is string => Boolean(message));
      if (errors.length > 0) {
        throw new Error(errors.join(" | "));
      }
    } finally {
      setReorderingNeeds(false);
    }
  };

  const handleUpdateNeedText = async (
    needId: string,
    values: { desired_outcome: string },
  ) => {
    if (!activeCompanyId) throw new Error("Select a company before editing needs.");
    const id = String(needId || "").trim();
    if (!id) throw new Error("Missing need id.");
    const desiredOutcome = String(values.desired_outcome || "").trim();
    if (!desiredOutcome) throw new Error("Need text cannot be empty.");

    setUpdatingNeedId(id);
    try {
      const { error: updateError } = await supabase
        .from("odi_needs")
        .update({ desired_outcome: desiredOutcome })
        .eq("company_id", activeCompanyId)
        .eq("id", id);
      if (updateError) {
        throw new Error(updateError.message || "Failed to update need.");
      }
    } finally {
      setUpdatingNeedId(null);
    }
  };

  const handleUpdateNeedScores = async (needId: string, importance: number, satisfaction: number) => {
    try {
      await updateNeedScores(needId, importance, satisfaction);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update scores.");
    }
  };

  const handleSaveOdiContextEdits = async (values: {
    marketContext: string;
    jobExecutor: string;
    chooser: string;
    jtbd: string;
  }) => {
    if (!activeCompanyId || !activeCompany?.id) {
      throw new Error("Select a company before editing market context.");
    }

    const marketContextValue = String(values.marketContext || "").trim();
    const jobExecutorValue = String(values.jobExecutor || "").trim();
    const chooserValue = String(values.chooser || "").trim();
    const jtbdValue = String(values.jtbd || "").trim();

    if (!marketContextValue || !jobExecutorValue || !chooserValue || !jtbdValue) {
      throw new Error("Market context, job executor, chooser, and JTBD are required.");
    }

    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData?.user) {
      throw new Error("Sign in required to save market context edits.");
    }
    const userId = authData.user.id;

    setSavingOdiContext(true);
    try {
      const marketFrameworks = Array.from(
        new Set([...(marketDefinition?.frameworks_used ?? []), "odi", "manual_override"]),
      );
      const nowIso = new Date().toISOString();

      const { data: updatedMarket, error: updateMarketError } = await supabase
        .from("odi_market_definitions")
        .update({
          job_executor: jobExecutorValue,
          chooser: chooserValue,
          jtbd: jtbdValue,
          source_path: "manual_context_edit",
          frameworks_used: marketFrameworks,
          updated_at: nowIso,
        })
        .eq("company_id", activeCompanyId)
        .select("id")
        .maybeSingle();
      if (updateMarketError) {
        throw new Error(updateMarketError.message || "Failed to update Strategic Decision System market context.");
      }
      if (!updatedMarket?.id) {
        const { error: insertMarketError } = await supabase.from("odi_market_definitions").insert({
          company_id: activeCompanyId,
          user_id: userId,
          job_executor: jobExecutorValue,
          chooser: chooserValue,
          jtbd: jtbdValue,
          source_path: "manual_context_edit",
          frameworks_used: marketFrameworks,
        });
        if (insertMarketError) {
          throw new Error(insertMarketError.message || "Failed to insert Strategic Decision System market context.");
        }
      }

      const { data: updatedCascade, error: updateCascadeError } = await supabase
        .from("strategy_cascades")
        .update({
          where_to_play: marketContextValue,
          updated_at: nowIso,
        })
        .eq("company_id", activeCompanyId)
        .select("id")
        .maybeSingle();
      if (updateCascadeError) {
        throw new Error(updateCascadeError.message || "Failed to update strategy market context.");
      }
      if (!updatedCascade?.id) {
        const { error: insertCascadeError } = await supabase.from("strategy_cascades").insert({
          company_id: activeCompanyId,
          user_id: userId,
          where_to_play: marketContextValue,
          frameworks_used: ["manual_override"],
        });
        if (insertCascadeError) {
          throw new Error(insertCascadeError.message || "Failed to insert strategy market context.");
        }
      }

      await runLocalAlignment.mutateAsync({
        areas: ["positioning", "strategy", "market", "odi"],
        trigger: "manual_market_context_saved",
        applyScoreUpdate: true,
        ignorePublicBaseline: true,
      });

      let usedLocalSynthesis = false;
      let usedDraftFallback = false;
      if (uploadedFileCount > 0) {
        try {
          await runResearchFromUploadedEvidence();
        } catch (researchErr) {
          const researchMessage = researchErr instanceof Error ? researchErr.message : String(researchErr);
          if (!shouldUseLocalMapFallback(researchMessage)) {
            throw researchErr;
          }

          try {
            await invokeLocalJobMapSynthesis({
              selectedJobMaps: currentSelectedMapsForSynthesis(),
              trigger: "jobsteps_save_context_fallback",
            });
            usedLocalSynthesis = true;
          } catch (localErr) {
            const localMessage = localErr instanceof Error ? localErr.message : String(localErr);
            const inserted = await insertLocalDraftMap({
              key: "customer",
              title: safeText(activeCustomerJourneyTitle, titleFromKey("customer")),
              subtitle: safeText(activeCustomerJourneySubtitle, subtitleFromKey("customer")),
              checkpointSeed: checkpointSeedForJourneyKey("customer"),
            });
            usedDraftFallback = inserted;
            if (!inserted) {
              throw new Error(`${researchMessage}. Local synthesis fallback failed: ${localMessage}`);
            }
          }
        }
      }

      await Promise.all([refetchJobSteps(), refetchBaseline(), inputsQuery.refetch()]);
      refreshOdi();

      if (uploadedFileCount > 0) {
        if (usedLocalSynthesis) {
          toast.success("Saved context edits and regenerated checkpoint map + Strategic Decision System artifacts through local synthesis.");
        } else if (usedDraftFallback) {
          toast.success("Saved context edits and added a local draft customer map while model-backed synthesis is unavailable.");
        } else {
          toast.success("Saved context edits and regenerated downstream artifacts.");
        }
      } else {
        toast.success("Saved context edits and refreshed alignment. Upload files to regenerate full artifacts.");
      }
    } finally {
      setSavingOdiContext(false);
    }
  };

  const handleRemoveJourneyMap = async (key: string) => {
    if (!activeCompany?.id) {
      toast.error("Select a company before removing a checkpoint map.");
      return;
    }

    const confirmed = window.confirm(
      `Remove the ${titleCaseJourney(key)} checkpoint map from this company? This deletes its current checkpoint map.`,
    );
    if (!confirmed) return;

    try {
      await removeJourneyMap(key);
      if (activeCompanyId) {
        setRecentlyRemovedKeysByCompany((previous) => {
          const current = previous[activeCompanyId] ?? [];
          return {
            ...previous,
            [activeCompanyId]: current.includes(key) ? current : [...current, key],
          };
        });
      }
      toast.success(
        key === "customer"
          ? "Customer checkpoint map and related opportunities, Strategic Decision System needs, outcomes, and routes removed."
          : `${titleCaseJourney(key)} checkpoint map and related opportunities/Strategic Decision System needs removed.`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove checkpoint map.");
    }
  };

  const refreshOdi = () => setOdiRefreshKey((current) => current + 1);

  const runResearchFromUploadedEvidence = async () => {
    if (!activeCompany?.id) {
      throw new Error("Select a company before regenerating research artifacts.");
    }
    const selectedJourneyKey =
      normalizeJourneyKey(activeCustomerJourneyGroup?.key || "customer") || "customer";

    const formatLockTime = (value?: string | null) => {
      if (!value) return "soon";
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return value;
      return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    };

    const { data: existingLock } = await supabase
      .from("company_run_locks")
      .select("operation,started_at,expires_at")
      .eq("company_id", activeCompany.id)
      .maybeSingle();
    if (existingLock?.operation === "research") {
      throw new Error(
        `Artifact regeneration is already running (started ${formatLockTime(existingLock.started_at)}; lock expires ${formatLockTime(existingLock.expires_at)}).`,
      );
    }

    let invokeRes:
      | { error: unknown; data: unknown }
      | null = null;

    try {
      invokeRes = await invokeFunctionWithTimeout(
        () =>
          supabase.functions.invoke("run-agent-flow", {
            body: {
              company_id: activeCompany.id,
              company_name: activeCompany.name,
              website: activeCompany.website ?? "",
              // Keep regeneration scoped to the selected customer journey context.
              journey_key: selectedJourneyKey,
              mode: "uploaded_only",
              include_public_collection: false,
              include_local_alignment: false,
              apply_score_update: false,
              trigger: "jobsteps_uploaded_rerun",
              review_mode: "advisory",
              allow_review_block_save: true,
            },
          }),
        95_000,
      );
    } catch (error) {
      if (error instanceof InvokeTimeoutError) {
        const { data: lockAfterTimeout } = await supabase
          .from("company_run_locks")
          .select("operation,started_at,expires_at")
          .eq("company_id", activeCompany.id)
          .maybeSingle();
        if (lockAfterTimeout?.operation === "research") {
          throw new Error(
            `Artifact regeneration is still running (started ${formatLockTime(lockAfterTimeout.started_at)}; lock expires ${formatLockTime(lockAfterTimeout.expires_at)}).`,
          );
        }
      }
      throw error;
    }

    const researchErr = invokeRes?.error;
    const researchData = invokeRes?.data;

    const researchPayload =
      researchData && typeof researchData === "object"
        ? (researchData as { error?: unknown; message?: unknown })
        : null;
    if (researchErr) {
      throw new Error(await describeJobMapInvokeError(researchErr));
    }
    if (researchPayload?.error) {
      throw new Error(String(researchPayload.message || researchPayload.error));
    }
  };

  const handleRemoveNeed = async (needId: string) => {
    if (!activeCompanyId) {
      toast.error("Select a company before removing a need.");
      return;
    }
    setRemovingNeedId(needId);
    try {
      const { error: deleteErr } = await supabase
        .from("odi_needs")
        .delete()
        .eq("company_id", activeCompanyId)
        .eq("id", needId);
      if (deleteErr) throw new Error(deleteErr.message || "Failed to remove need.");
      refreshOdi();
      toast.success("Need removed.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove need.");
    } finally {
      setRemovingNeedId(null);
    }
  };

  const handleRemovePublicNeeds = async () => {
    if (!activeCompanyId) {
      toast.error("Select a company before removing public needs.");
      return;
    }
    const publicNeedIds = needs.filter((item) => isPublicSourcePath(item.source_path)).map((item) => item.id);
    if (publicNeedIds.length === 0) {
      toast.message("No public-source needs to remove.");
      return;
    }
    setRemovingPublicNeeds(true);
    try {
      const { error: deleteErr } = await supabase
        .from("odi_needs")
        .delete()
        .eq("company_id", activeCompanyId)
        .in("id", publicNeedIds);
      if (deleteErr) throw new Error(deleteErr.message || "Failed to remove public needs.");
      refreshOdi();
      toast.success(`Removed ${publicNeedIds.length} public Strategic Decision System need${publicNeedIds.length === 1 ? "" : "s"}.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove public needs.");
    } finally {
      setRemovingPublicNeeds(false);
    }
  };

  const removePublicMarketContextRecord = async () => {
    if (!activeCompanyId) {
      toast.error("Select a company before removing public market context.");
      return false;
    }
    if (!marketDefinition?.id || !isPublicSourcePath(marketDefinition.source_path)) {
      toast.message("No public-source market context row to remove.");
      return false;
    }
    const { error: deleteErr } = await supabase
      .from("odi_market_definitions")
      .delete()
      .eq("company_id", activeCompanyId)
      .eq("id", marketDefinition.id);
    if (deleteErr) {
      throw new Error(deleteErr.message || "Failed to remove market context.");
    }
    refreshOdi();
    return true;
  };

  const handleRemovePublicMarketContext = async () => {
    setRemovingPublicMarketContextAction("remove");
    try {
      const removed = await removePublicMarketContextRecord();
      if (!removed) return;
      toast.success("Public market context removed.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove market context.");
    } finally {
      setRemovingPublicMarketContextAction(null);
    }
  };

  const handleRemovePublicMarketContextAndRerun = async () => {
    setRemovingPublicMarketContextAction("remove_and_rerun");
    let removed = false;
    try {
      removed = await removePublicMarketContextRecord();
      if (!removed) return;

      if (uploadedFileCount <= 0) {
        toast.success("Public market context removed.");
        toast.message("No uploaded files found, so rerun was skipped.");
        return;
      }

      await runLocalAlignment.mutateAsync({
        areas: ["positioning", "strategy", "market", "odi"],
        trigger: "public_market_context_removed",
        applyScoreUpdate: true,
        ignorePublicBaseline: true,
      });
      await runResearchFromUploadedEvidence();
      await Promise.all([refetchJobSteps(), refetchBaseline(), inputsQuery.refetch()]);
      refreshOdi();
      toast.success("Public market context removed. Re-ran local comparison and regenerated artifacts from uploaded files.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Rerun failed.";
      if (removed) {
        if (/still running|already running/i.test(message)) {
          toast.message(`Public market context was removed. ${message}`);
        } else {
          toast.error(`Public market context was removed, but rerun failed: ${message}`);
        }
      } else {
        toast.error(message);
      }
    } finally {
      setRemovingPublicMarketContextAction(null);
    }
  };

  const handleResetPublicResearchArtifacts = async () => {
    if (!activeCompanyId) {
      toast.error("Select a company before resetting public research artifacts.");
      return;
    }

    const confirmed = window.confirm(
      "Reset false public research artifacts for this company?\n\nThis removes generated job checkpoints, opportunities, routes, strategy/positioning drafts, and public research snapshots.\nUploaded files stay in place.",
    );
    if (!confirmed) return;

    setResettingPublicResearchArtifacts(true);
    try {
      const errors: string[] = [];
      const captureError = (table: string, error: { message?: string } | null) => {
        if (!error) return;
        if (isMissingTableError(error.message || "", table)) return;
        errors.push(`${table}: ${error.message || "unknown error"}`);
      };

      const runDelete = async (table: string) => {
        const { error } = await supabase.from(table as never).delete().eq("company_id", activeCompanyId);
        captureError(table, error);
      };

      await runDelete("job_steps");
      await runDelete("opportunities");
      await runDelete("routes");
      await runDelete("strategy_cascades");
      await runDelete("positioning_canvases");

      const { error: needsError } = await supabase
        .from("odi_needs")
        .delete()
        .eq("company_id", activeCompanyId)
        .or("source_path.ilike.%public%");
      captureError("odi_needs", needsError);

      const { error: marketDefError } = await supabase
        .from("odi_market_definitions")
        .delete()
        .eq("company_id", activeCompanyId)
        .or("source_path.ilike.%public%");
      captureError("odi_market_definitions", marketDefError);

      const spClient = supabase as unknown as {
        from: (table: string) => {
          delete: () => {
            eq: (
              column: string,
              value: string,
            ) => {
              in: (
                column: string,
                values: string[],
              ) => Promise<{ error: { message?: string } | null }>;
            };
          };
        };
      };
      const { error: strategicProblemsError } = await spClient
        .from("strategy_problem_statements")
        .delete()
        .eq("company_id", activeCompanyId)
        .in("source", ["public", "evidence"]);
      captureError("strategy_problem_statements", strategicProblemsError);

      const { error: reviewRunsError } = await supabase
        .from("research_review_runs")
        .delete()
        .eq("company_id", activeCompanyId);
      captureError("research_review_runs", reviewRunsError);

      const { error: artifactRunsError } = await supabase
        .from("research_artifact_runs")
        .delete()
        .eq("company_id", activeCompanyId);
      captureError("research_artifact_runs", artifactRunsError);

      const { error: baselineRunsError } = await supabase
        .from("public_baseline_runs")
        .delete()
        .eq("company_id", activeCompanyId);
      captureError("public_baseline_runs", baselineRunsError);

      const { error: companyUpdateError } = await supabase
        .from("companies")
        .update({
          mojo_score: 0,
          potential_score: 0,
          projected_score: 0,
          evidence_status: "no_public_evidence",
          evidence_note:
            "Public research artifacts were reset because public evidence was inaccurate or too weak. Continue from uploaded company files.",
        })
        .eq("id", activeCompanyId);
      captureError("companies", companyUpdateError);

      if (errors.length > 0) {
        throw new Error(`Reset completed with issues: ${errors.join(" | ")}`);
      }

      await Promise.all([
        refetchJobSteps(),
        refetchBaseline(),
        inputsQuery.refetch(),
      ]);
      refreshOdi();

      if (uploadedFileCount > 0) {
        try {
          await runLocalAlignment.mutateAsync({
            areas: ["positioning", "strategy", "market", "odi"],
            trigger: "public_artifacts_reset",
            applyScoreUpdate: true,
            ignorePublicBaseline: true,
          });
          await runResearchFromUploadedEvidence();
          await Promise.all([refetchJobSteps(), refetchBaseline(), inputsQuery.refetch()]);
          refreshOdi();
          toast.success("False public artifacts removed. Regenerated map, Strategic Decision System context, market context, and strategy from uploaded evidence.");
        } catch (rerunError) {
          const rerunMessage = rerunError instanceof Error ? rerunError.message : "unknown error";
          if (/still running|already running/i.test(rerunMessage)) {
            toast.message(`False public artifacts removed. ${rerunMessage}`);
            return;
          }
          toast.error(
            `False public artifacts removed, but rerun failed: ${
              rerunMessage
            }`,
          );
        }
      } else {
        toast.success("False public artifacts removed. Upload files to rebuild local evidence.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to reset public research artifacts.");
    } finally {
      setResettingPublicResearchArtifacts(false);
    }
  };

  return (
    <div
      className="min-h-screen strategic-surface"
      style={{
        background: c.bg,
        backgroundImage:
          'url("data:image/svg+xml,%3Csvg width=\'6\' height=\'6\' viewBox=\'0 0 6 6\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'%23000\' fill-opacity=\'0.025\'%3E%3Cpath d=\'M5 0h1L0 5V4zM6 5v1H5z\'/%3E%3C/g%3E%3C/svg%3E")',
      }}
    >
      <TopNav />

      <main className="max-w-[1440px] mx-auto px-4 pb-12 pt-3 sm:px-6 md:px-8">
        <PageContextStatus lastScoredAt={activeCompany?.last_scored_at} sourceSignals={sourceSignals} />

        <div className="mb-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
              <p className="font-mono text-[10px] uppercase tracking-[0.12em]" style={{ color: "#9298B5" }}>
                Customer Research · {activeCompany?.name || "No company selected"} · Job structure and needs
              </p>
              <Link
                to="/routes"
                className="font-mono text-[10px] uppercase tracking-[0.1em]"
                style={{ color: "#6a9e94", textDecoration: "underline", opacity: 0.7 }}
              >
                ← Commitment Review
              </Link>
            </div>
          </div>
          <GenericAuditTraceNote
            active={auditMode}
            className="mt-3 max-w-5xl"
            source="job_steps, Strategic Decision System market definitions, Strategic Decision System needs, strategic_problems, and baseline/source_path provenance."
            evaluation="AI proposes map structure, then journey and evidence logic classify what is public vs uploaded context and where clarity gaps remain."
            scoring="Strategic Decision System needs use importance, satisfaction, and opportunity score; gap states and evidence confidence shape priority readouts."
            why="This explains why each checkpoint/need exists, what evidence it came from, and which assumptions still need validation."
          />
        </div>

        <AiBoundaryNote
          label="Public Research"
          tone="public"
          className="mb-3 max-w-[780px]"
          detail="Map suggestions are inferred from public baseline signals. No checkpoint map is generated until you explicitly choose or define it."
        />

        {!activeCompany?.id ? (
          <div
            className="py-8 text-center"
          >
            <p className="font-sans text-[15px]" style={{ color: c.secondary }}>
              Select a company to view its job-checkpoint journey map.
            </p>
          </div>
        ) : loading ? (
          <div
            className="py-8 text-center"
          >
            <p className="font-mono text-[12px] uppercase tracking-[0.08em]" style={{ color: c.muted }}>
              Loading checkpoints…
            </p>
          </div>
        ) : error ? (
          <div
            className="py-8 text-center"
          >
            <p className="font-sans text-[15px]" style={{ color: c.gap }}>
              Failed to load checkpoints: {error}
            </p>
          </div>
        ) : (
          <div className="space-y-6">

            {/* ── EDITORIAL JOB MAP STATE ──────────────────────────────── */}
            <section style={{ paddingBottom: totalGaps > 0 ? 16 : 24, borderBottom: `2px solid ${c.line}` }}>
              <p className="font-mono text-[10px] uppercase tracking-[0.18em]" style={{ color: c.muted }}>
                Customer journey · {journeys.length} {journeys.length === 1 ? "journey" : "journeys"} · {totalStepCount} checkpoints
              </p>
              <h2 className="mt-2 font-sans font-semibold leading-[1.25] max-w-3xl" style={{ fontSize: 32, color: c.charcoal }}>
                {jobMapEditorialHeadline}
              </h2>
              {marketDefinition?.job_executor && (
                <p className="mt-2 font-sans text-[13px] leading-[1.55] max-w-2xl" style={{ color: c.secondary }}>
                  Job executor: {marketDefinition.job_executor}
                </p>
              )}
              {totalGaps > 0 && (
                <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.12em]" style={{ color: c.coral }}>
                  {totalGaps} confirmed {totalGaps === 1 ? "gap" : "gaps"}{pendingAssessmentTotal > 0 ? ` · ${pendingAssessmentTotal} pending assessment` : ""}
                </p>
              )}
            </section>

            <OdiContextSection
              companyName={activeCompany?.name}
              marketDefinition={marketDefinition}
              odiError={odiError}
              needs={needs}
              marketContext={strategyCascade?.where_to_play}
              activeCustomerJourneyTitle={activeCustomerJourneyTitle}
              activeCustomerJourneySubtitle={activeCustomerJourneySubtitle}
              onRemovePublicMarketContext={handleRemovePublicMarketContext}
              onRemovePublicMarketContextAndRerun={handleRemovePublicMarketContextAndRerun}
              removingPublicMarketContextAction={removingPublicMarketContextAction}
              onSaveContextEdits={handleSaveOdiContextEdits}
              savingContextEdits={savingOdiContext}
              positioningCanvas={positioningCanvas}
              hasUploadedFiles={uploadedFileCount > 0}
              onResetPublicResearchArtifacts={handleResetPublicResearchArtifacts}
              resettingPublicResearchArtifacts={resettingPublicResearchArtifacts}
              onUpdateInnovationStrategy={async (strategy) => {
                await updateMarketDefinition({ innovation_strategy: strategy });
              }}
            />

            <ProcessFidelitySection
              marketDefinition={marketDefinition}
              marketContext={strategyCascade?.where_to_play}
              customerJourney={activeCustomerJourneyGroup}
              activeCustomerJourneyTitle={activeCustomerJourneyTitle}
              needs={needs}
              positioningCanvas={positioningCanvas}
            />

            <AreaAlignmentPanel
              title="Market Context"
              area={marketAlignment}
              run={localAlignment}
              lineColor={c.line}
              panelColor={c.panel}
              textColor={c.charcoal}
              mutedColor={c.muted}
            />

            <AreaAlignmentPanel
              title="SDS Needs"
              area={odiAlignment}
              run={localAlignment}
              lineColor={c.line}
              panelColor={c.panel}
              textColor={c.charcoal}
              mutedColor={c.muted}
            />

            <section
              style={{ borderTop: `1px solid ${c.line}`, paddingTop: 24, paddingBottom: 24 }}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-sans text-[18px] font-semibold" style={{ color: c.charcoal }}>
                    Checkpoint Map Selection
                  </p>
                  <p className="mt-1 font-sans text-[13px]" style={{ color: c.secondary }}>
                    Selected maps are shown first. Choose suggested maps or add a custom one as needed.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowChooseMaps((current) => !current)}
                    className="font-mono text-[10px] uppercase tracking-[0.08em] underline"
                    style={{ color: c.muted, background: "none", border: "none", cursor: "pointer", padding: 0 }}
                  >
                    {showChooseMaps ? "Hide Choose Maps" : "Show Choose Maps"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowCustomMapForm((current) => !current)}
                    className="font-mono text-[10px] uppercase tracking-[0.08em] underline"
                    style={{ color: c.muted, background: "none", border: "none", cursor: "pointer", padding: 0 }}
                  >
                    {showCustomMapForm ? "Hide Add Custom" : "Add Custom"}
                  </button>
                </div>
              </div>

              <div className="mt-4" style={{ borderLeft: `2px solid ${c.line}`, paddingLeft: 14, paddingTop: 10, paddingBottom: 10 }}>
                <p className="font-mono text-[10px] uppercase tracking-[0.1em]" style={{ color: c.muted }}>
                  Selected Checkpoint Maps
                </p>
                {journeys.length === 0 ? (
                  <p className="mt-2 font-sans text-[13px]" style={{ color: c.secondary }}>
                    No checkpoint map selected yet.
                  </p>
                ) : (
                  <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
                    {journeys.map((journey) => (
                      <div
                        key={`selected-${journey.key}`}
                        style={{ borderBottom: `1px solid ${c.line}`, paddingTop: 8, paddingBottom: 8 }}
                      >
                        <p
                          className="font-mono text-[10px] uppercase tracking-[0.1em]"
                          style={{ color: c.muted }}
                        >
                          {titleCaseJourney(journey.key)}
                        </p>
                        <p
                          className="mt-1 font-sans text-[14px] font-semibold leading-[1.35] break-words"
                          style={{ color: c.charcoal }}
                          title={journey.title}
                        >
                          {journey.title}
                        </p>
                        {safeText(journey.subtitle) ? (
                          <p
                            className="mt-1 font-sans text-[12px] leading-[1.5] break-words"
                            style={{ color: c.secondary }}
                            title={journey.subtitle}
                          >
                            {journey.subtitle}
                          </p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {showChooseMaps ? (
                <div className="mt-4">
                  <SuggestedMapsSection
                    options={suggestedJourneyOptions}
                    drafts={journeyDrafts}
                    onDraftChange={updateJourneyDraft}
                    onAddMap={addMap}
                    runningKey={runningJourneyKey}
                  />
                </div>
              ) : null}

              {showCustomMapForm ? (
                <div className="mt-4 rounded-xl border p-4" style={{ borderColor: c.line, background: c.paper }}>
                  <p className="font-mono text-[10px] uppercase tracking-[0.1em]" style={{ color: c.muted }}>
                    Add Custom Checkpoint Map
                  </p>
                  <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-3">
                    <input
                      value={customMapDraft.key}
                      onChange={(event) => setCustomMapDraft((prev) => ({ ...prev, key: event.target.value }))}
                      className="w-full rounded-lg border px-2.5 py-2 font-sans text-[12px] outline-none"
                      style={{ borderColor: c.line, color: c.charcoal, background: "#fff" }}
                      placeholder="Map key (optional, e.g. cafe-owner)"
                    />
                    <input
                      value={customMapDraft.title}
                      onChange={(event) => setCustomMapDraft((prev) => ({ ...prev, title: event.target.value }))}
                      className="w-full rounded-lg border px-2.5 py-2 font-sans text-[12px] outline-none"
                      style={{ borderColor: c.line, color: c.charcoal, background: "#fff" }}
                      placeholder="Map title (e.g. Checkpoint Map: Cafe Owner Buying)"
                    />
                    <input
                      value={customMapDraft.subtitle}
                      onChange={(event) => setCustomMapDraft((prev) => ({ ...prev, subtitle: event.target.value }))}
                      className="w-full rounded-lg border px-2.5 py-2 font-sans text-[12px] outline-none"
                      style={{ borderColor: c.line, color: c.secondary, background: "#fff" }}
                      placeholder="Subtitle"
                    />
                  </div>

                  <div className="mt-3 flex justify-end">
                    <button
                      type="button"
                      onClick={addCustomMap}
                      disabled={runningJourneyKey !== null}
                      className="border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.08em] disabled:opacity-50"
                      style={{ borderColor: c.line, color: c.secondary, background: c.card }}
                    >
                      {runningJourneyKey ? "Adding…" : "Add Custom Map"}
                    </button>
                  </div>
                </div>
              ) : null}
            </section>

            {journeys.length === 0 ? (
              <div
                className="py-8 text-center"
              >
                <p className="font-sans text-[13px]" style={{ color: c.muted }}>
                  No checkpoint map exists yet. Choose or define at least one map above, then run research.
                </p>
              </div>
            ) : (
              <>
                {journeys.map((journey) => (
                  <JourneySection
                    key={journey.key}
                    journey={journey}
                    onRemove={handleRemoveJourneyMap}
                    removing={removingJourneyKey === journey.key}
                    onUpdateStepText={handleUpdateStepText}
                    updatingStepId={updatingStepId}
                  />
                ))}

                <div
                  style={{ borderTop: `1px solid ${c.line}`, paddingTop: 24, paddingBottom: 24 }}
                >
                  <p className="font-sans text-[14px] leading-[1.6]" style={{ color: c.secondary }}>
                    <strong style={{ color: c.charcoal }}>{totalGaps} checkpoints have active gaps</strong> across the current map{journeys.length === 1 ? "" : "s"}.
                    {pendingAssessmentTotal > 0
                      ? ` ${pendingAssessmentTotal} checkpoint${pendingAssessmentTotal === 1 ? "" : "s"} are pending assessment and need an evidence-backed research run.`
                      : " Use this page to confirm the sequence and then move to Inputs and Opportunities to close the highest-impact issues."}
                  </p>
                </div>
              </>
            )}

            <OdiNeedsListSection
              companyId={activeCompanyId ?? undefined}
              needs={needs}
              onRemoveNeed={handleRemoveNeed}
              removingNeedId={removingNeedId}
              onRemovePublicNeeds={handleRemovePublicNeeds}
              removingPublicNeeds={removingPublicNeeds}
              onReorderNeeds={handleReorderNeeds}
              reorderingNeeds={reorderingNeeds}
              onUpdateNeedText={handleUpdateNeedText}
              updatingNeedId={updatingNeedId}
              onUpdateNeedScores={handleUpdateNeedScores}
              currentPhase={activeCompany?.engagement_phase}
              hasPrimaryEvidence={sourceSignals.hasPrimaryEvidence}
              needsTensions={needsTensions}
            />
          </div>
        )}
      </main>
    </div>
  );
}
