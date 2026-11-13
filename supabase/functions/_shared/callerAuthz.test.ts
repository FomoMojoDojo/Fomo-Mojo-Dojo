// Unit tests for the shared caller check (SP-142, SP-162 slice A step 7): one test per outcome of
// resolveCaller / requireAdmin / requireCapability, plus the non-vacuity and no-oracle properties.
// Pure — no stack, no network, no esm.sh import. Run: deno test supabase/functions/_shared/callerAuthz.test.ts
import { assert, assertEquals, assertFalse } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  type Caller, type CallerDeps, NOT_AUTHORISED, NO_USER,
  isTrustedInternal, refusalBody, requireAdmin, requireCapability, resolveCaller,
} from "./callerAuthz.ts";

const SERVICE = "service-role-key-aaaaaaaaaaaaaaaaaaaaaaaa";
const SECRET = "internal-secret-bbbbbbbbbbbbbbbbbbbbbbbb";
const ANON = "anon-publishable-key-cccccccccccccccccccc";
const ADMIN_ID = "11111111-1111-4111-8111-111111111111";
const MEMBER_ID = "22222222-2222-4222-8222-222222222222";
const CO_A = "aaaaaaaa-0000-4000-8000-00000000000a";
const CO_B = "bbbbbbbb-0000-4000-8000-00000000000b";

/** A deps double. `grants` is the only source of capability truth here. */
function deps(opts: {
  users?: Record<string, string>;            // authHeader -> userId
  admins?: string[];
  grants?: Array<[string, string, string]>;  // [userId, cap, companyId]
  onHasCapability?: (u: string, c: string, co: string) => void;
} = {}): CallerDeps {
  return {
    serviceRoleKey: SERVICE,
    internalSecret: SECRET,
    getUser: (authHeader) => Promise.resolve(opts.users?.[authHeader] ? { id: opts.users[authHeader] } : null),
    isAdmin: (userId) => Promise.resolve((opts.admins ?? []).includes(userId)),
    hasCapability: (u, c, co) => {
      opts.onHasCapability?.(u, c, co);
      return Promise.resolve((opts.grants ?? []).some(([a, b, d]) => a === u && b === c && d === co));
    },
  };
}
const req = (headers: Record<string, string> = {}) =>
  new Request("http://localhost/functions/v1/x", { method: "POST", headers });

// ── isTrustedInternal — pure, both doors, both fail-closed ────────────────────────────────────────

Deno.test("internal door a: the x-internal-call pair (secret AND service-role bearer) is trusted", () => {
  assert(isTrustedInternal({
    authHeader: `Bearer ${SERVICE}`, presentedSecret: SECRET,
    internalSecret: SECRET, serviceRoleKey: SERVICE,
  }));
});

Deno.test("internal door b (SP-151): a BARE service-role bearer is trusted, with no secret header", () => {
  assert(isTrustedInternal({
    authHeader: `Bearer ${SERVICE}`, presentedSecret: null,
    internalSecret: SECRET, serviceRoleKey: SERVICE,
  }));
});

Deno.test("the ANON key is never trusted, with or without the secret (SP-151)", () => {
  for (const presented of [null, SECRET]) {
    assertFalse(isTrustedInternal({
      authHeader: `Bearer ${ANON}`, presentedSecret: presented,
      internalSecret: SECRET, serviceRoleKey: SERVICE,
    }));
  }
});

Deno.test("fail-closed: an unset service-role key or an empty bearer trusts nothing", () => {
  assertFalse(isTrustedInternal({ authHeader: `Bearer ${SERVICE}`, presentedSecret: SECRET, internalSecret: SECRET, serviceRoleKey: "" }));
  assertFalse(isTrustedInternal({ authHeader: null, presentedSecret: SECRET, internalSecret: SECRET, serviceRoleKey: SERVICE }));
  assertFalse(isTrustedInternal({ authHeader: "", presentedSecret: SECRET, internalSecret: SECRET, serviceRoleKey: SERVICE }));
});

Deno.test("a wrong secret with a non-service bearer is not trusted by either door", () => {
  assertFalse(isTrustedInternal({
    authHeader: "Bearer some-user-jwt", presentedSecret: "wrong",
    internalSecret: SECRET, serviceRoleKey: SERVICE,
  }));
});

// ── resolveCaller — the three successes and the one refusal ───────────────────────────────────────

Deno.test("resolveCaller: no Authorization header at all -> 401 no_user", async () => {
  const c = await resolveCaller(deps(), req());
  assertEquals(c, { ok: false, status: 401, error: NO_USER });
});

Deno.test("resolveCaller: the anon key carries no user -> 401 no_user (the SP-141 finding)", async () => {
  const c = await resolveCaller(deps({ users: {} }), req({ Authorization: `Bearer ${ANON}` }));
  assertEquals(c, { ok: false, status: 401, error: NO_USER });
});

Deno.test("resolveCaller: a service-role bearer -> internal, and getUser is never consulted", async () => {
  let asked = false;
  const d = { ...deps(), getUser: () => { asked = true; return Promise.resolve(null); } };
  const c = await resolveCaller(d, req({ Authorization: `Bearer ${SERVICE}` }));
  assertEquals(c, { ok: true, kind: "internal" });
  assertFalse(asked);
});

Deno.test("resolveCaller: an admin's JWT -> admin; a non-admin's -> user", async () => {
  const d = deps({ users: { "Bearer admin-jwt": ADMIN_ID, "Bearer member-jwt": MEMBER_ID }, admins: [ADMIN_ID] });
  assertEquals(await resolveCaller(d, req({ Authorization: "Bearer admin-jwt" })), { ok: true, kind: "admin", userId: ADMIN_ID });
  assertEquals(await resolveCaller(d, req({ Authorization: "Bearer member-jwt" })), { ok: true, kind: "user", userId: MEMBER_ID });
});

// ── requireAdmin — step 2 of SP-150 ──────────────────────────────────────────────────────────────

Deno.test("requireAdmin: admin and internal pass; a signed-in non-admin -> 403 not_authorised", () => {
  assertEquals(requireAdmin({ ok: true, kind: "admin", userId: ADMIN_ID }), { ok: true, kind: "admin", userId: ADMIN_ID });
  assertEquals(requireAdmin({ ok: true, kind: "internal" }), { ok: true, kind: "internal" });
  assertEquals(requireAdmin({ ok: true, kind: "user", userId: MEMBER_ID }), { ok: false, status: 403, error: NOT_AUTHORISED });
});

Deno.test("requireAdmin: a 401 is passed through unchanged — never upgraded to 403", () => {
  const refused: Caller = { ok: false, status: 401, error: NO_USER };
  assertEquals(requireAdmin(refused), refused);
});

// ── requireCapability — step 4 of SP-150 ─────────────────────────────────────────────────────────

Deno.test("requireCapability: a member holding the cap on THIS company reaches the handler", async () => {
  const d = deps({ grants: [[MEMBER_ID, "structure.route.generate", CO_A]] });
  const c = await requireCapability(d, { ok: true, kind: "user", userId: MEMBER_ID }, "structure.route.generate", CO_A);
  assertEquals(c, { ok: true, kind: "user", userId: MEMBER_ID });
});

Deno.test("requireCapability: a member of A acting on B -> 403 not_authorised (SP-145)", async () => {
  const d = deps({ grants: [[MEMBER_ID, "structure.route.generate", CO_A]] });
  const c = await requireCapability(d, { ok: true, kind: "user", userId: MEMBER_ID }, "structure.route.generate", CO_B);
  assertEquals(c, { ok: false, status: 403, error: NOT_AUTHORISED });
});

Deno.test("requireCapability: a member of the company WITHOUT the cap -> 403 not_authorised", async () => {
  const d = deps({ grants: [[MEMBER_ID, "participation.suggest", CO_A]] });
  const c = await requireCapability(d, { ok: true, kind: "user", userId: MEMBER_ID }, "structure.route.generate", CO_A);
  assertEquals(c, { ok: false, status: 403, error: NOT_AUTHORISED });
});

Deno.test("requireCapability: admin and internal pass without any capability row", async () => {
  const d = deps({ grants: [] });
  assertEquals(await requireCapability(d, { ok: true, kind: "admin", userId: ADMIN_ID }, "structure.route.generate", CO_A),
    { ok: true, kind: "admin", userId: ADMIN_ID });
  assertEquals(await requireCapability(d, { ok: true, kind: "internal" }, "structure.route.generate", CO_A),
    { ok: true, kind: "internal" });
});

Deno.test("requireCapability: an empty company id refuses rather than asking the database", async () => {
  let asked = false;
  const d = deps({ onHasCapability: () => { asked = true; } });
  const c = await requireCapability(d, { ok: true, kind: "user", userId: MEMBER_ID }, "structure.route.generate", "");
  assertEquals(c, { ok: false, status: 403, error: NOT_AUTHORISED });
  assertFalse(asked);
});

Deno.test("NO EXISTENCE ORACLE (SP-144): the same query runs for a real and a nonexistent company, and the refusal is byte-identical", async () => {
  const seen: string[] = [];
  const d = deps({ grants: [[MEMBER_ID, "structure.route.generate", CO_A]], onHasCapability: (_u, _c, co) => seen.push(co) });
  const caller: Caller = { ok: true, kind: "user", userId: MEMBER_ID };
  const real = await requireCapability(d, caller, "structure.route.generate", CO_B);
  const fake = await requireCapability(d, caller, "structure.route.generate", "99999999-9999-4999-8999-999999999999");
  assertEquals(real, fake);
  assertEquals(JSON.stringify(refusalBody(real as Extract<Caller, { ok: false }>)),
               JSON.stringify(refusalBody(fake as Extract<Caller, { ok: false }>)));
  assertEquals(seen.length, 2);   // asked both times; the company row itself is never selected
});

// ── the refusal bodies ───────────────────────────────────────────────────────────────────────────

Deno.test("refusalBody: exactly the two named refusals, and neither names a company or a user", () => {
  const a = refusalBody({ ok: false, status: 401, error: NO_USER });
  const b = refusalBody({ ok: false, status: 403, error: NOT_AUTHORISED });
  assertEquals(a.error, "no_user");
  assertEquals(b.error, "not_authorised");
  for (const m of [a.message, b.message]) {
    assertFalse(m.includes(CO_A) || m.includes(CO_B) || m.includes(MEMBER_ID));
  }
});

// ── non-vacuity: the suite would catch the check being removed ───────────────────────────────────

Deno.test("non-vacuity: a requireAdmin that let everyone through would fail this suite", () => {
  const permissive = (c: Caller): Caller => c;           // the plant shape
  assertEquals(permissive({ ok: true, kind: "user", userId: MEMBER_ID }), { ok: true, kind: "user", userId: MEMBER_ID });
  assert(requireAdmin({ ok: true, kind: "user", userId: MEMBER_ID }).ok === false);
});
