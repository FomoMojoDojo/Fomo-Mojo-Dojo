// (s2) Transcript files are closed to company members — R20 (signed 2026-09-20), guard (g). Fixture: bob2
// (admin) creates a throwaway company with one customer-research input, uploads two throwaway objects and
// their input_files rows (one is_interview), adds the throwaway NON-ADMIN user as a member; as that member a
// signed URL for the interview object is refused and one for the ordinary object is allowed; the member also
// reads 0 upload interview records (R21). Everything is deleted after — never CB1 / CB2 / Edgewood data.
//
// HISTORY. Check (h) was added 2026-09-21 as "the member still reads the ONE hand-entered (capture-form,
// input_file_id NULL) record directly from interview_records" — R21's member half, over HTTP.
//
// SUPERSEDED by U6-13 / U6-14 / U6-16 (2026-11-10). interview_records no longer carries a company_members
// arm at all: the member policy was dropped and the table answers a member nothing, whatever the row. A
// member now reaches an interview through two narrow SECURITY DEFINER doors instead —
//   tier 1  interview_people(uuid[])  name, role, date — membership, owner, author or admin
//   tier 2  interview_text / interview_item_text — the words, gated on the interview.readText capability
// so (h) now asserts THAT law: 0 rows from the table directly, 1 through the tier-1 door, and the door
// hands back only its five signed columns. The capture-form record is still reachable by the member, which
// is what (h) was always for; it is the PATH that changed, not the entitlement.
// Planted failure: the NOT EXISTS clause removed from "Users can view company input files" → the member
// signs the interview object too (run under scripts/guards/interview-commit2a-guard.sh PLANT=policy for the
// DB-level proof; this spec proves the HTTP path).
import { expect, test, type Page } from "playwright/test";
import { open, plantInterviewRecord, psql } from "./helpers";

type Sb = { from: (t: string) => any; rpc: (fn: string, args: Record<string, unknown>, opts?: { get?: boolean }) => Promise<{ data: unknown; error: { message: string } | null }>; storage: { from: (b: string) => any }; auth: { getUser: () => Promise<{ data: { user: { id: string } | null } }>; signInWithPassword: (c: { email: string; password: string }) => Promise<{ data?: { session?: unknown }; error?: { message: string } | null }> } };
const NAME = `zz-interview-storage-rls-${Date.now()}`;

// THE SAFETY NET (2026-11-10). The in-test `finally` below is the real cleanup and still carries its
// own assertion. But a Playwright TIMEOUT kills the test body before `finally` can finish, and on
// 2026-11-10 two red s2 runs did exactly that — each leaving its throwaway company behind with a
// company_members row on the NON-ADMIN fixture. That fixture must hold no membership at all (several
// guards use it as the caller who belongs to nothing), so first-read-rls-guard went red until the
// residue was removed by hand.
//
// afterEach runs on its own timeout budget even after the test times out, and this one works
// OWNER-SIDE over psql, so it needs neither a live page nor a browser grant. Deleting the company
// cascades the membership, the inputs, the input_files and the records — interview_records'
// delete trigger permits that because the companies row is already gone when it fires.
let throwawayCid: string | null = null;

test.afterEach(async () => {
  if (!throwawayCid) return;
  const id = throwawayCid;
  throwawayCid = null;
  const left = psql(`select count(*) from companies where id = '${id}'`);
  if (left === "0") return; // the in-test cleanup did its job
  // The COMPANY is the whole job, and it goes first: deleting it cascades the company_members row
  // off the non-admin fixture, which is the thing that must never survive a red run.
  //
  // The two storage objects are deliberately NOT touched here. storage.protect_delete() refuses a
  // direct DELETE on storage tables ("Use the Storage API instead"), so a psql attempt THROWS and
  // would abort this hook before it reached the company — which is exactly what the first version of
  // this net did. On the normal path the in-test `finally` removes them through the Storage API; if a
  // timeout skips that, they are inert blobs under a per-run prefix whose input_files rows went with
  // the company, and they hold no fixture hostage.
  psql(`delete from companies where id = '${id}'`);
  const after = psql(`select count(*) from companies where id = '${id}'`);
  console.warn(`s2 safety net: the in-test cleanup did not run (timeout?); removed throwaway ${id} owner-side — companies rows now ${after}`);
  expect(after, "the s2 safety net could not remove the throwaway company").toBe("0");
});
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
    return { cid, paths, adminId: user!.id };
  }, { name: NAME, fixture: FIXTURE, nonadmin: nonadminId! });
  expect(planted.error ?? null).toBeNull();
  const cid = planted.cid!; const paths = planted.paths!;
  throwawayCid = cid; // arm the safety net the moment the company exists
  // (h) one hand-entered record (the capture-form shape: no input_file_id) — members must still read these.
  // U6-35: planted as the table owner. INSERT on interview_records is revoked from `authenticated`
  // (U6-26), so the browser cannot place a fixture row any more — and should not be able to.
  plantInterviewRecord({ company_id: cid, speaker_role: "client_stakeholder", verbatim: FIXTURE, created_by: planted.adminId!, person_name: "Fixture Person" });
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
    // (h) the capture-form half, under the two-tier law (U6-13 / U6-14 / U6-16): the TABLE answers the
    // member nothing even for the hand-entered record, and the tier-1 DOOR hands back that one person.
    const hand = await p2.evaluate(async (c) => {
      const s = (window as unknown as { supabase: Sb }).supabase;
      const { data: tbl, error: tErr } = await s.from("interview_records").select("id").eq("company_id", c).is("input_file_id", null);
      const { data: door, error: dErr } = await s.rpc("interview_people", { p_company_ids: [c] }, { get: true });
      const rows = (door ?? []) as Record<string, unknown>[];
      return {
        table: { n: (tbl ?? []).length, error: tErr?.message ?? null },
        door: { n: rows.length, error: dErr?.message ?? null, name: rows[0]?.person_name ?? null, columns: Object.keys(rows[0] ?? {}).sort() },
      };
    }, cid);
    expect(hand.table).toEqual({ n: 0, error: null });
    expect(hand.door).toEqual({ n: 1, error: null, name: "Fixture Person", columns: ["company_id", "id", "interviewed_at", "person_name", "person_role"] });
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
