// ── C5 (ruling, 2026-11-06): the opportunity-proposal accept must not invoke on a stamped row ────
//
// WHY. Accepting a proposal stamps operator_edited_at (Q3), so the server's subject gate refuses the
// row — the evaluate-opportunity-alignment call that followed could only ever produce a refusal row.
// The handler already skipped the call for `internal_declared` subjects for exactly this reason
// ("the round-trip is wasted"); C5 adds operator authorship as the second wasted-round-trip reason.
//
// THE CONTROL IS THE POINT. The second test is a row whose operator_edited_at is NULL: it must STILL
// invoke. Without it this guard would pass just as well against a handler that never invokes at all,
// which is the vacuous failure mode — and it is also the live behaviour spec b2 pins (guardWrites
// intercepts the PATCH, so the stamp never lands in the DB and its re-read legitimately sees NULL).
import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

const NEED = "99999999-0000-4000-8000-00000000nd01".replace("nd01", "0d01");
const PROPOSAL = "88888888-0000-4000-8000-000000000001";
const CO = "77777777-0000-4000-8000-000000000001";

/** What the post-update re-read of odi_needs returns — the one row the skip decides on. */
let gateRow: { provenance_type: string | null; operator_edited_at: string | null };
const invokes: Array<{ name: string; body: unknown }> = [];

vi.mock("@/integrations/supabase/client", () => {
  const chain = () => {
    const c: Record<string, unknown> = {
      select: () => c,
      eq: () => c,
      update: () => c,
      maybeSingle: () => Promise.resolve({ data: gateRow, error: null }),
      then: (res: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(res),
    };
    return c;
  };
  return {
    supabase: {
      from: () => chain(),
      functions: {
        invoke: (name: string, opts?: { body?: unknown }) => {
          invokes.push({ name, body: opts?.body });
          return Promise.resolve({ data: null, error: null });
        },
      },
    },
  };
});
vi.mock("@/lib/baselineCapture", () => ({ captureBaseline: () => Promise.resolve() }));
vi.mock("@/lib/manualInlineEdit", () => ({ saveManualEdit: () => Promise.resolve() }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "u-1" } }) }));
vi.mock("@/hooks/useCapability", () => ({ useCapability: () => true }));
vi.mock("@/hooks/useOpportunityProposals", () => ({
  useOpportunityProposals: () => ({
    proposals: new Map([[NEED, {
      id: PROPOSAL,
      surface_id: NEED,
      proposed_state: { desired_outcome: "Minimize the time to a first reply", odi_canonical_statement: "Minimize the time to a first reply — rewritten" },
    }]]),
  }),
}));

import { useOpportunityProposalHandlers } from "@/hooks/useOpportunityProposalHandlers";

async function accept() {
  const { result } = renderHook(() => useOpportunityProposalHandlers(CO, () => {}));
  await act(async () => {
    await result.current.handleAcceptOpportunityProposal(PROPOSAL, NEED, ["outcome_statement"], []);
  });
}

describe("C5 — accepting an opportunity proposal does not invoke on an operator-edited row", () => {
  beforeEach(() => { invokes.length = 0; });

  it("PLANT: the row carries operator_edited_at → ZERO evaluate-opportunity-alignment invokes", async () => {
    gateRow = { provenance_type: "public_research", operator_edited_at: "2026-11-06T00:00:00.000Z" };
    await accept();
    expect(invokes.filter((i) => i.name === "evaluate-opportunity-alignment")).toEqual([]);
  });

  it("CONTROL: operator_edited_at is NULL → the invoke STILL fires (the guard is not vacuous)", async () => {
    gateRow = { provenance_type: "public_research", operator_edited_at: null };
    await accept();
    const fired = invokes.filter((i) => i.name === "evaluate-opportunity-alignment");
    expect(fired).toHaveLength(1);
    expect(fired[0].body).toEqual({ need_id: NEED, company_id: CO });
  });

  it("a blank string is not a stamp — it must not suppress the invoke", async () => {
    // Mirrors isOperatorEdited's trim: only a real timestamp is authorship.
    gateRow = { provenance_type: "public_research", operator_edited_at: "   " };
    await accept();
    expect(invokes.filter((i) => i.name === "evaluate-opportunity-alignment")).toHaveLength(1);
  });

  it("the pre-existing internal_declared skip still holds, independently of the flag", async () => {
    gateRow = { provenance_type: "internal_declared", operator_edited_at: null };
    await accept();
    expect(invokes.filter((i) => i.name === "evaluate-opportunity-alignment")).toEqual([]);
  });
});
