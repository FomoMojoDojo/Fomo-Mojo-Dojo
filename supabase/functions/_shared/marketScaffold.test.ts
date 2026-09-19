// Rulings 2 + 3 guards (2026-09-18). Planted failures (reported in the gate): archetype-first order
// (the company category decides a market run when it is non-empty); fallback-on-unpublished (draft
// anchors when the reference map is not published).
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { GRANTMAKING_KEY, loadPublishedReferenceAnchors, resolveScaffoldAnchors, scaffoldForRun, SCAFFOLD_UNPUBLISHED } from "./marketScaffold.ts";
import { getIndustryStepAnchors, INDUSTRY_STEP_ANCHORS } from "./industryStepAnchors.ts";

const HEALTHCARE = "Healthcare Services"; // Edgewood's company category (archetype: mental health → pattern order)
const FUNDER = { journey_key: "pmk-philanthropic", relationship_kind: "funder", job_executor: "Philanthropic organizations and grant-making bodies", jtbd: "Support youth mental health initiatives" };
const FUNDER_BY_TEXT = { journey_key: "mkt-funders", relationship_kind: null, job_executor: "Funders looking to support impactful initiatives", jtbd: "Evaluate and select initiatives to support" };
const PARTNER = { journey_key: "mkt-schools", relationship_kind: "partner", job_executor: "Schools seeking integrated services", jtbd: "Keep students in class" };
const CUSTOMER = { journey_key: "customer", relationship_kind: null, job_executor: "Families and caregivers", jtbd: "Get the right program in place" };

type Row = Record<string, unknown>;
function fakeDb(refRows: Row[], opts: { fail?: boolean } = {}) {
  return { from: (_t: string) => {
    let rows = [...refRows]; const b: Record<string, unknown> = {};
    const chain = (fn: (r: Row[]) => Row[]) => { rows = fn(rows); return b; };
    Object.assign(b, {
      select: () => b,
      eq: (c: string, v: unknown) => chain((r) => r.filter((x) => x[c] === v)),
      order: (c: string) => chain((r) => [...r].sort((a, b2) => Number(a[c]) - Number(b2[c]))),
      then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(opts.fail ? { data: null, error: { message: "planted read failure" } } : { data: rows, error: null }).then(res, rej),
    });
    return b;
  } };
}
const KEYS = ["define", "locate", "prepare", "confirm", "execute", "monitor", "modify", "conclude"];
const published = (key: string, published: boolean) => KEYS.map((k, i) => ({ industry_key: key, industry_label: "Grantmaking (reference)", step_key: k, step_number: i + 1, step_label: `REF-${k}: funder step ${i + 1}`, is_published: published }));

Deno.test("(a) a funder market on a healthcare-archetype company takes the grantmaking key — by relationship_kind and by the philanthropy pattern; a partner market falls back to the company category", () => {
  const byKind = scaffoldForRun(true, FUNDER, HEALTHCARE);
  assertEquals(byKind, { source: "market", industry_key: GRANTMAKING_KEY, why: "relationship_kind 'funder'" });
  const byText = scaffoldForRun(true, FUNDER_BY_TEXT, HEALTHCARE);
  assert(byText.source === "market" && byText.industry_key === GRANTMAKING_KEY, "philanthropy pattern → grantmaking");
  const partner = scaffoldForRun(true, PARTNER, HEALTHCARE);
  assertEquals(partner, { source: "company", industry_label: HEALTHCARE, why: "market names no scaffold — company category (fallback)" });
});

Deno.test("(b) a customer run on the same company is unchanged: company category, draft anchors", async () => {
  const d = scaffoldForRun(false, CUSTOMER, HEALTHCARE);
  assertEquals(d.source, "company");
  const r = await resolveScaffoldAnchors(fakeDb(published(GRANTMAKING_KEY, true)), d, getIndustryStepAnchors);
  assert(r.ok && r.from === "draft" && r.industry_label === HEALTHCARE, "draft anchors for the company category");
  assertEquals(r.ok && r.anchors, INDUSTRY_STEP_ANCHORS[HEALTHCARE]);
  // even with a funder definition, a customer run never asks the market
  assertEquals(scaffoldForRun(false, FUNDER, HEALTHCARE).source, "company");
});

Deno.test("(c) a funder market with NO published grantmaking map is refused — no draft, no company scaffold, no anchors", async () => {
  const d = scaffoldForRun(true, FUNDER, HEALTHCARE);
  for (const rows of [[], published(GRANTMAKING_KEY, false), published(GRANTMAKING_KEY, true).slice(0, 5)]) {
    const r = await resolveScaffoldAnchors(fakeDb(rows), d, getIndustryStepAnchors);
    assert(!r.ok && r.error === SCAFFOLD_UNPUBLISHED && r.industry_key === GRANTMAKING_KEY, `refused with ${rows.length} rows (${rows[0]?.is_published ?? "none"})`);
  }
  assertEquals(await loadPublishedReferenceAnchors(fakeDb(published(GRANTMAKING_KEY, false)), GRANTMAKING_KEY), null);
  // a read error never falls back either
  let threw = false; try { await loadPublishedReferenceAnchors(fakeDb([], { fail: true }), GRANTMAKING_KEY); } catch { threw = true; }
  assert(threw, "read error throws (caller refuses)");
  // and the handler refuses BEFORE any write: the refusal return precedes the first job_steps write path
  const src = await Deno.readTextFile(new URL("../local-jobmap-synthesis/handler.ts", import.meta.url));
  const refuse = src.indexOf("error: SCAFFOLD_UNPUBLISHED");
  const write = Math.min(...["persistJourney(", "regenerateJourney(", "journeysToWrite"].map((m) => { const i = src.indexOf(m); return i < 0 ? Infinity : i; }));
  assert(refuse > 0 && refuse < write, "refusal precedes the write path in the handler");
  assert(src.includes('component: SCAFFOLD_REFUSED') && src.includes('status: "rejected"'), "the refusal is audited");
});

Deno.test("(d) a PUBLISHED grantmaking map supplies the anchors — from the reference map, not the draft table", async () => {
  const d = scaffoldForRun(true, FUNDER, HEALTHCARE);
  const r = await resolveScaffoldAnchors(fakeDb(published(GRANTMAKING_KEY, true)), d, getIndustryStepAnchors);
  assert(r.ok && r.from === "reference" && r.industry_label === GRANTMAKING_KEY, "reference anchors");
  assert(r.ok && r.anchors && KEYS.every((k) => r.anchors![k as keyof typeof r.anchors] === `REF-${k}: funder step ${KEYS.indexOf(k) + 1}`), "every anchor is the reference map's step label");
  const draftLabels = Object.values(INDUSTRY_STEP_ANCHORS).flatMap((a) => Object.values(a));
  assert(r.ok && r.anchors && !Object.values(r.anchors).some((l) => draftLabels.includes(l)), "no hand-authored draft label");
});
