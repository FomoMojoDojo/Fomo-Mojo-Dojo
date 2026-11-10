// DF-00 SEND (/send). Slice 1: the drop zone is VISUAL ONLY — no upload, no write. The list is
// input_files for the company, newest first, every row in the Received state.
//
// G8: the "Rather email?" sentence is omitted until an address exists; no literal bracket reaches a
// live screen, so the string is not in strings.ts at all.
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { clientRefineDiagnosePath } from "@/lib/clientRefinePreview";
import { Breadcrumb, Headline, ScoreBlock } from "../walk";
import { SEND, SHARED } from "../strings";
import type { ScreenProps } from "./gather";

export function SendScreen({ data, companyId }: ScreenProps) {
  const company = data.company ?? "";
  const navigate = useNavigate();
  const [dragging, setDragging] = useState(false);
  return (
    <div className="dg-page" data-dg-tone="base" data-dg-screen="send">
      <header className="dg-header">
        <Breadcrumb company={company} phase={SHARED.phaseSend} />
        <div className="dg-header-right">
          <button
            type="button"
            className="dg-next dg-pill"
            onClick={() => navigate(clientRefineDiagnosePath(companyId, "welcome"))}
          >
            {SEND.next}
          </button>
        </div>
      </header>

      <div className="dg-walk dg-enter" style={{ gridTemplateColumns: "1fr" }}>
        <div className="dg-walk-hero">
          <span className="dg-mono">{SEND.eyebrow}</span>
          <h1 className="dg-h"><Headline text={SEND.h(company)} /></h1>
          <p className="dg-lede">{SEND.lede(company)}</p>
        </div>

        <div className="dg-cols">
          <div className="dg-stack-lg">
            <div
              className="dg-drop"
              data-dragging={dragging}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => { e.preventDefault(); setDragging(false); }}
            >
              <span className="dg-statement">{dragging ? SEND.dropActive : SEND.dropHere}</span>
              <span className="dg-small">{SEND.dropHint}</span>
            </div>

            <div className="dg-walk-group">
              <span className="dg-mono">{SEND.whatHappensNext}</span>
              <p className="dg-body">
                {SEND.whatHappensNextBody(company)}{" "}
                <span className="dg-emph">{SEND.whatHappensNextEmphasis}</span>
              </p>
            </div>
          </div>

          <div className="dg-stack">
            <span className="dg-mono">{SEND.sentSoFar}</span>
            <span className="dg-small">{SEND.stayHere(company)}</span>
            <div className="dg-rows" data-dg-list="files">
              {data.documents.map((doc, i) => (
                <div className="dg-row" key={doc.id} style={{ ["--dg-i" as string]: String(i) }}>
                  <span className="dg-row-index">{String(i + 1).padStart(2, "0")}</span>
                  <div className="dg-row-main">
                    <p className="dg-statement">{doc.fileName}</p>
                  </div>
                  <span className="dg-row-actions dg-small">
                    <span className="dg-dot" /> {SEND.received}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <footer className="dg-bottom">
        <span className="dg-bottom-left" />
        <ScoreBlock score={data.score?.total_score ?? null} />
      </footer>
    </div>
  );
}
