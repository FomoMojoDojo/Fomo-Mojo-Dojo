// ── recompute-validation-state ────────────────────────────────────────────────────────────────
//
// Thin trigger endpoint (mirrors refresh-mojo-score): accepts { company_id, dry_run? } and runs
// recomputeValidationState — validation_state on routes / odi_needs and triangulation_state
// 'contradicted' on claims, derived from the outcomes that already exist. dry_run reports the
// updates it WOULD apply without writing. Returns the per-table row counts and updates.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { recomputeValidationState } from "../_shared/validationState.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { company_id, dry_run } = await req.json();
    if (!company_id || typeof company_id !== "string") return json({ ok: false, error: "company_id required" }, 400);
    const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
    const result = await recomputeValidationState(supabase, company_id, { dryRun: dry_run === true });
    return json({ ok: true, ...result });
  } catch (err) {
    return json({ ok: false, error: String((err as { message?: unknown })?.message ?? err) }, 500);
  }
});
