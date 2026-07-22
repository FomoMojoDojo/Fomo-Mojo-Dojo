// First Read Gate 4 — proposal issuance + read.
//
// Reads the session's persisted proposal (renders deterministically on reload)
// and drives issuance via the generate-first-read-proposal edge function. On a
// generated result the session is already frozen + persisted server-side; this
// hook just re-reads. Honest-empty (write-time refusal) and generation failure
// leave the session open for retry — never a canned proposal.

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type ProposalSources = {
  open_question_indices?: number[];
  response_ids?: string[];
  score_ref?: string;
};

export type ProposalBlock = { key: string; heading: string; body: string; sources: ProposalSources };

export type Proposal = {
  status: "generated" | "empty";
  headline?: string | null;
  headline_sources?: ProposalSources | null;
  blocks?: ProposalBlock[];
  empty_reason?: string;
  bundle_summary?: unknown;
  generated_at?: string;
  trace?: { provider?: string; model?: string; endpoint?: string };
};

export type IssueResult = "generated" | "empty" | "error";

export function useFirstReadProposal(sessionId?: string) {
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [issuing, setIssuing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emptyRefusal, setEmptyRefusal] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!sessionId) {
      setProposal(null);
      setStatus(null);
      setLoading(false);
      return;
    }
    const { data } = await supabase
      .from("first_read_sessions")
      .select("status, proposal_json")
      .eq("id", sessionId)
      .maybeSingle();
    const row = data as { status?: string; proposal_json?: Proposal } | null;
    setStatus(row?.status ?? null);
    setProposal(row?.proposal_json ?? null);
    setLoading(false);
  }, [sessionId]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const issue = useCallback(async (): Promise<IssueResult> => {
    if (!sessionId) return "error";
    setIssuing(true);
    setError(null);
    setEmptyRefusal(null);
    const { data, error: invErr } = await supabase.functions.invoke("generate-first-read-proposal", {
      body: { session_id: sessionId },
    });
    setIssuing(false);
    if (invErr) {
      setError(invErr.message || "Proposal generation failed. Try again.");
      return "error";
    }
    const res = data as { status?: string; error?: string; empty_reason?: string } | null;
    if (res?.error) {
      setError(res.error);
      return "error";
    }
    if (res?.status === "empty") {
      setEmptyRefusal(res.empty_reason || "Nothing real to propose from yet.");
      return "empty";
    }
    // generated | issued (idempotent replay) — the session is frozen + persisted.
    await refetch();
    return "generated";
  }, [sessionId, refetch]);

  return { proposal, status, loading, issuing, error, emptyRefusal, issue, refetch };
}
