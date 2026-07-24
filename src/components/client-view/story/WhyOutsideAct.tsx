// V2-3 — Act 2 "Why We Start Outside": signed rationale + the journey exhibit.
//
// Pure method copy — no model, no company data, no register concern. The three Q&A
// blocks are OPERATOR-SIGNED (WHY_OUTSIDE_RATIONALE); the exhibit labels are PENDING
// (JOURNEY_VISUAL_LABELS). Both single-sourced with the leave-behind (exportHtml).

import { WHY_OUTSIDE_RATIONALE } from "@/lib/firstRead/whyOutside";
import JourneyVisual from "@/components/client-view/story/journey/JourneyVisual";

export default function WhyOutsideAct() {
  return (
    <div className="cvs-fr-whyoutside">
      <JourneyVisual />
      <div className="cvs-fr-whyoutside-rationale">
        {WHY_OUTSIDE_RATIONALE.map((b) => (
          <div key={b.q} className="cvs-fr-whyoutside-block">
            <p className="cvs-fr-whyoutside-q">{b.q}</p>
            <p className="cvs-fr-whyoutside-a">{b.a}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
