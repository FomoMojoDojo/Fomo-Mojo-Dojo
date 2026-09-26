// B2a — the Notion single-select's options must equal the seven MojoMap client_status values BYTE
// FOR BYTE. Not case-insensitively and not after trimming: the sync copies the string across, and a
// value Notion would accept but the DB CHECK would refuse (or the reverse) is a sync that fails on
// one row and leaves the pair disagreeing.
import { CLIENT_PORTAL_STATUSES } from "@/views/client/workshop/clientPortalStatuses";

export type StatusOptionComparison = {
  match: boolean;
  /** MojoMap values with no byte-identical Notion option. */
  missingInNotion: string[];
  /** Notion options that are not a MojoMap value. */
  extraInNotion: string[];
  /** Same set AND same order. Order is not load-bearing for the sync; reported for the operator. */
  sameOrder: boolean;
  /** Options that differ only by case or surrounding whitespace — the dangerous near-miss. */
  nearMisses: Array<{ notion: string; mojomap: string }>;
};

export function compareStatusOptions(notionOptionNames: readonly string[]): StatusOptionComparison {
  const mojo = CLIENT_PORTAL_STATUSES as readonly string[];
  const notion = notionOptionNames;
  const notionSet = new Set(notion);
  const mojoSet = new Set(mojo);

  const missingInNotion = mojo.filter((v) => !notionSet.has(v));
  const extraInNotion = notion.filter((v) => !mojoSet.has(v));

  const norm = (s: string) => s.trim().toLowerCase();
  const nearMisses: Array<{ notion: string; mojomap: string }> = [];
  for (const nOpt of extraInNotion) {
    const hit = missingInNotion.find((mOpt) => norm(mOpt) === norm(nOpt));
    if (hit) nearMisses.push({ notion: nOpt, mojomap: hit });
  }

  const sameOrder =
    notion.length === mojo.length && notion.every((v, i) => v === mojo[i]);

  return {
    match: missingInNotion.length === 0 && extraInNotion.length === 0,
    missingInNotion,
    extraInNotion,
    sameOrder,
    nearMisses,
  };
}
