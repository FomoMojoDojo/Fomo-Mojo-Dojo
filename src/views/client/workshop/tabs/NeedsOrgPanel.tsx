import { useState, useEffect, useMemo, useCallback } from "react";
import type { OdiNeedRow } from "@/hooks/useOdiNeeds";
import { supabase } from "@/integrations/supabase/client";
import { isArtifactStale } from "@/lib/evidenceImpact";
import NeedInspectPanel from "@/components/needs/NeedInspectPanel";
import { SectionHeader } from "../primitives";

const STATE_LABEL: Record<string, string> = {
  underserved: "Underserved",
  served:      "Served",
  overserved:  "Overserved",
};

function NeedRow({
  need,
  idx,
  num,
  total,
  reorderingId,
  onMove,
  onScoreChange,
  onInspect,
}: {
  need: OdiNeedRow;
  idx: number;
  num: string;
  total: number;
  reorderingId: string | null;
  onMove: (idx: number, dir: "up" | "down") => Promise<void>;
  onScoreChange: (id: string, imp: number, sat: number) => Promise<void>;
  onInspect?: () => void;
}) {
  const [imp, setImp] = useState(need.importance);
  const [sat, setSat] = useState(need.satisfaction);

  useEffect(() => { setImp(need.importance); setSat(need.satisfaction); }, [need.importance, need.satisfaction]);

  const busy = reorderingId === need.id;

  return (
    <div className={`crpv-ws-need-row${busy ? " crpv-ws-need-moving" : ""}`}>
      <span className="crpv-ws-need-num">{num}</span>
      <div className="crpv-ws-need-outcome">
        <span>{need.desired_outcome}</span>
        {onInspect && (
          <button type="button" className="crpv-ws-need-inspect-btn" onClick={onInspect}>
            Inspect →
          </button>
        )}
      </div>
      <div className="crpv-ws-need-scores">
        <label className="crpv-ws-need-score-wrap">
          <span className="crpv-ws-need-score-lbl cap">Imp</span>
          <input
            type="number" min={0} max={10}
            className="crpv-ws-score-input"
            value={imp}
            onChange={(e) => setImp(Number(e.target.value))}
            onBlur={() => onScoreChange(need.id, imp, sat)}
          />
        </label>
        <label className="crpv-ws-need-score-wrap">
          <span className="crpv-ws-need-score-lbl cap">Sat</span>
          <input
            type="number" min={0} max={10}
            className="crpv-ws-score-input"
            value={sat}
            onChange={(e) => setSat(Number(e.target.value))}
            onBlur={() => onScoreChange(need.id, imp, sat)}
          />
        </label>
        <div className="crpv-ws-need-score-wrap">
          <span className="crpv-ws-need-score-lbl cap">Opp</span>
          <span className="crpv-ws-score-display">{need.opportunity_score}</span>
        </div>
      </div>
      <span className={`crpv-ws-state-badge crpv-ws-state-${need.service_state}`}>
        {STATE_LABEL[need.service_state] ?? need.service_state}
      </span>
      <div className="crpv-ws-reorder-btns">
        <button
          type="button" className="crpv-ws-reorder-btn"
          disabled={idx === 0 || busy}
          onClick={() => onMove(idx, "up")}
          aria-label="Move up"
        >▲</button>
        <button
          type="button" className="crpv-ws-reorder-btn"
          disabled={idx === total - 1 || busy}
          onClick={() => onMove(idx, "down")}
          aria-label="Move down"
        >▼</button>
      </div>
    </div>
  );
}

export default function NeedsOrgPanel({
  needs: initialNeeds,
  loading,
  updateNeedScores,
  latestExclusionAt,
}: {
  needs: OdiNeedRow[];
  loading: boolean;
  updateNeedScores: (id: string, imp: number, sat: number) => Promise<void>;
  latestExclusionAt?: Date | null;
}) {
  const [localNeeds, setLocalNeeds] = useState<OdiNeedRow[]>(initialNeeds);
  const [reorderingId, setReorderingId] = useState<string | null>(null);
  const [inspectNeed, setInspectNeed] = useState<OdiNeedRow | null>(null);

  useEffect(() => { setLocalNeeds(initialNeeds); }, [initialNeeds]);

  // Stable need numbers keyed by id — sorted by opportunity score desc, same as main site
  const needNumberById = useMemo(() => {
    const sorted = [...initialNeeds].sort((a, b) => {
      const scoreDiff = (b.opportunity_score ?? 0) - (a.opportunity_score ?? 0);
      if (scoreDiff !== 0) return scoreDiff;
      const impDiff = (b.importance ?? 0) - (a.importance ?? 0);
      if (impDiff !== 0) return impDiff;
      return String(a.id).localeCompare(String(b.id));
    });
    return new Map<string, string>(sorted.map((n, i) => [n.id, String(i + 1).padStart(3, "0")]));
  }, [initialNeeds]);

  const moveNeed = useCallback(async (idx: number, dir: "up" | "down") => {
    const targetIdx = dir === "up" ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= localNeeds.length) return;

    const needA = localNeeds[idx];
    const needB = localNeeds[targetIdx];
    const sortA = needA.sort_order ?? idx;
    const sortB = needB.sort_order ?? targetIdx;

    const next = [...localNeeds];
    [next[idx], next[targetIdx]] = [next[targetIdx], next[idx]];
    setLocalNeeds(next);
    setReorderingId(needA.id);

    try {
      await Promise.all([
        supabase.from("odi_needs").update({ sort_order: sortB }).eq("id", needA.id),
        supabase.from("odi_needs").update({ sort_order: sortA }).eq("id", needB.id),
      ]);
    } catch {
      setLocalNeeds(initialNeeds);
    } finally {
      setReorderingId(null);
    }
  }, [localNeeds, initialNeeds]);

  if (loading) return <div className="crpv-ws-placeholder cap">Loading…</div>;
  if (localNeeds.length === 0) return <div className="crpv-ws-placeholder">No needs data yet.</div>;

  const grouped: Record<string, OdiNeedRow[]> = {};
  for (const n of localNeeds) {
    const key = n.journey_key || "other";
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(n);
  }

  return (
    <div className="crpv-ws-section crpv-ws-section-wide">
      <SectionHeader
        title={`Needs · Organization Signals · ${localNeeds.length} total`}
        desc="What customers need to get done. Use importance and satisfaction scores to surface the biggest opportunities. Reorder to set priority."
      />

      <div className="crpv-ws-need-table-hd">
        <span className="crpv-ws-need-col-num cap">#</span>
        <span className="crpv-ws-need-col-outcome cap">Desired outcome</span>
        <span className="crpv-ws-need-col-scores cap">Scores</span>
        <span className="crpv-ws-need-col-state cap">State</span>
        <span className="crpv-ws-need-col-order" />
      </div>

      {localNeeds.map((need, idx) => (
        <NeedRow
          key={need.id}
          need={need}
          idx={idx}
          num={needNumberById.get(need.id) ?? "—"}
          total={localNeeds.length}
          reorderingId={reorderingId}
          onMove={moveNeed}
          onScoreChange={updateNeedScores}
          onInspect={() => setInspectNeed(need)}
        />
      ))}

      {Object.keys(grouped).length > 1 && (
        <p className="crpv-ws-needs-journeys cap">
          Journeys: {Object.entries(grouped).map(([k, v]) => `${k} (${v.length})`).join(" · ")}
        </p>
      )}

      <NeedInspectPanel
        open={!!inspectNeed}
        onClose={() => setInspectNeed(null)}
        need={inspectNeed}
        staleNote={
          inspectNeed && latestExclusionAt && isArtifactStale(inspectNeed, latestExclusionAt)
            ? "Needs review after excluded inputs"
            : null
        }
      />
    </div>
  );
}
