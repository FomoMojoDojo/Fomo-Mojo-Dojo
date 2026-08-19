// PROOF GUARD — the signed held-out ledger line (operator-signed 2026-08-19)
// renders in the Declared-vs-Observed panel ONLY when the guard held at least
// one claim out. Signed copy verbatim, N=1 variant included in the signature;
// falsification-validated per standing law (the N=0 render must NOT carry it).

import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";

const fixture = {
  current: {} as Record<string, unknown>,
};

vi.mock("@/hooks/useStrategicDelta", () => ({
  useStrategicDelta: () => ({
    data: fixture.current,
    isLoading: false,
    setDisposition: vi.fn(),
    setClaimDeltaDisposition: vi.fn(),
    setClaimStatus: vi.fn(),
  }),
}));
vi.mock("@/hooks/useDeltaStepRun", () => ({
  useDeltaStepRun: () => ({ state: { status: "idle", target: null, done: 0, error: null }, start: vi.fn() }),
}));
vi.mock("@/components/strategy/OpenQuestionRecomputeControl", () => ({ default: () => null }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: vi.fn(), functions: { invoke: vi.fn() } } }));

import { StrategicDirectionDelta, proofGuardLedgerLine } from "./StrategicDirectionDelta";

const baseData = (proofGuardHeldOut: number) => ({
  internal: { strategicBet: [], recommendations: [], sourceReads: [] },
  publicThemes: [],
  dispositions: new Map(),
  currentRunId: null,
  alignmentTrend: [],
  publicVoiceDelta: { baselineRunId: null, currentRunId: null, newSources: [], droppedSources: [], shiftedSources: [] },
  claimDeltas: [
    {
      id: "delta-1", delta_type: "publicly_silent", pairing_basis: "judge_confirmed",
      judge_reason: null, operator_disposition: null,
      declared_statement: "We struggle with insufficient customer evidence.",
      public_statement: null, declared_claim_id: "claim-guarded", public_claim_id: null,
      declared_claim_status: "active", public_claim_status: null,
      declared_claim_provenance: "internal_declared", declared_attested_date: null,
    },
  ],
  struckClaims: [],
  claimStatusById: new Map(),
  proofGuardHeldOut,
});

const SIGNED_N1 = "1 research-question claim held out of pairing — public reading can't answer it.";

describe("proof-guard signed ledger line", () => {
  it("renders the SIGNED N=1 string verbatim when the guard held one claim out", () => {
    fixture.current = baseData(1);
    const { getByText } = render(<StrategicDirectionDelta companyId="co-1" />);
    expect(getByText(SIGNED_N1)).toBeTruthy();
  });

  it("FALSIFICATION: no held-out claims (N=0) — the line is absent from the rendered tree", () => {
    fixture.current = baseData(0);
    const { queryByText } = render(<StrategicDirectionDelta companyId="co-1" />);
    expect(queryByText(SIGNED_N1)).toBeNull();
    expect(queryByText(/held out of pairing/)).toBeNull();
  });

  it("plural form is the signed plural copy verbatim", () => {
    expect(proofGuardLedgerLine(2)).toBe("2 research-question claim(s) held out of pairing — public reading can't answer them.");
    expect(proofGuardLedgerLine(1)).toBe(SIGNED_N1);
  });
});
