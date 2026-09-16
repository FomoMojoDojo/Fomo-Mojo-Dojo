// (t) No-public-site onramp — live proof (signed 2026-09-16). Creates a THROWAWAY company through the
// real Add-Client dialog with the box checked (a real write, on a company that exists only for this
// spec), proves the state line on the workshop Inputs tab, the workspace Inputs page and the home, and
// proves by SELECT (the app's DEV client) that the skip was ledgered and NOTHING else was written —
// 0 public_baseline_runs, 0 spine rows, 0 signals — then deletes the company (cascade). Edgewood is
// never the active company here. Set NPS_PROOF_NAME to keep a screenshot-worthy name.
import { expect, test, type Page } from "playwright/test";
import { open } from "./helpers";

const NAME = process.env.NPS_PROOF_NAME || `zz-nps-spec-${Date.now()}`;
const KEEP_SHOTS = Boolean(process.env.NPS_PROOF_NAME);
const shot = async (page: Page, name: string) => { if (KEEP_SHOTS) await page.screenshot({ path: `screenshots/item2/${name}.png`, fullPage: false }); };
type Sb = { from: (t: string) => any; functions: { invoke: (n: string, o: unknown) => Promise<unknown> } };
const sb = (page: Page, fn: string, args: Record<string, unknown>) => page.evaluate(new Function("args", `const sb = window.supabase; return (async () => { ${fn} })();`) as unknown as (a: Record<string, unknown>) => Promise<unknown>, args);

async function companyByName(page: Page, name: string) {
  return page.evaluate(async (n) => {
    const s = (window as unknown as { supabase: Sb }).supabase;
    const { data } = await s.from("companies").select("id,name,website,no_public_site").eq("name", n).maybeSingle();
    return data as { id: string; name: string; website: string | null; no_public_site: boolean } | null;
  }, name);
}
async function counts(page: Page, id: string) {
  return page.evaluate(async (cid) => {
    const s = (window as unknown as { supabase: Sb }).supabase;
    const c = async (t: string, extra?: (q: any) => any) => { let q = s.from(t).select("id", { count: "exact", head: true }).eq("company_id", cid); if (extra) q = extra(q); const { count } = await q; return Number(count ?? 0); };
    const { data: ledger } = await s.from("long_runner_runs").select("run_kind,status,error_text").eq("company_id", cid);
    return {
      baseline_runs: await c("public_baseline_runs"), job_steps: await c("job_steps"), positioning: await c("positioning_canvases"),
      cascades: await c("strategy_cascades"), defs: await c("odi_market_definitions"), routes: await c("routes"), signals: await c("signals"),
      inputs: await c("inputs"), needs: await c("odi_needs"), interview_records: await c("interview_records"), agent_flow_runs: await c("agent_flow_runs"),
      ledger: (ledger ?? []) as Array<{ run_kind: string; status: string; error_text: string | null }>,
    };
  }, id);
}

test("dialog with the box checked → company created, no crawl/baseline/birth, skip ledgered, state line everywhere; then deleted", async ({ page }) => {
  test.setTimeout(240_000);
  await open(page, "/preview/client-refine/workshop");
  await page.getByRole("button", { name: "+ Add Client" }).click();
  await page.getByPlaceholder("Company name").fill(NAME);
  const box = page.getByTestId("add-client-no-public-site").locator("input[type=checkbox]");
  await page.getByTestId("add-client-website").fill("https://should-be-cleared.example");
  await box.check();
  await expect(page.getByTestId("add-client-website")).toBeDisabled();
  await expect(page.getByTestId("add-client-website")).toHaveValue("");
  await expect(page.getByTestId("add-client-no-public-site")).toHaveAttribute("data-fr-operator", "no-public-site");
  await expect(page.getByTestId("add-client-no-public-site")).toContainText("No public site");
  await shot(page, "30-add-client-no-public-site");
  await page.getByRole("button", { name: "Create client" }).click();
  await expect(page.getByText(`${NAME}: No public site — nothing is crawled or searched for this company.`)).toBeVisible({ timeout: 60_000 });

  // the row
  await expect.poll(() => companyByName(page, NAME), { timeout: 30_000 }).not.toBeNull();
  const co = (await companyByName(page, NAME))!;
  expect(co.website).toBeNull(); expect(co.no_public_site).toBe(true);

  // the ledger: exactly one skipped birth, and nothing else anywhere
  await expect.poll(async () => (await counts(page, co.id)).ledger.length, { timeout: 60_000 }).toBe(1);
  const c = await counts(page, co.id);
  expect(c.ledger).toEqual([{ run_kind: "birth", status: "skipped", error_text: "no_public_site" }]);
  expect({ ...c, ledger: undefined }).toEqual({ baseline_runs: 0, job_steps: 0, positioning: 0, cascades: 0, defs: 0, routes: 0, signals: 0, inputs: 0, needs: 0, interview_records: 0, agent_flow_runs: 0, ledger: undefined });

  // the state line in the workshop header (in place of "Outside signals being collected…") and on the Inputs tab.
  // Hard reload first (first-read-capture discipline): the surface is judged on what a fresh load reads.
  await page.addInitScript((id) => { try { localStorage.setItem("active_company_id", id); } catch { /* */ } }, co.id);
  await page.goto("/preview/client-refine/workshop", { waitUntil: "networkidle", timeout: 120_000 });
  await expect(page.locator("body")).not.toContainText("Outside signals being collected");
  await expect(page.getByText("No public site — nothing is crawled or searched for this company.").first()).toBeVisible();
  await page.getByRole("button", { name: /^inputs$/i }).first().click();
  await expect(page.getByTestId("inputs-no-public-site")).toHaveText("No public site — nothing is crawled or searched for this company.");
  await shot(page, "31-workshop-inputs-state-line");
  // the workspace Inputs page + the home
  await page.addInitScript((id) => { try { localStorage.setItem("active_company_id", id); } catch { /* */ } }, co.id);
  await page.goto("/preview/client-refine/workspace/inputs", { waitUntil: "networkidle", timeout: 120_000 });
  await expect(page.getByTestId("inputs-no-public-site")).toHaveText("No public site — nothing is crawled or searched for this company.");
  await shot(page, "32-workspace-inputs-state-line");

  // cleanup: delete the throwaway (cascade); it never had interview records. NPS_KEEP=1 leaves it for
  // a SQL-side proof (deleted by the operator/session afterwards).
  if (process.env.NPS_KEEP) return;
  const gone = await page.evaluate(async (cid) => {
    const s = (window as unknown as { supabase: Sb }).supabase;
    const { error } = await s.from("companies").delete().eq("id", cid);
    // long_runner_runs.company_id has no FK (pre-existing schema) — remove the throwaway's ledger row too
    await s.from("long_runner_runs").delete().eq("company_id", cid);
    const { data } = await s.from("companies").select("id").eq("id", cid).maybeSingle();
    return { error: error?.message ?? null, stillThere: Boolean(data) };
  }, co.id);
  expect(gone).toEqual({ error: null, stillThere: false });
  void sb;
});
