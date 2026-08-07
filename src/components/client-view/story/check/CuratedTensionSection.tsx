// SELF-CONSISTENCY — the curated single-instance exhibit (First Read · The Check, Act 4).
//
// Renders ONE operator-curated pair ABOVE the say-vs-see exhibit: the flagship declared
// promise beside the public record's own admitted difficulty, register-labeled and NEVER
// blended. This is a CURATION, not a verdict — there are NO response buttons; the client is
// invited to a conversation, not asked to rule. The exhibit is quote-less by nature (no
// byte-exact receipt exists on this pair); the difficulty side carries source-host
// attribution through the single-home formatter (formatSourceAttribution), plain text, no
// link. Renders NOTHING when there is no live curated row (rendered-tree absence).

import { useCuratedTensions } from "@/hooks/useCuratedTensions";
import { formatSourceAttribution } from "@/lib/firstRead/reportedDate";
import {
  CURATED_TENSION_HEADING,
  CURATED_TENSION_FRAMING,
  CURATED_TENSION_PROMISE_LABEL,
  CURATED_TENSION_DIFFICULTY_LABEL,
  CURATED_TENSION_CURATION_LINE,
} from "@/lib/firstRead/curatedTension";

export default function CuratedTensionSection({ companyId }: { companyId?: string }) {
  const { render } = useCuratedTensions(companyId);
  if (!render) return null; // no live curation → the section does not exist

  const attribution = formatSourceAttribution(
    render.difficultySourceUrl,
    render.difficultyEventDate,
    render.difficultyCapturedAt,
  );

  return (
    <section className="cvs-curated-tension" aria-label={CURATED_TENSION_HEADING}>
      <h3 className="cvs-curated-tension-heading">{CURATED_TENSION_HEADING}</h3>
      <p className="cvs-curated-tension-framing">{CURATED_TENSION_FRAMING}</p>
      <div className="cvs-curated-tension-pair">
        <div className="cvs-curated-tension-side cvs-curated-tension-promise">
          <p className="cvs-curated-tension-label">{CURATED_TENSION_PROMISE_LABEL}</p>
          <p className="cvs-curated-tension-text">{render.promiseText}</p>
        </div>
        <div className="cvs-curated-tension-side cvs-curated-tension-difficulty">
          <p className="cvs-curated-tension-label">{CURATED_TENSION_DIFFICULTY_LABEL}</p>
          <p className="cvs-curated-tension-text">{render.difficultyText}</p>
          {attribution && <p className="cvs-curated-tension-attribution">{attribution}</p>}
        </div>
      </div>
      <p className="cvs-curated-tension-curation">{CURATED_TENSION_CURATION_LINE}</p>
    </section>
  );
}
