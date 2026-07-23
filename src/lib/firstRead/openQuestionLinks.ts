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
