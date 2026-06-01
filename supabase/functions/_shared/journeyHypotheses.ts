/**
 * Journey hypothesis inference.
 *
 * Infers candidate non-customer journeys from public-baseline result_json and
 * persists them as `inferred_journey` rows in `strategic_hypotheses`. These rows
 * are deliberately not claim-derived and are protected from the claim-rebuild sweep
 * by the `journey_key IS NOT NULL` exemption in rebuildStrategicHypothesesForCompany.
 *
 * Writes rows with hypothesis_state='inferred', validation_state='unvalidated',
 * confidence='low'. The confirmation transition (inferred → strengthened via
 * internal-data match) is a follow-up, gated on the outside-info-ingest flow.
 */

import { recordStrategicEvent } from "./strategicGraph.ts";

type SupabaseClientLike = {
  from: (table: string) => {
    insert: (values: unknown) => { select: (cols?: string) => { single: () => any } };
    select: (cols?: string) => { eq: (col: string, val: unknown) => any };
    update: (values: unknown) => { eq: (col: string, val: unknown) => any };
  };
};

// ─── Baseline result shape (only the fields consumed here) ───────────────────

type LensCard = {
  economic_engine?: string;
  primary_buyer?: string;
  chooser?: string;
  user?: string;
  value_chain?: string;
};

type VoiceSignal = {
  signal?: string;
  source_type?: string;
  sentiment?: string;
};

type BaselineResultLike = {
  lens_card?: LensCard;
  outside_voice_signals?: VoiceSignal[];
  top_hypotheses?: string[];
  category_archetype?: string;
};

// ─── Journey candidate ────────────────────────────────────────────────────────

type JourneyCandidate = {
  journey_key: string;
  statement: string;
  what_must_be_true: string[];
  confidence: "low" | "medium" | "high";
  evidence_hint: string;
};

// ─── Scoring helpers ──────────────────────────────────────────────────────────

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

const B2B_PATTERNS = /\b(b2b|wholesale|distributor|distribution|resell|reseller|restaurant|cafe|coffee.shop|food.service|horeca|hospitality|trade|institutional|corporate.client|business.client|commercial.buyer|channel.partner|supply.chain)\b/;

const SUBSCRIPTION_PATTERNS = /\b(subscription|recurring|saas|monthly.fee|annual.fee|membership|retainer|license|licensing)\b/;

const FRANCHISE_PATTERNS = /\b(franchise|franchis|licensee|master.license|territory.license|area.developer)\b/;

function scoreText(text: string, pattern: RegExp): number {
  const norm = normalize(text);
  const matches = norm.match(new RegExp(pattern.source, "g")) ?? [];
  return matches.length;
}

function scoreLensCard(lens: LensCard, pattern: RegExp): number {
  const fields = [
    lens.economic_engine ?? "",
    lens.primary_buyer ?? "",
    lens.chooser ?? "",
    lens.value_chain ?? "",
  ];
  return fields.reduce((acc, f) => acc + Math.min(scoreText(f, pattern), 2), 0);
}

function scoreSignals(signals: VoiceSignal[], pattern: RegExp): number {
  let hits = 0;
  for (const sig of signals) {
    if (scoreText(sig.signal ?? "", pattern) > 0 || scoreText(sig.source_type ?? "", pattern) > 0) {
      hits++;
    }
  }
  return Math.min(hits, 4);
}

function scoreHypotheses(hyps: string[], pattern: RegExp): number {
  return Math.min(
    hyps.filter((h) => scoreText(h, pattern) > 0).length,
    2,
  );
}

// ─── Journey detectors ────────────────────────────────────────────────────────

// Score needed to generate a journey hypothesis. Conservative: requires
// multiple independent signals (economic_engine alone is not enough).
const INFER_THRESHOLD = 4;

function detectB2BPartner(result: BaselineResultLike): JourneyCandidate | null {
  const lens = result.lens_card ?? {};
  const signals = result.outside_voice_signals ?? [];
  const hyps = result.top_hypotheses ?? [];

  // lens_card fields are weighted heavily — they are structured, not free-text
  const lensScore = scoreLensCard(lens, B2B_PATTERNS);
  const signalScore = scoreSignals(signals, B2B_PATTERNS);
  const hypScore = scoreHypotheses(hyps, B2B_PATTERNS);
  const total = lensScore + signalScore + hypScore;

  if (total < INFER_THRESHOLD) return null;

  // Derive a statement from the economic_engine if possible
  const engine = (lens.economic_engine ?? "").trim();
  const buyer = (lens.primary_buyer ?? "").trim();
  const statement = engine
    ? `Outside signals suggest a B2B or partner channel may be a distinct strategic direction — the economic engine references ${engine.length > 80 ? engine.slice(0, 80) + "…" : engine}.`
    : buyer
      ? `Outside signals suggest a B2B or partner channel may be a distinct strategic direction — primary buyers include ${buyer.length > 60 ? buyer.slice(0, 60) + "…" : buyer}.`
      : "Outside signals suggest a B2B or partner channel may be a distinct strategic direction from the consumer offer.";

  return {
    journey_key: "b2b_partner",
    statement,
    confidence: total >= 7 ? "medium" : "low",
    evidence_hint: `lens:${lensScore} signals:${signalScore} hyps:${hypScore} total:${total}`,
    what_must_be_true: [
      "At least one documented wholesale or B2B partnership agreement exists or is stated as a strategic priority.",
      "The B2B or partner offer is distinct in some way from the consumer or end-customer offer.",
      "Internal strategy or positioning documents confirm B2B is an active channel, not a side effect.",
    ],
  };
}

function detectSubscription(result: BaselineResultLike): JourneyCandidate | null {
  const lens = result.lens_card ?? {};
  const signals = result.outside_voice_signals ?? [];
  const hyps = result.top_hypotheses ?? [];

  const lensScore = scoreLensCard(lens, SUBSCRIPTION_PATTERNS);
  const signalScore = scoreSignals(signals, SUBSCRIPTION_PATTERNS);
  const hypScore = scoreHypotheses(hyps, SUBSCRIPTION_PATTERNS);
  const total = lensScore + signalScore + hypScore;

  if (total < INFER_THRESHOLD) return null;

  const engine = (lens.economic_engine ?? "").trim();
  const statement = engine
    ? `Outside signals suggest a subscription or recurring-revenue model may be a distinct strategic direction — the economic engine references ${engine.length > 80 ? engine.slice(0, 80) + "…" : engine}.`
    : "Outside signals suggest a subscription or recurring-revenue model may be a distinct strategic direction alongside the primary offer.";

  return {
    journey_key: "subscription",
    statement,
    confidence: total >= 7 ? "medium" : "low",
    evidence_hint: `lens:${lensScore} signals:${signalScore} hyps:${hypScore} total:${total}`,
    what_must_be_true: [
      "A recurring revenue model (subscription, license, or membership) is confirmed in internal strategy or financials.",
      "Customer retention data is tracked as a primary metric, not just acquisition.",
      "The subscription offer targets a distinct customer job-to-be-done from the core product.",
    ],
  };
}

function detectFranchise(result: BaselineResultLike): JourneyCandidate | null {
  const lens = result.lens_card ?? {};
  const signals = result.outside_voice_signals ?? [];
  const hyps = result.top_hypotheses ?? [];

  const lensScore = scoreLensCard(lens, FRANCHISE_PATTERNS);
  const signalScore = scoreSignals(signals, FRANCHISE_PATTERNS);
  const hypScore = scoreHypotheses(hyps, FRANCHISE_PATTERNS);
  const total = lensScore + signalScore + hypScore;

  if (total < INFER_THRESHOLD) return null;

  const statement =
    "Outside signals suggest a franchise or licensing model may be a distinct strategic direction — the economic model implies replication beyond direct ownership.";

  return {
    journey_key: "franchise_licensing",
    statement,
    confidence: total >= 7 ? "medium" : "low",
    evidence_hint: `lens:${lensScore} signals:${signalScore} hyps:${hypScore} total:${total}`,
    what_must_be_true: [
      "Franchise or licensing agreements are stated in internal documents as a growth mechanism.",
      "A distinct franchisee or licensee-facing offer exists with its own pricing and support structure.",
      "The model has been piloted in at least one territory or with at least one partner.",
    ],
  };
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function inferJourneyHypothesesForCompany(args: {
  supabase: SupabaseClientLike;
  companyId: string;
  resultJson: unknown;
  sourceRunId?: string | null;
}): Promise<{ journeyCount: number; upsertedKeys: string[] }> {
  const { supabase, companyId, sourceRunId = null } = args;
  const result = (args.resultJson ?? {}) as BaselineResultLike;

  const candidates: JourneyCandidate[] = [
    detectB2BPartner(result),
    detectSubscription(result),
    detectFranchise(result),
  ].filter((c): c is JourneyCandidate => c !== null);

  if (candidates.length === 0) return { journeyCount: 0, upsertedKeys: [] };

  // Fetch existing journey hypotheses for this company to decide insert vs update.
  const existingRes = await supabase
    .from("strategic_hypotheses")
    .select("id, hypothesis_key, hypothesis_state, is_active, statement")
    .eq("company_id", companyId);

  const existingRows = ((existingRes as any).data ?? []) as Array<{
    id: string;
    hypothesis_key: string;
    hypothesis_state: string;
    is_active: boolean;
    statement: string;
  }>;

  const existingByKey = new Map(existingRows.map((r) => [r.hypothesis_key, r]));
  const upsertedKeys: string[] = [];
  const nowIso = () => new Date().toISOString();

  for (const candidate of candidates) {
    const hypothesisKey = `journey:${candidate.journey_key}`;
    const existing = existingByKey.get(hypothesisKey);

    if (existing) {
      // Update if statement changed or if it was retired/inactive
      const statementChanged = existing.statement !== candidate.statement;
      const wasInactive = !existing.is_active;

      if (statementChanged || wasInactive) {
        const { error: updateError } = await (supabase
          .from("strategic_hypotheses")
          .update({
            statement: candidate.statement,
            confidence: candidate.confidence,
            what_must_be_true: candidate.what_must_be_true,
            hypothesis_state: "inferred",
            validation_state: "unvalidated",
            is_active: true,
            source_run_id: sourceRunId,
            raw_payload: { evidence_hint: candidate.evidence_hint },
            updated_at: nowIso(),
          }) as any)
          .eq("id", existing.id);

        if (updateError) throw new Error(`Failed updating journey hypothesis ${hypothesisKey}: ${updateError.message}`);

        await recordStrategicEvent(supabase as any, {
          company_id: companyId,
          event_type: wasInactive ? "restored" : "updated",
          actor_type: "system",
          actor_id: null,
          source_run_id: sourceRunId,
          object_type: "strategic_hypothesis",
          object_id: existing.id,
          previous_value: existing as unknown as Record<string, unknown>,
          new_value: { statement: candidate.statement, hypothesis_state: "inferred" },
          reason: wasInactive
            ? "Journey hypothesis restored from updated outside-baseline evidence"
            : "Journey hypothesis refreshed from updated outside-baseline evidence",
        });
      }

      upsertedKeys.push(hypothesisKey);
    } else {
      // Insert new journey hypothesis
      const insertPayload = {
        company_id: companyId,
        hypothesis_key: hypothesisKey,
        statement: candidate.statement,
        hypothesis_kind: "inferred_journey" as const,
        hypothesis_state: "inferred" as const,
        topic: null,
        confidence: candidate.confidence,
        validation_state: "unvalidated" as const,
        what_must_be_true: candidate.what_must_be_true,
        source_run_id: sourceRunId,
        reframed_from_hypothesis_id: null,
        is_active: true,
        journey_key: candidate.journey_key,
        raw_payload: { evidence_hint: candidate.evidence_hint },
        originating_context: "public_baseline_inference",
        updated_at: nowIso(),
      };

      const { data: inserted, error: insertError } = await (supabase
        .from("strategic_hypotheses")
        .insert(insertPayload)
        .select("id")
        .single() as any);

      if (insertError) throw new Error(`Failed inserting journey hypothesis ${hypothesisKey}: ${insertError.message}`);

      const insertedId = String((inserted as Record<string, unknown>)?.id || "").trim();
      if (!insertedId) throw new Error(`Inserted journey hypothesis ${hypothesisKey} is missing id.`);

      await recordStrategicEvent(supabase as any, {
        company_id: companyId,
        event_type: "created",
        actor_type: "system",
        actor_id: null,
        source_run_id: sourceRunId,
        object_type: "strategic_hypothesis",
        object_id: insertedId,
        previous_value: null,
        new_value: insertPayload,
        reason: "Journey hypothesis inferred from outside-baseline evidence",
      });

      upsertedKeys.push(hypothesisKey);
    }
  }

  return { journeyCount: upsertedKeys.length, upsertedKeys };
}
