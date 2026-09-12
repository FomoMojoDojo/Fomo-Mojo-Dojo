// OPPORTUNITIES — shared UI MOVED out of NeedsOrgPanel.tsx (Opportunities Tier 1 lift, 2026-09-12):
// the pending-proposal review section and the declared-opportunity author lane. NeedsOrgPanel imports
// them back (tab unchanged — NeedsOrgPanel.lift.test.tsx proves it) and the workspace Opportunities
// page renders the same components. Handlers are NOT here: both surfaces call
// useOpportunityProposalHandlers; these components only forward the row's fields.
import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { OpportunityProposalRow } from "@/hooks/useOpportunityProposals";
import type { OdiNeedRow } from "@/hooks/useOdiNeeds";
import { D } from "@/components/design-system/tokens";

// ── OpportunityProposalSection ────────────────────────────────────────────────

function oppTimeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function opportunityDiffed(proposal: OpportunityProposalRow): boolean {
  const c = proposal.current_state;
  const p = proposal.proposed_state;
  return (
    String(c.desired_outcome ?? "") !== String(p.desired_outcome ?? "") ||
    String(c.odi_canonical_statement ?? "") !== String(p.odi_canonical_statement ?? "")
  );
}

export function OpportunityProposalSection({
  proposal,
  onAcceptProposal,
  onRejectProposal,
  acceptLoading,
  rejectLoading,
  canApply = true,
  canReject = true,
}: {
  proposal: OpportunityProposalRow;
  onAcceptProposal?: (proposalId: string, acceptedFields: string[], skippedFields: string[]) => void;
  onRejectProposal?: (proposalId: string) => void;
  acceptLoading?: boolean;
  rejectLoading?: boolean;
  canApply?: boolean;
  canReject?: boolean;
}) {
  const hasDiff = opportunityDiffed(proposal);
  const [checked, setChecked] = useState(hasDiff);
  useEffect(() => { setChecked(opportunityDiffed(proposal)); }, [proposal.id]);

  const curr = proposal.current_state;
  const prop = proposal.proposed_state;

  function handleAccept() {
    if (!onAcceptProposal) return;
    const accepted = checked ? ["outcome_statement"] : [];
    const skipped = checked ? [] : ["outcome_statement"];
    onAcceptProposal(proposal.id, accepted, skipped);
  }

  const allUnchecked = !checked || !hasDiff;

  return (
    <div style={{
      margin: "6px 0 4px 24px",
      padding: "10px 12px 12px",
      border: "1px solid rgba(255,91,41,0.25)",
      borderRadius: 6,
      background: "rgba(255,91,41,0.03)",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 9, fontFamily: "monospace", letterSpacing: "0.08em", textTransform: "uppercase" as const, color: "#ff5b29", fontWeight: 600 }}>
          Proposed Changes
        </span>
        <span style={{ fontSize: 9, fontFamily: "monospace", color: "#9aaba5" }}>
          {oppTimeAgo(proposal.created_at)}{hasDiff ? " · outcome statement differs" : ""}
        </span>
      </div>
      {proposal.reason && (
        <p style={{ fontSize: 11, color: "#5e7881", margin: "0 0 8px", lineHeight: 1.5, fontStyle: "italic" }}>
          {proposal.reason}
        </p>
      )}
      {hasDiff && (
        <label style={{ display: "flex", alignItems: "flex-start", gap: 8, cursor: "pointer", marginBottom: 10 }}>
          <input
            type="checkbox"
            checked={checked}
            onChange={() => setChecked((c) => !c)}
            style={{ marginTop: 3, accentColor: "#ff5b29", flexShrink: 0 }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
              <span style={{ fontSize: 9, fontFamily: "monospace", letterSpacing: "0.06em", textTransform: "uppercase" as const, color: "#5e7881" }}>
                Outcome Statement
              </span>
              <span style={{ fontSize: 8, fontFamily: "monospace", color: "#ff5b29", border: "1px solid rgba(255,91,41,0.4)", borderRadius: 3, padding: "0 4px", letterSpacing: "0.05em", textTransform: "uppercase" as const }}>
                Coupled
              </span>
            </div>
            <div style={{ display: "flex", flexDirection: "column" as const, gap: 8 }}>
              <div>
                <div style={{ fontSize: 9, fontFamily: "monospace", letterSpacing: "0.05em", textTransform: "uppercase" as const, color: "#9aaba5", marginBottom: 2 }}>Human</div>
                <div style={{ fontSize: 10, color: "#9aaba5", lineHeight: 1.4, textDecoration: "line-through", marginBottom: 1 }}>
                  {String(curr.desired_outcome ?? "") || "(empty)"}
                </div>
                <div style={{ fontSize: 11, color: "#1e3340", lineHeight: 1.4 }}>
                  {String(prop.desired_outcome ?? "") || "(empty)"}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 9, fontFamily: "monospace", letterSpacing: "0.05em", textTransform: "uppercase" as const, color: "#9aaba5", marginBottom: 2 }}>ODI Formula</div>
                <div style={{ fontSize: 10, color: "#9aaba5", lineHeight: 1.4, textDecoration: "line-through", fontStyle: "italic", marginBottom: 1 }}>
                  {String(curr.odi_canonical_statement ?? "") || "(not set)"}
                </div>
                <div style={{ fontSize: 11, color: "#1e3340", lineHeight: 1.4, fontStyle: "italic" }}>
                  {String(prop.odi_canonical_statement ?? "") || "(empty)"}
                </div>
              </div>
            </div>
          </div>
        </label>
      )}
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button
          type="button"
          onClick={handleAccept}
          disabled={acceptLoading || allUnchecked || !canApply}
          title={!canApply ? "Approval requires the apply capability" : allUnchecked ? "Select at least one field to apply" : undefined}
          style={{
            fontSize: 9,
            fontFamily: "monospace",
            letterSpacing: "0.05em",
            background: allUnchecked || !canApply ? "none" : "#1e3340",
            color: allUnchecked || !canApply ? "#9aaba5" : "#fff",
            border: `1px solid ${allUnchecked || !canApply ? "#d0d5da" : "#1e3340"}`,
            borderRadius: 4,
            padding: "4px 10px",
            cursor: acceptLoading || allUnchecked || !canApply ? "default" : "pointer",
            opacity: acceptLoading ? 0.5 : 1,
          }}
        >
          {acceptLoading ? "Applying…" : checked && hasDiff ? "Apply 1 of 1 change" : "Apply 0 of 1 changes"}
        </button>
        <button
          type="button"
          onClick={() => onRejectProposal?.(proposal.id)}
          disabled={rejectLoading || !canReject}
          title={!canReject ? "Rejecting requires the reject capability" : undefined}
          style={{
            fontSize: 9,
            fontFamily: "monospace",
            letterSpacing: "0.05em",
            background: "none",
            color: "#9aaba5",
            border: "1px solid #d0d5da",
            borderRadius: 4,
            padding: "4px 10px",
            cursor: rejectLoading ? "default" : "pointer",
            opacity: rejectLoading ? 0.5 : 1,
          }}
        >
          {rejectLoading ? "Dismissing…" : "Dismiss"}
        </button>
      </div>
    </div>
  );
}

// ── SuggestEditLane ───────────────────────────────────────────────────────────
// Human edit lane: operator-authored proposal for declared opps (no LLM). The parent keeps which need
// is being authored (one lane open at a time, as the panel always did); the lane keeps its draft and
// submit state. Ruling 2 (2026-09-12): the success toast fires only when the handler resolved — a
// failed supersede/insert throws from the hook and renders here as toast.error(message).

export function SuggestEditLane({
  need,
  open,
  canSuggest,
  onOpen,
  onClose,
  onAuthorProposal,
}: {
  need: OdiNeedRow;
  open: boolean;
  canSuggest: boolean;
  onOpen: () => void;
  onClose: () => void;
  onAuthorProposal: (needId: string, authoredText: string) => Promise<void>;
}) {
  const [authorDraft, setAuthorDraft] = useState("");
  const [authorSubmitting, setAuthorSubmitting] = useState(false);
  useEffect(() => {
    if (open) setAuthorDraft(need.odi_canonical_statement ?? need.desired_outcome ?? "");
  }, [open, need.id]);

  return (
    <div style={{ marginTop: 6 }}>
      {open ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, maxWidth: 520 }}>
          <textarea
            value={authorDraft}
            onChange={(e) => setAuthorDraft(e.target.value)}
            placeholder="Rewrite the outcome statement…"
            rows={3}
            style={{ fontFamily: D.sans, fontSize: 13, lineHeight: 1.5, padding: "8px 10px", border: `1px solid ${D.hairlineFaint}`, borderRadius: 6, resize: "vertical", color: D.ink }}
          />
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              disabled={authorSubmitting || !authorDraft.trim()}
              onClick={async () => {
                setAuthorSubmitting(true);
                try {
                  await onAuthorProposal(need.id, authorDraft.trim());
                  toast.success("Edit staged for review");
                  setAuthorDraft("");
                  onClose();
                } catch (error) {
                  toast.error(String((error as Error | null)?.message ?? error));
                } finally {
                  setAuthorSubmitting(false);
                }
              }}
              style={{ fontSize: 10, fontFamily: D.mono, letterSpacing: "0.05em", background: (authorSubmitting || !authorDraft.trim()) ? "none" : "#1e3340", color: (authorSubmitting || !authorDraft.trim()) ? "#9aaba5" : "#fff", border: `1px solid ${(authorSubmitting || !authorDraft.trim()) ? "#d0d5da" : "#1e3340"}`, borderRadius: 4, padding: "4px 10px", cursor: (authorSubmitting || !authorDraft.trim()) ? "default" : "pointer" }}
            >
              {authorSubmitting ? "Submitting…" : "Submit edit"}
            </button>
            <button
              type="button"
              disabled={authorSubmitting}
              onClick={() => { setAuthorDraft(""); onClose(); }}
              style={{ fontSize: 10, fontFamily: D.mono, letterSpacing: "0.05em", background: "none", color: "#9aaba5", border: "1px solid #d0d5da", borderRadius: 4, padding: "4px 10px", cursor: "pointer" }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={onOpen}
          disabled={!canSuggest}
          title={!canSuggest ? "Suggesting requires the suggest capability" : undefined}
          style={{ fontSize: 10, color: "#7a8c85", background: "none", border: "none", cursor: canSuggest ? "pointer" : "default", padding: 0, textDecoration: "underline", opacity: canSuggest ? 1 : 0.5 }}
        >
          Suggest an edit
        </button>
      )}
    </div>
  );
}
