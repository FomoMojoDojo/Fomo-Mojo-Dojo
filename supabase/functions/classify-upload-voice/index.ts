// classify-upload-voice — thin HTTP wrapper over _shared/uploadVoiceClassifier.ts.
//
// Per-document voice classification for a company's uploaded corpus (VOICE-GATE).
// Accepts { company_id, plan?, write? }:
//   plan:true  ⇒ manifest of each contributing doc's current verdict/override,
//                ZERO model calls, ZERO writes (the operator's pre-run surface).
//   write:false ⇒ classify (model calls) but do not persist (dry run).
//   default     ⇒ classify + persist immutable model verdict rows.
//
// LOCAL-ONLY (Option B): qwen2.5:14b-instruct on a localhost Ollama only. ZERO
// OpenAI. Fail-toward-external is enforced inside classifyUploadVoice.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isLocalOllamaUrl, planUploadVoice, runUploadVoiceClassification } from "../_shared/uploadVoiceClassifier.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    // input_file_id: classify ONE document (the upload path); force + write:false: re-judge classified docs
    // without writing (the accuracy read). Overrides are written by the admin panel, not here.
    // reclassify_outdated: a document whose current model row is below CLASSIFIER_VERSION is re-judged as a
    // NEW version-2 model row beside the old one (versioned verdicts, signed 2026-09-13).
    const { company_id, plan, write, input_file_id, force, reclassify_outdated } = await req.json();
    if (!company_id || typeof company_id !== "string") return json({ ok: false, error: "company_id required" }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    ) as unknown as { from: (t: string) => any; storage: any };

    if (plan === true) {
      const result = await planUploadVoice(supabase, company_id);
      return json({ ok: true, plan: true, ...result });
    }

    const ollamaUrl = Deno.env.get("OLLAMA_BASE_URL") ?? "http://host.docker.internal:11434/v1";
    if (!isLocalOllamaUrl(ollamaUrl)) {
      return json({ ok: false, error: "Local-only policy violation: OLLAMA_BASE_URL must resolve to localhost/host.docker.internal." }, 500);
    }
    const result = await runUploadVoiceClassification(supabase, company_id, {
      ollamaUrl,
      model: Deno.env.get("OLLAMA_MODEL") ?? undefined,
      write: write !== false,
      inputFileId: typeof input_file_id === "string" && input_file_id ? input_file_id : null,
      force: force === true,
      reclassifyOutdated: reclassify_outdated === true,
    });
    return json({ ok: true, dry_run: write === false, ...result });
  } catch (err) {
    console.error("[classify-upload-voice] error:", String((err as Error)?.message ?? err));
    return json({ ok: false, error: String((err as Error)?.message ?? err) }, 500);
  }
});
