// (w) Interview capture on the Job Map — ruling I7 part (signed 2026-09-19): the "Record interview
// finding" control LEFT the job-map step panel (and the unmapped-market header row). The component
// (InterviewCaptureForm) and the function (record-interview-finding) are kept and return later on the
// interview page — their propose/save/refusal proofs live at the component level
// (src/views/client/workspace/InterviewCaptureForm.test.tsx, src/hooks/useRecordInterviewFinding.test.ts).
// The gate-4 page proofs this spec carried (signed 2026-09-16: form → propose → edit → save → row with
// its chip; the funder no_step refusal inline) are superseded for the job map by I7 and will be re-cut
// for the interview page when it lands. Here: the control is ABSENT with the glyph on, on the mapped
// customer set and on a mapped funder set and on an unmapped market; nothing is written; the function
// is never called from this page.
import { expect, test, type Page, type Route } from "playwright/test";
import { openWorkspace } from "./helpers";

const SUPABASE = /\/(rest|storage|functions)\/v1\//;
const FN = /\/functions\/v1\/record-interview-finding/;
type State = { fnCalls: number; writes: string[] };

async function guard(page: Page, s: State) {
  await page.route(SUPABASE, async (route: Route) => {
    const req = route.request(); const method = req.method(); const url = req.url();
    if (method === "GET" || method === "HEAD" || method === "OPTIONS") return route.continue();
    if (FN.test(url)) s.fnCalls += 1;
    s.writes.push(`${method} ${url}`);
    return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });
}
async function operatorOn(page: Page) {
  await page.locator("[data-fr-operator-switch]").click();
  await expect(page.locator("[data-fr-operator-switch]")).toHaveAttribute("data-fr-operator-switch", "on");
}
async function expectNoCaptureControl(page: Page) {
  await expect(page.getByTestId("jobmap-capture-toggle")).toHaveCount(0);
  await expect(page.locator("[data-fr-operator=record-interview-finding]")).toHaveCount(0);
  await expect(page.locator("[data-fr-operator=record-interview-finding-form]")).toHaveCount(0);
  await expect(page.getByTestId("interview-capture")).toHaveCount(0);
  await expect(page.getByText("Record interview finding")).toHaveCount(0);
}
const shot = (page: Page, name: string) => page.screenshot({ path: `screenshots/item2/${name}.png`, fullPage: false });

test("I7: the step panel carries no capture control — customer set, glyph off then on; the other step-panel controls are still there", async ({ page }) => {
  const s: State = { fnCalls: 0, writes: [] };
  await guard(page, s);
  await openWorkspace(page, "job-map", "?view=customer");
  await expect(page.getByTestId("jobmap-stage")).toBeVisible();
  await expectNoCaptureControl(page);
  await operatorOn(page);
  await expect(page.getByTestId("jobmap-evidence-toggle")).toBeVisible(); // the panel's remaining operator control
  await expectNoCaptureControl(page);
  await page.locator("[data-fr-stage-index='2']").click();
  await expect(page.getByTestId("jobmap-stage")).toHaveAttribute("data-fr-step", "3");
  await expectNoCaptureControl(page);
  await shot(page, "60-no-capture-control-customer");
  expect(s.fnCalls).toBe(0);
  expect(s.writes).toEqual([]);
});

test("I7: no capture control on a mapped funder set nor in the header row of an unmapped market (glyph on)", async ({ page }) => {
  const s: State = { fnCalls: 0, writes: [] };
  await guard(page, s);
  await openWorkspace(page, "job-map");
  await operatorOn(page);
  await page.getByTestId("jobmap-switcher-open").click();
  const mappedMarket = page.locator('[data-testid=jobmap-switcher-option][data-fr-mapped="true"]:not([data-fr-set-key="customer"]):not([data-fr-set-key="internal"])').first();
  if (await mappedMarket.count()) {
    await mappedMarket.click();
    await expect(page.getByTestId("jobmap-stage")).toBeVisible();
    await expectNoCaptureControl(page);
    await page.getByTestId("jobmap-switcher-open").click();
  }
  const unmapped = page.locator('[data-testid=jobmap-switcher-option][data-fr-mapped="false"]').first();
  await unmapped.click();
  await expect(page.getByTestId("jobmap-stage")).toHaveCount(0);
  await expect(page.getByTestId("jobmap-generate")).toBeVisible(); // the ONE control of the market door stays
  await expectNoCaptureControl(page);
  await shot(page, "63-no-capture-control-unmapped");
  expect(s.fnCalls).toBe(0);
  expect(s.writes).toEqual([]);
});
