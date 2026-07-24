// FR-FLOW-2a — the open-question → finding linkage LAW. Pure so the capture path
// (ingestPublicBaselineSignals) and the tests share ONE authority.
//
// A question row is linked to the finding it depends on BY CONTENT IDENTITY. The
// link is populated AT GENERATION time from a model-declared dependency and VERIFIED
// against the run's real finding identities:
//   * declared dependency resolves to a real finding identity → store the link.
//   * declared dependency resolves to NOTHING in the run (a bogus / hallucinated
//     finding) → REFUSED: stored linkless (finding_identity null), never fabricated.
//   * no declared dependency at all → linkless (honest absence).
// Never inferred after the fact — a link exists only when the generator declared it
// AND it matches a real finding.

import { contentIdentity } from "../../../supabase/functions/_shared/contentIdentity.ts";

export interface OpenQuestionLinkHint {
  question: string;
  depends_on: string; // the finding statement the question depends on, as the model named it
}

export interface OpenQuestionRow {
  company_id: string;
  run_id: string;
  question_text: string;
  question_identity: string;
  finding_identity: string | null;
}

export async function deriveOpenQuestionRows(args: {
  companyId: string;
  runId: string;
  questions: string[];
  /** Model-declared per-question dependencies (optional; from result_json.open_question_links). */
  linkHints?: OpenQuestionLinkHint[];
  /** Content identities of the run's REAL findings — a declared dependency must match one of these. */
  findingIdentities: Set<string>;
}): Promise<OpenQuestionRow[]> {
  const hintByQuestion = new Map<string, string>();
  for (const h of args.linkHints ?? []) {
    if (h && typeof h.question === "string" && typeof h.depends_on === "string" && h.depends_on.trim()) {
      hintByQuestion.set(h.question.trim(), h.depends_on.trim());
    }
  }

  const rows: OpenQuestionRow[] = [];
  const seen = new Set<string>(); // dedupe by question_identity within the run
  for (const raw of args.questions) {
    const question_text = typeof raw === "string" ? raw.trim() : "";
    if (!question_text) continue;
    const question_identity = await contentIdentity(question_text);
    if (seen.has(question_identity)) continue;
    seen.add(question_identity);

    let finding_identity: string | null = null;
    const dependsOn = hintByQuestion.get(question_text);
    if (dependsOn) {
      const candidate = await contentIdentity(dependsOn);
      // VERIFY: only a dependency that matches a REAL finding in this run becomes a link.
      finding_identity = args.findingIdentities.has(candidate) ? candidate : null;
    }

    rows.push({
      company_id: args.companyId,
      run_id: args.runId,
      question_text,
      question_identity,
      finding_identity,
    });
  }
  return rows;
}

// V2-4 — the anchored form the post-findings generator uses. Each question is generated
// FOR a specific anchor (a persisted finding body, or a publicly_silent claim-delta), so
// depends_on IS the anchor text — links resolve by construction. It routes through the
// SAME law (deriveOpenQuestionRows) for the finding case (verify against the run's real
// finding identities) and stamps provenance:
//   * finding      → finding_identity = the resolved link; anchor_identity == it.
//   * silent_delta → finding_identity NULL (no finding); anchor_identity = the delta's
//                    content identity (its own provenance link).
// A finding anchor whose identity does NOT match a real run finding still stores LINKLESS
// (finding_identity null) — the absence law stands.
export type QuestionSourceKind = "finding" | "silent_delta";

export interface QuestionAnchor {
  /** content identity of the dependency (finding body, or claim_delta content_identity). */
  identity: string;
  kind: QuestionSourceKind;
  /** the anchor statement verbatim — used as depends_on so the link resolves by construction. */
  text: string;
}

export interface AnchoredOpenQuestionRow extends OpenQuestionRow {
  source_kind: QuestionSourceKind;
  anchor_identity: string | null;
  status: "live";
}

export async function deriveAnchoredRows(args: {
  companyId: string;
  runId: string;
  anchor: QuestionAnchor;
  questions: string[];
  /** the run's REAL finding identities (verify target for a finding anchor). */
  findingIdentities: Set<string>;
}): Promise<AnchoredOpenQuestionRow[]> {
  const { companyId, runId, anchor, questions } = args;
  if (anchor.kind === "finding") {
    const base = await deriveOpenQuestionRows({
      companyId,
      runId,
      questions,
      linkHints: questions.map((q) => ({ question: q.trim(), depends_on: anchor.text })),
      findingIdentities: args.findingIdentities,
    });
    return base.map((r) => ({ ...r, source_kind: "finding", anchor_identity: r.finding_identity, status: "live" }));
  }
  // silent_delta: no finding link (empty verify set → finding_identity null), but the
  // delta is its own provenance anchor.
  const base = await deriveOpenQuestionRows({ companyId, runId, questions, linkHints: [], findingIdentities: new Set() });
  return base.map((r) => ({ ...r, source_kind: "silent_delta", anchor_identity: anchor.identity, status: "live" }));
}
