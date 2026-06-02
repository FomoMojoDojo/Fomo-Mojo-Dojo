// ── refresh-mojo-score ────────────────────────────────────────────────────────
//
// Thin trigger endpoint: accepts { company_id } and fires snapshotMojoScore.
// Called from the frontend after any direct DB mutation that moves the live
// mojo score (currently: RouteInspectPanel leg-fill via Execution tab).
//
// Non-fatal — errors are logged but never surface to the client.
// Returns { ok: true } on success, { ok: false, error } on failure.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { snapshotMojoScore } from "../_shared/snapshotMojoScore.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { company_id } = await req.json();
    if (!company_id || typeof company_id !== "string") {
      return new Response(
        JSON.stringify({ ok: false, error: "company_id required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    await snapshotMojoScore(supabase, company_id);

    return new Response(
      JSON.stringify({ ok: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[refresh-mojo-score] error:", String((err as Error)?.message ?? err));
    return new Response(
      JSON.stringify({ ok: false, error: String((err as Error)?.message ?? err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
