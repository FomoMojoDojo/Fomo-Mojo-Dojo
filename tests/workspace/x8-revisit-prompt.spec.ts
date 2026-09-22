// (x8) The revisit prompt — commit 4 of 4, ruling FM12 revised (2026-09-22), against the REAL stack: no stub on
// the mark store, the keep RPC or the withdraw RPC. Fixture: bob2 (admin) creates a throwaway company through the
// DEV window.supabase; two live open questions are planted with psql and marks are made through the RPCs.
// A wording change is simulated by altering the planted question's TEXT (its identity — the anchor key — is
// untouched), which is exactly what a re-run of the read does. Everything cascades with the company; Edgewood is
// never touched. Proves:
//   (a) switch OFF: no prompt and zero operator nodes, with marks that would otherwise fire (R1/R2);
//   (b) switch ON: exactly the two mismatched marks are listed — the changed one with "As marked" + "Now reads",
//       the vanished one with "This row is gone." and no "Now reads"; the untouched mark is never listed;
//   (c) Keep on the changed entry: the entry leaves, one first_read_mark_kept audit row exists carrying what it
//       was kept against, and a hard reload shows no prompt — the Keep is REMEMBERED;
//   (d) after a SECOND text change the same mark fires again, against the new wording (R4);
//   (e) Remove on the vanished entry: withdrawn with operator_removed_on_revisit, one withdraw audit row, and the
//       entry leaves "What we heard" too;
//   (f) Keep all / Remove all resolve every listed mark in one action, on a fresh plant.
import { execFileSync } from "node:child_process";
import { expect, test, type Page } from "playwright/test";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = { from: (t: string) => any; rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string } | null }>; auth: { getUser: () => Promise<{ data: { user: { id: string } | null } }> } };
const PGC = process.env.PGC || "supabase_db_dzlgyxcvuwiulgifbmew";
const psql = (sql: string) => execFileSync("docker", ["exec", "-i", PGC, "psql", "-U", "postgres", "-d", "postgres", "-At", "-q", "-v", "ON_ERROR_STOP=1", "-c", sql], { encoding: "utf8" }).trim().split("\n")[0];
const ADMIN = "(select user_id from user_roles where role='admin' limit 1)";

const Q1 = "FIXTURE x8 question one — the row whose wording will change";
const Q1_CHANGED = "FIXTURE x8 question one — the row AFTER its wording changed";
const Q1_AGAIN = "FIXTURE x8 question one — the row after a SECOND wording change";
const Q2 = "FIXTURE x8 question two — the row that never changes";
const GONE_TEXT = "FIXTURE x8 anchor whose row has left the read";
const QUESTIONS_BEAT = "Questions this read raises";

async function openRead(page: Page, cid: string) {
  await page.addInitScript((id) => { try { localStorage.setItem("active_company_id", id); } catch { /* no storage */ } }, cid);
  await page.goto(`/preview/client-refine/first-read/${cid}`, { waitUntil: "networkidle", timeout: 120_000 });
  await expect(page.locator(".first-read")).toBeVisible({ timeout: 60_000 });
}
async function operatorOn(page: Page) {
  await page.locator("[data-fr-operator-switch]").click();
  await expect(page.locator("[data-fr-operator-switch]")).toHaveAttribute("data-fr-operator-switch", "on");
}
/** sha256 of the anchor normalization — the page's own rule, run in the page so it cannot drift from it. */
const shaOf = (page: Page, text: string) => page.evaluate(async (t) => {
  const n = t.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(n));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}, text);

async function plant(page: Page): Promise<string> {
  await page.goto("/preview/client-refine/workshop", { waitUntil: "networkidle", timeout: 120_000 });
  const planted = await page.evaluate(async (name) => {
    const s = (window as unknown as { supabase: Sb }).supabase;
    const { data: { user } } = await s.auth.getUser();
    const { data: co, error } = await s.from("companies").insert({ name, created_by: user!.id, no_public_site: true }).select("id").single();
    if (error) return { error: error.message };
    return { cid: (co as { id: string }).id };
  }, `zz-revisit-${Date.now()}`);
  expect(planted.error ?? null).toBeNull();
  const cid = planted.cid!;
  psql(`insert into first_read_open_questions (company_id, run_id, question_text, question_identity, source_kind, status) values ('${cid}','x8','${Q1}','x8-q1','finding','live'), ('${cid}','x8','${Q2}','x8-q2','finding','live')`);
  return cid;
}
/** The three marks: one that will change, one that never changes, one whose row is already absent. */
async function markAll(page: Page, cid: string) {
  const [sha1, sha2, shaGone] = await Promise.all([shaOf(page, Q1), shaOf(page, Q2), shaOf(page, GONE_TEXT)]);
  const err = await page.evaluate(async (a) => {
    const s = (window as unknown as { supabase: Sb }).supabase;
    for (const m of a.marks) {
      const { error } = await s.rpc("create_first_read_mark", {
        p_company_id: a.cid, p_kind: "our_mark", p_disposition: null, p_beat_key: "questions",
        p_anchor_kind: "question", p_anchor_key: m.key, p_anchor_text: m.text, p_anchor_text_sha256: m.sha, p_note: null,
      });
      if (error) return error.message ?? "failed";
    }
    return null;
  }, { cid, marks: [{ key: "x8-q1", text: Q1, sha: sha1 }, { key: "x8-q2", text: Q2, sha: sha2 }, { key: "x8-gone", text: GONE_TEXT, sha: shaGone }] });
  expect(err).toBeNull();
  expect(psql(`select count(*) from first_read_marks where company_id='${cid}' and withdrawn_at is null`)).toBe("3");
}
const retext = (cid: string, text: string) => psql(`update first_read_open_questions set question_text='${text}' where company_id='${cid}' and question_identity='x8-q1'`);
const auditCount = (cid: string, component: string) => psql(`select count(*) from integrity_runs where company_id='${cid}' and component='${component}'`);
const dropCompany = (cid: string) => psql(`delete from companies where id='${cid}'`);

test("(a-e) the prompt: gated, lists only the mismatches, a remembered Keep, an audited Remove", async ({ page }) => {
  test.setTimeout(300_000);
  const cid = await plant(page);
  try {
    await openRead(page, cid);
    await markAll(page, cid);
    retext(cid, Q1_CHANGED);

    // (a) switch OFF — the marks mismatch, and the client render says nothing about it
    await openRead(page, cid);
    await expect(page.getByTestId("revisit-prompt")).toHaveCount(0);
    await expect(page.locator("[data-fr-operator]")).toHaveCount(0);
    await expect(page.locator(".first-read")).not.toContainText("Marks that no longer match");

    // (b) switch ON — exactly the two mismatches
    await operatorOn(page);
    const prompt = page.getByTestId("revisit-prompt");
    await expect(prompt).toBeVisible();
    await expect(prompt).toHaveAttribute("data-fr-operator", "revisit");
    await expect(prompt.getByTestId("revisit-title")).toHaveText("Marks that no longer match");
    await expect(prompt.getByTestId("revisit-entry")).toHaveCount(2);
    const changed = prompt.locator("[data-fr-revisit-state='wording_changed']");
    const gone = prompt.locator("[data-fr-revisit-state='row_gone']");
    await expect(changed).toHaveCount(1);
    await expect(gone).toHaveCount(1);
    await expect(changed).toContainText("The wording changed.");
    await expect(changed.getByTestId("revisit-as-marked")).toHaveText(Q1);
    await expect(changed.getByTestId("revisit-now-reads")).toHaveText(Q1_CHANGED);
    await expect(gone).toContainText("This row is gone.");
    await expect(gone.getByTestId("revisit-as-marked")).toHaveText(GONE_TEXT);
    await expect(gone.getByTestId("revisit-now-reads")).toHaveCount(0);
    await expect(prompt).not.toContainText(Q2); // the untouched mark is never listed

    // (c) Keep the changed one — it leaves, it is audited, and it stays quiet across a reload
    await changed.getByTestId("revisit-keep").click();
    await expect(prompt.getByTestId("revisit-entry")).toHaveCount(1);
    expect(auditCount(cid, "first_read_mark_kept")).toBe("1");
    const shaChanged = await shaOf(page, Q1_CHANGED);
    expect(psql(`select revisit_resolved_against from first_read_marks where company_id='${cid}' and anchor_key='x8-q1'`)).toBe(shaChanged);
    await openRead(page, cid);
    await operatorOn(page);
    await expect(page.getByTestId("revisit-prompt").locator("[data-fr-revisit-state='wording_changed']")).toHaveCount(0);

    // (d) it changes AGAIN → the same mark fires again, against the new wording
    retext(cid, Q1_AGAIN);
    await openRead(page, cid);
    await operatorOn(page);
    const again = page.getByTestId("revisit-prompt").locator("[data-fr-revisit-state='wording_changed']");
    await expect(again).toHaveCount(1);
    await expect(again.getByTestId("revisit-now-reads")).toHaveText(Q1_AGAIN);
    await expect(again.getByTestId("revisit-as-marked")).toHaveText(Q1); // still the words it was marked on

    // (e) Remove the vanished one — the revisit reason, one audit row, and it leaves "What we heard"
    await page.getByTestId("revisit-prompt").locator("[data-fr-revisit-state='row_gone']").getByTestId("revisit-remove").click();
    await expect(page.getByTestId("revisit-prompt").locator("[data-fr-revisit-state='row_gone']")).toHaveCount(0);
    expect(psql(`select withdraw_reason from first_read_marks where company_id='${cid}' and anchor_key='x8-gone'`)).toBe("operator_removed_on_revisit");
    expect(auditCount(cid, "first_read_mark_withdrawn")).toBe("1");
    expect(psql(`select count(*) from first_read_marks where company_id='${cid}' and withdrawn_at is null`)).toBe("2");
    await openRead(page, cid);
    const heard = page.locator("[data-fr-mark='heard']");
    await page.keyboard.press("End"); await page.waitForTimeout(300);
    for (let i = 0; i < 20 && await heard.count() === 0; i++) { await page.keyboard.press("ArrowLeft"); await page.waitForTimeout(120); }
    await expect(heard).toHaveCount(1);
    await expect(heard).not.toContainText(GONE_TEXT);
  } finally {
    dropCompany(cid);
  }
});

test("(f) Keep all and Remove all resolve every listed mark in one action", async ({ page }) => {
  test.setTimeout(300_000);
  const keepCid = await plant(page);
  try {
    await openRead(page, keepCid);
    await markAll(page, keepCid);
    retext(keepCid, Q1_CHANGED);
    await openRead(page, keepCid);
    await operatorOn(page);
    await expect(page.getByTestId("revisit-entry")).toHaveCount(2);
    await page.getByTestId("revisit-keep-all").click();
    await expect(page.getByTestId("revisit-prompt")).toHaveCount(0); // the prompt leaves with its last entry
    expect(auditCount(keepCid, "first_read_mark_kept")).toBe("2");
    expect(psql(`select count(*) from first_read_marks where company_id='${keepCid}' and revisit_resolved_at is not null`)).toBe("2");
    expect(psql(`select count(*) from first_read_marks where company_id='${keepCid}' and withdrawn_at is null`)).toBe("3"); // Keep withdraws nothing
  } finally {
    dropCompany(keepCid);
  }

  const rmCid = await plant(page);
  try {
    await openRead(page, rmCid);
    await markAll(page, rmCid);
    retext(rmCid, Q1_CHANGED);
    await openRead(page, rmCid);
    await operatorOn(page);
    await expect(page.getByTestId("revisit-entry")).toHaveCount(2);
    await page.getByTestId("revisit-remove-all").click();
    await expect(page.getByTestId("revisit-prompt")).toHaveCount(0);
    expect(auditCount(rmCid, "first_read_mark_withdrawn")).toBe("2");
    expect(psql(`select count(*) from first_read_marks where company_id='${rmCid}' and withdraw_reason='operator_removed_on_revisit'`)).toBe("2");
    expect(psql(`select count(*) from first_read_marks where company_id='${rmCid}' and withdrawn_at is null`)).toBe("1"); // the untouched mark survives
  } finally {
    dropCompany(rmCid);
  }
});
