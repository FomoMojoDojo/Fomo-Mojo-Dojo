// ── callerAuthz — THE caller check every edge function runs first (SP-141, SP-150, slice A) ────────
//
// SP-141 is the law this module exists to serve: every edge function decides WHO IS CALLING before it
// reads or writes any row, INSIDE the function. A route wrapper, a hidden button and a client-side
// capability check are conveniences, never the boundary. The publishable anon key identifies nobody —
// it is a valid JWT, it passes the gateway's verify_jwt, and before slice A it reached 72 handlers.
//
// ONE HELPER, NOT ELEVEN COPIES (SP-142). Nothing here is a new trust mechanism:
//   • the internal door is _shared/internalCall.ts, unchanged, plus a bare service-role bearer
//     (SP-151 — the service-role key already grants strictly more than any function does, and the DB
//     cron callers and operator scripts send only that);
//   • the admin test is the user_roles select council-review:1454 already uses;
//   • the capability test is the database's own public.has_capability(user, cap, company).
//
// ORDER (SP-150), and the reason for the split into three calls:
//   1. resolveCaller            → 401 no_user when the bearer carries no user and is not internal
//   2. requireAdmin             → 403 not_authorised, BEFORE the body's company is read
//   3. validate parameters      (the caller's own code)
//   4. requireCapability        → 403 not_authorised for the body's company
//   5. only then read or write
// An admin-only function calls 1 then 2. A member-capable function calls 1, then 3, then 4 — and 2 is
// folded into 4, because an admin passes a capability check by being an admin.
//
// REFUSALS ARE NAMED AND CARRY NO ORACLE (SP-144). `no_user` and `not_authorised` are the only two.
// requireCapability runs the SAME has_capability query whether or not the company exists and whether
// or not the caller is a member of it, so a 403 never distinguishes "no such company" from "not
// yours". It never selects the company row to find out.
//
// CORS preflight stays unauthenticated (SP-150): the caller check goes AFTER the OPTIONS early
// return and before everything else.

import { INTERNAL_CALL_HEADER, isInternalServiceCall, timingSafeEqualStr } from "./internalCall.ts";

/** The two named refusals. Nothing else is ever returned to a caller. */
export const NO_USER = "no_user" as const;
export const NOT_AUTHORISED = "not_authorised" as const;

export type Caller =
  /** A trusted internal caller: the x-internal-call pair, or a bare service-role bearer. */
  | { ok: true; kind: "internal" }
  /** A signed-in user holding a user_roles admin row. */
  | { ok: true; kind: "admin"; userId: string }
  /** A signed-in user who is not an admin. Authorisation for a company is still unproven. */
  | { ok: true; kind: "user"; userId: string }
  | { ok: false; status: 401; error: typeof NO_USER }
  | { ok: false; status: 403; error: typeof NOT_AUTHORISED };

/** A refusal rendered as a body. Each function wraps it with its own CORS headers. */
export function refusalBody(c: Extract<Caller, { ok: false }>): { error: string; message: string } {
  return c.error === NO_USER
    ? { error: NO_USER, message: "This call carries no signed-in user — nothing was read or written." }
    : { error: NOT_AUTHORISED, message: "This account may not act on this company — nothing was read or written." };
}

/**
 * Is this request a trusted internal caller? PURE — no I/O, so it is unit-testable on its own.
 *
 * Two independent doors, both constant-time, both fail-closed on an unset secret or key:
 *   a. the x-internal-call pair (secret AND service-role bearer) — _shared/internalCall.ts;
 *   b. a bare service-role bearer (SP-151) — what net.http_post from a DB function sends, and what
 *      every operator script sends.
 * The anon key is never trusted by either (SP-151).
 */
export function isTrustedInternal(args: {
  authHeader: string | null | undefined;
  presentedSecret: string | null | undefined;
  internalSecret: string | null | undefined;
  serviceRoleKey: string | null | undefined;
}): boolean {
  const bearer = String(args.authHeader ?? "").replace(/^Bearer\s+/i, "").trim();
  const serviceKey = String(args.serviceRoleKey ?? "");
  if (bearer.length === 0 || serviceKey.length === 0) return false;
  if (isInternalServiceCall({
    presentedSecret: args.presentedSecret,
    internalSecret: args.internalSecret,
    bearer,
    serviceRoleKey: serviceKey,
  })) return true;
  return timingSafeEqualStr(bearer, serviceKey);
}

/** Everything the resolver needs, injected so the unit tests need no network and no stack. */
export type CallerDeps = {
  /** Resolves the user behind a user JWT. Returns null for the anon key or any invalid bearer. */
  getUser: (authHeader: string) => Promise<{ id: string } | null>;
  /** True when this user holds a user_roles admin row. */
  isAdmin: (userId: string) => Promise<boolean>;
  /** public.has_capability(user, cap, company). */
  hasCapability: (userId: string, cap: string, companyId: string) => Promise<boolean>;
  serviceRoleKey: string | null | undefined;
  internalSecret: string | null | undefined;
};

/**
 * STEP 1 of SP-150 — who is calling. Reads no row of any company and takes no company id, so it
 * cannot leak whether one exists. 401 no_user is the only refusal it can return.
 */
export async function resolveCaller(deps: CallerDeps, req: Request): Promise<Caller> {
  const authHeader = req.headers.get("Authorization");
  if (isTrustedInternal({
    authHeader,
    presentedSecret: req.headers.get(INTERNAL_CALL_HEADER),
    internalSecret: deps.internalSecret,
    serviceRoleKey: deps.serviceRoleKey,
  })) return { ok: true, kind: "internal" };

  if (!authHeader) return { ok: false, status: 401, error: NO_USER };
  const user = await deps.getUser(authHeader);
  if (!user?.id) return { ok: false, status: 401, error: NO_USER };
  return (await deps.isAdmin(user.id))
    ? { ok: true, kind: "admin", userId: user.id }
    : { ok: true, kind: "user", userId: user.id };
}

/**
 * STEP 2 of SP-150 — an ADMIN-ONLY function, refused BEFORE the body's company is read. An internal
 * caller passes. Returns the caller unchanged when allowed, so the call site reads as one line.
 */
export function requireAdmin(caller: Caller): Caller {
  if (!caller.ok) return caller;
  if (caller.kind === "internal" || caller.kind === "admin") return caller;
  return { ok: false, status: 403, error: NOT_AUTHORISED };
}

/**
 * STEP 4 of SP-150 — a MEMBER-CAPABLE function, after the parameters are validated. Admin and
 * internal pass. Anyone else must hold `cap` on THIS company per the database.
 *
 * NO EXISTENCE ORACLE (SP-144): the same has_capability call runs whatever the company id is, and
 * the company row is never selected, so a 403 is identical for a company that does not exist, one
 * the caller does not belong to, and one they belong to without the capability.
 */
export async function requireCapability(
  deps: CallerDeps,
  caller: Caller,
  cap: string,
  companyId: string,
): Promise<Caller> {
  if (!caller.ok) return caller;
  if (caller.kind === "internal" || caller.kind === "admin") return caller;
  if (!companyId) return { ok: false, status: 403, error: NOT_AUTHORISED };
  return (await deps.hasCapability(caller.userId, cap, companyId))
    ? caller
    : { ok: false, status: 403, error: NOT_AUTHORISED };
}

/**
 * The edge-runtime wiring of CallerDeps. Kept here so no function builds its own: one anon client for
 * getUser (the user's own JWT), one service-role client for the admin row and the capability call.
 *
 * `createClient` is passed in rather than imported so this module stays free of a pinned esm.sh
 * version and the unit tests never load one.
 */
export function edgeCallerDeps(args: {
  createClient: (url: string, key: string, opts?: unknown) => {
    auth: { getUser: () => Promise<{ data?: { user?: { id?: string } | null } | null }> };
    from: (t: string) => {
      select: (c: string) => {
        eq: (a: string, b: unknown) => { eq: (a: string, b: unknown) => { limit: (n: number) => Promise<{ data?: unknown[] | null }> } };
      };
    };
    rpc: (fn: string, params: Record<string, unknown>) => Promise<{ data?: unknown; error?: unknown }>;
  };
  supabaseUrl: string;
  anonKey: string;
  serviceRoleKey: string;
  internalSecret?: string | null;
}): CallerDeps {
  const service = args.createClient(args.supabaseUrl, args.serviceRoleKey);
  return {
    serviceRoleKey: args.serviceRoleKey,
    internalSecret: args.internalSecret ?? null,
    getUser: async (authHeader: string) => {
      const anon = args.createClient(args.supabaseUrl, args.anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      try {
        const res = await anon.auth.getUser();
        const id = res?.data?.user?.id;
        return id ? { id: String(id) } : null;
      } catch {
        return null;
      }
    },
    isAdmin: async (userId: string) => {
      const { data } = await service.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").limit(1);
      return Array.isArray(data) && data.length > 0;
    },
    hasCapability: async (userId: string, cap: string, companyId: string) => {
      const { data, error } = await service.rpc("has_capability", {
        _user_id: userId, _cap: cap, _company_id: companyId,
      });
      return !error && data === true;
    },
  };
}
