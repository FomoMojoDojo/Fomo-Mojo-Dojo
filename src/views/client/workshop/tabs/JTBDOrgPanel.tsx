import type { OdiMarketDefinitionRow } from "@/hooks/useOdiNeeds";
import { supabase } from "@/integrations/supabase/client";
import type { BaselineResult } from "../types";
import { useSaveFlash } from "../hooks";
import { alignmentOf, INNOVATION_OPTIONS } from "../helpers";
import { SectionHeader, StatementField } from "../primitives";

export default function JTBDOrgPanel({
  marketDef,
  loading,
  companyId,
  baseline,
  updateMarketDefinition,
}: {
  marketDef: OdiMarketDefinitionRow | null;
  loading: boolean;
  companyId: string;
  baseline: BaselineResult | null;
  updateMarketDefinition: (patch: Partial<Pick<OdiMarketDefinitionRow, "innovation_strategy">>) => Promise<void>;
}) {
  const { savedField, flash } = useSaveFlash();

  if (loading) return <div className="crpv-ws-placeholder cap">Loading…</div>;
  if (!marketDef) return <div className="crpv-ws-placeholder">No market definition yet.</div>;

  async function saveTextField(field: "job_executor" | "chooser" | "jtbd", value: string) {
    const { error } = await supabase
      .from("odi_market_definitions")
      .update({ [field]: value.trim() })
      .eq("company_id", companyId);
    if (error) throw new Error(error.message);
    flash(field);
  }

  const hasStatement = !!(marketDef.job_executor?.trim() && marketDef.jtbd?.trim());
  const jtbdLower = marketDef.jtbd
    ? marketDef.jtbd.charAt(0).toLowerCase() + marketDef.jtbd.slice(1).replace(/\.$/, "")
    : "";

  return (
    <div className="crpv-ws-section">
      <SectionHeader
        title="JTBD · Organization Signals"
        desc="The job your customer is trying to get done, and the people involved."
        updatedAt={marketDef.updated_at}
      />

      {hasStatement ? (
        <div className="crpv-ws-odi-def">
          <p className="crpv-ws-odi-heading cap">ODI Market Definition</p>
          <p className="crpv-ws-odi-statement">
            {marketDef.job_executor}s trying to {jtbdLower}.
          </p>
          <p className="crpv-ws-odi-note">
            This is your market. Anyone who needs to get this job done is a potential customer — regardless of what they currently use to do it.
          </p>
        </div>
      ) : (
        <div className="crpv-ws-odi-def crpv-ws-odi-def-empty">
          <p className="crpv-ws-odi-heading cap">ODI Market Definition</p>
          <p className="crpv-ws-odi-note">Fill in "Who does this job" and "The job they're trying to do" below to generate your market definition.</p>
        </div>
      )}

      <StatementField
        label="Who does this job"
        value={marketDef.job_executor}
        onSave={(v) => saveTextField("job_executor", v)}
        hint="The person actually doing the job — not the buyer, not the org."
        rows={2}
        isSaved={savedField === "job_executor"}
        gap={baseline ? {
          alignment: alignmentOf(marketDef.job_executor, baseline.lens_card?.primary_buyer),
          baselineValue: baseline.lens_card?.primary_buyer,
        } : undefined}
      />

      <StatementField
        label="Who makes the call"
        value={marketDef.chooser}
        onSave={(v) => saveTextField("chooser", v)}
        hint="The person who decides which solution to use."
        rows={2}
        isSaved={savedField === "chooser"}
        gap={baseline ? {
          alignment: alignmentOf(marketDef.chooser, baseline.lens_card?.chooser),
          baselineValue: baseline.lens_card?.chooser,
        } : undefined}
      />

      <StatementField
        label="The job they're trying to do"
        value={marketDef.jtbd}
        onSave={(v) => saveTextField("jtbd", v)}
        hint="From their perspective. What are they trying to accomplish — not what your product helps them do."
        rows={5}
        isSaved={savedField === "jtbd"}
        gap={baseline ? {
          alignment: alignmentOf(marketDef.jtbd, baseline.top_hypotheses?.[0]),
          baselineValue: baseline.top_hypotheses?.[0],
        } : undefined}
      />

      <div className="crpv-ws-field">
        <div className="crpv-ws-field-hd">
          <label className="crpv-ws-label">How you'll approach it</label>
          {savedField === "innovation_strategy" && <span className="crpv-ws-saved cap">Saved ✓</span>}
        </div>
        <select
          className="crpv-ws-select"
          value={marketDef.innovation_strategy ?? ""}
          onChange={async (e) => {
            const val = e.target.value || null;
            try { await updateMarketDefinition({ innovation_strategy: val }); flash("innovation_strategy"); }
            catch { /* silent */ }
          }}
        >
          <option value="">Select an approach…</option>
          {INNOVATION_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>
    </div>
  );
}
