// (x7) First-read marks on the LIVE first read — commit 2 (FM1–FM16 + the fix pass FM5/FM17–FM21, signed strings,
// 2026-09-22), against the REAL stack: no stub on first_read_marks / first_read_mark_notes / the RPCs. Fixture: bob2
// (admin) creates a throwaway company through the DEV window.supabase; two live open questions and one promise read
// are planted with psql (both tables are admin-managed, the rows are throwaway strings — never a transcript, never a
// real company). Everything cascades with the company; the spec asserts 0 marks left. Proves:
//   (a) a click on a question row opens the box with NOTHING preselected (FM18); closing it writes nothing;
//   (b) picking "Interesting" with no note → create (one mark, note v1 with a NULL note — FM5); the row is
//       highlighted with the kind icon; reopening shows the choice pressed; the x button (aria-label "Close") saves
//       and closes; an unchanged close writes no version;
//   (c) typed text survives a choice switch (FM5); Escape saves → v2 (note + disposition); a disposition-only
//       change closed by the x → v3; an outside click with nothing changed → no version;
//   (d) arrow keys / End typed in the note never move the beat;
//   (e) a second mark of the same kind on the same anchor is refused by the index (a direct RPC as the admin);
//   (i) FM17: the pointer cursor + outline sit on a markable row on hover, not on a non-markable node;
//   (j) FM20: the box opens with the 150 ms animation; under prefers-reduced-motion it opens with none;
//   (k) FM21: "Stood out to us" on the same row as the reaction → a second mark (its own note), two icons;
//   (f) "What we heard" is absent at 0 marks and present at ≥1, just before the closer; groups in order (Important ·
//       Stood out to us here — empty groups absent); entries carry the anchored text and the latest note and jump to
//       the anchor's beat; a row_gone mark (planted with psql on a bogus question identity) and an offering-question
//       mark whose key never fills (FM19) appear there marked row_gone and highlight no row;
//   (g) withdraw per mark: the row loses the highlight, the entry leaves "What we heard", the beat disappears at 0;
//   (h) an existing control keeps its behaviour: Edgewood's "+ N further signals" fold expands without opening
//       a box (read-only on Edgewood — no mark is ever written there).
import { execFileSync } from "node:child_process";
import { expect, test, type Page } from "playwright/test";
import { COMPANY_ID } from "../../playwright.config";

type Sb = { from: (t: string) => any; rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string } | null }>; auth: { getUser: () => Promise<{ data: { user: { id: string } | null } }> } };
const PGC = process.env.PGC || "supabase_db_dzlgyxcvuwiulgifbmew";
const psql = (sql: string) => execFileSync("docker", ["exec", "-i", PGC, "psql", "-U", "postgres", "-d", "postgres", "-At", "-q", "-v", "ON_ERROR_STOP=1", "-c", sql], { encoding: "utf8" }).trim().split("\n")[0];
const Q1 = "FIXTURE question one — does the record echo the promise?";
const Q2 = "FIXTURE question two — who is the second audience?";
const PROMISE = "FIXTURE promise: a throwaway sentence for the marks proof";

async function openAs(page: Page, companyId: string, path: string) {
  await page.addInitScript((id) => { try { localStorage.setItem("active_company_id", id); } catch { /* no storage */ } }, companyId);
  await page.goto(path, { waitUntil: "networkidle", timeout: 120_000 });
  await expect(page.locator(".first-read")).toBeVisible({ timeout: 60_000 });
}
async function plant(page: Page) {
  await openAs(page, "", "/preview/client-refine/workshop").catch(() => undefined);
  await page.goto("/preview/client-refine/workshop", { waitUntil: "networkidle", timeout: 120_000 });
  const planted = await page.evaluate(async (name) => {
    const s = (window as unknown as { supabase: Sb }).supabase;
    const { data: { user } } = await s.auth.getUser();
    const { data: co, error } = await s.from("companies").insert({ name, created_by: user!.id, no_public_site: true }).select("id").single();
    if (error) return { error: error.message };
    return { cid: (co as { id: string }).id };
  }, `zz-first-read-marks-${Date.now()}`);
  expect(planted.error ?? null).toBeNull();
  const cid = planted.cid!;
  psql(`insert into first_read_open_questions (company_id, run_id, question_text, question_identity, source_kind, status) values ('${cid}', 'x7-spec', '${Q1}', 'x7-q1', 'finding', 'live'), ('${cid}', 'x7-spec', '${Q2}', 'x7-q2', 'finding', 'live')`);
  psql(`insert into public_reads (company_id, kind, payload, input_ledger, is_current) values ('${cid}', 'promise', '{"promise":"${PROMISE}"}', '{}', true)`);
  return cid;
}
const marksOf = (cid: string) => psql(`select count(*) from first_read_marks where company_id='${cid}' and withdrawn_at is null`);
const versionsOf = (cid: string) => psql(`select coalesce(string_agg(n.version||':'||coalesce(n.disposition,'-'), ',' order by n.version), '') from first_read_mark_notes n join first_read_marks m on m.id=n.mark_id where m.company_id='${cid}'`);
const beatLabel = (page: Page) => page.locator(".fr-beat .fr-eyebrow").first();
async function goTo(page: Page, label: string) {
  for (let i = 0; i < 20; i++) {
    if ((await page.locator(".fr-beat").textContent())?.includes(label)) return;
    await page.keyboard.press("ArrowRight"); await page.waitForTimeout(150);
  }
  throw new Error(`beat ${label} not reached`);
}
async function closeBox(page: Page) { await page.mouse.click(5, 5); await page.waitForTimeout(600); }

test("marks: create / reopen / edit / disposition / What we heard / row_gone / withdraw on a throwaway company", async ({ page }) => {
  test.setTimeout(300_000);
  const cid = await plant(page);
  try {
    await openAs(page, cid, `/preview/client-refine/first-read/${cid}`);
    // (f) absent at 0 marks: End lands on the closer, no "What we heard" anywhere
    await page.keyboard.press("End"); await page.waitForTimeout(300);
    await expect(page.locator(".fr-beat")).toContainText("Before you go");
    await expect(page.locator("[data-fr-mark='heard']")).toHaveCount(0);
    await page.keyboard.press("Home"); await page.waitForTimeout(300);
    await goTo(page, "Questions this read raises");
    const q1 = page.locator("[data-fr-mark='target'][data-fr-mark-kind='question'][data-fr-mark-key='x7-q1']");
    const q2 = page.locator("[data-fr-mark='target'][data-fr-mark-kind='question'][data-fr-mark-key='x7-q2']");
    await expect(q1).toHaveCount(1); await expect(q2).toHaveCount(1);
    const box = page.locator("[data-fr-mark='box']");
    // (i) FM17: the hover cue on a markable row; none on the question number beside it
    await q2.hover();
    expect(await q2.evaluate((el) => { const c = getComputedStyle(el); return [c.cursor, c.outlineStyle, c.outlineWidth]; })).toEqual(["pointer", "solid", "1px"]);
    const num = page.locator("li:has([data-fr-mark-key='x7-q2']) .fr-question-num");
    await num.hover();
    expect(await num.evaluate((el) => [getComputedStyle(el).cursor, getComputedStyle(el).outlineStyle])).toEqual(["auto", "none"]);
    // (a) nothing preselected; an empty close writes nothing (motion on for (j), whichever project runs this)
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await q2.click();
    await expect(box).toHaveCount(1);
    await expect(box.locator("[data-fr-mark-choice]")).toHaveText(["Interesting", "Important", "Not important", "Stood out to us"]);
    for (const b of await box.locator("[data-fr-mark-choice]").all()) await expect(b).toHaveAttribute("aria-pressed", "false");
    await expect(box.locator("[data-fr-mark='close']")).toHaveAttribute("aria-label", "Close");
    // (j) FM20: the opening animation runs (150 ms) — and is off under reduced motion
    expect(await box.evaluate((el) => [el.getAttribute("data-fr-mark-motion"), getComputedStyle(el).animationName, getComputedStyle(el).animationDuration])).toEqual(["enter", "fr-mark-box-in", "0.15s"]);
    await closeBox(page);
    await expect(box).toHaveCount(0);
    expect(marksOf(cid)).toBe("0");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await q2.click();
    expect(await box.evaluate((el) => [el.getAttribute("data-fr-mark-motion"), getComputedStyle(el).animationName])).toEqual(["none", "none"]);
    await closeBox(page);
    expect(marksOf(cid)).toBe("0");
    // (b) picking Interesting with no note creates one mark (v1, NULL note); the row is highlighted
    await q1.click();
    await page.locator("[data-fr-mark-choice='interesting']").click();
    await expect(page.locator("[data-fr-mark-choice='interesting']")).toHaveAttribute("aria-pressed", "true");
    // (d) arrow keys / End inside the note never move the beat
    await page.locator("[data-fr-mark='note'][data-fr-mark-note-for='client_reaction']").focus();
    await page.keyboard.press("ArrowRight"); await page.keyboard.press("ArrowLeft"); await page.keyboard.press("End");
    await expect(page.locator(".fr-beat")).toContainText("Questions this read raises");
    await box.locator("[data-fr-mark='close']").click(); await page.waitForTimeout(600); // the x saves and closes
    await expect(box).toHaveCount(0);
    expect(marksOf(cid)).toBe("1"); expect(versionsOf(cid)).toBe("1:interesting");
    expect(psql(`select note is null from first_read_mark_notes n join first_read_marks m on m.id=n.mark_id where m.company_id='${cid}' and n.version=1`)).toBe("t");
    await expect(q1).toHaveAttribute("data-fr-marked", "client_reaction");
    await expect(q1.locator("[data-fr-mark-icon='client_reaction']")).toHaveCount(1);
    // reopen shows the choice pressed and an empty note; an unchanged close (outside) appends nothing
    await q1.click();
    await expect(page.locator("[data-fr-mark-choice='interesting']")).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("[data-fr-mark='note'][data-fr-mark-note-for='client_reaction']")).toHaveValue("");
    await expect(page.locator("[data-fr-mark='withdraw']")).toHaveText("Withdraw mark (permanent)");
    await closeBox(page);
    expect(versionsOf(cid)).toBe("1:interesting");
    // (c) typed text survives a choice switch; Escape saves → v2 (note + not_important)
    await q1.click();
    await page.locator("[data-fr-mark='note'][data-fr-mark-note-for='client_reaction']").fill("FIXTURE note v2");
    await page.locator("[data-fr-mark-choice='important']").click();
    await page.locator("[data-fr-mark-choice='not_important']").click();
    await expect(page.locator("[data-fr-mark='note'][data-fr-mark-note-for='client_reaction']")).toHaveValue("FIXTURE note v2");
    await page.locator("[data-fr-mark='note'][data-fr-mark-note-for='client_reaction']").press("Escape"); await page.waitForTimeout(600);
    await expect(box).toHaveCount(0);
    expect(versionsOf(cid)).toBe("1:interesting,2:not_important");
    expect(psql(`select note from first_read_mark_notes n join first_read_marks m on m.id=n.mark_id where m.company_id='${cid}' and n.version=2`)).toBe("FIXTURE note v2");
    // a disposition-only change closed by the x → v3 (note carried); then a no-change close → still 3
    await q1.click(); await page.locator("[data-fr-mark-choice='important']").click(); await box.locator("[data-fr-mark='close']").click(); await page.waitForTimeout(600);
    expect(versionsOf(cid)).toBe("1:interesting,2:not_important,3:important");
    expect(psql(`select note from first_read_mark_notes n join first_read_marks m on m.id=n.mark_id where m.company_id='${cid}' and n.version=3`)).toBe("FIXTURE note v2");
    await q1.click(); await closeBox(page);
    expect(versionsOf(cid)).toBe("1:interesting,2:not_important,3:important");
    await expect(page.getByText("FIXTURE note v2")).toHaveCount(0); // hidden until clicked
    // (e) the index: a second client_reaction on the same anchor is refused (still 1 mark)
    const dup = await page.evaluate(async (a) => { const s = (window as unknown as { supabase: Sb }).supabase; const { error } = await s.rpc("create_first_read_mark", { p_company_id: a.cid, p_kind: "client_reaction", p_disposition: "interesting", p_beat_key: "questions", p_anchor_kind: "question", p_anchor_key: "x7-q1", p_anchor_text: "x", p_anchor_text_sha256: "a".repeat(64), p_note: "dup" }); return error?.message ?? "no error"; }, { cid });
    expect(dup).toContain("first_read_marks_one_live_per_anchor");
    expect(marksOf(cid)).toBe("1");
    // (k) FM21: "Stood out to us" on the same row, with its own note → a second mark; two icons
    await q1.click();
    await expect(page.locator("[data-fr-mark='note'][data-fr-mark-note-for='our_mark']")).toHaveCount(0);
    await page.locator("[data-fr-mark-choice='our_mark']").click();
    await page.locator("[data-fr-mark='note'][data-fr-mark-note-for='our_mark']").fill("FIXTURE ours");
    await expect(page.locator("[data-fr-mark='note'][data-fr-mark-note-for='client_reaction']")).toHaveValue("FIXTURE note v2"); // untouched
    await closeBox(page);
    expect(marksOf(cid)).toBe("2");
    await expect(q1).toHaveAttribute("data-fr-marked", "client_reaction+our_mark");
    await expect(q1.locator("[data-fr-mark-icon]")).toHaveCount(2);
    // a row_gone mark and an offering-question mark whose key never fills (FM19), planted directly: only "What we heard" shows them
    psql(`insert into first_read_marks (company_id, kind, disposition, beat_key, anchor_kind, anchor_key, anchor_text, anchor_text_sha256, created_by) values ('${cid}', 'our_mark', null, 'questions', 'question', 'x7-gone', 'FIXTURE gone anchor', repeat('b',64), (select user_id from user_roles where role='admin' limit 1)), ('${cid}', 'client_reaction', 'important', 'questions', 'offering_question', 'offering:deadbeef', 'FIXTURE offering question', repeat('c',64), (select user_id from user_roles where role='admin' limit 1))`);
    psql(`insert into first_read_mark_notes (mark_id, version, note, disposition, created_by) select id, 1, 'FIXTURE gone note', disposition, created_by from first_read_marks where company_id='${cid}' and anchor_key in ('x7-gone','offering:deadbeef')`);
    await page.reload({ waitUntil: "networkidle" });
    await expect(page.locator(".first-read")).toBeVisible({ timeout: 60_000 });
    await goTo(page, "Questions this read raises");
    await expect(page.locator("[data-fr-mark='target'][data-fr-marked]")).toHaveCount(1); // only q1 highlights
    // (f) present at ≥1 mark, just before the closer
    await page.keyboard.press("End"); await page.waitForTimeout(300);
    await expect(page.locator(".fr-beat")).toContainText("Before you go");
    await page.keyboard.press("ArrowLeft"); await page.waitForTimeout(300);
    await expect(beatLabel(page)).toHaveText("What we heard");
    const heard = page.locator("[data-fr-mark='heard']");
    await expect(heard.locator("[data-fr-heard-group] .fr-eyebrow")).toHaveText(["Important", "Stood out to us"]); // Interesting / Not important absent
    await expect(heard.locator("[data-fr-heard-group='important'] [data-fr-heard-entry]")).toHaveCount(2);
    await expect(heard.locator("[data-fr-heard-group='important'] .fr-heard-anchor").first()).toHaveText(Q1);
    await expect(heard.locator("[data-fr-heard-group='important'] .fr-heard-note").first()).toHaveText("FIXTURE note v2");
    await expect(heard.locator("[data-fr-heard-group='important'] [data-fr-mark-state='row_gone'] .fr-heard-anchor")).toHaveText("FIXTURE offering question"); // FM19
    await expect(heard.locator("[data-fr-heard-group='our_mark'] [data-fr-heard-entry]")).toHaveCount(2);
    await expect(heard.locator("[data-fr-heard-group='our_mark'] [data-fr-mark-state='row_gone'] .fr-heard-anchor")).toHaveText("FIXTURE gone anchor");
    await expect(heard.locator("[data-fr-heard-group='our_mark'] [data-fr-mark-state='present'] .fr-heard-note")).toHaveText("FIXTURE ours");
    await heard.locator("[data-fr-heard-jump='questions']").first().click();
    await expect(page.locator(".fr-beat")).toContainText("Questions this read raises");
    // (g) withdraw per mark: the reaction first (ours stays), then ours; the planted two via RPC → beat disappears
    await q1.click(); await page.locator("[data-fr-mark='withdraw'][data-fr-mark-withdraw='client_reaction']").click();
    await expect(q1).toHaveAttribute("data-fr-marked", "our_mark");
    expect(marksOf(cid)).toBe("3");
    await q1.click(); await page.locator("[data-fr-mark='withdraw'][data-fr-mark-withdraw='our_mark']").click();
    await expect(q1).not.toHaveAttribute("data-fr-marked", /.+/);
    expect(marksOf(cid)).toBe("2");
    await page.keyboard.press("End"); await page.keyboard.press("ArrowLeft"); await page.waitForTimeout(300);
    await expect(heard.locator("[data-fr-heard-group='important'] [data-fr-heard-entry]")).toHaveCount(1);
    await page.evaluate(async (ids) => { const s = (window as unknown as { supabase: Sb }).supabase; for (const id of ids) await s.rpc("withdraw_first_read_mark", { p_mark_id: id, p_reason: "operator_withdrew_mark" }); }, psql(`select string_agg(id::text, ',') from first_read_marks where company_id='${cid}' and withdrawn_at is null`).split(","));
    await page.reload({ waitUntil: "networkidle" });
    await expect(page.locator(".first-read")).toBeVisible({ timeout: 60_000 });
    await page.keyboard.press("End"); await page.waitForTimeout(300);
    await expect(page.locator("[data-fr-mark='heard']")).toHaveCount(0);
    expect(marksOf(cid)).toBe("0");
    expect(psql(`select count(*) from integrity_runs where company_id='${cid}' and component='first_read_mark_withdrawn'`)).toBe("4");
  } finally {
    psql(`delete from public_reads where company_id='${cid}'`); // no cascade on that FK — the promise read goes first
    const gone = await page.evaluate(async (c) => { const s = (window as unknown as { supabase: Sb }).supabase; const { error } = await s.from("companies").delete().eq("id", c); const { data } = await s.from("companies").select("id").eq("id", c).maybeSingle(); return { error: error?.message ?? null, stillThere: Boolean(data) }; }, cid);
    expect(gone).toEqual({ error: null, stillThere: false });
    expect(psql(`select count(*) from first_read_marks where company_id='${cid}'`)).toBe("0");
  }
});

test("(h) an existing control keeps its behaviour: Edgewood's folded-list toggle expands, no box opens, nothing written", async ({ page }) => {
  test.setTimeout(120_000);
  const before = psql(`select count(*) from first_read_marks`);
  await openAs(page, COMPANY_ID, `/preview/client-refine/first-read/${COMPANY_ID}`);
  await goTo(page, "What the world sees and says");
  const toggle = page.locator("button[aria-controls='fr-further-signals']");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("#fr-further-signals li").first()).toBeVisible();
  await expect(page.locator("[data-fr-mark='box']")).toHaveCount(0);
  // an operator control INSIDE a marked row (a gap pair's Strike): the reason prompt opens, no mark box opens
  await page.locator("[data-fr-operator-switch]").click();
  await goTo(page, "Where the two readings disagree");
  const inRow = page.locator("[data-fr-mark='target'] button[data-fr-operator='relevance-controls']").first();
  await expect(inRow).toBeVisible({ timeout: 15_000 });
  await inRow.click();
  await expect(page.locator("[data-fr-operator='relevance-controls'] input").first()).toBeVisible();
  await expect(page.locator("[data-fr-mark='box']")).toHaveCount(0);
  expect(psql(`select count(*) from first_read_marks`)).toBe(before);
});
