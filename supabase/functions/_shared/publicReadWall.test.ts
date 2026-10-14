// ── W1 (operator ruling, 2026-10-13): client-provided material never enters a public read ───────
//
// The Q4 wall check found the hole: selectPublicInputs filtered signals on signal_band, voice_class
// and liveness and NEVER on source_type, and liveRecordCandidates — the PASS 2 / carry lane —
// applied the same predicates minus source_type. 13 Edgewood signals the client uploaded
// (source_type='uploaded_file', band outside, voice market_context, live) satisfied every predicate
// both selectors applied. None had reached a stored read, but only because of the cap and the order.
//
// This is a CENSUS test: it asserts the predicate exists in ONE place and that both selectors call
// it. A second copy is how the two lanes drifted apart to begin with.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  CLIENT_PROVIDED_SIGNAL_SOURCE_TYPES, CLIENT_PROVIDED_SOURCE_KINDS,
  PUBLIC_SIGNAL_SOURCE_TYPES, isPublicSignalSourceType,
} from "./clientMaterial.ts";

const read = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));

Deno.test("W1. every client-provided source_type is refused", () => {
  for (const t of CLIENT_PROVIDED_SIGNAL_SOURCE_TYPES) {
    assertEquals(isPublicSignalSourceType(t), false, `${t} is client-provided and must not enter a public read`);
  }
  assertEquals(CLIENT_PROVIDED_SIGNAL_SOURCE_TYPES.length, 5);
});

Deno.test("W1. the refused set IS the one companyHasClientProvidedMaterial names", () => {
  // the upload_signal kind is the authority; this pins that the filter's list has not drifted from it
  const upload = CLIENT_PROVIDED_SOURCE_KINDS.find((k) => k.kind === "upload_signal");
  assert(upload, "the upload_signal kind still exists");
  for (const t of CLIENT_PROVIDED_SIGNAL_SOURCE_TYPES) {
    assert(upload!.column.includes(t), `${t} is in the filter list but not in the kind's own column note`);
  }
  // and the other direction: nothing the kind names is missing from the filter
  const named = upload!.column.replace(/^source_type ∈ \{|\}$/g, "").split(",").map((x) => x.trim());
  assertEquals([...named].sort(), [...CLIENT_PROVIDED_SIGNAL_SOURCE_TYPES].sort());
});

Deno.test("W1. FAIL CLOSED — an unrecognised source_type is not public", () => {
  for (const t of ["", "some_new_lane_2027", "UPLOADED_FILE", "uploaded file", "public_baseline_runX"]) {
    assertEquals(isPublicSignalSourceType(t), false, `"${t}" must fail closed`);
  }
  for (const t of [null, undefined, 0, {}, [], true]) {
    assertEquals(isPublicSignalSourceType(t), false, `${JSON.stringify(t)} must fail closed`);
  }
  // and the allowlist's own members pass, or the filter would empty every read
  for (const t of PUBLIC_SIGNAL_SOURCE_TYPES) assertEquals(isPublicSignalSourceType(t), true, t);
});

Deno.test("W1. the two sets are disjoint — nothing is both public and client-provided", () => {
  for (const t of CLIENT_PROVIDED_SIGNAL_SOURCE_TYPES) {
    assert(!PUBLIC_SIGNAL_SOURCE_TYPES.includes(t), `${t} is in both lists`);
  }
});

// ── THE CENSUS: one predicate, and both selectors call it ───────────────────────────────────────
const SELECTORS: ReadonlyArray<{ file: string; fn: string; start: string; end: string }> = [
  { file: "./publicReadInputs.ts", fn: "selectPublicInputs", start: "export async function selectPublicInputs", end: "// 2. own-words" },
  { file: "./classSourcingScope.ts", fn: "liveRecordCandidates", start: "export async function liveRecordCandidates", end: "const { data: owClaims }" },
];

Deno.test("W1 CENSUS. both selectors call the ONE predicate, inside their signals lane", async () => {
  for (const s of SELECTORS) {
    const src = await read(s.file);
    const lane = src.slice(src.indexOf(s.start), src.indexOf(s.end, src.indexOf(s.start)));
    assert(lane.length > 100, `${s.fn}: could not isolate the signals lane`);
    assert(lane.includes("isPublicSignalSourceType("), `${s.fn} does not call the wall predicate`);
    assert(lane.includes("source_type"), `${s.fn} does not even SELECT source_type, so it cannot filter on it`);
    assert(src.includes('from "./clientMaterial.ts"'), `${s.fn}'s module does not import from the authority`);
  }
});

Deno.test("W1 CENSUS. there is exactly ONE definition of the predicate and ONE allowlist", async () => {
  const dir = new URL("./", import.meta.url);
  const defs: string[] = [];
  const lists: string[] = [];
  for await (const e of Deno.readDir(dir)) {
    if (!e.isFile || !e.name.endsWith(".ts") || e.name.endsWith(".test.ts")) continue;
    const src = await Deno.readTextFile(new URL(e.name, dir));
    if (src.includes("export function isPublicSignalSourceType")) defs.push(e.name);
    if (src.includes("export const PUBLIC_SIGNAL_SOURCE_TYPES")) lists.push(e.name);
  }
  assertEquals(defs, ["clientMaterial.ts"], "one predicate, in the module that owns the client-material vocabulary");
  assertEquals(lists, ["clientMaterial.ts"], "and one allowlist");
});

Deno.test("W1 CENSUS. no selector re-implements the rule with its own literal list", async () => {
  for (const s of SELECTORS) {
    const src = await read(s.file);
    for (const t of CLIENT_PROVIDED_SIGNAL_SOURCE_TYPES) {
      assert(!src.includes(`"${t}"`), `${s.fn}'s module spells "${t}" itself — a second copy of the rule`);
    }
  }
});

// ── LIVE: the rows the wall now keeps out ───────────────────────────────────────────────────────
const URL_ = Deno.env.get("SUPABASE_URL") ?? "";
const KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
Deno.test({
  name: "W1. LIVE: the rows that used to pass are exactly the ones now refused",
  ignore: URL_ === "" || KEY === "",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.57.4");
    const { PUBLIC_SIGNAL_VOICES } = await import("./publicReadInputs.ts");
    const db = createClient(URL_, KEY);
    const { data } = await db.from("signals")
      .select("id, company_id, source_type")
      .eq("signal_band", "outside").in("voice_class", PUBLIC_SIGNAL_VOICES)
      .is("superseded_at", null).is("held_at", null);
    const rows = (data ?? []) as Array<{ source_type: string | null }>;
    assert(rows.length > 0, "the selector's own predicates match something — not a vacuous leg");
    const refused = rows.filter((r) => !isPublicSignalSourceType(r.source_type));
    assert(refused.length > 0, "if nothing is refused the wall has nothing to prove here any more");
    assert(refused.every((r) => CLIENT_PROVIDED_SIGNAL_SOURCE_TYPES.includes(String(r.source_type))),
      `the wall refuses only client-provided rows; it also refused ${JSON.stringify([...new Set(refused.map((r) => r.source_type))])}`);
  },
});
