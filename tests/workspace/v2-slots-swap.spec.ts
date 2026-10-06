// ── SHORT-FORM SLOTS, slice 1 (R1-R7, signed 2026-10-05) ────────────────────────────────────────
//
// Positioning and strategy LEAD with the current, signed short form; the full outside read sits
// behind a full-screen swap. With no signed slot the screen renders exactly what it rendered before
// slots existed, and carries NO swap control (R6).
//
// Legs:
//   (1) slot-ABSENT — both screens render the full read today, and no swap control exists
//   (2) slot-PRESENT — both screens lead with the short form and offer "Show the full read"
//   (3) the swap, both ways, on both screens
//   (4) a STAGED (unsigned) slot changes nothing — it must never render as the company's short form
//   (5) member visibility: a company member reads a SIGNED current slot and never a staged one
//
// PLANTING. authenticated holds SELECT only on first_read_slots (guard s7), so a browser client
// cannot insert one even as an admin — which is the point. The fixtures are therefore planted with
// psql on the service-role path, the same execFileSync idiom inputs-marks.spec.ts uses, and removed
// in a finally. Only rows this spec created are ever deleted, by id.
import { execFileSync } from "node:child_process";
import { expect, test, type Page } from "playwright/test";
import { COMPANY_ID } from "../../playwright.config";
import { open } from "./helpers";

const PGC = process.env.PGC || "supabase_db_dzlgyxcvuwiulgifbmew";
const psql = (sql: string) =>
  execFileSync("docker", ["exec", "-i", PGC, "psql", "-U", "postgres", "-d", "postgres", "-At", "-q", "-v", "ON_ERROR_STOP=1", "-c", sql], { encoding: "utf8" }).trim();

const SIGNER = "00000000-0000-4000-8000-0000000515e1";
const D1 = "FIXTURE differentiator one, long enough to clear the floor";
const D2 = "FIXTURE differentiator two, long enough to clear the floor";
const CAT = "FIXTURE category context, long enough to clear the floor";
const WTP = "FIXTURE where to play line, long enough to clear the floor";
const HTW = "FIXTURE how to win line, long enough to clear the floor";

const POS_SLOTS = JSON.stringify({
  differentiators: [{ text: D1, citations: [] }, { text: D2, citations: [] }],
  category_context: { text: CAT, citations: [] },
}).replace(/'/g, "''");
const STR_SLOTS = JSON.stringify({
  where_to_play_line: { text: WTP, citations: [] },
  how_to_win_line: { text: HTW, citations: [] },
}).replace(/'/g, "''");
const VERDICT = JSON.stringify({ slots: {} }).replace(/'/g, "''");

/** Plant one slot bound to the company's CURRENT read of that kind. signed=false ⇒ staged. */
function plantSlot(kind: "positioning" | "strategy", slotsJson: string, signed: boolean): string {
  const sig = signed ? `now(), '${SIGNER}'` : `null, null`;
  return psql(
    `insert into public.first_read_slots
       (company_id, kind, slots, source_read_id, model_provider, model_name, judge_model, judge_verdict, is_current, signed_at, signed_by)
     values ('${COMPANY_ID}', '${kind}', '${slotsJson}'::jsonb,
             (select id from public.public_reads where company_id='${COMPANY_ID}' and kind='${kind}' and is_current limit 1),
             'external_openai','gpt-4.1-mini','gpt-4.1-mini','${VERDICT}'::jsonb, ${signed}, ${sig})
     returning id`);
}
const dropSlot = (id: string) => { if (id) psql(`delete from public.first_read_slots where id='${id}'`); };

// ── STATE AWARENESS (2026-10-05, after the first promotion) ─────────────────────────────────────
// This spec was first written against an EMPTY slot table and asserted that positioning renders
// "no-slot". Once positioning was promoted, three legs failed — not because the product broke, but
// because the fixture assumed a state the product had legitimately left. Worse, the plant tried to
// insert a SECOND current positioning slot and hit first_read_slots_current_one, which is the index
// doing its job. So the legs now ASK which kinds are free rather than assuming, and a kind that
// already carries the company's real signed short form is covered by its own leg instead.
type Kind = "positioning" | "strategy";
const KINDS: Kind[] = ["positioning", "strategy"];
function kindsWithLiveSlot(): Kind[] {
  const out = psql(
    `select kind from public.first_read_slots
      where company_id='${COMPANY_ID}' and is_current and signed_at is not null order by kind`);
  return out ? (out.split("\n").map((k) => k.trim()).filter(Boolean) as Kind[]) : [];
}
const freeKinds = (): Kind[] => { const live = kindsWithLiveSlot(); return KINDS.filter((k) => !live.includes(k)); };

/** The preview has no beat URL param: it opens on the cold open and advances on ArrowRight. Walk
 *  forward until the screen's own eyebrow is the one we want, rather than hard-coding an index —
 *  the beat list grows by one when the company holds marks, and an index would rot silently. */
const BEAT_TITLE = { positioning: "Your positioning", strategy: "Your strategy" } as const;
async function gotoBeat(page: Page, beat: "positioning" | "strategy") {
  await open(page, `/preview/client-refine/first-read/${COMPANY_ID}`);
  await expect(page.locator(".first-read")).toBeVisible({ timeout: 60_000 });
  const want = page.getByText(BEAT_TITLE[beat], { exact: true });
  for (let i = 0; i < 20; i++) {
    if (await want.count() > 0 && await want.first().isVisible()) return;
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(120);
  }
  throw new Error(`never reached the ${beat} beat ("${BEAT_TITLE[beat]}") in 20 steps`);
}
const main = (page: Page) => page.locator('main[data-slot-state]');

test.describe("(1) slot-absent: the screen is what it was before slots existed", () => {
  test("a kind with no signed slot renders the full read and carries NO swap control", async ({ page }) => {
    test.setTimeout(180_000);
    const free = freeKinds();
    test.skip(free.length === 0, "every kind already carries a signed slot — nothing to test absent");
    for (const beat of free) {
      await gotoBeat(page, beat);
      await expect(main(page), `${beat} has no signed slot, so it must render as it did before slots existed`)
        .toHaveAttribute("data-slot-state", "no-slot");
      await expect(page.getByTestId("slot-swap-full")).toHaveCount(0);
      await expect(page.getByTestId("slot-swap-back")).toHaveCount(0);
    }
  });
});

test.describe("(2)(3) slot-present: the short form leads, and the swap works both ways", () => {
  test("positioning", async ({ page }) => {
    test.setTimeout(180_000);
    test.skip(!freeKinds().includes("positioning"), "positioning already carries a signed slot — leg (6) covers the live one");
    let id = "";
    try {
      id = plantSlot("positioning", POS_SLOTS, true);
      await gotoBeat(page, "positioning");
      // short form leads
      await expect(main(page)).toHaveAttribute("data-slot-state", "short");
      await expect(page.getByText(D1, { exact: false })).toBeVisible();
      await expect(page.getByText(D2, { exact: false })).toBeVisible();
      await expect(page.getByText(CAT, { exact: false })).toBeVisible();
      // → full read
      await page.getByTestId("slot-swap-full").click();
      await expect(main(page)).toHaveAttribute("data-slot-state", "full");
      await expect(page.getByText(D1, { exact: false })).toHaveCount(0);
      await expect(page.getByTestId("slot-swap-back")).toBeVisible();
      // → back to the short form
      await page.getByTestId("slot-swap-back").click();
      await expect(main(page)).toHaveAttribute("data-slot-state", "short");
      await expect(page.getByText(D1, { exact: false })).toBeVisible();
    } finally { dropSlot(id); }
  });

  test("strategy", async ({ page }) => {
    test.setTimeout(180_000);
    test.skip(!freeKinds().includes("strategy"), "strategy already carries a signed slot — leg (6) covers the live one");
    let id = "";
    try {
      id = plantSlot("strategy", STR_SLOTS, true);
      await gotoBeat(page, "strategy");
      await expect(main(page)).toHaveAttribute("data-slot-state", "short");
      await expect(page.getByText(WTP, { exact: false })).toBeVisible();
      await expect(page.getByText(HTW, { exact: false })).toBeVisible();
      await page.getByTestId("slot-swap-full").click();
      await expect(main(page)).toHaveAttribute("data-slot-state", "full");
      await expect(page.getByText(WTP, { exact: false })).toHaveCount(0);
      await page.getByTestId("slot-swap-back").click();
      await expect(main(page)).toHaveAttribute("data-slot-state", "short");
      await expect(page.getByText(WTP, { exact: false })).toBeVisible();
    } finally { dropSlot(id); }
  });
});

test.describe("(4) a staged, unsigned slot never renders", () => {
  test("the screen stays on the full read with no swap control", async ({ page }) => {
    test.setTimeout(180_000);
    const free = freeKinds();
    test.skip(free.length === 0, "every kind already carries a signed slot — a staged row cannot be shown to change nothing");
    const beat = free[0];
    let id = "";
    try {
      id = plantSlot(beat, beat === "positioning" ? POS_SLOTS : STR_SLOTS, false);   // staged: is_current=false, unsigned
      await gotoBeat(page, beat);
      await expect(main(page), "a staged, unsigned slot must never render as the company's short form")
        .toHaveAttribute("data-slot-state", "no-slot");
      await expect(page.getByTestId("slot-swap-full")).toHaveCount(0);
    } finally { dropSlot(id); }
  });
});

// ── (6) THE LIVE SLOT: the company's real, promoted short form on screen ────────────────────────
// The legs above plant fixtures. This one asserts the thing an operator actually signed renders —
// the coverage that was lost when positioning stopped being a free kind.
test.describe("(6) a promoted slot renders as the company's short form", () => {
  test("each kind holding a signed slot leads with it, and swaps to the full read", async ({ page }) => {
    test.setTimeout(180_000);
    const live = kindsWithLiveSlot();
    test.skip(live.length === 0, "no kind carries a signed slot yet");
    for (const beat of live) {
      await gotoBeat(page, beat);
      await expect(main(page), `${beat} carries a signed slot, so the short form must lead`)
        .toHaveAttribute("data-slot-state", "short");
      await page.getByTestId("slot-swap-full").click();
      await expect(main(page)).toHaveAttribute("data-slot-state", "full");
      await page.getByTestId("slot-swap-back").click();
      await expect(main(page)).toHaveAttribute("data-slot-state", "short");
    }
  });
});

test.describe("(5) member visibility", () => {
  test("a company member reads a SIGNED current slot and never a staged one", async ({ page }) => {
    test.setTimeout(180_000);
    const email = process.env.MEMBER_EMAIL, password = process.env.MEMBER_PASSWORD, memberCo = process.env.MEMBER_COMPANY_ID;
    test.skip(!email || !password || !memberCo, "no MEMBER_EMAIL / MEMBER_PASSWORD / MEMBER_COMPANY_ID (source backups/fr-member.env)");

    // two slots on the MEMBER's own company: one signed+current, one staged.
    // The member fixture company is the designated throwaway (it already carries the kept first-read
    // fixture rows). It holds no public read, and a slot must name one, so plant a minimal read here
    // and remove it in the finally — slots FIRST, then the read, because the FK is ON DELETE RESTRICT.
    let readId = psql(`select id from public.public_reads where company_id='${memberCo}' and kind='strategy' and is_current limit 1`);
    let plantedRead = "";
    if (!readId) {
      plantedRead = psql(
        `insert into public.public_reads (company_id, kind, payload, input_ledger, model_provider, model_name, is_current)
         values ('${memberCo}','strategy','{}'::jsonb,'{}'::jsonb,'external_openai','gpt-4.1-mini', true) returning id`);
      readId = plantedRead;
    }
    const mk = (signed: boolean) => psql(
      `insert into public.first_read_slots
         (company_id, kind, slots, source_read_id, model_provider, model_name, judge_model, judge_verdict, is_current, signed_at, signed_by)
       values ('${memberCo}', 'strategy', '${STR_SLOTS}'::jsonb, '${readId}',
               'external_openai','gpt-4.1-mini','gpt-4.1-mini','${VERDICT}'::jsonb, ${signed}, ${signed ? `now(), '${SIGNER}'` : "null, null"})
       returning id`);
    let signedId = "", stagedId = "";
    const ctx = await page.context().browser()!.newContext({ storageState: { cookies: [], origins: [] } });
    const p = await ctx.newPage();
    try {
      signedId = mk(true);
      stagedId = mk(false);
      await p.goto("/", { waitUntil: "networkidle", timeout: 120_000 });
      const signedIn = await p.evaluate(async (c) => {
        const s = (window as unknown as { supabase: { auth: { signInWithPassword: (x: { email: string; password: string }) => Promise<{ data?: { session?: unknown }; error?: { message: string } | null }> } } }).supabase;
        const { data, error } = await s.auth.signInWithPassword(c);
        return { ok: Boolean(data?.session), error: error?.message ?? null };
      }, { email: email!, password: password! });
      expect(signedIn).toEqual({ ok: true, error: null });

      const seen = await p.evaluate(async (co) => {
        const s = (window as unknown as { supabase: { from: (t: string) => any } }).supabase;
        const { data, error } = await s.from("first_read_slots").select("id, is_current, signed_at").eq("company_id", co);
        return { rows: (data ?? []).length, allSignedCurrent: (data ?? []).every((r: { is_current: boolean; signed_at: string | null }) => r.is_current && r.signed_at), error: error?.message ?? null };
      }, memberCo!);
      expect(seen.error).toBeNull();
      expect(seen, "a member must read the signed current slot and NOT the staged one").toEqual({ rows: 1, allSignedCurrent: true, error: null });
    } finally {
      await ctx.close();
      dropSlot(signedId); dropSlot(stagedId);
      if (plantedRead) psql(`delete from public.public_reads where id='${plantedRead}'`);
    }
  });
});
