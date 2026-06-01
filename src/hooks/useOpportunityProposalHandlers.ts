import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { captureBaseline } from "@/lib/baselineCapture";
import { saveManualEdit } from "@/lib/manualInlineEdit";
import { useOpportunityProposals } from "@/hooks/useOpportunityProposals";

export function useOpportunityProposalHandlers(
  companyId: string | null | undefined,
  onNeedsRefresh: () => void,
) {
  const [opportunityProposalRefreshKey, setOpportunityProposalRefreshKey] = useState(0);
  const { proposals: opportunityProposalsMap } = useOpportunityProposals(companyId ?? undefined, opportunityProposalRefreshKey);
  const [generateLoadingOpportunityId, setGenerateLoadingOpportunityId] = useState<string | null>(null);
  const [acceptLoadingOpportunityProposalId, setAcceptLoadingOpportunityProposalId] = useState<string | null>(null);
  const [rejectLoadingOpportunityProposalId, setRejectLoadingOpportunityProposalId] = useState<string | null>(null);

  // Ordered so callees are declared before callers — no forward refs within this hook.

  const handleGenerateOpportunityProposal = useCallback(async (needId: string) => {
    if (!companyId) return;
    setGenerateLoadingOpportunityId(needId);
    await supabase.functions.invoke("propose-opportunity-changes", {
      body: { opportunity_id: needId, company_id: companyId },
    });
    setGenerateLoadingOpportunityId(null);
    setOpportunityProposalRefreshKey((k) => k + 1);
  }, [companyId]);

  const handleAcceptOpportunityProposal = useCallback(async (
    proposalId: string,
    needId: string,
    acceptedFields: string[],
    skippedFields: string[],
  ) => {
    if (!companyId) return;
    setAcceptLoadingOpportunityProposalId(proposalId);

    const proposal = opportunityProposalsMap.get(needId);
    if (!proposal) {
      setAcceptLoadingOpportunityProposalId(null);
      return;
    }

    const patch: Record<string, unknown> = { source_path: `manual_${proposalId}` };
    if (acceptedFields.includes("outcome_statement")) {
      patch.desired_outcome = String(proposal.proposed_state.desired_outcome ?? "");
      patch.odi_canonical_statement = String(proposal.proposed_state.odi_canonical_statement ?? "");
    }

    await supabase.from("odi_needs").update(patch).eq("id", needId);
    await captureBaseline(companyId, "opportunity", needId);

    await supabase.from("surface_proposals").update({
      status: "accepted",
      reviewed_at: new Date().toISOString(),
      raw_payload: { accepted_fields: acceptedFields, skipped_fields: skippedFields },
    }).eq("id", proposalId);

    await supabase.functions.invoke("evaluate-opportunity-alignment", {
      body: { need_id: needId, company_id: companyId },
    });

    setAcceptLoadingOpportunityProposalId(null);
    onNeedsRefresh();
    setOpportunityProposalRefreshKey((k) => k + 1);
  }, [companyId, opportunityProposalsMap, onNeedsRefresh]);

  const handleRejectOpportunityProposal = useCallback(async (proposalId: string) => {
    setRejectLoadingOpportunityProposalId(proposalId);
    await supabase.from("surface_proposals").update({
      status: "rejected",
      reviewed_at: new Date().toISOString(),
    }).eq("id", proposalId);
    setRejectLoadingOpportunityProposalId(null);
    setOpportunityProposalRefreshKey((k) => k + 1);
  }, []);

  const handleSaveNeedField = useCallback(async (needId: string, field: "odi_canonical_statement", value: string) => {
    if (!companyId) return;
    await saveManualEdit("opportunity", needId, companyId, field, value);
    onNeedsRefresh();
    supabase.functions.invoke("evaluate-opportunity-alignment", { body: { need_id: needId, company_id: companyId } })
      .catch(() => {});
  }, [companyId, onNeedsRefresh]);

  return {
    opportunityProposalsMap,
    generateLoadingOpportunityId,
    acceptLoadingOpportunityProposalId,
    rejectLoadingOpportunityProposalId,
    handleSaveNeedField,
    handleGenerateOpportunityProposal,
    handleAcceptOpportunityProposal,
    handleRejectOpportunityProposal,
  };
}
