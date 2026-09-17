// (u) Evidence presence (signed 2026-09-16) — live proof on a THROWAWAY flagged company. Created through
// the real Add-Client dialog with "No public site" checked: the birth is skipped and the server writes
// the ONE persisted record (integrity_runs 'evidence_presence' → none). Then, from that record and
// nothing else, every client-visible score / projection / progress narrative is withheld: the home
// (no compass, no SCORE meta, no NEXT badge, no foundation sentence), the workshop header (no
// ScoreContextBar, no posture word) and the workspace Routes band — the signed note in their place.
// SELECT proves the record; a write-guard proves the reads write nothing; the company is deleted after.
import { expect, test, type Page } from "playwright/test";
import { open } from "./helpers";

const NAME = process.env.NE_PROOF_NAME || `zz-noev-spec-${Date.now()}`;
const KEEP_SHOTS = Boolean(process.env.NE_PROOF_NAME);
const NOTE = "Not enough public signal to score yet.";
const shot = async (page: Page, name: string) => { if (KEEP_SHOTS) await page.screenshot({ path: `screenshots/item2/${name}.png`, fullPage: false }); };
type Sb = { from: (t: string) => any };

async function companyByName(page: Page, name: string) {
  return page.evaluate(async (n) => {
    const s = (window as unknown as { supabase: Sb }).supabase;
    const { data } = await s.from("companies").select("id,name,no_public_site,mojo_score").eq("name", n).maybeSingle();
    return data as { id: string; name: string; no_public_site: boolean; mojo_score: number | null } | null;
  }, name);
}
async function presenceRecords(page: Page, id: string) {
  return page.evaluate(async (cid) => {
    const s = (window as unknown as { supabase: Sb }).supabase;
    const { data } = await s.from("integrity_runs").select("component,status,excluded_by_rule,run_ref").eq("company_id", cid).eq("component", "evidence_presence").order("ran_at", { ascending: false });
    const { count } = await s.from("mojo_scores").select("id", { count: "exact", head: true }).eq("company_id", cid);
    return { rows: (data ?? []) as Array<{ component: string; status: string; excluded_by_rule: { state: string; previous: string | null }; run_ref: string }>, mojo_scores: Number(count ?? 0) };
  }, id);
}
async function guardNoWrites(page: Page): Promise<string[]> {
  const writes: string[] = [];
  await page.route(/\/(rest|storage|functions)\/v1\//, async (route) => {
    const m = route.request().method();
    if (m === "GET" || m === "HEAD" || m === "OPTIONS") return route.continue();
    // PostgREST calls STABLE (read-only) functions over POST; find_primary_finding is one (provolatile = s).
    if (/\/rest\/v1\/rpc\/find_primary_finding/.test(route.request().url())) return route.continue();
    writes.push(`${m} ${route.request().url()}`);
    return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });
  return writes;
}
const pin = (page: Page, id: string) => page.addInitScript((cid) => { try { localStorage.setItem("active_company_id", cid); } catch { /* */ } }, id);

test("flagged throwaway → evidence_presence none recorded by the server; home / workshop header / workspace routes show the note and no numbers; then deleted", async ({ page }) => {
  test.setTimeout(240_000);
  await open(page, "/preview/client-refine/workshop");
  await page.getByRole("button", { name: "+ Add Client" }).click();
  await page.getByPlaceholder("Company name").fill(NAME);
  await page.getByTestId("add-client-no-public-site").locator("input[type=checkbox]").check();
  await page.getByRole("button", { name: "Create client" }).click();
  await expect(page.getByText(`${NAME}: No public site — the outside read runs on the name only.`)).toBeVisible({ timeout: 60_000 });
  await expect.poll(() => companyByName(page, NAME), { timeout: 30_000 }).not.toBeNull();
  const co = (await companyByName(page, NAME))!;
  expect(co.no_public_site).toBe(true);
  expect(co.mojo_score).toBeNull();

  // the record — written by the server's skipped-birth terminal, exactly one row, state none
  await expect.poll(async () => (await presenceRecords(page, co.id)).rows.length, { timeout: 60_000 }).toBe(1);
  const rec = await presenceRecords(page, co.id);
  expect(rec.rows[0]).toMatchObject({ component: "evidence_presence", status: "completed", excluded_by_rule: { state: "none", previous: null }, run_ref: "birth:skipped_no_public_site" });
  expect(rec.mojo_scores).toBe(0);

  // the home — from the record: no compass, no SCORE meta, no NEXT badge, no foundation narrative
  const writes = await guardNoWrites(page);
  await pin(page, co.id);
  await page.goto("/preview/client-refine/home", { waitUntil: "networkidle", timeout: 120_000 });
  const home = page.getByTestId("home-fr");
  await expect(home).toBeVisible({ timeout: 60_000 });
  await expect(home).toHaveAttribute("data-evidence-presence", "none");
  await expect(page.getByTestId("fr-hscale")).toHaveCount(0);
  await expect(page.getByTestId("home-compass-note")).toHaveText(NOTE);
  await expect(page.getByTestId("home-no-evidence-note")).toHaveText(NOTE);
  const ctx = await page.getByTestId("home-context").innerText();
  expect(ctx).not.toMatch(/SCORE|FOUNDATION|MINIMAL/);
  expect(ctx).toMatch(/DAY /);
  const body = await page.locator("body").innerText();
  for (const s of ["CURRENT ·", "REACHABLE ·", "DESTINATION ·", "NEXT:", "+", "PTS"]) expect(body, `home shows ${s}`).not.toContain(s === "+" ? "+0 PTS" : s);
  await shot(page, "40-home-no-evidence");

  // the workshop header — no ScoreContextBar, no posture word; the note
  await pin(page, co.id);
  await page.goto("/preview/client-refine/workshop", { waitUntil: "networkidle", timeout: 120_000 });
  await expect(page.getByTestId("workshop-no-evidence-note")).toHaveText(NOTE, { timeout: 60_000 });
  await expect(page.locator(".crpv-r-stat-bar")).toHaveCount(0);
  // the posture word lives only in the bar's Readiness cell (.crpv-r-stat-val over "Readiness"); the
  // field-condition band ("OUTSIDE VIEW · DIRECTIONAL READ ONLY …") is honest and stays — not asserted against.
  await expect(page.locator(".crpv-r-stat-lbl")).toHaveCount(0);
  const wsBody = await page.locator("body").innerText();
  for (const s of ["Directional readiness", "Insufficient readiness", "Reachable now", "Unlockable", "Readiness"]) expect(wsBody, `workshop shows ${s}`).not.toContain(s);
  await shot(page, "41-workshop-header-no-evidence");

  // the workspace Routes band — the note, no Now / Reachable / Ceiling
  await pin(page, co.id);
  await page.goto("/preview/client-refine/workspace/routes", { waitUntil: "networkidle", timeout: 120_000 });
  await expect(page.getByTestId("routes-no-evidence-note")).toHaveText(NOTE, { timeout: 60_000 });
  await expect(page.getByTestId("routes-scorestrip")).toHaveCount(0);
  await shot(page, "42-workspace-routes-no-evidence");
  expect(writes).toEqual([]); // the three reads wrote nothing
  await page.unroute(/\/(rest|storage|functions)\/v1\//);

  // cleanup: delete the throwaway (integrity_runs cascades); long_runner_runs has no FK (pre-existing)
  if (process.env.NE_KEEP) return;
  const gone = await page.evaluate(async (cid) => {
    const s = (window as unknown as { supabase: Sb }).supabase;
    const { error } = await s.from("companies").delete().eq("id", cid);
    await s.from("long_runner_runs").delete().eq("company_id", cid);
    const { data } = await s.from("companies").select("id").eq("id", cid).maybeSingle();
    return { error: error?.message ?? null, stillThere: Boolean(data) };
  }, co.id);
  expect(gone).toEqual({ error: null, stillThere: false });
});
