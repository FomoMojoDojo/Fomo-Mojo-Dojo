// (v) integrity_runs — admins read every company's integrity records (signed 2026-09-16).
// The SELECT policy was creator-or-member only; an admin who is neither read ZERO rows, so every
// record-gated surface rendered as "unknown" for admins on companies created by someone else
// (Mithun: created by bob, no members → bob2 saw the fabricated numbers, bob saw the suppression).
// Proof through the app client (DEV window.supabase):
//   admin fixture (bob2, non-member of Mithun)  → reads Mithun's evidence_presence row; the home shows
//                                                the note and no numbers
//   a flagged throwaway company                 → the admin reads its none record → suppression
//   non-admin non-member (NONADMIN_EMAIL/PASSWORD; a throwaway auth user, no roles, no memberships)
//                                              → reads 0 rows on Mithun (the clause admits admins only)
// RED against the pre-migration policy set (policy dropped → the admin leg reads 0).
import { expect, test, type Page } from "playwright/test";
import { BASE_URL } from "../../playwright.config";
import { open } from "./helpers";

const MITHUN = "641d1f62-c703-4392-b6c3-4cba1c93a3db";
const NOTE = "Not enough public signal to score yet.";
const NAME = `zz-noev-admin-${Date.now()}`;
type Sb = { from: (t: string) => any; auth: { signInWithPassword: (c: { email: string; password: string }) => Promise<{ data?: { session?: unknown }; error?: { message: string } | null }>; getUser: () => Promise<{ data: { user: { id: string } | null } }> } };

const presenceCount = (page: Page, companyId: string) => page.evaluate(async (cid) => {
  const s = (window as unknown as { supabase: Sb }).supabase;
  const { count, error } = await s.from("integrity_runs").select("id", { count: "exact", head: true }).eq("company_id", cid).eq("component", "evidence_presence");
  return { count: Number(count ?? 0), error: error?.message ?? null };
}, companyId);
const isMember = (page: Page, companyId: string) => page.evaluate(async (cid) => {
  const s = (window as unknown as { supabase: Sb }).supabase;
  const { data: { user } } = await s.auth.getUser();
  const { data: co } = await s.from("companies").select("created_by").eq("id", cid).maybeSingle();
  const { count } = await s.from("company_members").select("id", { count: "exact", head: true }).eq("company_id", cid).eq("user_id", user!.id);
  return { uid: user!.id, creator: (co as { created_by: string } | null)?.created_by === user!.id, member: Number(count ?? 0) > 0 };
}, companyId);
const pin = (page: Page, id: string) => page.addInitScript((cid) => { try { localStorage.setItem("active_company_id", cid); } catch { /* */ } }, id);

test("admin (non-member) reads Mithun's record; the home suppresses", async ({ page }) => {
  await open(page, "/preview/client-refine/home");
  const who = await isMember(page, MITHUN);
  expect(who.creator).toBe(false); expect(who.member).toBe(false); // the fixture is neither — the admin clause is the only door
  expect(await presenceCount(page, MITHUN)).toEqual({ count: 1, error: null });
  await pin(page, MITHUN);
  await page.goto("/preview/client-refine/home", { waitUntil: "networkidle", timeout: 120_000 });
  await expect(page.getByTestId("home-fr")).toHaveAttribute("data-evidence-presence", "none", { timeout: 60_000 });
  await expect(page.getByTestId("fr-hscale")).toHaveCount(0);
  await expect(page.getByTestId("home-compass-note")).toHaveText(NOTE);
  await expect(page.getByTestId("home-no-evidence-note")).toHaveText(NOTE);
  expect(await page.getByTestId("home-context").innerText()).not.toMatch(/SCORE|FOUNDATION/);
  if (process.env.V_PROOF_SHOT) await page.screenshot({ path: "screenshots/no-evidence/60-mithun-home-as-bob2-after.png" });
});

test("admin reads a flagged throwaway's none record → suppression; then deleted", async ({ page }) => {
  test.setTimeout(240_000);
  await open(page, "/preview/client-refine/workshop");
  await page.getByRole("button", { name: "+ Add Client" }).click();
  await page.getByPlaceholder("Company name").fill(NAME);
  await page.getByTestId("add-client-no-public-site").locator("input[type=checkbox]").check();
  await page.getByRole("button", { name: "Create client" }).click();
  await expect(page.getByText(`${NAME}: No public site — the outside read runs on the name only.`)).toBeVisible({ timeout: 60_000 });
  const id = await page.evaluate(async (n) => { const s = (window as unknown as { supabase: Sb }).supabase; const { data } = await s.from("companies").select("id").eq("name", n).maybeSingle(); return (data as { id: string } | null)?.id ?? null; }, NAME);
  expect(id).not.toBeNull();
  await expect.poll(async () => (await presenceCount(page, id!)).count, { timeout: 60_000 }).toBe(1);
  await pin(page, id!);
  await page.goto("/preview/client-refine/workspace/routes", { waitUntil: "networkidle", timeout: 120_000 });
  await expect(page.getByTestId("routes-no-evidence-note")).toHaveText(NOTE, { timeout: 60_000 });
  await expect(page.getByTestId("routes-scorestrip")).toHaveCount(0);
  const gone = await page.evaluate(async (cid) => {
    const s = (window as unknown as { supabase: Sb }).supabase;
    const { error } = await s.from("companies").delete().eq("id", cid);
    await s.from("long_runner_runs").delete().eq("company_id", cid);
    const { data } = await s.from("companies").select("id").eq("id", cid).maybeSingle();
    return { error: error?.message ?? null, stillThere: Boolean(data) };
  }, id!);
  expect(gone).toEqual({ error: null, stillThere: false });
});

test("non-admin non-member reads 0 rows on Mithun", async ({ browser }) => {
  const email = process.env.NONADMIN_EMAIL, password = process.env.NONADMIN_PASSWORD;
  test.skip(!email || !password, "no NONADMIN_EMAIL / NONADMIN_PASSWORD (throwaway non-admin user) in the environment");
  const context = await browser.newContext({ storageState: undefined }); // a fresh, signed-out context
  const page = await context.newPage();
  await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle", timeout: 120_000 });
  const signedIn = await page.evaluate(async (c) => { const s = (window as unknown as { supabase: Sb }).supabase; const { data, error } = await s.auth.signInWithPassword(c); return { ok: Boolean(data?.session), error: error?.message ?? null }; }, { email: email!, password: password! });
  expect(signedIn).toEqual({ ok: true, error: null });
  const roles = await page.evaluate(async () => { const s = (window as unknown as { supabase: Sb }).supabase; const { data } = await s.from("user_roles").select("role"); return data; });
  expect(roles).toEqual([]);                                   // not an admin
  const who = await isMember(page, MITHUN);
  expect(who.creator).toBe(false); expect(who.member).toBe(false);
  expect(await presenceCount(page, MITHUN)).toEqual({ count: 0, error: null });
  await context.close();
});
