// V2-9 — Act 5 beat 1: "What We Heard". A deterministic playback of the client's own
// verdicts, grouped, in their terms — NO model. Renders LIVE as the Check happens
// (pre-issuance) and stays as the frozen record post-issuance (it reads the same
// first_read_responses the tally does). No bars, plain English, no machinery language.

import { useFirstReadCapture } from "@/hooks/useFirstReadCapture";
import { groupHeardItems, heardTotal, HEARD_GROUPS, HEARD_EMPTY } from "@/lib/firstRead/heard";

export default function HeardAct({ companyId, sessionId }: { companyId?: string; sessionId?: string }) {
  const { items, loading } = useFirstReadCapture(companyId, sessionId || undefined);

  if (loading) return null;
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
}
