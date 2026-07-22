/*
 * ⚠️ TEMPORARY DEV HARNESS — First Read · Gate 2 (capture-write).
 * ───────────────────────────────────────────────────────────────────────────
 * This is NOT the product surface. It exists to exercise the Act 3 capture
 * pieces (useFirstReadCapture, CheckItemRow, CheckControl, CheckTally,
 * band-lift) against real company data on a real stylesheet, behind the admin
 * gate, until the real rail/sequencer lands.
 *
 * REMOVE / REPLACE AT GATE 3 (the /first-read/:companyId rail). Route:
 * /first-read-harness/:companyId?  — mounted in App.tsx, flagged there too.
 * ───────────────────────────────────────────────────────────────────────────
 */

import { useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useFirstReadCapture, type CheckItem, type Verdict } from "@/hooks/useFirstReadCapture";
import CheckItemRow from "@/components/client-view/story/check/CheckItemRow";
import CheckTally from "@/components/client-view/story/check/CheckTally";
import "@/styles/client-story.css";

// Default to Edgewood Center (findings + markets + differentiators all present)
// when no :companyId is supplied.
const DEFAULT_COMPANY = "3dd2cfbb-0792-4bf1-9cd4-15db9646874b";

export default function FirstReadHarness() {
  const params = useParams();
  const companyId = params.companyId || DEFAULT_COMPANY;
  const [sessionId, setSessionId] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);

  const { items, tally, loading, frozen, sessionStatus, setVerdict, refetchResponses } =
    useFirstReadCapture(companyId, sessionId || undefined);

  const createSession = async () => {
    setBusy(true);
    setRefusal(null);
    const { data, error } = await supabase
      .from("first_read_sessions")
      .insert({ company_id: companyId, presenter: "gate2-harness" })
      .select("id")
      .single();
    setBusy(false);
    if (error) {
      setRefusal(error.message);
      return;
    }
    setSessionId((data as { id: string }).id);
  };

  const onSet = async (item: CheckItem, v: Verdict, correction?: string) => {
    const msg = await setVerdict(item, v, correction);
    setRefusal(msg); // null on success; a graceful message on refusal
  };

  return (
    <div className="cvs-story" data-mm-theme="light">
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "32px 24px 80px" }}>
        <p className="cvs-check-harness-flag">
          ⚠ Dev harness — First Read Gate 2. Not the product surface. Remove at Gate 3.
        </p>

        <section className="cvs-act">
          <p className="cvs-act-eyebrow">The Check</p>
          <p className="cvs-support" style={{ marginTop: 0 }}>
            Every finding, market and differentiator — confirmed, corrected, or rejected by the
            client, in place.
          </p>

          <div className="cvs-check-session-bar">
            <button type="button" className="cvs-pill-primary" onClick={createSession} disabled={busy}>
              {sessionId ? "New session" : "Create session"}
            </button>
            <button
              type="button"
              className="cvs-pill-ghost"
              onClick={() => void refetchResponses()}
              disabled={!sessionId}
            >
              Reload
            </button>
            <span className="cvs-check-session-meta">
              {sessionId
                ? `session ${sessionId.slice(0, 8)}… · status ${sessionStatus ?? "…"}`
                : "no session yet"}
            </span>
          </div>

          {sessionId && <CheckTally tally={tally} />}

          {frozen && (
            <p className="cvs-check-frozen">
              This session is locked — the proposal has been issued. Verdicts can no longer change.
            </p>
          )}

          {refusal && !frozen && <p className="cvs-check-refusal">{refusal}</p>}
        </section>

        {!sessionId ? (
          <p className="cvs-support">Create a session to begin capturing verdicts.</p>
        ) : loading ? (
          <p className="cvs-support">Loading items…</p>
        ) : items.length === 0 ? (
          <p className="cvs-support">No checkable items for this company.</p>
        ) : (
          <div className="cvs-check-list">
            {items.map((item) => (
              <CheckItemRow key={item.identity} item={item} onSet={onSet} disabled={frozen} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
