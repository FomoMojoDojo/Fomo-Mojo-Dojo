// V2-8 — Gap shrink: a set-aside verdict DEMOTES (never deletes) the open questions
// linked to that item. Pure partition so the screen (GapAct) and the leave-behind
// (exportHtml) shrink identically. A question is demoted when its anchor_identity is a
// set-aside item's identity; a linkless question (anchor_identity null) can never be
// demoted (honest — nothing to link it to). Order within each partition is preserved
// (unranked — no fabricated ranking).

export interface ShrinkableQuestion {
  question_text: string;
  anchor_identity: string | null;
}

export function partitionByShrink<T extends ShrinkableQuestion>(
  rows: T[],
  setAsideIdentities: Set<string>,
): { active: T[]; demoted: T[] } {
  const active: T[] = [];
  const demoted: T[] = [];
  for (const r of rows) {
    if (r.anchor_identity && setAsideIdentities.has(r.anchor_identity)) demoted.push(r);
    else active.push(r);
  }
  return { active, demoted };
}

// The collapsed demoted-group heading (with its live count). Client-facing DRAFT —
// PENDING OPERATOR SIGNATURE.
export const setAsideGroupHeading = (n: number): string => `Set aside by you · ${n}`;
