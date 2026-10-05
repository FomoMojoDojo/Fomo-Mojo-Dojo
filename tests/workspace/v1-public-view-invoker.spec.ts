// (V1, 2026-10-05; migration 20261005120000) — the two public views ran with DEFINER rights as
// postgres (bypassrls=true), so they read straight past the RLS on their own base tables. Every
// policy on claims / claim_signal_refs / signals / routes / claim_delta_relevance_overrides targets
// {authenticated} only, so the views were the SOLE anon read path:
//   anon, no user token        → derived_tensions_structural: 11 rows across 3 companies, claim
//                                statement text included
//   relevance_overrides_...    → auto-updatable (single-table view), and anon held INSERT, so an
//                                unauthenticated caller could write an override row against ANY
//                                company id (INSERT 0 1 through the view; refused on the base table)
//
// The fix: security_invoker = true on both, REVOKE ALL FROM anon, authenticated SELECT only.
// Legs here, in the order the report proved them:
//   1. anon GET on both views        → refused (401/403)
//   2. anon POST on view 2          → refused, and no row carries the probe identity (read-only: a
//                                row that lands stays in place as evidence; this spec deletes nothing)
//   3. no-membership authenticated  → 0 rows
//   4. member authenticated         → 0 rows, and no foreign company_id
//   5. admin authenticated          → the full read still works (the counterweight: this proves the
//                                     fix removed anon and nothing else, the way grants-guard (g5)
//                                     is the counterweight to (g3)/(g4))
//
// Counts and company_id ONLY. This spec never selects statement, topic or reason: the leak was the
// row text, and a spec that quotes it would re-publish what the fix exists to withhold.
// Bypass proof: ALTER VIEW ... RESET (security_invoker) + GRANT SELECT,INSERT ... TO anon → legs
// 1-4 fail; re-apply 20261005120000 → all five pass.
import { expect, test, type Page } from "playwright/test";
import * as fs from "node:fs";
import * as path from "node:path";

/** .env is the app's own anon identity; Playwright does not load it, so read it here. */
function fromDotEnv(key: string): string | undefined {
  try {
    const txt = fs.readFileSync(path.resolve(".env"), "utf8");
    const m = txt.match(new RegExp(`^${key}="?([^"\\n]+)"?$`, "m"));
    return m?.[1];
  } catch { return undefined; }
}
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || fromDotEnv("VITE_SUPABASE_URL") || "http://127.0.0.1:54321";
const ANON_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || fromDotEnv("VITE_SUPABASE_PUBLISHABLE_KEY");

const VIEWS = ["derived_tensions_structural", "relevance_overrides_without_live_pair"] as const;

// The signed baseline from the 2026-10-05 report: what the leak exposed, and what an admin must
// still read afterwards. Data-dependent on purpose — if the fixture set changes, update these two.
const ADMIN_ROWS = 11;
const ADMIN_COMPANIES = 3;

type Sb = {
  from: (t: string) => any;
  auth: {
    signInWithPassword: (c: { email: string; password: string }) => Promise<{ data?: { session?: unknown }; error?: { message: string } | null }>;
  };
};

/** Read a view through the app client, so the caller's own JWT, grants and RLS apply. */
const readView = (page: Page, view: string) => page.evaluate(async (v) => {
  const s = (window as unknown as { supabase: Sb }).supabase;
  const { data, error } = await s.from(v).select("company_id");
  const rows = (data ?? []) as Array<{ company_id: string }>;
  return {
    rows: rows.length,
    companies: [...new Set(rows.map((r) => r.company_id))].sort(),
    error: error?.message ?? null,
  };
}, view);

async function signedInPage(page: Page, email: string, password: string): Promise<Page> {
  const ctx = await page.context().browser()!.newContext({ storageState: { cookies: [], origins: [] } });
  const p = await ctx.newPage();
  await p.goto("/", { waitUntil: "networkidle", timeout: 120_000 });
  const signed = await p.evaluate(async (c) => {
    const s = (window as unknown as { supabase: Sb }).supabase;
    const { data, error } = await s.auth.signInWithPassword(c);
    return { ok: Boolean(data?.session), error: error?.message ?? null };
  }, { email, password });
  expect(signed).toEqual({ ok: true, error: null });
  return p;
}

test("(1) anon, no user token: a GET on every public view is refused", async ({ request }) => {
  test.skip(!ANON_KEY, "no VITE_SUPABASE_PUBLISHABLE_KEY in the environment or .env");
  for (const v of VIEWS) {
    const res = await request.get(`${SUPABASE_URL}/rest/v1/${v}?select=company_id`, {
      headers: { apikey: ANON_KEY!, Authorization: `Bearer ${ANON_KEY!}` },
    });
    expect(
      [401, 403],
      `anon still reads ${v} over PostgREST (http ${res.status()}) — the view is anonymously readable`,
    ).toContain(res.status());
  }
});

test("(2) anon, no user token: a POST through the auto-updatable view is refused, and nothing is written", async ({ page, request }) => {
  test.skip(!ANON_KEY, "no VITE_SUPABASE_PUBLISHABLE_KEY in the environment or .env");
  const view = "relevance_overrides_without_live_pair";
  const identity = `zz-v1-anon-write-${Date.now()}`;
  const res = await request.post(`${SUPABASE_URL}/rest/v1/${view}`, {
    headers: { apikey: ANON_KEY!, Authorization: `Bearer ${ANON_KEY!}`, "Content-Type": "application/json", Prefer: "return=representation" },
    data: {
      company_id: "3dd2cfbb-0792-4bf1-9cd4-15db9646874b", // a company the anon caller has no claim to
      pairing_kind: "internal_vs_public",
      content_identity: identity,
      verdict: "relevant",
      reason: "zz v1 spec: must be refused",
    },
  });
  // Soft, so the row read below still runs and reports: on a failing run both facts matter — that
  // anon was allowed to write, and that a row reached the table.
  expect.soft(
    [401, 403],
    `anon wrote through ${view} (http ${res.status()}) — an unauthenticated cross-company write`,
  ).toContain(res.status());

  // And no row carries the probe identity. Read back as the ADMIN (the base table, which the admin
  // policy covers) — a 401 on an anon read-back would prove nothing about whether the write landed.
  // READ ONLY. This spec deletes nothing: a row that lands is evidence of an open leak and stays put
  // for an operator to inspect and remove through the audited path. Sweeping it here would both
  // destroy the evidence and write live data to tidy up after a proof.
  await page.goto("/", { waitUntil: "networkidle", timeout: 120_000 });
  const landed = await page.evaluate(async (ident) => {
    const s = (window as unknown as { supabase: Sb }).supabase;
    const { count, error } = await s.from("claim_delta_relevance_overrides")
      .select("id", { count: "exact", head: true }).eq("content_identity", ident);
    return { count: Number(count ?? 0), error: error?.message ?? null };
  }, identity);
  expect(
    landed,
    `an anon-written override row reached claim_delta_relevance_overrides under content_identity ${identity} and HAS BEEN LEFT IN PLACE as evidence — remove it through the audited removal path (set app.override_removal_reason, then delete), not with a bare DELETE`,
  ).toEqual({ count: 0, error: null });
});

test("(3) a no-membership authenticated caller reads 0 rows from both views", async ({ page }) => {
  test.setTimeout(180_000);
  const email = process.env.NONADMIN_EMAIL, password = process.env.NONADMIN_PASSWORD;
  test.skip(!email || !password, "no NONADMIN_EMAIL / NONADMIN_PASSWORD (source backups/fr-nonadmin.env)");
  const p = await signedInPage(page, email!, password!);
  try {
    for (const v of VIEWS) {
      const got = await readView(p, v);
      expect(got.error, `${v} errored for a no-membership caller: ${got.error}`).toBeNull();
      expect({ view: v, rows: got.rows }, `a caller with no company_members row read rows from ${v}`)
        .toEqual({ view: v, rows: 0 });
    }
  } finally { await p.context().close(); }
});

test("(4) a member authenticated caller reads 0 rows, and no company_id outside their own", async ({ page }) => {
  test.setTimeout(180_000);
  const email = process.env.MEMBER_EMAIL, password = process.env.MEMBER_PASSWORD, own = process.env.MEMBER_COMPANY_ID;
  test.skip(!email || !password || !own, "no MEMBER_EMAIL / MEMBER_PASSWORD / MEMBER_COMPANY_ID (source backups/fr-member.env)");
  const p = await signedInPage(page, email!, password!);
  try {
    for (const v of VIEWS) {
      const got = await readView(p, v);
      expect(got.error, `${v} errored for the member caller: ${got.error}`).toBeNull();
      // their one company carries no row in either view, so the honest assertion is 0 …
      expect({ view: v, rows: got.rows }).toEqual({ view: v, rows: 0 });
      // … and, whatever it reads, never a company it does not belong to.
      const foreign = got.companies.filter((c) => c !== own);
      expect(foreign, `the member read foreign company_id(s) from ${v}`).toEqual([]);
    }
  } finally { await p.context().close(); }
});

test("(5) the admin read still works — the fix removed anon and nothing else", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto("/", { waitUntil: "networkidle", timeout: 120_000 });
  const got = await readView(page, "derived_tensions_structural");
  expect(got.error, `the admin read broke: ${got.error}`).toBeNull();
  expect(
    { rows: got.rows, companies: got.companies.length },
    "the admin read changed — if the fixture data moved, update ADMIN_ROWS / ADMIN_COMPANIES",
  ).toEqual({ rows: ADMIN_ROWS, companies: ADMIN_COMPANIES });
});
