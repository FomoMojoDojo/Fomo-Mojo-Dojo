// Model router — selects the model by the PROVENANCE OF EVERY INPUT ROW (operator ruling 2026-08-22).
//
// Privacy law: internal / uploaded / intake / internal_declared content must NEVER reach OpenAI;
// public-provenance content MAY. So: ALL inputs public → external (fast OpenAI, allowed). ANY input
// non-public, unknown, or NULL → local Ollama, exactly as today. The router reads PROVENANCE FIELDS
// ONLY, never content. One non-public row forces the whole call local — the hard guard, fail-closed.
//
// This is the pure decision core (no Deno / fetch / env) so it is unit-testable. The Deno wrapper
// (supabase/functions/_shared/modelRouter.ts) adds the provider dispatch (callModelJson).

export type ModelRole = "generator" | "judge";
export type ModelProvider = "external_openai" | "local_ollama";
export type ModelChoice = { provider: ModelProvider; model: string; role: ModelRole };

// SINGLE ALLOWLIST AUTHORITY (2026-09-01). The public-provenance allowlist lives in ONE place —
// supabase/functions/_shared/publicReadGuards.ts — so the model router (this external-vs-local gate)
// and the public-read gate can NEVER diverge. That authority DELIBERATELY excludes 'market_read' (the
// refresh-cascade provenance-lie string: an uploaded-augmented cascade stamped public). Re-exported
// here (imported + re-exported, NOT a second Set literal) so every existing router consumer keeps
// importing PUBLIC_PROVENANCES / isPublicProvenance from this module unchanged, now hardened at source.
import { PUBLIC_PROVENANCES, isPublicProvenance } from "../../../supabase/functions/_shared/publicReadGuards.ts";
export { PUBLIC_PROVENANCES, isPublicProvenance };
// SP-346 (2026-11-14): the source half of a signal's provenance. ONE allowlist of public source_types,
// the same predicate the public-read wall applies (W1) — imported, never a second list.
import { isPublicSignalSourceType } from "../../../supabase/functions/_shared/clientMaterial.ts";

// ── MODEL TRIAL (operator ruling, 2026-10-15): THE EXTERNAL BRANCH SPLITS BY ROLE ───────────────
//
// It did not. `if (allPublic) return { model: EXTERNAL_MODEL, role: opts.role }` returned the same
// model for BOTH roles and used the role only as a label, while the local branch had always split
// (LOCAL_GENERATOR vs LOCAL_JUDGE). So the generator and the judge were the same model on every
// public-provenance call, and neither could be changed without changing the other.
//
// The ruling: generate-public-read's GENERATOR becomes gpt-4.1; the JUDGE stays gpt-4.1-mini. The
// split is here rather than at the call site because this module is the single authority for which
// model a role gets — a model id chosen in a function would be a second authority, and the two
// would drift. THE PROVENANCE LAW IS UNTOUCHED: all-public still goes external, any non-public /
// unknown / NULL still forces the whole call local, and an empty input set is still fail-closed.
//
// BLAST RADIUS, named because it is wider than the function the ruling names. Six call sites resolve
// a generator and all of them take gpt-4.1 on the public branch:
//   generate-public-read/index.ts:413        the ruling's target
//   generate-read-slots/index.ts:247
//   generate-open-questions/index.ts:159     (role variable)
//   generate-conflict-explanation/index.ts:153, :202
//   _shared/modelRouter.ts:80                makeRoutedModel's routed call (role variable)
// Narrowing the trial to generate-public-read alone would mean a per-call model override, i.e. a
// second place where a model id lives. Flagged for the operator rather than decided here.
export const EXTERNAL_GENERATOR = "gpt-4.1";
export const EXTERNAL_JUDGE = "gpt-4.1-mini";
/** The old name, kept so every existing importer keeps resolving. It is the JUDGE model: that is
 *  the role whose model the ruling did NOT change. */
export const EXTERNAL_MODEL = EXTERNAL_JUDGE;
export const LOCAL_GENERATOR = "qwen2.5:14b-instruct";
export const LOCAL_JUDGE = "llama3:70b";
/** SP-544 (2026-11-22): THE PATTERN GENERATOR IS `qwen3.6:35b`, AND ONLY THE PATTERN GENERATOR.
 *
 *  The ruling names the pattern generator, so this is a SECOND local generator default rather than a
 *  new value for `LOCAL_GENERATOR`. Re-pointing `LOCAL_GENERATOR` would move every other generator
 *  consumer with it — `findingBeats.ts:153`, `frontierFinding.ts:77` and every `role: "generator"`
 *  call through `makeRoutedModel` — and none of them passes `think: false`. SP-517 measured what that
 *  costs: qwen3.6:35b is a thinking model, and with thinking ON the whole `num_predict` budget goes to
 *  `message.thinking` and `content` comes back EMPTY. So a fleet-wide re-point would have read as
 *  several working functions breaking at once, for a ruling that named one generator. That wider act
 *  is left to the operator.
 *
 *  WHY IT IS HERE and not in the runner: this module is the single authority for which model a role
 *  gets, and a model id chosen in a script would be a second authority (the comment above EXTERNAL_*
 *  says the same thing about the external branch). The pattern layer's one consumer (SP-468) reads
 *  this constant; `--gen-model` still overrides it for an arm. */
export const LOCAL_PATTERN_GENERATOR = "qwen3.6:35b";
/** SP-555 (2026-11-22): THE PATTERN JUDGE OF RECORD IS `qwen3.6:35b` WITH THINKING ON, AND ONLY THE
 *  PATTERN JUDGE. Amends SP-519; an exception to the different-model parity order for this layer.
 *
 *  WHY IT IS A SECOND CONSTANT and not a new value for `LOCAL_JUDGE`: `LOCAL_JUDGE` is read by every
 *  other judge consumer in the fleet (`role: "judge"` through `makeRoutedModel`, the claim-delta and
 *  recurrence judges among them), and none of them passes `think`. SP-517 measured what a thinking
 *  model does with thinking left on at a small budget: the whole `num_predict` goes to
 *  `message.thinking` and `content` comes back EMPTY. A fleet-wide re-point would therefore have read
 *  as several working judges breaking at once, for a ruling that names one judge.
 *
 *  WHAT IT COSTS, measured in run 6 (brief 7 §8c, 148 calls): 46.1 s per call against llama3:70b's
 *  21.2 s, and an empty answer on 8 of 146 groups at `num_predict` 4000 — which is why SP-556's retry
 *  exists. WHAT IT BUYS: the SP-550 not-stated rate on the same pairs fell from 8.8% to 2.6%, it
 *  rejected the contradicted keep llama3 had kept as proof of its own negation, and SP-500 / SP-516
 *  both passed under it.
 *
 *  `--judge-model` still overrides it for an arm, and the LANE is still this module's decision: a
 *  non-local company's judge lane refuses the override rather than opening an external model. */
export const LOCAL_PATTERN_JUDGE = "qwen3.6:35b";

/** A signal has no provenance column — derive it from SOURCE + band + voice. Only an outside-band
 *  PUBLIC-web voice on a PUBLIC source_type is public; our own analysis, unknown/NULL voices,
 *  non-outside bands, and every client-provided source are non-public.
 *
 *  SP-346 (containment, 2026-11-14): the SOURCE decides first. A signal minted from an uploaded file
 *  is PRIVATE regardless of its voice label — the upload voice gate mints a document it classes
 *  third_party as outside / outside_voice_about_client, and band + voice alone read that as
 *  public_observed. So source_type must be on the public allowlist (clientMaterial.ts,
 *  PUBLIC_SIGNAL_SOURCE_TYPES); an upload/intake/interview source, a NULL, an unrecognised value,
 *  or a caller that did not select the column (undefined) is non-public. Fail closed. */
const PUBLIC_SIGNAL_VOICES: ReadonlySet<string> = new Set([
  "outside_voice_about_client", "client_voice", "market_context", "competitor_voice",
]);
export function signalProvenance(
  signalBand: string | null | undefined,
  voiceClass: string | null | undefined,
  sourceType?: string | null,
): string | null {
  if (!isPublicSignalSourceType(sourceType)) return null; // SP-346: uploaded / client-provided / unknown source → local
  if (signalBand !== "outside") return null; // organization / customer / unknown band → non-public
  return voiceClass && PUBLIC_SIGNAL_VOICES.has(voiceClass) ? "public_observed" : null; // analysis/NULL → local
}

// ── SP-460 / SP-468 (2026-11-20): THE LANE IS DECIDED BY LINEAGE, NOT BY A LABEL ────────────────
//
// `isPublicProvenance` tests a STRING. That is right for a row that carries a provenance column, and
// wrong for the pattern layer, whose inputs are a need and the review quotes under it: a need read
// out of customers' own public reviews carries source_path 'outside_voice_read', which is deliberately
// NOT on PUBLIC_PROVENANCES (it is refused by isSubjectExternallyAdmissible, and accept_candidate_
// proposal's comment says so), so by label the whole call would go local even for a company that has
// handed us nothing. SP-460: judge the LINEAGE instead — the company's client-provided material, and
// every input row's own SOURCE.
//
// TWO CONDITIONS, BOTH REQUIRED, FAIL CLOSED ON EVERYTHING ELSE:
//   1. companyHasClientProvidedMaterial(...).has === false. Not falsy — FALSE. That predicate already
//      counts a lookup error as `has: true` (clientMaterial.ts:68), so an error arrives here as true
//      and closes the lane; `null`/`undefined` mean nobody looked, which closes it too.
//   2. every signal's source_type is public by isPublicSignalSourceType (the W1 allowlist), and every
//      need's source_path is on LINEAGE_PUBLIC_NEED_SOURCE_PATHS. An empty signal set is closed —
//      never send an unqualified call to a paid external API.
//
// SP-468 scopes this to the pattern layer: `patternRouteProvenance` is its one consumer. The six
// generator call sites named above keep the label test unchanged.
//
// MEASURED 2026-11-20: Charter (dd40ce2f) has client-provided material in 4 of the 7 kinds —
// 235 upload signals, 2 uploaded files, 15 file proposals, 2 internal_declared claims — so condition 1
// is false and Charter's pattern layer runs LOCAL, even though all 330 of its judged review signals
// are public by source. The lane is the company's, not the corpus's.

/** SP-460: the need source_paths whose LINEAGE is the public record, though the string itself is not a
 *  public provenance. 'public_research' is a need read out of public research; 'outside_voice_read' is
 *  one read out of customers' own public reviews — the case SP-460 names. Fail closed: anything else
 *  (a file_proposal path, an interview, an intake, '', NULL) is not public by lineage. */
export const LINEAGE_PUBLIC_NEED_SOURCE_PATHS: ReadonlySet<string> = new Set([
  "public_research", "outside_voice_read",
]);

export type CallLineage = {
  /** companyHasClientProvidedMaterial(sb, companyId).has — FALSE only when the lookup proved none. */
  hasClientMaterial: boolean | null | undefined;
  /** signals.source_type for EVERY signal the call will read. Empty ⇒ closed. */
  signalSourceTypes: ReadonlyArray<string | null | undefined>;
  /** odi_needs.source_path for EVERY need the call will read. Empty is allowed (a call over quotes alone). */
  needSourcePaths: ReadonlyArray<string | null | undefined>;
};

/** SP-460. True only when the company has proven no client-provided material AND every input row is
 *  public by its own source. Anything else — a row of material, an unknown source, an empty signal
 *  set, a lookup nobody ran — is false. */
export function lineageAllowsExternal(l: CallLineage): boolean {
  if (l.hasClientMaterial !== false) return false;
  if (!Array.isArray(l.signalSourceTypes) || l.signalSourceTypes.length === 0) return false;
  if (!l.signalSourceTypes.every((t) => isPublicSignalSourceType(t))) return false;
  if (!Array.isArray(l.needSourcePaths)) return false;
  return l.needSourcePaths.every((p) => typeof p === "string" && LINEAGE_PUBLIC_NEED_SOURCE_PATHS.has(p));
}

/** The provenance the PATTERN LAYER hands `resolveModel`, from its call's lineage (SP-468: this is the
 *  rule's one consumer). `null` is a non-public input, which `resolveModel` already routes local. */
export function patternRouteProvenance(l: CallLineage): string | null {
  return lineageAllowsExternal(l) ? "public_observed" : null;
}

/** ALL inputs public → external; ANY non-public/unknown/NULL → local. An EMPTY input set is
 *  fail-closed to local (never send an unqualified call to an external API). */
export function resolveModel(opts: {
  role: ModelRole;
  inputs: ReadonlyArray<{ id?: string; provenance: string | null | undefined }>;
}): ModelChoice {
  const allPublic = opts.inputs.length > 0 && opts.inputs.every((i) => isPublicProvenance(i.provenance));
  // both branches split by role, by the same expression shape — so neither role's model can be
  // changed by editing the other's, on either branch
  if (allPublic) {
    return {
      provider: "external_openai",
      model: opts.role === "judge" ? EXTERNAL_JUDGE : EXTERNAL_GENERATOR,
      role: opts.role,
    };
  }
  return {
    provider: "local_ollama",
    model: opts.role === "judge" ? LOCAL_JUDGE : LOCAL_GENERATOR,
    role: opts.role,
  };
}

/** The persisted stamp for a verdict/output row. */
export function modelStamp(choice: ModelChoice): { model_provider: ModelProvider; model_name: string } {
  return { model_provider: choice.provider, model_name: choice.model };
}
