// First Read (8-beat) adapter — the fixture→real seam.
//
// READ-ONLY: every query is a SELECT; this surface has no write path, so a
// frozen company (CB1) renders like any other. Missing data yields nulls and
// empty arrays — the beats render persisted-integrity empty states, never
// fixture content.
//
// Rulings applied here: R1 (score = outside-methodology rows ONLY; v1.1.0
// never surfaces), R2 (trivial facet map only), R4 (strength), R5 (gap
// vocabulary; publicly_silent off-surface), R6 (featured pointer authority:
// the single live outside_raised pointer — operator rows replace auto rows at
// write time — falls back to the newest strong outside signal).
// The First Read outside-only provenance gate applies: uploaded_file-derived
// claims are structurally excluded via the shared predicate.

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  clientVoiceClaimIds,
  isOwnDomainUrl,
  PUBLIC_PROVENANCE,
  uploadDerivedClaimIds,
} from "../../../../supabase/functions/_shared/firstReadProvenance";
import { deriveSourceTag } from "./deriveSourceTag";
import { bareHost, facetForTopic, strengthForSignal, verdictForDeltaType } from "./mapping";
import type { FirstReadPreviewData, FRGapPair, FRSignal } from "./types";
import { EMPTY_FIRST_READ } from "./types";

// Tables not yet in the generated Database types use the established
// loose-typing bypass, scoped to this module.
const loose = () => supabase as unknown as { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

const OUTSIDE_METHODOLOGY_PREFIX = "outside-";

type SignalRow = {
  id: string;
  evidence_excerpt: string | null;
  source_title: string | null;
  source_url: string | null;
  source_id: string | null;
  event_date: string | null;
  confidence_to_use: string | null;
};

/** Baseline-run read dates keyed by String(public_baseline_runs.id). */
async function loadRunDates(companyId: string): Promise<Map<string, string>> {
  const { data: runRows } = await supabase
    .from("public_baseline_runs")
    .select("id, created_at")
    .eq("company_id", companyId);
  return new Map(
    ((runRows ?? []) as Array<{ id: number; created_at: string }>).map((r) => [String(r.id), r.created_at]),
  );
}

/** Source tag for a public signal row (source-honesty ruling). */
function publicSignalTag(sig: SignalRow, runDates: Map<string, string>) {
  return deriveSourceTag({
    kind: "public_signal",
    sourceUrl: sig.source_url,
    sourceTitle: sig.source_title,
    runDate: sig.source_id ? runDates.get(sig.source_id) ?? null : null,
    eventDate: sig.event_date,
  });
}

async function loadSignals(
  companyId: string,
  runDates: Map<string, string>,
): Promise<{ signals: FRSignal[]; newestByClaim: Map<string, SignalRow> }> {
  const { data: sigRows } = await supabase
    .from("signals")
    .select("id, evidence_excerpt, source_title, source_url, source_id, event_date, confidence_to_use")
    .eq("company_id", companyId)
    .eq("signal_band", "outside")
    .eq("voice_class", "outside_voice_about_client")
    .is("superseded_at", null);
  const rows = (sigRows ?? []) as SignalRow[];

  // R4: strong = recurrence-confirmed across independent sources.
  const { data: recRows } = await loose()
    .from("signal_recurrence_verdicts")
    .select("signal_a_id, signal_b_id, verdict")
    .eq("company_id", companyId)
    .eq("verdict", "accepted");
  const confirmed = new Set<string>();
  for (const r of (recRows ?? []) as Array<{ signal_a_id: string; signal_b_id: string }>) {
    confirmed.add(r.signal_a_id);
    confirmed.add(r.signal_b_id);
  }

  const signals: FRSignal[] = rows
    .filter((r) => (r.evidence_excerpt ?? "").trim())
    .map((r) => ({
      id: r.id,
      text: (r.evidence_excerpt ?? "").trim(),
      sourceTag: publicSignalTag(r, runDates),
      eventDate: r.event_date,
      strength: strengthForSignal(r.confidence_to_use, confirmed.has(r.id)),
    }));

  const order = { strong: 0, moderate: 1, thin: 2 } as const;
  signals.sort((a, b) => {
    if (order[a.strength] !== order[b.strength]) return order[a.strength] - order[b.strength];
    return (b.eventDate ?? "").localeCompare(a.eventDate ?? "");
  });

  return { signals, newestByClaim: new Map() };
}

/** Newest supporting signal (source + event_date) for each claim id. */
async function newestSignalByClaim(claimIds: string[]): Promise<Map<string, SignalRow>> {
  const out = new Map<string, SignalRow>();
  if (!claimIds.length) return out;
  const { data: refs } = await supabase
    .from("claim_signal_refs")
    .select("claim_id, signal_id")
    .in("claim_id", claimIds);
  const refRows = (refs ?? []) as Array<{ claim_id: string; signal_id: string }>;
  const sigIds = [...new Set(refRows.map((r) => r.signal_id))];
  if (!sigIds.length) return out;
  const { data: sigs } = await supabase
    .from("signals")
    .select("id, evidence_excerpt, source_title, source_url, source_id, event_date, confidence_to_use")
    .in("id", sigIds)
    // R1: outside band only — an organization-band (e.g. uploaded) signal must never
    // supply the source tag for a public-record row.
    .eq("signal_band", "outside");
  const byId = new Map(((sigs ?? []) as SignalRow[]).map((s) => [s.id, s]));
  for (const r of refRows) {
    const s = byId.get(r.signal_id);
    if (!s) continue;
    const prior = out.get(r.claim_id);
    if (!prior || (s.event_date ?? "") > (prior.event_date ?? "")) out.set(r.claim_id, s);
  }
  return out;
}

/**
 * Shared provenance gate (R1): a claim is excluded if any backing signal is an uploaded
 * file (tier a) OR its own birth record cites an uploaded document (tier b) — so a
 * no-ref claim is resolved by its raw_payload, never assumed clean.
 */
async function uploadDerivedFor(claimRows: Array<{ id: string; raw_payload?: unknown }>): Promise<Set<string>> {
  if (!claimRows.length) return new Set();
  const { data: refs } = await supabase
    .from("claim_signal_refs")
    .select("claim_id, signal_id")
    .in("claim_id", claimRows.map((c) => c.id));
  const refRows = (refs ?? []) as Array<{ claim_id: string; signal_id: string }>;
  const sigIds = [...new Set(refRows.map((r) => r.signal_id))];
  const { data: sigs } = sigIds.length
    ? await supabase.from("signals").select("id, source_type").in("id", sigIds)
    : { data: [] };
  const srcBySig = new Map(
    ((sigs ?? []) as Array<{ id: string; source_type: string | null }>).map((s) => [s.id, s.source_type]),
  );
  return uploadDerivedClaimIds(refRows, srcBySig, claimRows);
}

export function useFirstReadPreviewData(companyId: string | undefined) {
  const [data, setData] = useState<FirstReadPreviewData>(EMPTY_FIRST_READ);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!companyId) {
      setData(EMPTY_FIRST_READ);
      setLoading(false);
      return;
    }
    (async () => {
      setLoading(true);
      setError(null);
      try {
        // ── Company identity ────────────────────────────────────────────────
        const { data: co } = await supabase
          .from("companies")
          .select("name, website")
          .eq("id", companyId)
          .maybeSingle();

        // ── Baseline-run read dates (source-honesty ruling) ────────────────
        const runDates = await loadRunDates(companyId);

        // ── Outside-voice signals + strength (beats 0 fallback + 2) ────────
        const { signals } = await loadSignals(companyId, runDates);

        // ── Act 1 (beat 1) — PUBLIC-ONLY ruling (2026-08-20): the company's own
        // PUBLIC voice. Rows are client-voice public claims: provenance =
        // 'public_observed' with a backing client_voice signal (or a legacy
        // NULL-voice signal on an own-domain URL — same shared rule the baseline
        // stamping guard uses). internal_declared/canvas/intake never render.
        // The R1 upload gate stays underneath as defense in depth.
        const companyHost = bareHost((co as { website?: string | null } | null)?.website ?? null);
        const { data: declRows } = await supabase
          .from("claims")
          .select("id, topic, statement, status, raw_payload, provenance, created_at")
          .eq("company_id", companyId)
          .eq("provenance", PUBLIC_PROVENANCE);
        const declaredAll = ((declRows ?? []) as Array<{
          id: string;
          topic: string | null;
          statement: string;
          status: string | null;
          raw_payload: unknown;
          provenance: string;
          created_at: string | null;
        }>).filter((c) => c.status === "active");
        const declDocExcluded = await uploadDerivedFor(declaredAll);

        // Voice classification + per-claim newest own-voice signal (its source tag).
        const { data: dRefs } = declaredAll.length
          ? await supabase.from("claim_signal_refs").select("claim_id, signal_id").in("claim_id", declaredAll.map((c) => c.id))
          : { data: [] };
        const dRefRows = (dRefs ?? []) as Array<{ claim_id: string; signal_id: string }>;
        const dSigIds = [...new Set(dRefRows.map((r) => r.signal_id))];
        const { data: dSigs } = dSigIds.length
          ? await supabase
              .from("signals")
              .select("id, evidence_excerpt, source_title, source_url, source_id, event_date, confidence_to_use, voice_class")
              .in("id", dSigIds)
          : { data: [] };
        const dSigById = new Map(
          ((dSigs ?? []) as Array<SignalRow & { voice_class: string | null }>).map((s) => [s.id, s]),
        );
        const ownVoiceIds = clientVoiceClaimIds(dRefRows, dSigById, companyHost);
        const ownSigByClaim = new Map<string, SignalRow>();
        for (const r of dRefRows) {
          const s = dSigById.get(r.signal_id);
          if (!s) continue;
          const vc = s.voice_class ?? null;
          const own =
            vc === "client_voice" || (vc === null && !!s.source_url && isOwnDomainUrl(s.source_url, companyHost));
          if (!own) continue;
          const prior = ownSigByClaim.get(r.claim_id);
          if (!prior || (s.event_date ?? "") > (prior.event_date ?? "")) ownSigByClaim.set(r.claim_id, s);
        }

        const declared = declaredAll
          .filter((c) => !declDocExcluded.has(c.id) && ownVoiceIds.has(c.id))
          .map((c) => {
            const sig = ownSigByClaim.get(c.id) ?? null;
            return {
              id: c.id,
              topic: c.topic,
              facet: facetForTopic(c.topic),
              statement: c.statement,
              // Public branch: the page it came from + the run read date.
              sourceTag: sig ? publicSignalTag(sig, runDates) : null,
            };
          });

        // ── Markets (beat 1) — accepted options + chosen-market fact ───────
        const { data: moRows } = await supabase
          .from("market_options")
          .select("id, executor_statement, job_statement, status, superseded_by_id, duplicate_of")
          .eq("company_id", companyId)
          .eq("status", "accepted")
          .is("superseded_by_id", null)
          .is("duplicate_of", null);
        const { data: chosenRow } = await loose()
          .from("operator_primary_selection")
          .select("item_id")
          .eq("company_id", companyId)
          .eq("domain", "market")
          .maybeSingle();
        const chosenId = (chosenRow as { item_id?: string } | null)?.item_id ?? null;
        const markets = ((moRows ?? []) as Array<{ id: string; executor_statement: string; job_statement: string | null }>)
          .map((m) => ({
            id: m.id,
            executorStatement: m.executor_statement,
            jobStatement: m.job_statement,
            chosen: m.id === chosenId,
          }));

        // ── Cold open (beat 0) — R6 authority chain ─────────────────────────
        let coldOpen: FirstReadPreviewData["coldOpen"] = null;
        const { data: featRows } = await loose()
          .from("first_read_featured_items")
          .select("item_identity, origin")
          .eq("company_id", companyId)
          .eq("theme_key", "outside_raised")
          .is("removed_at", null)
          .limit(1);
        const pointer = ((featRows ?? []) as Array<{ item_identity: string }>)[0] ?? null;
        if (pointer) {
          const { data: deltaRow } = await supabase
            .from("claim_deltas")
            .select("public_claim_id")
            .eq("company_id", companyId)
            .eq("pairing_kind", "public_vs_public") // GATE B-1: First Read = public pairing only
            .eq("content_identity", pointer.item_identity)
            .maybeSingle();
          const pubId = (deltaRow as { public_claim_id: string | null } | null)?.public_claim_id ?? null;
          if (pubId) {
            const { data: pubClaim } = await supabase
              .from("claims")
              .select("id, statement, status")
              .eq("id", pubId)
              .maybeSingle();
            const claim = pubClaim as { id: string; statement: string; status: string | null } | null;
            if (claim && claim.status !== "struck") {
              const newest = await newestSignalByClaim([claim.id]);
              const sig = newest.get(claim.id) ?? null;
              coldOpen = {
                text: claim.statement,
                sourceTag: sig ? publicSignalTag(sig, runDates) : null,
                eventDate: sig?.event_date ?? null,
              };
            }
          }
        }
        if (!coldOpen) {
          const fallback = signals.find((s) => s.strength === "strong") ?? null;
          if (fallback) {
            coldOpen = { text: fallback.text, sourceTag: fallback.sourceTag, eventDate: fallback.eventDate };
          }
        }

        // ── Score (beat 3) — R1: OUTSIDE methodology rows only, never v1.1.0 ─
        const { data: scoreRows } = await supabase
          .from("mojo_scores")
          .select("total_score, computed_at, methodology_version")
          .eq("company_id", companyId)
          .like("methodology_version", `${OUTSIDE_METHODOLOGY_PREFIX}%`)
          .order("computed_at", { ascending: false })
          .limit(1);
        const scoreRow = ((scoreRows ?? []) as Array<{ total_score: number; computed_at: string; methodology_version: string }>)[0] ?? null;
        const score = scoreRow
          ? { value: Math.round(Number(scoreRow.total_score)), computedAt: scoreRow.computed_at, methodologyVersion: scoreRow.methodology_version }
          : null;

        // ── Gap pairs (beat 4) — R5; doc-derived declared excluded ──────────
        const { data: deltaRows } = await supabase
          .from("claim_deltas")
          .select("id, delta_type, declared_claim_id, public_claim_id")
          .eq("company_id", companyId)
          .eq("pairing_kind", "public_vs_public") // GATE B-1: First Read = public pairing only
          .in("delta_type", ["echoed", "divergent", "internally_silent"]);
        const deltas = (deltaRows ?? []) as Array<{ id: string; delta_type: string; declared_claim_id: string | null; public_claim_id: string | null }>;
        const gapClaimIds = [
          ...new Set(
            deltas.flatMap((d) => [d.declared_claim_id, d.public_claim_id]).filter((x): x is string => !!x),
          ),
        ];
        const { data: gapClaims } = gapClaimIds.length
          ? await supabase.from("claims").select("id, statement, status, raw_payload, provenance").in("id", gapClaimIds)
          : { data: [] };
        const gapClaimById = new Map(
          ((gapClaims ?? []) as Array<{ id: string; statement: string; status: string | null; raw_payload?: unknown; provenance?: string | null }>).map((c) => [c.id, c]),
        );
        const declaredIdsInPairs = [...new Set(deltas.map((d) => d.declared_claim_id).filter((x): x is string => !!x))];
        // Every declared id goes through the gate — with its fetched payload when the claim
        // row resolved, bare otherwise (tier a still applies via refs either way).
        const pairDocExcluded = await uploadDerivedFor(
          declaredIdsInPairs.map((id) => gapClaimById.get(id) ?? { id }),
        );
        const publicNewest = await newestSignalByClaim(
          deltas.map((d) => d.public_claim_id).filter((x): x is string => !!x),
        );
        const gapPairs: FRGapPair[] = [];
        for (const d of deltas) {
          const verdict = verdictForDeltaType(d.delta_type);
          if (!verdict) continue;
          if (d.declared_claim_id && pairDocExcluded.has(d.declared_claim_id)) continue;
          // PUBLIC-ONLY: a pair whose declared side is not a public claim never renders
          // (say-anchored pairs re-appear after the Gate-B recompute re-bases them on
          // client-voice public claims).
          if (d.declared_claim_id) {
            const dc = gapClaimById.get(d.declared_claim_id);
            if (!dc || dc.provenance !== PUBLIC_PROVENANCE) continue;
          }
          const declaredClaim = d.declared_claim_id ? gapClaimById.get(d.declared_claim_id) : null;
          const publicClaim = d.public_claim_id ? gapClaimById.get(d.public_claim_id) : null;
          if (declaredClaim?.status === "struck" || publicClaim?.status === "struck") continue;
          if (!publicClaim) continue; // every rendered pair carries a record side
          const sig = d.public_claim_id ? publicNewest.get(d.public_claim_id) ?? null : null;
          gapPairs.push({
            id: d.id,
            verdict,
            declared: declaredClaim?.statement ?? null,
            record: publicClaim.statement,
            sourceTag: sig ? publicSignalTag(sig, runDates) : null,
            eventDate: sig?.event_date ?? null,
          });
        }
        const verdictOrder = { contradicted: 0, confirmed: 1, unspoken: 2 } as const;
        gapPairs.sort((a, b) => verdictOrder[a.verdict] - verdictOrder[b.verdict]);

        // ── GATE B-1: the gap's PERSISTED integrity state ───────────────────
        // Written by the public-kind delta finalize (integrity_runs, component
        // 'first_read_gap_pairs'). No row → not-yet; completed/skipped → looked;
        // failed → couldn't-check. The empty-beat line derives from THIS record,
        // never from array emptiness alone.
        let gapIntegrity: FirstReadPreviewData["gapIntegrity"] = "not_yet";
        const { data: intRows } = await loose()
          .from("integrity_runs")
          .select("status")
          .eq("company_id", companyId)
          .eq("component", "first_read_gap_pairs")
          .order("ran_at", { ascending: false })
          .limit(1);
        const intRow = ((intRows ?? []) as Array<{ status: string }>)[0] ?? null;
        if (intRow) gapIntegrity = intRow.status === "failed" ? "couldnt_check" : "looked_none";

        // Questions (beat 7) come from useFirstReadOpenQuestions in the view —
        // the ONE authority that applies the outside-only provenance gate.
        if (!cancelled) {
          setData({
            company: co ? { name: (co as { name: string }).name, website: (co as { website: string | null }).website } : null,
            coldOpen,
            declared,
            markets,
            signals,
            score,
            gapPairs,
            gapIntegrity,
            questions: [],
          });
          setLoading(false);
        }
      } catch (e) {
        if (!cancelled) {
          setError(String((e as Error)?.message ?? e));
          setData(EMPTY_FIRST_READ);
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  return { data, loading, error };
}
