// ============================================================================
// import-intake-submissions — LOCAL importer (design gate 2026-08-12, R6/R8).
//
// Manual, admin-only (R2). Pulls pending rows from the HOSTED mailbox project
// (intake_submissions) and reproduces launch-site-intake's writes LOCALLY,
// reusing its verbatim write helpers (../_shared/intakeWrites.ts). All company
// matching + pipeline decisions happen here; the hosted side never sees a
// companies table. The company match + write loop live in ./core.ts (so the
// falsification harness and the Cafe Barra backfill drive the exact same code);
// this file is only the HTTP shell: env plumbing + admin gate.
//
// Pipeline (run-agent-flow) fires only when the payload requested it AND the
// caller passed allow_pipeline=true. Default is FALSE — the manual trigger
// decides; the Cafe Barra backfill runs with it false (operator rider).
//
// verify_jwt stays true (default — no config.toml entry): this fn requires a
// JWT; it ALSO checks the caller is an admin.
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveActingUser } from "../_shared/intakeWrites.ts";
import { processPendingRows } from "./core.ts";

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
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const hostedUrl = Deno.env.get("HOSTED_INTAKE_URL");
    const hostedKey = Deno.env.get("HOSTED_INTAKE_SERVICE_KEY");
    if (!supabaseUrl || !serviceRole || !anonKey) {
      return json({ error: "Missing local Supabase env vars." }, 500);
    }
    if (!hostedUrl || !hostedKey) {
      return json({ error: "Missing HOSTED_INTAKE_URL / HOSTED_INTAKE_SERVICE_KEY secrets." }, 500);
    }

    // ADMIN GATE — verify_jwt already required a JWT; confirm the caller is admin.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing authorization." }, 401);
    const local = createClient(supabaseUrl, serviceRole);
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    const callerId = userData?.user?.id;
    if (!callerId) return json({ error: "Invalid session." }, 401);
    const { data: adminRow } = await local
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId)
      .eq("role", "admin")
      .maybeSingle();
    if (!adminRow) return json({ error: "Admin only." }, 403);

    const body = (await req.json().catch(() => ({}))) as {
      allow_pipeline?: boolean;
      limit?: number;
      ids?: string[];
    };
    const allowPipeline = body.allow_pipeline === true; // default FALSE

    // Hosted mailbox client (service role on the hosted project).
    const hosted = createClient(hostedUrl, hostedKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const actingUser = await resolveActingUser({ supabaseUrl, anonKey, serviceRoleClient: local });

    const results = await processPendingRows({
      local,
      hosted,
      actingUser,
      allowPipeline,
      supabaseUrl,
      anonKey,
      ids: Array.isArray(body.ids) ? body.ids : undefined,
      limit: body.limit,
    });

    return json({ processed: results.length, allow_pipeline: allowPipeline, results });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected importer error.";
    console.error("[import-intake-submissions] failed", message);
    return json({ error: message }, 500);
  }
});
