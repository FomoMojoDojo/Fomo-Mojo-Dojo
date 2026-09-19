// Frontier finding (2c, write-side). Mines the company's PUBLIC RECORD into the single most
// load-bearing strategic bet it holds that nothing outside or customer-side has tested yet —
// then stores it as a finding (kind='frontier') with beats.
//
// WALL BRIEF (operator rulings signed 2026-09-18, replacing the org-band corpus):
//   1. CORPUS = the public-read input pool for EVERY company (publicReadInputs.selectPublicInputs: S outside band ∧
//      public voices ∧ live ∧ page-shaped ∧ not junk ∧ not listing; O candidates with an active own_words claim;
//      F open public_inferred recurrence-backed findings, kind <> 'frontier'; D admissible pairs with active claims).
//      NOTHING from the organization band — Edgewood's bet c7bfc5cc carried a retired upload's words to the live
//      preview and into OpenAI prompts because the old corpus was every org-band row, any source, any status.
//      The market definition's job_executor frames the Open only when the definition's provenance is public, OR
//      when the company has no client-provided material at all (clientMaterial.companyHasClientProvidedMaterial —
//      the ONE wall predicate, fail closed); otherwise the run is REFUSED.
//   2. The model is called only through resolveModel and the routed call (modelRouter.makeRoutedModel); a refused
//      run makes no external call and no write and leaves one integrity_runs row `frontier_refused` naming why;
//      every routed call writes a model_calls ledger row.
//   3. REGISTER is earned: public_inferred only when every input is public (isPublicProvenance) — with the
//      job_executor admitted under rule 1; the corpus is public by construction, so a non-public input is a defect
//      and refuses the run rather than stamping.
//   4. INTERIM REFRESH RULE: a frontier row whose status is not 'open' is never rewritten — the refresh skips it and
//      writes `frontier_refresh_skipped_not_open`; an open row is still updated in place (body, beats, run). The
//      body-identity rule lands with gate 1a's findings migration.
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
// select-then-update/insert so it targets the partial index deterministically. Rule 4: a
// non-open row is never rewritten (skipped + audited); an open row refreshes in place.

import { FINDING_VOICE, BEAT_LENGTH_RULE } from "./findingVoice.ts";
import { selectPublicInputs, type InputRow } from "./publicReadInputs.ts";
import { companyHasClientProvidedMaterial, isPublicDefinition, type ClientMaterialVerdict } from "./clientMaterial.ts";
import { isPublicProvenance } from "./publicReadGuards.ts";
import { makeRoutedModel, type RoutedModel, type OpenAIUsage } from "./modelRouter.ts";
import { callOllamaJson } from "./signalRecurrence.ts";
import { openaiRecord, recordModelCall } from "./recordModelCall.ts";
import { LOCAL_GENERATOR } from "../../../src/lib/modelRouter/resolveModel.ts";

type AnySupabase = { from: (t: string) => any };

export type FrontierResult = { generated: boolean; mineable: boolean; reason?: string; refused?: string; skipped?: string; provider?: string; model?: string };

export const FRONTIER_CALL_SITE = "frontier-finding";
export const FRONTIER_REFUSED = "frontier_refused";
export const FRONTIER_REFRESH_SKIPPED_NOT_OPEN = "frontier_refresh_skipped_not_open";
export const FRONTIER_SCHEMA_INSTRUCTION = 'Return ONLY a JSON object {"mineable": boolean, "body": string, "observe": string, "name_tension": string, "open": string}.';

/** Which frontier-corpus inputs count as public: the provenance guard the public reads use (one authority). */
export function frontierInputsPublic(inputs: Array<{ provenance: string }>): boolean {
  return inputs.every((r) => isPublicProvenance(r.provenance));
}

/** Rule 1's job_executor admission: a public definition, or a company with no client-provided material. */
export function executorAdmitted(def: { provenance_type?: string | null } | null, material: ClientMaterialVerdict): { admitted: boolean; why: string } {
  if (!def) return { admitted: false, why: "no market definition (no job_executor)" };
  if (isPublicDefinition(def)) return { admitted: true, why: "definition provenance is public" };
  if (!material.has) return { admitted: true, why: "company has no client-provided material" };
  return { admitted: false, why: `definition provenance '${def.provenance_type}' is not public and the company has client-provided material (${material.found.map((f) => `${f.kind}:${f.count}`).join(", ") || "lookup errors: " + material.errors.map((e) => e.kind).join(", ")})` };
}

/** The default routed caller: external OpenAI when the router says so, else local Ollama (qwen). Injected so a
 *  guard can count external calls with a mocked fetch. */
export function defaultFrontierRoutedModel(openaiKey: string, onUsage?: (u: OpenAIUsage) => void): RoutedModel {
  const ollamaUrl = Deno.env.get("OLLAMA_BASE_URL") ?? "http://host.docker.internal:11434/v1";
  const local = (model: string, system: string, user: string) => callOllamaJson(ollamaUrl, model || LOCAL_GENERATOR, system, user, 120_000);
  return makeRoutedModel({ callLocalGenerator: local, callLocalJudge: local, openaiKey, onUsage });
}


// Kept as the documented shape of the mined object (the routed call returns plain JSON; FRONTIER_SCHEMA_INSTRUCTION states it).
export const FRONTIER_SCHEMA = {
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
        "The single most load-bearing, least-validated strategic bet, second person: 'You're betting that…'. " +
        "Grounded in the provided material — invent nothing. One sentence. Empty string if mineable is false.",
    },
    observe: {
      type: "string",
      description:
        "Restate the bet precisely, second person ('you'/'your'), as ONE short sentence. No new facts. " +
        "No internal jargon (no 'signal'/'read'/'band'). Empty if not mineable.",
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
    "You read what a company's own team has mapped about its strategy and name its single most load-bearing " +
    "bet — the one belief the whole strategy rests on that has NOT yet been tested against the outside world or " +
    "real customers — then frame it as a three-beat opening for discussion. You do NOT invent; every claim must " +
    "be grounded in what the team has actually mapped (the material provided).\n\n" +
    `${FINDING_VOICE}\n\n${BEAT_LENGTH_RULE}\n\n` +
    "FRONTIER: the most consequential, least-validated strategic bet. Not the safest claim, not a summary — the " +
    "load-bearing assumption that, if wrong, breaks the strategy. Name it as THEIR bet: 'You're betting that…'.\n\n" +
    "MINEABILITY: Set mineable=false when the material is placeholder, generic, templated, or merely structural " +
    "(e.g. 'market demand exists', 'product roadmap lists features', 'customer surveys show pain points') — " +
    "i.e. there is no specific, company-particular bet to name. Only set mineable=true when a real, particular " +
    "strategic bet is present. When in doubt, prefer mineable=false. Never force a frontier.\n\n" +
    "When mineable=true:\n" +
    "  body — the bet itself, second person, in their own words: 'You're betting that…'.\n" +
    "  observe — restate that bet precisely in one short sentence; add no facts not in the material.\n" +
    "  name_tension — what would have to be true for the bet to hold once it meets the outside world and real " +
    "customers; a question of belief, held open, never a verdict.\n" +
    "  open — one specific, evidence-seeking move to test the bet, aimed at the named real audience. " +
    "Use that audience (e.g. children, teens, and their families; independent cafe operators), " +
    "NEVER the generic word 'customers'.\n\n" +
    "ANTI-FABRICATION: name the real bet and the real gap. NEVER fabricate customer reality, outside reception, " +
    "or evidence that does not exist. The Open seeks evidence; it does not assert it.\n\n" +
    "No headers, labels, or markdown."
  );
}

function buildUserText(companyName: string, jobExecutor: string, bodies: string[]): string {
  return (
    `Company: ${companyName}\n` +
    `Real audience — aim the Open at THIS, not "customers": ${jobExecutor}\n\n` +
    `What your team has mapped about the strategy (the only material to draw on):\n` +
    bodies.map((b, i) => `${i + 1}. ${b}`).join("\n") +
    `\n\nIdentify the single most load-bearing, least-validated strategic bet and produce the frontier.`
  );
}

export async function generateFrontier(args: {
  supabase: AnySupabase;
  companyId: string;
  runId?: string | number | null;
  openaiApiKey: string;
  model?: string;
  /** Test seam: the routed caller (defaults to defaultFrontierRoutedModel). */
  routedModel?: RoutedModel;
}): Promise<FrontierResult> {
  const { supabase, companyId } = args;

  // ── Rule 4 first: a non-open frontier row is never rewritten. Decided BEFORE any corpus read or model call. ──
  const { data: existing } = await supabase
    .from("findings")
    .select("id, status")
    .eq("company_id", companyId)
    .eq("kind", "frontier")
    .maybeSingle();
  const existingRow = existing as { id?: string; status?: string | null } | null;
  if (existingRow?.id && existingRow.status !== "open") {
    await audit(supabase, companyId, FRONTIER_REFRESH_SKIPPED_NOT_OPEN, {
      finding_id: existingRow.id, status: existingRow.status, run_id: args.runId ?? null,
      rule: "interim refresh rule (2026-09-18): a frontier whose status is not open is never rewritten",
    });
    console.log(`[frontier] skipped: frontier ${existingRow.id} is '${existingRow.status}' — not rewritten (company=${companyId})`);
    return { generated: false, mineable: false, skipped: FRONTIER_REFRESH_SKIPPED_NOT_OPEN, reason: `existing frontier is ${existingRow.status}` };
  }

  // Identity / audience.
  const { data: company } = await supabase.from("companies").select("name").eq("id", companyId).maybeSingle();
  const companyName = (company as { name?: string } | null)?.name ?? "the company";
  const { data: marketDefs } = await supabase
    .from("odi_market_definitions")
    .select("job_executor, provenance_type")
    .eq("company_id", companyId)
    .eq("retracted", false);   // Gate 8b: a retracted def names no executor here
  const def = ((Array.isArray(marketDefs) ? marketDefs : []) as Array<{ job_executor?: unknown; provenance_type?: string | null }>)
    .find((m) => typeof m.job_executor === "string" && m.job_executor.trim().length > 0) ?? null;
  const jobExecutor = def ? String(def.job_executor).trim() : "";

  // ── Rule 1a: the wall predicate (fail closed) decides whether the executor may frame an external prompt. ──
  const material = await companyHasClientProvidedMaterial(supabase, companyId);
  const exec = executorAdmitted(def, material);
  if (!exec.admitted) {
    await audit(supabase, companyId, FRONTIER_REFUSED, { why: exec.why, run_id: args.runId ?? null, client_material: material });
    console.log(`[frontier] REFUSED for company=${companyId}: ${exec.why}`);
    return { generated: false, mineable: false, refused: exec.why };
  }

  // ── Rule 1: the corpus is the public-read input pool, frontier findings excluded (a bet never feeds itself). ──
  const { inputs } = await selectPublicInputs(supabase as never, companyId, { excludeFindingKinds: ["frontier"] });
  const bodies = dedupeBodies(inputs);
  if (bodies.length === 0) {
    console.log(`[frontier] gate: empty public corpus for company=${companyId} — skipping`);
    return { generated: false, mineable: false, reason: "empty corpus" };
  }
  // ── Rule 3 (defensive): every input public, else refuse — never stamp public_inferred over a non-public row. ──
  if (!frontierInputsPublic(inputs)) {
    const bad = inputs.filter((r) => !isPublicProvenance(r.provenance)).map((r) => `${r.kind}:${r.id}:${r.provenance}`);
    await audit(supabase, companyId, FRONTIER_REFUSED, { why: "non-public input in the corpus", inputs: bad, run_id: args.runId ?? null });
    return { generated: false, mineable: false, refused: "non-public input in the corpus" };
  }

  // ── Rule 2: the model is reached only through the routed call; the ledger row is written on every call. ──
  let usage: OpenAIUsage | null = null;
  const routed = args.routedModel ?? defaultFrontierRoutedModel(args.openaiApiKey, (u) => { usage = u; });
  let mined: { mineable: boolean; body: string; observe: string; name_tension: string; open: string };
  let provider = "", model = "";
  try {
    const r = await routed({
      role: "generator",
      provenances: inputs.map((i) => i.provenance),
      system: `${buildSystemText()}\n\n${FRONTIER_SCHEMA_INSTRUCTION}`,
      user: buildUserText(companyName, jobExecutor, bodies),
    });
    provider = r.provider; model = r.model;
    const mm = r.content.match(/\{[\s\S]*\}/);
    if (!mm) throw new Error(`${r.model} returned no JSON`);
    mined = JSON.parse(mm[0]) as typeof mined;
  } catch (err) {
    console.log(`[frontier] generation error for company=${companyId}:`, String(err instanceof Error ? err.message : err));
    return { generated: false, mineable: false, reason: "llm error", provider, model };
  } finally {
    if (provider) {
      await recordModelCall(supabase, {
        companyId, runId: null, callSite: FRONTIER_CALL_SITE,
        usage: provider === "external_openai" ? openaiRecord(model, usage) : { provider, model, prompt_tokens: null, completion_tokens: null, usd: null },
      });
    }
  }

  const ok = (x: unknown): x is string => typeof x === "string" && x.trim().length > 0;
  if (!mined.mineable || !ok(mined.body) || !ok(mined.observe) || !ok(mined.name_tension) || !ok(mined.open)) {
    console.log(`[frontier] gate: model judged not mineable for company=${companyId}`);
    return { generated: false, mineable: false, reason: "not mineable", provider, model };
  }

  const beats = { observe: mined.observe, name_tension: mined.name_tension, open: mined.open, input_ledger: inputs.map((i) => i.id), executor_admitted: exec.why, model: { provider, model } };
  const runIdNum = Number(args.runId);
  const origin_run_id = Number.isFinite(runIdNum) ? runIdNum : null;

  if (existingRow?.id) {
    // open row (rule 4 let it through) — refreshed in place
    const { error: updErr } = await supabase
      .from("findings")
      .update({ body: mined.body, beats, origin_run_id })
      .eq("id", existingRow.id)
      .eq("status", "open"); // belt and braces: never touch a row that changed status since the read
    if (updErr) {
      console.log(`[frontier] update error for company=${companyId}:`, updErr.message);
      return { generated: false, mineable: true, reason: "update error", provider, model };
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
      // Rule 3: EARNED — every input above passed isPublicProvenance and the executor passed rule 1.
      register: "public_inferred",
    });
    if (insErr) {
      console.log(`[frontier] insert error for company=${companyId}:`, insErr.message);
      return { generated: false, mineable: true, reason: "insert error", provider, model };
    }
    console.log(`[frontier] wrote frontier for company=${companyId}`);
  }
  return { generated: true, mineable: true, provider, model };
}

/** Corpus bodies: the pool's texts, deduped, capped like the old org-band corpus (140). */
function dedupeBodies(inputs: InputRow[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of inputs) {
    const t = String(r.text ?? "").trim();
    if (t && !seen.has(t)) { seen.add(t); out.push(t); }
    if (out.length >= 140) break;
  }
  return out;
}

async function audit(supabase: AnySupabase, companyId: string, component: string, detail: Record<string, unknown>): Promise<void> {
  try {
    await supabase.from("integrity_runs").insert({
      company_id: companyId, component, surface_type: "findings", surface_id: (detail.finding_id as string | undefined) ?? null,
      ran_at: new Date().toISOString(), status: component === FRONTIER_REFUSED ? "rejected" : "completed",
      examined: 0, admitted: 0, excluded_by_rule: detail, error: component === FRONTIER_REFUSED ? String(detail.why ?? "") : null, run_ref: detail.run_id != null ? String(detail.run_id) : null,
    });
  } catch (e) {
    console.log(`[frontier] audit insert failed (${component}):`, String(e instanceof Error ? e.message : e));
  }
}
