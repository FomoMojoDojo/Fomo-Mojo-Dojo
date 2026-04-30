import { useState } from "react";
import type { AffectedArtifact, ExclusionImpact } from "@/lib/evidenceImpact";
import { RESTORE_GUIDANCE } from "@/lib/evidenceImpact";
import { computeArtifactUnlockSummary } from "@/lib/evidenceBands";
import type { WorkshopTab } from "../types";

export const ARTIFACT_TO_TAB: Record<AffectedArtifact, WorkshopTab> = {
  Positioning: "positioning",
  Strategy: "strategy",
  Needs: "needs",
  Routes: "jtbd",
};

export function EvidenceImpactBanner({
  impact,
  evidenceStatus,
  hasCompanyEvidence = false,
  totalSignalCount,
}: {
  impact: ExclusionImpact;
  evidenceStatus?: string | null;
  hasCompanyEvidence?: boolean;
  // Total excluded outside signals (ledger + voice). Banner shows if this > 0.
  totalSignalCount?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const totalCount = totalSignalCount ?? impact.excludedCount;
  if (totalCount === 0) return null;

  // Distinguish: ledger items (affect scoring) vs. voice-only signals (display-only).
  const affectsScoring = impact.excludedCount > 0;
  const voiceOnlyCount = totalCount - impact.excludedCount;

  const isMixed = affectsScoring && voiceOnlyCount > 0;

  const countLabel = affectsScoring
    ? isMixed
      ? `${impact.excludedCount} evidence item${impact.excludedCount !== 1 ? "s" : ""} excluded from scoring · ${voiceOnlyCount} outside signal${voiceOnlyCount !== 1 ? "s" : ""} hidden from this view`
      : `${impact.excludedCount} evidence item${impact.excludedCount !== 1 ? "s" : ""} excluded from scoring`
    : `${totalCount} outside signal${totalCount !== 1 ? "s" : ""} hidden from this view`;

  const subLabel = isMixed
    ? "Outside evidence is now weaker. Voice signals are hidden visually only."
    : affectsScoring
      ? "Outside evidence is now weaker."
      : "These signals do not currently affect scoring.";

  const guidanceBullets = impact.affectedArtifacts.length > 0
    ? impact.affectedArtifacts.map((a) => RESTORE_GUIDANCE[a])
    : ["Restore excluded signals to re-include them in this view."];

  const unlockSummaries = impact.affectedArtifacts.length > 0
    ? impact.affectedArtifacts.map((a) =>
        computeArtifactUnlockSummary(a, evidenceStatus, hasCompanyEvidence, impact.excludedCount > 0)
      )
    : [];

  return (
    <div className="crpv-impact-banner">
      <div className="crpv-impact-banner-hd">
        <span className="crpv-impact-icon">⚠</span>
        <div className="crpv-impact-summary">
          <p className="crpv-impact-count">{countLabel}</p>
          <p className="crpv-impact-sub">{subLabel}</p>
        </div>
      </div>

      {affectsScoring && impact.affectedArtifacts.length > 0 && (
        <div className="crpv-impact-chips">
          {impact.affectedArtifacts.map((a) => (
            <span key={a} className="crpv-impact-chip">{a} confidence reduced</span>
          ))}
        </div>
      )}

      <button
        type="button"
        className="crpv-impact-toggle"
        onClick={() => setExpanded((v) => !v)}
      >
        {expanded ? "▲ Hide" : "▼ What would restore confidence"}
      </button>

      {expanded && (
        <div className="crpv-impact-guidance-block">
          <ul className="crpv-impact-guidance">
            {guidanceBullets.map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
          {unlockSummaries.length > 0 && (
            <div className="crpv-unlock-table">
              <p className="crpv-unlock-table-hd">What would strengthen this</p>
              <table>
                <tbody>
                  {unlockSummaries.map((s) => (
                    <tr key={s.artifact} className="crpv-unlock-table-row">
                      <td className="crpv-unlock-table-artifact">{s.artifact}</td>
                      <td className="crpv-unlock-table-band">{s.bandLabel}</td>
                      <td className="crpv-unlock-table-action">{s.topAction}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
