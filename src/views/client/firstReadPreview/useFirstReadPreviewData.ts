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
import { deriveSourceTag, formatFullDate } from "./deriveSourceTag";
import { isChannelJunk } from "./channelJunk";
import { bandForScore, SCORE_LEVERS } from "./scoreBands";
import { classifyFindingAge, orderFindings } from "./findingsAge";
import { bareHost, coldOpenLadder, facetForTopic, groupGapStatements, orderGapPairs, strengthForSignal, verdictForDeltaType } from "./mapping";
import type {
  FirstReadPreviewData,
  FRFinding,
  FRGapPair,
  FRMarketDef,
  FROwnWord,
  FRSignal,
  FRStatusSource,
} from "./types";
import { EMPTY_FIRST_READ } from "./types";

// A synthesized "what we see" object (canvas/cascade/market) tags as our public read
// plus the artifact's date — never a page URL (it is our synthesis, not a scraped page).
function syntheticTag(date: string | null): { label: string } | null {
  const d = formatFullDate(date);
  return d ? { label: `Public read · ${d}` } : { label: "Public read" };
}

// Tables not yet in the generated Database types use the established
// loose-typing bypass, scoped to this module.
const loose = () => supabase as unknown as { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

const OUTSIDE_METHODOLOGY_PREFIX = "outside-";

// GATE 6a (2026-08-22) LANDED: "Our read" positioning / strategy / promise now render from the
// public_reads table (public-only, ledgered, judged) — see the beat-9 derivation below. The old
// FIRST_READ_OUR_READ_PROVENANCE_GATE flag (and the market_read canvas/cascade it gated) is removed.

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

        const channelRowsAll = declaredAll
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
              junk: isChannelJunk(c.statement, sig?.source_title ?? null),
            };
          });
        // R3: junk rows (page titles / no-content notes) are hidden but their ids reported.
        const channelJunkIds = channelRowsAll.filter((c) => c.junk).map((c) => c.id);
        const declared = channelRowsAll
          .filter((c) => !c.junk)
          .map(({ junk: _junk, ...row }) => row);

        // ── OW-3: own words (beat 3 lead) — the company's own verbatim self-assertions,
        // written by the extractor as claim_type='own_words'. Tri-state by fidelity; page +
        // read-date tag. The demoted inference rows (`declared` above) render below them.
        const { data: owRows } = await supabase
          .from("claims")
          .select("id, statement, raw_payload, created_at")
          .eq("company_id", companyId)
          .eq("claim_type", "own_words")
          .eq("status", "active");
        type OwRow = { id: string; statement: string | null; raw_payload?: { page_url?: string; fidelity?: string; read_at?: string } | null; created_at: string | null };
        const ownWordsHiddenIds: string[] = [];
        const ownWords: FROwnWord[] = [];
        for (const c of (owRows ?? []) as OwRow[]) {
          const quote = (c.statement ?? "").trim();
          if (!quote) { ownWordsHiddenIds.push(c.id); continue; } // hidden bucket — reported, not silent
          const rp = c.raw_payload ?? {};
          const pageUrl = String(rp.page_url ?? "");
          const host = bareHost(pageUrl) || pageUrl;
          const readDate = formatFullDate(rp.read_at ?? c.created_at);
          ownWords.push({
            id: c.id, quote, pageUrl, pageHost: host,
            fidelity: rp.fidelity === "paraphrased" ? "paraphrased" : "verbatim",
            sourceTag: { label: `${host}${readDate ? ` · read ${readDate}` : ""}`.trim() },
          });
        }
        // verbatim lead, then paraphrased; stable by page then quote.
        ownWords.sort((a, b) =>
          (a.fidelity === b.fidelity ? 0 : a.fidelity === "verbatim" ? -1 : 1) ||
          a.pageHost.localeCompare(b.pageHost) || a.quote.localeCompare(b.quote));
        // Integrity: did the own-words extraction LOOK? (grounds the empty state.)
        const { data: owIntRows } = await loose()
          .from("integrity_runs").select("id")
          .eq("company_id", companyId).eq("component", "first_read_own_words").limit(1);
        const ownWordsLooked = ((owIntRows ?? []) as unknown[]).length > 0;

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

        // ── S3/S5: live status conflicts — pinned atop Questions + Findings, and the match
        // key marks disputed rows (gap pairs / findings / cold open). Loaded early so every
        // consumer below can flag itself.
        const { data: scRows } = await loose()
          .from("first_read_open_questions")
          .select("question_text, conflict_location, conflict_sources")
          .eq("company_id", companyId).eq("source_kind", "status_conflict").eq("status", "live");
        type SCRow = { question_text: string; conflict_location: string | null; conflict_sources: { closed?: FRStatusSource[]; open?: FRStatusSource[] } | null };
        const statusConflicts = ((scRows ?? []) as SCRow[]).map((r) => {
          const location = r.conflict_location ?? "";
          return {
            location,
            matchKey: location.split(/\s[&(]/)[0].trim().toLowerCase(),
            question: r.question_text,
            closed: r.conflict_sources?.closed ?? [],
            open: r.conflict_sources?.open ?? [],
          };
        }).filter((c) => c.matchKey.length > 2);
        const disputes = (text: string | null | undefined): boolean => {
          const t = (text ?? "").toLowerCase();
          return statusConflicts.some((c) => t.includes(c.matchKey));
        };

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
                statusDisputed: disputes(claim.statement),
              };
            }
          }
        }
        if (!coldOpen) {
          const fallback = signals.find((s) => s.strength === "strong") ?? null;
          if (fallback) {
            coldOpen = { text: fallback.text, sourceTag: fallback.sourceTag, eventDate: fallback.eventDate, statusDisputed: disputes(fallback.text) };
          }
        }

        // ── Score (beat 3) — R1: OUTSIDE methodology rows only, never v1.1.0 ─
        const { data: scoreRows } = await supabase
          .from("mojo_scores")
          .select("total_score, computed_at, methodology_version, component_scores, explanation")
          .eq("company_id", companyId)
          .like("methodology_version", `${OUTSIDE_METHODOLOGY_PREFIX}%`)
          .order("computed_at", { ascending: false })
          .limit(1);
        const scoreRow = ((scoreRows ?? []) as Array<{ total_score: number; computed_at: string; methodology_version: string; component_scores?: unknown; explanation?: unknown }>)[0] ?? null;
        const score = scoreRow
          ? { value: Math.round(Number(scoreRow.total_score)), computedAt: scoreRow.computed_at, methodologyVersion: scoreRow.methodology_version }
          : null;

        // ── Gap pairs (beat 4) — R5; doc-derived declared excluded ──────────
        const { data: deltaRows } = await loose()
          .from("claim_deltas")
          .select("id, delta_type, declared_claim_id, public_claim_id, judge_reason, conflict_explanation, conflict_explanation_grounded")
          .eq("company_id", companyId)
          .eq("pairing_kind", "public_vs_public") // GATE B-1: First Read = public pairing only
          // A1: the DECLARED-anchored say-vs-see. internally_silent (record-only) is off this surface.
          .in("delta_type", ["echoed", "divergent", "publicly_silent"]);
        const deltas = (deltaRows ?? []) as Array<{ id: string; delta_type: string; declared_claim_id: string | null; public_claim_id: string | null; judge_reason: string | null; conflict_explanation: string | null; conflict_explanation_grounded: boolean | null }>;
        const gapClaimIds = [
          ...new Set(
            deltas.flatMap((d) => [d.declared_claim_id, d.public_claim_id]).filter((x): x is string => !!x),
          ),
        ];
        const { data: gapClaims } = gapClaimIds.length
          ? await supabase.from("claims").select("id, statement, status, raw_payload, provenance, confidence").in("id", gapClaimIds)
          : { data: [] };
        const gapClaimById = new Map(
          ((gapClaims ?? []) as Array<{ id: string; statement: string; status: string | null; raw_payload?: unknown; provenance?: string | null; confidence?: string | null }>).map((c) => [c.id, c]),
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
        // Declared-side newest signal → the declared date for the derived contradiction "why".
        const declaredNewest = await newestSignalByClaim(declaredIdsInPairs);
        const confidenceRank = (c: string | null | undefined) =>
          ({ high: 3, medium: 2, low: 1 } as Record<string, number>)[(c ?? "").toLowerCase()] ?? 1;
        const gapPairs: FRGapPair[] = [];
        for (const d of deltas) {
          const verdict = verdictForDeltaType(d.delta_type);
          if (!verdict) continue;
          // A1: every beat-4 row is DECLARED-anchored — a public client-voice claim.
          if (!d.declared_claim_id || pairDocExcluded.has(d.declared_claim_id)) continue;
          const declaredClaim = gapClaimById.get(d.declared_claim_id);
          if (!declaredClaim || declaredClaim.provenance !== PUBLIC_PROVENANCE) continue;
          const publicClaim = d.public_claim_id ? gapClaimById.get(d.public_claim_id) : null;
          if (declaredClaim.status === "struck" || publicClaim?.status === "struck") continue;
          // unechoed (publicly_silent) has NO record side; confirmed/contradicted must carry one.
          if (verdict !== "unechoed" && !publicClaim) continue;
          const sig = d.public_claim_id ? publicNewest.get(d.public_claim_id) ?? null : null;
          // Evidence strength: from the record signal for confirmed/contradicted; from the
          // declared claim's confidence for the unechoed (record-silent) rows.
          const evidenceRank = verdict === "unechoed"
            ? confidenceRank(declaredClaim.confidence)
            : confidenceRank(sig?.confidence_to_use);
          gapPairs.push({
            id: d.id,
            statementId: d.declared_claim_id, // own-words id — beat 4 groups on this (unit = statement)
            verdict,
            declared: declaredClaim.statement,
            record: publicClaim?.statement ?? null,
            sourceTag: sig ? publicSignalTag(sig, runDates) : null,
            eventDate: sig?.event_date ?? null,
            recordHost: sig?.source_url ? bareHost(sig.source_url) : null,
            declaredDate: declaredNewest.get(d.declared_claim_id)?.event_date ?? null,
            judgeReason: d.judge_reason ?? null,
            // Only a GROUNDED fresh explanation reaches the render (tier 1 of the three-tier why).
            conflictExplanation: d.conflict_explanation_grounded === true ? (d.conflict_explanation ?? null) : null,
            evidenceRank,
            statusDisputed: disputes(`${declaredClaim.statement} ${publicClaim?.statement ?? ""}`),
          });
        }
        // A1 order — by discussability: contradicted → unechoed → confirmed; strength desc within.
        const orderedGapPairs = orderGapPairs(gapPairs);
        // 2026-08-21: the unit of echo is the STATEMENT — group the ordered pairs by own-words id.
        const gapStatements = groupGapStatements(orderedGapPairs);
        const gapCounts = {
          contradicted: gapStatements.filter((s) => s.verdict === "contradicted").length,
          unechoed: gapStatements.filter((s) => s.verdict === "unechoed").length,
          confirmed: gapStatements.filter((s) => s.verdict === "confirmed").length,
        };

        // ── Cold-open ladder (2026-08-22): conflict → echo gap → strongest signal (first match wins).
        // Rungs 1/2 override the strongest-signal fallback built above. The echo-gap counts are beat
        // 4's STATEMENT numbers (gapStatements / gapCounts) — the SAME source, never recomputed here.
        const { data: latestDeltaRun } = await supabase
          .from("claim_deltas")
          .select("computed_at")
          .eq("company_id", companyId)
          .eq("pairing_kind", "public_vs_public")
          .order("computed_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        const deltasRunDate = formatFullDate((latestDeltaRun as { computed_at?: string } | null)?.computed_at ?? null);
        const sc0 = statusConflicts[0] ?? null;
        coldOpen = coldOpenLadder({
          statusConflict: sc0 ? { location: sc0.location, closedCount: sc0.closed.length, openCount: sc0.open.length } : null,
          gap: gapStatements.length > 0 ? { statements: gapStatements.length, confirmed: gapCounts.confirmed, contradicted: gapCounts.contradicted } : null,
          deltasRunDate,
          fallback: coldOpen,
        });

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

        // ── "What we see" — public register only (public-beats gate, 2026-08-20) ──
        // Every object here is provenance public (public_inferred / public_research /
        // market_read), rendered labelled OUR READ. No internal/declared content.

        // Observed markets (R-A): odi_market_definitions in the public register, ODI form
        // (WHO + job). market_lens active fronts render first.
        const { data: mdRows } = await supabase
          .from("odi_market_definitions")
          .select("id, journey_key, job_executor, jtbd, market_register, created_at, updated_at")
          .eq("company_id", companyId)
          .in("market_register", ["public_inferred", "publicly_declared"]);
        const mdAll = (mdRows ?? []) as Array<{
          id: string; journey_key: string | null; job_executor: string | null; jtbd: string | null;
          market_register: string; created_at: string | null; updated_at: string | null;
        }>;
        const { data: lensRows } = await loose()
          .from("market_lens")
          .select("journey_key, portfolio_state")
          .eq("company_id", companyId)
          .eq("portfolio_state", "active");
        const activeKeys = new Set(
          ((lensRows ?? []) as Array<{ journey_key: string | null }>).map((r) => r.journey_key),
        );
        const observedMarkets: FRMarketDef[] = mdAll
          .filter((m) => (m.job_executor ?? "").trim())
          .sort((a, b) => Number(activeKeys.has(b.journey_key)) - Number(activeKeys.has(a.journey_key)))
          .map((m) => ({
            id: m.id,
            who: (m.job_executor ?? "").trim(),
            job: (m.jtbd ?? "").trim() || null,
            sourceTag: syntheticTag(m.updated_at ?? m.created_at),
          }));

        // GATE 6a (2026-08-22): positioning / strategy / promise render ONLY from a CONFIRMED
        // public-only public_reads current row (ledgered + judged, computed from public provenance
        // ONLY — no upload/intake/internal). Absent kind → the signed not-enough line. The legacy
        // market_read canvas 2486e31f / cascade 1e9d2da3 are NEVER read here (unresolved provenance)
        // and never deleted. Source tag date = the row's created_at.
        const { data: prRows } = await loose()
          .from("public_reads")
          .select("kind, payload, created_at")
          .eq("company_id", companyId)
          .eq("is_current", true);
        const prByKind = new Map<string, { payload: Record<string, unknown>; created_at: string | null }>();
        for (const r of (prRows ?? []) as Array<{ kind: string; payload: Record<string, unknown>; created_at: string | null }>) {
          prByKind.set(r.kind, { payload: r.payload ?? {}, created_at: r.created_at });
        }
        const publicReadTag = (createdAt: string | null) => ({
          label: `Public read · ${formatFullDate(createdAt) ?? ""}`.trim().replace(/·\s*$/, "").trim(),
        });

        const posRow = prByKind.get("positioning");
        const posPayload = (posRow?.payload ?? null) as
          | { market_category?: string | null; value_for_customer?: string | null; unique_attributes?: Array<{ text?: string | null }> }
          | null;
        const posDiffs = Array.isArray(posPayload?.unique_attributes)
          ? posPayload!.unique_attributes.map((a) => String(a?.text ?? "").trim()).filter(Boolean)
          : [];
        const positioning = posRow && posPayload && (posPayload.market_category || posPayload.value_for_customer || posDiffs.length)
          ? { category: posPayload.market_category ?? null, value: posPayload.value_for_customer ?? null, differentiators: posDiffs, sourceTag: publicReadTag(posRow.created_at) }
          : null;

        const strRow = prByKind.get("strategy");
        const strPayload = (strRow?.payload ?? null) as
          | { winning_aspiration?: string | null; where_to_play?: string | null; how_to_win?: string | null }
          | null;
        const strategy = strRow && strPayload && (strPayload.winning_aspiration || strPayload.where_to_play || strPayload.how_to_win)
          ? { aspiration: strPayload.winning_aspiration ?? null, whereToPlay: strPayload.where_to_play ?? null, howToWin: strPayload.how_to_win ?? null, sourceTag: publicReadTag(strRow.created_at) }
          : null;

        const promRow = prByKind.get("promise");
        const promText = String(((promRow?.payload ?? {}) as { promise?: string | null }).promise ?? "").trim();
        const promise = promRow && promText
          ? { text: promText, sourceTag: publicReadTag(promRow.created_at) }
          : null;

        // Where you stand (W1, 2026-08-20): the interpretation of the beat-7 score, read
        // ONLY from the persisted mojo_scores snapshot — band + band meaning + the five
        // micro-moves (component_scores[key].value/max paired with explanation[key]). No
        // live recompute, no adjective the data didn't earn. The component orders the
        // levers by headroom (max − value) desc. Hidden when no outside score → the beat
        // falls back to the SAME empty state as beat 7 (scoreLooked-grounded).
        const whereYouStand = score
          ? (() => {
              const comp = (scoreRow?.component_scores ?? {}) as Record<string, { value?: number | null; max?: number; not_computed?: boolean }>;
              const expl = (scoreRow?.explanation ?? {}) as Record<string, unknown>;
              const band = bandForScore(score.value);
              // A lever renders when its component has a numeric max; a not_computed lever (value
              // null) is KEPT and rendered as "—" rather than filtered out.
              const levers = SCORE_LEVERS
                .filter(({ key }) => comp[key] && typeof comp[key].max === "number")
                .map(({ key, label }) => {
                  const notComputed = comp[key].not_computed === true || comp[key].value == null;
                  return {
                    key,
                    label,
                    value: notComputed ? null : Number(comp[key].value),
                    max: Number(comp[key].max),
                    explanation: typeof expl[key] === "string" ? (expl[key] as string) : "",
                    notComputed,
                  };
                });
              return {
                scoreValue: score.value,
                band: band.name,
                bandMeaning: band.description,
                levers,
                sourceTag: { label: `Public read · ${formatFullDate(score.computedAt) ?? ""}`.trim().replace(/·\s*$/, "").trim() },
              };
            })()
          : null;

        // Findings (S4): public_inferred open findings, ranked by recurrence breadth
        // (finding_recurrence.distinct_host_count) desc, then recency. No verdict language.
        const { data: fRows } = await supabase
          .from("findings")
          .select("id, body, created_at, origin_signal_id")
          .eq("company_id", companyId)
          .eq("status", "open")
          .eq("register", "public_inferred");
        const { data: frRows } = await loose()
          .from("finding_recurrence")
          .select("finding_id, distinct_host_count")
          .eq("company_id", companyId);
        const recByFinding = new Map(
          ((frRows ?? []) as Array<{ finding_id: string; distinct_host_count: number | null }>)
            .map((r) => [r.finding_id, r.distinct_host_count ?? 0]),
        );
        // R4: the finding's earliest backing signal gives its event_date (when the thing
        // happened) and read date (the run that read it). Load them for the origin signals.
        type FRow = { id: string; body: string | null; created_at: string | null; origin_signal_id: string | null };
        const fRowsT = ((fRows ?? []) as FRow[]).filter((f) => (f.body ?? "").trim());
        const finSigIds = [...new Set(fRowsT.map((f) => f.origin_signal_id).filter((x): x is string => !!x))];
        const { data: finSigs } = finSigIds.length
          ? await supabase.from("signals").select("id, event_date, source_id").in("id", finSigIds)
          : { data: [] };
        const finSigById = new Map(
          ((finSigs ?? []) as Array<{ id: string; event_date: string | null; source_id: string | null }>).map((s) => [s.id, s]),
        );
        const findingsRaw = fRowsT.map((f) => {
          const sig = f.origin_signal_id ? finSigById.get(f.origin_signal_id) : null;
          const eventDate = sig?.event_date ?? null;
          const readDate = (sig?.source_id ? runDates.get(sig.source_id) : null) ?? f.created_at ?? null;
          const readFmt = formatFullDate(readDate);
          const eventFmt = eventDate ? formatFullDate(eventDate) : null;
          // R4 tag: "said <event> · read <read>" when a differing event date is known; else "read <read>".
          const label = eventFmt && eventFmt !== readFmt
            ? `said ${eventFmt} · read ${readFmt ?? ""}`.trim()
            : `read ${readFmt ?? ""}`.trim();
          // R4 age (reuse FRESHNESS_WINDOW_MONTHS + monthsBetween via findingsAge): >18mo/undated = stale.
          const { stale, ageMarker } = classifyFindingAge(eventDate, readDate);
          return {
            id: f.id,
            body: (f.body ?? "").trim(),
            recurrence: recByFinding.get(f.id) ?? 0,
            sourceTag: readFmt ? { label } : null,
            stale, ageMarker,
            statusDisputed: disputes(f.body),
            recencyKey: eventDate ?? f.created_at ?? "",
          };
        });
        // R4 order: recurrence desc → fresh before stale (equal recurrence) → recency desc.
        const findings: FRFinding[] = orderFindings(findingsRaw).map(({ recencyKey: _rk, ...f }) => f);

        // S1: the outside read was LOOKED iff a public_baseline_run exists (persisted).
        const scoreLooked = runDates.size > 0;

        // Questions (beat 7) come from useFirstReadOpenQuestions in the view —
        // the ONE authority that applies the outside-only provenance gate.
        if (!cancelled) {
          setData({
            company: co ? { name: (co as { name: string }).name, website: (co as { website: string | null }).website } : null,
            coldOpen,
            declared,
            ownWords,
            ownWordsHiddenIds,
            ownWordsLooked,
            channelJunkIds,
            markets,
            observedMarkets,
            positioning,
            promise,
            strategy,
            whereYouStand,
            findings,
            scoreLooked,
            signals,
            score,
            gapPairs: orderedGapPairs,
            gapStatements,
            gapCounts,
            statusConflicts,
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
