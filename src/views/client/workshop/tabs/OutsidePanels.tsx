import { useSignalReview } from "../hooks";
import type { SignalStage, BaselineResult, ExclusionControls, BaselineEvidenceItem } from "../types";
import { coverageOf, cleanSnippet } from "../helpers";
import { ledgerItemFingerprint } from "@/lib/scoring/mojoScore";
import type { PositioningCanvas, StrategyCascade } from "@/lib/types";
import {
  BaselineWarningBanner,
  SectionHeader,
  ReviewableBlock,
  OutsideSignalItems,
  ReadonlyList,
  AnnotatableQuestionList,
} from "../primitives";

// ─── Customer placeholder ─────────────────────────────────────────────────────

export function CustomerPlaceholder() {
  return (
    <div className="crpv-ws-section">
      <div className="crpv-ws-customer-placeholder">
        <p className="cap">Customer Signals — Coming after research</p>
        <p className="crpv-ws-hint">
          This stage is populated from qualitative and quantitative research that validates
          assumptions made in the Outside and Organization stages.
        </p>
        <ul className="crpv-ws-placeholder-list">
          <li>Discovery interviews</li>
          <li>Jobs-to-be-done surveys</li>
          <li>Importance &amp; satisfaction validation</li>
          <li>Competitive perception testing</li>
        </ul>
      </div>
    </div>
  );
}

// ─── Signal bar (stage selector) ──────────────────────────────────────────────

export function SignalBar({
  activeStage,
  setActiveStage,
  baseline,
  positioning,
  strategy,
  excludedCount = 0,
}: {
  activeStage: SignalStage;
  setActiveStage: (s: SignalStage) => void;
  baseline: BaselineResult | null;
  positioning: PositioningCanvas | null;
  strategy: StrategyCascade | null;
  excludedCount?: number;
}) {
  const outsideFields = [
    baseline?.category_archetype,
    baseline?.message_alignment?.alignment_summary,
    (baseline?.top_hypotheses?.length ?? 0) > 0 ? "yes" : "",
    (baseline?.outside_voice_signals?.length ?? 0) > 0 ? "yes" : "",
    (baseline?.evidence_ledger?.length ?? 0) > 0 ? "yes" : "",
  ];
  const outsideFilled = coverageOf(outsideFields);
  const outsideTotal  = outsideFields.length;
  const outsidePct    = Math.round((outsideFilled / outsideTotal) * 100);

  const orgFields = [
    positioning?.competitive_alternatives?.length,
    positioning?.unique_attributes?.length,
    positioning?.value_for_customer,
    positioning?.best_fit_customers,
    positioning?.market_category,
    strategy?.winning_aspiration,
    strategy?.where_to_play,
    strategy?.how_to_win,
  ];
  const orgFilled = coverageOf(orgFields);
  const orgTotal  = orgFields.length;
  const orgPct    = Math.round((orgFilled / orgTotal) * 100);

  const hasGap1 = outsideFilled < outsideTotal || orgFilled < orgTotal;
  const hasGap2 = orgFilled < orgTotal;

  return (
    <div className="crpv-ws-signal-bar">
      <button
        type="button"
        className={`crpv-ws-signal-col crpv-ws-signal-btn${activeStage === "outside" ? " crpv-ws-signal-active" : ""}`}
        onClick={() => setActiveStage("outside")}
      >
        <span className="crpv-ws-signal-tag cap">
          Outside Signals
          {excludedCount > 0 && (
            <span className="crpv-ws-signal-excl-badge" title={`${excludedCount} item${excludedCount !== 1 ? "s" : ""} excluded from scoring`}>
              ·{excludedCount}
            </span>
          )}
        </span>
        <span className="crpv-ws-signal-stage cap">Pre-Diagnosis</span>
        <span className="crpv-ws-signal-desc">Public research &amp; market sentiment</span>
        <div className="crpv-ws-signal-bar-track">
          <span className="crpv-ws-signal-bar-fill" style={{ width: `${outsidePct}%` }} />
        </div>
        <span className="crpv-ws-signal-cov cap">{outsideFilled}/{outsideTotal} signals</span>
      </button>

      <div className="crpv-ws-gap-col">
        <span className="crpv-ws-gap-line" />
        {hasGap1 && <span className="crpv-ws-gap-label cap">gap</span>}
        <span className="crpv-ws-gap-arrow-glyph">→</span>
      </div>

      <button
        type="button"
        className={`crpv-ws-signal-col crpv-ws-signal-btn${activeStage === "org" ? " crpv-ws-signal-active" : ""}`}
        onClick={() => setActiveStage("org")}
      >
        <span className="crpv-ws-signal-tag cap">Organization Signals</span>
        <span className="crpv-ws-signal-stage cap">Diagnosis</span>
        <span className="crpv-ws-signal-desc">Internal docs &amp; strategy artifacts</span>
        <div className="crpv-ws-signal-bar-track">
          <span className="crpv-ws-signal-bar-fill" style={{ width: `${orgPct}%` }} />
        </div>
        <span className="crpv-ws-signal-cov cap">{orgFilled}/{orgTotal} fields</span>
      </button>

      <div className="crpv-ws-gap-col">
        <span className="crpv-ws-gap-line" />
        {hasGap2 && <span className="crpv-ws-gap-label cap">gap</span>}
        <span className="crpv-ws-gap-arrow-glyph">→</span>
      </div>

      <button
        type="button"
        className={`crpv-ws-signal-col crpv-ws-signal-btn crpv-ws-signal-locked${activeStage === "customer" ? " crpv-ws-signal-active" : ""}`}
        onClick={() => setActiveStage("customer")}
      >
        <span className="crpv-ws-signal-tag cap">Customer Signals</span>
        <span className="crpv-ws-signal-stage cap">Focus</span>
        <span className="crpv-ws-signal-desc">Research interviews &amp; validation</span>
        <div className="crpv-ws-signal-bar-track">
          <span className="crpv-ws-signal-bar-fill" style={{ width: "0%" }} />
        </div>
        <span className="crpv-ws-signal-cov cap">Coming after research</span>
      </button>
    </div>
  );
}


// ─── Positioning ──────────────────────────────────────────────────────────────

export function PositioningOutside({ baseline, companyId, exclusion }: { baseline: BaselineResult | null; companyId: string | undefined; exclusion?: ExclusionControls }) {
  const { getStatus, setStatus } = useSignalReview(companyId);

  if (!baseline) {
    return (
      <div className="crpv-ws-section">
        <div className="crpv-ws-placeholder">
          <p>No outside signals found.</p>
          <p className="crpv-ws-hint">Run baseline research for this company to see what the market says publicly.</p>
        </div>
      </div>
    );
  }

  const { message_alignment, outside_voice_signals = [], category_archetype } = baseline;

  return (
    <div className="crpv-ws-section">
      <BaselineWarningBanner baseline={baseline} />
      <SectionHeader
        title="Positioning · Outside Signals"
        desc="What the market sees publicly — before any internal strategy work."
      />
      <ReviewableBlock label="Market space (inferred)" value={category_archetype} getStatus={getStatus} setStatus={setStatus} />
      <ReviewableBlock label="What they claim publicly" value={message_alignment?.company_claim_posture} getStatus={getStatus} setStatus={setStatus} />
      <ReviewableBlock label="What the market sees" value={message_alignment?.outside_voice_posture} getStatus={getStatus} setStatus={setStatus} />
      {message_alignment?.alignment_status && (
        <ReviewableBlock
          label="Alignment signal"
          value={[message_alignment.alignment_status, message_alignment.alignment_summary].filter(Boolean).join(" — ")}
          getStatus={getStatus}
          setStatus={setStatus}
        />
      )}
      {outside_voice_signals.length > 0 && (
        <OutsideSignalItems label="External perspectives" signals={outside_voice_signals} exclusion={exclusion} />
      )}
    </div>
  );
}

// ─── Strategy ─────────────────────────────────────────────────────────────────

export function StrategyOutside({ baseline, companyId }: { baseline: BaselineResult | null; companyId: string | undefined }) {
  const { getStatus, setStatus } = useSignalReview(companyId);

  if (!baseline) {
    return (
      <div className="crpv-ws-section">
        <div className="crpv-ws-placeholder">No outside signals found.</div>
      </div>
    );
  }

  const { lens_card, top_hypotheses = [], open_questions = [] } = baseline;

  return (
    <div className="crpv-ws-section">
      <BaselineWarningBanner baseline={baseline} />
      <SectionHeader
        title="Strategy · Outside Signals"
        desc="How the market perceives the company's competitive position."
      />
      {lens_card?.economic_engine && (
        <ReviewableBlock label="How they make money (inferred)" value={lens_card.economic_engine} getStatus={getStatus} setStatus={setStatus} />
      )}
      {top_hypotheses.length > 0 && (
        <ReadonlyList label="What the market assumes about their strategy" items={top_hypotheses} getStatus={getStatus} setStatus={setStatus} />
      )}
      <AnnotatableQuestionList
        label="Strategic unknowns"
        questions={open_questions}
        companyId={companyId}
      />
    </div>
  );
}

// ─── JTBD ─────────────────────────────────────────────────────────────────────

export function JTBDOutside({ baseline, companyId }: { baseline: BaselineResult | null; companyId: string | undefined }) {
  const { getStatus, setStatus } = useSignalReview(companyId);

  if (!baseline) {
    return (
      <div className="crpv-ws-section">
        <div className="crpv-ws-placeholder">No outside signals found.</div>
      </div>
    );
  }

  const { lens_card, top_hypotheses = [], open_questions = [] } = baseline;

  const personaFields = [
    { label: "Primary buyer (inferred)",   value: lens_card?.primary_buyer },
    { label: "Decision maker (inferred)",  value: lens_card?.chooser },
    { label: "End user (inferred)",        value: lens_card?.user },
  ].filter((f) => !!f.value);

  return (
    <div className="crpv-ws-section">
      <BaselineWarningBanner baseline={baseline} />
      <SectionHeader
        title="JTBD · Outside Signals"
        desc="Who the market thinks is doing the job and what it looks like."
      />
      {personaFields.map((f) => (
        <ReviewableBlock key={f.label} label={f.label} value={f.value} getStatus={getStatus} setStatus={setStatus} />
      ))}
      {top_hypotheses.length > 0 && (
        <ReadonlyList label="Inferred jobs to be done" items={top_hypotheses} getStatus={getStatus} setStatus={setStatus} />
      )}
      <AnnotatableQuestionList
        label="Unresolved questions"
        questions={open_questions}
        companyId={companyId}
      />
    </div>
  );
}

// ─── Needs ────────────────────────────────────────────────────────────────────

export function NeedsOutside({ baseline, exclusion }: { baseline: BaselineResult | null; exclusion?: ExclusionControls }) {
  if (!baseline) {
    return (
      <div className="crpv-ws-section">
        <div className="crpv-ws-placeholder">No outside signals found.</div>
      </div>
    );
  }

  const { outside_voice_signals = [], evidence_ledger = [] } = baseline;

  const activeLedger   = exclusion ? evidence_ledger.filter((item) => !exclusion.isExcluded(ledgerItemFingerprint(item))) : evidence_ledger;
  const excludedLedger = exclusion ? evidence_ledger.filter((item) =>  exclusion.isExcluded(ledgerItemFingerprint(item))) : [];
  const hasExcluded    = excludedLedger.length > 0;

  function renderLedgerItem(item: BaselineEvidenceItem, i: number, isExcludedItem: boolean) {
    const fp = ledgerItemFingerprint(item);
    const isSuspicious = item.signal_strength === "weak" || !cleanSnippet(item.snippet);
    return (
      <div key={i} className={`crpv-ws-outside-evidence-item${isExcludedItem ? " crpv-ws-excluded-item" : ""}`}>
        <div className="crpv-ws-outside-title">
          {item.bucket && (
            <span className="crpv-ws-outside-type cap">{item.bucket.replace(/_/g, " ")}</span>
          )}
        </div>
        <div className="crpv-ws-outside-body">
          {cleanSnippet(item.snippet)
            ? <span className="crpv-ws-outside-snippet">{cleanSnippet(item.snippet)}</span>
            : <span className="crpv-ws-outside-snippet crpv-ws-snippet-none">No public content found</span>}
        </div>
        <div className="crpv-ws-outside-chips">
          {item.signal_strength && (
            <span className={`crpv-ws-outside-strength cap crpv-ws-strength-${item.signal_strength}`}>
              {item.signal_strength}
            </span>
          )}
        </div>
        {isExcludedItem && exclusion ? (
          <button
            type="button"
            className="crpv-ws-restore-btn"
            onClick={() => exclusion.restoreSignal(fp)}
            title="Restore — re-includes this item in the next scoring run"
          >↩ Restore</button>
        ) : exclusion ? (
          <button
            type="button"
            className={`crpv-rv-btn crpv-rv-flag${isSuspicious ? " crpv-rv-suspicious-flag" : ""}`}
            title={isSuspicious ? "Needs review — exclude if from the wrong source. Affects scoring." : "Exclude from analysis — affects scoring"}
            onClick={() => exclusion.excludeSignal(fp)}
          >✗</button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="crpv-ws-section crpv-ws-section-wide">
      <BaselineWarningBanner baseline={baseline} />
      <SectionHeader
        title="Needs · Outside Signals"
        desc="What the market is saying about their experience and frustrations."
      />
      {outside_voice_signals.length > 0 && (
        <OutsideSignalItems label="Sentiment signals" signals={outside_voice_signals} exclusion={exclusion} />
      )}
      {evidence_ledger.length > 0 && (
        <div className="crpv-ws-field">
          <label className="crpv-ws-label">Evidence items ({activeLedger.length}{excludedLedger.length > 0 ? ` of ${evidence_ledger.length}` : ""})</label>
          <div className="crpv-ws-readonly-list">
            {activeLedger.slice(0, 15).map((item, i) => renderLedgerItem(item, i, false))}
            {activeLedger.length > 15 && (
              <p className="crpv-ws-hint">{activeLedger.length - 15} more items not shown</p>
            )}
            {hasExcluded && (
              <div className="crpv-ws-excluded-section">
                <p className="crpv-ws-excluded-header">Excluded from analysis ({excludedLedger.length})</p>
                <p className="crpv-ws-excluded-notice">Source excluded. Scores will update; generated strategy artifacts may need review.</p>
                {excludedLedger.map((item, i) => renderLedgerItem(item, i, true))}
              </div>
            )}
          </div>
        </div>
      )}
      {outside_voice_signals.length === 0 && evidence_ledger.length === 0 && (
        <div className="crpv-ws-placeholder">No evidence found in outside signals.</div>
      )}
    </div>
  );
}

// Focused outside view for the Needs compare column:
// shows inferred jobs/needs from hypotheses + voice signals,
// NOT the raw evidence ledger (which isn't comparable to ODI desired outcomes).
export function NeedsOutsideCompare({ baseline }: { baseline: BaselineResult | null }) {
  if (!baseline) {
    return <div className="crpv-ws-placeholder">No outside signals found. Run the baseline research for this company first.</div>;
  }

  const hypotheses = baseline.top_hypotheses ?? [];

  if (hypotheses.length === 0) {
    return <div className="crpv-ws-placeholder">No inferred outcomes in outside signals.</div>;
  }

  return (
    <>
      <div className="crpv-ws-need-table-hd crpv-ws-need-table-hd-outside">
        <span className="crpv-ws-need-col-outcome cap">Inferred outcome</span>
      </div>
      {hypotheses.map((h, i) => (
        <div key={i} className="crpv-ws-need-row crpv-ws-need-row-outside">
          <div className="crpv-ws-need-outcome">{h}</div>
        </div>
      ))}
    </>
  );
}
