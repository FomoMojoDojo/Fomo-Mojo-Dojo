// First Read — count-aware wording. One helper, so no template concatenates a bare count with a
// fixed noun again.
//
// WHY: Riverlane's cold open read "You say 1 things about yourself. The public record echoes none of
// them and contradicts 1." Two faults in one sentence — a plural noun on a count of one, and a
// plural antecedent ("them") for a single statement. The census found four client-visible templates
// with this shape and one, the contradiction "why" line, that had already solved it inline.
//
// English pluralises on n !== 1, NOT on n > 1: zero takes the plural ("0 sources"), and so does a
// negative, which should never reach here but must not silently read as singular.

/** Pick the wording for a count. `plural` is used for every n except exactly 1. */
export function plural(n: number, singular: string, plural: string): string {
  return n === 1 ? singular : plural;
}
