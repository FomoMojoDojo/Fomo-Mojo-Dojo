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
import { assembleDeltaItems, dropCollidingDeltas, type DeltaInput } from "@/lib/firstRead/deltaItems";

// OC-2: 'not_important' — "True — but not important to us". Its own verdict value
// beside reject, so the feed can map it to contest_kind='immaterial' (reject →
// 'disputed'). Never an overload of reject.
export type Verdict = "confirmed" | "corrected" | "rejected" | "not_important";

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
  not_important: number;
}

// OC-2c — verdict-change mechanics. A mis-click is recoverable: tapping a DIFFERENT
// verdict on the same finding REPLACES the stored one (an in-place upsert on the
// (session, item) key — one verdict per finding, never a second row). Tapping the
// SAME verdict again is a NO-OP: it must not churn the row (rewrite captured_at,
// re-fire the freeze trigger). This pure predicate decides "skip the write"; the
// upsert only runs when it returns false.
// Shown when a write/delete is refused because the read was shared (frozen) at issuance.
// V2-10 rider: softened to match the swept room language (no lock/session machinery).
// PENDING OPERATOR SIGNATURE.
const LOCKED_MSG =
  "This read has been shared with the client — verdicts are part of the record now.";

export function isVerdictNoop(
  current: { verdict: Verdict | null; correctionText: string | null },
  next: Verdict,
  nextText?: string,
): boolean {
  if (current.verdict !== next) return false;
  // 'corrected' additionally carries text — a changed correction is a real write.
  if (next === "corrected") {
    return (nextText?.trim() ?? null) === (current.correctionText ?? null);
  }
  return true;
}

export function useFirstReadCapture(
  companyId?: string,
  sessionId?: string,
  // FR-V2-1 lazy-mint: when there is no session yet, the first verdict calls this to
  // mint one (single-flight, owned by the rail) and record against the new id.
  ensureSessionId?: () => Promise<string>,
) {
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

  // V2-7 — the say-vs-see delta items (kind='delta'), fetched + register-guarded here so
  // they carry the SAME verdict/tally/feed machinery as findings. Identity is the delta's
  // content_identity (a distinct construction), joined to a verbatim quote on the see side.
  const [deltaRaw, setDeltaRaw] = useState<RawCheckItem[]>([]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!companyId) { setDeltaRaw([]); return; }
      const { data: dData } = await supabase
        .from("claim_deltas")
        .select("id, delta_type, content_identity, declared_claim_id, public_claim_id")
        .eq("company_id", companyId)
        .in("delta_type", ["echoed", "divergent", "publicly_silent"]);
      const dRows = (dData ?? []) as Array<{ id: string; delta_type: string; content_identity: string; declared_claim_id: string | null; public_claim_id: string | null }>;
      if (dRows.length === 0) { if (!cancelled) setDeltaRaw([]); return; }

      const claimIds = [...new Set(dRows.flatMap((d) => [d.declared_claim_id, d.public_claim_id]).filter((x): x is string => !!x))];
      const { data: cData } = await supabase.from("claims").select("id, statement, provenance").in("id", claimIds);
      const claimById = new Map(((cData ?? []) as Array<{ id: string; statement: string; provenance: string }>).map((c) => [c.id, c]));

      // Verbatim receipt on the SEE (public) claim: claim_signal_refs(supports) → signals.quote.
      const publicClaimIds = [...new Set(dRows.map((d) => d.public_claim_id).filter((x): x is string => !!x))];
      const quoteByClaim = new Map<string, { quote: string; quote_source_text: string | null; event_date: string | null }>();
      if (publicClaimIds.length) {
        const { data: refs } = await supabase.from("claim_signal_refs").select("claim_id, signal_id").in("claim_id", publicClaimIds).eq("relationship", "supports");
        const refRows = (refs ?? []) as Array<{ claim_id: string; signal_id: string }>;
        const sigIds = [...new Set(refRows.map((r) => r.signal_id))];
        if (sigIds.length) {
          const { data: sigs } = await supabase.from("signals").select("id, quote, quote_source_text, event_date").in("id", sigIds).not("quote", "is", null);
          const sigById = new Map(((sigs ?? []) as Array<{ id: string; quote: string; quote_source_text: string | null; event_date: string | null }>).map((s) => [s.id, s]));
          for (const r of refRows) {
            if (quoteByClaim.has(r.claim_id)) continue;
            const s = sigById.get(r.signal_id);
            if (s?.quote) quoteByClaim.set(r.claim_id, { quote: s.quote, quote_source_text: s.quote_source_text, event_date: s.event_date });
          }
        }
      }

      const inputs: DeltaInput[] = dRows.map((d) => {
        const decl = d.declared_claim_id ? claimById.get(d.declared_claim_id) : null;
        const pub = d.public_claim_id ? claimById.get(d.public_claim_id) : null;
        const q = d.public_claim_id ? quoteByClaim.get(d.public_claim_id) : null;
        return {
          id: d.id, delta_type: d.delta_type, content_identity: d.content_identity,
          declared_statement: decl?.statement ?? null, public_statement: pub?.statement ?? null,
          public_provenance: pub?.provenance ?? null,
          quote: q?.quote ?? null, quote_source_text: q?.quote_source_text ?? null, event_date: q?.event_date ?? null,
        };
      });
      if (!cancelled) setDeltaRaw(assembleDeltaItems(inputs));
    })();
    return () => { cancelled = true; };
  }, [companyId]);

  // Compute identities (async sha256) through the TS authority, then MERGE the delta items
  // (identity already set). COLLISION DETECTION: a delta whose identity happens to equal a
  // non-delta (finding) identity is DROPPED — the shared tally/response key
  // (session_id, item_identity) must never conflate two different items under one verdict.
  useEffect(() => {
    const mySeq = ++identSeq.current;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const hashed = await Promise.all(
        raw.map(async (r) => ({ ...r, identity: r.identity ?? (await contentIdentity(r.text)) })),
      );
      const nonDeltaIds = new Set(hashed.map((h) => h.identity));
      const deltas = dropCollidingDeltas(deltaRaw, nonDeltaIds) as Array<RawCheckItem & { identity: string }>;
      if (!cancelled && mySeq === identSeq.current) {
        setBase([...hashed, ...deltas]);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [raw, deltaRaw]);

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
    const t: CaptureTally = { confirmed: 0, corrected: 0, rejected: 0, not_important: 0 };
    for (const r of Object.values(responses)) t[r.verdict] += 1;
    return t;
  }, [responses]);

  // Set / toggle a verdict on the open session. Returns null on success, or a short
  // human message on refusal (frozen session / empty correction backstop).
  const setVerdict = useCallback(
    async (item: CheckItem, verdict: Verdict, correctionText?: string): Promise<string | null> => {
      if (!companyId) return "No session.";
      // FR-V2-1 lazy-mint: no session yet → mint one now (single-flight), record against
      // it. `sid` is the effective session for THIS write; the rail's setSessionId (inside
      // ensureSessionId) re-inits the hook so its own refetch loads the new session's rows.
      let sid = sessionId ?? "";
      const lazyMinted = !sid;
      if (!sid && ensureSessionId) sid = await ensureSessionId();
      if (!sid) return "No session.";

      // TOGGLE-OFF (FR-UX-1): re-tapping the ALREADY-STORED verdict REMOVES the row —
      // the finding returns to unanswered (tally decrements, the in-place note and a
      // confirm's evidenced-lift stand down at render, since item.verdict → null). A
      // DIFFERENT verdict replaces in place (the upsert below). Post-issuance the
      // freeze trigger refuses this DELETE exactly as it refuses the upsert — no
      // audit trigger sits on first_read_responses, so an open-session delete is
      // clean and a frozen-session delete surfaces the locked state.
      if (isVerdictNoop({ verdict: item.verdict, correctionText: item.correctionText }, verdict, correctionText)) {
        const { error } = await supabase
          .from("first_read_responses")
          .delete()
          .eq("session_id", sid)
          .eq("item_identity", item.identity);
        if (error) {
          if (/frozen/i.test(error.message)) {
            await refetchResponses();
            return LOCKED_MSG;
          }
          return error.message;
        }
        await refetchResponses();
        return null;
      }

      const payload = {
        session_id: sid,
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
          // Re-read the session so its real status (and the frozen flag) replace
          // the now-stale 'open' the UI last saw — no raw error surfaces.
          await refetchResponses();
          return LOCKED_MSG;
        }
        return error.message;
      }
      // On a lazy-mint the hook's sessionId was empty, so refetchResponses would read
      // the wrong (empty) session; the rail's setSessionId re-inits the hook and its
      // effect refetches the new session. Otherwise refetch through the bound closure.
      if (!lazyMinted) await refetchResponses();
      return null;
    },
    [sessionId, companyId, refetchResponses, ensureSessionId],
  );

  return { items, tally, loading, frozen, sessionStatus, setVerdict, refetchResponses };
}
