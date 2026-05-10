import type { ReconciliationNarrative } from "@/lib/reconciliationNarrative";

export default function RefinePreviewReconciliationSection({
  narrative,
}: {
  narrative: ReconciliationNarrative | null;
}) {
  if (!narrative?.shouldRender) return null;

  if (narrative.reconciliationStrength === "strong") {
    return (
      <section className="crpv-reconciliation-section is-aligned" aria-label="Perspective alignment">
        <p className="crpv-reconciliation-aligned">These perspectives are beginning to align.</p>
      </section>
    );
  }

  return (
    <section className={`crpv-reconciliation-section is-${narrative.mode}`.trim()} aria-label="Where perspectives differ">
      <div className="crpv-reconciliation-header">
        <p className="cap">Where perspectives differ</p>
        <p className="crpv-reconciliation-summary">{narrative.alignmentSummary}</p>
      </div>

      <div className="crpv-reconciliation-lines">
        <div className="crpv-reconciliation-line">
          <span className="crpv-reconciliation-label">Publicly understood as</span>
          <p>{narrative.publicPerspective}</p>
        </div>
        <div className="crpv-reconciliation-line">
          <span className="crpv-reconciliation-label">Strategic direction appears to be shifting toward</span>
          <p>{narrative.strategicDirection}</p>
        </div>
        <div className="crpv-reconciliation-line">
          <span className="crpv-reconciliation-label">Customer evidence currently supports</span>
          <p>{narrative.customerReality}</p>
        </div>
        <div className="crpv-reconciliation-line is-unresolved">
          <span className="crpv-reconciliation-label">Still unclear</span>
          <p>{narrative.unresolvedQuestion}</p>
        </div>
      </div>
    </section>
  );
}
