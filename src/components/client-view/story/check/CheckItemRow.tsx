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
import { CHECK_KIND_LABEL, checkItemAnnotation } from "@/lib/firstRead/checkItemView";
import CheckControl from "./CheckControl";

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
  const notImportant = item.verdict === "not_important";
  const ann = checkItemAnnotation(item);
  // OC-2 capture note — DISPLAY COPY PENDING OPERATOR SIGNATURE. The signed string
  // is the button label; this in-place note surfaces the captured state on re-render.
  const NOT_IMPORTANT_NOTE = "Marked true but not important · ";

  return (
    <div
      className={`cvs-check-item${rejected ? " is-rejected" : ""}${confirmed ? " is-confirmed" : ""}${notImportant ? " is-notimportant" : ""}`}
    >
      <p className="cvs-check-kind">{CHECK_KIND_LABEL[item.kind]}</p>
      <p className="cvs-check-text">{item.text}</p>

      <CheckControl
        verdict={item.verdict}
        correctionText={item.correctionText}
        onSet={(v, c) => onSet(item, v, c)}
        disabled={disabled}
      />

      {ann?.kind === "confirmed" && ann.bandLabel && (
        <p className="cvs-check-lift">
          <span className="cvs-check-band">{ann.bandLabel}</span>
          <span className="cvs-check-source"> — Confirmed by you · {ann.date}</span>
        </p>
      )}

      {ann?.kind === "rejected" && (
        <p className="cvs-check-rejected-note">Rejected by the client · {ann.date}</p>
      )}

      {ann?.kind === "not_important" && (
        <p className="cvs-check-notimportant-note">{NOT_IMPORTANT_NOTE}{ann.date}</p>
      )}

      {ann?.kind === "corrected" && (
        <p className="cvs-check-corrected-note">Corrected: “{ann.text}”</p>
      )}
    </div>
  );
}
