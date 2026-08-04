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
import ActRecap from "../ActRecap";
import { CHOOSE_RECAP } from "../recapCopy";

// ── Client-facing FIXED copy ─────────────────────────────────────────────────
// V2-9 SWEEP: freeze/machinery language removed from room copy (the freeze still
// happens silently at issuance). New strings PENDING OPERATOR SIGNATURE.
const ISSUE_LEAD = "Issuing sends the client their one-screen offer from this read."; // PENDING
const ISSUE_LABEL = "Issue proposal"; // OPERATOR-SIGNED 2026-07-23
const ISSUING_LABEL = "Generating…"; // OPERATOR-SIGNED 2026-07-23
export const REFUSED_BLOCK = "This section had no sourced data — withheld."; // OPERATOR-SIGNED
const NO_SESSION = "Start a session in The Check to build a proposal."; // OPERATOR-SIGNED
export const PLAN_HEADING = "The plan"; // V2-9 — PENDING OPERATOR SIGNATURE (shared: screen + export)
// The generated prose itself is signed per-render by the operator at acceptance.
// ─────────────────────────────────────────────────────────────────────────────

// Render-time guard: a block renders only if its server-built sources manifest carries at
// least one real reference. V2-9: open questions are now cited by content IDENTITY
// (open_question_identities) — indices are accepted for any legacy proposal but the
// generator no longer mints them. Empty → refused in place.
export function admitProposalBlock(block: ProposalBlock | null | undefined): boolean {
  const s = block?.sources;
  if (!s) return false;
  return !!(s.open_question_identities?.length || s.open_question_indices?.length || s.response_ids?.length || s.score_ref);
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

      {/* V2-9 THE PLAN — grounded staged deliverables (each cites a real item). Omitted
          honestly when no groundable plan exists; never fabricated. */}
      {(proposal.plan?.length ?? 0) > 0 && (
        <section className="cvs-fr-plan">
          <p className="cvs-fr-plan-heading">{PLAN_HEADING}</p>
          <ol className="cvs-fr-plan-list">
            {proposal.plan!.map((s, i) => (
              <li className="cvs-fr-plan-stage" key={s.cite_identity + i}>
                <span className="cvs-fr-plan-num">{i + 1}</span>
                <span className="cvs-fr-plan-title">{s.title}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* V2-9 SWEEP: no model name in room copy. */}
      <p className="cvs-fr-proposal-meta">Generated {fmtDate(proposal.generated_at)}</p>

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
      <>
        <ProposalRender
          proposal={proposal}
          companyId={companyId}
          sessionId={sessionId}
          onStartDiagnose={onStartDiagnose}
        />
        {/* Name-the-moves recap — only in the generated-proposal branch (else no plan). */}
        <ActRecap recap={CHOOSE_RECAP} hasContent />
      </>
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
