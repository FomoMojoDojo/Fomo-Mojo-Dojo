// ── P3 (operator ruling, 2026-10-13): the generation rules get a version ────────────────────────
//
// Until now nothing stamped WHICH INSTRUCTIONS produced a read. A stored read carried
// input_ledger.selection_version (which rows entered the pool), model_name (which model) and
// judge_verdict (what the judge answered) — and nothing at all about the prompt. So the reads
// generated before and after a specifics-rule rewrite were indistinguishable in the record, and no
// read could be attributed to the rules it was written under.
//
// SELECTION_VERSION is NOT the lever for this. It describes the selection step only, and two tests
// pin its literal (publicReadInputs.test.ts:81, publicReadSelection.test.ts:153) precisely so that
// bumping it claims the selection changed. Reusing it for a prompt change would be a false claim.
//
// ATTRIBUTION ONLY. Unlike PARSER_RULES_VERSION — which handler.ts:220 uses to RETRACT live items
// written under an older version — this stamp retracts nothing and gates nothing. A read or slot
// carrying an older version stays exactly as valid as it was; the stamp only lets a reader ask which
// rules produced it. (Absent = written before this ruling.)
//
// BUMP IT when the generation instructions change in a way that could change what the model writes:
// the SPECIFICS rule in either prompt, the per-kind GEN_* prompts, or the slot shortening rule. Do
// NOT bump it for a selection change (that is SELECTION_VERSION), a model change (model_name already
// says so), or a gate change (the gate decides what is ACCEPTED, not what is written).
//
//   2026-10-13.1  P1/P2 — the specifics rules rewritten for the fixed figure gate: a sourced
//                 specific is stated as its row states it, an unsourced one is left out rather than
//                 hedged, and a differentiator the current read carries is kept.
export const GEN_RULES_VERSION = "2026-10-13.1" as const;
