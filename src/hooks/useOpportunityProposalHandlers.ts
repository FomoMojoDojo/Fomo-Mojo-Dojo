import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { captureBaseline } from "@/lib/baselineCapture";
import { saveManualEdit } from "@/lib/manualInlineEdit";
import { useOpportunityProposals } from "@/hooks/useOpportunityProposals";
import { useAuth } from "@/hooks/useAuth";
import { useCapability } from "@/hooks/useCapability";

export function useOpportunityProposalHandlers(
  companyId: string | null | undefined,
  onNeedsRefresh: () => void,
) {
  const { user } = useAuth();
  // Governance split (checkpoint 3a): apply/reject/suggest gated by capability.
  // Single authority — never re-query roles/caps inline.
  const canApply = useCapability("governance.proposal.apply", companyId);
  const canReject = useCapability("governance.proposal.reject", companyId);
  const canSuggest = useCapability("participation.suggest", companyId);
  const canGenerate = useCapability("structure.opportunity.generate", companyId); // 3b
  const [opportunityProposalRefreshKey, setOpportunityProposalRefreshKey] = useState(0);
  const { proposals: opportunityProposalsMap } = useOpportunityProposals(companyId ?? undefined, opportunityProposalRefreshKey);
  const [generateLoadingOpportunityId, setGenerateLoadingOpportunityId] = useState<string | null>(null);
  const [acceptLoadingOpportunityProposalId, setAcceptLoadingOpportunityProposalId] = useState<string | null>(null);
  const [rejectLoadingOpportunityProposalId, setRejectLoadingOpportunityProposalId] = useState<string | null>(null);

  // Ordered so callees are declared before callers — no forward refs within this hook.

  const handleGenerateOpportunityProposal = useCallback(async (needId: string) => {
    if (!companyId) return;
    if (!canGenerate) return; // structure.opportunity.generate
    setGenerateLoadingOpportunityId(needId);
    await supabase.functions.invoke("propose-opportunity-changes", {
      body: { opportunity_id: needId, company_id: companyId },
    });
    setGenerateLoadingOpportunityId(null);
    setOpportunityProposalRefreshKey((k) => k + 1);
  }, [companyId, canGenerate]);

  const handleAcceptOpportunityProposal = useCallback(async (
    proposalId: string,
    needId: string,
    acceptedFields: string[],
    skippedFields: string[],
  ) => {
    if (!companyId) return;
    if (!canApply) return; // governance.proposal.apply — the one apply-write
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

    // Re-evaluate alignment only for externally-admissible (public) subjects. Declared
    // subjects short-circuit at the 1a.1-A subject gate (not-applicable, zero OpenAI),
    // so the round-trip is wasted — skip it.
    const { data: provRow } = await supabase
      .from("odi_needs").select("provenance_type").eq("id", needId).maybeSingle();
    if ((provRow as { provenance_type?: string | null } | null)?.provenance_type !== "internal_declared") {
      await supabase.functions.invoke("evaluate-opportunity-alignment", {
        body: { need_id: needId, company_id: companyId },
      });
    }

    setAcceptLoadingOpportunityProposalId(null);
    onNeedsRefresh();
    setOpportunityProposalRefreshKey((k) => k + 1);
  }, [companyId, canApply, opportunityProposalsMap, onNeedsRefresh]);

  const handleRejectOpportunityProposal = useCallback(async (proposalId: string) => {
    if (!canReject) return; // governance.proposal.reject
    setRejectLoadingOpportunityProposalId(proposalId);
    await supabase.from("surface_proposals").update({
      status: "rejected",
      reviewed_at: new Date().toISOString(),
    }).eq("id", proposalId);
    setRejectLoadingOpportunityProposalId(null);
    setOpportunityProposalRefreshKey((k) => k + 1);
  }, [canReject]);

  // Human edit lane (EDIT-MODEL Commit 2): stage an operator-authored proposal — NO
  // LLM. Reads the live row for current_state, writes a pending surface_proposals row
  // in the same shape the agent path uses, so useOpportunityProposals + the comparison
  // UI surface it identically. The author edits the displayed canonical statement;
  // desired_outcome is carried through unchanged so accept doesn't wipe it.
  const handleAuthorOpportunityProposal = useCallback(async (needId: string, authoredCanonical: string) => {
    if (!companyId) return;
    if (!canSuggest) return; // participation.suggest — available to all tiers
    const { data: row } = await supabase
      .from("odi_needs")
      .select("desired_outcome, odi_canonical_statement")
      .eq("id", needId)
      .eq("company_id", companyId)
      .maybeSingle();
    if (!row) return;
    const cur = row as { desired_outcome?: string | null; odi_canonical_statement?: string | null };

    // Supersede any existing pending proposal for THIS opportunity (mirror agent path).
    await supabase.from("surface_proposals").update({
      status: "superseded", reviewed_at: new Date().toISOString(),
    }).eq("surface_type", "opportunity").eq("surface_id", needId).eq("status", "pending");

    await supabase.from("surface_proposals").insert({
      company_id: companyId,
      surface_type: "opportunity",
      surface_id: needId,
      status: "pending",
      current_state: {
        desired_outcome: cur.desired_outcome ?? "",
        odi_canonical_statement: cur.odi_canonical_statement ?? "",
      },
      proposed_state: {
        desired_outcome: cur.desired_outcome ?? "",
        odi_canonical_statement: authoredCanonical,
      },
      reason: "Manual edit",
      created_by: user?.id ?? null,
    });
    setOpportunityProposalRefreshKey((k) => k + 1);
  }, [companyId, canSuggest, user]);

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
    handleAuthorOpportunityProposal,
    handleAcceptOpportunityProposal,
    handleRejectOpportunityProposal,
  };
}
