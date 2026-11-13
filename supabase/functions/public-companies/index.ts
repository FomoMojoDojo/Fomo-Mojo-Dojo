import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { adminOnlyGate } from "../_shared/callerGate.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // ── SP-141 / SP-150: WHO IS CALLING, before any row is read or written. ADMIN ONLY (SP-153).
  // The gateway accepts the publishable anon key, so it identifies nobody; this is the boundary.
  // A trusted internal caller (x-internal-call pair, or a bare service-role bearer — SP-151) passes.
  const callerRefused = await adminOnlyGate(req, corsHeaders);
  if (callerRefused) return callerRefused;

  if (req.method !== "POST") {
    return json({ success: false, error: "Method not supported." }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      return json({ success: false, error: "Missing Supabase env vars." }, 500);
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data, error } = await supabase
      .from("companies")
      .select(
        "id,name,website,quarter,archetype,created_by,created_at,mojo_score,potential_score,projected_score,evidence_status,evidence_note,last_scored_at,area_scores_json,public_source_filters_json",
      )
      .order("name", { ascending: true });

    if (error) {
      return json({ success: false, error: error.message || "Failed to load companies." }, 500);
    }

    return json({
      success: true,
      companies: data ?? [],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected company API error.";
    return json({ success: false, error: message }, 500);
  }
});

