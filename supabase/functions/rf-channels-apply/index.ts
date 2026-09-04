// rf-channels-apply — the SANCTIONED DOOR for applying an operator-signed RF channels admission plan
// (operator ruling 2026-09-04). Body: { company_id, mode: 'dry_run' (default) | 'apply', plan: [{claim_id, kind, reason}] }.
// Never calls the judge. Frozen companies refused (403). Own_words claims are never touched. Core: _shared/rfChannelsApply.ts.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { runRfChannelsApply, type RfApplyPlanRow } from "../_shared/rfChannelsApply.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const company_id = String(body.company_id ?? "");
    const mode = body.mode === "apply" ? "apply" : "dry_run";
    if (!company_id) return json({ ok: false, error: "company_id required" }, 400);
    const plan: RfApplyPlanRow[] = Array.isArray(body.plan)
      ? (body.plan as Array<Record<string, unknown>>).map((r) => ({ claim_id: String(r.claim_id ?? ""), kind: r.kind, reason: r.reason == null ? null : String(r.reason) })).filter((r) => r.claim_id)
      : [];
    if (!plan.length) return json({ ok: false, error: "plan required (non-empty)" }, 400);
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const res = await runRfChannelsApply({ supabase, companyId: company_id, plan, mode, nowIso: new Date().toISOString(), runId: typeof body.run_id === "string" ? body.run_id : null });
    if (!res.ok && "skipped" in res) {
      if (res.skipped === "frozen_company") return json({ ok: false, error: "This is a frozen reference company — its record is preserved and is not modified." }, 403);
      return json({ ok: false, error: "company not found" }, 404);
    }
    if (!res.ok) return json(res, 500);
    return json(res);
  } catch (e) {
    return json({ ok: false, error: (e as Error).message }, 500);
  }
});
