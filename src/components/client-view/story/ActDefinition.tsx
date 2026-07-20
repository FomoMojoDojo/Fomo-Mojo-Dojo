/*
 * DEF-1 — the act definitional device (client story). One short, visually
 * subordinate line that defines an act's core concept, sitting between the act
 * eyebrow and the act's content.
 *
 * ══ SUPPRESSION IS THE POINT — DO NOT BYPASS ═════════════════════════════════
 * `hasContent` is REQUIRED. The definition renders ONLY when the act has real
 * instance content; on honest-empty it is fully suppressed. An act that shows a
 * definition with nothing under it is a standalone block of company-agnostic
 * content — the EOV-1 failure class that got the Elements of Value pyramids
 * pulled from this story. Definitional copy is permitted ONLY as scaffolding
 * that frames the client's OWN content on the same surface.
 *
 * This is not a hypothetical edge: with today's data, two of three named
 * fixtures (FomoMojoDojo, Sonos) render Act A empty, so unsuppressed definitions
 * would be the DEFAULT state for them, not a corner case.
 *
 * Because `hasContent` is a required prop, no act can mount this device without
 * deciding the question. The `.cvs-act-def` class is declared here and NOWHERE
 * else — never hand-roll the markup; always mount through this component.
 *
 * Definition copy is OPERATOR-SIGNED at the call site and passed in verbatim.
 * This component never authors, formats, or punctuates copy.
 */

export default function ActDefinition({
  definition,
  hasContent,
}: {
  /** Operator-signed copy, rendered verbatim. */
  definition: string;
  /** True only when the act is rendering real instance content. */
  hasContent: boolean;
}) {
  if (!hasContent) return null;
  return <p className="cvs-act-def">{definition}</p>;
}
