import { useState } from "react";
import type { StrategyCascade, CascadeItem } from "@/lib/types";
import type { SourceConfidenceSignals } from "@/lib/sourceConfidence";
import type { BaselineResult } from "../types";
import { useSaveFlash } from "../hooks";
import { alignmentOf } from "../helpers";
import { SectionHeader, StatementField, KanbanBoard } from "../primitives";
import StrategyInspectPanel from "@/views/Strategy/StrategyInspectPanel";

export default function StrategyOrgPanel({
  strategy,
  loading,
  updatedAt,
  baseline,
  signals,
  directionContextNote,
  updateNarrativeField,
  updateListField,
}: {
  strategy: StrategyCascade | null;
  loading: boolean;
  updatedAt?: string;
  baseline: BaselineResult | null;
  signals: SourceConfidenceSignals;
  directionContextNote?: string | null;
  updateNarrativeField: (field: "winning_aspiration" | "where_to_play" | "how_to_win", value: string) => Promise<void>;
  updateListField: (field: "capabilities_json" | "management_systems_json", items: CascadeItem[]) => Promise<void>;
}) {
  const [inspectOpen, setInspectOpen] = useState(false);
  const { savedField, flash } = useSaveFlash();

  if (loading) return <div className="crpv-ws-placeholder cap">Loading…</div>;
  if (!strategy) return <div className="crpv-ws-placeholder">No strategy data yet.</div>;

  return (
    <>
    <div className="crpv-ws-section crpv-ws-section-wide">
      <SectionHeader
        title="Strategy · Organization Signals"
        desc="Where you're going, where you'll compete, and how you'll win."
        updatedAt={updatedAt}
      />

      {directionContextNote ? (
        <div style={{ marginBottom: 14, padding: "10px 12px", border: "1px solid #d7ded1", background: "#f8f7f2" }}>
          <p style={{ margin: 0, color: "#54656a", fontSize: 13, lineHeight: 1.55 }}>
            {directionContextNote}
          </p>
        </div>
      ) : null}

      <StatementField
        label="Where you're headed"
        value={strategy.winning_aspiration}
        onSave={async (v) => { await updateNarrativeField("winning_aspiration", v); flash("aspiration"); }}
        hint="What does winning look like in the market you're in right now?"
        rows={4}
        isSaved={savedField === "aspiration"}
        gap={baseline ? {
          alignment: alignmentOf(strategy.winning_aspiration, baseline.top_hypotheses?.[0]),
          baselineValue: baseline.top_hypotheses?.[0],
        } : undefined}
      />

      <StatementField
        label="Where you'll compete"
        value={strategy.where_to_play}
        onSave={async (v) => { await updateNarrativeField("where_to_play", v); flash("where"); }}
        hint="Which customers, geographies, and channels are you going after?"
        rows={3}
        isSaved={savedField === "where"}
        gap={baseline ? {
          alignment: alignmentOf(strategy.where_to_play, baseline.category_archetype),
          baselineValue: baseline.category_archetype,
        } : undefined}
      />

      <StatementField
        label="How you'll win"
        value={strategy.how_to_win}
        onSave={async (v) => { await updateNarrativeField("how_to_win", v); flash("how"); }}
        hint="What specifically gives you an edge in the spaces you're competing in?"
        rows={3}
        isSaved={savedField === "how"}
      />

      {strategy.capabilities.length > 0 && (
        <KanbanBoard
          label="Capabilities you need"
          items={strategy.capabilities}
          onUpdate={async (updated) => { await updateListField("capabilities_json", updated); flash("capabilities_json"); }}
          isSaved={savedField === "capabilities_json"}
        />
      )}

      {strategy.management_systems.length > 0 && (
        <KanbanBoard
          label="Systems that enable it"
          items={strategy.management_systems}
          onUpdate={async (updated) => { await updateListField("management_systems_json", updated); flash("management_systems_json"); }}
          isSaved={savedField === "management_systems_json"}
        />
      )}

      <div style={{ paddingTop: 8, display: "flex", justifyContent: "flex-start" }}>
        <button
          type="button"
          className="crpv-ws-need-inspect-btn"
          onClick={() => setInspectOpen(true)}
        >
          Inspect strategy →
        </button>
      </div>
    </div>

    <StrategyInspectPanel
      open={inspectOpen}
      onClose={() => setInspectOpen(false)}
      cascade={strategy}
      frameworksUsed={[]}
      signals={signals}
      hasBaseline={baseline !== null}
    />
    </>
  );
}
