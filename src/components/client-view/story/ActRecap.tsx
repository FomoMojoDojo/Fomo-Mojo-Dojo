/*
 * NAME-THE-MOVES — the act RECAP device (client story). A thin sibling of ActDefinition
 * (DEF-1): the SAME teaching register (.cvs-act-def — subordinate italic, --mm-label-dim),
 * but placed at the END of an act to name the move that just happened ("recaps are reps",
 * 2026-07-27). Definition opens an act; recap closes it — different semantics, so this is
 * its own component, NOT a variant of ActDefinition (whose doc reserves .cvs-act-def to
 * itself and is "definition" by name; we reuse the class only, no new visual, no bar).
 *
 * ══ SUPPRESSION IS THE POINT — DO NOT BYPASS ═════════════════════════════════
 * `hasContent` is REQUIRED, NO default. The recap renders ONLY when its act rendered real
 * instance content; on honest-empty it is fully suppressed. A "here's what just happened"
 * line above nothing is the EOV-1 failure class — a company-agnostic block standing alone.
 *
 * Only METHOD copy passes here (a fact about how the work is done, identical for every
 * client) — never a SITUATION result summary (that is generated, never hand-authored).
 * Copy is OPERATOR-SIGNED at the call site and rendered verbatim; this component never
 * authors, formats, or punctuates.
 */

export default function ActRecap({
  recap,
  hasContent,
}: {
  /** Operator-signed METHOD line, rendered verbatim. */
  recap: string;
  /** True only when the act is rendering real instance content. */
  hasContent: boolean;
}) {
  if (!hasContent) return null;
  return <p className="cvs-act-def" data-act-recap="">{recap}</p>;
}
