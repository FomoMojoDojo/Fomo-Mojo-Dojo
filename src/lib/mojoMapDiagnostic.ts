import type { FileProposalRow, FrameworkResult, FrameworkFinding } from "@/hooks/useFileProposals";

export type DiagnosticFrameworkFinding = {
  framework: string;
  claim: string;
  evidence: string;
  confidence: "high" | "medium" | "low";
  mojoArea: string;
};

export type MojoMapDiagnostic = {
  sourceProposalId: string;
  isAccepted: boolean;
  headline: string;
  subhead: string | null;
  observations: string[];
  tensions: string[];
  missingEvidence: string[];
  questionsToInvestigate: string[];
  possibleImplications: string[];
  frameworkFindings: DiagnosticFrameworkFinding[];
  recommendedNextLearningStep: string | null;
};

// ── Selection logic ───────────────────────────────────────────────────────────
// Prefer accepted proposals; fall back to latest ready proposal as working analysis.

export function selectBestProposal(proposals: FileProposalRow[]): FileProposalRow | null {
  const ready = proposals.filter((p) => p.processing_state === "ready");
  if (ready.length === 0) return null;

  // Prefer mojo_analysis runs — they synthesize all company data.
  // Fall back to file proposals only when no mojo_analysis result exists.
  const mojoReady = ready.filter((p) => p.source_type === "mojo_analysis");
  const pool = mojoReady.length > 0 ? mojoReady : ready;

  const accepted = pool.filter((p) => p.status === "accepted");
  const candidates = accepted.length > 0 ? accepted : pool;

  return [...candidates].sort((a, b) => {
    const aTime = a.reviewed_at ?? a.processing_completed_at ?? a.created_at;
    const bTime = b.reviewed_at ?? b.processing_completed_at ?? b.created_at;
    return bTime.localeCompare(aTime);
  })[0] ?? null;
}

// ── Normalization ─────────────────────────────────────────────────────────────

function truncateHeadline(text: string, maxWords = 12): string {
  if (!text) return text;
  const words = text.split(/\s+/);
  if (words.length <= maxWords) return text;
  return words.slice(0, maxWords).join(" ").replace(/[,;:]$/, "") + "…";
}

export function normalizeToDiagnostic(proposal: FileProposalRow): MojoMapDiagnostic {
  const frameworkFindings: DiagnosticFrameworkFinding[] = proposal.framework_results.flatMap(
    (r: FrameworkResult) =>
      (r.findings ?? []).map((f: FrameworkFinding) => ({
        framework: r.framework ?? "",
        claim: f.claim ?? "",
        evidence: f.evidence ?? "",
        confidence: (f.confidence ?? "medium") as "high" | "medium" | "low",
        mojoArea: f.mojo_area ?? "",
      })),
  );

  const missingEvidence = [
    ...proposal.questions_to_verify,
    ...proposal.possible_gaps,
  ].filter(Boolean);

  const tensions = proposal.contradictions
    .map((c) => c.claim || c.conflicts_with || "")
    .filter(Boolean);

  const possibleImplications = proposal.experiments_to_run
    .map((e) => e.what_it_tests || e.experiment || "")
    .filter(Boolean);

  return {
    sourceProposalId: proposal.id,
    isAccepted: proposal.status === "accepted",
    headline: truncateHeadline(proposal.summary?.trim() || ""),
    subhead: proposal.confidence_reason?.trim() || proposal.evidence[0] || null,
    observations: proposal.evidence.filter(Boolean),
    tensions,
    missingEvidence,
    questionsToInvestigate: proposal.questions_to_verify.filter(Boolean),
    possibleImplications,
    frameworkFindings,
    recommendedNextLearningStep:
      proposal.questions_to_verify[0] ??
      proposal.experiments_to_run[0]?.what_it_tests ??
      null,
  };
}
