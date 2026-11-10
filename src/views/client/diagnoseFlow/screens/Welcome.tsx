// DF-01 WELCOME (/welcome). Step 1 of the nine; its header carries "← First Read" and
// "Start with the documents →" instead of the usual Back / Next pair.
//
// The three 96px dashed rings are the ONLY round things on this screen besides the status dots —
// the shape law lives in diagnose.css, not here.
import { useNavigate } from "react-router-dom";
import { CLIENT_REFINE_PREVIEW_FIRSTREAD_BASE, clientRefineDiagnosePath } from "@/lib/clientRefinePreview";
import { Breadcrumb, Headline, ProgressSegments, ScoreBlock } from "../walk";
import { SHARED, WELCOME } from "../strings";
import { WALK_ORDER, type ScreenProps } from "./gather";

const RINGS = [
  { tone: "base", title: WELCOME.ringBaseTitle, body: WELCOME.ringBaseBody },
  { tone: "goal", title: WELCOME.ringGoalTitle, body: WELCOME.ringGoalBody },
  { tone: "market", title: WELCOME.ringMarketTitle, body: WELCOME.ringMarketBody },
] as const;

export function WelcomeScreen({ data, companyId }: ScreenProps) {
  const company = data.company ?? "";
  const navigate = useNavigate();
  return (
    <div className="dg-page" data-dg-tone="base" data-dg-screen="welcome">
      <header className="dg-header">
        <Breadcrumb company={company} phase={SHARED.phaseVisit} />
        <div className="dg-header-right">
          <ProgressSegments index={WALK_ORDER.indexOf("welcome")} total={WALK_ORDER.length} />
          <button
            type="button"
            className="dg-ghost"
            onClick={() => navigate(`${CLIENT_REFINE_PREVIEW_FIRSTREAD_BASE}/${companyId}`)}
          >
            {WELCOME.back}
          </button>
          <button
            type="button"
            className="dg-next dg-pill"
            onClick={() => navigate(clientRefineDiagnosePath(companyId, "w1"))}
          >
            {WELCOME.next}
          </button>
        </div>
      </header>

      <div className="dg-walk dg-enter" style={{ gridTemplateColumns: "1fr" }}>
        <div className="dg-walk-hero">
          <span className="dg-mono">{WELCOME.eyebrow(company)}</span>
          <h1 className="dg-h"><Headline text={WELCOME.h(company)} /></h1>
          <p className="dg-lede">{WELCOME.lede(company)}</p>
        </div>

        <div className="dg-stack-lg">
          <span className="dg-mono">{WELCOME.threeThings(company)}</span>
          <div className="dg-rings">
            {RINGS.map((ring) => (
              <div className="dg-stack" key={ring.tone}>
                <span className={`dg-ring96 dg-ring96--${ring.tone}`}>
                  <span className="dg-dot dg-dot--24" data-dg-ring-tone={ring.tone} />
                </span>
                <span className="dg-statement">{ring.title(company)}</span>
                <span className="dg-small">{ring.body(company)}</span>
              </div>
            ))}
          </div>

          <div className="dg-cols dg-hairline-top">
            <div className="dg-stack">
              <span className="dg-mono">{WELCOME.whereYouAre}</span>
              <p className="dg-body">{WELCOME.whereYouAreBody}</p>
            </div>
            <div className="dg-stack">
              <span className="dg-mono">{WELCOME.whatHappensNow}</span>
              <p className="dg-body">
                <span className="dg-emph">{WELCOME.whatHappensNowEmphasis}</span>{" "}
                {WELCOME.whatHappensNowBody(company)}
              </p>
              <p className="dg-small">{WELCOME.prefilled}</p>
            </div>
          </div>
        </div>
      </div>

      <footer className="dg-bottom">
        <div className="dg-bottom-left">
          {/* Ghost, no target yet (spec). */}
          <button type="button" className="dg-ghost" disabled>{WELCOME.howItWorks}</button>
        </div>
        <ScoreBlock score={data.score?.total_score ?? null} />
      </footer>
    </div>
  );
}
