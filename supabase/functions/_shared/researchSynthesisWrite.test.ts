// M-3 (2026-11-18): the needs writer files needs under the market it is GIVEN, never a literal "customer".
import { assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { writeReconciledNeeds } from "./researchSynthesisWrite.ts";

function fakeSupabase() {
  const inserts: Record<string, unknown>[] = [];
  const chain = (table: string) => {
    const b: Record<string, unknown> = {};
    for (const m of ["select", "eq", "not", "neq", "in", "is", "order", "limit", "update"]) b[m] = () => b;
    b.insert = (row: Record<string, unknown>) => { if (table === "odi_needs") inserts.push(row); return Promise.resolve({ error: null }); };
    b.then = (res: (v: unknown) => void) => res({ data: [], error: null });
    return b;
  };
  return { supabase: { from: chain } as unknown as Parameters<typeof writeReconciledNeeds>[0]["supabase"], inserts };
}

const base = (supabase: Parameters<typeof writeReconciledNeeds>[0]["supabase"], journeyKey: string) => ({
  supabase, company_id: "c1", user: { id: "u1" },
  opportunities: [{ outcome: "Minimize the time it takes to see what a gift achieved", step_number: 2, importance: 8, satisfaction: 3 }],
  customerStepLabelByNumber: new Map([[2, "Locate"]]), journeyKey,
  odiFrameworkKeys: ["odi"], artifactSourcePath: "p", reconcileRunId: "r1",
  helpers: { clamp: (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n)), normalizeOutcomeLanguage: (o: string) => o,
             odiServiceState: () => "underserved", JTBD_CHECKPOINT_COUNT: 8 },
});

Deno.test("M-3: needs are written under the journey the caller names", async () => {
  const { supabase, inserts } = fakeSupabase();
  await writeReconciledNeeds(base(supabase, "customer-donors"));
  assertEquals(inserts.map((r) => [r.journey_key, r.step_label]), [["customer-donors", "Locate"]]);
});

Deno.test("M-3: no journey given is refused, never defaulted to \"customer\"", async () => {
  const { supabase, inserts } = fakeSupabase();
  await assertRejects(() => writeReconciledNeeds(base(supabase, "")), Error, "journeyKey required");
  assertEquals(inserts.length, 0);
});

Deno.test("M-3: the writer carries no journey literal", async () => {
  const src = await Deno.readTextFile(new URL("./researchSynthesisWrite.ts", import.meta.url));
  const needs = src.slice(src.indexOf("export async function writeReconciledNeeds"));
  assertEquals(/journey_key:\s*["']/.test(needs), false);
});
