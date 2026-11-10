// MH1 · BEFORE — PORTED FROM routes/index.tsx (the past zone).
//
// THE HANDOFF'S TIMELINE, number for number: a 330px block centred on the band with the hairline at
// 170, an 18px ring on the hairline at each event, a dashed stem of 80px up or 52px down, and a
// 190px recessed card at 30 (above) or 222 (below). Events alternate, the first one below.
//
// TWO CARDS ARE OMITTED, NOT FAKED:
//   · "First visit" — the first-visit date is MISSING from every store (DATA MAPPING), and the spec's
//     own rule is "no placeholder dates on a live screen", so the card does not render.
//   · "What the first visit settled" — its three lines are mark statements, and the mark is P4.
// A company with no first_read_sessions row loses the First Read card the same way.
import { HOME } from "../strings";
import { countSegments, formatDate, type DiagnoseData } from "../useDiagnoseData";

type Point = { key: string; date: string; title: string; note: string | null };

/** The handoff spaces its four events at x 70 · 300 · 500 · 620; ours are dated rows, so they take
 *  the same left inset and the same first interval. */
const X0 = 70;
const STEP = 230;

export function Before({ data }: { data: DiagnoseData }) {
  const points: Point[] = [];

  const firstRead = formatDate(data.firstReadStartedAt);
  if (firstRead) {
    points.push({ key: "first-read", date: firstRead, title: HOME.firstReadCard, note: HOME.firstReadNote });
  }

  const uploads = data.documents.map((d) => d.uploadedAt).filter((v): v is string => typeof v === "string");
  const latest = uploads.length > 0 ? uploads.slice().sort().slice(-1)[0] : null;
  const documentsIn = formatDate(latest);
  if (documentsIn) {
    const sent = data.documents.length;
    const added = data.documents.filter((d) => d.added).length;
    points.push({
      key: "documents-in",
      date: documentsIn,
      title: HOME.documentsInCard,
      // G3: a zero segment is dropped, so a company with nothing added shows only the sent count.
      note: countSegments([
        { n: sent, text: HOME.documentsInNote(sent, added).split(" · ")[0] },
        { n: added, text: HOME.documentsInNote(sent, added).split(" · ")[1] ?? "" },
      ]).join(" · ") || null,
    });
  }

  return (
    <section className="dg-sec dg-sec--before" data-dg-section="before" id="dg-before">
      <span className="dg-mono">{HOME.before}</span>
      <div className="dg-band">
        <div className="dg-timeline">
          <span className="dg-tl-axis" />
          {points.map((p, i) => (
            <div
              className="dg-tl-point"
              key={p.key}
              data-side={i % 2 === 1 ? "above" : "below"}
              style={{ left: X0 + i * STEP }}
            >
              <span className="dg-tl-stem" />
              <span className="dg-tl-ring" />
              <span className="dg-tl-card">
                <span className="dg-mono">{p.date}</span>
                <span className="dg-tl-title">{p.title}</span>
                {p.note ? <span className="dg-tl-note">{p.note}</span> : null}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
