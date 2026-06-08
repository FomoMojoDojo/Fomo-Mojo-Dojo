// Finding beat-generation (2a, write-side). Turns a stored finding (body + kind)
// into the insight three-beat — Observe / Name-the-tension / Open — using the same
// model class as the public-synthesis path (callOpenAIJSON → gpt-4.1-mini class).
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

import { callOpenAIJSON } from "./openaiClient.ts";
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

const BEATS_SCHEMA = {
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
export async function generateFindingBeats(args: {
  supabase: AnySupabase;
  companyId: string;
  openaiApiKey: string;
  model?: string;
}): Promise<{ generated: number; skipped: number; failed: number }> {
  const { supabase, companyId, openaiApiKey } = args;
  const model = args.model || Deno.env.get("OPENAI_MODEL") || "gpt-4.1-mini";

  if (!openaiApiKey) {
    console.log("[beats] no OPENAI_API_KEY — skipping beat generation");
    return { generated: 0, skipped: 0, failed: 0 };
  }

  const { data: rows, error } = await supabase
    .from("findings")
    .select("id, kind, body")
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
  const systemText = buildSystemText();

  let generated = 0;
  let failed = 0;
  // Sequential — gentle on rate limits; finding sets are small (single digits).
  for (const f of pending) {
    if (typeof f.body !== "string" || f.body.trim().length === 0) {
      failed++;
      continue;
    }
    try {
      const beats = (await callOpenAIJSON({
        apiKey: openaiApiKey,
        model,
        schemaName: "finding_beats",
        schema: BEATS_SCHEMA,
        systemText,
        userText: buildUserText(f, profile),
        maxOutputTokens: 600,
        temperature: 0.2,
      })) as FindingBeats;

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
    }
  }

  console.log(
    `[beats] company=${companyId} generated=${generated} failed=${failed} (profile customer=${profile.customer})`,
  );
  return { generated, skipped: 0, failed };
}
