// ── A MEMBER REACHES THEIR OWN COMPANY AND NOTHING ELSE (U6 part 1, signed 2026-11-11) ──────────
//
// WHAT WAS WRONG. A signed-in non-admin had no destination. "/" rendered the Decision Command Screen
// on PUBLIC_CAFE_BARRA_FALLBACK — a real client's name, website and three scores, hardcoded — and
// every operator surface answered "Access Denied". There was no page in the product that belonged to
// the person signing in. The fallback is deleted; /start resolves what the account actually holds.
//
// EVERY REFUSAL IS ASSERTED POSITIVELY, BY ITS SIGNED STRING. This is the lesson zz-admin-gate and
// the U6-15 census both paid for: RLS gives a member nothing on a company they do not hold, so a
// broken build renders these pages EMPTY, and an empty page is indistinguishable from a refusal —
// worse, it reads as "there is nothing here about you". So each case asserts the words: S-U6-1 for
// an account with no company, S-U6-2 plus the S-U6-3 link for a company that is not theirs.
//
// AND IT ASSERTS THE LANDING SETTLES. ClientModePathSync bounces every path to "/" in client mode,
// a non-admin is now always client presentation, and "/" sends a non-admin to /start — so a missing
// exemption is not a missing page but an infinite redirect. "It eventually rendered" is not the test;
// a BOUNDED navigation count is.
import { expect, test, type Page } from "playwright/test";
import { LANDING_STRINGS, goToOwnLabel } from "../../src/lib/landing/landingStrings";

type Sb = { auth: { signInWithPassword: (c: { email: string; password: string }) => Promise<{ data: { session: unknown }; error: { message?: string } | null }> } };

const NO_SESSION = { cookies: [], origins: [] } as const;

/** The member fixture: exactly one company_members row, on the throwaway company below. */
const MEMBER_CO = "66666666-6666-4666-8666-666666666601";
/** A company the member fixture does not hold. Edgewood — read only as a URL, never written. */
const FOREIGN_CO = "3dd2cfbb-0792-4bf1-9cd4-15db9646874b";
/** The deleted fallback's id. A stored copy must not select anything. */
const SENTINEL_CO = "00000000-0000-0000-0000-000000000001";

const FALLBACK_STRINGS = ["Cafe Barra", "cafebarra.com"] as const;

async function signInAs(page: Page, email: string, password: string) {
  await page.goto("/login", { waitUntil: "networkidle", timeout: 120_000 });
  const signed = await page.evaluate(async (c) => {
    const s = (window as unknown as { supabase: Sb }).supabase;
    const { data, error } = await s.auth.signInWithPassword(c);
    return { ok: Boolean(data?.session), error: error?.message ?? null };
  }, { email, password });
  expect(signed, `${email} could not sign in`).toEqual({ ok: true, error: null });
}

async function body(page: Page) {
  return page.evaluate(() => document.body.innerText.replace(/\s+/g, " "));
}

/** Counts every navigation the page makes, so a redirect loop is a number and not a timeout. */
function countNavigations(page: Page) {
  const seen: string[] = [];
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) seen.push(new URL(frame.url()).pathname);
  });
  return seen;
}

test.describe("the member landing", () => {
  const email = process.env.MEMBER_EMAIL, password = process.env.MEMBER_PASSWORD;

  test("(a) /start lands the member on their own company's Diagnose home, and SETTLES", async ({ page }) => {
    test.setTimeout(240_000);
    test.skip(!email || !password, "no MEMBER_EMAIL / MEMBER_PASSWORD in the environment");
    const ctx = await page.context().browser()!.newContext({ storageState: NO_SESSION });
    const p = await ctx.newPage();
    try {
      await signInAs(p, email!, password!);
      const navs = countNavigations(p);
      await p.goto("/start", { waitUntil: "networkidle", timeout: 120_000 });
      // Settled: the URL does not move again once the network is quiet.
      const settled = new URL(p.url()).pathname;
      await p.waitForTimeout(2_000);
      expect(new URL(p.url()).pathname, "the landing kept moving after it settled — a redirect loop").toBe(settled);

      expect(settled, "the member did not land on their own company's Diagnose home").toBe(
        `/preview/client-refine/diagnose/${MEMBER_CO}/home`,
      );
      // BOUNDED. A loop would run to the hundreds before the timeout; the honest path is
      // /start → the landing, with React Router's own initial entry.
      expect(navs.length, `the landing took ${navs.length} navigations: ${navs.slice(0, 12).join(" → ")}`).toBeLessThan(8);

      const text = await body(p);
      for (const s of FALLBACK_STRINGS) {
        expect(text, `the deleted fallback company's string ${JSON.stringify(s)} rendered for a member`).not.toContain(s);
      }
      // and it is a page, not a refusal
      expect(text).not.toContain(LANDING_STRINGS.noCompany);
      expect(text).not.toContain(LANDING_STRINGS.cannotOpen);
    } finally {
      await ctx.close();
    }
  });

  test("(b) '/' and the Front Door both send the member to their landing, never Access Denied", async ({ page }) => {
    test.setTimeout(240_000);
    test.skip(!email || !password, "no MEMBER_EMAIL / MEMBER_PASSWORD in the environment");
    const ctx = await page.context().browser()!.newContext({ storageState: NO_SESSION });
    const p = await ctx.newPage();
    try {
      await signInAs(p, email!, password!);
      for (const from of ["/", "/preview/client-refine"]) {
        const navs = countNavigations(p);
        await p.goto(from, { waitUntil: "networkidle", timeout: 120_000 });
        expect(new URL(p.url()).pathname, `${from}: the member was not sent to their landing`).toBe(
          `/preview/client-refine/diagnose/${MEMBER_CO}/home`,
        );
        expect(navs.length, `${from} took ${navs.length} navigations — a loop`).toBeLessThan(10);
        const text = await body(p);
        expect(text, `${from}: a member met the operator's refusal on the product's front page`).not.toContain("Access Denied");
        for (const s of FALLBACK_STRINGS) expect(text).not.toContain(s);
      }
    } finally {
      await ctx.close();
    }
  });

  test("(c) a STALE or FOREIGN stored active_company_id cannot select a company (U6-62)", async ({ page }) => {
    test.setTimeout(240_000);
    test.skip(!email || !password, "no MEMBER_EMAIL / MEMBER_PASSWORD in the environment");
    const ctx = await page.context().browser()!.newContext({ storageState: NO_SESSION });
    const p = await ctx.newPage();
    try {
      await signInAs(p, email!, password!);
      // Three stored ids that must all lose to the server's answer: the deleted fallback's id, a
      // real company the member does not hold, and a well-formed id that exists nowhere.
      for (const stored of [SENTINEL_CO, FOREIGN_CO, "99999999-9999-4999-8999-999999999999"]) {
        await p.evaluate((id) => localStorage.setItem("active_company_id", id), stored);
        await p.goto("/start", { waitUntil: "networkidle", timeout: 120_000 });
        expect(new URL(p.url()).pathname, `stored ${stored} changed where the member landed`).toBe(
          `/preview/client-refine/diagnose/${MEMBER_CO}/home`,
        );
        const text = await body(p);
        for (const s of FALLBACK_STRINGS) {
          expect(text, `stored ${stored} rendered the deleted fallback's string ${JSON.stringify(s)}`).not.toContain(s);
        }
      }
    } finally {
      await ctx.close();
    }
  });

  test("(d) ANOTHER company's pages are refused in words, with the way back (S-U6-2 + S-U6-3)", async ({ page }) => {
    test.setTimeout(240_000);
    test.skip(!email || !password, "no MEMBER_EMAIL / MEMBER_PASSWORD in the environment");
    const ctx = await page.context().browser()!.newContext({ storageState: NO_SESSION });
    const p = await ctx.newPage();
    try {
      await signInAs(p, email!, password!);
      for (const path of [
        `/preview/client-refine/first-read/${FOREIGN_CO}`,
        `/preview/client-refine/diagnose/${FOREIGN_CO}/home`,
      ]) {
        await p.goto(path, { waitUntil: "networkidle", timeout: 120_000 });
        await p.waitForSelector('[data-testid="notice-cannot-open"]', { timeout: 60_000 });
        const text = await body(p);
        // THE REFUSAL IS THE ASSERTION, not emptiness.
        expect(text, `${path}: no refusal in words`).toContain(LANDING_STRINGS.cannotOpen);
        // the way out names their own organisation (S-U6-3)
        expect(text, `${path}: no S-U6-3 link back to their own company`).toContain(goToOwnLabel("zz first-read-rls member co"));
        // Sign out is on the refusal page (S-U6-5)
        await expect(p.locator('[data-testid="member-notice-signout"]')).toHaveText(LANDING_STRINGS.signOut);
        // and NOTHING of the other company leaked
        expect(text, `${path}: the foreign company's name rendered on its refusal page`).not.toContain("Edgewood");
        // the URL is NOT a redirect: the refusal happens where they asked
        expect(new URL(p.url()).pathname, `${path}: refused by redirect instead of in words`).toBe(path.split("?")[0]);
      }
      // the link works: it goes to their own landing
      await p.locator('[data-testid="member-notice-onward"]').click();
      await p.waitForURL(`**/preview/client-refine/diagnose/${MEMBER_CO}/home`, { timeout: 60_000 });
    } finally {
      await ctx.close();
    }
  });

  test("(e) an account with NO company gets S-U6-1 and a way out, not an empty page", async ({ page }) => {
    test.setTimeout(240_000);
    const na = process.env.NONADMIN_EMAIL, nap = process.env.NONADMIN_PASSWORD;
    test.skip(!na || !nap, "no NONADMIN_EMAIL / NONADMIN_PASSWORD (the no-membership fixture) in the environment");
    const ctx = await page.context().browser()!.newContext({ storageState: NO_SESSION });
    const p = await ctx.newPage();
    try {
      await signInAs(p, na!, nap!);
      for (const from of ["/start", "/", "/preview/client-refine"]) {
        await p.goto(from, { waitUntil: "networkidle", timeout: 120_000 });
        await p.waitForSelector('[data-testid="notice-no-company"]', { timeout: 60_000 });
        const text = await body(p);
        expect(text, `${from}: no S-U6-1`).toContain(LANDING_STRINGS.noCompany);
        await expect(p.locator('[data-testid="member-notice-signout"]')).toHaveText(LANDING_STRINGS.signOut);
        // no onward link — there is nowhere to go, and offering one would be a lie
        expect(await p.locator('[data-testid="member-notice-onward"]').count(), `${from}: S-U6-1 offered a link`).toBe(0);
        for (const s of FALLBACK_STRINGS) expect(text).not.toContain(s);
      }
    } finally {
      await ctx.close();
    }
  });

  test("(f) signing out clears active_company_id AND the presentation mode", async ({ page }) => {
    test.setTimeout(240_000);
    const na = process.env.NONADMIN_EMAIL, nap = process.env.NONADMIN_PASSWORD;
    test.skip(!na || !nap, "no NONADMIN_EMAIL / NONADMIN_PASSWORD in the environment");
    // THE NO-COMPANY FIXTURE, because S-U6-1 is the page that actually carries the Sign out control
    // (S-U6-5). This drives the product's own button, which calls useAuth.signOut — the first draft
    // of this test fell back to clearing the keys from page.evaluate when the button was not found,
    // which would have asserted nothing at all.
    const ctx = await page.context().browser()!.newContext({ storageState: NO_SESSION });
    const p = await ctx.newPage();
    try {
      await signInAs(p, na!, nap!);
      await p.goto("/start", { waitUntil: "networkidle", timeout: 120_000 });
      await p.waitForSelector('[data-testid="notice-no-company"]', { timeout: 60_000 });

      // Both keys present before the click, or the assertion after it proves nothing.
      await p.evaluate(() => {
        localStorage.setItem("active_company_id", "3dd2cfbb-0792-4bf1-9cd4-15db9646874b");
        localStorage.setItem("mojo.presentation.mode", "client");
      });
      expect(await p.evaluate(() => [localStorage.getItem("active_company_id"), localStorage.getItem("mojo.presentation.mode")]))
        .toEqual(["3dd2cfbb-0792-4bf1-9cd4-15db9646874b", "client"]);

      await p.locator('[data-testid="member-notice-signout"]').click();
      await p.waitForURL("**/login", { timeout: 60_000 });
      // signOut ends in window.location.assign("/login"), a FULL page load — waitForURL resolves
      // while that load is still in flight and an evaluate against a navigating page never answers.
      await p.waitForLoadState("domcontentloaded", { timeout: 60_000 });
      await p.waitForSelector("form", { timeout: 60_000 });

      const left = await p.evaluate(() => ({
        company: localStorage.getItem("active_company_id"),
        mode: localStorage.getItem("mojo.presentation.mode"),
      }));
      expect(left, "sign-out left a company id or a presentation mode behind for the next account on this browser")
        .toEqual({ company: null, mode: null });
    } finally {
      await ctx.close();
    }
  });

  // ── (h) U6-78: WHAT THE EXEMPTION COSTS, ASSERTED ───────────────────────────────────────────────
//
// ClientModePathSync is admin-only now, so isMemberLandingPath can no longer be what saves a member.
// What it still does is change TWO ROUTE FAMILIES for an ADMIN in client presentation, and that is a
// deliberate difference from 3af07eb1 rather than a side effect — an operator rehearsing the client
// view was being bounced off the only screens a client has.
//
// A difference kept on purpose has to be asserted on purpose. The two control rows are half the
// test: without them "nothing is bounced any more" would pass, and the single-page rule this sync
// exists to enforce would be gone with nobody noticing.
test("(h) U6-78: an admin in CLIENT mode stays on the two client families and is still bounced elsewhere", async ({ page }) => {
  test.setTimeout(240_000);
  // The suite's own storage state is the admin; client mode is the operator's switch.
  await page.goto("/login", { waitUntil: "networkidle", timeout: 120_000 });
  await page.evaluate(() => localStorage.setItem("mojo.presentation.mode", "client"));

  const EXEMPT = [
    `/preview/client-refine/first-read/${FOREIGN_CO}`,
    `/preview/client-refine/diagnose/${FOREIGN_CO}/home`,
  ];
  const STILL_BOUNCED = ["/preview/client-refine/workshop", "/legacy/map"];

  for (const path of EXEMPT) {
    await page.goto(path, { waitUntil: "networkidle", timeout: 120_000 });
    await page.waitForTimeout(1_200); // the sync is an effect: give it the chance to fire
    expect(new URL(page.url()).pathname, `${path}: an admin in client mode was bounced off a client family`).toBe(path);
  }

  for (const path of STILL_BOUNCED) {
    await page.goto(path, { waitUntil: "networkidle", timeout: 120_000 });
    await page.waitForTimeout(1_200);
    expect(new URL(page.url()).pathname, `${path}: the client-mode single-page rule stopped applying`).toBe("/");
  }

  // Leave the browser as it was found: the mode key is an operator preference, not test residue.
  await page.evaluate(() => localStorage.removeItem("mojo.presentation.mode"));
});

test("(g) NON-VACUITY: the admin still reaches the Front Door and both company families", async ({ page }) => {
    test.setTimeout(240_000);
    // The suite's own storage state is the admin.
    await page.goto("/preview/client-refine", { waitUntil: "networkidle", timeout: 120_000 });
    expect(new URL(page.url()).pathname, "the admin was redirected off the Front Door").toBe("/preview/client-refine");
    expect(await body(page), "the admin met a member refusal").not.toContain(LANDING_STRINGS.cannotOpen);

    for (const path of [
      `/preview/client-refine/first-read/${FOREIGN_CO}`,
      `/preview/client-refine/diagnose/${FOREIGN_CO}/home`,
      `/preview/client-refine/first-read/${MEMBER_CO}`,
    ]) {
      await page.goto(path, { waitUntil: "networkidle", timeout: 120_000 });
      const text = await body(page);
      expect(new URL(page.url()).pathname, `${path}: the admin was redirected`).toBe(path);
      expect(text, `${path}: the admin was refused on membership — an admin holds no memberships`).not.toContain(LANDING_STRINGS.cannotOpen);
      expect(text, `${path}: the admin was asked to sign in`).not.toContain(LANDING_STRINGS.noCompany);
    }
  });
});
