// (FM9, commit 3 of 4, 2026-09-22) The admin-only marks list on workspace Inputs, against the REAL stack —
// no stub on first_read_marks / first_read_mark_notes. Fixture: bob2 (admin) creates a throwaway company
// through the DEV window.supabase and four marks are planted with psql (throwaway strings, never a transcript);
// everything cascades with the company. Edgewood is READ ONLY here — the Edgewood leg writes nothing and
// asserts only the invariant that holds whatever marks the operator happens to hold there. Proves:
//   (a) switch OFF: no marks block at all, and the page issues no operator node;
//   (b) switch ON: the block renders under "What we heard" with the groups in HEARD_GROUP_ORDER
//       (Important · Interesting · Not important · Stood out to us), empty groups absent;
//   (c) every entry carries the anchored text AS MARKED, its latest note when it has one (and no note line
//       when it does not), and a link whose label is the beat's own nav label;
//   (d) the link points at the first read of the mark's company with ?mark=<anchor_kind|anchor_key>;
//   (e) order inside a group is beat order then created_at;
//   (f) Edgewood: OFF ⇒ absent; ON ⇒ present exactly when the company holds live marks. Nothing is written.
//   (g) Edgewood: the four header numbers are identical with the list absent and with it mounted.
import { execFileSync } from "node:child_process";
import { expect, test, type Page } from "playwright/test";
import { COMPANY_ID } from "../../playwright.config";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = { from: (t: string) => any; auth: { getUser: () => Promise<{ data: { user: { id: string } | null } }> } };
const PGC = process.env.PGC || "supabase_db_dzlgyxcvuwiulgifbmew";
const psql = (sql: string) => execFileSync("docker", ["exec", "-i", PGC, "psql", "-U", "postgres", "-d", "postgres", "-At", "-q", "-v", "ON_ERROR_STOP=1", "-c", sql], { encoding: "utf8" }).trim().split("\n")[0];
const ADMIN = "(select user_id from user_roles where role='admin' limit 1)";

// Four marks. "gap" reads before "findings" in BEATS, so the two Important entries prove beat order; the
// Not important group is deliberately empty, so its eyebrow must not render.
const M_IMPORTANT_LATE = "FIXTURE anchor — the later Important row";
const M_IMPORTANT_EARLY = "FIXTURE anchor — the earlier Important row";
const M_INTERESTING = "FIXTURE anchor — the Interesting row";
const M_OURS = "FIXTURE anchor — the row that stood out";
const NOTE_IMPORTANT_EARLY = "FIXTURE note on the earlier Important row";
const NOTE_OURS = "FIXTURE note on our own mark";

async function openWs(page: Page, companyId: string, segment: string) {
  await page.addInitScript((id) => { try { localStorage.setItem("active_company_id", id); } catch { /* no storage */ } }, companyId);
  await page.goto(`/preview/client-refine/workspace/${segment}`, { waitUntil: "networkidle", timeout: 120_000 });
  await expect(page.getByTestId("workspace-root")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("workspace-stage")).toBeVisible();
}
async function operatorOn(page: Page) {
  await page.locator("[data-fr-operator-switch]").click();
  await expect(page.locator("[data-fr-operator-switch]")).toHaveAttribute("data-fr-operator-switch", "on");
}
async function plant(page: Page): Promise<string> {
  await page.goto("/preview/client-refine/workshop", { waitUntil: "networkidle", timeout: 120_000 });
  const planted = await page.evaluate(async (name) => {
    const s = (window as unknown as { supabase: Sb }).supabase;
    const { data: { user } } = await s.auth.getUser();
    const { data: co, error } = await s.from("companies").insert({ name, created_by: user!.id, no_public_site: true }).select("id").single();
    if (error) return { error: error.message };
    return { cid: (co as { id: string }).id };
  }, `zz-inputs-marks-${Date.now()}`);
  expect(planted.error ?? null).toBeNull();
  const cid = planted.cid!;
  // created_at is stamped in insertion order so the two Important marks also pin the within-beat tiebreak.
  psql(`insert into first_read_marks (company_id, kind, disposition, beat_key, anchor_kind, anchor_key, anchor_text, anchor_text_sha256, created_by) values
    ('${cid}','client_reaction','important','findings','finding','fm9-late','${M_IMPORTANT_LATE}',repeat('a',64),${ADMIN}),
    ('${cid}','client_reaction','important','gap','gap_statement','fm9-early','${M_IMPORTANT_EARLY}',repeat('b',64),${ADMIN}),
    ('${cid}','client_reaction','interesting','yousay','own_words','fm9-interesting','${M_INTERESTING}',repeat('c',64),${ADMIN}),
    ('${cid}','our_mark',null,'serve','market','fm9-ours','${M_OURS}',repeat('d',64),${ADMIN})`);
  psql(`insert into first_read_mark_notes (mark_id, version, note, disposition, created_by) select id, 1, case anchor_key when 'fm9-early' then '${NOTE_IMPORTANT_EARLY}' when 'fm9-ours' then '${NOTE_OURS}' else null end, disposition, created_by from first_read_marks where company_id='${cid}'`);
  return cid;
}
/** The four header numbers: evidence files · customer tensions mapped · directional routes · assigned. */
async function counters(page: Page): Promise<string[]> {
  const nums = await page.locator("[data-testid=inputs-counters] b").allTextContents();
  const assigned = await page.getByTestId("inputs-assigned").count() ? await page.getByTestId("inputs-assigned").textContent() : "-";
  return [...nums, String(assigned)];
}
const dropCompany = (cid: string) => psql(`delete from companies where id='${cid}'`);

test("(a-e) the marks list: gated only, groups in the signed order, anchored text, note, beat link", async ({ page }) => {
  const cid = await plant(page);
  try {
    await openWs(page, cid, "inputs");
    // (a) switch OFF — no block, no operator node anywhere on the page
    await expect(page.getByTestId("inputs-marks")).toHaveCount(0);
    await expect(page.locator("[data-fr-operator]")).toHaveCount(0);

    // (b) switch ON — the block, titled with the beat's own words
    await operatorOn(page);
    const block = page.getByTestId("inputs-marks");
    await expect(block).toBeVisible();
    await expect(block.getByTestId("inputs-marks-title")).toHaveText("What we heard");
    await expect(block).toHaveAttribute("data-fr-operator", "marks");
    expect(await block.locator("[data-fr-heard-group]").evaluateAll((ns) => ns.map((n) => n.getAttribute("data-fr-heard-group"))))
      .toEqual(["important", "interesting", "our_mark"]); // not_important is empty ⇒ absent
    expect(await block.locator("[data-fr-heard-group] > .fr-eyebrow").allTextContents())
      .toEqual(["Important", "Interesting", "Stood out to us"]);

    // (c)+(e) entries: anchored text as marked, beat order then created_at inside the group
    expect(await block.locator(".fr-heard-anchor").allTextContents())
      .toEqual([M_IMPORTANT_EARLY, M_IMPORTANT_LATE, M_INTERESTING, M_OURS]);
    const early = block.locator(".fr-heard-entry").nth(0);
    await expect(early.locator(".fr-heard-note")).toHaveText(NOTE_IMPORTANT_EARLY);
    await expect(block.locator(".fr-heard-entry").nth(1).locator(".fr-heard-note")).toHaveCount(0); // no note ⇒ no line
    await expect(block.locator(".fr-heard-entry").nth(3).locator(".fr-heard-note")).toHaveText(NOTE_OURS);

    // (c) link label = the beat's own nav label; (d) href = the first read + the carrier
    expect(await block.getByTestId("inputs-marks-link").allTextContents())
      .toEqual(["The gap", "What stands out", "What you say", "Who you serve"]);
    await expect(early.getByTestId("inputs-marks-link"))
      .toHaveAttribute("href", `/preview/client-refine/first-read/${cid}?mark=${encodeURIComponent("gap_statement|fm9-early")}`);
  } finally {
    dropCompany(cid);
  }
});

test("(f) Edgewood, read only: OFF ⇒ no block; ON ⇒ the block exactly when live marks are held", async ({ page }) => {
  const before = psql(`select count(*) from first_read_marks where company_id='${COMPANY_ID}'`);
  const live = Number(psql(`select count(*) from first_read_marks where company_id='${COMPANY_ID}' and withdrawn_at is null`));
  await openWs(page, COMPANY_ID, "inputs");
  await expect(page.getByTestId("inputs-marks")).toHaveCount(0);
  const countsOff = await counters(page);
  await operatorOn(page);
  await expect(page.getByTestId("inputs-marks")).toHaveCount(live > 0 ? 1 : 0);
  if (live > 0) await expect(page.getByTestId("inputs-marks-entry")).toHaveCount(live);
  // (g) the four header numbers are what they were before the list mounted — the list is outside every count
  expect(await counters(page)).toEqual(countsOff);
  // nothing was written on the way through
  expect(psql(`select count(*) from first_read_marks where company_id='${COMPANY_ID}'`)).toBe(before);
});
