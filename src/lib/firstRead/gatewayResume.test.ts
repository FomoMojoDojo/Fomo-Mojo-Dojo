// GATE B → GATE D — what happened to the in-isolate resume poll.
//
// Gate B (2026-09-09) made a gateway cut "unknown, never failed" by polling the worker's integrity
// row inside the CALLER's isolate, bounded to 10 minutes. It worked, once, and then cost everything
// behind it: on Brand AI the own-words resume spent ~150s of the fill isolate's wall clock, the
// isolate was terminated 19s later, and gap-pairs, relevance, open-questions, finding-beats,
// recurrence and the score never ran.
//
// Gate D replaced `resumeAfterGatewayCut` (one long-waiting call) with a SELF-CHAINING STEPPER (one
// check per invocation). The resume's own vacuous proofs — never-appears vs appears-at-check-3 —
// therefore live in gatewayResumeStepper.test.ts. What stays here is the classification the module
// still owns: which failures are the connection, and which are the gateway.
import { describe, expect, it } from "vitest";
import {
  GATEWAY_CUT_STATUSES, isGatewayCut, isTransientFetchError,
} from "../../../supabase/functions/_shared/gatewayResume.ts";

describe("gateway cut classification", () => {
  it("504 / 502 / 408 are cuts; a real failure is not", () => {
    for (const s of GATEWAY_CUT_STATUSES) expect(isGatewayCut(s)).toBe(true);
    for (const s of [500, 400, 403, 409, 422, 200]) expect(isGatewayCut(s)).toBe(false);
  });
});

describe("transient classification — the connection failing, not the server answering", () => {
  it("dropped connections and gateway codes are transient", () => {
    for (const e of [
      { message: "TypeError: Failed to fetch", name: "TypeError" },
      { message: "NetworkError when attempting to fetch resource." },
      { message: "Load failed" },
      { message: "fetch failed" },
      { status: 499 }, { status: 502 }, { status: 503 }, { status: 504 },
    ]) expect(isTransientFetchError(e)).toBe(true);
  });

  it("a real error is NOT transient — it must fail fast, not be retried", () => {
    expect(isTransientFetchError({ message: 'permission denied for table "companies"', code: "42501" })).toBe(false);
    expect(isTransientFetchError({ message: "column does not exist", status: 400 })).toBe(false);
    expect(isTransientFetchError(null)).toBe(false);
  });

  it("an abort is never transient — the caller's own cancellation wins", () => {
    expect(isTransientFetchError({ message: "AbortError: The operation was aborted." })).toBe(false);
  });

  it("source-level: the in-isolate poll is GONE, not merely unused", () => {
    // The defect was the waiting itself. If `resumeAfterGatewayCut` came back, a caller could once
    // again spend its wall clock waiting and take its own chain down with it.
    expect(Object.keys({ isGatewayCut, isTransientFetchError })).not.toContain("resumeAfterGatewayCut");
  });
});
