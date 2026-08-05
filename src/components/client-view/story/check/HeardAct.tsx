// V2-9 — Act 5 beat 1: "What We Heard". A deterministic playback of the client's own
// verdicts, grouped, in their terms — NO model. Renders LIVE as the Check happens
// (pre-issuance) and stays as the frozen record post-issuance (it reads the same
// first_read_responses the tally does). No bars, plain English, no machinery language.

import { useFirstReadCapture } from "@/hooks/useFirstReadCapture";
import { useReadState } from "@/hooks/useAsyncRead";
import { ActData } from "@/components/client-view/story/ActData";
import { groupHeardItems, heardTotal, HEARD_GROUPS, HEARD_EMPTY } from "@/lib/firstRead/heard";

export default function HeardAct({ companyId, sessionId }: { companyId?: string; sessionId?: string }) {
  // GATE C-2b (Option 1, operator-signed) — gate on useFirstReadCapture's AGGREGATE read-state,
  // which covers ALL of its sub-reads (findings / markets / canvas / delta / verdict-responses).
  // A failed / never-returning sub-read renders the signed error via <ActData> instead of
  // HEARD_EMPTY "Nothing recorded yet…" — which a swallowed error was rendering as a false
  // "you've given no verdicts". HEARD_EMPTY is reachable ONLY in the ready branch now (a genuine
  // successful read with zero recorded verdicts — byte-identical to before). The aggregate
  // over-reports by design (any one sub-read failing shows the error); the ruling accepts a
  // visible "we couldn't load this" over a silent false absence.
  const { items, readLoading, readError } = useFirstReadCapture(companyId, sessionId || undefined);
  const state = useReadState<typeof items>(readLoading, readError, items, `${companyId ?? ""}:${sessionId ?? ""}`);

  return (
    <ActData state={state} loading={null}>
      {(items) => {
        const grouped = groupHeardItems(items);
        if (heardTotal(grouped) === 0) {
          return <p className="cvs-support cvs-heard-empty">{HEARD_EMPTY}</p>;
        }
        return (
          <div className="cvs-heard">
            {HEARD_GROUPS.map((g) => {
              const rows = grouped[g.key];
              if (rows.length === 0) return null; // omit empty groups (honest — nothing to play back)
              return (
                <section className="cvs-heard-group" key={g.key} aria-label={g.heading}>
                  <p className="cvs-heard-heading">{g.heading} · {rows.length}</p>
                  <ul className="cvs-heard-list">
                    {rows.map((r) => (
                      <li className="cvs-heard-item" key={r.identity}>{r.text}</li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        );
      }}
    </ActData>
  );
}
