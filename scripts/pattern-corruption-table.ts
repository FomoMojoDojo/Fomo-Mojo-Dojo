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

/** v3: a verdict is per PART, so the span and the reason are per part too. The v2 spelling (`states`,
 *  `rejected` at the top level) is still read, so an older harness file still prints rather than
 *  crashing — and it is LABELLED as pre-v3 rather than silently shown as if it were the same thing. */
type PartVerdict = { ordinal: number; states: boolean; span: string; reason: string; rejected: string };
type Kept = { case: string; pattern: string; parts?: string[]; signalId: string; quote: string; bearsOnHostNeed: boolean;
  reason: string; partVerdicts?: PartVerdict[]; states?: string; notStated?: string[] };
type Rejected = { case: string; pattern: string; parts?: string[]; signalId: string; quote: string;
  reason: string; partVerdicts?: PartVerdict[]; states?: string; notStated?: string[]; rejected?: string };
type Out = {
  label: string; a: string; b: string; aParts?: string[]; bParts?: string[];
  /** SP-517: which judge model produced these numbers. Two models face the same pairs, so a table
   *  that does not name the model is not attributable to either. */
  judgeModel?: string;
  calls?: number; ledgered?: number;
  /** SP-517/SP-502: the pair is a pre-v3 row, so its parts were supplied by hand. Printed, because a
   *  test whose inputs were written by hand must say so wherever its numbers are read. */
  partsSupplied?: { a: boolean; b: boolean };
  /** SP-514: the re-ask is a corruption surface of its own — a retry that talks a lenient judge into
   *  a span for a SWAPPED quote would show up here. */
  spanReask?: { reasks: number; recovered: number; failedTwice: number };
  invented?: string; inventedParts?: string[];
  rejectedHonest?: Rejected[];
  overlap: { shared: number; a_on_b: number; b_on_a: number };
  totals: Record<string, number>;
  perPart?: Record<string, number[]>;
  kept: Kept[];
};

/** The per-part lines, or the v2 single span when the file predates v3. */
function partLines(k: Kept | Rejected): string[] {
  if (k.partVerdicts?.length) {
    return k.partVerdicts.map((pv) => {
      const pred = k.parts?.[pv.ordinal - 1] ?? `part ${pv.ordinal}`;
      const verdict = pv.states ? "STATED" : pv.rejected ? `NOT STATED (${pv.rejected})` : "NOT STATED";
      return `      part ${pv.ordinal}:    ${verdict}  "${pred}"\n` +
             `                  span: ${pv.span ? JSON.stringify(pv.span) : "(none)"}` +
             (pv.reason ? `  — ${pv.reason}` : "");
    });
  }
  return [`      span:      ${k.states ? JSON.stringify(k.states) : "(none stored — pre-v3 row, one span for the whole claim)"}`];
}

const brands = brandWords("Charter Communications", ["spectrum", "cox", "brand_not_recorded"]);

for (const file of process.argv.slice(2)) {
  const d = JSON.parse(readFileSync(file, "utf8")) as Out;
  console.log(`\n${"=".repeat(100)}\n${d.label}${d.judgeModel ? `   judge model: ${d.judgeModel}` : ""}\n${"=".repeat(100)}`);
  if (d.partsSupplied && (d.partsSupplied.a || d.partsSupplied.b)) {
    console.log(`PARTS SUPPLIED BY HAND: ${[d.partsSupplied.a ? "A" : "", d.partsSupplied.b ? "B" : ""].filter(Boolean).join(" and ")}` +
      ` — the stored pair is a pre-v3 row with no parts, and minting v3 rows is out of scope.`);
  }
  if (d.spanReask) {
    console.log(`SP-514 span re-ask: ${d.spanReask.reasks} quote(s) re-asked · ${d.spanReask.recovered} part(s) recovered · ${d.spanReask.failedTwice} failed twice`);
  }
  if (d.calls !== undefined) console.log(`SP-518: ${d.ledgered ?? 0} of ${d.calls} call(s) ledgered`);
  console.log(`A = "${d.a}"${d.aParts?.length ? `\n     parts: ${d.aParts.map((x, i) => `${i + 1}. ${x}`).join(" · ")}` : ""}`);
  console.log(`B = "${d.b}"${d.bParts?.length ? `\n     parts: ${d.bParts.map((x, i) => `${i + 1}. ${x}`).join(" · ")}` : ""}`);
  if (d.invented) console.log(`INVENTED = "${d.invented}"${d.inventedParts?.length ? `\n     parts: ${d.inventedParts.map((x, i) => `${i + 1}. ${x}`).join(" · ")}` : ""}`);
  console.log(`overlap in need_evidence — shared supporting quotes ${d.overlap.shared} · A's on B's need ${d.overlap.a_on_b} · B's on A's need ${d.overlap.b_on_a}`);
  console.log(`HONEST ${d.totals.honest}/${d.totals.honestOf} · SWAPPED ${d.totals.swapped}/${d.totals.swappedOf} · INVENTED ${d.totals.invented}/${d.totals.inventedOf} · ${d.totals.calls} calls, ${d.totals.seconds}s`);

  // SP-494 asks for every kept SWAPPED **and** INVENTED quote, with the span and the not-stated list.
  const bad = d.kept.filter((k) => k.case.startsWith("SWAPPED") || k.case.startsWith("INVENTED"));
  // NOT `continue` ON ZERO. It used to skip the rest of the loop here, which skipped the HONEST
  // REJECTION list below — so on a run where the judge rejected every corrupted quote, the one
  // output SP-498/SP-500 require was silently withheld, in exactly the case where it matters most.
  if (bad.length === 0) console.log("\nNO SWAPPED OR INVENTED QUOTE WAS KEPT.");
  else console.log(`\nEVERY KEPT SWAPPED / INVENTED QUOTE (${bad.length}) — masked per displayQuote:`);
  for (const [i, k] of bad.entries()) {
    const shown = displayQuote({ signalId: k.signalId, quote: k.quote, brand: "", sourceUrl: null, eventDate: null }, brands);
    console.log(`\n  ${String(i + 1).padStart(2)}. ${k.signalId}   bears on the host pattern's own need: ${k.bearsOnHostNeed ? "YES" : "NO"}`);
    console.log(`      case:      ${k.case}`);
    console.log(`      pattern:   ${k.pattern}`);
    console.log(`      quote:     ${(shown.text ?? "(no verified quote)").replace(/\s+/g, " ")}`);
    for (const line of partLines(k)) console.log(line);
    console.log(`      not_stated:${k.notStated ? (k.notStated.length ? " " + JSON.stringify(k.notStated) : " [] (every part states, with a verbatim span)") : " (none stored)"}`);
    console.log(`      judge:     ${k.reason}`);
  }
  const swaps = bad.filter((k) => k.case.startsWith("SWAPPED"));
  const yes = swaps.filter((k) => k.bearsOnHostNeed).length;
  if (swaps.length) console.log(`\n  ${yes} of ${swaps.length} kept SWAP quote(s) DO bear on the host pattern's own need per need_evidence; ${swaps.length - yes} do NOT.`);
  console.log(`  part spans rejected as non-verbatim this run: ${d.totals.spanRejects ?? "n/a"}`);
  // SP-502's claim is that the COMPOUND was the problem. These are the numbers that test it: if one
  // part states far less often than the others, that part is the one carrying the rejection.
  if (d.perPart) {
    console.log("\n  PER-PART STATED COUNTS (the SP-502 question: is one part carrying the rejections?)");
    for (const [caseName, counts] of Object.entries(d.perPart)) {
      const parts = caseName.toLowerCase().includes("invented") ? d.inventedParts
        : caseName.endsWith("A") ? d.aParts : d.bParts;
      console.log(`    ${caseName.padEnd(10)} ${counts.map((n, i) => `${n} "${(parts?.[i] ?? `part ${i + 1}`).slice(0, 34)}"`).join(" · ")}`);
    }
  }

  // SP-498: every HONEST rejection, for classification by hand.
  const rej = d.rejectedHonest ?? [];
  console.log(`\n${"-".repeat(100)}\nEVERY HONEST REJECTION (${rej.length}) — for (a)/(b) classification:`);
  for (const [i, k] of rej.entries()) {
    const shown = displayQuote({ signalId: k.signalId, quote: k.quote, brand: "", sourceUrl: null, eventDate: null }, brands);
    console.log(`\n  ${String(i + 1).padStart(2)}. ${k.signalId}`);
    console.log(`      pattern:    ${k.pattern}`);
    console.log(`      quote:      ${(shown.text ?? "(no verified quote)").replace(/\s+/g, " ")}`);
    console.log(`      not_stated: ${JSON.stringify(k.notStated ?? [])}`);
    for (const line of partLines(k)) console.log(line);
    console.log(`      reason:     ${k.reason}`);
  }
}
