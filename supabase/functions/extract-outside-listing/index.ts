// extract-outside-listing — the SANCTIONED DOOR for the listing evidence class (operator ruling 2026-09-04).
// Body: { company_id, run_id (REQUIRED — the outside_recrawl_review run), mode: 'dry' (default) | 'apply', urls?: [] }.
// Deterministic, model-free; behind the R3 review gate; frozen refused (403). Core: _shared/listingRegen.ts.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { runListingRegen } from "../_shared/listingRegen.ts";
import { requireRunId } from "../_shared/outsideRecrawlReview.ts";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const company_id = String(body.company_id ?? "");
    if (!company_id) return json({ ok: false, error: "company_id required" }, 400);
    const runId = requireRunId(body as Record<string, unknown>);
    if (!runId) return json({ ok: false, error: "run_id is required: name the outside_recrawl_review run whose approved rows to regenerate" }, 400);
    const mode = body.mode === "apply" ? "apply" : "dry";
    const urls: string[] | null = Array.isArray(body.urls) ? body.urls.map(String) : null;
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const res = await runListingRegen({ supabase, companyId: company_id, runId, mode, urls, nowIso: new Date().toISOString() });
    if (!res.ok && "skipped" in res) {
      if (res.skipped === "frozen_company") return json({ ok: false, error: "This is a frozen reference company — its record is preserved and is not modified." }, 403);
      return json({ ok: false, error: "company not found" }, 404);
    }
    if (!res.ok) return json(res, 500);
    return json(res);
  } catch (e) { return json({ ok: false, error: (e as Error).message }, 500); }
});
