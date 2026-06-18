// backfill-canonical-statements: fills NULL odi_canonical_statement fields using the
// strict ODI formula prompt from research-company. One-shot; no proposal flow.
//
// Input:  { need_ids: string[] }
// Output: { success: number, skipped: { id, reason }[], errors: { id, error }[] }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callOpenAIJSON } from "../_shared/openaiClient.ts";
import { gateSubjectForExternal } from "../_shared/driftExternalGate.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const canonicalSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    odi_canonical_statement: { type: "string" },
  },
  required: ["odi_canonical_statement"],
};

const ODI_FORMULA_PATTERN = /\b(minimize|maximize|reduce|increase)\b/i;
const WHEN_PATTERN = / when /i;

function isValidCanonical(value: string, desiredOutcome: string): { ok: boolean; reason?: string } {
  const trimmed = value.trim();
  if (!trimmed) return { ok: false, reason: "empty string" };
  if (trimmed.toLowerCase() === desiredOutcome.trim().toLowerCase()) {
    return { ok: false, reason: "identical to desired_outcome" };
  }
  if (!ODI_FORMULA_PATTERN.test(trimmed)) {
    return { ok: false, reason: "missing ODI formula verb (Minimize/Maximize/Reduce/Increase)" };
  }
  if (!WHEN_PATTERN.test(trimmed)) {
    return { ok: false, reason: "missing 'when' clause" };
  }
  return { ok: true };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) return jsonResponse({ error: "OPENAI_API_KEY not configured" }, 500);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !supabaseKey) return jsonResponse({ error: "Supabase env vars missing" }, 500);

  let body: { need_ids?: unknown };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  if (!Array.isArray(body.need_ids) || body.need_ids.length === 0) {
    return jsonResponse({ error: "need_ids must be a non-empty array" }, 400);
  }

  const needIds = (body.need_ids as unknown[]).map(String).filter(Boolean);
  const db = createClient(supabaseUrl, supabaseKey);

  const results = {
    success: 0,
    skipped: [] as { id: string; reason: string }[],
    errors: [] as { id: string; error: string }[],
  };

  for (const needId of needIds) {
    try {
      // Fetch the need row
      const { data: needRow, error: needErr } = await db
        .from("odi_needs")
        .select("id, company_id, desired_outcome, odi_canonical_statement, journey_key, provenance_type")
        .eq("id", needId)
        .maybeSingle();

      if (needErr || !needRow) {
        results.errors.push({ id: needId, error: needErr?.message ?? "Need not found" });
        continue;
      }

      const row = needRow as {
        id: string;
        company_id: string;
        desired_outcome: string;
        odi_canonical_statement: string | null;
        journey_key: string;
        provenance_type: string | null;
      };

      // Skip if already populated
      if (row.odi_canonical_statement && row.odi_canonical_statement.trim()) {
        results.skipped.push({ id: needId, reason: "already populated" });
        continue;
      }

      // DECL-OPP 1a.1 — Option-B subject gate: canonical generation ships
      // desired_outcome to an external model. An internal (declared/manual/NULL-
      // provenance) need must never cross that boundary. Inadmissible → skip
      // (no OpenAI, canonical stays NULL → consumers fall back to desired_outcome),
      // recording an excluded-by-rule integrity row. Internal canonical generation
      // moves to the local lane later.
      const subjectGate = await gateSubjectForExternal({
        supabase: db as unknown as { from: (t: string) => any },
        companyId: row.company_id,
        surfaceType: "opportunity",
        surfaceId: row.id,
        provenance: row.provenance_type,
        consumer: "backfill-canonical-statements",
      });
      if (!subjectGate.admissible) {
        results.skipped.push({ id: needId, reason: "non_public_provenance" });
        continue;
      }

      // Fetch job_executor from odi_market_definitions for this company + journey
      const { data: marketDef } = await db
        .from("odi_market_definitions")
        .select("job_executor")
        .eq("company_id", row.company_id)
        .eq("journey_key", row.journey_key)
        .maybeSingle();

      const jobExecutor = (marketDef as { job_executor?: string | null } | null)?.job_executor?.trim() ?? "";

      const systemText =
        `You are translating a desired outcome statement into strict ODI canonical form.\n` +
        `Return ONLY valid JSON matching the schema. No prose.\n\n` +
        `Rules:\n` +
        `- odi_canonical_statement must use the strict ODI formula:\n` +
        `  "[Minimize/Maximize/Reduce/Increase] the [dimension] [to|of|in] [object] when [context]"\n` +
        `- It must be a formula-syntax translation of the desired_outcome — same underlying concept, not a different one\n` +
        `- It must NOT be identical to the desired_outcome\n` +
        `- It must include at least one formula verb (Minimize, Maximize, Reduce, or Increase) and a "when" clause\n` +
        `- The "when" clause should name the job context using the job_executor description when relevant\n` +
        `- Keep it concise (12–22 words), solution-free, and measurable in spirit\n` +
        `- Do not invent new concepts not present in desired_outcome`;

      const userText =
        `desired_outcome: ${row.desired_outcome}\n` +
        (jobExecutor ? `job_executor: ${jobExecutor}\n` : "");

      const model = Deno.env.get("OPENAI_MODEL") ?? "gpt-4.1-mini";

      const generated = await callOpenAIJSON({
        apiKey,
        model,
        schemaName: "canonical_backfill",
        schema: canonicalSchema,
        systemText,
        userText,
        maxOutputTokens: 200,
        temperature: 0.2,
      }) as { odi_canonical_statement: string };

      const canonical = String(generated.odi_canonical_statement ?? "").trim();
      const validity = isValidCanonical(canonical, row.desired_outcome);

      if (!validity.ok) {
        results.skipped.push({ id: needId, reason: `Guard failed: ${validity.reason} — value: "${canonical}"` });
        continue;
      }

      const { error: updateErr } = await db
        .from("odi_needs")
        .update({ odi_canonical_statement: canonical })
        .eq("id", needId);

      if (updateErr) {
        results.errors.push({ id: needId, error: updateErr.message });
        continue;
      }

      results.success++;
      console.log(`[backfill-canonical] ✓ ${needId}: "${canonical}"`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      results.errors.push({ id: needId, error: message });
      console.error(`[backfill-canonical] ✗ ${needId}:`, message);
    }
  }

  return jsonResponse(results);
});
