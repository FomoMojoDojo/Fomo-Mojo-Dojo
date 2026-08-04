import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { ClaimCandidate, ClaimDraft, ClaimSignalRefDraft, SignalDraft } from "../../../src/lib/evidenceDomain.ts";
import { liftVerbatimQuote, pickEventDate } from "../../../src/lib/verbatimQuote.ts";
import { produceQuote, normalizeUrlKey } from "../../../src/lib/firstRead/quoteProducer.ts";
import { contentIdentity } from "./contentIdentity.ts";
import { inferClaimState } from "../../../src/lib/claimState/migration/inferState.ts";
import { selectPruneVictims } from "../../../src/lib/claimState/prunePolicy.ts";
import {
  matchStrengthFromScore,
  mapDifyFileOutputToSignals,
  mapPublicBaselineOutputToSignals,
  mapSignalsToClaimCandidates,
  scoreClaimToJobStepMatch,
  scoreClaimToNeedMatch,
} from "../../../src/lib/evidenceMappers.ts";
import { upsertDependenciesForArtifact } from "./strategicGraph.ts";
import { buildClientCorpus, buildCorpusFromTexts, resolveSyndicationDurable } from "./syndication.ts";
import { recordIntegrityRun } from "./integrity.ts";
import { fireMarketReconcile } from "./marketReconcileTrigger.ts";
import {
  rebuildRouteHypothesisDependencies,
  rebuildStrategicHypothesesForCompany,
} from "./strategicHypotheses.ts";
import { inferJourneyHypothesesForCompany } from "./journeyHypotheses.ts";
import { generateFindingBeats } from "./findingBeats.ts";
import { generateFrontier } from "./frontierFinding.ts";

type SupabaseClient = ReturnType<typeof createClient>;

// UUID v5-flavored deterministic ID for signal-derived claims.
// Keyed on (companyId, normalizedStatement) → same signals produce the same UUID
// across rebuilds, so claim rows persist in-place (no cascade-delete churn).
// Uses Web Crypto API (available in Deno without imports).
async function deterministicSignalClaimId(companyId: string, statement: string): Promise<string> {
  const NAMESPACE = "signal-derived-claims-2026-06";
  const input = `${NAMESPACE}:${companyId}:signal_derived:${statement.trim().toLowerCase()}`;
  const hashBuffer = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(input));
  const hash = new Uint8Array(hashBuffer);
  hash[6] = (hash[6] & 0x0f) | 0x50; // version 5
  hash[8] = (hash[8] & 0x3f) | 0x80; // RFC 4122 variant
  const h = Array.from(hash, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

// FR-D1 — client_attested id-namespace rule (implemented by the FR-D2 corrections
// feed, documented here where the sibling namespace lives). A First Read
// correction is born as a claim with provenance='client_attested'. Its
// deterministic id MUST use a DISTINCT namespace segment — 'client_attested' in
// place of the 'signal_derived' segment above (e.g. NAMESPACE
// "client-attested-claims-2026-07", input `${NS}:${companyId}:client_attested:${
// normalized correction_text}`). This keeps a client-spoken claim from ever
// colliding with a signal-derived claim of identical text: per the design-gate
// ruling, same-text claims of different provenance COEXIST and are never merged,
// so their ids must differ by construction.
//
// STAMP LAW: provenance='client_attested' is stamped DIRECTLY at the corrections
// feed only — never via deriveClaimProvenance (signal-backing-based; a spoken
// correction has no signal) and never through the Gate 3b document path
// (local-strategy-synthesis, voice-gated on doc_voice_verdicts a correction lacks).
// ATTESTATION CONVENTION: the feed records provenance of the utterance in the
// claim's raw_payload as { session_id, response_id } (append newest across re-runs;
// the immutable provenance column itself never changes). See FR-D1 migration
// 20260723100000_claims_provenance_client_attested.sql.

type DependencyTarget = {
  upstream_object_type: string;
  upstream_object_id: string;
  downstream_object_type: string;
  downstream_object_id: string;
  dependency_type: "supports" | "derives" | "contradicts";
  strength: "high" | "medium" | "low";
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function normalizeSignalInsert(signal: SignalDraft) {
  // CV-2e — verbatim quote is a SEPARATE write path from claim_text/evidence_excerpt.
  // It is admitted ONLY when the draft's candidate quote is a byte-exact substring of
  // the retained fetched source (liftVerbatimQuote); otherwise NULL (honest absence).
  // The extraction path cannot smuggle model text in here: a paraphrase isn't a
  // substring, so it returns null (and the DB CHECK is the backstop). event_date is
  // taken only when the source carried a real date — never inferred.
  const lifted = liftVerbatimQuote(signal.quote_source_text, signal.quote);
  return {
    company_id: signal.company_id,
    source_id: signal.source_id,
    source_type: signal.source_type,
    source_title: signal.source_title,
    source_url: signal.source_url,
    signal_band: signal.signal_band,
    evidence_type: signal.evidence_type,
    claim_text: signal.claim_text,
    evidence_excerpt: signal.evidence_excerpt,
    quote: lifted?.quote ?? null,
    quote_source_text: lifted?.quote_source_text ?? null,
    event_date: pickEventDate(signal.event_date),
    topic: signal.topic,
    framework: signal.framework,
    directness: signal.directness,
    recency: signal.recency,
    framing_fit: signal.framing_fit,
    structure_level: signal.structure_level,
    validation_status: signal.validation_status,
    confidence_to_use: signal.confidence_to_use,
    voice_class: signal.voice_class ?? null,
    syndicated_from_client: signal.syndicated_from_client ?? null,
    syndication_score: signal.syndication_score ?? null,
    raw_payload: signal.raw_payload ?? {},
  };
}

function normalizeClaimInsert(claim: ClaimDraft & { id?: string }) {
  return {
    ...(claim.id !== undefined ? { id: claim.id } : {}),
    company_id: claim.company_id,
    statement: claim.statement,
    topic: claim.topic,
    claim_type: claim.claim_type,
    outside_support_count: claim.outside_support_count,
    organization_support_count: claim.organization_support_count,
    customer_support_count: claim.customer_support_count,
    triangulation_state: claim.triangulation_state,
    confidence: claim.confidence,
    // INT-2: provenance persisted at birth (derived by deriveClaimProvenance,
    // the sole authority, inside mapSignalsToClaimCandidates). The DB trigger
    // rejects any later change. Existing rows keep theirs via the upsert's
    // preserved payload ordering (state-preservation comment above applies).
    provenance: claim.provenance ?? "public_observed",
    revalidation_flag: claim.revalidation_flag,
    raw_payload: claim.raw_payload ?? {},
  };
}

function normalizeTopic(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

async function rebuildClaimsForCompany(supabase: SupabaseClient, companyId: string) {
  // Load signals oldest-first: the first signal that maps to a given normalized key
  // always sets the candidate statement. New signals (newest created_at) always come
  // last, so accumulation never changes the statement → stable deterministic IDs.
  const { data: signalRows, error: signalError } = await supabase
    .from("signals")
    .select("*")
    .eq("company_id", companyId)
    .order("created_at", { ascending: true });

  if (signalError) throw new Error(`Failed to load signals for claim rebuild: ${signalError.message}`);

  const allSignals = Array.isArray(signalRows) ? signalRows : [];
  // B2.1: competitor_voice signals are evidence about OTHER companies — they must never
  // become claim candidates in the CLIENT's claim layer. Only this class is excluded;
  // market_context keeps its pre-existing rebuild behavior.
  const signals = allSignals.filter((row) => (row as { voice_class?: string | null })?.voice_class !== "competitor_voice");
  const candidates = mapSignalsToClaimCandidates(companyId, signals as Array<SignalDraft & { id?: string }>);

  // Compute deterministic stable IDs for every candidate.
  const stableIds = await Promise.all(
    candidates.map((c) => deterministicSignalClaimId(companyId, c.claim.statement)),
  );
  const allCandidateIdSet = new Set(stableIds);

  // Load existing non-manual claim rows to (a) preserve state on upsert and
  // (b) identify rows to prune.
  // Manual claims (raw_payload.source LIKE 'manual_%') are untouched throughout.
  const { data: manualClaimRows } = await supabase
    .from("claims")
    .select("id")
    .eq("company_id", companyId)
    .filter("raw_payload->>source", "like", "manual_%");
  const manualClaimIds = new Set(
    (manualClaimRows || []).map((r: { id?: string }) => String(r.id || "")).filter(Boolean),
  );

  const { data: allExistingRows, error: loadExistingErr } = await supabase
    .from("claims")
    .select("id, state, status, provenance")
    .eq("company_id", companyId);
  if (loadExistingErr) throw new Error(`Failed loading existing claims for reconcile: ${loadExistingErr.message}`);

  // Build id→state map for non-manual claims only. provenance is carried so the
  // R2 prune (selectPruneVictims) can scope itself to public_observed — RB-1.
  const existingRows = (allExistingRows ?? []) as Array<{ id: string; state: string; status?: string | null; provenance: string | null }>;
  const existingStateById = new Map<string, string>();
  for (const row of existingRows) {
    if (!manualClaimIds.has(row.id)) existingStateById.set(row.id, row.state);
  }

  // RB-1 Stage 2: everything above is READ/PURE (no model, no network). The
  // mutations below — delete-refs, upsert-claims, prune, insert-refs, G-STATE —
  // are computed here and applied TOGETHER by rebuild_claims_apply in ONE
  // transaction, so a partial failure rolls the whole sequence back (the ref-wipe
  // can never outlive an abort — the defect that stranded Edgewood at 21/0).

  // UPSERT payloads: `state` is preserved for existing rows so G-STATE (below) is
  // the only writer for non-outside_view states. action_category and need_statement
  // are NOT in the payload and are untouched on the UPDATE path.
  const upsertPayloads = candidates.map((candidate, i) => ({
    ...normalizeClaimInsert({ ...candidate.claim, id: stableIds[i] }),
    state: existingStateById.get(stableIds[i]) ?? "outside_view",
  }));

  // PRUNE (R2): delete non-manual claims whose backing signals are gone.
  // ON DELETE CASCADE on claim_events fires here — correct, those claims are
  // genuinely gone. Log pruned IDs for observability.
  // Struck-preservation law: struck claims are recorded decisions — EXEMPT from
  // the signals-gone prune, frozen in place regardless of signal state. Victim
  // selection lives in the single policy authority (src/lib/claimState/prunePolicy).
  const prunedIds = selectPruneVictims(existingRows, allCandidateIdSet, manualClaimIds);
  if (prunedIds.length > 0) {
    // The DELETE runs inside rebuild_claims_apply → remove_claims_bulk (category
    // 'signals_gone', audited by claims_delete_audit). Victims are provenance-scoped
    // to public_observed by selectPruneVictims (RB-1); struck is re-guarded in the RPC.
    console.log(
      `[evidence/reconcile] Pruning ${prunedIds.length} stale public_observed claim(s) for company=${companyId}: ${prunedIds.join(", ")}`,
    );
  }

  // Re-insert claim_signal_refs (unchanged logic; stable IDs mean no orphan risk).
  const refPayloads: ClaimSignalRefDraft[] = [];
  candidates.forEach((candidate, i) => {
    const claimId = stableIds[i];
    candidate.sourceSignals.forEach((ref) => {
      const signal = signals[ref.signalIndex] as Record<string, unknown> | undefined;
      const signalId = String(signal?.id ?? "").trim();
      if (!signalId) return;
      refPayloads.push({
        company_id: companyId,
        claim_id: claimId,
        signal_id: signalId,
        relationship: ref.relationship,
      });
    });
  });

  // G-STATE: derive claim state from backing signals — single source of truth.
  // Omit linkedRoute/linkedOdiNeed/positioningCanvas: focus/flow states are set
  // by separate flows (ODI scoring, route linkage). Only signal-driven states here.
  // GUARD: skip focus/flow claims — those are operator decision states and must not
  // be re-derived from signals. Only outside_view and diagnose are signal-managed.
  const stateByValue: Record<string, string[]> = {};
  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    const claimId = stableIds[i];

    const currentState = existingStateById.get(claimId);
    if (currentState === "focus" || currentState === "flow") continue;

    const signalRefs = candidate.sourceSignals
      .map((ref) => {
        const sig = signals[ref.signalIndex] as Record<string, unknown> | undefined;
        if (!sig) return null;
        return {
          relationship: String(ref.relationship),
          signal_band: String(sig.signal_band ?? "") as "outside" | "organization" | "customer",
          directness: sig.directness as "direct" | "inferred" | "weak" | undefined,
          structure_level: sig.structure_level as "raw" | "extracted" | "interpreted" | undefined,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    const inferred = inferClaimState({
      claimType: candidate.claim.claim_type,
      provenance: candidate.claim.provenance,
      signalRefs,
      linkedRoute: null,
      linkedOdiNeed: null,
      positioningCanvas: null,
    });

    if (inferred !== "outside_view") {
      if (!stateByValue[inferred]) stateByValue[inferred] = [];
      stateByValue[inferred].push(claimId);
    }
  }

  // ── ONE transactional apply (RB-1 Stage 2): delete-refs → upsert-claims →
  // prune → insert-refs → G-STATE, atomic. PostgREST wraps the rpc() call in a
  // single transaction, so any failure rolls the whole sequence back.
  const { error: applyError } = await supabase.rpc("rebuild_claims_apply", {
    p_company_id: companyId,
    p_claim_rows: upsertPayloads,
    p_prune_ids: prunedIds,
    p_ref_rows: refPayloads,
    p_state_updates: stateByValue,
  } as never);
  if (applyError) throw new Error(`Failed applying claim rebuild (transactional): ${applyError.message}`);

  return {
    signalCount: signals.length,
    claimCount: candidates.length,
    refCount: refPayloads.length,
  };
}

async function rebuildFoundationDependenciesForCompany(supabase: SupabaseClient, companyId: string) {
  const [claimsRes, jobStepsRes, needsRes] = await Promise.all([
    supabase
      .from("claims")
      .select("id, statement, topic, claim_type, triangulation_state")
      .eq("company_id", companyId)
      .limit(1000),
    supabase
      .from("job_steps")
      .select("id, journey_key, step_number, step_label, description")
      .eq("company_id", companyId)
      .limit(1000),
    supabase
      .from("odi_needs")
      .select("id, journey_key, step_number, desired_outcome")
      .eq("company_id", companyId)
      .limit(1000),
  ]);

  if (claimsRes.error) throw new Error(`Failed loading claims for dependency rebuild: ${claimsRes.error.message}`);
  if (jobStepsRes.error) throw new Error(`Failed loading job steps for dependency rebuild: ${jobStepsRes.error.message}`);
  if (needsRes.error) throw new Error(`Failed loading ODI needs for dependency rebuild: ${needsRes.error.message}`);

  const claims = Array.isArray(claimsRes.data) ? claimsRes.data : [];
  const jobSteps = Array.isArray(jobStepsRes.data) ? jobStepsRes.data : [];
  const needs = Array.isArray(needsRes.data) ? needsRes.data : [];

  const jobStepIds = jobSteps.map((row) => String(row.id || "")).filter(Boolean);
  const needIds = needs.map((row) => String(row.id || "")).filter(Boolean);

  const stepDependencies = new Map<string, DependencyTarget>();
  const needDependencies = new Map<string, DependencyTarget>();

  for (const claim of claims) {
    const claimId = String(claim.id || "");
    if (!claimId) continue;

    const scoredSteps = jobSteps
      .map((step) => ({
        step,
        score: scoreClaimToJobStepMatch(
          {
            statement: String(claim.statement || ""),
            topic: String(claim.topic || ""),
            claim_type: String(claim.claim_type || "") as ClaimDraft["claim_type"],
            triangulation_state: String(claim.triangulation_state || "") as ClaimDraft["triangulation_state"],
          },
          {
            step_label: String(step.step_label || ""),
            description: String(step.description || ""),
          },
        ),
      }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score);

    if (scoredSteps.length === 0) continue;

    const topScore = scoredSteps[0].score;
    const selectedSteps =
      topScore >= 2
        ? scoredSteps.filter((entry) => entry.score >= topScore - 1).slice(0, 2)
        : scoredSteps.slice(0, 1);

    for (const entry of selectedSteps) {
      const stepId = String(entry.step.id || "");
      if (!stepId) continue;
      const dependencyType = normalizeTopic(claim.triangulation_state) === "contradicted" ? "contradicts" : "supports";
      stepDependencies.set(`claim:${claimId}->job_step:${stepId}`, {
        upstream_object_type: "claim",
        upstream_object_id: claimId,
        downstream_object_type: "job_step",
        downstream_object_id: stepId,
        dependency_type: dependencyType,
        strength: dependencyType === "contradicts" ? "low" : matchStrengthFromScore(entry.score),
      });
    }
  }

  for (const need of needs) {
    const needId = String(need.id || "");
    if (!needId) continue;
    const needText = String(need.desired_outcome || "").trim();
    const needJourneyKey = String(need.journey_key || "").trim().toLowerCase();
    const needStepNumber = Number(need.step_number || 0);

    for (const step of jobSteps) {
      const stepId = String(step.id || "");
      if (!stepId) continue;
      if (String(step.journey_key || "").trim().toLowerCase() !== needJourneyKey) continue;
      if (Number(step.step_number || 0) !== needStepNumber) continue;
      needDependencies.set(`job_step:${stepId}->odi_need:${needId}`, {
        upstream_object_type: "job_step",
        upstream_object_id: stepId,
        downstream_object_type: "odi_need",
        downstream_object_id: needId,
        dependency_type: "derives",
        strength: "high",
      });
    }

  }

  for (const claim of claims) {
    const claimId = String(claim.id || "");
    if (!claimId) continue;

    const scoredNeeds = needs
      .map((need) => ({
        need,
        score: scoreClaimToNeedMatch(
          {
            statement: String(claim.statement || ""),
            topic: String(claim.topic || ""),
            claim_type: String(claim.claim_type || "") as ClaimDraft["claim_type"],
            triangulation_state: String(claim.triangulation_state || "") as ClaimDraft["triangulation_state"],
          },
          {
            desired_outcome: String(need.desired_outcome || ""),
          },
        ),
      }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score);

    if (scoredNeeds.length === 0) continue;

    const selectedNeed = scoredNeeds[0];
    const needId = String(selectedNeed.need.id || "");
    if (!needId) continue;
    const dependencyType = normalizeTopic(claim.triangulation_state) === "contradicted" ? "contradicts" : "supports";
    needDependencies.set(`claim:${claimId}->odi_need:${needId}`, {
      upstream_object_type: "claim",
      upstream_object_id: claimId,
      downstream_object_type: "odi_need",
      downstream_object_id: needId,
      dependency_type: dependencyType,
      strength: dependencyType === "contradicts" ? "low" : matchStrengthFromScore(selectedNeed.score),
    });
  }

  await upsertDependenciesForArtifact(
    supabase,
    companyId,
    { objectType: "job_step", objectIds: jobStepIds },
    [...stepDependencies.values()],
  );

  await upsertDependenciesForArtifact(
    supabase,
    companyId,
    { objectType: "odi_need", objectIds: needIds },
    [...needDependencies.values()],
  );

  return {
    jobStepDependencyCount: stepDependencies.size,
    needDependencyCount: needDependencies.size,
  };
}

export async function persistSignalsAndRebuildClaims(args: {
  supabase: SupabaseClient;
  companyId: string;
  sourceId?: string | number | null;
  sourceType: string;
  signals: SignalDraft[];
}) {
  const { supabase, companyId, sourceId, sourceType, signals } = args;
  const normalizedSourceId = sourceId == null ? null : String(sourceId);

  if (signals.length === 0) {
    throw new Error(`Evidence ingestion produced zero signals for ${sourceType}${normalizedSourceId ? ` (${normalizedSourceId})` : ""}.`);
  }

  if (normalizedSourceId) {
    const { error: deleteExistingError } = await supabase
      .from("signals")
      .delete()
      .eq("company_id", companyId)
      .eq("source_type", sourceType)
      .eq("source_id", normalizedSourceId);
    if (deleteExistingError) {
      throw new Error(`Failed clearing existing signals: ${deleteExistingError.message}`);
    }
  }

  if (signals.length > 0) {
    const { error: insertSignalsError } = await supabase
      .from("signals")
      .insert(signals.map((signal) => normalizeSignalInsert(signal)));
    if (insertSignalsError) throw new Error(`Failed inserting signals: ${insertSignalsError.message}`);
  }

  const claimStats = await rebuildClaimsForCompany(supabase, companyId);
  const dependencyStats = await rebuildFoundationDependenciesForCompany(supabase, companyId);
  const hypothesisStats = await rebuildStrategicHypothesesForCompany({
    supabase,
    companyId,
    sourceRunId: normalizedSourceId,
  });
  const routeHypothesisStats = await rebuildRouteHypothesisDependencies({
    supabase,
    companyId,
  });
  return {
    signalCount: signals.length,
    ...claimStats,
    ...dependencyStats,
    ...hypothesisStats,
    ...routeHypothesisStats,
  };
}

export async function ingestPublicBaselineSignals(args: {
  supabase: SupabaseClient;
  companyId: string;
  runId: string | number;
  companyName?: string | null;
  website?: string | null;
  resultJson: unknown;
  /** V2-6 — normalizeUrlKey(url) → retained fetched source text, from the crawl evidence.
   *  Present only on the full-crawl path; absent paths simply produce no quotes. */
  sourceTextByUrl?: Map<string, string>;
}) {
  const signals = mapPublicBaselineOutputToSignals({
    companyId: args.companyId,
    sourceId: args.runId,
    sourceTitle: args.companyName ? `${args.companyName} public baseline` : "Public baseline run",
    sourceUrl: args.website ?? null,
    resultJson: args.resultJson,
  });

  // V2-6 — VERBATIM QUOTE PRODUCER. Signals are minted from the model's result_json
  // (paraphrases), so the candidate CANNOT come from claim_text. It is selected from the
  // REAL retained source text (crawl `extracted`, joined by URL) — the source's own words.
  // liftVerbatimQuote (in normalizeSignalInsert) is the byte-exact AUTHORITY; a signal
  // whose source text isn't retained simply stays quote-less (absence never blocks
  // ingestion). Own-domain (client_voice) is processed first, then outside voices.
  if (args.sourceTextByUrl && args.sourceTextByUrl.size > 0) {
    const map = args.sourceTextByUrl;
    let quoted = 0, dated = 0;
    const ordered = [...signals].sort((a, b) => (a.voice_class === "client_voice" ? 0 : 1) - (b.voice_class === "client_voice" ? 0 : 1));
    for (const draft of ordered) {
      if (draft.quote) continue; // never overwrite an existing quote
      const src = map.get(normalizeUrlKey(String(draft.source_url || "")));
      if (!src) continue; // no retained source for this URL → honest absence
      const record = (draft.raw_payload ?? {}) as { date?: unknown };
      const produced = produceQuote(src, typeof record.date === "string" ? record.date : null, draft.claim_text || "");
      if (!produced) continue;
      draft.quote = produced.quote;
      draft.quote_source_text = produced.quote_source_text;
      draft.event_date = produced.event_date ?? draft.event_date ?? null;
      quoted++;
      if (produced.event_date) dated++;
    }
    console.log("[quote-producer] lifted", { quoted, dated, of_signals: signals.length });
  }

  // B2.0 ingest stamping: every outside_voice_about_client draft gets a syndication
  // verdict at persistence. client_voice/market_context (and B2.1's competitor_voice)
  // skip — they hold no corroboration rights to strip. Detection is deterministic-first
  // with a LOCAL-LLM uncertain band; never an external-model call.
  try {
    const companyHost = (() => {
      try { return new URL(String(args.website || "")).hostname.replace(/^www\./, "").toLowerCase(); } catch { return ""; }
    })();
    const inRunClientTexts = signals
      .filter((s) => s.voice_class === "client_voice")
      .map((s) => s.claim_text)
      .filter(Boolean);
    const corpus = await buildClientCorpus(args.supabase as unknown as { from: (t: string) => any }, args.companyId, companyHost, inRunClientTexts);
    const clientSample = inRunClientTexts.join("\n").slice(0, 4000);
    let stamped = 0, flagged = 0;
    for (const draft of signals) {
      if (draft.voice_class !== "outside_voice_about_client") continue;
      // B2.0.1: ingest consults the same durable verdict store as both judges — one
      // content identity, one verdict across every consumer.
      const verdict = await resolveSyndicationDurable({
        supabase: args.supabase as unknown as { from: (t: string) => any },
        companyId: args.companyId,
        sourceUrl: String(draft.source_url || ""),
        itemText: draft.claim_text || "",
        corpus,
        clientSampleForLlm: clientSample,
        label: "ingest",
      });
      draft.syndication_score = Number(verdict.score.toFixed(4));
      if (verdict.syndicated !== null) {
        draft.syndicated_from_client = verdict.syndicated;
        stamped++;
        if (verdict.syndicated) flagged++;
      }
    }
    console.log("[syndication] ingest stamping", { stamped, flagged_syndicated: flagged });
    await recordIntegrityRun(args.supabase as unknown as { from: (t: string) => any }, {
      company_id: args.companyId, component: "syndication_ingest", status: "completed",
      examined: signals.filter((s) => s.voice_class === "outside_voice_about_client").length,
      admitted: stamped, excluded_by_rule: { flagged_syndicated: flagged },
      run_ref: String(args.runId),
    });
  } catch (error) {
    console.warn("[syndication] ⚠ ingest stamping failed — drafts persist UNSTAMPED (lazy path will stamp at first judge read)", {
      message: String(error instanceof Error ? error.message : error),
    });
    await recordIntegrityRun(args.supabase as unknown as { from: (t: string) => any }, {
      company_id: args.companyId, component: "syndication_ingest", status: "failed",
      error: String(error instanceof Error ? error.message : error), run_ref: String(args.runId),
    });
  }

  const stats = await persistSignalsAndRebuildClaims({
    supabase: args.supabase,
    companyId: args.companyId,
    sourceId: args.runId,
    sourceType: "public_baseline_run",
    signals,
  });

  // Reconciler trigger (a): a completed-and-ingested public baseline run is new
  // information on the EXTERNAL side of the market comparison. public-baseline is the
  // sole caller of this ingest, so this is the single chokepoint for all its persist
  // paths. Fire-and-forget — a broken reconcile never breaks a paid baseline run.
  await fireMarketReconcile({
    supabase: args.supabase as unknown as { from: (t: string) => any },
    companyId: args.companyId,
    source: "public_baseline_run",
  });
  // Findings layer: auto-capture this run's synthesis reads (source_type='analysis')
  // as standing findings. Additive + idempotent (ON CONFLICT DO NOTHING via the
  // (company_id, origin_signal_id) unique); never deletes/replaces. kind defaults to
  // 'observation' (classification beyond default deferred).
  try {
    const runIdNum = Number(args.runId);
    const { data: analysisSignals } = await args.supabase
      .from("signals")
      .select("id, claim_text, signal_band")
      .eq("company_id", args.companyId)
      .eq("source_type", "public_baseline_run")
      .eq("source_id", String(args.runId))
      .eq("raw_payload->>source_type", "analysis");
    const findingRows = (Array.isArray(analysisSignals) ? analysisSignals : [])
      .filter((s: { claim_text?: unknown }) => typeof s.claim_text === "string" && s.claim_text.trim().length > 0)
      .map((s: { id: string; claim_text: string; signal_band?: string | null }) => ({
        company_id: args.companyId,
        origin_run_id: Number.isFinite(runIdNum) ? runIdNum : null,
        origin_signal_id: s.id,
        kind: "observation",
        body: s.claim_text,
        status: "open",
        // RG-2: register EARNED from the origin signal's band, never defaulted.
        // outside → public_inferred, organization → internal_inferred. An
        // unrecognised band leaves register NULL, which BLOCKS at render.
        register: s.signal_band === "outside"
          ? "public_inferred"
          : s.signal_band === "organization"
            ? "internal_inferred"
            : null,
      }));
    if (findingRows.length > 0) {
      const { error: findingsErr } = await args.supabase
        .from("findings")
        .upsert(findingRows, { onConflict: "company_id,origin_signal_id", ignoreDuplicates: true });
      if (findingsErr) console.log("[evidence] findings auto-capture error:", findingsErr.message);
      else console.log(`[evidence] findings auto-capture: ${findingRows.length} analysis read(s) for company=${args.companyId} run=${args.runId}`);
    }
  } catch (err) {
    console.log("[evidence] findings auto-capture exception:", String(err instanceof Error ? err.message : err));
  }
  // Insight-anchored beats (2a): generate Observe/Name/Open for any findings still
  // missing them (the rows just captured, plus any older null seeds). Idempotent —
  // beats IS NULL only — and non-fatal: a beat-gen failure must not break ingest.
  try {
    const openaiApiKey = Deno.env.get("OPENAI_API_KEY") ?? "";
    if (openaiApiKey) {
      await generateFindingBeats({ supabase: args.supabase, companyId: args.companyId, openaiApiKey });
    } else {
      console.log("[evidence] beats skipped — no OPENAI_API_KEY");
    }
  } catch (err) {
    console.log("[evidence] beats generation exception:", String(err instanceof Error ? err.message : err));
  }
  // Frontier finding (2c): mine the org-band corpus into the company's single most
  // load-bearing untested bet, gated on mineability (returns null when thin/placeholder
  // or no audience). Non-fatal — a frontier failure must not break ingest.
  try {
    const openaiApiKey = Deno.env.get("OPENAI_API_KEY") ?? "";
    if (openaiApiKey) {
      await generateFrontier({ supabase: args.supabase, companyId: args.companyId, runId: args.runId, openaiApiKey });
    } else {
      console.log("[evidence] frontier skipped — no OPENAI_API_KEY");
    }
  } catch (err) {
    console.log("[evidence] frontier generation exception:", String(err instanceof Error ? err.message : err));
  }
  // V2-4 — the OLD FR-FLOW-2a populator (result_json.open_questions[] → rows) is
  // RETIRED. It generated questions from the model's working notes, not the persisted
  // findings, so its links stayed honestly linkless. The authoritative writer is now the
  // dedicated post-findings generator (generate-open-questions), which is handed the
  // finding bodies + publicly_silent deltas verbatim, so links resolve by construction.
  // Running both would write two competing lists — the exact thing V2-4 unifies away.

  const journeyStats = await inferJourneyHypothesesForCompany({
    supabase: args.supabase as any,
    companyId: args.companyId,
    resultJson: args.resultJson,
    sourceRunId: String(args.runId),
  });
  console.log(`[evidence] public baseline ingested company=${args.companyId} run=${args.runId} signals=${stats.signalCount} claims=${stats.claimCount} refs=${stats.refCount} stepDeps=${stats.jobStepDependencyCount} needDeps=${stats.needDependencyCount} hypotheses=${stats.hypothesisCount} hypothesisDeps=${stats.dependencyCount} routeHypothesisDeps=${stats.routeDependencyCount} graphLinkedRoutes=${stats.graphLinkedRouteCount} journeyHypotheses=${journeyStats.journeyCount}`);
  return { ...stats, ...journeyStats };
}

export async function ingestDifyProposalSignals(args: {
  supabase: SupabaseClient;
  companyId: string;
  proposalId: string;
  sourceType?: string | null;
  sourceTitle?: string | null;
  summary?: string | null;
  evidence?: unknown;
  contradictions?: unknown;
  frameworkResults?: unknown;
  questionsToVerify?: unknown;
  rawPayload?: unknown;
}) {
  const signals = mapDifyFileOutputToSignals({
    companyId: args.companyId,
    sourceId: args.proposalId,
    sourceType: args.sourceType ?? "file_proposal",
    sourceTitle: args.sourceTitle ?? "Dify proposal",
    summary: args.summary,
    evidence: args.evidence,
    contradictions: args.contradictions,
    frameworkResults: args.frameworkResults,
    questionsToVerify: args.questionsToVerify,
    rawPayload: args.rawPayload,
  });

  const stats = await persistSignalsAndRebuildClaims({
    supabase: args.supabase,
    companyId: args.companyId,
    sourceId: args.proposalId,
    sourceType: String(args.sourceType ?? "file_proposal"),
    signals,
  });
  console.log(`[evidence] dify proposal ingested company=${args.companyId} proposal=${args.proposalId} signals=${stats.signalCount} claims=${stats.claimCount} refs=${stats.refCount} stepDeps=${stats.jobStepDependencyCount} needDeps=${stats.needDependencyCount} hypotheses=${stats.hypothesisCount} hypothesisDeps=${stats.dependencyCount} routeHypothesisDeps=${stats.routeDependencyCount} graphLinkedRoutes=${stats.graphLinkedRouteCount}`);
  return stats;
}
