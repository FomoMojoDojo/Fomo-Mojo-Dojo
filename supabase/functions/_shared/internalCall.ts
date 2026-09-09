// GATE D (D4) — the INTERNAL server-to-server path predicate.
//
// public-baseline authenticates with auth.getUser(), which needs a real user. That forced every
// server-owned trigger to borrow a browser's JWT: the birth-terminal baseline start fired with the
// service role and got 401 every time, so a company whose browser stumbled got no outside read at
// all. This predicate is the narrow exception — and it is deliberately an AND of two independent
// facts, so neither alone opens the door:
//   1. the caller presents the shared internal secret in the x-internal-call header, and
//   2. the bearer token IS the service-role key.
// The secret is never logged and never echoed. An unset secret disables the path entirely
// (fail-closed): the caller falls through to the unchanged user path and is refused as before.
export const INTERNAL_CALL_HEADER = "x-internal-call";

/** Constant-time compare — never branch on the first differing byte. */
export function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function isInternalServiceCall(args: {
  presentedSecret: string | null | undefined;
  internalSecret: string | null | undefined;
  bearer: string | null | undefined;
  serviceRoleKey: string | null | undefined;
}): boolean {
  const secret = String(args.internalSecret ?? "");
  const presented = String(args.presentedSecret ?? "");
  const bearer = String(args.bearer ?? "");
  const serviceKey = String(args.serviceRoleKey ?? "");
  if (secret.length === 0) return false;      // unset ⇒ path disabled, fail closed
  if (serviceKey.length === 0) return false;
  if (!timingSafeEqualStr(presented, secret)) return false;
  return timingSafeEqualStr(bearer, serviceKey);
}
