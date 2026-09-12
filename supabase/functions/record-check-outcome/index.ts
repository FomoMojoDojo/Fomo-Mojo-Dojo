// ── record-check-outcome — THE sanctioned entry point for recording a check (rulings 1–7, 2026-09-12) ──
//
// POST { company_id, check_kind: 'condition_check' | 'leg_test', verdict, condition_text, route_id?,
//        route_title?, leg_id?, test_id?, hypothesis_text?, move_text?, evidence_refs?, note?, check_version? }
// Appends the durable check_outcomes row keyed by contentIdentity(condition_text) (supersedes the prior
// live row for that identity), re-applies the display cache (resurrection) and re-derives
// validation_state. No UI calls this yet; it exists so the write surface has exactly one door.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { recordCheckOutcome } from "../_shared/checkOutcomes.ts";
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
    const b = await req.json();
    const company_id = String(b?.company_id ?? "");
    if (!company_id) return json({ ok: false, error: "company_id required" }, 400);
    if (b?.check_kind !== "condition_check" && b?.check_kind !== "leg_test") return json({ ok: false, error: "check_kind must be condition_check | leg_test" }, 400);
    if (!String(b?.condition_text ?? "").trim()) return json({ ok: false, error: "condition_text required" }, 400);
    const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
    const recorded = await recordCheckOutcome(supabase as never, {
      companyId: company_id,
      checkKind: b.check_kind,
      verdict: b.verdict,
      conditionText: String(b.condition_text),
      routeId: b.route_id ?? null, routeTitle: b.route_title ?? null, legId: b.leg_id ?? null, testId: b.test_id ?? null,
      hypothesisText: b.hypothesis_text ?? null, moveText: b.move_text ?? null,
      evidenceRefs: Array.isArray(b.evidence_refs) ? b.evidence_refs : [],
      note: b.note ?? null, recordedBy: b.recorded_by ?? null, checkVersion: typeof b.check_version === "number" ? b.check_version : 1,
    });
    const validation = await recomputeValidationState(supabase as never, company_id);
    return json({ ok: true, ...recorded, validation });
  } catch (err) {
    return json({ ok: false, error: String((err as { message?: unknown })?.message ?? err) }, 500);
  }
});
