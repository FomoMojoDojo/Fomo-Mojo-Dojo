// (x9) The Gap — per-pair verdicts and dispute-first order (operator rulings R1–R4, 2026-09-22).
// READ-ONLY on Edgewood: this spec navigates and asserts; it writes nothing and runs no model.
// Proves:
//   (a) claim 31229eb0 renders its 5 admissible pairs, the DISPUTING one first (indeed.com) and the
//       four echoes after (usnews.com + three Kaiser Permanente), each carrying its OWN chip —
//       "Disputed" then "Echoed" ×4 — while the STATEMENT chip above them is still "Disputed";
//   (b) the rail's own counts are untouched — 25 disputed · 15 not echoed · 12 echoed (R3's 25/15/12,
//       in the standfirst's own order: disputed, not echoed, echoed);
//   (c) an all-echoed statement shows "Echoed" on every pair and is NOT reordered;
//   (d) the pair chips are subordinate to the statement chip by scale, and are the SAME signed labels
//       (no third vocabulary), and the Status conflict chip is untouched (R5).
import { expect, test, type Page } from "playwright/test";
import { COMPANY_ID } from "../../playwright.config";

const GAP_BEAT = "The gap";
/** The declared statement whose pairs the operator asked about (claim 31229eb0…). */
const CLAIM = "31229eb0-e8f5-48a9-bba1-a7a73ba0bf8a";

async function openGap(page: Page) {
  await page.addInitScript((id) => { try { localStorage.setItem("active_company_id", id); } catch { /* no storage */ } }, COMPANY_ID);
  await page.goto(`/preview/client-refine/first-read/${COMPANY_ID}`, { waitUntil: "networkidle", timeout: 120_000 });
  await expect(page.locator(".first-read")).toBeVisible({ timeout: 60_000 });
  for (let i = 0; i < 25; i++) {
    if ((await page.locator(".fr-beat").textContent())?.includes(GAP_BEAT)) return;
    await page.keyboard.press("ArrowRight"); await page.waitForTimeout(140);
  }
  throw new Error("gap beat not reached");
}
/** The statement block for a declared claim id — the mark target keys by statementId. */
const statementFor = (page: Page, claimId: string) =>
  page.locator(`[data-fr-mark-kind="gap_statement"][data-fr-mark-key="${claimId}"]`);

test("(a,d) the disputing pair leads, every pair carries its own verdict, the statement chip is unchanged", async ({ page }) => {
  test.setTimeout(300_000);
  await openGap(page);
  const st = statementFor(page, CLAIM);
  await expect(st).toHaveCount(1);

  // the STATEMENT chip is still the any-one verdict (R3)
  await expect(st.locator(".fr-chip").first()).toHaveText("Disputed");

  // five pairs, each with its own verdict attribute, the dispute first (R2)
  const pairs = st.locator("[data-fr-pair-verdict]");
  await expect(pairs).toHaveCount(5);
  expect(await pairs.evaluateAll((ns) => ns.map((n) => n.getAttribute("data-fr-pair-verdict"))))
    .toEqual(["contradicted", "confirmed", "confirmed", "confirmed", "confirmed"]);

  // and each carries the SIGNED label for its own verdict (R1) — no third vocabulary
  expect(await pairs.evaluateAll((ns) => ns.map((n) => n.querySelector(".fr-chip-sub .fr-chip")?.textContent ?? "")))
    .toEqual(["Disputed", "Echoed", "Echoed", "Echoed", "Echoed"]);

  // the dispute is the indeed.com row; the echoes are usnews + three Kaiser Permanente
  const hosts = await pairs.evaluateAll((ns) => ns.map((n) => (n.textContent ?? "").toLowerCase()));
  expect(hosts[0]).toContain("indeed.com");
  expect(hosts.slice(1).join(" ")).toContain("usnews.com");
  expect(hosts.slice(1).filter((h) => h.includes("kaiserpermanente")).length).toBe(3);

  // (d) subordinate by SCALE only — same chip, one step down; the statement chip is not scaled
  const scale = await st.locator(".fr-chip-sub .fr-chip").first().evaluate((el) => getComputedStyle(el).transform);
  expect(scale).toContain("0.85");
  // (R5) the Status conflict chip is a different thing and is untouched
  expect((await st.textContent()) ?? "").not.toContain("Status conflict");
});

test("(b) R3: the rail counts are unchanged — 25 disputed · 15 not echoed · 12 echoed", async ({ page }) => {
  test.setTimeout(300_000);
  await openGap(page);
  const beat = (await page.locator(".fr-beat").textContent()) ?? "";
  // The whole tally as ONE substring: the counts AND their order are pinned, so a per-pair change
  // that moved a statement between buckets could not hide behind three separate contains().
  expect(beat).toContain("25 disputed · 15 not echoed · 12 echoed.");
});

test("(c) an all-echoed statement shows Echoed on every pair and is not reordered", async ({ page }) => {
  test.setTimeout(300_000);
  await openGap(page);
  // the first statement whose chip is "Echoed" and which has ≥2 pairs
  const all = page.locator('[data-fr-mark-kind="gap_statement"]');
  const n = await all.count();
  let found = false;
  for (let i = 0; i < n; i++) {
    const st = all.nth(i);
    if ((await st.locator(".fr-chip").first().textContent()) !== "Echoed") continue;
    const verdicts = await st.locator("[data-fr-pair-verdict]").evaluateAll((ns) => ns.map((x) => x.getAttribute("data-fr-pair-verdict")));
    if (verdicts.length < 2) continue;
    found = true;
    expect(new Set(verdicts)).toEqual(new Set(["confirmed"]));          // every pair echoes
    const labels = await st.locator(".fr-chip-sub .fr-chip").allTextContents();
    expect(new Set(labels)).toEqual(new Set(["Echoed"]));                // and says so
    break;
  }
  expect(found, "Edgewood has an echoed statement with 2+ pairs").toBe(true);
});

// (e) The INVARIANT across the whole beat, not one claim: no statement anywhere renders an echoing
// pair above a disputing one.
//
// Worth knowing what this does and does not prove. On Edgewood today R2 is a NO-OP: with the sort
// deliberately removed, all 52 statements (18 of them mixed) still came back dispute-first, because
// orderGapPairs' strength ordering already puts the divergent pair on top for every one of them. So
// this leg cannot, on this data, tell R2 from its absence — the discriminating proof is the unit test
// in gapPairVerdict.test.ts, which feeds echo-first input and is red the moment the sort goes. What
// this leg IS good for is the day that upstream order changes: it pins the property on real data, so
// a statement that started rendering its echoes first would fail here rather than ship.
test("(e) no statement renders an echoing pair above a disputing one", async ({ page }) => {
  test.setTimeout(300_000);
  await openGap(page);
  const statements = await page.locator('[data-fr-mark-kind="gap_statement"]').evaluateAll((ns) => ns.map((n) => ({
    key: (n.getAttribute("data-fr-mark-key") ?? "").slice(0, 8),
    pairs: [...n.querySelectorAll("[data-fr-pair-verdict]")].map((p) => p.getAttribute("data-fr-pair-verdict")),
  })));
  expect(statements.length).toBeGreaterThan(0);
  const offenders = statements.filter((s) => {
    const firstEcho = s.pairs.indexOf("confirmed");
    return firstEcho > -1 && s.pairs.lastIndexOf("contradicted") > firstEcho;
  });
  expect(offenders.map((o) => `${o.key}:${o.pairs.join(",")}`)).toEqual([]);
  // and the beat really does contain mixed statements, so the assertion is not vacuous
  expect(statements.filter((s) => new Set(s.pairs).size > 1).length).toBeGreaterThan(0);
});
