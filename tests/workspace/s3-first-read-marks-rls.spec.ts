// (s3) First-read marks are admin-only over HTTP (FM commit 1, 2026-09-21). Fixture: bob2 (admin) creates a
// throwaway company through the DEV window.supabase and writes ONE mark through the RPC create_first_read_mark
// (the only write path; the actor is auth.uid()); as the throwaway NON-ADMIN user the tables answer 0 rows with no
// error, and the three RPCs refuse ("caller is not an admin"); as the admin the mark and its note read back.
// Everything is deleted by company cascade (marks and notes cascade with the company) — never CB1 / CB2 /
// Edgewood data. The note and anchor are throwaway strings.
// Committed-state plant (R31): `alter policy "Admins read first_read_marks" … using (true)` → the member reads the
// row → red; the policy is restored byte-identical from its captured expression (trap-guarded).
import { expect, test, type Page } from "playwright/test";
import { open } from "./helpers";

type Sb = { from: (t: string) => any; rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string } | null }>; auth: { getUser: () => Promise<{ data: { user: { id: string } | null } }>; signInWithPassword: (c: { email: string; password: string }) => Promise<{ data: { session: unknown }; error: { message?: string } | null }> } };
const NAME = `zz-first-read-marks-rls-${Date.now()}`;
const SHA = "3a1c22cbb8df4f0c1a4c1ae1c9b5ecfd7ac0a2f3e8b3f4e6d1a9c8b7a6f5e4d3"; // any 64-hex; the RPC stores it verbatim (lowercased)

test("(i) member: 0 marks / 0 notes over HTTP, RPCs refused; admin: the mark and its note read back", async ({ page }) => {
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
    const { error: mErr } = await s.from("company_members").insert({ company_id: cid, user_id: args.nonadmin, role: "participant" });
    if (mErr) { await s.from("companies").delete().eq("id", cid); return { error: `member: ${mErr.message}` }; }
    const { data: mark, error: rErr } = await s.rpc("create_first_read_mark", { p_company_id: cid, p_kind: "client_reaction", p_disposition: "interesting", p_beat_key: "findings", p_anchor_kind: "finding", p_anchor_key: "fixture-finding-1", p_anchor_text: "FIXTURE anchor (not a finding)", p_anchor_text_sha256: args.sha, p_note: "FIXTURE note v1" });
    if (rErr) { await s.from("companies").delete().eq("id", cid); return { error: `rpc: ${rErr.message}` }; }
    return { cid, markId: (mark as { mark_id?: string })?.mark_id ?? null };
  }, { name: NAME, nonadmin: nonadminId!, sha: SHA });
  expect(planted.error ?? null).toBeNull();
  const cid = planted.cid!; const markId = planted.markId!;
  expect(markId).toMatch(/^[0-9a-f-]{36}$/);
  try {
    // the admin reads the mark and its version-1 note
    const admin = await page.evaluate(async (a) => {
      const s = (window as unknown as { supabase: Sb }).supabase;
      const { data: marks } = await s.from("first_read_marks").select("id, kind, disposition, withdrawn_at").eq("company_id", a.cid);
      const { data: notes } = await s.from("first_read_mark_notes").select("version, note").eq("mark_id", a.markId);
      return { marks: (marks ?? []).length, kind: (marks ?? [])[0]?.kind ?? null, notes: (notes ?? []).map((n: { version: number }) => n.version) };
    }, { cid, markId });
    expect(admin).toEqual({ marks: 1, kind: "client_reaction", notes: [1] });
    // the non-admin member
    const ctx2 = await page.context().browser()!.newContext();
    const p2 = await ctx2.newPage();
    await p2.goto("/", { waitUntil: "networkidle" });
    const signed = await p2.evaluate(async (c) => { const s = (window as unknown as { supabase: Sb }).supabase; const { data, error } = await s.auth.signInWithPassword(c); return { ok: Boolean(data?.session), error: error?.message ?? null }; }, { email: email!, password: password! });
    expect(signed).toEqual({ ok: true, error: null });
    const member = await p2.evaluate(async (a) => {
      const s = (window as unknown as { supabase: Sb }).supabase;
      const m = await s.from("first_read_marks").select("id").eq("company_id", a.cid);
      const n = await s.from("first_read_mark_notes").select("id").eq("mark_id", a.markId);
      const c = await s.rpc("create_first_read_mark", { p_company_id: a.cid, p_kind: "our_mark", p_disposition: null, p_beat_key: "findings", p_anchor_kind: "finding", p_anchor_key: "fixture-finding-2", p_anchor_text: "FIXTURE", p_anchor_text_sha256: a.sha, p_note: "member note" });
      const ap = await s.rpc("append_first_read_mark_note", { p_mark_id: a.markId, p_note: "member note" });
      const w = await s.rpc("withdraw_first_read_mark", { p_mark_id: a.markId, p_reason: "member reason" });
      return { marks: (m.data ?? []).length, marksError: m.error?.message ?? null, notes: (n.data ?? []).length, notesError: n.error?.message ?? null, create: c.error?.message ?? "no error", append: ap.error?.message ?? "no error", withdraw: w.error?.message ?? "no error" };
    }, { cid, markId, sha: SHA });
    await ctx2.close();
    expect(member.marks).toBe(0); expect(member.marksError).toBeNull();
    expect(member.notes).toBe(0); expect(member.notesError).toBeNull();
    expect(member.create).toContain("caller is not an admin");
    expect(member.append).toContain("caller is not an admin");
    expect(member.withdraw).toContain("caller is not an admin");
    // nothing the member tried was written
    const after = await page.evaluate(async (a) => { const s = (window as unknown as { supabase: Sb }).supabase; const { data } = await s.from("first_read_marks").select("id, withdrawn_at").eq("company_id", a.cid); const { data: n } = await s.from("first_read_mark_notes").select("version").eq("mark_id", a.markId); return { marks: (data ?? []).length, withdrawn: (data ?? [])[0]?.withdrawn_at ?? null, notes: (n ?? []).length }; }, { cid, markId });
    expect(after).toEqual({ marks: 1, withdrawn: null, notes: 1 });
  } finally {
    const gone = await page.evaluate(async (c) => {
      const s = (window as unknown as { supabase: Sb }).supabase;
      const { error } = await s.from("companies").delete().eq("id", c);
      const { data } = await s.from("companies").select("id").eq("id", c).maybeSingle();
      const { data: marks } = await s.from("first_read_marks").select("id").eq("company_id", c);
      return { error: error?.message ?? null, stillThere: Boolean(data), marksLeft: (marks ?? []).length };
    }, cid);
    expect(gone).toEqual({ error: null, stillThere: false, marksLeft: 0 });
  }
});
