// ── remint-upload-provenance ─────────────────────────────────────────────────
// The re-mint tool (mechanism signed 2026-09-13). Accepts { company_id, input_file_ids?, dry_run?, note? }.
//   dry_run:true (default) ⇒ the full plan — per proposal: current origin, live origin, what would be
//                            superseded / struck / minted — and ZERO writes.
//   dry_run:false          ⇒ applies the plan (supersede, re-ingest at minting_version 2, strike, ledger)
//                            and re-snapshots the Mojo Score.
// Scope is one company; the operator names it. LOCAL-ONLY classifier (Option B).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isLocalOllamaUrl } from "../_shared/uploadVoiceClassifier.ts";
import { applyAnalysisRemint, applyRemint, planAnalysisRemint, planRemint } from "../_shared/remintUploadProvenance.ts";

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
    const { company_id, input_file_ids, proposal_ids, dry_run, note, actor } = await req.json();
    if (!company_id || typeof company_id !== "string") return json({ ok: false, error: "company_id required" }, 400);
    // ANALYSIS RE-MINT (rulings 1–4, 2026-09-14): a mojo-analysis proposal by id — no document, no classifier.
    if (Array.isArray(proposal_ids) && proposal_ids.length > 0) {
      const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "") as unknown as { from: (t: string) => any; rpc: (fn: string, a: Record<string, unknown>) => any; storage: any };
      const plans = await planAnalysisRemint(supabase, company_id, proposal_ids.map(String));
      if (dry_run !== false) return json({ ok: true, dry_run: true, mode: "analysis", plans });
      const applied = await applyAnalysisRemint(supabase, company_id, plans, { note: typeof note === "string" ? note : undefined, actor: typeof actor === "string" && actor.trim() ? actor : undefined });
      return json({ ok: true, dry_run: false, mode: "analysis", plans, applied });
    }
    const ollamaUrl = Deno.env.get("OLLAMA_BASE_URL") ?? "http://host.docker.internal:11434/v1";
    if (!isLocalOllamaUrl(ollamaUrl)) return json({ ok: false, error: "Local-only policy violation: OLLAMA_BASE_URL must resolve to localhost/host.docker.internal." }, 500);
    const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "") as unknown as { from: (t: string) => any; rpc: (fn: string, a: Record<string, unknown>) => any; storage: any };
    const plans = await planRemint(supabase, company_id, { ollamaUrl, model: Deno.env.get("OLLAMA_MODEL") ?? undefined, inputFileIds: Array.isArray(input_file_ids) ? input_file_ids.map(String) : null });
    if (dry_run !== false) return json({ ok: true, dry_run: true, plans });
    const applied = await applyRemint(supabase, company_id, plans, { note: typeof note === "string" ? note : undefined });
    return json({ ok: true, dry_run: false, plans, applied });
  } catch (err) {
    console.error("[remint-upload-provenance] error:", String((err as Error)?.message ?? err));
    return json({ ok: false, error: String((err as Error)?.message ?? err) }, 500);
  }
});
