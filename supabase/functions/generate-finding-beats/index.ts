// generate-finding-beats: generate the insight three-beat (Observe / Name-the-tension
// / Open) for every finding in a company that does not yet have beats. Idempotent —
// only fills findings WHERE beats IS NULL, so re-invoking generates 0.
//
// Input:  { company_id }
// Output: { generated, skipped, failed }
//
// This is the manual / backfill trigger. The same generator is also called in-process
// by the public-baseline ingest auto-capture path (supabase/functions/_shared/evidencePhase1.ts).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { generateFindingBeats } from "../_shared/findingBeats.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { company_id } = await req.json().catch(() => ({}));
    if (!company_id || typeof company_id !== "string") {
      return jsonResponse({ error: "company_id (string) required" }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ error: "missing Supabase service env" }, 500);
    }
    if (!openaiApiKey) {
      return jsonResponse({ error: "missing OPENAI_API_KEY" }, 500);
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const result = await generateFindingBeats({ supabase, companyId: company_id, openaiApiKey });
    return jsonResponse(result);
  } catch (err) {
    return jsonResponse({ error: String(err instanceof Error ? err.message : err) }, 500);
  }
});
