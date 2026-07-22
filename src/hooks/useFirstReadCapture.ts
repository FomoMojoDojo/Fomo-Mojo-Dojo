// First Read · Gate 2 — capture-write data plumbing.
//
// Assembles the checkable items from the same sources Act 2 reads (standing
// findings, candidate markets, positioning differentiators), computes each
// item's identity via the SINGLE TS authority (contentIdentity =
// sha256(normalizeForHash(text)) — never reimplemented), and upserts verdict
// rows scoped to an OPEN session on the key (session_id, item_identity).
//
// The DB freeze/transition triggers are the backstop. This hook surfaces the
// freeze refusal as a graceful `frozen` state instead of a raw error.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useStandingFindings } from "@/hooks/useStandingFindings";
import { useMarketOptions } from "@/hooks/useMarketOptions";
import { usePositioningCanvas } from "@/hooks/usePositioningCanvas";
// The one identity authority. Same cross-runtime import the market portfolio uses.
import { contentIdentity } from "../../supabase/functions/_shared/contentIdentity.ts";
import { assembleCheckItems, type RawCheckItem } from "@/lib/firstRead/checkItems";

export type Verdict = "confirmed" | "corrected" | "rejected";

export interface CheckItem extends RawCheckItem {
  identity: string;
  verdict: Verdict | null;
  correctionText: string | null;
  capturedAt: string | null;
}

interface ResponseRow {
  item_identity: string;
  verdict: Verdict;
  correction_text: string | null;
  captured_at: string;
}

export interface CaptureTally {
  confirmed: number;
  corrected: number;
  rejected: number;
}

export function useFirstReadCapture(companyId?: string, sessionId?: string) {
  const { data: findingsData } = useStandingFindings(companyId);
  const { options: markets } = useMarketOptions(companyId);
  const { item: canvas } = usePositioningCanvas(companyId);

  const [base, setBase] = useState<Array<RawCheckItem & { identity: string }>>([]);
  const [responses, setResponses] = useState<Record<string, ResponseRow>>({});
  const [loading, setLoading] = useState(true);
  const [frozen, setFrozen] = useState(false);
  const [sessionStatus, setSessionStatus] = useState<string | null>(null);
  const identSeq = useRef(0);

  const raw = useMemo(
    () =>
      assembleCheckItems({
        findings: findingsData?.findings ?? [],
        markets: markets ?? [],
        differentiators: canvas?.unique_attributes ?? [],
      }),
    [findingsData, markets, canvas],
  );

  // Compute identities (async sha256) through the TS authority.
  useEffect(() => {
    const mySeq = ++identSeq.current;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const withIdentity = await Promise.all(
        raw.map(async (r) => ({ ...r, identity: await contentIdentity(r.text) })),
      );
      if (!cancelled && mySeq === identSeq.current) {
        setBase(withIdentity);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [raw]);

  const refetchResponses = useCallback(async () => {
    if (!sessionId) {
      setResponses({});
      setSessionStatus(null);
      return;
    }
    const [{ data: rows }, { data: sess }] = await Promise.all([
      supabase
        .from("first_read_responses")
        .select("item_identity, verdict, correction_text, captured_at")
        .eq("session_id", sessionId),
      supabase.from("first_read_sessions").select("status").eq("id", sessionId).maybeSingle(),
    ]);
    const map: Record<string, ResponseRow> = {};
    for (const r of ((rows ?? []) as unknown as ResponseRow[])) map[r.item_identity] = r;
    setResponses(map);
    const status = (sess as { status?: string } | null)?.status ?? null;
    setSessionStatus(status);
    setFrozen(!!status && status !== "open");
  }, [sessionId]);

  useEffect(() => {
    void refetchResponses();
  }, [refetchResponses]);

  const items = useMemo<CheckItem[]>(
    () =>
      base.map((b) => {
        const r = responses[b.identity];
        return {
          ...b,
          verdict: r?.verdict ?? null,
          correctionText: r?.correction_text ?? null,
          capturedAt: r?.captured_at ?? null,
        };
      }),
    [base, responses],
  );

  const tally = useMemo<CaptureTally>(() => {
    const t: CaptureTally = { confirmed: 0, corrected: 0, rejected: 0 };
    for (const r of Object.values(responses)) t[r.verdict] += 1;
    return t;
  }, [responses]);

  // Upsert a verdict on the open session. Returns null on success, or a short
  // human message on refusal (frozen session / empty correction backstop).
  const setVerdict = useCallback(
    async (item: CheckItem, verdict: Verdict, correctionText?: string): Promise<string | null> => {
      if (!sessionId || !companyId) return "No session.";
      const payload = {
        session_id: sessionId,
        company_id: companyId,
        item_kind: item.kind,
        item_ref: item.ref,
        item_identity: item.identity,
        item_text: item.text, // frozen verbatim at capture
        verdict,
        correction_text: verdict === "corrected" ? (correctionText?.trim() ?? null) : null,
      };
      const { error } = await supabase
        .from("first_read_responses")
        .upsert(payload, { onConflict: "session_id,item_identity" });
      if (error) {
        if (/frozen/i.test(error.message)) {
          setFrozen(true);
          return "This session is locked — the proposal has been issued. Verdicts can no longer change.";
        }
        return error.message;
      }
      await refetchResponses();
      return null;
    },
    [sessionId, companyId, refetchResponses],
  );

  return { items, tally, loading, frozen, sessionStatus, setVerdict, refetchResponses };
}
