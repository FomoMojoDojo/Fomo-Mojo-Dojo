// (u) Evidence presence (signed 2026-09-16) — live proof on a THROWAWAY flagged company. Created through
// the real Add-Client dialog with "No public site" checked: the birth is skipped and the server writes
// the ONE persisted record (integrity_runs 'evidence_presence' → none). Then, from that record and
// nothing else, every client-visible score / projection / progress narrative is withheld: the home
// (no compass, no SCORE meta, no NEXT badge, no foundation sentence), the workshop header (no
// ScoreContextBar, no posture word) and the workspace Routes band — the signed note in their place.
// SELECT proves the record; a write-guard proves the reads write nothing; the company is deleted after.
// 2026-09-17: extended — the workshop header shows the field-condition band ALONE on none, and the Inputs tab under
// a stubbed search_unavailable run shows the signed outage line and a disabled spine control.
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
  // 2026-09-17: the header shows the field-condition band ALONE on none — no note line above it, no bar.
  await expect(page.getByTestId("workshop-field-condition")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("workshop-no-evidence-note")).toHaveCount(0);
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

  // ── SRCH-1 on the Inputs tab (2026-09-17): a search OUTAGE is not a failed run and not evidence. The outage run
  // is STUBBED at the network layer (these tables are SELECT-only under RLS; nothing is written): the latest
  // public_baseline_runs row carries result_json.status = search_unavailable and its ledger pair is `failed`
  // with the refusal text. From that: header band only, lineage line = the signed string, spine control disabled.
  const nowIso = new Date().toISOString();
  const PID = "11111111-1111-4111-8111-111111111111";
  const outageText = "Search backend unavailable — no engine returned results for any of 6 queries (brave: too many requests). No public evidence could be checked; this is not a finding about the company.";
  const writes2 = await guardNoWrites(page); // registered FIRST so the read-stubs below take precedence (last route wins)
  await page.route(/\/rest\/v1\/public_baseline_runs\?/, (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([
    { id: 999999, created_at: nowIso, company_id: co.id, company_name: NAME, website: null, sources_json: null, plan_kind: "name_only",
      result_json: { status: "search_unavailable", data_quality_flag: { type: "search_unavailable" } } },
  ]) }));
  await page.route(/\/rest\/v1\/long_runner_runs\?/, (route) => {
    const url = route.request().url();
    const rows = /run_kind=eq\.full_refresh/.test(url)
      ? [{ id: PID }]
      : /or=/.test(url)
        ? [
          { id: PID, run_kind: "full_refresh", status: "failed", error_text: outageText, finished_at: nowIso },
          { id: "22222222-2222-4222-8222-222222222222", run_kind: "public_baseline", status: "failed", error_text: outageText, finished_at: nowIso },
        ]
        : [];
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(rows) });
  });
  await pin(page, co.id);
  await page.goto("/preview/client-refine/workshop?tab=inputs", { waitUntil: "networkidle", timeout: 120_000 });
  await expect(page.getByTestId("workshop-field-condition")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("workshop-no-evidence-note")).toHaveCount(0);
  const dateLabel = new Date(nowIso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const SIGNED = `Search couldn't be reached — nothing was checked · ${dateLabel}`;
  await expect(page.getByTestId("inputs-lineage-run")).toHaveText(SIGNED, { timeout: 60_000 });
  await expect(page.getByTestId("inputs-lineage-run")).toHaveAttribute("data-fr-state", "search-unavailable");
  await expect(page.getByTestId("inputs-refresh-state")).toHaveText(SIGNED, { timeout: 60_000 });
  await expect(page.getByTestId("inputs-refresh-state")).toHaveAttribute("data-fr-stage", "search_unavailable");
  expect(await page.locator("body").innerText()).not.toContain("Outside-signal refresh failed");
  const spine = page.getByTestId("inputs-build-spine");
  await expect(spine).toBeVisible({ timeout: 60_000 });
  await expect(spine).toBeDisabled();
  await expect(spine).toHaveAttribute("data-fr-evidence", "none");
  await expect(spine).toHaveAttribute("title", "Run outside signals first — the spine is built from that evidence.");
  await shot(page, "43-workshop-inputs-search-unavailable");
  expect(writes2).toEqual([]);
  await page.unroute(/\/(rest|storage|functions)\/v1\//);
  await page.unroute(/\/rest\/v1\/public_baseline_runs\?/);
  await page.unroute(/\/rest\/v1\/long_runner_runs\?/);

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
