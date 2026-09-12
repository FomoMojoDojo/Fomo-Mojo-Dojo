// LIFT PARITY (Opportunities Tier 1, 2026-09-12) — the pending-proposal review section and the
// declared-opportunity author lane moved out of NeedsOrgPanel into workshop/opportunitiesShared.tsx.
// This mounts the real panel (hierarchy layout — the Edgewood layout) with one declared need, one
// public need carrying a pending proposal, and proves the tab still renders the same controls and
// forwards the same arguments to the same handler props as before the lift:
//   Suggest an edit → textarea prefilled → Submit edit → onAuthorProposal(needId, text) + success toast
//   Apply 1 of 1 change → onAcceptProposal(proposalId, needId, ["outcome_statement"], []); unchecked ⇒ disabled
//   Dismiss → onRejectProposal(proposalId)
//   Check for drift → onCheckSurfaceDrift("opportunity", needId)
//   capability false ⇒ Apply / Dismiss / Suggest disabled with the tab's titles
// plus ruling 2: a rejected author write ⇒ toast.error(message), no success toast, lane stays open.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, waitFor } from "@testing-library/react";
import Panel from "./NeedsOrgPanel";
import type { OdiNeedRow } from "@/hooks/useOdiNeeds";
import type { OpportunityProposalRow } from "@/hooks/useOpportunityProposals";

const caps = vi.hoisted(() => ({ value: true }));
vi.mock("@/hooks/useCapability", () => ({ useCapability: () => caps.value }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "u1" }, isAdmin: true }) }));
vi.mock("@/hooks/useDriftAssessment", () => ({ useDriftAssessment: () => ({ assessment: null, isLoading: false, error: null, markSeen: async () => {}, acceptAsAligned: async () => {}, setAssessment: () => {} }) }));
vi.mock("@/hooks/useIntegrityRecord", () => ({ useIntegrityRecord: () => ({ record: null, loading: false, error: null }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => { throw new Error("the panel must not write in these tests"); } } }));
const toasts = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast: toasts }));

const base: Omit<OdiNeedRow, "id" | "desired_outcome"> = { company_id: "c1", tier: "need", journey_key: "customer", step_number: 1, step_label: "Step 1", importance: 8, satisfaction: 3, opportunity_score: 13, service_state: "underserved", source_path: "x", frameworks_used: [], created_at: "2026-06-01T00:00:00Z", dependency_state: "fresh" };
const DECLARED: OdiNeedRow = { ...base, id: "need-d", desired_outcome: "Maximize the clarity of identified mental health challenges", odi_canonical_statement: "Maximize the clarity of identified mental health challenges when intake begins", provenance_type: "internal_declared", confidence: 0.95 };
const PUBLIC: OdiNeedRow = { ...base, id: "need-p", desired_outcome: "Reduce delays in families identifying funding sources", odi_canonical_statement: "Minimize the time to identify funding sources", provenance_type: "public_research" };
const PROPOSAL: OpportunityProposalRow = {
  id: "prop-1", surface_id: "need-p", company_id: "c1", status: "pending", reason: "Evidence moved.", created_at: "2026-09-01T00:00:00Z",
  current_state: { desired_outcome: PUBLIC.desired_outcome, odi_canonical_statement: PUBLIC.odi_canonical_statement },
  proposed_state: { desired_outcome: PUBLIC.desired_outcome, odi_canonical_statement: "Minimize the time to identify funding sources before intake" },
};
const button = (c: HTMLElement, text: string) => Array.from(c.querySelectorAll("button")).find((b) => (b.textContent || "").trim() === text);

function mount(over: Partial<React.ComponentProps<typeof Panel>> = {}) {
  const handlers = {
    onAuthorProposal: vi.fn(async (_id: string, _text: string) => {}),
    onAcceptProposal: vi.fn(),
    onRejectProposal: vi.fn(),
    onCheckSurfaceDrift: vi.fn(),
    onGenerateProposal: vi.fn(),
  };
  const utils = render(
    <Panel
      needs={[PUBLIC, DECLARED]}
      loading={false}
      updateNeedScores={async () => {}}
      companyId="c1"
      currentPhase="diagnose"
      hasHierarchy
      proposalsMap={new Map([[PROPOSAL.surface_id, PROPOSAL]])}
      {...handlers}
      {...over}
    />,
  );
  return { ...utils, handlers };
}

beforeEach(() => { caps.value = true; toasts.success.mockClear(); toasts.error.mockClear(); });

describe("NeedsOrgPanel after the Opportunities Tier 1 lift (hierarchy layout)", () => {
  it("Suggest an edit → prefilled textarea → Submit edit calls onAuthorProposal(needId, text) and toasts success", async () => {
    const { container, handlers } = mount();
    fireEvent.click(button(container, "Suggest an edit")!);
    const ta = container.querySelector("textarea") as HTMLTextAreaElement;
    expect(ta.value).toBe(DECLARED.odi_canonical_statement);
    fireEvent.change(ta, { target: { value: "  Maximize clarity at first contact  " } });
    fireEvent.click(button(container, "Submit edit")!);
    await waitFor(() => expect(handlers.onAuthorProposal).toHaveBeenCalledWith("need-d", "Maximize clarity at first contact"));
    await waitFor(() => expect(toasts.success).toHaveBeenCalledWith("Edit staged for review"));
    expect(toasts.error).not.toHaveBeenCalled();
    await waitFor(() => expect(container.querySelector("textarea")).toBeNull()); // lane closed
    expect(button(container, "Suggest an edit")).toBeTruthy();
  });

  it("ruling 2: a rejected author write ⇒ toast.error(message), no success toast, the lane stays open", async () => {
    const { container, handlers } = mount();
    handlers.onAuthorProposal.mockRejectedValueOnce(new Error("new row violates row-level security policy"));
    fireEvent.click(button(container, "Suggest an edit")!);
    fireEvent.click(button(container, "Submit edit")!);
    await waitFor(() => expect(toasts.error).toHaveBeenCalledWith("new row violates row-level security policy"));
    expect(toasts.success).not.toHaveBeenCalled();
    expect(container.querySelector("textarea")).not.toBeNull();
    expect(button(container, "Submit edit")!.disabled).toBe(false); // retry is possible
  });

  it("Cancel closes the lane without calling the handler", () => {
    const { container, handlers } = mount();
    fireEvent.click(button(container, "Suggest an edit")!);
    fireEvent.click(button(container, "Cancel")!);
    expect(container.querySelector("textarea")).toBeNull();
    expect(handlers.onAuthorProposal).not.toHaveBeenCalled();
  });

  it("Apply 1 of 1 change → onAcceptProposal(proposalId, needId, [outcome_statement], []); unchecked ⇒ 0 of 1 and disabled", () => {
    const { container, handlers } = mount();
    const apply = button(container, "Apply 1 of 1 change")!;
    expect(apply.disabled).toBe(false);
    fireEvent.click(apply);
    expect(handlers.onAcceptProposal).toHaveBeenCalledWith("prop-1", "need-p", ["outcome_statement"], []);
    fireEvent.click(container.querySelector('input[type="checkbox"]')!);
    const none = button(container, "Apply 0 of 1 changes")!;
    expect(none.disabled).toBe(true);
    expect(none.title).toBe("Select at least one field to apply");
  });

  it("Dismiss → onRejectProposal(proposalId)", () => {
    const { container, handlers } = mount();
    fireEvent.click(button(container, "Dismiss")!);
    expect(handlers.onRejectProposal).toHaveBeenCalledWith("prop-1");
  });

  it("Check for drift → onCheckSurfaceDrift('opportunity', needId) for every row", () => {
    const { container, handlers } = mount();
    const checks = Array.from(container.querySelectorAll("button")).filter((b) => (b.textContent || "").trim() === "Check for drift");
    expect(checks).toHaveLength(2);
    checks.forEach((b) => fireEvent.click(b));
    expect(handlers.onCheckSurfaceDrift.mock.calls.map((c) => c[1]).sort()).toEqual(["need-d", "need-p"]);
    expect(handlers.onCheckSurfaceDrift.mock.calls.every((c) => c[0] === "opportunity")).toBe(true);
  });

  it("the declared row keeps its human lane and the public row keeps the agent lane (Propose changes)", () => {
    const { container } = mount();
    expect(button(container, "Suggest an edit")).toBeTruthy(); // declared only
    // The public row carries a pending proposal, so the agent lane reads "Regenerate proposed changes".
    expect(Array.from(container.querySelectorAll("button")).filter((b) => /proposed? changes/i.test(b.textContent || ""))).toHaveLength(1); // public only
  });

  it("capability false ⇒ Apply, Dismiss and Suggest an edit are disabled with the tab's titles", () => {
    caps.value = false;
    const { container } = mount();
    const apply = button(container, "Apply 1 of 1 change")!;
    expect(apply.disabled).toBe(true);
    expect(apply.title).toBe("Approval requires the apply capability");
    const dismiss = button(container, "Dismiss")!;
    expect(dismiss.disabled).toBe(true);
    expect(dismiss.title).toBe("Rejecting requires the reject capability");
    const suggest = button(container, "Suggest an edit")!;
    expect(suggest.disabled).toBe(true);
    expect(suggest.title).toBe("Suggesting requires the suggest capability");
  });
});
