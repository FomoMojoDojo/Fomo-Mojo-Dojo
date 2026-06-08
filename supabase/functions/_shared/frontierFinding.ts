// Frontier finding (2c, write-side). Mines the company's own org-band signal into the
// single most load-bearing strategic bet it holds that nothing outside or customer-side
// has tested yet — then stores it as a finding (kind='frontier') with beats.
//
//   body         — the bet, in the company's OWN terms (mined, never invented)
//   observe      — restate the bet precisely (no new facts)
//   name_tension — what would have to be true for it to hold once it meets reality
//   open         — the specific move to test it, aimed at the real audience
//                  (job_executor — families/funders, independent operators — NOT "customers")
//
// MINEABILITY GATE (the safety against recreating the generic count-template):
//   - no job_executor on record           → return null (no audience to ground it)
//   - empty org-band corpus               → return null
//   - corpus is placeholder/generic       → the model returns mineable=false → null
// A frontier is only ever written when there is a real, company-specific bet to name.
//
// Idempotent: one frontier per company (partial unique index). Upsert is explicit
// select-then-update/insert so it targets the partial index deterministically and
// PRESERVES status (a resolved frontier stays resolved; only body/beats/run refresh).

import { callOpenAIJSON } from "./openaiClient.ts";

type AnySupabase = { from: (t: string) => any };

export type FrontierResult = { generated: boolean; mineable: boolean; reason?: string };

const FRONTIER_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["mineable", "body", "observe", "name_tension", "open"],
  properties: {
    mineable: {
      type: "boolean",
      description:
        "True only if the org-band corpus contains a specific, company-particular, load-bearing " +
        "strategic bet. False if the corpus is placeholder, generic, or structural (no real bet to name).",
    },
    body: {
      type: "string",
      description:
        "The single most load-bearing, least-validated strategic bet, stated in the company's OWN terms. " +
        "Mined from the corpus — invent nothing. Empty string if mineable is false.",
    },
    observe: {
      type: "string",
      description: "Restate the bet precisely as the company holds it. No new facts. Empty if not mineable.",
    },
    name_tension: {
      type: "string",
      description:
        "A 'what would have to be true' framing of what must hold for this bet to survive contact with " +
        "outside and customer reality. Held open, never a verdict. Empty if not mineable.",
    },
    open: {
      type: "string",
      description:
        "The specific, evidence-seeking move to test the bet, aimed at the real audience (the job executor). " +
        "Gentle, provisional. Empty if not mineable.",
    },
  },
} as const;

function buildSystemText(): string {
  return (
    "You mine a company's INTERNAL strategic signal for its single most load-bearing bet — the one belief the " +
    "whole strategy rests on that has NOT yet been tested against outside or customer reality — and frame it as " +
    "a three-beat opening for discussion. You do NOT invent. Every claim must be grounded in the provided corpus.\n\n" +
    "FRONTIER: the most consequential, least-validated strategic bet. Not the safest claim, not a summary — the " +
    "load-bearing assumption that, if wrong, breaks the strategy. State it in the company's own terms.\n\n" +
    "MINEABILITY: Set mineable=false when the corpus is placeholder, generic, templated, or merely structural " +
    "(e.g. 'market demand exists', 'product roadmap lists features', 'customer surveys show pain points') — " +
    "i.e. there is no specific, company-particular bet to name. Only set mineable=true when a real, particular " +
    "strategic bet is present. When in doubt, prefer mineable=false. Never force a frontier.\n\n" +
    "When mineable=true:\n" +
    "  body — the bet itself, in the company's own words, mined from the corpus.\n" +
    "  observe — restate that bet precisely; add no facts the corpus does not contain.\n" +
    "  name_tension — what would have to be true for the bet to hold once it meets outside/customer reality; " +
    "a question of belief, held open, never resolved into a verdict.\n" +
    "  open — one specific, evidence-seeking move to test the bet, aimed at the named real audience. " +
    "Use that audience (e.g. families and funders, independent cafe operators), NEVER the generic word 'customers'.\n\n" +
    "ANTI-FABRICATION: mine real internal belief and name the real gap. NEVER fabricate customer reality, outside " +
    "reception, or evidence that does not exist. The Open seeks evidence; it does not assert it.\n\n" +
    "Each beat is one or two plain sentences. No headers, labels, or markdown."
  );
}

function buildUserText(companyName: string, jobExecutor: string, bodies: string[]): string {
  return (
    `Company: ${companyName}\n` +
    `Real audience (job executor) — aim the Open at THIS, not "customers": ${jobExecutor}\n\n` +
    `INTERNAL strategic signal (the company's own org-band claims — the only material you may mine):\n` +
    bodies.map((b, i) => `${i + 1}. ${b}`).join("\n") +
    `\n\nIdentify the single most load-bearing, least-validated strategic bet and produce the frontier.`
  );
}

export async function generateFrontier(args: {
  supabase: AnySupabase;
  companyId: string;
  runId: string | number;
  openaiApiKey: string;
  model?: string;
}): Promise<FrontierResult> {
  const { supabase, companyId, openaiApiKey } = args;
  const model = args.model || Deno.env.get("OPENAI_MODEL") || "gpt-4.1-mini";
  if (!openaiApiKey) return { generated: false, mineable: false, reason: "no OPENAI_API_KEY" };

  // Identity / audience — no job_executor → no grounded audience → gate closes.
  const { data: company } = await supabase.from("companies").select("name").eq("id", companyId).maybeSingle();
  const companyName = (company as { name?: string } | null)?.name ?? "the company";

  const { data: marketDefs } = await supabase
    .from("odi_market_definitions")
    .select("job_executor")
    .eq("company_id", companyId);
  const jobExecutor = (Array.isArray(marketDefs) ? marketDefs : [])
    .map((m: { job_executor?: unknown }) => (typeof m.job_executor === "string" ? m.job_executor.trim() : ""))
    .find((s: string) => s.length > 0) ?? "";
  if (!jobExecutor) {
    console.log(`[frontier] gate: no job_executor for company=${companyId} — skipping`);
    return { generated: false, mineable: false, reason: "no job_executor" };
  }

  // Org-band corpus — the bodies, not counts.
  const { data: sigs } = await supabase
    .from("signals")
    .select("claim_text")
    .eq("company_id", companyId)
    .eq("signal_band", "organization")
    .order("created_at", { ascending: true });
  const seen = new Set<string>();
  const bodies: string[] = [];
  for (const s of (Array.isArray(sigs) ? sigs : [])) {
    const t = typeof (s as { claim_text?: unknown }).claim_text === "string"
      ? String((s as { claim_text: string }).claim_text).trim() : "";
    if (t && !seen.has(t)) { seen.add(t); bodies.push(t); }
    if (bodies.length >= 140) break;
  }
  if (bodies.length === 0) {
    console.log(`[frontier] gate: empty org-band corpus for company=${companyId} — skipping`);
    return { generated: false, mineable: false, reason: "empty corpus" };
  }

  let mined: { mineable: boolean; body: string; observe: string; name_tension: string; open: string };
  try {
    mined = (await callOpenAIJSON({
      apiKey: openaiApiKey,
      model,
      schemaName: "frontier_finding",
      schema: FRONTIER_SCHEMA,
      systemText: buildSystemText(),
      userText: buildUserText(companyName, jobExecutor, bodies),
      maxOutputTokens: 700,
      temperature: 0.2,
    })) as typeof mined;
  } catch (err) {
    console.log(`[frontier] generation error for company=${companyId}:`, String(err instanceof Error ? err.message : err));
    return { generated: false, mineable: false, reason: "llm error" };
  }

  const ok = (x: unknown): x is string => typeof x === "string" && x.trim().length > 0;
  if (!mined.mineable || !ok(mined.body) || !ok(mined.observe) || !ok(mined.name_tension) || !ok(mined.open)) {
    console.log(`[frontier] gate: model judged not mineable for company=${companyId}`);
    return { generated: false, mineable: false, reason: "not mineable" };
  }

  const beats = { observe: mined.observe, name_tension: mined.name_tension, open: mined.open };
  const runIdNum = Number(args.runId);
  const origin_run_id = Number.isFinite(runIdNum) ? runIdNum : null;

  // Explicit upsert on the partial-unique key (one frontier per company). Targets the
  // partial index deterministically and preserves status on refresh.
  const { data: existing } = await supabase
    .from("findings")
    .select("id")
    .eq("company_id", companyId)
    .eq("kind", "frontier")
    .maybeSingle();

  if (existing && (existing as { id?: string }).id) {
    const { error: updErr } = await supabase
      .from("findings")
      .update({ body: mined.body, beats, origin_run_id }) // status intentionally preserved
      .eq("id", (existing as { id: string }).id);
    if (updErr) {
      console.log(`[frontier] update error for company=${companyId}:`, updErr.message);
      return { generated: false, mineable: true, reason: "update error" };
    }
    console.log(`[frontier] refreshed frontier for company=${companyId}`);
  } else {
    const { error: insErr } = await supabase.from("findings").insert({
      company_id: companyId,
      origin_run_id,
      origin_signal_id: null,
      kind: "frontier",
      body: mined.body,
      beats,
      status: "open",
    });
    if (insErr) {
      console.log(`[frontier] insert error for company=${companyId}:`, insErr.message);
      return { generated: false, mineable: true, reason: "insert error" };
    }
    console.log(`[frontier] created frontier for company=${companyId}`);
  }

  return { generated: true, mineable: true };
}
