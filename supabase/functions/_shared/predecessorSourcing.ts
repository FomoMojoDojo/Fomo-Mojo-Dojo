// ── R5-P (operator ruling, 2026-10-22): A PREDECESSOR LINE REACHES THE PROMPT ONLY IF ITS SPECIFICS SOURCE ──
//
// WHY. Spectrum's strategy refused on four attempts across two stage calls (audits 13246–13249) with
// byte-identical prompts before and after the excerpt blanking. The prompt's still-sourced block carried
// the current strategy 43542649's lines — "largest … in the U.S.", "across 45 states, including the newly
// acquired Cox footprint" — because each cites at least one row in the pool. But under R5 none of those
// rows carries page words for those specifics, so the model restated them and S1/N1 refused the restatement.
// The prompt asked for exactly what the gate forbids.
//
// THE RULE. A predecessor line enters the prompt (the still-sourced block) and is demanded by the
// continuity check ONLY IF every specific in it passes R5 against its OWN cited rows' text — the stage gate
// (s1Unsourced: figures, position words, reputation words, names) over rowTextOf, i.e. evidence_excerpt that
// is verified page words. Otherwise the line is WITHHELD: not shown, and continuity licenses its drop.
//
// The cited texts are read the way the promote re-check reads them (publicReadPromote.promoteS1Refusal):
// the predecessor's own ledger decides which cited ids are record/you rows and which are findings, and the
// texts are re-read LIVE through reReadRowTexts — so a row blanked or held since the predecessor was written
// stops sourcing it. One predicate, the stage's; never a second implementation of "sourced".
import { s1Unsourced, type SpecificKind } from "./classFactCheck.ts";
import { reReadRowTexts } from "./classSourcingScope.ts";
import { linesOfStoredPayload } from "./citedLines.ts";
import type { CitedLine } from "./stageContinuity.ts";

// deno-lint-ignore no-explicit-any
type AnySupabase = { from: (t: string) => any };

/** The identity of a predecessor line across the prompt site and the continuity check. */
export function predecessorLineKey(l: Pick<CitedLine, "field" | "text">): string {
  return `${l.field ?? ""}\u0000${l.text}`;
}

export type PredecessorVerdict = {
  field: string;
  text: string;
  cls: string | null;
  /** the specifics no cited row states; empty ⇒ the line may reach the prompt */
  unsourced: Array<{ kind: SpecificKind; token: string }>;
};

/** Pure: the verdict for every non-empty predecessor line. `classes` and `findingIds` come from the
 *  predecessor's own ledger; `textByRef` from a live R5 re-read. A line with no recognised class is
 *  checked as record — fail closed: an unclassed line has no licence to assert unsourced specifics. */
export function predecessorVerdicts(args: {
  lines: readonly CitedLine[];
  textByRef: Readonly<Record<string, string>>;
  classes: Readonly<Record<string, string>>;
  findingIds: ReadonlySet<string>;
  companyName?: string;
}): PredecessorVerdict[] {
  const out: PredecessorVerdict[] = [];
  for (const l of args.lines) {
    if (!l.text.trim()) continue;
    const cls = l.cls === "record" || l.cls === "you" || l.cls === "our_read" ? l.cls : "record";
    const cited = l.refs
      .filter((id) => !args.findingIds.has(id) && args.classes[id] !== "our_read")
      .map((id) => args.textByRef[id] ?? "");
    const r = s1Unsourced({ field: String(l.field ?? ""), text: l.text, cls, citedSourceTexts: cited, companyName: args.companyName });
    out.push({ field: String(l.field ?? ""), text: l.text, cls: l.cls, unsourced: r.unsourced });
  }
  return out;
}

/** The keys of the withheld lines. */
export function withheldKeysOf(verdicts: readonly PredecessorVerdict[]): Set<string> {
  return new Set(verdicts.filter((v) => v.unsourced.length > 0).map((v) => predecessorLineKey(v)));
}

/** Live: read the current read's lines, re-read every cited row through R5, and return the verdicts.
 *  No current read ⇒ nothing to withhold. */
export async function predecessorGate(
  supabase: AnySupabase,
  row: { payload?: Record<string, unknown> | null; input_ledger?: Record<string, unknown> | null } | null,
  companyName = "",
): Promise<{ verdicts: PredecessorVerdict[]; withheld: Set<string> }> {
  const lines = linesOfStoredPayload(row?.payload ?? null);
  if (lines.length === 0) return { verdicts: [], withheld: new Set() };
  const ledger = (row?.input_ledger ?? {}) as Record<string, unknown>;
  const classes = (ledger.classes ?? {}) as Record<string, string>;
  const findingIds = new Set(((ledger.by_kind ?? {}) as Record<string, string[]>).finding ?? []);
  const wanted = [...new Set(lines.flatMap((l) => l.refs))].filter((id) => !findingIds.has(id));
  const textByRef = wanted.length ? await reReadRowTexts(supabase, wanted) : {};
  const verdicts = predecessorVerdicts({ lines, textByRef, classes, findingIds, companyName });
  return { verdicts, withheld: withheldKeysOf(verdicts) };
}
