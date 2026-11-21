// ── SP-491: the kept-quote table, masked through the REAL displayQuote ──────────────────────────
//
// The judge harness is deno (it needs callOllamaJson) and cannot import src/lib/reviewQuote.ts —
// that file has an extensionless import. So the harness writes raw rows and THIS step masks them,
// through the one masking path every surface uses (SP-452 / SP-455c). A second masking
// implementation here would be the very thing the quote rules exist to prevent.
//
//   npx tsx scripts/pattern-corruption-table.ts <harness-output.json> [...]
import { readFileSync } from "node:fs";
import { displayQuote } from "../src/lib/reviewQuote";
import { brandWords } from "../src/lib/reviewQuote";

type Kept = { case: string; pattern: string; signalId: string; quote: string; bearsOnHostNeed: boolean;
  reason: string; states?: string; notStated?: string[] };
type Rejected = { case: string; pattern: string; signalId: string; quote: string;
  reason: string; states?: string; notStated?: string[]; rejected?: string };
type Out = {
  label: string; a: string; b: string;
  rejectedHonest?: Rejected[];
  overlap: { shared: number; a_on_b: number; b_on_a: number };
  totals: Record<string, number>;
  kept: Kept[];
};

const brands = brandWords("Charter Communications", ["spectrum", "cox", "brand_not_recorded"]);

for (const file of process.argv.slice(2)) {
  const d = JSON.parse(readFileSync(file, "utf8")) as Out;
  console.log(`\n${"=".repeat(100)}\n${d.label}\n${"=".repeat(100)}`);
  console.log(`A = "${d.a}"`);
  console.log(`B = "${d.b}"`);
  console.log(`overlap in need_evidence — shared supporting quotes ${d.overlap.shared} · A's on B's need ${d.overlap.a_on_b} · B's on A's need ${d.overlap.b_on_a}`);
  console.log(`HONEST ${d.totals.honest}/${d.totals.honestOf} · SWAPPED ${d.totals.swapped}/${d.totals.swappedOf} · INVENTED ${d.totals.invented}/${d.totals.inventedOf} · ${d.totals.calls} calls, ${d.totals.seconds}s`);

  // SP-494 asks for every kept SWAPPED **and** INVENTED quote, with the span and the not-stated list.
  const bad = d.kept.filter((k) => k.case.startsWith("SWAPPED") || k.case.startsWith("INVENTED"));
  if (bad.length === 0) { console.log("\nNO SWAPPED OR INVENTED QUOTE WAS KEPT."); continue; }
  console.log(`\nEVERY KEPT SWAPPED / INVENTED QUOTE (${bad.length}) — masked per displayQuote:`);
  for (const [i, k] of bad.entries()) {
    const shown = displayQuote({ signalId: k.signalId, quote: k.quote, brand: "", sourceUrl: null, eventDate: null }, brands);
    console.log(`\n  ${String(i + 1).padStart(2)}. ${k.signalId}   bears on the host pattern's own need: ${k.bearsOnHostNeed ? "YES" : "NO"}`);
    console.log(`      case:      ${k.case}`);
    console.log(`      pattern:   ${k.pattern}`);
    console.log(`      quote:     ${(shown.text ?? "(no verified quote)").replace(/\s+/g, " ")}`);
    console.log(`      span:      ${k.states ? JSON.stringify(k.states) : "(none stored — pre-SP-494 row)"}`);
    console.log(`      not_stated:${k.notStated ? (k.notStated.length ? " " + JSON.stringify(k.notStated) : " [] (the judge says every part is stated)") : " (none stored)"}`);
    console.log(`      judge:     ${k.reason}`);
  }
  const swaps = bad.filter((k) => k.case.startsWith("SWAPPED"));
  const yes = swaps.filter((k) => k.bearsOnHostNeed).length;
  if (swaps.length) console.log(`\n  ${yes} of ${swaps.length} kept SWAP quote(s) DO bear on the host pattern's own need per need_evidence; ${swaps.length - yes} do NOT.`);
  console.log(`  spans rejected as non-verbatim this run: ${d.totals.spanRejects ?? "n/a"}`);

  // SP-498: every HONEST rejection, for classification by hand.
  const rej = d.rejectedHonest ?? [];
  console.log(`\n${"-".repeat(100)}\nEVERY HONEST REJECTION (${rej.length}) — for (a)/(b) classification:`);
  for (const [i, k] of rej.entries()) {
    const shown = displayQuote({ signalId: k.signalId, quote: k.quote, brand: "", sourceUrl: null, eventDate: null }, brands);
    console.log(`\n  ${String(i + 1).padStart(2)}. ${k.signalId}`);
    console.log(`      pattern:    ${k.pattern}`);
    console.log(`      quote:      ${(shown.text ?? "(no verified quote)").replace(/\s+/g, " ")}`);
    console.log(`      not_stated: ${JSON.stringify(k.notStated ?? [])}`);
    console.log(`      span:       ${k.states ? JSON.stringify(k.states) : "(empty)"}`);
    console.log(`      rejected:   ${k.rejected || "(by the not-stated list)"}`);
    console.log(`      reason:     ${k.reason}`);
  }
}
