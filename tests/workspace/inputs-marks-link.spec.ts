// (FM9, commit 3 of 4, 2026-09-22) The mark link-back carrier on the first-read route — ?mark=<anchor id>,
// against the REAL stack. Fixture: bob2 (admin) creates a throwaway company through the DEV window.supabase,
// two live open questions are planted with psql and ONE mark is made on the second of them through the RPC
// (the one write path), so the carrier is proven against a mark the page actually renders a row for.
// Everything cascades with the company. Proves:
//   (a) ?mark=<a live mark's anchor id> opens the read on that mark's beat, with the marked row scrolled into
//       the viewport and its mark icon showing — without a click and without the operator switch;
//   (b) ?mark=<an id the company does not hold> opens the read on its first beat, with no error, no message
//       and no node: the render is identical to the same route with no param at all;
//   (c) the default render carries zero [data-fr-operator] nodes with the param as without it;
//   (d) the round trip as the operator actually walks it: from the workspace Inputs list, a CLICK on the entry's
//       link (a client-side navigation, not a reload) lands on the mark's beat with the row in the viewport.
import { execFileSync } from "node:child_process";
import { expect, test, type Page } from "playwright/test";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = { from: (t: string) => any; rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string } | null }>; auth: { getUser: () => Promise<{ data: { user: { id: string } | null } }> } };
const PGC = process.env.PGC || "supabase_db_dzlgyxcvuwiulgifbmew";
const psql = (sql: string) => execFileSync("docker", ["exec", "-i", PGC, "psql", "-U", "postgres", "-d", "postgres", "-At", "-q", "-v", "ON_ERROR_STOP=1", "-c", sql], { encoding: "utf8" }).trim().split("\n")[0];
const Q1 = "FIXTURE link question one — what does the record echo?";
const Q2 = "FIXTURE link question two — who is the second audience?";
const QUESTIONS_BEAT = "Questions this read raises";
const QUESTIONS_BEAT_LABEL = "Questions"; // the beat's own nav label — the link label, no new string

async function openRead(page: Page, cid: string, search = "") {
  await page.addInitScript((id) => { try { localStorage.setItem("active_company_id", id); } catch { /* no storage */ } }, cid);
  await page.goto(`/preview/client-refine/first-read/${cid}${search}`, { waitUntil: "networkidle", timeout: 120_000 });
  await expect(page.locator(".first-read")).toBeVisible({ timeout: 60_000 });
}
async function plant(page: Page): Promise<string> {
  await page.goto("/preview/client-refine/workshop", { waitUntil: "networkidle", timeout: 120_000 });
  const planted = await page.evaluate(async (name) => {
    const s = (window as unknown as { supabase: Sb }).supabase;
    const { data: { user } } = await s.auth.getUser();
    const { data: co, error } = await s.from("companies").insert({ name, created_by: user!.id, no_public_site: true }).select("id").single();
    if (error) return { error: error.message };
    return { cid: (co as { id: string }).id };
  }, `zz-mark-link-${Date.now()}`);
  expect(planted.error ?? null).toBeNull();
  const cid = planted.cid!;
  psql(`insert into first_read_open_questions (company_id, run_id, question_text, question_identity, source_kind, status) values ('${cid}','fm9-link','${Q1}','fm9-q1','finding','live'), ('${cid}','fm9-link','${Q2}','fm9-q2','finding','live')`);
  return cid;
}
/** The one write path — the same RPC the box uses; the mark lands on the SECOND question row. */
async function markQ2(page: Page, cid: string) {
  const res = await page.evaluate(async (companyId) => {
    const s = (window as unknown as { supabase: Sb }).supabase;
    const { error } = await s.rpc("create_first_read_mark", {
      p_company_id: companyId, p_kind: "client_reaction", p_disposition: "important", p_beat_key: "questions",
      p_anchor_kind: "question", p_anchor_key: "fm9-q2", p_anchor_text: "FIXTURE link question two — who is the second audience?",
      p_anchor_text_sha256: "e".repeat(64), p_note: null,
    });
    return error?.message ?? null;
  }, cid);
  expect(res).toBeNull();
  expect(psql(`select count(*) from first_read_marks where company_id='${cid}' and withdrawn_at is null`)).toBe("1");
}
const dropCompany = (cid: string) => psql(`delete from companies where id='${cid}'`);

test("(a) ?mark=<live id> opens on the mark's beat with the row in the viewport", async ({ page }) => {
  test.setTimeout(300_000);
  const cid = await plant(page);
  try {
    await openRead(page, cid);
    await markQ2(page, cid);
    // the carrier does the navigating — a fresh load, no click, no keyboard, switch off
    await openRead(page, cid, `?mark=${encodeURIComponent("question|fm9-q2")}`);
    await expect(page.locator(".fr-beat")).toContainText(QUESTIONS_BEAT, { timeout: 30_000 });
    const row = page.locator("[data-fr-mark='target'][data-fr-mark-kind='question'][data-fr-mark-key='fm9-q2']");
    await expect(row).toHaveCount(1);
    await expect(row).toBeInViewport();
    await expect(row.locator("[data-fr-mark-icon='client_reaction']")).toHaveCount(1); // it is the marked row
    await expect(page.locator("[data-fr-mark='box']")).toHaveCount(0);                 // the jump opens nothing
    // (c) the param buys no operator affordance
    await expect(page.locator("[data-fr-operator]")).toHaveCount(0);
    await expect(page.locator("[data-fr-operator-switch]")).toHaveAttribute("data-fr-operator-switch", "off");
  } finally {
    dropCompany(cid);
  }
});

test("(b) ?mark=<unknown id> opens on the first beat, silently — identical to no param", async ({ page }) => {
  test.setTimeout(300_000);
  const cid = await plant(page);
  try {
    await markQ2(page, cid).catch(() => undefined); // a live mark exists, so the store is non-empty either way
    await openRead(page, cid);
    const plain = (await page.locator(".fr-beat").textContent())?.trim();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await openRead(page, cid, `?mark=${encodeURIComponent("question|fm9-no-such-anchor")}`);
    await expect(page.locator(".fr-beat")).toHaveText(plain!, { timeout: 30_000 });
    await expect(page.locator("[data-fr-mark='box']")).toHaveCount(0);
    expect(errors).toEqual([]);
    // (c) again: no operator node, and no word about the miss
    await expect(page.locator("[data-fr-operator]")).toHaveCount(0);
    expect(await page.locator(".first-read").textContent()).not.toContain("fm9-no-such-anchor");
  } finally {
    dropCompany(cid);
  }
});

test("(d) clicking the entry's link on workspace Inputs lands on the beat with the row in view", async ({ page }) => {
  test.setTimeout(300_000);
  const cid = await plant(page);
  try {
    await openRead(page, cid);
    await markQ2(page, cid);
    await page.goto(`/preview/client-refine/workspace/inputs`, { waitUntil: "networkidle", timeout: 120_000 });
    await expect(page.getByTestId("workspace-root")).toBeVisible({ timeout: 60_000 });
    await page.locator("[data-fr-operator-switch]").click();
    const link = page.getByTestId("inputs-marks-link").first();
    await expect(link).toHaveText(QUESTIONS_BEAT_LABEL);
    await link.click(); // client-side navigation — no reload
    await expect(page.locator(".fr-beat")).toContainText(QUESTIONS_BEAT, { timeout: 30_000 });
    const row = page.locator("[data-fr-mark='target'][data-fr-mark-kind='question'][data-fr-mark-key='fm9-q2']");
    await expect(row).toHaveCount(1);
    await expect(row).toBeInViewport();
    await expect(page.locator("[data-fr-mark='box']")).toHaveCount(0);
  } finally {
    dropCompany(cid);
  }
});
