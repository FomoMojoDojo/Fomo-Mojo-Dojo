// V2-9 — THE PLAN grounding law. Every plan stage must CITE a real on-the-table item
// (a confirmed heard-item or an open question) by content identity. A stage whose cite
// does not resolve to a live identity is UNGROUNDED and dropped — the deterministic
// backstop behind the 70b judge's semantic check. Plan-only: this carries no pricing.

export interface RawPlanStage {
  title: string;
  cite_identity: string | null;
  cite_kind: "question" | "confirmed";
}

export interface GroundedPlanStage {
  title: string;
  cite_identity: string;
  cite_kind: "question" | "confirmed";
}

/** Keep only stages whose cite_identity resolves to a live on-the-table identity of its
 *  declared kind. Order preserved. A stage with no/blank/unknown cite is dropped
 *  (ungrounded — never fabricated into the plan). */
export function groundPlanStages(
  stages: RawPlanStage[],
  questionIdentities: Set<string>,
  confirmedIdentities: Set<string>,
): GroundedPlanStage[] {
  const out: GroundedPlanStage[] = [];
  for (const s of stages) {
    const title = (s.title ?? "").trim();
    const id = (s.cite_identity ?? "").trim();
    if (!title || !id) continue;
    const valid = s.cite_kind === "question" ? questionIdentities.has(id) : confirmedIdentities.has(id);
    if (!valid) continue; // ungrounded — the cite doesn't resolve to a real item
    out.push({ title, cite_identity: id, cite_kind: s.cite_kind });
  }
  return out;
}
