// V2-9 — Act 5 "What We Heard": deterministic playback of the client's OWN verdicts,
// grouped by verdict. NO model — it's their words and their calls, read straight from the
// session (first_read_responses via useFirstReadCapture). Single-sourced so the screen
// (HeardAct) and the leave-behind (exportHtml) group + label identically.
//
// All group headings + the honest-empty line are client-facing DRAFTS — PENDING OPERATOR
// SIGNATURE. (The tally segment labels are already signed in checkItemView.)

import type { CheckItem } from "@/hooks/useFirstReadCapture";

export type HeardGroupKey = "confirmed" | "corrected" | "rejected" | "not_important";

export interface HeardGroupCopy {
  key: HeardGroupKey;
  heading: string;
}

// Order mirrors the tally (confirmed → refined → wrong → set aside). All four verdicts are
// played back — hiding one the client gave would not be honest.
export const HEARD_GROUPS: readonly HeardGroupCopy[] = [
  { key: "confirmed", heading: "What you confirmed" },
  { key: "corrected", heading: "What you refined" },
  { key: "rejected", heading: "What you flagged as wrong" },
  { key: "not_important", heading: "What you set aside" },
] as const;

export const HEARD_EMPTY = "Nothing recorded yet — the verdicts you give in the Check show up here.";

export interface HeardItem {
  identity: string;
  /** the statement in the client's terms — for a correction, their correction text. */
  text: string;
  kind: CheckItem["kind"];
}

/** Group the checked items by the verdict the client gave. Deterministic; a corrected item
 *  plays back the client's CORRECTION (their words), not the original. Items with no
 *  verdict are omitted (nothing was heard about them). */
export function groupHeardItems(items: CheckItem[]): Record<HeardGroupKey, HeardItem[]> {
  const out: Record<HeardGroupKey, HeardItem[]> = { confirmed: [], corrected: [], rejected: [], not_important: [] };
  for (const it of items) {
    if (!it.verdict) continue;
    const text = it.verdict === "corrected" ? (it.correctionText?.trim() || it.text) : it.text;
    out[it.verdict].push({ identity: it.identity, text, kind: it.kind });
  }
  return out;
}

export const heardTotal = (g: Record<HeardGroupKey, HeardItem[]>): number =>
  HEARD_GROUPS.reduce((n, grp) => n + g[grp.key].length, 0);
