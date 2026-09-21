// Gate B commit 2b (R19–R35, 2026-09-21) — the client-side predicates behind M1 / M2 / M3 and "Change speaker":
//   canInferMarket: an unplaced CUSTOMER record with no run in flight, whatever its history (R23);
//   placedByInference: the M3 line only when the last placing basis entry is an inference;
//   inFlightIdsFrom: a planned row bumped within 5 minutes = in flight (the same rule as the SQL predicate);
//   canChangeSpeaker: hidden while in flight.
// Plants: canInferMarket ignoring speaker_role (a stakeholder row offers M1); inFlightIdsFrom ignoring ran_at
// (a stale row keeps the row "Inferring market…" forever); placedByInference ignoring a later operator_override.
import { describe, it, expect } from "vitest";
import { canChangeSpeaker, canInferMarket, inFlightIdsFrom, INFERENCE_STALE_MS, lastRunFailed, lastRunFoundNoMajority, placedByInference, type InterviewUploadRecord } from "./useInterviewUploads";

const rec = (extra: Partial<InterviewUploadRecord> = {}): InterviewUploadRecord => ({ id: "r1", input_file_id: "f1", speaker_role: "market_participant", market_state: "unplaced", journey_key: null, market_basis: [{ kind: "original", result: "none" }], review_state: "unreviewed", retracted_at: null, parsed_at: null, speaker_history: [], ...extra });

describe("commit 2b predicates", () => {
  it("M1: an unplaced customer record only — not a stakeholder, not a placed one, not a withdrawn one, not one in flight; R23: override history does not matter", () => {
    expect(canInferMarket(rec())).toBe(true);
    expect(canInferMarket(rec({ speaker_role: "client_stakeholder", market_state: "per_item" }))).toBe(false);
    expect(canInferMarket(rec({ market_state: "placed", journey_key: "k" }))).toBe(false);
    expect(canInferMarket(rec({ retracted_at: "2026-09-20T00:00:00Z" }))).toBe(false);
    expect(canInferMarket(rec(), new Set(["r1"]))).toBe(false);
    expect(canInferMarket(rec(), new Set(["other"]))).toBe(true);
    expect(canInferMarket(rec({ market_basis: [{ kind: "original", result: "none" }, { kind: "operator_override", journey_key: "k" }, { kind: "operator_override", journey_key: null }] }))).toBe(true);
  });
  it("M3: placed by inference → the prefix line; a later Change market wins → the title alone", () => {
    expect(placedByInference(rec({ market_state: "placed", journey_key: "k", market_basis: [{ kind: "original", result: "none" }, { kind: "inference", result: "placed", journey_key: "k" }] }))).toBe(true);
    expect(placedByInference(rec({ market_state: "placed", journey_key: "k2", market_basis: [{ kind: "original", result: "none" }, { kind: "inference", result: "placed", journey_key: "k" }, { kind: "operator_override", journey_key: "k2" }] }))).toBe(false);
    expect(placedByInference(rec({ market_state: "placed", journey_key: "k", market_basis: [{ kind: "original", result: "none" }, { kind: "operator_override", journey_key: "k" }] }))).toBe(false);
    expect(placedByInference(rec({ market_state: "unplaced", market_basis: [{ kind: "inference", result: "not_inferred" }] }))).toBe(false);
  });
  it("in flight: a planned row bumped < 5 min ago; a stale one is not; 'Change speaker' hidden only while in flight", () => {
    const now = Date.parse("2026-09-21T12:00:00Z");
    const ids = inFlightIdsFrom([
      { surface_id: "fresh", ran_at: new Date(now - 60_000).toISOString() },
      { surface_id: "edge", ran_at: new Date(now - INFERENCE_STALE_MS + 1).toISOString() },
      { surface_id: "stale", ran_at: new Date(now - INFERENCE_STALE_MS).toISOString() },
      { surface_id: "old", ran_at: new Date(now - 6 * 60_000).toISOString() },
      { surface_id: null, ran_at: new Date(now).toISOString() },
    ], now);
    expect([...ids].sort()).toEqual(["edge", "fresh"]);
    expect(canChangeSpeaker(rec(), ids)).toBe(true);
    expect(canChangeSpeaker(rec({ id: "fresh" }), ids)).toBe(false);
    expect(canChangeSpeaker(rec({ id: "stale" }), ids)).toBe(true);
    expect(canChangeSpeaker(rec({ id: "fresh", parsed_at: "2026-09-21T00:00:00Z" }), new Set())).toBe(false);
  });
});

describe("M5 — lastRunFoundNoMajority", () => {
  it("true only when the LAST basis entry is an inference that found no majority; a row that never ran is false", () => {
    expect(lastRunFoundNoMajority(rec())).toBe(false);
    expect(lastRunFoundNoMajority(rec({ market_basis: [] }))).toBe(false);
    expect(lastRunFoundNoMajority(rec({ market_basis: [{ kind: "original", result: "none" }, { kind: "inference", result: "not_inferred" }] }))).toBe(true);
    expect(lastRunFoundNoMajority(rec({ market_basis: [{ kind: "original", result: "none" }, { kind: "inference", result: "failed" }] }))).toBe(false);
    expect(lastRunFoundNoMajority(rec({ market_basis: [{ kind: "inference", result: "not_inferred" }, { kind: "operator_override", journey_key: null }] }))).toBe(false);
    expect(lastRunFoundNoMajority(rec({ market_basis: [{ kind: "inference", result: "not_inferred" }, { kind: "inference", result: "placed", journey_key: "k" }] }))).toBe(false);
  });
});

describe("R42 — lastRunFailed", () => {
  it("true only when the LAST basis entry is a failed inference; an override or placement after it is false; never-run is false", () => {
    expect(lastRunFailed(rec())).toBe(false);
    for (const reason of ["window_error", "time_budget", "stale_no_progress", "context_overflow"]) expect(lastRunFailed(rec({ market_basis: [{ kind: "original", result: "none" }, { kind: "inference", result: "failed", failure_reason: reason }] }))).toBe(true);
    expect(lastRunFailed(rec({ market_basis: [{ kind: "inference", result: "failed" }, { kind: "operator_override", journey_key: "k" }] }))).toBe(false);
    expect(lastRunFailed(rec({ market_basis: [{ kind: "inference", result: "failed" }, { kind: "inference", result: "placed", journey_key: "k" }] }))).toBe(false);
    expect(lastRunFailed(rec({ market_basis: [{ kind: "inference", result: "not_inferred" }] }))).toBe(false);
  });
});
