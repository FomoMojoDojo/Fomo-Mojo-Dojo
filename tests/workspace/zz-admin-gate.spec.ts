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
import { LANDING_STRINGS } from "../../src/lib/landing/landingStrings";

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
    text: document.body.innerText.replace(/\s+/g, " "),
    accessDenied: Array.from(document.querySelectorAll("h1")).filter((h) => h.textContent?.trim() === "Access Denied").length,
    loginRequired: Array.from(document.querySelectorAll("h1")).filter((h) => h.textContent?.trim() === "Admin Login Required").length,
    // U6-68: the member notices. A refusal a CLIENT reads, as opposed to an operator's "Access
    // Denied" — the two are different answers to different questions and must not be conflated.
    noCompanyNotice: document.querySelectorAll('[data-testid="notice-no-company"]').length,
    cannotOpenNotice: document.querySelectorAll('[data-testid="notice-cannot-open"]').length,
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
      await p.goto(path, { waitUntil: "networkidle", timeout: 120_000 });
      await p.waitForSelector('[data-testid="notice-no-company"]', { timeout: 60_000 });
      const r = await probe(p);

      // THE REFUSAL IS IN WORDS, AND IT IS THE CLIENT'S WORDS. This fixture holds no company at all,
      // so S-U6-1 is the honest answer: there is nothing to send them to.
      expect(r.text, `${path}: no S-U6-1 — a member was refused without being told anything`).toContain(LANDING_STRINGS.noCompany);
      expect(r.noCompanyNotice, `${path}: the S-U6-1 notice did not render`).toBe(1);

      // U6-68: "Access Denied" is an OPERATOR's refusal and must not reach a client surface. The two
      // refusals stay distinct — see (v4) for the one that still says it, and why.
      expect(r.accessDenied, `${path}: a client-refine surface showed the operator's "Access Denied"`).toBe(0);
      expect(r.loginRequired, `${path}: the superseded "Admin Login Required" page is back`).toBe(0);

      // UNCHANGED FROM BEFORE: nothing of the real page may render behind any of this. RLS gives this
      // caller nothing, so a broken build renders these pages EMPTY and an empty page reads like a
      // refusal — these are what stop that passing.
      expect(r.companyRows, `${path}: the front door's company rows rendered behind the gate`).toBe(0);
      expect(r.firstReadShell, `${path}: the First Read shell rendered behind the gate`).toBe(0);
      expect(r.diagnosePage, `${path}: the Diagnose page rendered behind the gate`).toBe(0);
      expect(r.operatorSwitch, `${path}: the operator switch rendered for a non-admin`).toBe(0);
      expect(r.operatorNodes, `${path}: an operator node rendered for a non-admin`).toBe(0);

      // WHERE the refusal happens differs by route, and that difference is the point of U6-50.
      const landed = new URL(p.url()).pathname;
      if (path === PATHS[0]) {
        // The Front Door is where an account ARRIVES by default — from a bookmark, the logo, an old
        // link. A member is sent to their own landing rather than refused on the product's front page.
        expect(landed, "the Front Door did not send a signed-in member to their landing").toBe("/start");
      } else {
        // A company-bearing URL was asked for deliberately. It is answered where it was asked, so the
        // reader can see WHICH page was refused.
        expect(landed, `${path}: refused by redirect instead of in place`).toBe(path);
      }
      expect(landed, `${path}: a signed-in non-admin was redirected as if signed out`).not.toBe("/login");
    }
  } finally {
    await ctx.close();
  }
});

// ── (v2) SUPERSEDED IN FORM, NOT IN PURPOSE (U6-55 / U6-56, 2026-11-10) ──────────────────────────
//
// WHAT IT USED TO ASSERT. That a visitor with no session got AdminGuard's "Admin Login Required"
// PAGE — h1 count 1 — and never the role refusal. That page is gone. U6-46 found eleven routes that
// rendered to a signed-out visitor, so EVERY gated route now sends one to /login, members included,
// and a page saying "sign in with an admin account" is the wrong answer on a client-facing URL.
//
// WHAT IT ASSERTS NOW (U6-68, 2026-11-11). The same distinction, in the shape the landing build left.
// No session is a REDIRECT carrying the attempted path. A session without an admin row is NOT
// redirected and IS told something — on these three client-refine surfaces that is S-U6-1, the
// client's own words, because U6-50 made them the client's side of the product. "Access Denied" is
// the operator's refusal and still exists: (v4) asserts it on /legacy/routes, in both presentation
// modes, which is what keeps the two from collapsing into one.
//
// The original reason for separating them is unchanged and is restated here because it is easy to
// lose: conflating the two would let a signed-in non-admin be read as merely signed out.
//
// BOTH HALVES LIVE IN THIS TEST ON PURPOSE. A version that only checked the signed-out redirect
// would pass a build that redirected EVERYONE — including the non-admin who should see a role
// refusal — which is the second plant below.
test("(v2) no session is a redirect to sign-in; a non-admin session is still a role refusal", async ({ page }) => {
  test.setTimeout(240_000);
  const email = process.env.NONADMIN_EMAIL, password = process.env.NONADMIN_PASSWORD;
  test.skip(!email || !password, "no NONADMIN_EMAIL / NONADMIN_PASSWORD (throwaway non-admin user) in the environment");

  // ── half one: no session at all ────────────────────────────────────────────────────────────────
  const ctx = await page.context().browser()!.newContext({ storageState: NO_SESSION });
  const p = await ctx.newPage();
  try {
    for (const path of PATHS) {
      await p.goto(path, { waitUntil: "networkidle", timeout: 120_000 });
      const url = new URL(p.url());
      expect(url.pathname, `${path}: a signed-out visitor was not sent to sign in`).toBe("/login");
      expect(url.searchParams.get("next"), `${path}: the attempted path was not carried`).toBe(path);
      const r = await probe(p);
      expect(r.loginRequired, `${path}: the superseded "Admin Login Required" page is back`).toBe(0);
      expect(r.accessDenied, `${path}: a visitor with no session was refused on role`).toBe(0);
      expect(r.companyRows + r.firstReadShell + r.diagnosePage, `${path}: a real surface rendered with no session`).toBe(0);
    }

    // ── half two: a session WITHOUT an admin row is a different refusal, and is NOT redirected ────
    await p.goto("/login", { waitUntil: "networkidle", timeout: 120_000 });
    const signed = await p.evaluate(async (c) => {
      const s = (window as unknown as { supabase: Sb }).supabase;
      const { data, error } = await s.auth.signInWithPassword(c);
      return { ok: Boolean(data?.session), error: error?.message ?? null };
    }, { email: email!, password: password! });
    expect(signed, "the throwaway non-admin could not sign in").toEqual({ ok: true, error: null });

    for (const path of PATHS) {
      await p.goto(path, { waitUntil: "networkidle", timeout: 120_000 });
      await p.waitForSelector('[data-testid="notice-no-company"]', { timeout: 60_000 });
      const r = await probe(p);
      // U6-68: THE DISTINCTION IS UNCHANGED; WHAT THE SECOND HALF LOOKS LIKE HAS CHANGED.
      // A session without an admin row is still answered differently from no session at all — it is
      // NOT redirected to /login, and it is told something in words. On a client-refine surface those
      // words are S-U6-1 rather than "Access Denied", because these three pages are the client's side
      // of the product. The operator's refusal still exists and is asserted in (v4).
      expect(new URL(p.url()).pathname, `${path}: a signed-in non-admin was redirected as if signed out`).not.toBe("/login");
      expect(r.text, `${path}: a signed-in non-admin got no refusal in words`).toContain(LANDING_STRINGS.noCompany);
      expect(r.noCompanyNotice, `${path}: the S-U6-1 notice did not render`).toBe(1);
      expect(r.loginRequired, `${path}: refused as signed-out, but this user has a session`).toBe(0);
      expect(r.accessDenied, `${path}: the operator's "Access Denied" reached a client surface`).toBe(0);
      expect(r.companyRows + r.firstReadShell + r.diagnosePage, `${path}: a real surface rendered for a non-admin`).toBe(0);
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

    // U6-68 (2026-11-11): IN BOTH PRESENTATION MODES, AND IN PLACE.
    //
    // This is the test that keeps the two refusals from collapsing into one. A non-admin is always
    // client presentation now (derived from isAdmin), and both ClientModePathSync and an old bounce
    // inside AdminGuard would have sent such a caller to "/" before any guard could answer — which
    // made the role refusal unreachable for every member on every gated route. Measured 2026-11-11:
    // with that bounce in place this route ended at /start. Asserting the PATHNAME is what catches a
    // refusal that silently became a redirect; asserting both modes is what catches it coming back
    // for client-mode callers only.
    for (const mode of ["internal", "client"] as const) {
      await p.evaluate((m) => localStorage.setItem("mojo.presentation.mode", m), mode);
      await p.goto("/legacy/routes", { waitUntil: "networkidle", timeout: 120_000 });
      await p.waitForSelector("h1", { timeout: 60_000 });
      const asClient = await probe(p);
      expect(asClient.accessDenied, `/legacy/routes let a non-admin in (${mode} mode)`).toBe(1);
      expect(new URL(p.url()).pathname, `/legacy/routes refused a non-admin by REDIRECT (${mode} mode)`).toBe("/legacy/routes");
      expect(asClient.noCompanyNotice + asClient.cannotOpenNotice, `/legacy/routes gave an operator's page a client notice (${mode} mode)`).toBe(0);
    }
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
