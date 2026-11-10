// ── THE ADMIN GATE ACTUALLY REFUSES (U1, signed 2026-11-09) ───────────────────────────────────────
//
// WHAT WENT WRONG. useAuth's checkAdmin consulted isLocalAdminBypassEnabled() when the user_roles
// lookup found no admin row, and that predicate read `import.meta.env.DEV || host === "localhost" ||
// "127.0.0.1"`. On the dev server every signed-in account was therefore an admin — and `tailscale
// serve` proxies https://mojomap.tail7b863b.ts.net/ to http://localhost:8080, which IS the dev
// server, so the one URL partners reach ran with the bypass on. Measured 2026-11-09: the throwaway
// non-admin rendered the Front Door, the First Read shell and the Diagnose home.
//
// WHY THE SECOND ASSERTION IS THE ONE THAT MATTERS. RLS still held, so those pages came up EMPTY —
// "0 companies", "Company not found." A test that only looked for an error message would have passed
// against the broken build, because an empty shell of the real page LOOKS like a page with no data.
// So each case asserts both halves: the refusal is present AND the real page's own furniture is not.
//
// THE TWO REFUSALS ARE DIFFERENT, AND BOTH ARE CHECKED. No session → "Admin Login Required"; a
// session without an admin row → "Access Denied". Conflating them would let a signed-in non-admin be
// read as merely signed-out. AdminGuard renders the refusal rather than bouncing because the bounce
// needs mode === "client" and the default is "internal" (src/components/AdminGuard.tsx:38-48).
//
// NON-VACUITY. (v3) drives the same paths under the suite's own admin storage state and requires the
// real furniture to be there. Without it, a build that refused EVERYONE would pass (v1) and (v2).
//
// browser.newContext() IS NOT A CLEAN CONTEXT HERE. Playwright hands the browser the config's `use`
// options as context defaults, so a bare newContext() inherits storageState — the suite's ADMIN
// session. (v2) failed exactly that way first: it asserted the signed-out refusal in a context that
// was silently signed in as an admin. Both cases below pass an explicit EMPTY state.
import { expect, test, type Page } from "playwright/test";
import { COMPANY_ID } from "../../playwright.config";

type Sb = { auth: { signInWithPassword: (c: { email: string; password: string }) => Promise<{ data: { session: unknown }; error: { message?: string } | null }> } };

/** Explicitly signed out — see the note above about inherited context defaults. */
const NO_SESSION = { cookies: [], origins: [] } as const;

const PATHS = [
  "/preview/client-refine",
  `/preview/client-refine/first-read/${COMPANY_ID}`,
  `/preview/client-refine/diagnose/${COMPANY_ID}/home`,
];

/** Everything the refusal must NOT leave on screen, plus the refusal headings. */
async function probe(page: Page) {
  return page.evaluate(() => ({
    accessDenied: Array.from(document.querySelectorAll("h1")).filter((h) => h.textContent?.trim() === "Access Denied").length,
    loginRequired: Array.from(document.querySelectorAll("h1")).filter((h) => h.textContent?.trim() === "Admin Login Required").length,
    // the real pages' own furniture — each is unique to a surface the gate must not render
    companyRows: document.querySelectorAll('[data-testid^="front-door-company-"]').length,
    firstReadShell: document.querySelectorAll(".first-read").length,
    diagnosePage: document.querySelectorAll(".dg-page").length,
    operatorSwitch: document.querySelectorAll("[data-fr-operator-switch]").length,
    operatorNodes: document.querySelectorAll("[data-fr-operator]").length,
  }));
}

test("(v1) a signed-in non-admin is refused on every client-refine surface, not shown an empty one", async ({ page }) => {
  test.setTimeout(240_000);
  const email = process.env.NONADMIN_EMAIL, password = process.env.NONADMIN_PASSWORD;
  test.skip(!email || !password, "no NONADMIN_EMAIL / NONADMIN_PASSWORD (throwaway non-admin user) in the environment");

  // A SIGNED-OUT CONTEXT, then this user's own session — the suite's state is an admin, so inheriting
  // it would prove nothing.
  const ctx = await page.context().browser()!.newContext({ storageState: NO_SESSION });
  const p = await ctx.newPage();
  try {
    await p.goto("/login", { waitUntil: "networkidle", timeout: 120_000 });
    const signed = await p.evaluate(async (c) => {
      const s = (window as unknown as { supabase: Sb }).supabase;
      const { data, error } = await s.auth.signInWithPassword(c);
      return { ok: Boolean(data?.session), error: error?.message ?? null };
    }, { email: email!, password: password! });
    expect(signed, "the throwaway non-admin could not sign in").toEqual({ ok: true, error: null });

    for (const path of PATHS) {
      await p.goto(path, { waitUntil: "domcontentloaded", timeout: 120_000 });
      await p.waitForSelector("h1", { timeout: 60_000 });   // the refusal, not a fixed sleep
      const r = await probe(p);
      expect(r.accessDenied, `${path}: no Access Denied refusal`).toBe(1);
      expect(r.loginRequired, `${path}: refused as signed-out, but this user has a session`).toBe(0);
      expect(r.companyRows, `${path}: the front door's company rows rendered behind the gate`).toBe(0);
      expect(r.firstReadShell, `${path}: the First Read shell rendered behind the gate`).toBe(0);
      expect(r.diagnosePage, `${path}: the Diagnose page rendered behind the gate`).toBe(0);
      expect(r.operatorSwitch, `${path}: the operator switch rendered for a non-admin`).toBe(0);
      expect(r.operatorNodes, `${path}: an operator node rendered for a non-admin`).toBe(0);
    }
  } finally {
    await ctx.close();
  }
});

test("(v2) with no session at all the refusal names the sign-in, not the role", async ({ page }) => {
  test.setTimeout(240_000);
  const ctx = await page.context().browser()!.newContext({ storageState: NO_SESSION });
  const p = await ctx.newPage();
  try {
    for (const path of PATHS) {
      await p.goto(path, { waitUntil: "domcontentloaded", timeout: 120_000 });
      await p.waitForSelector("h1", { timeout: 60_000 });   // the refusal, not a fixed sleep
      const r = await probe(p);
      expect(r.loginRequired, `${path}: no Admin Login Required refusal`).toBe(1);
      expect(r.accessDenied, `${path}: a visitor with no session was refused on role`).toBe(0);
      expect(r.companyRows + r.firstReadShell + r.diagnosePage, `${path}: a real surface rendered with no session`).toBe(0);
    }
  } finally {
    await ctx.close();
  }
});

// ── (v4) U5 · /legacy/routes was the one ungated Option B surface ─────────────────────────────────
//
// InternalViewOnlyRoute checks the presentation mode and never the user, so this route mounted for
// anyone — and it mounts RouteInspectPanel, whose handleSave fires refresh-mojo-score. routes_select
// AND routes_update both carry a company_members arm, so the save would have succeeded for a client
// with a membership. The legacy prototype has no stable marker of its own, so the assertion is the
// refusal itself: present for the non-admin, absent for the admin.
test("(v4) /legacy/routes refuses a signed-in non-admin and still opens for the admin", async ({ page }) => {
  test.setTimeout(240_000);
  const email = process.env.NONADMIN_EMAIL, password = process.env.NONADMIN_PASSWORD;
  test.skip(!email || !password, "no NONADMIN_EMAIL / NONADMIN_PASSWORD (throwaway non-admin user) in the environment");

  const ctx = await page.context().browser()!.newContext({ storageState: NO_SESSION });
  const p = await ctx.newPage();
  try {
    await p.goto("/login", { waitUntil: "domcontentloaded", timeout: 120_000 });
    const signed = await p.evaluate(async (c) => {
      const s = (window as unknown as { supabase: Sb }).supabase;
      const { data, error } = await s.auth.signInWithPassword(c);
      return { ok: Boolean(data?.session), error: error?.message ?? null };
    }, { email: email!, password: password! });
    expect(signed, "the throwaway non-admin could not sign in").toEqual({ ok: true, error: null });

    await p.goto("/legacy/routes", { waitUntil: "domcontentloaded", timeout: 120_000 });
    await p.waitForSelector("h1", { timeout: 60_000 });
    const asClient = await probe(p);
    expect(asClient.accessDenied, "/legacy/routes let a non-admin in").toBe(1);
  } finally {
    await ctx.close();
  }

  // the admin still gets the page — without this the gate could refuse everyone and still pass
  await page.goto("/legacy/routes", { waitUntil: "networkidle", timeout: 180_000 });
  await page.waitForTimeout(800);
  const asAdmin = await probe(page);
  expect(asAdmin.accessDenied, "/legacy/routes refused the admin").toBe(0);
  expect(asAdmin.loginRequired, "/legacy/routes asked the admin to sign in").toBe(0);
});

test("(v3) NON-VACUITY: the admin storage state still reaches all three surfaces", async ({ page }) => {
  test.setTimeout(240_000);
  const expected = [
    { path: PATHS[0], key: "companyRows" as const },
    { path: PATHS[1], key: "firstReadShell" as const },
    { path: PATHS[2], key: "diagnosePage" as const },
  ];
  for (const { path, key } of expected) {
    await page.goto(path, { waitUntil: "networkidle", timeout: 180_000 });
    await page.waitForTimeout(800);
    const r = await probe(page);
    expect(r.accessDenied, `${path}: the admin was refused`).toBe(0);
    expect(r.loginRequired, `${path}: the admin was asked to sign in`).toBe(0);
    expect(r[key], `${path}: the admin reached the gate but not the page`).toBeGreaterThan(0);
  }
});
