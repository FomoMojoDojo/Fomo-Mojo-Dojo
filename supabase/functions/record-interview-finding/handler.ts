// record-interview-finding — the ONE sanctioned path an interview finding takes into odi_needs
// (gate 2, operator rulings 2026-09-16).
//
// Laws honoured here, in order, each refusing before any write:
//   a. `{}` → 400 company_id required (the fleet boot check).
//   b. the market: definition by (company_id, journey_key), retracted excluded, NO fallback (R2) → 422 no_market_definition.
//   c. the step: a live job_steps row by (company_id, journey_key, step_number), step_number ≥ 1 → 422 no_step.
//      A normative-only market has no job_steps rows and refuses here.
//   d. the statement: the LOCAL model (Ollama, the declared-generation model) proposes ONE ODI-form
//      desired-outcome statement grounded only in the verbatim. Model failure / empty or unusable
//      output → 502 model_unavailable, nothing written, no template fallback. Never OpenAI (Option B).
//   d'. gate 4 (2026-09-16): a non-dry-run call may carry the operator's edited `statement`; when present
//      and non-empty it is used verbatim (trimmed) and the model is NOT called. It must pass the same
//      direction-verb check as the model's output → 422 statement_not_odi, nothing written.
//   d''. gate 4 fold 2: a non-dry-run call may carry `expected_definition_id` — the definition the form
//      last saw on its dry run. When present and ≠ the definition resolved now by (company_id,
//      journey_key) → 409 placement_changed, nothing written (the market was redefined between the
//      proposal and the save; the operator re-proposes against the live placement).
//   e. dry_run: everything above runs live; nothing is written (a supplied statement and
//      expected_definition_id are ignored here — the dry run is what RETURNS definition_id).
//   f. the write: record_interview_finding(...) — record + need in one transaction, the only writer.
// The verbatim is the quote; the statement is a proposal the operator edits — in the form, before the write.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { readLiveDefinitionByKey } from "../_shared/marketDefinitionByKey.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const LOCAL_HOST_ALLOWLIST = new Set(["localhost", "127.0.0.1", "::1", "host.docker.internal"]);
const DEFAULT_GEN_MODEL = "qwen2.5:14b-instruct";
const MODEL_TIMEOUT_MS = 90_000;
const ODI_DIRECTION = /^(minimize|reduce|increase|improve|maximize|avoid)\b/i;

export const SPEAKER_ROLES = new Set(["client_stakeholder", "market_participant"]);

export type LocalModelCall = (args: { ollamaUrl: string; model: string; system: string; user: string }) => Promise<{ ok: boolean; content?: string; err?: string }>;
export type Deps = { createClient: typeof createClient; callLocalModel?: LocalModelCall };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
function isLocalOllamaUrl(rawUrl: string) {
  try { return LOCAL_HOST_ALLOWLIST.has(new URL(rawUrl).hostname); } catch { return false; }
}
const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");

// The Ollama call (native /api/chat, JSON mode) — the same transport the declared generators use.
export const callOllamaJson: LocalModelCall = async ({ ollamaUrl, model, system, user }) => {
  const nativeBase = ollamaUrl.replace(/\/v1\/?$/, "");
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), MODEL_TIMEOUT_MS);
  try {
    const resp = await fetch(`${nativeBase}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer ollama" },
      body: JSON.stringify({ model, format: "json", stream: false, options: { num_ctx: 8192, temperature: 0.2 },
        messages: [{ role: "system", content: system }, { role: "user", content: user }] }),
      signal: ctrl.signal,
    });
    if (!resp.ok) return { ok: false, err: `HTTP ${resp.status}` };
    const data = await resp.json().catch(() => ({}));
    return { ok: true, content: String(data?.message?.content ?? "") };
  } catch (e) {
    return { ok: false, err: String((e as Error)?.message || e) };
  } finally {
    clearTimeout(t);
  }
};

export const PROPOSAL_SYSTEM =
  "You turn ONE interview quote into ONE ODI desired-outcome statement for ONE step of a job map. " +
  "The statement is a PROPOSAL an operator will edit — it must be grounded ONLY in the quote: never add facts, numbers, causes or wishes the speaker did not voice. " +
  "Form (ODI): a direction verb (Minimize / Reduce / Increase / Improve / Maximize / Avoid) + a measurable metric (time, effort, likelihood, frequency, number, risk) + the object of control + the context, in the executor's own plain words. " +
  "Hard rules: (1) framed as what the EXECUTOR wants for themselves, never what a provider delivers; (2) never name a company, brand, vendor or the speaker; (3) one sentence, no jargon; (4) if the quote holds no outcome at all, return an empty statement rather than inventing one. " +
  'JSON only: {"statement":"..."}';

export function buildProposalUser(args: { verbatim: string; speakerRole: string; executor: string; stepLabel: string }): string {
  const who = args.speakerRole === "market_participant" ? "a market participant (a member of the market being mapped)" : "a client stakeholder (someone inside the organisation being mapped)";
  return (
    `Speaker: ${who}.\n` +
    `The market's job executor (from its definition): ${args.executor || "(not stated)"}\n` +
    `The step this finding lands on: ${args.stepLabel}\n` +
    `The quote, verbatim:\n"""${args.verbatim}"""\n` +
    `Propose the one ODI desired-outcome statement the quote supports for this step.`
  );
}

function parseStatement(content: string | undefined): string {
  const raw = String(content ?? "").trim();
  if (!raw) return "";
  try {
    const obj = JSON.parse(raw) as { statement?: unknown };
    return text(obj?.statement);
  } catch {
    const m = raw.match(/"statement"\s*:\s*"([^"]+)"/);
    return m ? m[1].trim() : "";
  }
}

export async function handleRecordInterviewFinding(req: Request, deps: Deps = { createClient }): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "Only POST is supported." }, 405);
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    // a. boot check + shape
    const companyId = text(body.company_id);
    if (!companyId) return json({ ok: false, error: "company_id required" }, 400);
    const journeyKey = text(body.journey_key);
    if (!journeyKey) return json({ ok: false, error: "journey_key required" }, 400);
    const stepNumber = Number(body.step_number);
    if (!Number.isInteger(stepNumber)) return json({ ok: false, error: "step_number required (integer)" }, 400);
    const dryRun = Boolean(body.dry_run);
    const suppliedStatement = dryRun ? "" : text(body.statement);
    if (suppliedStatement && !ODI_DIRECTION.test(suppliedStatement)) {
      return json({ ok: false, error: "statement_not_odi", message: `The statement must start with a direction verb (Minimize / Reduce / Increase / Improve / Maximize / Avoid) — got "${suppliedStatement.slice(0, 80)}". Nothing was written.` }, 422);
    }
    const expectedDefinitionId = dryRun ? "" : text(body.expected_definition_id);
    const existingRecordId = text(body.interview_record_id);
    const newRecord = body.record && typeof body.record === "object" ? (body.record as Record<string, unknown>) : null;
    if (!existingRecordId && !newRecord) return json({ ok: false, error: "either interview_record_id or record {speaker_role, person_name, person_role?, journey_key?, interviewed_at, interviewer, consent_basis, verbatim} required" }, 400);
    if (existingRecordId && newRecord) return json({ ok: false, error: "pass interview_record_id OR record, not both" }, 400);

    const ollamaUrl = Deno.env.get("OLLAMA_BASE_URL") ?? "http://host.docker.internal:11434/v1";
    if (!isLocalOllamaUrl(ollamaUrl)) return json({ ok: false, error: "Local-only policy violation: OLLAMA_BASE_URL must resolve to localhost/host.docker.internal." }, 500);
    const model = Deno.env.get("OLLAMA_MODEL") ?? DEFAULT_GEN_MODEL;
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = deps.createClient(supabaseUrl, serviceRole);
    const db = supabase as unknown as { from: (t: string) => any; rpc: (fn: string, args: Record<string, unknown>) => any; auth: { getUser: () => Promise<{ data?: { user?: { id?: string } | null } }> } };

    // the record (existing → must be live and of this company; new → validated shape)
    let speakerRole = "";
    let recordKey: string | null = null;
    let verbatim = "";
    if (existingRecordId) {
      const { data: rec } = await db.from("interview_records")
        .select("id, speaker_role, journey_key, verbatim, retracted_at")
        .eq("id", existingRecordId).eq("company_id", companyId).is("retracted_at", null).maybeSingle();
      if (!rec) return json({ ok: false, error: "no_interview_record", message: `interview record ${existingRecordId} is not a live record of this company — nothing was written.` }, 422);
      speakerRole = String(rec.speaker_role ?? ""); recordKey = rec.journey_key ? String(rec.journey_key) : null; verbatim = String(rec.verbatim ?? "");
    } else {
      speakerRole = text(newRecord!.speaker_role);
      if (!SPEAKER_ROLES.has(speakerRole)) return json({ ok: false, error: "record.speaker_role must be client_stakeholder or market_participant" }, 400);
      for (const k of ["person_name", "interviewed_at", "interviewer", "consent_basis", "verbatim"]) {
        if (!text(newRecord![k])) return json({ ok: false, error: `record.${k} required` }, 400);
      }
      if (Number.isNaN(Date.parse(text(newRecord!.interviewed_at)))) return json({ ok: false, error: "record.interviewed_at must be a timestamp" }, 400);
      recordKey = text(newRecord!.journey_key) || null;
      if (speakerRole === "market_participant" && !recordKey) return json({ ok: false, error: "record.journey_key required for a market_participant" }, 400);
      verbatim = text(newRecord!.verbatim);
    }
    if (speakerRole === "market_participant" && recordKey !== journeyKey) {
      return json({ ok: false, error: "market_key_mismatch", message: `a market participant's finding attaches only to that participant's own market ('${recordKey}'), not to '${journeyKey}' — nothing was written.` }, 422);
    }

    // b. the market — keyed, live, no fallback
    const definition = await readLiveDefinitionByKey(db, companyId, journeyKey);
    if (!definition) {
      return json({ ok: false, error: "no_market_definition", journey_key: journeyKey, message: `No live market definition for '${journeyKey}'. Define the market before recording a finding on it — nothing was written.` }, 422);
    }

    if (expectedDefinitionId && expectedDefinitionId !== String(definition.id)) {
      return json({ ok: false, error: "placement_changed", journey_key: journeyKey, expected_definition_id: expectedDefinitionId, definition_id: definition.id, message: `The market definition for '${journeyKey}' changed since the proposal (expected ${expectedDefinitionId}, now ${definition.id}). Propose again against the live placement — nothing was written.` }, 409);
    }

    // c. the step — live, ≥ 1
    if (stepNumber < 1) return json({ ok: false, error: "no_step", journey_key: journeyKey, step_number: stepNumber, message: "A finding lands only on a live step (step_number ≥ 1) — never step 0. Nothing was written." }, 422);
    const { data: step } = await db.from("job_steps")
      .select("id, step_number, step_label")
      .eq("company_id", companyId).eq("journey_key", journeyKey).eq("step_number", stepNumber).maybeSingle();
    if (!step) {
      return json({ ok: false, error: "no_step", journey_key: journeyKey, step_number: stepNumber, message: `'${journeyKey}' has no job step ${stepNumber}. A market with only a normative (industry) map, or no map at all, has no job_steps rows to attach a finding to — generate its job map first. Nothing was written.` }, 422);
    }
    const stepLabel = String(step.step_label ?? "");

    // d. the statement: the operator's edited one when supplied (model NOT called), else the local model
    //    proposes — never OpenAI, no template fallback
    const callLocalModel = deps.callLocalModel ?? callOllamaJson;
    const modelRes = suppliedStatement
      ? { ok: true as const, content: "" }
      : await callLocalModel({ ollamaUrl, model, system: PROPOSAL_SYSTEM, user: buildProposalUser({ verbatim, speakerRole, executor: definition.job_executor, stepLabel }) });
    const proposed = suppliedStatement || (modelRes.ok ? parseStatement(modelRes.content) : "");
    if (!modelRes.ok || !proposed || !ODI_DIRECTION.test(proposed)) {
      const why = !modelRes.ok ? `local model failed: ${modelRes.err ?? "unknown"}` : !proposed ? "local model returned no statement" : `local model output is not an ODI desired-outcome statement (${proposed.slice(0, 80)})`;
      return json({ ok: false, error: "model_unavailable", model, message: `${why} — nothing was written (no template fallback).` }, 502);
    }
    const statementSource = suppliedStatement ? "operator" : "model";

    // e. dry run — the whole path ran live; nothing persists
    if (dryRun) {
      return json({ ok: true, dry_run: true, proposed_statement: proposed, model, definition_id: definition.id, journey_key: journeyKey, step_number: stepNumber, step_label: stepLabel, speaker_role: speakerRole, would_reuse_record: Boolean(existingRecordId) });
    }

    // f. the write — the RPC is the only writer; user_id = the caller when a JWT is present, else the company owner
    let userId: string | null = null;
    const authHeader = req.headers.get("Authorization");
    if (authHeader) {
      const anon = deps.createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY") ?? "", { global: { headers: { Authorization: authHeader } } });
      const { data } = await (anon as unknown as typeof db).auth.getUser();
      userId = data?.user?.id ?? null;
    }
    if (!userId) {
      const { data: co } = await db.from("companies").select("created_by").eq("id", companyId).maybeSingle();
      userId = co?.created_by ? String(co.created_by) : null;
    }
    if (!userId) return json({ ok: false, error: "Could not resolve acting user." }, 500);

    const { data: written, error: rpcError } = await db.rpc("record_interview_finding", {
      p_company_id: companyId,
      p_user_id: userId,
      p_journey_key: journeyKey,
      p_step_number: stepNumber,
      p_step_label: stepLabel,
      p_statement: proposed,
      p_interview_record_id: existingRecordId || null,
      p_record: existingRecordId ? null : {
        speaker_role: speakerRole,
        person_name: text(newRecord!.person_name),
        person_role: text(newRecord!.person_role) || null,
        journey_key: recordKey,
        interviewed_at: text(newRecord!.interviewed_at),
        interviewer: text(newRecord!.interviewer),
        consent_basis: text(newRecord!.consent_basis),
        verbatim,
      },
    });
    if (rpcError) return json({ ok: false, error: "write_refused", message: String(rpcError.message ?? rpcError) }, 409);
    const row = Array.isArray(written) ? written[0] : written;
    return json({ ok: true, record_id: row?.record_id ?? null, need_id: row?.need_id ?? null, reused_record: Boolean(row?.reused_record), proposed_statement: proposed, statement_source: statementSource, model: suppliedStatement ? null : model, journey_key: journeyKey, step_number: stepNumber });
  } catch (err) {
    return json({ ok: false, error: String((err as Error)?.message ?? err) }, 500);
  }
}
