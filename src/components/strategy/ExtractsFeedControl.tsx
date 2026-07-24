import FeedCorrectionsButton from "@/components/client-view/story/check/FeedCorrectionsButton";
import { useFirstReadFeedSession } from "@/hooks/useFirstReadFeedSession";

// OC-2d — the Extracts mount of the (unchanged, signed) corrections-feed control. Renders
// FeedCorrectionsButton ONLY when the company has a First Read session with verdicts to
// feed; honest absence (renders nothing) otherwise. Not a fork of the button — a thin
// mount that supplies the session id the Extracts surface didn't previously resolve.
export function ExtractsFeedControl({ companyId }: { companyId: string | undefined }) {
  const feedSessionId = useFirstReadFeedSession(companyId);
  if (!feedSessionId) return null;
  return (
    <div style={{ marginBottom: 16 }}>
      <FeedCorrectionsButton sessionId={feedSessionId} />
    </div>
  );
}
