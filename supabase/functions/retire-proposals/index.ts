// ── retire-proposals ─────────────────────────────────────────────────────────
// Retirement by operator decision (mechanism signed 2026-09-14). Accepts
//   { company_id, proposal_ids: string[], reason: "<who>:<what>", actor?, note?, dry_run? }
//   dry_run:true (default) ⇒ the full plan — per proposal: live signals, claims to be struck — and ZERO writes.
//   dry_run:false          ⇒ supersede + strike + ledger row per proposal; no re-ingest, nothing minted;
//                            the Mojo Score is re-snapshotted.
// Addressed by proposal id: reaches proposals whose input_files row is gone and ones with no file_id.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { applyRetirement, applySignalRetirement, planRetirement, planSignalRetirement } from "../_shared/retireProposals.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { company_id, proposal_ids, signal_ids, reason, actor, note, dry_run } = await req.json();
    if (!company_id || typeof company_id !== "string") return json({ ok: false, error: "company_id required" }, 400);
    const bySignal = Array.isArray(signal_ids) && signal_ids.length > 0;
    if (!bySignal && (!Array.isArray(proposal_ids) || proposal_ids.length === 0)) return json({ ok: false, error: "proposal_ids required" }, 400);
    if (typeof reason !== "string" || !reason) return json({ ok: false, error: "reason required (<who>:<what>)" }, 400);
    const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "") as unknown as { from: (t: string) => any; rpc: (fn: string, a: Record<string, unknown>) => any };
    if (bySignal) {
      const plans = await planSignalRetirement(supabase, company_id, signal_ids.map(String), reason);
      if (dry_run !== false) return json({ ok: true, dry_run: true, reason, mode: "signals", plans });
      if (typeof actor !== "string" || !actor.trim()) return json({ ok: false, error: "actor required to apply" }, 400);
      const applied = await applySignalRetirement(supabase, company_id, plans, { reason, actor, note: typeof note === "string" ? note : undefined });
      return json({ ok: true, dry_run: false, reason, mode: "signals", plans, applied });
    }
    const plans = await planRetirement(supabase, company_id, proposal_ids.map(String), reason);
    if (dry_run !== false) return json({ ok: true, dry_run: true, reason, plans });
    if (typeof actor !== "string" || !actor.trim()) return json({ ok: false, error: "actor required to apply" }, 400);
    const applied = await applyRetirement(supabase, company_id, plans, { reason, actor, note: typeof note === "string" ? note : undefined });
    return json({ ok: true, dry_run: false, reason, plans, applied });
  } catch (err) {
    const msg = String((err as Error)?.message ?? err);
    console.error("[retire-proposals] error:", msg);
    return json({ ok: false, error: msg }, /reason must be|proposal_ids required|actor required/.test(msg) ? 400 : 500);
  }
});
