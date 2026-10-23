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
//   2026-10-13.2  Q1/Q2/Q3 — clause (7) refers only to what the prompt SHOWS (it named the
//                 company's current read, which the prompt does not contain, so its only referent
//                 was the ALREADY WRITTEN notice it contradicts); the notice now states how many
//                 further differentiators to write; clause (2)'s worked example no longer quotes a
//                 live row's sentence back at the model.
// C1-S (operator ruling, 2026-10-14): bumped because the GENERATION PROMPT changed — it now shows
// the model the current read's still-sourced lines and asks it to continue or improve each. Wasabi's
// FedRAMP line was dropped twice while C1 enforced its continuation and the prompt never mentioned
// it; a gate that enforces continuation of invisible lines is asking the model to guess.
// NP2 (operator ruling, 2026-10-15): bumped because the GENERATION PROMPT changed again — each
// still-sourced line now carries, beside it, the words NO row in the pool states verbatim
// ("no row in the pool states: … — drop them or cite a row that does"). Before this the model
// learned a word was unsupported only by being refused, and by then its one re-ask was spent:
// Wasabi's strategy lost "leading"/"unmatched" that way (10653) and its offering a label name
// (10655, 10656).
// U1 + NP2 wording (operator ruling, 2026-10-15): bumped again. The still-sourced block now names
// rows as bracketed tokens on EVERY attempt — at generation it had printed raw uuids, which
// CITE_RULE forbids the model to cite — and its unsupported-word note says "Keep this line. ...
// Remove those words, or cite a row that states them." The previous "drop them" was read as drop
// the LINE: Wasabi's re-asked strategy removed winning_aspiration entirely (10695 -> 10696).
// C1-U (operator ruling, 2026-10-15): bumped a third time. C1 no longer requires a continuing line
// to carry a specific that NO pool row states. Wasabi's strategy deadlocked on exactly that:
// S1b/NP2 ordered "leading" and "unmatched" removed, C1 required them carried, and the model was
// refused for complying (10738). The required set now excludes unsupportedByPool for that line —
// the same set NP2 prints in the prompt, from the same function. A dropped specific the pool CAN
// source still refuses.
// MODEL TRIAL (operator ruling, 2026-10-15): bumped a fourth time, because THE MODEL IS PART OF THE
// RULES. generate-public-read's generator moves from gpt-4.1-mini to gpt-4.1 on the public branch;
// the judge stays gpt-4.1-mini. A read produced by a different generator is not comparable to one
// produced by the old generator, so the version has to move with it — and the generator model id is
// now stamped inside every stored input_ledger beside this version, not only on the sibling columns.
// R5-P (operator ruling, 2026-10-22): bumped because the GENERATION PROMPT changed — a current-read line
// reaches the still-sourced block only if every specific in it passes R5 against its own cited rows
// (predecessorSourcing.ts). Spectrum's strategy restated 43542649's "45 states" / "largest" four times
// (13246–13249) because those lines were shown to the model while no row carried page words for them.
//   2026-10-15.4  MODEL TRIAL — generator gpt-4.1-mini -> gpt-4.1 (the previous value of this stamp).
//   2026-10-22.1  R5-P — R5-failing predecessor lines are withheld from the prompt.
// LEVEL + ALTERNATIVES (operator rulings 14 + 15, 2026-10-22): bumped because the GENERATION PROMPTS changed — the LEVEL
// rule joins the positioning, promise and strategy prompts (a value line states an outcome, a differentiator is relative
// to an alternative, the promise names a customer outcome, strategy speaks at the business level, product features belong
// only in the offering), positioning gains the cited `alternatives` field, level-flagged predecessor lines are withheld
// from the prompt and the strategy feed, and the judge is asked (g) LEVEL (reported).
//   2026-10-22.2  LEVEL + ALTERNATIVES.
// LEDGER BY CLASS + SOURCES BY FIELD (operator ruling 34, 2026-10-22): bumped because what the generator READS changed —
// the ledger is grouped under class headers (the record, your filings, you, our read) with filings tagged, positioning
// and strategy name which class each field is drawn from, and the continue block asks for a record or filing citation
// to be ADDED beside a carried line's own (keeping it, so C1 still counts the line as continued).
//   2026-10-22.3  LEDGER BY CLASS + SOURCES BY FIELD.
// R37 (operator ruling 39, 2026-10-22): bumped because what the model is SHOWN changed — a predecessor line whose content
// words are in none of its cited rows' verified page words is withheld from the prompt (never shown, never demanded,
// never carried), as R5-P withholds an unsourced specific. The commit-time re-stamp to our_read changes no prompt; the
// read's ledger names it separately (page_words_rule).
//   2026-10-22.4  R37 — page-words-failing predecessor lines are withheld.
export const GEN_RULES_VERSION = "2026-10-22.4" as const;
