// ── NO SIGNED-OUT VISITOR SEES A COMPANY (U6-46, signed 2026-11-10) ──────────────────────────────
//
// WHAT WAS WRONG. InternalViewOnlyRoute and the ModeAware* helpers checked the presentation MODE and
// never the user, and `internal` is the default for a visitor with no localStorage. Measured signed
// out on 2026-11-10: eleven routes rendered, every one of them showing the fallback company's name.
// "/" was worse — with mojo.presentation.mode="client" already stored, a visitor with
// auth.getUser() === null got the whole Decision Command Screen, company name, website and score.
//
// WHY THE SECOND HALF OF EACH CASE MATTERS, and this is the lesson zz-admin-gate paid for first: RLS
// gives a signed-out caller nothing, so a broken build renders these pages EMPTY. An empty page looks
// like a refusal. So each case asserts the refusal POSITIVELY — the final URL is /login, carrying the
// path — and separately asserts that the page's own furniture and the fallback company's strings are
// absent. Either alone would pass a build that merely had no data.
//
// NON-VACUITY. (b) drives the same twelve under the suite's admin storage state and requires them to
// open. Without it, a build that refused everyone would pass (a).
import { expect, test, type Page } from "playwright/test";

type Sb = { auth: { signInWithPassword: (c: { email: string; password: string }) => Promise<{ data: { session: unknown }; error: { message?: string } | null }> } };

/** Explicitly signed out — a bare newContext() inherits the config's admin storageState. */
const NO_SESSION = { cookies: [], origins: [] } as const;

/** The eleven that were behind a mode-only guard. */
const ELEVEN = [
  "/legacy/map", "/legacy/strategy", "/legacy/opportunities", "/legacy/positioning",
  "/legacy/analytics", "/legacy/movement", "/legacy/inputs", "/legacy/files",
  "/legacy/job-steps", "/process/mojomap", "/map-signal-prototype",
] as const;

/** …plus "/", which had no auth check at all. */
const TWELVE = [...ELEVEN, "/"] as const;

/** The fallback company's own strings (src/hooks/useCompany.tsx PUBLIC_CAFE_BARRA_FALLBACK). */
const FALLBACK_STRINGS = ["Cafe Barra", "cafebarra.com"] as const;

async function probe(page: Page) {
  return page.evaluate(() => ({
    text: document.body.innerText.replace(/\s+/g, " "),
    // each page's own furniture: the legacy shell's banner, the decision screen's root, the nav chip
    legacyBanner: document.body.innerText.includes("Legacy prototype"),
    decisionShell: document.querySelectorAll(".cv-shell").length,
    accessDenied: Array.from(document.querySelectorAll("h1")).filter((h) => h.textContent?.trim() === "Access Denied").length,
    loginRequired: Array.from(document.querySelectorAll("h1")).filter((h) => h.textContent?.trim() === "Admin Login Required").length,
  }));
}

// Both presentation modes, because the hole behaved differently in each: internal mode rendered the
// legacy page itself, client mode rendered the Decision screen at "/".
for (const mode of ["internal", "client"] as const) {
  test(`(a) signed out in ${mode} mode: all twelve redirect to /login and render no company`, async ({ page }) => {
    test.setTimeout(240_000);
    const ctx = await page.context().browser()!.newContext({ storageState: NO_SESSION });
    const p = await ctx.newPage();
    try {
      await p.goto("/login", { waitUntil: "domcontentloaded", timeout: 120_000 });
      await p.evaluate((m) => { localStorage.clear(); localStorage.setItem("mojo.presentation.mode", m); }, mode);

      for (const path of TWELVE) {
        await p.goto(path, { waitUntil: "networkidle", timeout: 120_000 });
        const url = new URL(p.url());
        expect(url.pathname, `${path}: a signed-out visitor was not sent to sign in`).toBe("/login");
        // The carry is the attempted path in internal mode. In CLIENT mode the mode check sends the
        // visitor to "/" first and "/" is what asks for a session, so the carry is "/" — still a
        // same-origin path, still never a host.
        const next = url.searchParams.get("next");
        expect(next, `${path}: the carried path names an origin`).toMatch(/^\/(?!\/)/);
        if (mode === "internal") expect(next, `${path}: the attempted path was not carried`).toBe(path);

        const r = await probe(p);
        for (const s of FALLBACK_STRINGS) {
          expect(r.text, `${path}: the fallback company string ${JSON.stringify(s)} rendered to a signed-out visitor`).not.toContain(s);
        }
        expect(r.legacyBanner, `${path}: the legacy shell rendered for a signed-out visitor`).toBe(false);
        expect(r.decisionShell, `${path}: the Decision screen rendered for a signed-out visitor`).toBe(0);
        expect(r.loginRequired, `${path}: the superseded "Admin Login Required" page is back`).toBe(0);
      }
    } finally {
      await ctx.close();
    }
  });
}

test("(b) NON-VACUITY: the admin still reaches all twelve", async ({ page }) => {
  test.setTimeout(240_000);
  for (const path of TWELVE) {
    await page.goto(path, { waitUntil: "networkidle", timeout: 120_000 });
    const r = await probe(page);
    expect(new URL(page.url()).pathname, `${path}: the admin was sent to sign in`).not.toBe("/login");
    expect(r.accessDenied, `${path}: the admin was refused on role`).toBe(0);
    expect(r.loginRequired, `${path}: the admin was asked to sign in`).toBe(0);
  }
});

test("(c) a signed-in non-admin is refused on the eleven, not shown an empty page", async ({ page }) => {
  test.setTimeout(240_000);
  const email = process.env.NONADMIN_EMAIL, password = process.env.NONADMIN_PASSWORD;
  test.skip(!email || !password, "no NONADMIN_EMAIL / NONADMIN_PASSWORD (throwaway non-admin user) in the environment");

  const ctx = await page.context().browser()!.newContext({ storageState: NO_SESSION });
  const p = await ctx.newPage();
  try {
    await p.goto("/login", { waitUntil: "networkidle", timeout: 120_000 });
    // internal mode: AdminGuard's client-mode bounce would otherwise send this user to "/" and the
    // role refusal is the thing under test here.
    await p.evaluate(() => localStorage.setItem("mojo.presentation.mode", "internal"));
    const signed = await p.evaluate(async (c) => {
      const s = (window as unknown as { supabase: Sb }).supabase;
      const { data, error } = await s.auth.signInWithPassword(c);
      return { ok: Boolean(data?.session), error: error?.message ?? null };
    }, { email: email!, password: password! });
    expect(signed, "the throwaway non-admin could not sign in").toEqual({ ok: true, error: null });

    for (const path of ELEVEN) {
      await p.goto(path, { waitUntil: "domcontentloaded", timeout: 120_000 });
      await p.waitForSelector("h1", { timeout: 60_000 });
      const r = await probe(p);
      expect(r.accessDenied, `${path}: a signed-in non-admin got no role refusal`).toBe(1);
      expect(new URL(p.url()).pathname, `${path}: a signed-in non-admin was redirected as if signed out`).not.toBe("/login");
      expect(r.legacyBanner, `${path}: the legacy shell rendered for a non-admin`).toBe(false);
      for (const s of FALLBACK_STRINGS) {
        expect(r.text, `${path}: the fallback company string ${JSON.stringify(s)} rendered for a non-admin`).not.toContain(s);
      }
    }
  } finally {
    await ctx.close();
  }
});
