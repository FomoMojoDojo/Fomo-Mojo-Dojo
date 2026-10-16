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

/** A signal has no provenance column — derive it from band + voice. Only outside-band PUBLIC-web
 *  voices are public; our own analysis, unknown/NULL voices, and non-outside bands are non-public. */
const PUBLIC_SIGNAL_VOICES: ReadonlySet<string> = new Set([
  "outside_voice_about_client", "client_voice", "market_context", "competitor_voice",
]);
export function signalProvenance(signalBand: string | null | undefined, voiceClass: string | null | undefined): string | null {
  if (signalBand !== "outside") return null; // organization / customer / unknown band → non-public
  return voiceClass && PUBLIC_SIGNAL_VOICES.has(voiceClass) ? "public_observed" : null; // analysis/NULL → local
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
