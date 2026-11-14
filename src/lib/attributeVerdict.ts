// SP-329 (BRIEF-17): a `contradicted` attribute is NOT a strength. Every surface that renders the
// "What makes you different" list reads it through strengthAttributes(); the contradicted items render,
// where they render at all, in their own list under S-POS-1 ("Where outside voices disagree").
//
// WRITES KEEP THE WHOLE LIST. A list editor that shows only the strengths must save
// withContradicted(edited, all) — otherwise editing the visible list would silently drop the
// contradicted items from the stored canvas.
//
// Guard: scripts/guards/strengths-contradicted-guard.sh.

type WithStatus = { evidence_status?: string | null };

export function isContradictedAttribute(item: WithStatus | null | undefined): boolean {
  return item?.evidence_status === "contradicted";
}

/** The "What makes you different" list: every attribute that is NOT contradicted, in order. */
export function strengthAttributes<T extends WithStatus>(items: readonly T[] | null | undefined): T[] {
  return (items ?? []).filter((item) => !isContradictedAttribute(item));
}

/** The S-POS-1 list: the contradicted attributes, in order. */
export function contradictedAttributes<T extends WithStatus>(items: readonly T[] | null | undefined): T[] {
  return (items ?? []).filter((item) => isContradictedAttribute(item));
}

/** What a strengths-only editor saves: its edited list, with the contradicted items carried along. */
export function withContradicted<T extends WithStatus>(editedStrengths: readonly T[], all: readonly T[] | null | undefined): T[] {
  return [...editedStrengths.filter((item) => !isContradictedAttribute(item)), ...contradictedAttributes(all)];
}
