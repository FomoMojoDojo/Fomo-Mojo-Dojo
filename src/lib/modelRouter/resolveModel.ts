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

/** Provenance values that mean "from the public record" — safe to send to an external API.
 *  Everything else (internal_declared, client_attested, analytic, uploaded_file, intake, unknown,
 *  NULL) is NOT public and forces local. */
export const PUBLIC_PROVENANCES: ReadonlySet<string> = new Set([
  "public_observed",   // outside-web claims + own-words (the company's own PUBLIC site)
  "public_inferred",   // findings / our-read public register
  "public_research",   // public scan artifacts
  "market_read",       // market_read canvas/cascade (public register)
  "publicly_declared", // publicly-declared markets
]);

// No stronger public judge is configured anywhere — the only external model in the stack is
// gpt-4.1-mini (research-company / refresh-positioning). Use it for BOTH roles on the public branch.
export const EXTERNAL_MODEL = "gpt-4.1-mini";
export const LOCAL_GENERATOR = "qwen2.5:14b-instruct";
export const LOCAL_JUDGE = "llama3:70b";

export function isPublicProvenance(p: string | null | undefined): boolean {
  return !!p && PUBLIC_PROVENANCES.has(p);
}

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
  if (allPublic) return { provider: "external_openai", model: EXTERNAL_MODEL, role: opts.role };
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
