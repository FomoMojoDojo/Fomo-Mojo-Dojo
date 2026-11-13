// ── callerGate — the two-line edge wiring of callerAuthz (SP-142) ─────────────────────────────────
//
// callerAuthz.ts holds the decision and is PURE, so its 19 unit tests load no esm.sh module and need
// no stack. This file is the thin edge wrapper: it reads the env, builds the clients and renders the
// refusal with the calling function's own CORS headers, so a handler spends two lines on SP-150 and
// every function refuses in exactly the same words.
//
// ADMIN-ONLY function — steps 1 and 2 of SP-150, before the body is read:
//
//     const refused = await adminOnlyGate(req, corsHeaders);
//     if (refused) return refused;
//
// MEMBER-CAPABLE function — step 1, then the parameters, then step 4:
//
//     const who = await identifyCaller(req, corsHeaders);
//     if (who instanceof Response) return who;
//     ... parse and validate company_id ...
//     const refused = await capabilityRefusal(who, corsHeaders, "structure.route.generate", company_id);
//     if (refused) return refused;
//
// An unset SUPABASE_URL / ANON / SERVICE_ROLE key is a 500, never an open door: the gate cannot be
// disabled by a missing variable.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  type Caller, edgeCallerDeps, refusalBody, requireAdmin, requireCapability, resolveCaller,
} from "./callerAuthz.ts";

export type { Caller };

const jsonWith = (corsHeaders: Record<string, string>, body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

function deps() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !anonKey || !serviceRoleKey) return null;
  return edgeCallerDeps({
    // deno-lint-ignore no-explicit-any
    createClient: createClient as any,
    supabaseUrl, anonKey, serviceRoleKey,
    internalSecret: Deno.env.get("INTERNAL_CALL_SECRET") ?? null,
  });
}

/** STEP 1 of SP-150. Returns the caller, or the 401 Response to return as-is. */
export async function identifyCaller(req: Request, corsHeaders: Record<string, string>): Promise<Caller | Response> {
  const d = deps();
  if (!d) return jsonWith(corsHeaders, { error: "server_misconfigured", message: "Caller identity cannot be verified — nothing was read or written." }, 500);
  const caller = await resolveCaller(d, req);
  if (!caller.ok) return jsonWith(corsHeaders, refusalBody(caller), caller.status);
  return caller;
}

/** STEPS 1 + 2 of SP-150 for an ADMIN-ONLY function. null means allowed. */
export async function adminOnlyGate(req: Request, corsHeaders: Record<string, string>): Promise<Response | null> {
  const who = await identifyCaller(req, corsHeaders);
  if (who instanceof Response) return who;
  const checked = requireAdmin(who);
  if (!checked.ok) return jsonWith(corsHeaders, refusalBody(checked), checked.status);
  return null;
}

/** STEP 4 of SP-150 for a MEMBER-CAPABLE function, after the parameters are validated. */
export async function capabilityRefusal(
  caller: Caller,
  corsHeaders: Record<string, string>,
  cap: string,
  companyId: string,
): Promise<Response | null> {
  const d = deps();
  if (!d) return jsonWith(corsHeaders, { error: "server_misconfigured", message: "Caller identity cannot be verified — nothing was read or written." }, 500);
  const checked = await requireCapability(d, caller, cap, companyId);
  if (!checked.ok) return jsonWith(corsHeaders, refusalBody(checked), checked.status);
  return null;
}
