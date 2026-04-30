import { useState, useMemo } from "react";
import type { PositioningCanvas, PositioningItem } from "@/lib/types";
import type { SourceConfidenceSignals } from "@/lib/sourceConfidence";
import type { BaselineResult } from "../types";
import { useSaveFlash } from "../hooks";
import { alignmentOf } from "../helpers";
import { SectionHeader, ListEditor, StatementField } from "../primitives";
import PositioningInspectPanel from "@/views/Positioning/PositioningInspectPanel";
import {
  getCategoryHighlightWords,
  getOutcomeHighlightPhrases,
  getDifferentiatorHighlightWords,
  getBestFitHighlightPhrases,
} from "@/lib/positioningStrength";

export default function PositioningOrgPanel({
  canvas,
  loading,
  updatedAt,
  baseline,
  signals,
  updateTextField,
  updateItemsField,
}: {
  canvas: PositioningCanvas | null;
  loading: boolean;
  updatedAt?: string;
  baseline: BaselineResult | null;
  signals: SourceConfidenceSignals;
  updateTextField: (field: "value_for_customer" | "best_fit_customers" | "market_category" | "category_rationale" | "current_tagline" | "proposed_tagline", value: string) => Promise<void>;
  updateItemsField: (field: "competitive_alternatives_json" | "unique_attributes_json", items: PositioningItem[]) => Promise<void>;
}) {
  const [inspectOpen, setInspectOpen] = useState(false);
  const { savedField, flash } = useSaveFlash();

  const categoryHighlights = useMemo(
    () => (canvas ? getCategoryHighlightWords(canvas.market_category) : []),
    [canvas],
  );
  const outcomeHighlights = useMemo(
    () => (canvas ? getOutcomeHighlightPhrases(canvas.value_for_customer) : []),
    [canvas],
  );
  const audienceHighlights = useMemo(
    () => (canvas ? getBestFitHighlightPhrases(canvas.best_fit_customers) : []),
    [canvas],
  );
  const attrWarningWords = useMemo(() => {
    const map = new Map<number, string[]>();
    if (canvas) {
      canvas.unique_attributes.forEach((attr, i) => {
        const words = getDifferentiatorHighlightWords(attr.name);
        if (words.length > 0) map.set(i, words);
      });
    }
    return map;
  }, [canvas]);
  const attrVagueIndices = useMemo(() => new Set(attrWarningWords.keys()), [attrWarningWords]);
  const attrHasVague = attrVagueIndices.size > 0;

  if (loading) return <div className="crpv-ws-placeholder cap">Loading…</div>;
  if (!canvas) return <div className="crpv-ws-placeholder">No positioning data yet.</div>;

  return (
    <>
    <div className="crpv-ws-section">
      <SectionHeader
        title="Positioning · Organization Signals"
        desc="How you're different, who you're for, and where you play."
        updatedAt={updatedAt}
      />

      <ListEditor
        label="Who else they could choose"
        items={canvas.competitive_alternatives}
        onSave={async (items) => { await updateItemsField("competitive_alternatives_json", items); flash("competitors"); }}
        addPlaceholder="Add a competitor or alternative…"
        isSaved={savedField === "competitors"}
      />

      <ListEditor
        label="What makes you different"
        items={canvas.unique_attributes}
        onSave={async (items) => { await updateItemsField("unique_attributes_json", items); flash("attributes"); }}
        addPlaceholder="Add a differentiator…"
        isSaved={savedField === "attributes"}
        listWarning={attrHasVague ? {
          explanation: "This claim is hard to defend. Competitors can say the same thing.",
          suggestion: "Replace it with a mechanism, proof point, or structural constraint — something the alternative cannot credibly claim.",
        } : undefined}
        warningIndices={attrVagueIndices}
        warningWords={attrWarningWords}
        warningTooltip="Hard to defend vs competitors"
      />

      <StatementField
        label="The real value you deliver"
        value={canvas.value_for_customer}
        onSave={async (v) => { await updateTextField("value_for_customer", v); flash("value"); }}
        hint="What changes for the customer? Not what your product does — what they actually gain."
        rows={3}
        isSaved={savedField === "value"}
        gap={baseline ? {
          alignment: alignmentOf(canvas.value_for_customer, baseline.message_alignment?.outside_voice_posture),
          baselineValue: baseline.message_alignment?.outside_voice_posture,
        } : undefined}
        warning={outcomeHighlights.length > 0 ? {
          explanation: "This describes a benefit but not a specific customer change.",
          suggestion: "Frame it as a before/after result — what they can now do that they couldn't before.",
        } : undefined}
        flaggedPhrases={outcomeHighlights.length > 0 ? outcomeHighlights : undefined}
        highlightTooltip="Outcome is vague"
      />

      <StatementField
        label="Who this is built for"
        value={canvas.best_fit_customers}
        onSave={async (v) => { await updateTextField("best_fit_customers", v); flash("customers"); }}
        hint="Be specific. Who gets the most out of what you do?"
        rows={2}
        isSaved={savedField === "customers"}
        gap={baseline ? {
          alignment: alignmentOf(canvas.best_fit_customers, baseline.lens_card?.primary_buyer),
          baselineValue: baseline.lens_card?.primary_buyer,
        } : undefined}
        warning={audienceHighlights.length > 0 ? {
          explanation: "This audience is too broad. Most segments this wide won't convert.",
          suggestion: "Name a specific role, company stage, or situation — something that rules people out, not just in.",
        } : undefined}
        flaggedPhrases={audienceHighlights.length > 0 ? audienceHighlights : undefined}
        highlightTooltip="Too broad to define a real buyer"
      />

      <StatementField
        label="The category you're in"
        value={canvas.market_category}
        onSave={async (v) => { await updateTextField("market_category", v); flash("category"); }}
        rows={2}
        isSaved={savedField === "category"}
        gap={baseline ? {
          alignment: alignmentOf(canvas.market_category, baseline.category_archetype),
          baselineValue: baseline.category_archetype,
        } : undefined}
        warning={categoryHighlights.length > 0 ? {
          explanation: "This is a recognized market category, but it's too broad to guide decisions.",
          suggestion: "Name the specific job, buyer, or context.",
        } : undefined}
        flaggedPhrases={categoryHighlights.length > 0 ? categoryHighlights : undefined}
        highlightTooltip="Too broad to guide decisions"
      />

      <StatementField
        label="Why you belong there"
        value={canvas.category_rationale}
        onSave={async (v) => { await updateTextField("category_rationale", v); flash("rationale"); }}
        hint="What earns your place in this category?"
        rows={2}
        isSaved={savedField === "rationale"}
      />

      <StatementField
        label="Current tagline"
        value={canvas.current_tagline}
        onSave={async (v) => { await updateTextField("current_tagline", v); flash("tagline_current"); }}
        singleLine
        isSaved={savedField === "tagline_current"}
      />

      <StatementField
        label="Proposed tagline"
        value={canvas.proposed_tagline}
        onSave={async (v) => { await updateTextField("proposed_tagline", v); flash("tagline_proposed"); }}
        singleLine
        isSaved={savedField === "tagline_proposed"}
      />

      <div style={{ paddingTop: 8, display: "flex", justifyContent: "flex-start" }}>
        <button
          type="button"
          className="crpv-ws-need-inspect-btn"
          onClick={() => setInspectOpen(true)}
        >
          Inspect canvas →
        </button>
      </div>
    </div>

    <PositioningInspectPanel
      open={inspectOpen}
      onClose={() => setInspectOpen(false)}
      canvas={canvas}
      frameworksUsed={Array.isArray(canvas.frameworks_used) ? canvas.frameworks_used : []}
      signals={signals}
      hasBaseline={baseline !== null}
    />
    </>
  );
}
