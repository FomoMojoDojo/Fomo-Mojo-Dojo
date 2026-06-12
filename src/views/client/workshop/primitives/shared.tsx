import { useState, useEffect } from "react";
import type { ReviewStatus, QuestionAnnotation, QuestionImportance } from "../hooks";
import { useQuestionAnnotations } from "../hooks";
import type { BaselineVoiceSignal, ExclusionControls, BaselineResult } from "../types";

// ─── ReviewControl ────────────────────────────────────────────────────────────

// Integrity sweep (2026-06-12): list primitives no longer collapse a dead data path
// into "No data found". Parents pass `error` where their hook exposes one; genuinely
// empty lists (healthy path) keep their plain empty strings.
function ListEmptyState({ error, fallback }: { error?: string | null; fallback: string }) {
  if (error) {
    return <div className="crpv-ws-readonly crpv-ws-readonly-empty" style={{ color: "#c45c00" }}>This check didn't complete — it will run again on the next scan.</div>;
  }
  return <div className="crpv-ws-readonly crpv-ws-readonly-empty">{fallback}</div>;
}

export function ReviewControl({
  content,
  status,
  onSet,
  isSuspicious,
}: {
  content: string;
  status: ReviewStatus;
  onSet: (content: string, s: ReviewStatus) => void;
  isSuspicious?: boolean;
}) {
  return (
    <div className="crpv-rv-ctrl">
      <span
        className="crpv-rv-suspicious cap"
        style={{ visibility: (isSuspicious && status === null) ? "visible" : "hidden" }}
        title="Needs review — may be from a different company or source"
      >?</span>
      <button
        type="button"
        className={`crpv-rv-btn crpv-rv-confirm${status === "confirmed" ? " active" : ""}`}
        title="Confirm — this information is accurate"
        onClick={() => onSet(content, status === "confirmed" ? null : "confirmed")}
      >✓</button>
      <button
        type="button"
        className={`crpv-rv-btn crpv-rv-flag${status === "flagged" ? " active" : ""}`}
        title="Flag — incorrect or from the wrong source"
        onClick={() => onSet(content, status === "flagged" ? null : "flagged")}
      >✗</button>
    </div>
  );
}

// ─── ReadonlyList ─────────────────────────────────────────────────────────────

export function ReadonlyList({
  label,
  items,
  getStatus,
  setStatus,
  error,
}: {
  label: string;
  items: string[];
  getStatus?: (content: string) => ReviewStatus;
  setStatus?: (content: string, s: ReviewStatus) => void;
  error?: string | null;
}) {
  return (
    <div className="crpv-ws-field">
      <label className="crpv-ws-label">{label}</label>
      {items.length > 0 ? (
        <div className="crpv-ws-readonly-list">
          {items.map((item, i) => {
            const status = getStatus ? getStatus(item) : null;
            return (
              <div key={i} className={`crpv-ws-outside-item${status === "flagged" ? " crpv-rv-flagged" : ""}`}>
                <span className="crpv-ws-outside-bullet">·</span>
                <span className="crpv-ws-outside-text">{item}</span>
                {getStatus && setStatus && (
                  <ReviewControl
                    content={item}
                    status={status}
                    onSet={setStatus}
                  />
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <ListEmptyState error={error} fallback="No data found" />
      )}
    </div>
  );
}

// ─── OutsideSignalItems ───────────────────────────────────────────────────────

export function OutsideSignalItems({
  label,
  signals,
  getStatus,
  setStatus,
  exclusion,
  error,
}: {
  label: string;
  signals: BaselineVoiceSignal[];
  getStatus?: (content: string) => ReviewStatus;
  setStatus?: (content: string, s: ReviewStatus) => void;
  exclusion?: ExclusionControls;
  error?: string | null;
}) {
  const activeSignals   = exclusion ? signals.filter((s) => !exclusion.isExcluded((s.signal || s.perspective || "").slice(0, 200))) : signals;
  const excludedSignals = exclusion ? signals.filter((s) =>  exclusion.isExcluded((s.signal || s.perspective || "").slice(0, 200))) : [];

  function renderSignalItem(s: BaselineVoiceSignal, i: number, isExcludedItem: boolean) {
    const content = s.signal || s.perspective || "";
    const fp = content.slice(0, 200);
    const status = getStatus ? getStatus(content) : null;

    return (
      <div key={i} className={`crpv-ws-outside-signal-item${isExcludedItem ? " crpv-ws-excluded-item" : status === "flagged" ? " crpv-rv-flagged" : ""}`}>
        <div className="crpv-ws-outside-title">
          {s.source_type && (
            <span className="crpv-ws-outside-type cap">{s.source_type.replace(/_/g, " ")}</span>
          )}
        </div>
        <div className="crpv-ws-outside-body">
          {s.signal && <span className="crpv-ws-outside-signal-text">{s.signal}</span>}
        </div>
        <div className="crpv-ws-outside-chips">
          {s.sentiment && (
            <span className={`crpv-ws-outside-sentiment cap crpv-ws-sent-${s.sentiment.toLowerCase()}`}>
              {s.sentiment}
            </span>
          )}
        </div>
        {isExcludedItem && exclusion ? (
          <button
            type="button"
            className="crpv-ws-restore-btn"
            onClick={() => exclusion.restoreSignal(fp)}
            title="Restore — show signal again"
          >↩ Restore</button>
        ) : exclusion && content ? (
          <button
            type="button"
            className="crpv-rv-btn crpv-rv-flag"
            title="Hide — display only, does not affect scoring"
            onClick={() => exclusion.excludeSignal(fp)}
          >✗</button>
        ) : getStatus && setStatus && content ? (
          <ReviewControl content={content} status={status} onSet={setStatus} />
        ) : null}
      </div>
    );
  }

  return (
    <div className="crpv-ws-field">
      <label className="crpv-ws-label">{label} ({signals.length})</label>
      {signals.length > 0 ? (
        <div className="crpv-ws-readonly-list">
          {activeSignals.map((s, i) => renderSignalItem(s, i, false))}
          {excludedSignals.length > 0 && (
            <div className="crpv-ws-excluded-section">
              <p className="crpv-ws-excluded-header">Hidden from this view ({excludedSignals.length})</p>
              <p className="crpv-ws-excluded-notice crpv-ws-excluded-notice-display">Signal hidden from this view. This item does not currently affect scoring.</p>
              {excludedSignals.map((s, i) => renderSignalItem(s, i, true))}
            </div>
          )}
        </div>
      ) : (
        <ListEmptyState error={error} fallback="No signals found" />
      )}
    </div>
  );
}

// ─── AnnotatableQuestion ──────────────────────────────────────────────────────

function AnnotatableQuestion({
  question,
  annotation,
  onUpdate,
}: {
  question: string;
  annotation: QuestionAnnotation;
  onUpdate: (patch: Partial<QuestionAnnotation>) => void;
}) {
  const [draft, setDraft] = useState(annotation.answer);
  useEffect(() => { setDraft(annotation.answer); }, [annotation.answer]);

  const isImportant = annotation.importance === "important";
  const isDismissed = annotation.importance === "unimportant";

  function toggleImportance(level: QuestionImportance) {
    onUpdate({ importance: annotation.importance === level ? null : level });
  }

  return (
    <div className={`crpv-ws-question-row${isImportant ? " crpv-ws-question-hi" : ""}${isDismissed ? " crpv-ws-question-dim" : ""}`}>
      <div className="crpv-ws-question-hd">
        <span className="crpv-ws-question-text">{question}</span>
        <div className="crpv-ws-question-actions">
          <button
            type="button"
            className={`crpv-ws-question-btn${isImportant ? " active" : ""}`}
            onClick={() => toggleImportance("important")}
            title="Mark as important"
          >★</button>
          <button
            type="button"
            className={`crpv-ws-question-btn crpv-ws-question-btn-x${isDismissed ? " active" : ""}`}
            onClick={() => toggleImportance("unimportant")}
            title="Mark as not important"
          >✕</button>
        </div>
      </div>
      {!isDismissed && (
        <textarea
          className="crpv-ws-question-answer"
          placeholder="Answer or note…"
          rows={draft ? 2 : 1}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => { if (draft !== annotation.answer) onUpdate({ answer: draft }); }}
        />
      )}
    </div>
  );
}

// ─── AnnotatableQuestionList ──────────────────────────────────────────────────

export function AnnotatableQuestionList({
  label,
  questions,
  companyId,
  error,
}: {
  label: string;
  questions: string[];
  companyId: string | undefined;
  error?: string | null;
}) {
  const { getAnnotation, updateAnnotation } = useQuestionAnnotations(companyId);

  return (
    <div className="crpv-ws-field">
      <label className="crpv-ws-label">{label}</label>
      {questions.length > 0 ? (
        <div className="crpv-ws-question-list">
          {questions.map((q, i) => (
            <AnnotatableQuestion
              key={i}
              question={q}
              annotation={getAnnotation(q)}
              onUpdate={(patch) => updateAnnotation(q, patch)}
            />
          ))}
        </div>
      ) : (
        <ListEmptyState error={error} fallback="No questions found" />
      )}
    </div>
  );
}

// ─── ReviewableBlock ──────────────────────────────────────────────────────────

export function ReviewableBlock({
  label,
  value,
  getStatus,
  setStatus,
}: {
  label: string;
  value: string | null | undefined;
  getStatus: (content: string) => ReviewStatus;
  setStatus: (content: string, s: ReviewStatus) => void;
}) {
  const text = (value || "").trim();
  const status = text ? getStatus(text) : null;
  return (
    <div className="crpv-ws-field">
      <label className="crpv-ws-label">{label}</label>
      <div className="crpv-ws-rv-content-row">
        <div className={`crpv-ws-readonly${!text ? " crpv-ws-readonly-empty" : ""}${status === "flagged" ? " crpv-rv-flagged" : ""}`}>
          {text || "—"}
        </div>
        {text && <ReviewControl content={text} status={status} onSet={setStatus} />}
      </div>
    </div>
  );
}

// ─── BaselineWarningBanner ────────────────────────────────────────────────────

const AMBIGUOUS_BASELINE_STATUSES = new Set([
  "ambiguous_public_evidence",
  "insufficient_public_evidence",
]);

export function BaselineWarningBanner({ baseline }: { baseline: BaselineResult | null }) {
  if (!baseline?.status) return null;
  if (!AMBIGUOUS_BASELINE_STATUSES.has(baseline.status.toLowerCase())) return null;
  return (
    <div className="crpv-rv-banner">
      <span className="crpv-rv-banner-icon">⚠</span>
      <span>
        Research returned ambiguous results — signals may include information from a similarly-named company or insufficient public sources.
        Review each item before the initial client meeting.
      </span>
    </div>
  );
}

// ─── DataQualityMarker ────────────────────────────────────────────────────────

export function DataQualityMarker({ type, prompt }: { type: "thin" | "ambiguous"; prompt: string }) {
  const label = type === "ambiguous" ? "ambiguous signals" : "thin evidence";
  return (
    <span className={`crpv-dq-marker crpv-dq-marker--${type}`} title={prompt} aria-label={`Signal quality: ${label} — ${prompt}`}>
      {label}
    </span>
  );
}
