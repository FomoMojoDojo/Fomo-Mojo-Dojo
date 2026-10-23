// Operator ruling 50 (2026-10-22) — the contradiction check. Each test is the target of one plant:
//   CT-1  P44-1  a national scope word ("nationwide") against a pooled "41 states" row is a hit
//   CT-2  P44-2  the bound is read from the row: "41 states" bounds; "50 states" does not
//   CT-3  P44-3  "all 50 states" against a 41-state row is a hit
//   CT-4  P44-4  our-read lines are checked: the stage gate passes EVERY line of the payload, unfiltered by class
//   CT-5  P44-5  a line citing a row that states the scope itself is licensed ("nationwide 5G access")
//   CT-6  P44-6  promote re-runs the check before the flip, and fails closed
//   CT-W         GUARD 5d sits after level and the alternative gate, before the judge; its re-ask spends the ONE budget
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { contradictionHits } from "./contradiction.ts";
import { promoteContradictionRefusal } from "./publicReadPromote.ts";

const read = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));
const ROWS: Record<string, string> = {
  r41: "Spectrum serves over 57 million customers in 41 states",
  r45: "Post-merger, Spectrum operates across 45 states, passing more than 70 million homes and businesses",
  r50: "Coverage maps for all 50 states are published quarterly.",
  rNat: "Enjoy nationwide 5G access at no extra fee with Spectrum Mobile.",
  rOwn: "With reliable and affordable services plus 24/7 customer service, Spectrum is committed to the best experience.",
  rC: "The company sells in 14 countries across Europe and Asia.",
};
const POOL = Object.entries(ROWS).map(([ref, text]) => ({ ref, text }));
const hits = (text: string, refs: string[], pool = POOL) => contradictionHits([{ field: "f", text, refs }], (r) => ROWS[r] ?? "", pool);

Deno.test("CT-1 'nationwide' against a pooled 41-state row is a contradiction (P44-1)", () => {
  const h = hits("Deliver reliable services to customers nationwide.", ["rOwn"]);
  assertEquals(h.map((x) => [x.scope, x.row, x.bound]), [["nationwide", "r41", "41 states"]]);
});
Deno.test("CT-2 the bound is the row's own count: 41 states bounds a national scope, 50 states does not (P44-2)", () => {
  assertEquals(hits("service across the country", ["rOwn"], [{ ref: "r41", text: ROWS.r41 }]).map((x) => x.bound), ["41 states"]);
  assertEquals(hits("service across the country", ["rOwn"], [{ ref: "r50", text: ROWS.r50 }]), []);
  assertEquals(hits("a global footprint", ["rOwn"], [{ ref: "rC", text: ROWS.rC }]).map((x) => x.bound), ["14 countries"]);
});
Deno.test("CT-3 'all 50 states' against a 41-state row is a contradiction (P44-3)", () => {
  assertEquals(hits("Service in all 50 states.", ["rOwn"], [{ ref: "r41", text: ROWS.r41 }]).map((x) => x.scope), ["all 50 states"]);
});
Deno.test("CT-4 our-read lines are checked — the stage gate hands it every line of the payload (P44-4)", async () => {
  // Spectrum's staged strategy 109af21c: an our_read aspiration that says "nationwide" over a pool stating 41 states
  const payload = { winning_aspiration: "Deliver reliable, affordable, and secure internet, mobile, and TV services to customers nationwide.", winning_aspiration_citations: ["rOwn"], winning_aspiration_class: "our_read" };
  const { linesOfStoredPayload } = await import("./citedLines.ts");
  assertEquals(contradictionHits(linesOfStoredPayload(payload), (r) => ROWS[r] ?? "", POOL).length, 1);
  const gen = await read("../generate-public-read/index.ts");
  assert(gen.includes("const lines = linesOfStoredPayload(payload);                              // every line, any class, ref tokens"), "the gate takes every line");
  assert(gen.includes('const pool = [...textByRef].filter(([ref]) => classByRef.get(ref) !== "our_read")'), "the pool excludes our own rows");
});
Deno.test("CT-5 a line citing a row that states the scope itself is licensed (P44-5)", () => {
  assertEquals(hits("Nationwide 5G access with your plan.", ["rNat"]), []);
  assertEquals(hits("Nationwide 5G access with your plan.", ["rOwn"]).length, 1, "the same line citing another row is not");
});
Deno.test("CT-6 promote re-runs the check before the flip, and fails closed (P44-6)", async () => {
  const src = await read("./publicReadPromote.ts");
  const pw = src.indexOf("const pw = await promotePageWordsRefusal("), ct = src.indexOf("const ct = await promoteContradictionRefusal(supabase, stagedRow!);"), flip = src.indexOf("update({ is_current: true })");
  assert(pw > 0 && ct > pw && flip > ct, "promote: page words → contradiction → flip");
  assert(src.includes("if (ct) throw new PromoteRefused(stagedId, kind, `CONTRADICTION:"), "a hit refuses the promote");
  const fake = (mode: "ok" | "throw") => ({
    from: (_t: string) => {
      const q: Record<string, unknown> = {};
      for (const m of ["select", "eq", "in", "is", "order", "limit"]) q[m] = () => q;
      const done = () => { if (mode === "throw") throw new Error("boom"); return { data: Object.entries(ROWS).map(([id, text]) => ({ id, quote: text, evidence_excerpt: text, body: text, claim_text: text, raw_payload: { excerpt_guard: { traced: true } } })), error: null }; };
      q.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => { try { return Promise.resolve(done()).then(res, rej); } catch (e) { return Promise.reject(e).then(res, rej); } };
      return q;
    },
  });
  const row = { payload: { promise: "Spectrum serves customers nationwide.", citations: ["rOwn"], class: "you" }, input_ledger: { ids: Object.keys(ROWS), classes: {} } };
  const refused = await promoteContradictionRefusal(fake("ok") as never, row);
  assert(refused && refused.includes("nationwide"), `refused: ${refused}`);
  assert(await promoteContradictionRefusal(fake("throw") as never, row), "a re-read that cannot be made refuses");
});
Deno.test("CT-W GUARD 5d after level and the alternative gate, before the judge; one shared re-ask", async () => {
  const pk = await read("./publicReadPerKind.ts");
  const lv = pk.indexOf("const lvl = deps.levelRefusal?.(kind, payload)"), alt = pk.indexOf("const alt = deps.alternativeRefusal?.(kind, payload)"),
    ct = pk.indexOf("const contra = deps.contradictionRefusal?.(kind, payload)"), jd = pk.indexOf("verdict = await deps.judge(kind, payload);");
  assert(lv > 0 && alt > lv && ct > alt && jd > ct, "level → alternatives → contradiction → judge");
  assert(pk.includes("if (g.contradictionDetail !== undefined && !reasked && deps.reaskOnSourcingRefusal) {"), "gated on the ONE flag");
  assert(pk.includes('deps.reaskOnSourcingRefusal(kind, g.payload, g.contradictionDetail, "contradiction")'), "through the one re-ask dep");
});
