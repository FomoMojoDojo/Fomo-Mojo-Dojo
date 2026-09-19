// Finding beat-generation (2a, write-side). Turns a stored finding (body + kind)
// into the insight three-beat — Observe / Name-the-tension / Open.
//
// WALL BRIEF (operator ruling 8, signed 2026-09-18): the model is reached only through the routed call
// (modelRouter.makeRoutedModel). An internal_inferred finding goes to the LOCAL model only when the company has
// client-provided material (clientMaterial.companyHasClientProvidedMaterial — the one wall predicate, fail closed);
// otherwise — a company with no client-provided material, or a public_inferred finding — it takes the routed call
// with the finding's register as its provenance. Every routed call writes a model_calls ledger row.
//
// Beats are an OPENING, not a verdict (gentle by construction):
//   - Observe       — faithful, precise restatement of the body's factual claim only.
//                     Strip editorializing. Invent NO facts. (Ulwick precision.)
//   - name_tension  — a what-would-have-to-be-true framing of the gap/assumption the
//                     finding implies. Held open, never a conclusion. (Roger Martin.)
//   - open          — a provisional, evidence-seeking discussion question. When the
//                     company has zero customer signal, it converges on what first
//                     customer conversations would reveal (discuss-until-evidence).
//
// Idempotent: only processes findings WHERE beats IS NULL, so re-running generates 0.
// Render-side (Next Turn) is a separate item (2b) — nothing here renders.

import { makeRoutedModel, type RoutedModel, type OpenAIUsage } from "./modelRouter.ts";
import { callOllamaJson } from "./signalRecurrence.ts";
import { companyHasClientProvidedMaterial } from "./clientMaterial.ts";
import { openaiRecord, recordModelCall } from "./recordModelCall.ts";
import { LOCAL_GENERATOR } from "../../../src/lib/modelRouter/resolveModel.ts";
import { FINDING_VOICE, BEAT_LENGTH_RULE } from "./findingVoice.ts";

// Loose client type — this module is called from both edge functions (service role)
// and the shared ingest path. We only use .from()/.select()/.update().
type AnySupabase = {
  from: (t: string) => any;
};

export type FindingBeats = {
  observe: string;
  name_tension: string;
  open: string;
};

type FindingRow = {
  id: string;
  kind: "observation" | "watch_out";
  body: string;
};

type SignalProfile = {
  customer: number;
  outside: number;
  organization: number;
};

// Kept as the documented shape of the beats object (the routed call returns plain JSON; no schema-mode API).
export const BEATS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["observe", "name_tension", "open"],
  properties: {
    observe: {
      type: "string",
      description:
        "Faithful, precise restatement of ONLY the factual claim in the finding body, in second person " +
        "('you'/'your'), as ONE short sentence. Strip editorializing and hedging. Add no facts not present " +
        "in the body. No internal jargon (no 'signal'/'read'/'band').",
    },
    name_tension: {
      type: "string",
      description:
        "A 'what would have to be true' framing of the gap or assumption the finding implies. " +
        "Held open — a question of belief, never a conclusion or verdict.",
    },
    open: {
      type: "string",
      description:
        "A provisional, evidence-seeking discussion question that opens the conversation. " +
        "Gentle, never accusatory. When customer signal is absent, converge on what the first " +
        "customer conversations would reveal.",
    },
  },
} as const;

function buildSystemText(): string {
  return (
    "You turn a single strategic finding into a three-beat opening for a discussion — " +
    "NOT a verdict, NOT advice, NOT a plan. The three beats are Observe, Name-the-tension, and Open.\n\n" +
    `${FINDING_VOICE}\n\n${BEAT_LENGTH_RULE}\n\n` +
    "OBSERVE: Restate ONLY the factual claim already in the finding body, in second person. Strip editorializing, " +
    "alarm, and recommendation. Invent no facts the body does not contain. One short sentence.\n\n" +
    "NAME-THE-TENSION: Surface the underlying assumption or gap as a 'what would have to be true' question — " +
    "the belief that would have to hold for this to matter, or the thing not yet known. Hold it open; " +
    "never resolve it into a verdict.\n\n" +
    "OPEN: Offer one provisional, evidence-seeking question that invites looking, not concluding. " +
    "It must be answerable by gathering evidence, and phrased gently.\n\n" +
    "WATCH-OUT vs OBSERVATION: For a watch_out, treat the finding as worth verifying, NEVER as an established " +
    "problem. Attribute the fact to its source — 'there's one review about your post-tornado work that alleges X', " +
    "not 'you have a reputation problem'. An observation is a neutral pattern to explore.\n\n" +
    "No headers, no labels, no markdown — just the prose for each field."
  );
}

function buildUserText(f: FindingRow, profile: SignalProfile): string {
  const customerLine =
    profile.customer === 0
      ? "This company has ZERO direct customer signal on record. The Open beat should converge on what the " +
        "first few customer conversations would reveal about this finding."
      : `This company has ${profile.customer} customer signal(s) on record.`;
  return (
    `Finding kind: ${f.kind}\n` +
    `Finding body (the only facts you may use):\n"""${f.body}"""\n\n` +
    `Signal profile — outside: ${profile.outside}, organization: ${profile.organization}, customer: ${profile.customer}.\n` +
    `${customerLine}\n\n` +
    `Produce the three beats (observe, name_tension, open) for THIS finding only.`
  );
}

async function getSignalProfile(supabase: AnySupabase, companyId: string): Promise<SignalProfile> {
  const bandCount = async (band: string): Promise<number> => {
    const { count } = await supabase
      .from("signals")
      .select("*", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("signal_band", band);
    return Number.isFinite(count) ? Number(count) : 0;
  };
  const [customer, outside, organization] = await Promise.all([
    bandCount("customer"),
    bandCount("outside"),
    bandCount("organization"),
  ]);
  return { customer, outside, organization };
}

// Generate beats for every finding in a company that does not yet have them.
// Returns counts; never throws to the caller (logs and continues) so it is safe to
// wire into the auto-capture path without making ingest fragile.
export const BEATS_CALL_SITE = "finding-beats";
export const BEATS_SCHEMA_INSTRUCTION = 'Return ONLY a JSON object {"observe": string, "name_tension": string, "open": string}.';

/** Ruling 8: the provenance handed to the router for a finding — internal_inferred goes local ONLY while the company
 *  has client-provided material; otherwise the finding's own register is what the router sees. */
export function beatsRouteProvenance(register: string | null | undefined, hasClientMaterial: boolean): string {
  const reg = String(register ?? "");
  if (reg === "internal_inferred" && hasClientMaterial) return "internal_inferred"; // → local (non-public provenance)
  if (reg === "internal_inferred") return "public_inferred"; // no client material: our own analysis of public sources
  return reg || "unknown";
}

/** The default routed caller (external when the router says so, else local qwen). Injected so a guard can count calls. */
export function defaultBeatsRoutedModel(openaiKey: string, onUsage?: (u: OpenAIUsage) => void): RoutedModel {
  const ollamaUrl = Deno.env.get("OLLAMA_BASE_URL") ?? "http://host.docker.internal:11434/v1";
  const local = (model: string, system: string, user: string) => callOllamaJson(ollamaUrl, model || LOCAL_GENERATOR, system, user, 120_000);
  return makeRoutedModel({ callLocalGenerator: local, callLocalJudge: local, openaiKey, onUsage });
}

export async function generateFindingBeats(args: {
  supabase: AnySupabase;
  companyId: string;
  openaiApiKey: string;
  model?: string;
  /** Test seam: the routed caller (defaults to defaultBeatsRoutedModel). */
  routedModel?: RoutedModel;
}): Promise<{ generated: number; skipped: number; failed: number }> {
  const { supabase, companyId, openaiApiKey } = args;

  const { data: rows, error } = await supabase
    .from("findings")
    .select("id, kind, body, register")
    .eq("company_id", companyId)
    .is("beats", null)
    .order("created_at", { ascending: true });

  if (error) {
    console.log("[beats] finding fetch error:", error.message);
    return { generated: 0, skipped: 0, failed: 0 };
  }
  const pending = (Array.isArray(rows) ? rows : []) as FindingRow[];
  if (pending.length === 0) return { generated: 0, skipped: 0, failed: 0 };

  const profile = await getSignalProfile(supabase, companyId);
  const systemText = `${buildSystemText()}\n\n${BEATS_SCHEMA_INSTRUCTION}`;
  // ruling 8: the wall predicate decides where an internal_inferred finding may go (fail closed on lookup error)
  const material = await companyHasClientProvidedMaterial(supabase, companyId);
  let usage: OpenAIUsage | null = null;
  const routed = args.routedModel ?? defaultBeatsRoutedModel(openaiApiKey, (u) => { usage = u; });

  let generated = 0;
  let failed = 0;
  // Sequential — gentle on rate limits; finding sets are small (single digits).
  for (const f of pending) {
    if (typeof f.body !== "string" || f.body.trim().length === 0) {
      failed++;
      continue;
    }
    let provider = "", model = "";
    try {
      usage = null;
      const r = await routed({
        role: "generator",
        provenances: [beatsRouteProvenance((f as { register?: string | null }).register, material.has)],
        system: systemText,
        user: buildUserText(f, profile),
      });
      provider = r.provider; model = r.model;
      const mm = r.content.match(/\{[\s\S]*\}/);
      if (!mm) throw new Error(`${r.model} returned no JSON`);
      const beats = JSON.parse(mm[0]) as FindingBeats;

      const { error: updErr } = await supabase
        .from("findings")
        .update({ beats })
        .eq("id", f.id)
        .is("beats", null); // idempotency guard against concurrent runs
      if (updErr) {
        console.log(`[beats] update error for finding=${f.id}:`, updErr.message);
        failed++;
      } else {
        generated++;
      }
    } catch (err) {
      console.log(
        `[beats] generation error for finding=${f.id}:`,
        String(err instanceof Error ? err.message : err),
      );
      failed++;
    } finally {
      // ruling 2/8: every routed call is ledgered
      if (provider) {
        await recordModelCall(supabase, {
          companyId, runId: null, callSite: BEATS_CALL_SITE,
          usage: provider === "external_openai" ? openaiRecord(model, usage) : { provider, model, prompt_tokens: null, completion_tokens: null, usd: null },
        });
      }
    }
  }

  console.log(
    `[beats] company=${companyId} generated=${generated} failed=${failed} (profile customer=${profile.customer})`,
  );
  return { generated, skipped: 0, failed };
}
