// ============================================================================
// HOSTED INTAKE RECEIVER (Fix B, design gate 2026-08-12).
//
// Deployed to the SEPARATE hosted `mojomap-intake` project only — NOT the local
// stack. It is a dumb mailbox: it authorizes with a shared token, stores the raw
// submission in ONE table (public.intake_submissions), and returns. It writes no
// other table, reads no companies table (there is none), and CALLS NOTHING (R5).
//
// verify_jwt EXCEPTION (hosted project only): this function is deployed with
// verify_jwt=false because its caller is the public marketing form, which has no
// Supabase user. Its gate is instead the shared `x-intake-token` header validated
// below against the INTAKE_SHARED_TOKEN secret (R1). There is NO legacy
// `Authorization: Bearer` path — the old MOJOMAP_AUTORUN_WEBHOOK_TOKEN route is
// retired (R7). This exception lives ONLY on the hosted project; the local/main
// project keeps every function at verify_jwt=true.
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-intake-token",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// dedup_key (R4) = sha256( submitted_at | website_url | explicit_strategic_problem )
async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function firstIp(req: Request): string | null {
  const fwd = req.headers.get("x-forwarded-for");
  if (!fwd) return null;
  const ip = fwd.split(",")[0].trim();
  return ip || null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  // SHARED-TOKEN GATE — the only gate (no legacy Bearer). Reject before any parse.
  const intakeToken = String(Deno.env.get("INTAKE_SHARED_TOKEN") || "").trim();
  const received = String(req.headers.get("x-intake-token") || "").trim();
  if (!(intakeToken.length > 0 && received === intakeToken)) {
    return json({ error: "Unauthorized intake request." }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRole) {
    return json({ error: "Missing Supabase env vars." }, 500);
  }

  let payload: Record<string, unknown>;
  try {
    payload = (await req.json()) as Record<string, unknown>;
    if (!payload || typeof payload !== "object") throw new Error("bad payload");
  } catch {
    return json({ error: "Invalid JSON payload." }, 400);
  }

  const submittedAtRaw = String(payload.submitted_at || "").trim();
  const websiteRaw = String(payload.website_url || "").trim();
  const problemRaw = String(payload.explicit_strategic_problem || "").trim();
  const dedupKey = await sha256Hex(`${submittedAtRaw}|${websiteRaw}|${problemRaw}`);

  const supabase = createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase
    .from("intake_submissions")
    .insert({
      submitted_at: submittedAtRaw || null,
      payload,
      source: "marketing-form",
      source_ip: firstIp(req),
      user_agent: req.headers.get("user-agent"),
      dedup_key: dedupKey,
      // status defaults to 'pending'
    })
    .select("id")
    .single();

  if (error) {
    // Unique violation on dedup_key -> this exact submission already arrived.
    if (error.code === "23505") return json({ duplicate: true }, 200);
    return json({ error: error.message || "Failed to store submission." }, 500);
  }

  return json({ stored: true, id: data?.id ?? null }, 200);
});
