// recapture-findings — company-scoped findings re-capture from EXISTING signals (no crawl, no model).
//
// The findings layer auto-captures a baseline run's analysis reads as standing findings during ingest
// (evidencePhase1 → captureAnalysisFindings). This endpoint re-runs ONLY that step for a company's
// latest baseline run, reading signals already in the DB — used to recover findings after the E4
// analysis carve-out + a faithful claim_text backfill, WITHOUT a re-baseline. Idempotent by
// (company_id, origin_signal_id): a re-run inserts nothing new. Writes the first_read_findings
// integrity record (seen/captured/skipped). Frozen companies (CB1) are refused at the first door.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { captureAnalysisFindings, writeFindingsIntegrityFailed } from "../_shared/analysisFindingsCapture.ts";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  ) as unknown as { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

  let company_id = "";
  try { const b = await req.json(); company_id = String(b.company_id ?? ""); } catch { /* */ }
  if (!company_id) return json({ ok: false, error: "company_id required" }, 400);

  // FROZEN GUARD — a frozen reference company (CB1) is never written.
  const { data: co } = await supabase.from("companies").select("frozen").eq("id", company_id).maybeSingle();
  if (!co) return json({ ok: false, error: "company not found" }, 404);
  if ((co as { frozen?: boolean }).frozen) return json({ ok: false, error: "recapture refused: company is frozen", frozen: true }, 403);

  // Latest baseline run (the current state the "What stands out" beat reflects).
  const { data: runRow } = await supabase.from("public_baseline_runs")
    .select("id").eq("company_id", company_id).order("id", { ascending: false }).limit(1).maybeSingle();
  const runId = (runRow as { id?: number } | null)?.id ?? null;
  if (runId == null) return json({ ok: false, error: "no public_baseline_run for this company" }, 404);

  try {
    const counts = await captureAnalysisFindings(supabase, company_id, runId);
    return json({ ok: true, company_id, run_id: runId, ...counts });
  } catch (err) {
    await writeFindingsIntegrityFailed(supabase, company_id, runId, err);
    return json({ ok: false, error: String(err instanceof Error ? err.message : err), run_id: runId }, 500);
  }
});
