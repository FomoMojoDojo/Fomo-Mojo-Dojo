// ── THE TWO DOORS INTO DIAGNOSE (S1–S3 / T1–T4, signed Nov 9 2026) ─────────────────────────────
//
// ONE PREDICATE DECIDES BOTH. src/lib/diagnoseRunning.ts says a company has Diagnose running when
// it has a live input_file (archived_at null, via inputs.company_id) or a live interview_record
// (retracted_at null). Edgewood has both; Wasabi has neither. EVERY assertion below is that one
// fact seen from a different surface, which is why the predicate needs no separate unit test: a
// mocked one would prove the arithmetic and none of the query, the RLS or the wiring.
//
// THE CLEAN COMPANY IS THE POINT. A link that renders for everyone is not gated, and a test that
// only ever looks at the company where it should appear cannot tell the difference. Each test
// checks BOTH companies, and the front-door one also asserts Wasabi's row is present with its two
// unconditional links — so an absent Diagnose link means "the predicate said no", never "the row
// was not there".
import { expect, test, type Page } from "playwright/test";
import { COMPANY_ID } from "../../playwright.config";

const CLEAN_COMPANY_ID = process.env.FR_CLEAN_COMPANY_ID || "7d4d0202-9573-43e1-ad60-64948720ed7f";

async function openFirstRead(page: Page, companyId: string) {
  await page.goto(`/preview/client-refine/first-read/${companyId}`, {
    waitUntil: "networkidle", timeout: 180_000,
  });
  await page.waitForSelector(".first-read", { timeout: 60_000 });
}

/** The closer beat ("next", label "Next move") — the one that already names Diagnose. Reached by
 *  its own progress tick, which is how a reader reaches it. */
async function goToCloserBeat(page: Page) {
  await page.getByRole("listitem", { name: "Next move" }).click();
  await page.waitForTimeout(400);
}

// ── T1 · the front door's fourth link ─────────────────────────────────────────────────────────
test("(u1) the front door shows Diagnose on the running company's row, and on no other", async ({ page }) => {
  await page.goto("/preview/client-refine", { waitUntil: "networkidle", timeout: 180_000 });
  await page.waitForSelector(`[data-testid="front-door-company-${COMPANY_ID}"]`, { timeout: 60_000 });

  // Edgewood: Diagnose is running, so the row carries all three links
  const link = page.locator(`[data-testid="front-door-diagnose-${COMPANY_ID}"]`);
  await expect(link, "the running company has no Diagnose link").toHaveCount(1);
  await expect(link).toHaveAttribute("href", `/preview/client-refine/diagnose/${COMPANY_ID}/home`);
  await expect(link, "T2: the signed label").toHaveText("Diagnose");

  // Wasabi: the row is there with its two unconditional links, and no Diagnose link
  await expect(
    page.locator(`[data-testid="front-door-company-${CLEAN_COMPANY_ID}"]`),
    "the clean company's row is missing, so its Diagnose link proves nothing",
  ).toHaveCount(1);
  await expect(page.locator(`[data-testid="front-door-workspace-${CLEAN_COMPANY_ID}"]`)).toHaveCount(1);
  await expect(
    page.locator(`[data-testid="front-door-diagnose-${CLEAN_COMPANY_ID}"]`),
    "a company with no live document and no live interview record is offered Diagnose",
  ).toHaveCount(0);
});

// ── T3 · the client's link, on the beat that already names Diagnose ───────────────────────────
test("(u2) the First Read's closer beat carries the client Diagnose link, only where it is running", async ({ page }) => {
  await openFirstRead(page, COMPANY_ID);
  await goToCloserBeat(page);
  const link = page.locator('[data-testid="first-read-diagnose-client"]');
  await expect(link, "the closer beat offers no way into Diagnose").toHaveCount(1);
  await expect(link).toHaveAttribute("href", `/preview/client-refine/diagnose/${COMPANY_ID}/home`);
  await expect(link, "T3: the signed label and its arrow").toHaveText(/^Diagnose\s*→$/);

  // IT IS A CLIENT ELEMENT, NOT AN OPERATOR ONE: the switch is still off and the page still has
  // zero operator nodes, so this link is in the default render where S3 puts it.
  const r = await page.evaluate(() => ({
    operatorNodes: document.querySelectorAll("[data-fr-operator]").length,
    switchState: document.querySelector("[data-fr-operator-switch]")?.getAttribute("data-fr-operator-switch"),
    inStation: document.querySelector('[data-testid="first-read-diagnose-client"]')
      ?.closest(".fr-flow-col")?.getAttribute("data-state") ?? null,
  }));
  expect(r.operatorNodes, "the client link brought an operator node with it").toBe(0);
  expect(r.switchState, "the operator switch is on").toBe("off");
  expect(r.inStation, "the link is not on the Up-next station").toBe("here");

  // and the clean company's closer beat carries none
  await openFirstRead(page, CLEAN_COMPANY_ID);
  await goToCloserBeat(page);
  await expect(
    page.locator('[data-testid="first-read-diagnose-client"]'),
    "a company with Diagnose not running is pointed at an empty walk",
  ).toHaveCount(0);
});

// ── T4 · the operator's link, and the header it must not move ─────────────────────────────────
//
// THE SWITCH-ON HEADER IS 57px, AND IT WAS 57 BEFORE THIS LINK EXISTED — the operator back link
// already made it so. T4 asks that the Diagnose link not MOVE it, which is why the assertion below
// compares a header that has the link against one that does not, at the same viewport, rather than
// against a number. The DEFAULT render is pinned at 54 as it always was.
test("(u3) the operator Diagnose link is absent by default and moves no header when it appears", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const probe = () => page.evaluate(() => ({
    header: Math.round((document.querySelector(".fr-shell-header") as HTMLElement).getBoundingClientRect().height),
    operatorNodes: document.querySelectorAll("[data-fr-operator]").length,
    diagnose: document.querySelectorAll('[data-testid="first-read-diagnose"]').length,
    back: document.querySelectorAll('[data-testid="first-read-back"]').length,
  }));

  // DEFAULT — unchanged, on both companies
  for (const id of [COMPANY_ID, CLEAN_COMPANY_ID]) {
    await openFirstRead(page, id);
    const d = await probe();
    expect(d.header, "the default header moved").toBe(54);
    expect(d.operatorNodes, "the default render carries an operator node").toBe(0);
    expect(d.diagnose, "the operator Diagnose link renders on the client view").toBe(0);
  }

  // SWITCH ON — Edgewood gains the link beside the back link
  await openFirstRead(page, COMPANY_ID);
  await page.locator("[data-fr-operator-switch]").click();
  await page.waitForTimeout(500);
  const withLink = await probe();
  expect(withLink.diagnose, "the operator has no way into Diagnose").toBe(1);
  expect(withLink.back, "the way out went missing").toBe(1);
  await expect(page.locator('[data-testid="first-read-diagnose"]')).toHaveAttribute(
    "href", `/preview/client-refine/diagnose/${COMPANY_ID}/home`,
  );

  // SWITCH ON, no link — the clean company, same viewport. The heights must match: whatever the
  // operator header costs, this link is not what costs it.
  await openFirstRead(page, CLEAN_COMPANY_ID);
  await page.locator("[data-fr-operator-switch]").click();
  await page.waitForTimeout(500);
  const withoutLink = await probe();
  expect(withoutLink.diagnose, "the clean company is offered the operator link").toBe(0);
  expect(withoutLink.back, "the way out went missing").toBe(1);
  expect(withLink.header, "T4: the Diagnose link changes the operator header's height")
    .toBe(withoutLink.header);
});
