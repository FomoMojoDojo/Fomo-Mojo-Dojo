import { useState } from "react";
import React from "react";
import type { StrategyCascade, CascadeItem, PositioningCanvas, PositioningItem } from "@/lib/types";
import type { OdiMarketDefinitionRow } from "@/hooks/useOdiNeeds";
import { supabase } from "@/integrations/supabase/client";
import type { BaselineResult, GapAlignment } from "../types";
import { useSaveFlash } from "../hooks";
import { alignmentOf, INNOVATION_OPTIONS } from "../helpers";
import {
  GapBadge,
  FieldBlock,
  KanbanBoard,
  ListEditor,
  ReadonlyList,
  OutsideSignalItems,
  AnnotatableQuestionList,
} from "../primitives";

// ─── Private helpers ──────────────────────────────────────────────────────────

function ReadonlyBlock({ label, value }: { label: string; value: string | null | undefined }) {
  const text = (value || "").trim();
  return (
    <div className="crpv-ws-field">
      <label className="crpv-ws-label">{label}</label>
      <div className={`crpv-ws-readonly${!text ? " crpv-ws-readonly-empty" : ""}`}>
        {text || "—"}
      </div>
    </div>
  );
}

function CompareFieldRow({
  label,
  alignment,
  outsideCell,
  orgCell,
}: {
  label: string;
  alignment?: GapAlignment;
  outsideCell: React.ReactNode;
  orgCell: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className="crpv-ws-cmp-field">
      <button
        type="button"
        className="crpv-ws-cmp-row-label cap"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="crpv-ws-cmp-row-label-text">
          {label}
          {alignment && <GapBadge alignment={alignment} />}
        </span>
        <span className="crpv-ws-cmp-chevron">{open ? "▼" : "▶"}</span>
      </button>
      {open && (
        <div className="crpv-ws-cmp-cells">
          <div className="crpv-ws-cmp-cell">{outsideCell}</div>
          <div className="crpv-ws-cmp-cell">{orgCell}</div>
        </div>
      )}
    </div>
  );
}

function CmpOutsideValue({ value }: { value: string | null | undefined }) {
  const text = (value || "").trim();
  return text
    ? <div className="crpv-ws-readonly">{text}</div>
    : <div className="crpv-ws-cmp-none">No outside data</div>;
}

// ─── StrategyCompare ──────────────────────────────────────────────────────────

export function StrategyCompare({
  baseline,
  strategy,
  loading,
  updateNarrativeField,
  updateListField,
}: {
  baseline: BaselineResult | null;
  strategy: StrategyCascade | null;
  loading: boolean;
  updateNarrativeField: (field: "winning_aspiration" | "where_to_play" | "how_to_win", value: string) => Promise<void>;
  updateListField: (field: "capabilities_json" | "management_systems_json", items: CascadeItem[]) => Promise<void>;
}) {
  const { savedField, flash } = useSaveFlash();
  if (loading) return <div className="crpv-ws-cmp-placeholder cap">Loading…</div>;
  return (
    <>
      <CompareFieldRow
        label="Where you're headed"
        alignment={baseline ? alignmentOf(strategy?.winning_aspiration, baseline.top_hypotheses?.[0]) : undefined}
        outsideCell={<CmpOutsideValue value={baseline?.top_hypotheses?.[0]} />}
        orgCell={
          <FieldBlock
            label="Where you're headed"
            hideLabel
            autoGrow
            value={strategy?.winning_aspiration ?? ""}
            onSave={async (v) => { await updateNarrativeField("winning_aspiration", v); flash("aspiration"); }}
            isSaved={savedField === "aspiration"}
          />
        }
      />
      <CompareFieldRow
        label="Where you'll compete"
        alignment={baseline ? alignmentOf(strategy?.where_to_play, baseline.category_archetype) : undefined}
        outsideCell={<CmpOutsideValue value={baseline?.category_archetype} />}
        orgCell={
          <FieldBlock
            label="Where you'll compete"
            hideLabel
            autoGrow
            value={strategy?.where_to_play ?? ""}
            onSave={async (v) => { await updateNarrativeField("where_to_play", v); flash("where"); }}
            isSaved={savedField === "where"}
          />
        }
      />
      <CompareFieldRow
        label="How you'll win"
        alignment={baseline ? alignmentOf(strategy?.how_to_win, baseline.lens_card?.economic_engine) : undefined}
        outsideCell={<CmpOutsideValue value={baseline?.lens_card?.economic_engine} />}
        orgCell={
          <FieldBlock
            label="How you'll win"
            hideLabel
            autoGrow
            value={strategy?.how_to_win ?? ""}
            onSave={async (v) => { await updateNarrativeField("how_to_win", v); flash("how"); }}
            isSaved={savedField === "how"}
          />
        }
      />
      <div className="crpv-ws-cmp-support-hd cap">Supporting context</div>
      <div className="crpv-ws-cmp-support">
        <div className="crpv-ws-cmp-support-col">
          {(baseline?.top_hypotheses?.length ?? 0) > 1 && (
            <ReadonlyList label="All market assumptions" items={baseline!.top_hypotheses!} />
          )}
          {(baseline?.open_questions?.length ?? 0) > 0 && (
            <ReadonlyList label="Strategic unknowns" items={baseline!.open_questions!} />
          )}
        </div>
        <div className="crpv-ws-cmp-support-col">
          {strategy && strategy.capabilities.length > 0 && (
            <KanbanBoard
              label="Capabilities you need"
              items={strategy.capabilities}
              onUpdate={async (updated) => { await updateListField("capabilities_json", updated); flash("capabilities_json"); }}
              isSaved={savedField === "capabilities_json"}
            />
          )}
          {strategy && strategy.management_systems.length > 0 && (
            <KanbanBoard
              label="Systems that enable it"
              items={strategy.management_systems}
              onUpdate={async (updated) => { await updateListField("management_systems_json", updated); flash("management_systems_json"); }}
              isSaved={savedField === "management_systems_json"}
            />
          )}
        </div>
      </div>
    </>
  );
}

// ─── PositioningCompare ───────────────────────────────────────────────────────

export function PositioningCompare({
  baseline,
  canvas,
  loading,
  updateTextField,
  updateItemsField,
}: {
  baseline: BaselineResult | null;
  canvas: PositioningCanvas | null;
  loading: boolean;
  updateTextField: (field: "value_for_customer" | "best_fit_customers" | "market_category" | "category_rationale" | "current_tagline" | "proposed_tagline", value: string) => Promise<void>;
  updateItemsField: (field: "competitive_alternatives_json" | "unique_attributes_json", items: PositioningItem[]) => Promise<void>;
}) {
  const { savedField, flash } = useSaveFlash();
  if (loading) return <div className="crpv-ws-cmp-placeholder cap">Loading…</div>;
  return (
    <>
      <CompareFieldRow
        label="The real value you deliver"
        alignment={baseline ? alignmentOf(canvas?.value_for_customer, baseline.message_alignment?.outside_voice_posture) : undefined}
        outsideCell={<CmpOutsideValue value={baseline?.message_alignment?.outside_voice_posture} />}
        orgCell={
          <FieldBlock
            label="The real value you deliver"
            hideLabel
            autoGrow
            value={canvas?.value_for_customer ?? ""}
            onSave={async (v) => { await updateTextField("value_for_customer", v); flash("value"); }}
            isSaved={savedField === "value"}
          />
        }
      />
      <CompareFieldRow
        label="Who this is built for"
        alignment={baseline ? alignmentOf(canvas?.best_fit_customers, baseline.lens_card?.primary_buyer) : undefined}
        outsideCell={<CmpOutsideValue value={baseline?.lens_card?.primary_buyer} />}
        orgCell={
          <FieldBlock
            label="Who this is built for"
            hideLabel
            autoGrow
            value={canvas?.best_fit_customers ?? ""}
            onSave={async (v) => { await updateTextField("best_fit_customers", v); flash("customers"); }}
            isSaved={savedField === "customers"}
          />
        }
      />
      <CompareFieldRow
        label="The category you're in"
        alignment={baseline ? alignmentOf(canvas?.market_category, baseline.category_archetype) : undefined}
        outsideCell={<CmpOutsideValue value={baseline?.category_archetype} />}
        orgCell={
          <FieldBlock
            label="The category you're in"
            hideLabel
            autoGrow
            value={canvas?.market_category ?? ""}
            onSave={async (v) => { await updateTextField("market_category", v); flash("category"); }}
            isSaved={savedField === "category"}
          />
        }
      />
      <CompareFieldRow
        label="Why you belong there"
        alignment={baseline ? alignmentOf(canvas?.category_rationale, baseline.message_alignment?.alignment_summary) : undefined}
        outsideCell={<CmpOutsideValue value={baseline?.message_alignment?.alignment_summary} />}
        orgCell={
          <FieldBlock
            label="Why you belong there"
            hideLabel
            autoGrow
            value={canvas?.category_rationale ?? ""}
            onSave={async (v) => { await updateTextField("category_rationale", v); flash("rationale"); }}
            isSaved={savedField === "rationale"}
          />
        }
      />
      <CompareFieldRow
        label="Who else they could choose"
        outsideCell={<div className="crpv-ws-cmp-none">No outside data</div>}
        orgCell={
          <ListEditor
            label="Who else they could choose"
            items={canvas?.competitive_alternatives ?? []}
            onSave={async (items) => { await updateItemsField("competitive_alternatives_json", items); flash("competitors"); }}
            addPlaceholder="Add a competitor or alternative…"
            isSaved={savedField === "competitors"}
          />
        }
      />
      <CompareFieldRow
        label="What makes you different"
        outsideCell={<div className="crpv-ws-cmp-none">No outside data</div>}
        orgCell={
          <ListEditor
            label="What makes you different"
            items={canvas?.unique_attributes ?? []}
            onSave={async (items) => { await updateItemsField("unique_attributes_json", items); flash("attributes"); }}
            addPlaceholder="Add a differentiator…"
            isSaved={savedField === "attributes"}
          />
        }
      />
      <CompareFieldRow
        label="Current tagline"
        outsideCell={<div className="crpv-ws-cmp-none">No outside data</div>}
        orgCell={
          <FieldBlock
            label="Current tagline"
            hideLabel
            value={canvas?.current_tagline ?? ""}
            onSave={async (v) => { await updateTextField("current_tagline", v); flash("tagline_current"); }}
            rows={1}
            singleLine
            isSaved={savedField === "tagline_current"}
          />
        }
      />
      <CompareFieldRow
        label="Proposed tagline"
        outsideCell={<div className="crpv-ws-cmp-none">No outside data</div>}
        orgCell={
          <FieldBlock
            label="Proposed tagline"
            hideLabel
            value={canvas?.proposed_tagline ?? ""}
            onSave={async (v) => { await updateTextField("proposed_tagline", v); flash("tagline_proposed"); }}
            rows={1}
            singleLine
            isSaved={savedField === "tagline_proposed"}
          />
        }
      />
      <div className="crpv-ws-cmp-support-hd cap">Supporting context</div>
      <div className="crpv-ws-cmp-support">
        <div className="crpv-ws-cmp-support-col">
          {baseline?.message_alignment?.company_claim_posture && (
            <ReadonlyBlock label="What they claim publicly" value={baseline.message_alignment.company_claim_posture} />
          )}
          {baseline?.message_alignment?.alignment_status && (
            <ReadonlyBlock
              label="Alignment signal"
              value={[baseline.message_alignment.alignment_status, baseline.message_alignment.alignment_summary].filter(Boolean).join(" — ")}
            />
          )}
          {(baseline?.outside_voice_signals?.length ?? 0) > 0 && (
            <OutsideSignalItems label="External perspectives" signals={baseline!.outside_voice_signals!} />
          )}
        </div>
        <div className="crpv-ws-cmp-support-col" />
      </div>
    </>
  );
}

// ─── JTBDCompare ─────────────────────────────────────────────────────────────

export function JTBDCompare({
  baseline,
  marketDef,
  loading,
  companyId,
  updateMarketDefinition,
}: {
  baseline: BaselineResult | null;
  marketDef: OdiMarketDefinitionRow | null;
  loading: boolean;
  companyId: string;
  updateMarketDefinition: (patch: Partial<Pick<OdiMarketDefinitionRow, "innovation_strategy">>) => Promise<void>;
}) {
  const { savedField, flash } = useSaveFlash();

  async function saveTextField(field: "job_executor" | "chooser" | "jtbd", value: string) {
    const { error } = await supabase
      .from("odi_market_definitions")
      .update({ [field]: value.trim() })
      .eq("company_id", companyId);
    if (error) throw new Error(error.message);
    flash(field);
  }

  if (loading) return <div className="crpv-ws-cmp-placeholder cap">Loading…</div>;
  return (
    <>
      <CompareFieldRow
        label="Who does this job"
        alignment={baseline ? alignmentOf(marketDef?.job_executor, baseline.lens_card?.primary_buyer) : undefined}
        outsideCell={<CmpOutsideValue value={baseline?.lens_card?.primary_buyer} />}
        orgCell={
          <FieldBlock
            label="Who does this job"
            hideLabel
            autoGrow
            value={marketDef?.job_executor ?? ""}
            onSave={(v) => saveTextField("job_executor", v)}
            isSaved={savedField === "job_executor"}
          />
        }
      />
      <CompareFieldRow
        label="Who makes the call"
        alignment={baseline ? alignmentOf(marketDef?.chooser, baseline.lens_card?.chooser) : undefined}
        outsideCell={<CmpOutsideValue value={baseline?.lens_card?.chooser} />}
        orgCell={
          <FieldBlock
            label="Who makes the call"
            hideLabel
            autoGrow
            value={marketDef?.chooser ?? ""}
            onSave={(v) => saveTextField("chooser", v)}
            isSaved={savedField === "chooser"}
          />
        }
      />
      <CompareFieldRow
        label="The job they're trying to do"
        alignment={baseline ? alignmentOf(marketDef?.jtbd, baseline.top_hypotheses?.[0]) : undefined}
        outsideCell={<CmpOutsideValue value={baseline?.top_hypotheses?.[0]} />}
        orgCell={
          <FieldBlock
            label="The job they're trying to do"
            hideLabel
            autoGrow
            value={marketDef?.jtbd ?? ""}
            onSave={(v) => saveTextField("jtbd", v)}
            isSaved={savedField === "jtbd"}
          />
        }
      />
      <CompareFieldRow
        label="How you'll approach it"
        outsideCell={<div className="crpv-ws-cmp-none">No outside data</div>}
        orgCell={
          marketDef ? (
            <div className="crpv-ws-field">
              <div className="crpv-ws-field-hd">
                {savedField === "innovation_strategy" && <span className="crpv-ws-saved cap">Saved ✓</span>}
              </div>
              <select
                className="crpv-ws-select"
                value={marketDef.innovation_strategy ?? ""}
                onChange={async (e) => {
                  try { await updateMarketDefinition({ innovation_strategy: e.target.value || null }); flash("innovation_strategy"); }
                  catch { /* silent */ }
                }}
              >
                <option value="">Select an approach…</option>
                {INNOVATION_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          ) : null
        }
      />
      <div className="crpv-ws-cmp-support-hd cap">Supporting context</div>
      <div className="crpv-ws-cmp-support">
        <div className="crpv-ws-cmp-support-col">
          {(baseline?.top_hypotheses?.length ?? 0) > 1 && (
            <ReadonlyList label="All inferred jobs / assumptions" items={baseline!.top_hypotheses!} />
          )}
          {(baseline?.open_questions?.length ?? 0) > 0 && (
            <AnnotatableQuestionList label="Unresolved questions" questions={baseline!.open_questions!} companyId={companyId} />
          )}
        </div>
        <div className="crpv-ws-cmp-support-col" />
      </div>
    </>
  );
}
