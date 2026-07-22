// First Read · Act 3 (The Check) — one checkable item.
//
// Renders the item's VERBATIM text with its kind, the three-verdict control, and
// the in-place annotations:
//   - confirmed  → live evidence-band lift with a visible source line
//     ("Customer-Evidenced — Confirmed by you · {date}"). Render-time only; the
//     findings row is never touched.
//   - rejected   → the item STAYS in place, annotated with who (the client) and
//     when (captured_at). Never hidden, never struck.
//   - corrected  → the client's correction shown verbatim.

import type { CheckItem, Verdict } from "@/hooks/useFirstReadCapture";
import { BAND_LABELS } from "@/lib/evidenceBands";
import { baselineFindingBand, liftBand } from "@/lib/firstRead/bandLift";
import CheckControl from "./CheckControl";

const KIND_LABEL: Record<CheckItem["kind"], string> = {
  finding: "Finding",
  market: "Market",
  differentiator: "Differentiator",
};

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return iso;
  }
}

export default function CheckItemRow({
  item,
  onSet,
  disabled,
}: {
  item: CheckItem;
  onSet: (item: CheckItem, v: Verdict, correction?: string) => void;
  disabled?: boolean;
}) {
  const confirmed = item.verdict === "confirmed";
  const rejected = item.verdict === "rejected";
  const corrected = item.verdict === "corrected";

  const band =
    item.kind === "finding" ? liftBand(baselineFindingBand(), confirmed) : null;

  return (
    <div
      className={`cvs-check-item${rejected ? " is-rejected" : ""}${confirmed ? " is-confirmed" : ""}`}
    >
      <p className="cvs-check-kind">{KIND_LABEL[item.kind]}</p>
      <p className="cvs-check-text">{item.text}</p>

      <CheckControl
        verdict={item.verdict}
        correctionText={item.correctionText}
        onSet={(v, c) => onSet(item, v, c)}
        disabled={disabled}
      />

      {confirmed && band && (
        <p className="cvs-check-lift">
          <span className="cvs-check-band">{BAND_LABELS[band]}</span>
          <span className="cvs-check-source"> — Confirmed by you · {fmtDate(item.capturedAt)}</span>
        </p>
      )}

      {rejected && (
        <p className="cvs-check-rejected-note">
          Rejected by the client · {fmtDate(item.capturedAt)}
        </p>
      )}

      {corrected && item.correctionText && (
        <p className="cvs-check-corrected-note">Corrected: “{item.correctionText}”</p>
      )}
    </div>
  );
}
