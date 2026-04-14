import { useCallback, useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { useOpportunities } from "@/hooks/useOpportunities";
import { useManagedOutcomes } from "@/hooks/useManagedOutcomes";
import { useStrategicProblems } from "@/hooks/useStrategicProblems";
import { usePublicBaseline } from "@/hooks/usePublicBaseline";
import { useClientMapInteractionState } from "@/hooks/useClientMapInteractionState";
import {
  type ClientActionSummary,
  type ClientActionConfidenceTag,
  type ClientConfidenceLevel,
  summarizeInputCoverage,
  summarizeSystemState,
  summarizeClientActions,
  summarizeConfidence,
  summarizeEvidenceSources,
  summarizeNextMove,
  summarizeOwnership,
  summarizePrimaryConstraint,
  summarizeSignalStrength,
  summarizeWhatThisMeans,
} from "@/lib/clientViewModel";

type UseClientViewDataOptions = {
  actionLimit?: number;
};

function isValidClientAction(action: unknown): action is ClientActionSummary {
  if (!action || typeof action !== "object") return false;
  const record = action as { id?: unknown };
  return typeof record.id === "string" && record.id.trim().length > 0;
}

export function useClientViewData(options: UseClientViewDataOptions = {}) {
  const { actionLimit = 5 } = options;
  const { user } = useAuth();
  const { activeCompany, refetch: refetchCompany } = useCompany();
  const companyId = activeCompany?.id;
  const [rerunningAnalysis, setRerunningAnalysis] = useState(false);

  const {
    items: opportunities,
    loading: opportunitiesLoading,
    error: opportunitiesError,
    refetch: refetchOpportunities,
  } = useOpportunities(companyId);
  const { items: strategicProblems, refetch: refetchStrategicProblems } = useStrategicProblems(companyId);
  const { items: managedOutcomes } = useManagedOutcomes(companyId);
  const { preferredRun: publicBaselineRun } = usePublicBaseline(companyId);
  const primaryDesiredOutcome = useMemo(() => {
    const primary =
      managedOutcomes.find((item) => item.is_primary) ||
      managedOutcomes.find((item) => item.journey_key === "customer") ||
      managedOutcomes[0] ||
      null;
    if (!primary) return null;
    return {
      id: primary.id,
      statement: String(primary.outcome_statement || primary.outcome_title || "").trim(),
      leadingIndicator: String(primary.leading_indicator || primary.metric || "").trim(),
      direction: String(primary.direction || primary.target_direction || "").trim(),
      metric: String(primary.metric || "").trim(),
      object: String(primary.object || "").trim(),
      context: String(primary.context || "").trim(),
      constraint: String(primary.constraint || "").trim() || null,
    };
  }, [managedOutcomes]);

  const baseActions = useMemo(
    () => summarizeClientActions(opportunities, Math.max(opportunities.length, 1)),
    [opportunities],
  );
  const interaction = useClientMapInteractionState({
    companyId,
    actions: baseActions,
  });

  const allActions = useMemo(
    () => (Array.isArray(interaction.actions) ? interaction.actions.filter(isValidClientAction) : []),
    [interaction.actions],
  );
  const topActions = useMemo(
    () => allActions.slice(0, Math.max(actionLimit, 1)),
    [actionLimit, allActions],
  );
  const ownership = useMemo(() => summarizeOwnership(allActions), [allActions]);
  const primaryConstraint = useMemo(
    () => summarizePrimaryConstraint(strategicProblems, allActions, activeCompany?.evidence_status),
    [activeCompany?.evidence_status, strategicProblems, allActions],
  );
  const confidence = useMemo(
    () => summarizeConfidence(activeCompany?.evidence_status),
    [activeCompany?.evidence_status],
  );
  const confidenceLevel: ClientConfidenceLevel = interaction.constraintConfidenceOverride ?? confidence.level;
  const confidenceWithOverride = useMemo(() => {
    const actionTag: ClientActionConfidenceTag =
      confidenceLevel === "High"
        ? "Validated"
        : confidenceLevel === "Medium"
          ? "Needs validation"
          : "Assumed";
    return {
      ...confidence,
      level: confidenceLevel,
      actionTag,
    };
  }, [confidence, confidenceLevel]);
  const signalStrength = useMemo(
    () => summarizeSignalStrength({ confidence: confidenceWithOverride, ownership, actions: allActions }),
    [allActions, confidenceWithOverride, ownership],
  );
  const computedNextMove = useMemo(
    () =>
      summarizeNextMove({
        actions: allActions,
        ownership,
        constraint: primaryConstraint,
        mojoScore: activeCompany?.mojo_score,
      }),
    [activeCompany?.mojo_score, allActions, ownership, primaryConstraint],
  );
  const nextMove = useMemo(() => {
    if (interaction.mapStatus === "signal") return computedNextMove;
    return {
      ...computedNextMove,
      title: "In Progress",
      detail: computedNextMove.detail,
    };
  }, [computedNextMove, interaction.mapStatus]);
  const whatThisMeans = useMemo(
    () =>
      summarizeWhatThisMeans({
        companyName: activeCompany?.name,
        mojoScore: activeCompany?.mojo_score,
        ownership,
        constraint: primaryConstraint,
        actions: allActions,
      }),
    [activeCompany?.mojo_score, activeCompany?.name, allActions, ownership, primaryConstraint],
  );
  const evidence = useMemo(
    () => summarizeEvidenceSources(activeCompany?.evidence_status),
    [activeCompany?.evidence_status],
  );
  const inputCoverage = useMemo(
    () =>
      summarizeInputCoverage({
        evidenceStatus: activeCompany?.evidence_status,
        actions: allActions,
        strategicProblems,
      }),
    [activeCompany?.evidence_status, allActions, strategicProblems],
  );
  const systemState = useMemo(() => summarizeSystemState(inputCoverage), [inputCoverage]);

  const teamBeliefs = useMemo(
    () =>
      Object.entries(interaction.constraintBeliefs).map(([userId, entry]) => ({
        userId,
        userLabel: entry.userLabel,
        response: entry.response,
      })),
    [interaction.constraintBeliefs],
  );
  const currentUserId = user?.id || "anonymous";
  const currentUserLabel = user?.email || "You";
  const currentUserBelief = interaction.constraintBeliefs[currentUserId]?.response ?? null;
  const alignmentSummary = useMemo(() => {
    if (teamBeliefs.length <= 1) return "Single input";
    const responses = new Set(teamBeliefs.map((item) => item.response));
    return responses.size > 1 ? "Misaligned" : "Aligned";
  }, [teamBeliefs]);

  const actionConfidenceById = interaction.actionConfidenceOverrides;
  const getActionConfidenceLevel = useCallback(
    (actionId: string): ClientConfidenceLevel =>
      actionConfidenceById[actionId] ?? confidenceWithOverride.level,
    [actionConfidenceById, confidenceWithOverride.level],
  );

  const rerunAnalysis = useCallback(async () => {
    setRerunningAnalysis(true);
    try {
      await Promise.all([
        refetchCompany(),
        refetchOpportunities(),
        refetchStrategicProblems(),
      ]);
    } finally {
      setRerunningAnalysis(false);
    }
  }, [refetchCompany, refetchOpportunities, refetchStrategicProblems]);

  return {
    activeCompany,
    hasCompany: Boolean(companyId),
    allActions,
    topActions,
    ownership,
    primaryConstraint,
    nextMove,
    whatThisMeans,
    confidence: confidenceWithOverride,
    evidence,
    inputCoverage,
    systemState,
    signalStrength,
    phase: interaction.phase,
    mapStatus: interaction.mapStatus,
    committedAt: interaction.committedAt,
    mapPrimaryOwner: interaction.mapPrimaryOwner,
    ownerOptions: interaction.ownerOptions,
    currentUserId,
    currentUserLabel,
    currentUserBelief,
    teamBeliefs,
    alignmentSummary,
    setConstraintBelief: interaction.setConstraintBelief,
    setConstraintConfidence: interaction.setConstraintConfidenceOverride,
    actionConfidenceById,
    setActionConfidence: interaction.setActionConfidenceOverride,
    getActionConfidenceLevel,
    assignActionOwner: interaction.assignActionOwner,
    setActionStatus: interaction.setActionStatus,
    setPhase: interaction.setPhase,
    addOwnerOption: interaction.addOwnerOption,
    commitMap: interaction.commitMap,
    rerunAnalysis,
    rerunningAnalysis,
    opportunitiesLoading,
    opportunitiesError,
    strategicProblems,
    primaryDesiredOutcome,
    publicBaselineRun,
  };
}
