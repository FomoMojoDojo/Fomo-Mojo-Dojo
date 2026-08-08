// First Read outside-only — the open-questions read DROPS any silent_delta question whose anchored
// declared claim is uploaded-document-derived. Because useFirstReadOpenQuestions is the sole source
// for GapAct AND the export's Gap section, this one filter covers both. Falsification: the
// doc-anchored silent_delta question must NOT appear; a public-anchored one and a finding one must.
import { describe, it, expect, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

// Two silent_delta questions + one finding question. 'anc-doc' resolves to a delta whose declared
// claim is uploaded_file-backed → excluded; 'anc-ok' is public-backed → kept; the finding is untouched.
const QUESTIONS = [
  { question_text: "Does the doc-declared thing hold up outside?", source_kind: "silent_delta", finding_identity: null, anchor_identity: "anc-doc" },
  { question_text: "Does the told-us thing hold up outside?", source_kind: "silent_delta", finding_identity: null, anchor_identity: "anc-ok" },
  { question_text: "What does the public finding imply?", source_kind: "finding", finding_identity: "find-1", anchor_identity: "find-1" },
];
const DELTAS = [
  { content_identity: "anc-doc", declared_claim_id: "doc-claim", public_claim_id: null },
  { content_identity: "anc-ok", declared_claim_id: "ok-claim", public_claim_id: null },
];
const PROV_REFS = [
  { claim_id: "doc-claim", signal_id: "sig-file" },
  { claim_id: "ok-claim", signal_id: "sig-pub" },
];
const SIGNALS_SRC = [
  { id: "sig-file", source_type: "uploaded_file" },
  { id: "sig-pub", source_type: "public_baseline_run" },
];

vi.mock("@/integrations/supabase/client", () => {
  const make = (table: string) => {
    // deno-lint-ignore no-explicit-any
    const b: any = {
      select: () => b,
      eq: () => b, in: () => b, not: () => b, order: () => b, limit: () => b, gte: () => b, or: () => b, abortSignal: () => b,
      maybeSingle: async () => ({ data: null, error: null }),
      then: (res: (v: { data: unknown[]; error: null }) => unknown) => {
        let data: unknown[] = [];
        if (table === "first_read_open_questions") data = QUESTIONS;
        else if (table === "claim_deltas") data = DELTAS;
        else if (table === "claim_signal_refs") data = PROV_REFS;
        else if (table === "signals") data = SIGNALS_SRC;
        return res({ data, error: null });
      },
    };
    return b;
  };
  return { supabase: { from: (t: string) => make(t) } };
});

import { useFirstReadOpenQuestions } from "./useFirstReadOpenQuestions";

describe("useFirstReadOpenQuestions — provenance filter (outside-only)", () => {
  it("drops the document-anchored silent_delta question; keeps the public one and the finding", async () => {
    const { result } = renderHook(() => useFirstReadOpenQuestions("co-1"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    const texts = result.current.questions;
    expect(texts).toContain("Does the told-us thing hold up outside?"); // public-backed → renders
    expect(texts).toContain("What does the public finding imply?");     // finding → untouched
    expect(texts).not.toContain("Does the doc-declared thing hold up outside?"); // uploaded-file → excluded
    expect(texts).toHaveLength(2);
  });
});
