// reconcile-cascade (Phase 3a) — thin auth wrapper around reconcileCascadeLocal.
// Compares the internal declared_direction cascade against the public market_read
// cascade LOCALLY and writes cascade drift. The frozen-company gate + partition gate
// + fail-closed all live in the core. Imports NO OpenAI client (zero-OpenAI structural).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { reconcileCascadeLocal } from "../_shared/localCascadeCompare.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !serviceRoleKey || !anonKey) return json({ error: "Missing Supabase env vars" }, 500);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "No auth header" }, 401);
    const bearerToken = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (bearerToken !== serviceRoleKey) {
      const anonClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
      const { data: userRes, error: authError } = await anonClient.auth.getUser();
      if (authError || !userRes?.user) return json({ error: "Unauthorized" }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const company_id = String((body as Record<string, unknown>)?.company_id || "").trim();
    if (!company_id) return json({ error: "company_id required" }, 400);
    const dry_run = !!(body as Record<string, unknown>)?.dry_run;

    const supabase = createClient(supabaseUrl, serviceRoleKey) as unknown as { from: (t: string) => any };
    const ollamaUrl = Deno.env.get("OLLAMA_BASE_URL") ?? "http://host.docker.internal:11434/v1";

    const result = await reconcileCascadeLocal({ supabase, companyId: company_id, ollamaUrl, dryRun: dry_run });
    return json(result);
  } catch (err) {
    // Fail-closed: the core already recorded a failed integrity row. Surface it.
    const message = err instanceof Error ? err.message : String(err);
    return json({ error: `cascade reconcile failed: ${message}` }, 502);
  }
});
