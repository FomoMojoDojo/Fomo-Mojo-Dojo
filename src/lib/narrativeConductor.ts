/**
 * Narrative Conductor
 *
 * Lightweight orchestration layer that prevents semantic repetition across
 * the command page. Tracks concepts established in the hero and evolves
 * downstream phrasing so each section contributes distinct information.
 *
 * Section roles enforced:
 *   Hero           — establishes dominant condition + tension (highest intensity)
 *   Signals        — movement, acceleration, emerging pressure (active/operational)
 *   Landscape      — foundational stability, slower-moving confidence (quiet)
 *   Next Moves     — implication, commitment guidance (specific + directed)
 *
 * Design principles:
 *   - Deterministic (stable phrase selection by signal ID hash, not random)
 *   - Conservative (evolves statements rather than suppressing them)
 *   - Composable (pure functions, no side effects)
 *   - Section-role-aware (landscape summary shifts based on what hero already said)
 */

import type { CenterStateKey } from "@/lib/strategicCenterSurface";
import type { StrategicSignalSurface, StrategicSignal } from "@/lib/strategicSignals";
import type { TemporalPosture } from "@/lib/strategicTemporalState";
import type { ExecutiveRegister } from "@/lib/executiveRegister";
import type { DisciplineAssessment } from "@/lib/confidenceDiscipline";
import type { AttentionContext } from "@/lib/strategicAttention";
import { phrasesForRegister, landscapeForRegister } from "@/lib/executiveRegister";

// ─── Concept vocabulary ────────────────────────────────────────────────────────

/**
 * Semantic concepts the system can track across sections.
 * When a concept is established in the hero, downstream sections evolve
 * their phrasing rather than repeating the same diagnostic.
 */
type NarrativeConcept =
  | "customer_proof_missing"   // strategy ahead of validated customer behavior
  | "customer_proof_present"   // customer validation converging or grounded
  | "positioning_conflict"     // market perception vs. strategic emphasis gap
  | "fragmentation"            // no clear lead path, routes scattered
  | "proof_gap"                // validation is the active constraint
  | "positioning_stabilizing"; // positioning coherence building

// ─── Public types ─────────────────────────────────────────────────────────────

export type NarrativeConductor = {
  /** Concepts established in the hero section. Downstream sections consult this. */
  readonly establishedConcepts: ReadonlySet<NarrativeConcept>;
  /**
   * Returns a new StrategicSignalSurface with evolved statement text for any
   * signal whose concept was already established in the hero.
   */
  conductSignals(signals: StrategicSignalSurface): StrategicSignalSurface;
  /**
   * Filters phase attention items, suppressing those whose token overlap
   * with the hero headline exceeds the repetition threshold.
   */
  conductAttentionItems(items: string[]): string[];
  /**
   * Landscape section summary line shifted to avoid echoing the hero diagnosis.
   * Temporally elevated when a structural proof gap or entrenched contradiction is active.
   */
  readonly landscapeSummaryLine: string;
  /** Temporal posture used to derive this conductor, or null if not provided. */
  readonly temporalPosture: TemporalPosture | null;
  /** Executive register driving phrase selection and landscape framing. */
  readonly register: ExecutiveRegister | null;
  /** Confidence discipline assessment — highest-priority phrase authority. */
  readonly discipline: DisciplineAssessment | null;
  /** Attention context — null when not provided. */
  readonly attention: AttentionContext | null;
};

// ─── Hero concept mapping ─────────────────────────────────────────────────────

const HERO_ESTABLISHES: Record<CenterStateKey, NarrativeConcept[]> = {
  strategy_outrunning_proof:       ["customer_proof_missing", "proof_gap"],
  perception_conflicts_emphasis:   ["positioning_conflict"],
  route_confidence_fragmented:     ["fragmentation"],
  customer_validation_converging:  ["customer_proof_present"],
  direction_cohering:              [],
  positioning_stabilizing:         ["positioning_stabilizing"],
};

// ─── Signal → concept mapping ─────────────────────────────────────────────────

/**
 * Maps known signal IDs to the concept they primarily express.
 * Portfolio and hypothesis signals are concept-neutral (route-specific names)
 * and should never be evolved — only customer reality and positioning signals
 * are subject to concept deduplication.
 */
const SIGNAL_CONCEPT: Partial<Record<string, NarrativeConcept>> = {
  "cr-inferred":      "customer_proof_missing",
  "cr-directional":   "customer_proof_missing",
  "cr-grounded":      "customer_proof_present",
  "cr-converging":    "customer_proof_present",
  "cr-contradicted":  "positioning_conflict",
  "cr-fragmented":    "fragmentation",
  "pos-contradicted": "positioning_conflict",
  "pos-fragmented":   "fragmentation",
  "pos-emerging":     "positioning_stabilizing",
  "pos-coherent":     "positioning_stabilizing",
};

// ─── Evolved phrase families ──────────────────────────────────────────────────

/**
 * When a signal's concept is already established in the hero, the signal
 * statement is replaced with a phrase from this family.
 *
 * Evolved phrases are:
 * - More specific than the hero's diagnostic
 * - Forward-looking (what this means operationally)
 * - Shorter (the hero said the full version)
 */
/**
 * Fallback phrases used when no register is provided (or the register has no
 * applicable family for this concept). These are directional/default — not
 * stylistically tailored to any specific strategic condition.
 */
const EVOLVED_BY_CONCEPT: Record<NarrativeConcept, string[]> = {
  customer_proof_missing: [
    "Validation unresolved.",
    "No customer confirmation yet.",
    "Direction ahead of proof.",
    "Directional inference. No validation thread.",
  ],
  customer_proof_present: [
    "Convergence holding.",
    "Signal alignment building.",
    "Validation momentum building.",
  ],
  positioning_conflict: [
    "Perception gap open.",
    "Positioning tension unresolved.",
    "Identity alignment unresolved.",
  ],
  fragmentation: [
    "No path ahead.",
    "No committed route yet.",
    "Route clarity forming.",
  ],
  proof_gap: [
    "Validation is the active constraint.",
    "Evidence is directional.",
  ],
  positioning_stabilizing: [
    "Coherence building.",
    "Alignment taking hold.",
  ],
};

/** Stable hash over signal ID — avoids render flicker across calls. */
function idHash(signal: StrategicSignal): number {
  return signal.id.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
}

/**
 * Picks a stable evolved phrase for a given signal.
 *
 * Selection priority (highest to lowest):
 * 0. Discipline cooling — applied to the result of every lower layer
 * 1. Register-specific phrases — calibrated to the current strategic condition
 *    (uses discipline.cooledRegister, not the raw register)
 * 2. Temporal evolved phrases — calibrated to how long the state has persisted
 * 3. Static fallback phrases — concept-based, condition-neutral
 */
function selectEvolvedForRegister(
  concept: NarrativeConcept,
  signal: StrategicSignal,
  reg: ExecutiveRegister | null,
  temporal: TemporalPosture | null,
  discipline: DisciplineAssessment | null,
): string {
  const hash = idHash(signal);
  // Discipline cooling overrides the raw register — this is the top authority.
  const effectiveReg = discipline?.cooledRegister ?? reg;

  function cool(phrase: string): string {
    return discipline ? discipline.coolPhrase(phrase) : phrase;
  }

  // 1. Register phrases (using cooled register) — most context-aware
  if (effectiveReg) {
    const phrases = phrasesForRegister(concept, effectiveReg);
    if (phrases) {
      // Prefer a phrase that doesn't over-assert — try each starting from the hash slot.
      if (discipline?.active) {
        for (let i = 0; i < phrases.length; i++) {
          const candidate = phrases[(hash + i) % phrases.length];
          if (!discipline.assertsTooMuch(candidate)) return cool(candidate);
        }
      }
      return cool(phrases[hash % phrases.length]);
    }
  }

  // 2. Temporal evolved phrases — maturity-based escalation
  if (temporal) {
    if (concept === "customer_proof_missing" && temporal.proofGapEvolvedPhrases) {
      return cool(temporal.proofGapEvolvedPhrases[hash % temporal.proofGapEvolvedPhrases.length]);
    }
    if (concept === "positioning_conflict" && temporal.contradictionEvolvedPhrases) {
      return cool(temporal.contradictionEvolvedPhrases[hash % temporal.contradictionEvolvedPhrases.length]);
    }
    if (concept === "proof_gap" && temporal.proofGapEvolvedPhrases) {
      return cool(temporal.proofGapEvolvedPhrases[hash % temporal.proofGapEvolvedPhrases.length]);
    }
  }

  // 3. Static fallback
  const phrases = EVOLVED_BY_CONCEPT[concept];
  return cool(phrases[hash % phrases.length]);
}

// ─── Landscape summary lines ──────────────────────────────────────────────────

/**
 * Each center state establishes a framing in the hero. The landscape section
 * should shift its summary to not echo the same diagnosis — instead it
 * foregrounds the structural, slower-moving confidence question.
 */
const LANDSCAPE_SUMMARY: Record<CenterStateKey, string> = {
  strategy_outrunning_proof:
    "Foundational confidence — validation the highest-uplift area.",
  perception_conflicts_emphasis:
    "Structural confidence below the perception gap.",
  route_confidence_fragmented:
    "Confidence stability across layers.",
  customer_validation_converging:
    "Confidence holding — what continues to build.",
  direction_cohering:
    "Confidence holding; proof still needed.",
  positioning_stabilizing:
    "Confidence across positioning and routes.",
};

/**
 * When attention posture is "focused", the landscape line shifts from
 * framing stability to directing resolution — more specific and action-oriented.
 * Applied after all other landscape line selection layers.
 */
const LANDSCAPE_FOCUSED: Record<CenterStateKey, string> = {
  strategy_outrunning_proof:
    "Resolve customer validation before broadening commitment.",
  perception_conflicts_emphasis:
    "Resolve the positioning conflict before strategy advances.",
  route_confidence_fragmented:
    "Clarify which route has the strongest validation signal.",
  customer_validation_converging:
    "Protect validation momentum — don't scatter focus.",
  direction_cohering:
    "Validate the active direction before new threads open.",
  positioning_stabilizing:
    "Hold positioning coherence while the critical concern resolves.",
};

// ─── Attention item suppression ───────────────────────────────────────────────

function tokenize(s: string): Set<string> {
  return new Set(s.toLowerCase().split(/\W+/).filter((t) => t.length > 3));
}

function tokenOverlap(a: string, b: string): number {
  const tokA = tokenize(a);
  const tokB = tokenize(b);
  if (tokA.size === 0 || tokB.size === 0) return 0;
  let shared = 0;
  for (const t of tokA) if (tokB.has(t)) shared++;
  return shared / Math.min(tokA.size, tokB.size);
}

/**
 * Concept-based suppression: catches items whose vocabulary differs from the
 * hero but expresses the same established concept. Token overlap misses these
 * because "Customer grounding is still weak" uses different words than
 * "Strategy is ahead of customer proof" even though they say the same thing.
 */
function itemEchoesConcept(item: string, established: ReadonlySet<NarrativeConcept>): boolean {
  if (
    established.has("customer_proof_missing") &&
    /customer.*(proof|grounding|validated|missing)|direction.*(running|ahead).*validated/i.test(item)
  ) return true;
  if (
    established.has("fragmentation") &&
    /competing themes|pulling.*direction|no clear.*path|scattered/i.test(item)
  ) return true;
  if (
    established.has("positioning_conflict") &&
    /reads as|public.*(perception|reads)|perception gap|outside.*reads/i.test(item)
  ) return true;
  if (
    established.has("customer_proof_present") &&
    /customer.*converging|validation.*converging|validation.*building/i.test(item)
  ) return true;
  return false;
}

// ─── Secondary headline concept detection ─────────────────────────────────────

/**
 * The secondary headline (earlyPhaseHeadline or latePhaseHeadline) may
 * establish additional concepts beyond what the center state alone captures.
 * Detect these with simple pattern matching so the conductor can account for
 * phrasing contributed by the diagnostic / lead hypothesis layer.
 */
function detectSecondaryHeadlineConcepts(headline: string): NarrativeConcept[] {
  const found: NarrativeConcept[] = [];
  if (/customer proof|missing|ahead of validated/i.test(headline)) {
    found.push("customer_proof_missing");
  }
  if (/converging|validation is building|validation has/i.test(headline)) {
    found.push("customer_proof_present");
  }
  if (/reads as|perception|public context/i.test(headline)) {
    found.push("positioning_conflict");
  }
  if (/fragmented|no clear path|no single/i.test(headline)) {
    found.push("fragmentation");
  }
  return found;
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function buildNarrativeConductor(args: {
  centerStateKey: CenterStateKey;
  centerHeadline: string;
  /** The secondary headline shown below the hero (earlyPhaseHeadline or latePhaseHeadline). */
  secondaryHeadline: string;
  /**
   * The contradiction text already rendered in the hero tension block.
   * Signals whose statement closely matches this text will be evolved even when
   * the center state alone wouldn't trigger concept-based evolution — preventing
   * verbatim repetition across the hero and signals section.
   */
  topContradiction?: string | null;
  /**
   * Temporal posture derived from hypothesis age data.
   * When present, evolved signal phrases and the landscape summary line are
   * further shifted based on how long the current state has persisted.
   */
  temporalPosture?: TemporalPosture | null;
  /**
   * Executive register for this strategic condition.
   * Overrides both static and temporal phrase selection when set.
   */
  register?: ExecutiveRegister | null;
  /**
   * Confidence discipline assessment.
   * Sits above all other phrase layers — cools language when evidence is thin,
   * hypotheses are fresh, or convergence is ungrounded.
   */
  discipline?: DisciplineAssessment | null;
  /**
   * Attention context from buildAttentionContext().
   * When posture is "focused", the landscape line is replaced with a more
   * directive variant that points toward resolving the dominant concern.
   */
  attention?: AttentionContext | null;
}): NarrativeConductor {
  const { centerStateKey, centerHeadline, secondaryHeadline, topContradiction = null, temporalPosture = null, register = null, discipline = null, attention = null } = args;

  // Build the established concept set from center state + secondary headline
  const establishedConcepts = new Set<NarrativeConcept>([
    ...(HERO_ESTABLISHES[centerStateKey] ?? []),
    ...detectSecondaryHeadlineConcepts(secondaryHeadline),
  ]);

  // High threshold for topContradiction text-match evolution — only catch near-exact matches
  // where the hero tension block and the signal are quoting the same source text verbatim.
  const CONTRADICTION_MATCH_THRESHOLD = 0.55;

  function conductSignals(surface: StrategicSignalSurface): StrategicSignalSurface {
    if (establishedConcepts.size === 0 && !topContradiction && !temporalPosture && !register && !discipline?.active) return surface;

    const evolvedGroups = surface.groups.map((group) => ({
      ...group,
      signals: group.signals.map((signal): StrategicSignal => {
        const concept = SIGNAL_CONCEPT[signal.id];

        // Concept-based evolution: hero established this concept.
        // Discipline → register → temporal → static phrase family.
        if (concept && establishedConcepts.has(concept)) {
          return { ...signal, statement: selectEvolvedForRegister(concept, signal, register, temporalPosture, discipline) };
        }

        // Text-match evolution: signal text already rendered verbatim in hero tension block.
        if (
          topContradiction &&
          concept &&
          tokenOverlap(signal.statement, topContradiction) >= CONTRADICTION_MATCH_THRESHOLD
        ) {
          return { ...signal, statement: selectEvolvedForRegister(concept, signal, register, temporalPosture, discipline) };
        }

        // Non-evolved signals: apply discipline cooling to raw statement.
        // This catches signals outside the concept vocabulary (portfolio, hypothesis)
        // that may still carry over-certain language when evidence is thin.
        if (discipline?.active) {
          const cooled = discipline.coolPhrase(signal.statement);
          if (cooled !== signal.statement) return { ...signal, statement: cooled };
        }

        return signal;
      }),
    }));

    return { ...surface, groups: evolvedGroups };
  }

  // Suppress attention items that:
  // (a) have high token overlap with either hero headline (catches word-level repetition), OR
  // (b) express the same concept already established in the hero even with different words
  //     (catches semantic repetition that token overlap misses — e.g., "Customer grounding
  //     is still weak" when the hero already said "strategy is ahead of customer proof")
  const OVERLAP_THRESHOLD = 0.28;

  function conductAttentionItems(items: string[]): string[] {
    if (items.length === 0 || establishedConcepts.size === 0) return items;
    return items.filter((item) => {
      if (tokenOverlap(item, centerHeadline) >= OVERLAP_THRESHOLD) return false;
      if (secondaryHeadline && tokenOverlap(item, secondaryHeadline) >= OVERLAP_THRESHOLD) return false;
      if (itemEchoesConcept(item, establishedConcepts)) return false;
      return true;
    });
  }

  const baseLandscapeLine =
    LANDSCAPE_SUMMARY[centerStateKey] ??
    "Where confidence is strongest and where it still needs proof.";

  // Priority: discipline-cooled register → temporal → base.
  // Using the cooled register ensures escalation downgraded by discipline
  // gets the structural_pressure landscape framing, not escalation framing.
  const effectiveRegister = discipline?.cooledRegister ?? register;
  const landscapeSummaryLine =
    (effectiveRegister ? landscapeForRegister(centerStateKey, effectiveRegister) : null) ??
    temporalPosture?.landscapeEvolution?.[centerStateKey] ??
    baseLandscapeLine;

  // Discipline cooling applied as the final pass on the landscape line.
  const cooledLandscapeSummaryLine = discipline
    ? discipline.coolPhrase(landscapeSummaryLine)
    : landscapeSummaryLine;

  // Focused posture: override with directive resolution-oriented variant.
  // Applied after discipline cooling — the directive line is already conservative.
  const finalLandscapeSummaryLine =
    attention?.posture === "focused"
      ? (LANDSCAPE_FOCUSED[centerStateKey] ?? cooledLandscapeSummaryLine)
      : cooledLandscapeSummaryLine;

  return {
    establishedConcepts,
    conductSignals,
    conductAttentionItems,
    landscapeSummaryLine: finalLandscapeSummaryLine,
    temporalPosture,
    register,
    discipline,
    attention,
  };
}
