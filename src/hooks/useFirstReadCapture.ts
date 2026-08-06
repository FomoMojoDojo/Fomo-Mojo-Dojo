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
import { useAsyncRead, type AsyncState } from "@/hooks/useAsyncRead";
import { useStandingFindings } from "@/hooks/useStandingFindings";
import { useMarketOptions } from "@/hooks/useMarketOptions";
import { usePositioningCanvas } from "@/hooks/usePositioningCanvas";
// The one identity authority. Same cross-runtime import the market portfolio uses.
import { contentIdentity } from "../../supabase/functions/_shared/contentIdentity.ts";
import { assembleCheckItems, type RawCheckItem } from "@/lib/firstRead/checkItems";
import { assembleDeltaItems, dropCollidingDeltas, type DeltaInput } from "@/lib/firstRead/deltaItems";

// OC-2: 'not_important' — surfaced as "True, but not a focus now" (V2-11 label; the
// constant lives in CheckControl). Its own verdict value beside reject, so the feed
// can map it to contest_kind='immaterial' (reject → 'disputed'). Never an overload of
// reject. 'corrected' is retained but DORMANT (V2-11 retired its render path).
export type Verdict = "confirmed" | "corrected" | "rejected" | "not_important";

// Stable empty reference for the derived deltaRaw — a fresh [] each render would churn
// the identity effect's deps. `deltaRaw` is this exact ref whenever the delta read is not
// ready (loading / error), preserving the pre-Gate-B "no deltas until loaded" behaviour.
const EMPTY_DELTA: RawCheckItem[] = [];

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
  // GATE C-2b — the sub-reads' loading/error are captured for the aggregate `readError` /
  // `readLoading` (HeardAct, Option 1). `findingsData` / `markets` / `canvas` are read exactly
  // as before; the extra fields are additive and change no existing consumer.
  const { data: findingsData, isLoading: findingsLoading, error: findingsError } = useStandingFindings(companyId);
  const { options: markets, loading: optionsLoading, error: optionsError } = useMarketOptions(companyId);
  const { item: canvas, loading: canvasLoading, error: canvasError } = usePositioningCanvas(companyId);

  const [base, setBase] = useState<Array<RawCheckItem & { identity: string }>>([]);
  const [responses, setResponses] = useState<Record<string, ResponseRow>>({});
  const [loading, setLoading] = useState(true);
  const [frozen, setFrozen] = useState(false);
  const [sessionStatus, setSessionStatus] = useState<string | null>(null);
  // GATE C-2b — the verdict-responses read's own loading/error, so the aggregate covers it too.
  const [responsesLoading, setResponsesLoading] = useState(true);
  const [responsesError, setResponsesError] = useState<string | null>(null);
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
  //
  // GATE B — this read now runs through useAsyncRead so its outcome is honest: a failed or
  // never-returning delta read is EXPOSED as `deltaState` (additive), instead of silently
  // collapsing to []. That matters because SayVsSeeExhibit renders its three signed
  // group-empty lines when the delta items are empty — a swallowed error was rendering
  // signed absence copy (e.g. "Everything you've told us turned up somewhere in what we've
  // read.") on a dropped connection. TheCheckAct gates the exhibit on `deltaState`.
  //
  // BACK-COMPAT (shared hook): `deltaRaw` derives from the SAME state — ready→data, else the
  // stable EMPTY_DELTA. On a primary-read error or timeout deltaRaw is [] exactly as before,
  // so `items`/`tally`/`loading` (read by HeardAct + ExportButton) are byte-identical to the
  // pre-Gate-B hook in every case. Sub-query (claims/refs/signals) failures keep their old
  // `?? []` swallow, so only the PRIMARY delta-read failure surfaces — matching prior `items`.
  const deltaState = useAsyncRead<RawCheckItem[]>(async (signal) => {
    if (!companyId) return EMPTY_DELTA;
    const { data: dData, error: dErr } = await supabase
      .from("claim_deltas")
      .select("id, delta_type, content_identity, declared_claim_id, public_claim_id")
      .eq("company_id", companyId)
      // Option B — internally_silent joins the read (rendered in its own observed-anchored
      // section; the say-anchored exhibit still filters to its three groups).
      .in("delta_type", ["echoed", "divergent", "publicly_silent", "internally_silent"])
      .abortSignal(signal);
    if (dErr) throw new Error(dErr.message);
    const dRows = (dData ?? []) as Array<{ id: string; delta_type: string; content_identity: string; declared_claim_id: string | null; public_claim_id: string | null }>;
    if (dRows.length === 0) return EMPTY_DELTA;

    const claimIds = [...new Set(dRows.flatMap((d) => [d.declared_claim_id, d.public_claim_id]).filter((x): x is string => !!x))];
    const { data: cData } = await supabase.from("claims").select("id, statement, provenance").in("id", claimIds).abortSignal(signal);
    const claimById = new Map(((cData ?? []) as Array<{ id: string; statement: string; provenance: string }>).map((c) => [c.id, c]));

    // Verbatim receipt on the SEE (public) claim: claim_signal_refs(supports) → signals.quote.
    const publicClaimIds = [...new Set(dRows.map((d) => d.public_claim_id).filter((x): x is string => !!x))];

    // Option B BACKING GUARD (read-side): which observed claims carry >=1 signal in the
    // OUTSIDE band. A public_observed claim with no outside-band signal is our own analysis
    // mis-stamped; internally_silent admits an item only if this set contains its claim, so
    // an unbacked observed statement can never render under "The record says:". ANY
    // relationship counts (the outside signals on these claims are typically 'qualifies').
    //
    // The SAME query resolves the attribution each item shows — source host AND Reported date,
    // both read off ONE backing signal per claim (the SAME-SIGNAL invariant: a host is never
    // paired with a date from a different signal). resolvedByClaim holds that one signal's
    // { source_url, event_date, precision, captured }. Resolution rule, preserving a986cda's
    // date exactly: the FIRST outside signal that carries an event_date, else the first outside
    // signal (undated → host present, date null). Once a dated signal is chosen it is never
    // superseded (a986cda "never overwrite the date"), so host follows to that same dated
    // signal. All of this is INDEPENDENT of any quote.
    const outsideBackedClaims = new Set<string>();
    const resolvedByClaim = new Map<string, { source_url: string | null; event_date: string | null; precision: string; captured: string | null }>();
    if (publicClaimIds.length) {
      const { data: bRefs } = await supabase
        .from("claim_signal_refs").select("claim_id, signal_id").in("claim_id", publicClaimIds).abortSignal(signal);
      const bRefRows = (bRefs ?? []) as Array<{ claim_id: string; signal_id: string }>;
      const bSigIds = [...new Set(bRefRows.map((r) => r.signal_id))];
      if (bSigIds.length) {
        const { data: bSigs } = await supabase
          .from("signals").select("id, source_url, event_date, event_date_precision, created_at").in("id", bSigIds).eq("signal_band", "outside").abortSignal(signal);
        const outsideSig = new Map(
          ((bSigs ?? []) as Array<{ id: string; source_url: string | null; event_date: string | null; event_date_precision: string | null; created_at: string | null }>).map((s) => [s.id, s]),
        );
        for (const r of bRefRows) {
          const s = outsideSig.get(r.signal_id);
          if (!s) continue;
          outsideBackedClaims.add(r.claim_id);
          const cur = resolvedByClaim.get(r.claim_id);
          // First outside signal seeds the resolution; a first DATED signal supersedes an
          // earlier UNDATED one (so host+date land on the dated signal together). A dated
          // resolution is never superseded again — first-dated wins, matching a986cda.
          if (!cur || (!cur.event_date && s.event_date)) {
            resolvedByClaim.set(r.claim_id, {
              source_url: s.source_url ?? null,
              event_date: s.event_date ?? null,
              precision: s.event_date_precision ?? "day",
              captured: s.created_at ?? null,
            });
          }
        }
      }
    }

    const quoteByClaim = new Map<string, { quote: string; quote_source_text: string | null; event_date: string | null }>();
    if (publicClaimIds.length) {
      const { data: refs } = await supabase.from("claim_signal_refs").select("claim_id, signal_id").in("claim_id", publicClaimIds).eq("relationship", "supports").abortSignal(signal);
      const refRows = (refs ?? []) as Array<{ claim_id: string; signal_id: string }>;
      const sigIds = [...new Set(refRows.map((r) => r.signal_id))];
      if (sigIds.length) {
        const { data: sigs } = await supabase.from("signals").select("id, quote, quote_source_text, event_date").in("id", sigIds).not("quote", "is", null).abortSignal(signal);
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
      const rs = d.public_claim_id ? resolvedByClaim.get(d.public_claim_id) : null;
      return {
        id: d.id, delta_type: d.delta_type, content_identity: d.content_identity,
        declared_statement: decl?.statement ?? null, public_statement: pub?.statement ?? null,
        public_provenance: pub?.provenance ?? null,
        quote: q?.quote ?? null, quote_source_text: q?.quote_source_text ?? null, event_date: q?.event_date ?? null,
        has_outside_signal: d.public_claim_id ? outsideBackedClaims.has(d.public_claim_id) : false,
        // Attribution — host AND date from the SAME resolved backing signal (same-signal rule).
        reported_event_date: rs?.event_date ?? null,
        reported_precision: (rs?.precision as "day" | "month" | undefined) ?? null,
        captured_at: rs?.captured ?? null,
        source_url: rs?.source_url ?? null,
      };
    });
    return assembleDeltaItems(inputs);
  }, [companyId]);
  const deltaRaw = deltaState.status === "ready" ? deltaState.data : EMPTY_DELTA;

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
      setResponsesLoading(false);
      setResponsesError(null);
      return;
    }
    setResponsesLoading(true);
    setResponsesError(null);
    const [{ data: rows, error: rowsErr }, { data: sess, error: sessErr }] = await Promise.all([
      supabase
        .from("first_read_responses")
        .select("item_identity, verdict, correction_text, captured_at")
        .eq("session_id", sessionId),
      supabase.from("first_read_sessions").select("status").eq("id", sessionId).maybeSingle(),
    ]);
    // GATE C-2b — a returning error on either read is exposed for the aggregate (responses is
    // the read HEARD_EMPTY most depends on). `responses` / `frozen` / `sessionStatus` are set
    // exactly as before, so items/tally/frozen stay byte-identical for TheCheckAct/ExportButton.
    if (rowsErr || sessErr) setResponsesError((rowsErr ?? sessErr)!.message);
    const map: Record<string, ResponseRow> = {};
    for (const r of ((rows ?? []) as unknown as ResponseRow[])) map[r.item_identity] = r;
    setResponses(map);
    const status = (sess as { status?: string } | null)?.status ?? null;
    setSessionStatus(status);
    setFrozen(!!status && status !== "open");
    setResponsesLoading(false);
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

  // GATE C-2b — AGGREGATE read-error / read-loading (Option 1, operator-signed) for HeardAct.
  // Covers EVERY sub-read this hook performs — the base sub-hooks (findings / markets / canvas),
  // the say-vs-see delta read, AND the verdict-responses read — so it can never report healthy
  // while a read it depends on has failed. Both are ADDITIVE: TheCheckAct (reads deltaState +
  // items/tally/loading/frozen) and ExportButton (reads items/tally/loading) do NOT read them,
  // so their behaviour — including ExportButton's hung-read-keeps-export-DISABLED invariant — is
  // byte-identical. HeardAct gates its render on these via useReadState + <ActData>.
  const deltaError = deltaState.status === "error" ? deltaState.error : null;
  const readError = findingsError ?? optionsError ?? canvasError ?? deltaError ?? responsesError ?? null;
  const readLoading =
    loading || findingsLoading || optionsLoading || canvasLoading || deltaState.status === "loading" || responsesLoading;

  // `deltaState` is ADDITIVE — the say-vs-see read's honest outcome for TheCheckAct to
  // gate its exhibit through <ActData>. Existing consumers (HeardAct, ExportButton) do not
  // read it and see byte-identical items/tally/loading.
  return { items, tally, loading, frozen, sessionStatus, setVerdict, refetchResponses, deltaState, readError, readLoading };
}

export type { AsyncState };
