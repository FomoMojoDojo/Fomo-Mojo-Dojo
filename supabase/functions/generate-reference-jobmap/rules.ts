// ── Reference job-map RULES (operator methodology change M, signed 2026-09-18) ────────────────────
//
// "A step names the executor's goal at that stage, never the means — no product, tool, brand, vendor,
// prescribed method, mechanism, document, or channel." Three layers, one version:
//   (1) GEN_SYSTEM's solution-agnostic sentence names mechanism, document and channel (index.ts);
//   (2) JUDGE_SYSTEM rejects a step that names a mechanism, document or channel instead of the goal, and
//       always states its reason, on pass and on reject (index.ts);
//   (3) the deterministic guard gains ONLY proposal(s) / application(s) — scoped HERE, to the reference-map
//       guard: the shared list (_shared/jtbdProcess.ts) also polices local-jobmap-synthesis (strict market
//       runs repair/refuse labels), research-company (subtitles) and the workshop panels, and the operator
//       kept those writers unchanged. form / report / meeting / call / email / site visit / portal stay
//       with the model layers (they are verbs or legitimate goal words elsewhere).
// Rows written under the rule carry taxonomy_version fd1-priority-8.1.
export const RULES_VERSION = "2026-09-18.1";
export const TAXONOMY_VERSION = "fd1-priority-8.1";
export const TAXONOMY_VERSION_BEFORE_RULES = "fd1-priority-8";

/** The two new deterministic terms (reference-map guard only). */
export const MEANS_TERMS = ["proposal", "proposals", "application", "applications"] as const;
const MEANS_PATTERN = new RegExp(`\\b(${MEANS_TERMS.join("|")})\\b`, "i");

/** True when a label or description names one of the deterministic means terms (whole word, any case). */
export function containsMeansTerm(value: string | null | undefined): boolean {
  return MEANS_PATTERN.test(String(value ?? ""));
}

/** The steps that trip the means guard, with the tripped words — the generator's regeneration feedback. */
export function meansViolations(steps: ReadonlyArray<{ step_key: string; step_label: string; description: string }>): Array<{ step_key: string; words: string[] }> {
  const out: Array<{ step_key: string; words: string[] }> = [];
  for (const s of steps) {
    const text = `${s.step_label} ${s.description}`;
    const words = MEANS_TERMS.filter((w) => new RegExp(`\\b${w}\\b`, "i").test(text));
    if (words.length) out.push({ step_key: s.step_key, words: [...words] });
  }
  return out;
}
