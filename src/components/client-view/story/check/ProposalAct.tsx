/*
 * First Read · Act 5 — The Proposal (content). Replaces the Gate 3 dev note.
 *
 * Pre-issuance (session open): the "Issue proposal" control. Issuing calls the
 * generator, which — on success — freezes the session and persists the proposal;
 * honest-empty / failure leave the session open for retry (no canned proposal).
 *
 * Post-issuance: renders the persisted proposal deterministically. Render-time
 * guard: a prose block whose sources manifest is empty is REFUSED (honest-empty
 * in its place) — prose with no real data behind it never renders. Ends in the
 * reused Start Diagnose control (OutsideNextMoveAct).
 */

import { useFirstReadProposal, type Proposal, type ProposalBlock } from "@/hooks/useFirstReadProposal";
import OutsideNextMoveAct from "@/components/client-view/story/OutsideNextMoveAct";
import ExportButton from "./ExportButton";
import FeedCorrectionsButton from "./FeedCorrectionsButton";

// ── Client-facing FIXED copy — PENDING OPERATOR SIGNATURE (Gate 4) ───────────
const ISSUE_LEAD = "Issuing the proposal freezes the client's verdicts and generates their one-screen offer from this read.";
const ISSUE_LABEL = "Issue proposal";
const ISSUING_LABEL = "Generating…";
export const REFUSED_BLOCK = "This section had no sourced data — withheld.";
const NO_SESSION = "Start a session in The Check to build a proposal.";
// The generated prose itself is signed per-render by the operator at acceptance.
// ─────────────────────────────────────────────────────────────────────────────

// Render-time guard: a block renders only if its server-built sources manifest
// carries at least one real reference. Empty → refused in place.
export function admitProposalBlock(block: ProposalBlock | null | undefined): boolean {
  const s = block?.sources;
  if (!s) return false;
  return !!(s.open_question_indices?.length || s.response_ids?.length || s.score_ref);
}

function fmtDate(iso?: string): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function ProposalRender({
  proposal,
  companyId,
  sessionId,
  onStartDiagnose,
}: {
  proposal: Proposal;
  companyId?: string;
  sessionId?: string;
  onStartDiagnose: () => void;
}) {
  const blocks = proposal.blocks ?? [];
  const headlineOk = !!proposal.headline && admitProposalBlock({
    key: "headline",
    heading: "",
    body: proposal.headline,
    sources: proposal.headline_sources ?? {},
  });

  return (
    <div className="cvs-fr-proposal">
      {headlineOk && <h2 className="cvs-fr-proposal-headline">{proposal.headline}</h2>}

      {blocks.map((b, i) =>
        admitProposalBlock(b) ? (
          <section className="cvs-fr-proposal-block" key={i}>
            <p className="cvs-fr-proposal-heading">{b.heading}</p>
            <p className="cvs-fr-proposal-body">{b.body}</p>
          </section>
        ) : (
          <p className="cvs-fr-proposal-refused" key={i}>{REFUSED_BLOCK}</p>
        ),
      )}

      <p className="cvs-fr-proposal-meta">
        Generated {fmtDate(proposal.generated_at)} · {proposal.trace?.model ?? "model"}
      </p>

      {companyId && sessionId && (
        <ExportButton companyId={companyId} sessionId={sessionId} proposal={proposal} />
      )}
      {sessionId && <FeedCorrectionsButton sessionId={sessionId} />}

      <OutsideNextMoveAct onStartDiagnose={onStartDiagnose} />
    </div>
  );
}

export default function ProposalAct({
  companyId,
  sessionId,
  onIssued,
  onStartDiagnose,
}: {
  companyId?: string;
  sessionId?: string;
  onIssued?: () => void;
  onStartDiagnose: () => void;
}) {
  const { proposal, loading, issuing, error, emptyRefusal, issue } = useFirstReadProposal(sessionId);

  if (!sessionId) return <p className="cvs-support">{NO_SESSION}</p>;
  if (loading) return <p className="cvs-support">Loading…</p>;

  if (proposal?.status === "generated") {
    return (
      <ProposalRender
        proposal={proposal}
        companyId={companyId}
        sessionId={sessionId}
        onStartDiagnose={onStartDiagnose}
      />
    );
  }

  const onIssue = async () => {
    const result = await issue();
    if (result === "generated") onIssued?.();
  };

  return (
    <div className="cvs-fr-proposal-issue">
      <p className="cvs-support">{ISSUE_LEAD}</p>
      {emptyRefusal && <p className="cvs-fr-proposal-empty">{emptyRefusal}</p>}
      {error && <p className="cvs-check-refusal">{error}</p>}
      <button type="button" className="cvs-pill-primary" onClick={onIssue} disabled={issuing}>
        {issuing ? ISSUING_LABEL : ISSUE_LABEL}
      </button>
    </div>
  );
}
