// (v) integrity_runs — admins read every company's integrity records (signed 2026-09-16).
// The SELECT policy was creator-or-member only; an admin who is neither read ZERO rows, so every
// record-gated surface rendered as "unknown" for admins on companies created by someone else.
// Proof through the app client (DEV window.supabase), on FLAGGED THROWAWAYS (2026-09-18 fold: Mithun is no
// longer a fixture — its outside read ran on the name-only lane and it now carries evidence):
//   admin leg (bob2)                  → a flagged throwaway is created, then handed to another user (created_by
//                                       reassigned) so bob2 is neither creator nor member; bob2 reads its ONE
//                                       evidence_presence record (state none) and its home is suppressed
//   a flagged throwaway (routes)      → the admin reads its none record → suppression on workspace Routes
//   non-admin non-member (NONADMIN_*) → reads 0 rows on a throwaway it neither created nor joined
// RED against the pre-migration policy set (policy dropped → the admin leg reads 0).
import { expect, test, type Page } from "playwright/test";
import { BASE_URL } from "../../playwright.config";
import { open } from "./helpers";

const OTHER_USER = "01488ba3-0db6-402f-aa85-0b763c504005"; // taylor@ — an existing non-admin account; becomes the creator on record
const NOTE = "Not enough public signal to score yet.";
const NAME = `zz-noev-admin-${Date.now()}`;
const NAME_A = `zz-noev-admin-a-${Date.now()}`;
const NAME_N = `zz-noev-admin-n-${Date.now()}`;
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
/** Create a flagged (no public site) throwaway through the real Add-Client dialog; the server writes its ONE
 *  evidence_presence record (none). With `handOff`, reassign created_by to OTHER_USER so bob2 is neither creator nor
 *  member — the admin clause is then the only door. */
async function createFlaggedThrowaway(page: Page, name: string, handOff: boolean): Promise<string> {
  await open(page, "/preview/client-refine/workshop");
  await page.getByRole("button", { name: "+ Add Client" }).click();
  await page.getByPlaceholder("Company name").fill(name);
  await page.getByTestId("add-client-no-public-site").locator("input[type=checkbox]").check();
  await page.getByRole("button", { name: "Create client" }).click();
  await expect(page.getByText(`${name}: No public site — the outside read runs on the name only.`)).toBeVisible({ timeout: 60_000 });
  const id = await page.evaluate(async (n) => { const s = (window as unknown as { supabase: Sb }).supabase; const { data } = await s.from("companies").select("id").eq("name", n).maybeSingle(); return (data as { id: string } | null)?.id ?? null; }, name);
  expect(id).not.toBeNull();
  await expect.poll(async () => (await presenceCount(page, id!)).count, { timeout: 60_000 }).toBe(1);
  if (handOff) {
    const err = await page.evaluate(async (a) => { const s = (window as unknown as { supabase: Sb }).supabase; const { error } = await s.from("companies").update({ created_by: a.other }).eq("id", a.id); return error?.message ?? null; }, { id: id!, other: OTHER_USER });
    expect(err).toBeNull();
  }
  return id!;
}
const deleteThrowaway = (page: Page, id: string) => page.evaluate(async (cid) => {
  const s = (window as unknown as { supabase: Sb }).supabase;
  const { error } = await s.from("companies").delete().eq("id", cid);
  await s.from("long_runner_runs").delete().eq("company_id", cid);
  const { data } = await s.from("companies").select("id").eq("id", cid).maybeSingle();
  return { error: error?.message ?? null, stillThere: Boolean(data) };
}, id);

test("admin (non-creator, non-member) reads a flagged throwaway's none record; its home suppresses", async ({ page }) => {
  test.setTimeout(240_000);
  const id = await createFlaggedThrowaway(page, NAME_A, true);
  try {
    const who = await isMember(page, id);
    expect(who.creator).toBe(false); expect(who.member).toBe(false); // neither — the admin clause is the only door
    expect(await presenceCount(page, id)).toEqual({ count: 1, error: null });
    await pin(page, id);
    await page.goto("/preview/client-refine/home", { waitUntil: "networkidle", timeout: 120_000 });
    await expect(page.getByTestId("home-fr")).toHaveAttribute("data-evidence-presence", "none", { timeout: 60_000 });
    await expect(page.getByTestId("fr-hscale")).toHaveCount(0);
    await expect(page.getByTestId("home-compass-note")).toHaveText(NOTE);
    await expect(page.getByTestId("home-no-evidence-note")).toHaveText(NOTE);
    expect(await page.getByTestId("home-context").innerText()).not.toMatch(/SCORE|FOUNDATION/);
    if (process.env.V_PROOF_SHOT) await page.screenshot({ path: "screenshots/no-evidence/60-throwaway-home-as-bob2-after.png" });
  } finally {
    expect(await deleteThrowaway(page, id)).toEqual({ error: null, stillThere: false });
  }
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

test("non-admin non-member reads 0 rows on a throwaway it neither created nor joined", async ({ browser, page }) => {
  test.setTimeout(240_000);
  const email = process.env.NONADMIN_EMAIL, password = process.env.NONADMIN_PASSWORD;
  test.skip(!email || !password, "no NONADMIN_EMAIL / NONADMIN_PASSWORD (throwaway non-admin user) in the environment");
  const id = await createFlaggedThrowaway(page, NAME_N, false); // created by bob2 (admin); the non-admin is neither creator nor member
  try {
    const context = await browser.newContext({ storageState: undefined }); // a fresh, signed-out context
    const p2 = await context.newPage();
    await p2.goto(`${BASE_URL}/login`, { waitUntil: "networkidle", timeout: 120_000 });
    const signedIn = await p2.evaluate(async (c) => { const s = (window as unknown as { supabase: Sb }).supabase; const { data, error } = await s.auth.signInWithPassword(c); return { ok: Boolean(data?.session), error: error?.message ?? null }; }, { email: email!, password: password! });
    expect(signedIn).toEqual({ ok: true, error: null });
    const roles = await p2.evaluate(async () => { const s = (window as unknown as { supabase: Sb }).supabase; const { data } = await s.from("user_roles").select("role"); return data; });
    expect(roles).toEqual([]);                                   // not an admin
    const who = await isMember(p2, id);
    expect(who.creator).toBe(false); expect(who.member).toBe(false);
    expect(await presenceCount(p2, id)).toEqual({ count: 0, error: null });
    await context.close();
  } finally {
    expect(await deleteThrowaway(page, id)).toEqual({ error: null, stillThere: false });
  }
});
