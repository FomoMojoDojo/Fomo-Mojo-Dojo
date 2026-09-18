// (v2) strategic_tensions read policies (2026-09-17 census; migration 20260918090000) — live proof on a THROWAWAY
// company. Before the migration the only SELECT policy was creator-only: an admin who did not create the company
// and a company member who did not create it both read ZERO rows, and FlowCommitSheet (a client-visible gate)
// could not see a commitment-blocker. Legs (all through the app client, RLS enforced):
//   admin, non-creator, non-member  → n    ("Admins can view all strategic_tensions")
//   non-admin member, non-creator   → n    ("Company members can view strategic_tensions")
//   non-admin non-member            → 0    (unchanged)
// Planting under RLS: bob2 (admin) inserts the company + tension as CREATOR (creator INSERT policy), then reassigns
// created_by to another user (admin ALL on companies) so bob2 is a non-creator; the member leg adds the non-admin as
// a member (assignRole capability). Deleted after (tensions + members cascade). Bypass = drop the admin policy → the
// admin leg reads 0 → fails; re-apply → passes.
import { expect, test, type Page } from "playwright/test";
import { open } from "./helpers";

const OTHER_USER = "01488ba3-0db6-402f-aa85-0b763c504005"; // taylor@ — an existing non-admin account; becomes the creator on record
const NAME = `zz-tensions-rls-${Date.now()}`;
type Sb = { from: (t: string) => any; auth: { signInWithPassword: (c: { email: string; password: string }) => Promise<{ data?: { session?: unknown }; error?: { message: string } | null }>; getUser: () => Promise<{ data: { user: { id: string } | null } }>; signOut: () => Promise<unknown> } };

const tensionCount = (page: Page, companyId: string) => page.evaluate(async (cid) => {
  const s = (window as unknown as { supabase: Sb }).supabase;
  const { count, error } = await s.from("strategic_tensions").select("id", { count: "exact", head: true }).eq("company_id", cid);
  return { count: Number(count ?? 0), error: error?.message ?? null };
}, companyId);

test("admin non-creator and member non-creator read tensions; non-admin non-member reads none", async ({ page }) => {
  test.setTimeout(180_000);
  const email = process.env.NONADMIN_EMAIL, password = process.env.NONADMIN_PASSWORD, nonadminId = process.env.NONADMIN_ID;
  test.skip(!email || !password || !nonadminId, "no NONADMIN_EMAIL / NONADMIN_PASSWORD / NONADMIN_ID (throwaway non-admin user) in the environment");

  // ── plant as bob2 (admin): company (creator = bob2) + two tensions (creator INSERT), then hand the company to OTHER_USER
  await open(page, "/preview/client-refine/workshop");
  const planted = await page.evaluate(async (args) => {
    const s = (window as unknown as { supabase: Sb }).supabase;
    const { data: { user } } = await s.auth.getUser();
    const { data: co, error: cErr } = await s.from("companies").insert({ name: args.name, created_by: user!.id, no_public_site: true }).select("id").single();
    if (cErr) return { error: `company: ${cErr.message}` };
    const cid = (co as { id: string }).id;
    const { error: tErr } = await s.from("strategic_tensions").insert([
      { company_id: cid, statement: "zz tension A (rls proof)", status: "unresolved", confidence: 0.8, pressure: "high", source: "commitment_blocked", is_commitment_blocker: true, blocked_commitments: [], created_from: "stored" },
      { company_id: cid, statement: "zz tension B (rls proof)", status: "emerging", confidence: 0.5, pressure: "low", source: "user_defined", is_commitment_blocker: false, blocked_commitments: [], created_from: "stored" },
    ]);
    if (tErr) return { error: `tensions: ${tErr.message}` };
    const { error: uErr } = await s.from("companies").update({ created_by: args.other }).eq("id", cid);
    if (uErr) return { error: `reassign: ${uErr.message}` };
    const { data: chk } = await s.from("companies").select("created_by").eq("id", cid).maybeSingle();
    return { cid, uid: user!.id, creator: (chk as { created_by: string } | null)?.created_by };
  }, { name: NAME, other: OTHER_USER });
  expect(planted.error ?? null).toBeNull();
  const cid = planted.cid!;
  expect(planted.creator).toBe(OTHER_USER);
  expect(planted.creator).not.toBe(planted.uid);

  try {
    // ── admin, non-creator, non-member → n
    const admin = await tensionCount(page, cid);
    expect(admin).toEqual({ count: 2, error: null });

    // ── non-admin: non-member → 0; then made a member → n
    const ctx2 = await page.context().browser()!.newContext();
    const p2 = await ctx2.newPage();
    await p2.goto("/", { waitUntil: "networkidle" });
    const signed = await p2.evaluate(async (c) => { const s = (window as unknown as { supabase: Sb }).supabase; const { data, error } = await s.auth.signInWithPassword(c); return { ok: Boolean(data?.session), error: error?.message ?? null }; }, { email: email!, password: password! });
    expect(signed).toEqual({ ok: true, error: null });
    expect(await tensionCount(p2, cid)).toEqual({ count: 0, error: null }); // non-member: unchanged

    const joined = await page.evaluate(async (args) => {
      const s = (window as unknown as { supabase: Sb }).supabase;
      const { error } = await s.from("company_members").insert({ company_id: args.cid, user_id: args.uid, role: "participant" });
      return error?.message ?? null;
    }, { cid, uid: nonadminId! });
    expect(joined).toBeNull();
    expect(await tensionCount(p2, cid)).toEqual({ count: 2, error: null }); // member, non-creator: reads
    await ctx2.close();
  } finally {
    // cleanup: delete the throwaway (tensions + members cascade) — bob2 is admin (ALL on companies)
    const gone = await page.evaluate(async (c) => {
      const s = (window as unknown as { supabase: Sb }).supabase;
      const { error } = await s.from("companies").delete().eq("id", c);
      const { data } = await s.from("companies").select("id").eq("id", c).maybeSingle();
      return { error: error?.message ?? null, stillThere: Boolean(data) };
    }, cid);
    expect(gone).toEqual({ error: null, stillThere: false });
  }
});
