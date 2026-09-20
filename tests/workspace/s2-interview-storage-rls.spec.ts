// (s2) Transcript files are closed to company members — R20 (signed 2026-09-20), guard (g). Fixture: bob2
// (admin) creates a throwaway company with one customer-research input, uploads two throwaway objects and
// their input_files rows (one is_interview), adds the throwaway NON-ADMIN user as a member; as that member a
// signed URL for the interview object is refused and one for the ordinary object is allowed; the member also
// reads 0 upload interview records (R21). Everything is deleted after — never CB1 / CB2 / Edgewood data.
// Planted failure: the NOT EXISTS clause removed from "Users can view company input files" → the member
// signs the interview object too (run under scripts/guards/interview-commit2a-guard.sh PLANT=policy for the
// DB-level proof; this spec proves the HTTP path).
import { expect, test, type Page } from "playwright/test";
import { open } from "./helpers";

type Sb = { from: (t: string) => any; storage: { from: (b: string) => any }; auth: { getUser: () => Promise<{ data: { user: { id: string } | null } }>; signInWithPassword: (c: { email: string; password: string }) => Promise<{ data?: { session?: unknown }; error?: { message: string } | null }> } };
const NAME = `zz-interview-storage-rls-${Date.now()}`;
const FIXTURE = "FIXTURE (not a transcript) — storage RLS proof.";

test("(g) member: signed URL refused for an interview object, allowed for an ordinary one; 0 upload records", async ({ page }) => {
  test.setTimeout(180_000);
  const email = process.env.NONADMIN_EMAIL, password = process.env.NONADMIN_PASSWORD, nonadminId = process.env.NONADMIN_ID;
  test.skip(!email || !password || !nonadminId, "no NONADMIN_EMAIL / NONADMIN_PASSWORD / NONADMIN_ID in the environment");
  await open(page, "/preview/client-refine/workshop");
  const planted = await page.evaluate(async (args) => {
    const s = (window as unknown as { supabase: Sb }).supabase;
    const { data: { user } } = await s.auth.getUser();
    const { data: co, error: cErr } = await s.from("companies").insert({ name: args.name, created_by: user!.id, no_public_site: true }).select("id").single();
    if (cErr) return { error: `company: ${cErr.message}` };
    const cid = (co as { id: string }).id;
    const { data: inp, error: iErr } = await s.from("inputs").insert({ company_id: cid, user_id: user!.id, input_key: "customer-research", input_label: "Customer Research", group_key: "market_evidence", group_label: "Market Evidence", sub_group: "Research", completeness: 0, status: "not_started", score_impact: 1, impact_tier: "low" }).select("id").single();
    if (iErr) { await s.from("companies").delete().eq("id", cid); return { error: `input: ${iErr.message}` }; } // never leave the throwaway behind
    const iid = (inp as { id: string }).id;
    const base = `${user!.id}/zz-rls/${Date.now()}`;
    const paths = { interview: `${base}/fixture-interview.txt`, ordinary: `${base}/fixture-ordinary.txt` };
    for (const p of Object.values(paths)) { const { error } = await s.storage.from("input-files").upload(p, new Blob([args.fixture], { type: "text/plain" })); if (error) return { error: `upload ${p}: ${error.message}` }; }
    const { error: fErr } = await s.from("input_files").insert([
      { input_id: iid, file_name: "fixture-interview.txt", file_type: "text/plain", file_path: paths.interview, tags: [], is_interview: true },
      { input_id: iid, file_name: "fixture-ordinary.txt", file_type: "text/plain", file_path: paths.ordinary, tags: [], is_interview: false },
    ]);
    if (fErr) return { error: `input_files: ${fErr.message}` };
    const { error: mErr } = await s.from("company_members").insert({ company_id: cid, user_id: args.nonadmin, role: "participant" });
    if (mErr) return { error: `member: ${mErr.message}` };
    return { cid, paths };
  }, { name: NAME, fixture: FIXTURE, nonadmin: nonadminId! });
  expect(planted.error ?? null).toBeNull();
  const cid = planted.cid!; const paths = planted.paths!;
  try {
    // admin (bob2) signs both — the admin policy is unchanged
    const adminSign = await page.evaluate(async (p) => { const s = (window as unknown as { supabase: Sb }).supabase; const a = await s.storage.from("input-files").createSignedUrl(p.interview, 60); const b = await s.storage.from("input-files").createSignedUrl(p.ordinary, 60); return { interview: Boolean(a.data?.signedUrl), ordinary: Boolean(b.data?.signedUrl) }; }, paths);
    expect(adminSign).toEqual({ interview: true, ordinary: true });
    // the non-admin member
    const ctx2 = await page.context().browser()!.newContext();
    const p2 = await ctx2.newPage();
    await p2.goto("/", { waitUntil: "networkidle" });
    const signed = await p2.evaluate(async (c) => { const s = (window as unknown as { supabase: Sb }).supabase; const { data, error } = await s.auth.signInWithPassword(c); return { ok: Boolean(data?.session), error: error?.message ?? null }; }, { email: email!, password: password! });
    expect(signed).toEqual({ ok: true, error: null });
    const memberSign = await p2.evaluate(async (p) => {
      const s = (window as unknown as { supabase: Sb }).supabase;
      const a = await s.storage.from("input-files").createSignedUrl(p.interview, 60);
      const b = await s.storage.from("input-files").createSignedUrl(p.ordinary, 60);
      return { interview: Boolean(a.data?.signedUrl), interviewError: a.error?.message ?? null, ordinary: Boolean(b.data?.signedUrl) };
    }, paths);
    expect(memberSign.ordinary).toBe(true);
    expect(memberSign.interview).toBe(false);
    expect(memberSign.interviewError).not.toBeNull();
    // R21: 0 upload records readable (none exist for this company, and the policy would hide them anyway) — the read itself succeeds
    const recs = await p2.evaluate(async (c) => { const s = (window as unknown as { supabase: Sb }).supabase; const { data, error } = await s.from("interview_records").select("id").eq("company_id", c).not("input_file_id", "is", null); return { n: (data ?? []).length, error: error?.message ?? null }; }, cid);
    expect(recs).toEqual({ n: 0, error: null });
    await ctx2.close();
  } finally {
    const gone = await page.evaluate(async (args) => {
      const s = (window as unknown as { supabase: Sb }).supabase;
      await s.storage.from("input-files").remove([args.paths.interview, args.paths.ordinary]);
      const { error } = await s.from("companies").delete().eq("id", args.cid);
      const { data } = await s.from("companies").select("id").eq("id", args.cid).maybeSingle();
      const { data: left } = await s.storage.from("input-files").list(args.paths.interview.split("/").slice(0, -1).join("/"));
      return { error: error?.message ?? null, stillThere: Boolean(data), objectsLeft: (left ?? []).length };
    }, { cid, paths });
    expect(gone).toEqual({ error: null, stillThere: false, objectsLeft: 0 });
  }
});
