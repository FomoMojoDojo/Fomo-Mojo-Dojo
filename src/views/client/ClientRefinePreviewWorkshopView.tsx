import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import type { Company } from "@/hooks/useCompany";
import { useClientViewData } from "@/hooks/useClientViewData";
import { usePositioningCanvas } from "@/hooks/usePositioningCanvas";
import { useStrategyCascade } from "@/hooks/useStrategyCascade";
import { useOdiNeeds, type OdiNeedRow, type OdiMarketDefinitionRow } from "@/hooks/useOdiNeeds";
import { usePublicBaseline } from "@/hooks/usePublicBaseline";
import { CLIENT_REFINE_PREVIEW_ROUTE } from "@/lib/clientRefinePreview";
import type { PositioningCanvas, PositioningItem, StrategyCascade, CascadeItem } from "@/lib/types";
import "@/styles/client-refine-preview.css";

// ─── Types ────────────────────────────────────────────────────────────────────

type WorkshopTab  = "positioning" | "strategy" | "jtbd" | "needs" | "council";
type SignalStage  = "outside" | "org" | "customer";
type GapAlignment = "aligned" | "drift" | "gap" | "missing";

interface BaselineVoiceSignal {
  perspective?: string;
  source_type?: string;
  signal?: string;
  sentiment?: string;
  alignment?: string;
  url?: string;
  confidence?: number;
}

interface BaselineEvidenceItem {
  bucket?: string;
  signal_strength?: string;
  confidence?: number;
  snippet?: string;
  url?: string;
}

interface BaselineResult {
  status?: string;
  category_archetype?: string;
  lens_card?: {
    economic_engine?: string;
    primary_buyer?: string;
    chooser?: string;
    user?: string;
  };
  evidence_ledger?: BaselineEvidenceItem[];
  top_hypotheses?: string[];
  open_questions?: string[];
  message_alignment?: {
    company_claim_posture?: string;
    outside_voice_posture?: string;
    alignment_status?: string;
    alignment_summary?: string;
  };
  outside_voice_signals?: BaselineVoiceSignal[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toSentence(value: string | null | undefined) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

// Strip system-generated placeholder text from evidence snippets.
// "Declared in page metadata (/)" means the research system found a <meta> tag
// declaration but no substantive content — not useful to show verbatim.
const PLACEHOLDER_PATTERNS = [
  /^declared in (page )?metadata/i,
  /^found in (page )?metadata/i,
  /^referenced in (page )?metadata/i,
  /^present in (page )?metadata/i,
  /^mentioned in (page )?metadata/i,
];
function cleanSnippet(snippet: string | null | undefined): string | null {
  const text = (snippet || "").trim();
  if (!text) return null;
  if (PLACEHOLDER_PATTERNS.some((re) => re.test(text))) return null;
  return text;
}

function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "just now";
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}

function coverageOf(fields: (string | number | boolean | null | undefined)[]): number {
  return fields.filter((f) => (typeof f === "string" ? f.trim().length > 0 : !!f)).length;
}

function alignmentOf(
  orgValue: string | null | undefined,
  outsideValue: string | null | undefined,
): GapAlignment {
  const org = (orgValue || "").trim();
  const out = (outsideValue || "").trim();
  if (!out) return "missing";
  if (!org) return "gap";
  if (org.toLowerCase() === out.toLowerCase()) return "aligned";
  const orgWords = new Set(org.toLowerCase().split(/\s+/).filter((w) => w.length > 3));
  const outWords = out.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
  const overlap = outWords.filter((w) => orgWords.has(w)).length;
  if (outWords.length > 0 && overlap / outWords.length > 0.25) return "drift";
  return "gap";
}

function baselineOf(run: { result_json?: unknown } | null): BaselineResult | null {
  if (!run?.result_json || typeof run.result_json !== "object") return null;
  return run.result_json as BaselineResult;
}

// ─── Save flash ───────────────────────────────────────────────────────────────

function useSaveFlash() {
  const [savedField, setSavedField] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flash = useCallback((field: string) => {
    setSavedField(field);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setSavedField(null), 2200);
  }, []);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  return { savedField, flash };
}

// ─── Gap badge ────────────────────────────────────────────────────────────────

function GapBadge({ alignment, baselineValue }: { alignment: GapAlignment; baselineValue?: string }) {
  const preview = alignment === "missing"
    ? "Not found in outside signals"
    : baselineValue
      ? `Outside: "${baselineValue.slice(0, 80)}${baselineValue.length > 80 ? "…" : ""}"`
      : "Outside signal unclear";
  return (
    <span
      className={`crpv-ws-gap-badge crpv-ws-gap-${alignment}`}
      title={preview}
      aria-label={`Signal alignment: ${alignment}`}
    />
  );
}

// ─── FieldBlock ───────────────────────────────────────────────────────────────

function FieldBlock({
  label,
  value,
  onSave,
  hint,
  rows = 3,
  isSaved,
  singleLine = false,
  gap,
}: {
  label: string;
  value: string;
  onSave: (v: string) => Promise<void>;
  hint?: string;
  rows?: number;
  isSaved?: boolean;
  singleLine?: boolean;
  gap?: { alignment: GapAlignment; baselineValue?: string };
}) {
  const [local, setLocal] = useState(value);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setLocal(value); }, [value]);

  const handleBlur = useCallback(async () => {
    if (local === value) return;
    setSaving(true);
    try { await onSave(local); } catch { /* revert on next load */ }
    finally { setSaving(false); }
  }, [local, value, onSave]);

  return (
    <div className="crpv-ws-field">
      <div className="crpv-ws-field-hd">
        <label className="crpv-ws-label">
          {label}
          {gap && <GapBadge alignment={gap.alignment} baselineValue={gap.baselineValue} />}
        </label>
        {saving && <span className="crpv-ws-saving cap">Saving…</span>}
        {!saving && isSaved && <span className="crpv-ws-saved cap">Saved ✓</span>}
      </div>
      {hint && <p className="crpv-ws-hint">{hint}</p>}
      {singleLine ? (
        <input
          type="text"
          className="crpv-ws-input"
          value={local}
          onChange={(e) => setLocal(e.target.value)}
          onBlur={handleBlur}
        />
      ) : (
        <textarea
          className="crpv-ws-textarea"
          rows={rows}
          value={local}
          onChange={(e) => setLocal(e.target.value)}
          onBlur={handleBlur}
        />
      )}
    </div>
  );
}

// ─── ListEditor ───────────────────────────────────────────────────────────────

function ListEditor({
  label,
  items,
  onSave,
  addPlaceholder = "Add…",
  isSaved,
}: {
  label: string;
  items: PositioningItem[];
  onSave: (items: PositioningItem[]) => Promise<void>;
  addPlaceholder?: string;
  isSaved?: boolean;
}) {
  const [draft, setDraft] = useState<PositioningItem[]>(items);
  const [adding, setAdding] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => { setDraft(items); }, [items]);

  const save = useCallback(async (updated: PositioningItem[]) => {
    setSaving(true);
    try { await onSave(updated); } catch { /* silent */ }
    finally { setSaving(false); }
  }, [onSave]);

  const handleItemBlur = useCallback(async (idx: number, name: string) => {
    const next = draft.map((item, i) => i === idx ? { ...item, name } : item);
    setDraft(next);
    await save(next);
  }, [draft, save]);

  const removeItem = useCallback(async (idx: number) => {
    const next = draft.filter((_, i) => i !== idx);
    setDraft(next);
    await save(next);
  }, [draft, save]);

  const addItem = useCallback(async () => {
    const name = adding.trim();
    if (!name) return;
    const next = [...draft, { id: `item-${Date.now()}`, name, description: "", highlighted: false }];
    setDraft(next);
    setAdding("");
    await save(next);
  }, [adding, draft, save]);

  return (
    <div className="crpv-ws-field">
      <div className="crpv-ws-field-hd">
        <label className="crpv-ws-label">{label}</label>
        {saving && <span className="crpv-ws-saving cap">Saving…</span>}
        {!saving && isSaved && <span className="crpv-ws-saved cap">Saved ✓</span>}
      </div>
      <div className="crpv-ws-list">
        {draft.map((item, idx) => (
          <div key={item.id} className="crpv-ws-list-row">
            <input
              className="crpv-ws-list-input"
              defaultValue={item.name}
              onBlur={(e) => handleItemBlur(idx, e.target.value)}
            />
            <button type="button" className="crpv-ws-remove-btn" onClick={() => removeItem(idx)} aria-label="Remove">✕</button>
          </div>
        ))}
        <div className="crpv-ws-list-row crpv-ws-list-add">
          <input
            className="crpv-ws-list-input"
            placeholder={addPlaceholder}
            value={adding}
            onChange={(e) => setAdding(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addItem(); } }}
          />
          <button type="button" className="crpv-ws-add-btn" onClick={addItem} aria-label="Add">＋</button>
        </div>
      </div>
    </div>
  );
}

// ─── Readonly primitives (for Outside Signals) ────────────────────────────────

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

function ReviewableBlock({
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
      <div className="crpv-ws-field-hd">
        <label className="crpv-ws-label">{label}</label>
        {text && (
          <ReviewControl content={text} status={status} onSet={setStatus} />
        )}
      </div>
      <div className={`crpv-ws-readonly${!text ? " crpv-ws-readonly-empty" : ""}${status === "flagged" ? " crpv-rv-flagged" : ""}`}>
        {text || "—"}
      </div>
    </div>
  );
}

// ─── Signal review (localStorage) ────────────────────────────────────────────

type ReviewStatus = "confirmed" | "flagged" | null;

const SIGNAL_REVIEW_KEY = "crpv_signal_review";
const AMBIGUOUS_BASELINE_STATUSES = new Set([
  "ambiguous_public_evidence",
  "insufficient_public_evidence",
]);

function useSignalReview(companyId: string | undefined) {
  const [store, setStore] = useState<Record<string, ReviewStatus>>(() => {
    try { return JSON.parse(localStorage.getItem(SIGNAL_REVIEW_KEY) || "{}"); }
    catch { return {}; }
  });

  const itemKey = useCallback(
    (content: string) => `${companyId ?? ""}::${content.slice(0, 200)}`,
    [companyId],
  );

  const getStatus = useCallback(
    (content: string): ReviewStatus => store[itemKey(content)] ?? null,
    [store, itemKey],
  );

  const setStatus = useCallback(
    (content: string, s: ReviewStatus) => {
      const k = itemKey(content);
      let next: Record<string, ReviewStatus>;
      if (s === null) {
        next = { ...store };
        delete next[k];
      } else {
        next = { ...store, [k]: s };
      }
      setStore(next);
      localStorage.setItem(SIGNAL_REVIEW_KEY, JSON.stringify(next));
    },
    [store, itemKey],
  );

  return { getStatus, setStatus };
}

function ReviewControl({
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
      {isSuspicious && status === null && (
        <span className="crpv-rv-suspicious cap" title="Needs review — may be from a different company or source">?</span>
      )}
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

function BaselineWarningBanner({ baseline }: { baseline: BaselineResult | null }) {
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

// ─── Question annotations (localStorage) ─────────────────────────────────────

type QuestionImportance = "important" | "unimportant" | null;
interface QuestionAnnotation { importance: QuestionImportance; answer: string }

const Q_STORAGE_KEY = "crpv_question_annotations";

function useQuestionAnnotations(companyId: string | undefined) {
  const [annotations, setAnnotations] = useState<Record<string, QuestionAnnotation>>(() => {
    try { return JSON.parse(localStorage.getItem(Q_STORAGE_KEY) || "{}"); }
    catch { return {}; }
  });

  const compoundKey = useCallback((q: string) =>
    `${companyId || ""}::${q.slice(0, 140)}`, [companyId]);

  const getAnnotation = useCallback((q: string): QuestionAnnotation =>
    annotations[compoundKey(q)] ?? { importance: null, answer: "" },
    [annotations, compoundKey]);

  const updateAnnotation = useCallback((q: string, patch: Partial<QuestionAnnotation>) => {
    const key = compoundKey(q);
    const current = annotations[key] ?? { importance: null, answer: "" };
    const next = { ...annotations, [key]: { ...current, ...patch } };
    setAnnotations(next);
    localStorage.setItem(Q_STORAGE_KEY, JSON.stringify(next));
  }, [annotations, compoundKey]);

  return { getAnnotation, updateAnnotation };
}

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

function AnnotatableQuestionList({
  label,
  questions,
  companyId,
}: {
  label: string;
  questions: string[];
  companyId: string | undefined;
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
        <div className="crpv-ws-readonly crpv-ws-readonly-empty">No questions found</div>
      )}
    </div>
  );
}

function ReadonlyList({
  label,
  items,
  getStatus,
  setStatus,
}: {
  label: string;
  items: string[];
  getStatus?: (content: string) => ReviewStatus;
  setStatus?: (content: string, s: ReviewStatus) => void;
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
        <div className="crpv-ws-readonly crpv-ws-readonly-empty">No data found</div>
      )}
    </div>
  );
}

function OutsideSignalItems({
  label,
  signals,
  getStatus,
  setStatus,
}: {
  label: string;
  signals: BaselineVoiceSignal[];
  getStatus?: (content: string) => ReviewStatus;
  setStatus?: (content: string, s: ReviewStatus) => void;
}) {
  return (
    <div className="crpv-ws-field">
      <label className="crpv-ws-label">{label} ({signals.length})</label>
      {signals.length > 0 ? (
        <div className="crpv-ws-readonly-list">
          {signals.map((s, i) => {
            const content = s.signal || s.perspective || "";
            const status = getStatus ? getStatus(content) : null;
            return (
              <div key={i} className={`crpv-ws-outside-signal-item${status === "flagged" ? " crpv-rv-flagged" : ""}`}>
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
                  {getStatus && setStatus && content && (
                    <ReviewControl content={content} status={status} onSet={setStatus} />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="crpv-ws-readonly crpv-ws-readonly-empty">No signals found</div>
      )}
    </div>
  );
}

// ─── Customer placeholder ─────────────────────────────────────────────────────

function CustomerPlaceholder() {
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

function SignalBar({
  activeStage,
  setActiveStage,
  baseline,
  positioning,
  strategy,
}: {
  activeStage: SignalStage;
  setActiveStage: (s: SignalStage) => void;
  baseline: BaselineResult | null;
  positioning: PositioningCanvas | null;
  strategy: StrategyCascade | null;
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
        <span className="crpv-ws-signal-tag cap">Outside Signals</span>
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

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHeader({ title, desc, updatedAt }: { title: string; desc: string; updatedAt?: string }) {
  return (
    <div className="crpv-ws-section-hd">
      <div className="crpv-ws-section-hd-top">
        <p className="cap">{title}</p>
        {updatedAt && <span className="crpv-ws-updated cap">Updated {relativeTime(updatedAt)}</span>}
      </div>
      <p className="crpv-ws-section-desc">{desc}</p>
    </div>
  );
}

// ─── Positioning ──────────────────────────────────────────────────────────────

function PositioningOutside({ baseline, companyId }: { baseline: BaselineResult | null; companyId: string | undefined }) {
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
        <OutsideSignalItems label="External perspectives" signals={outside_voice_signals} getStatus={getStatus} setStatus={setStatus} />
      )}
    </div>
  );
}

function PositioningOrgPanel({
  canvas,
  loading,
  updatedAt,
  baseline,
  updateTextField,
  updateItemsField,
}: {
  canvas: PositioningCanvas | null;
  loading: boolean;
  updatedAt?: string;
  baseline: BaselineResult | null;
  updateTextField: (field: "value_for_customer" | "best_fit_customers" | "market_category" | "category_rationale" | "current_tagline" | "proposed_tagline", value: string) => Promise<void>;
  updateItemsField: (field: "competitive_alternatives_json" | "unique_attributes_json", items: PositioningItem[]) => Promise<void>;
}) {
  const { savedField, flash } = useSaveFlash();

  if (loading) return <div className="crpv-ws-placeholder cap">Loading…</div>;
  if (!canvas) return <div className="crpv-ws-placeholder">No positioning data yet.</div>;

  return (
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
      />

      <FieldBlock
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
      />

      <FieldBlock
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
      />

      <FieldBlock
        label="The category you're in"
        value={canvas.market_category}
        onSave={async (v) => { await updateTextField("market_category", v); flash("category"); }}
        rows={2}
        isSaved={savedField === "category"}
        gap={baseline ? {
          alignment: alignmentOf(canvas.market_category, baseline.category_archetype),
          baselineValue: baseline.category_archetype,
        } : undefined}
      />

      <FieldBlock
        label="Why you belong there"
        value={canvas.category_rationale}
        onSave={async (v) => { await updateTextField("category_rationale", v); flash("rationale"); }}
        hint="What earns your place in this category?"
        rows={2}
        isSaved={savedField === "rationale"}
      />

      <FieldBlock
        label="Current tagline"
        value={canvas.current_tagline}
        onSave={async (v) => { await updateTextField("current_tagline", v); flash("tagline_current"); }}
        rows={1}
        singleLine
        isSaved={savedField === "tagline_current"}
      />

      <FieldBlock
        label="Proposed tagline"
        value={canvas.proposed_tagline}
        onSave={async (v) => { await updateTextField("proposed_tagline", v); flash("tagline_proposed"); }}
        rows={1}
        singleLine
        isSaved={savedField === "tagline_proposed"}
      />
    </div>
  );
}

// ─── Kanban board ─────────────────────────────────────────────────────────────

type CascadeStatusKey = CascadeItem["status"];

const KANBAN_COLS: { key: CascadeStatusKey; label: string }[] = [
  { key: "strong",     label: "Strong" },
  { key: "developing", label: "Building" },
  { key: "gap",        label: "Gap" },
];

function KanbanBoard({
  label,
  items,
  onUpdate,
  isSaved,
}: {
  label: string;
  items: CascadeItem[];
  onUpdate: (updated: CascadeItem[]) => Promise<void>;
  isSaved?: boolean;
}) {
  const [draggingName,  setDraggingName]  = useState<string | null>(null);
  const [dragOverCol,   setDragOverCol]   = useState<CascadeStatusKey | null>(null);
  const [pendingMove,   setPendingMove]   = useState<{ name: string; toStatus: CascadeStatusKey } | null>(null);
  const [evidenceText,  setEvidenceText]  = useState("");
  const evidenceRef = useRef<HTMLTextAreaElement>(null);

  const grouped: Record<CascadeStatusKey, CascadeItem[]> = {
    strong:     items.filter((i) => i.status === "strong"),
    developing: items.filter((i) => i.status === "developing"),
    gap:        items.filter((i) => i.status === "gap"),
  };

  function onDragStart(e: React.DragEvent<HTMLDivElement>, name: string) {
    setDraggingName(name);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", name);
  }

  function onDragEnd() {
    setDraggingName(null);
    setDragOverCol(null);
  }

  function onDragOver(e: React.DragEvent<HTMLDivElement>, col: CascadeStatusKey) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverCol(col);
  }

  function onDragLeave(e: React.DragEvent<HTMLDivElement>) {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setDragOverCol(null);
    }
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>, toStatus: CascadeStatusKey) {
    e.preventDefault();
    const name = e.dataTransfer.getData("text/plain");
    setDragOverCol(null);
    setDraggingName(null);
    const item = items.find((i) => i.name === name);
    if (!item || item.status === toStatus) return;
    setPendingMove({ name, toStatus });
    setEvidenceText("");
    // Focus the textarea on next frame
    requestAnimationFrame(() => evidenceRef.current?.focus());
  }

  async function confirmMove(skipEvidence: boolean) {
    if (!pendingMove) return;
    const { name, toStatus } = pendingMove;
    const evidence = skipEvidence ? undefined : (evidenceText.trim() || undefined);
    const unverified = !evidence ? true : undefined;
    const updated = items.map((i) =>
      i.name === name ? { ...i, status: toStatus, evidence, unverified } : i
    );
    setPendingMove(null);
    setEvidenceText("");
    await onUpdate(updated);
  }

  const toLabel = pendingMove
    ? KANBAN_COLS.find((c) => c.key === pendingMove.toStatus)?.label ?? pendingMove.toStatus
    : "";

  return (
    <div className="crpv-ws-field">
      <div className="crpv-ws-field-hd">
        <label className="crpv-ws-label">{label}</label>
        {isSaved && <span className="crpv-ws-saved cap">Saved ✓</span>}
      </div>
      <div className="crpv-ws-kanban">
        {KANBAN_COLS.map((col) => (
          <div
            key={col.key}
            className={`crpv-ws-kanban-col crpv-ws-kanban-${col.key}${dragOverCol === col.key ? " crpv-ws-kanban-over" : ""}`}
            onDragOver={(e) => onDragOver(e, col.key)}
            onDragLeave={onDragLeave}
            onDrop={(e) => onDrop(e, col.key)}
          >
            <div className="crpv-ws-kanban-hd">
              <span className="cap">{col.label}</span>
              <span className="crpv-ws-kanban-count">{grouped[col.key].length}</span>
            </div>
            {grouped[col.key].length === 0 && (
              <div className={`crpv-ws-kanban-empty cap${dragOverCol === col.key ? " crpv-ws-kanban-empty-over" : ""}`}>
                Drop here
              </div>
            )}
            {grouped[col.key].map((item, idx) => (
              <div
                key={idx}
                className={`crpv-ws-kanban-card${draggingName === item.name ? " crpv-ws-kanban-dragging" : ""}`}
                draggable
                onDragStart={(e) => onDragStart(e, item.name)}
                onDragEnd={onDragEnd}
              >
                <div className="crpv-ws-kanban-card-row">
                  <span className="crpv-ws-kanban-name">{item.name}</span>
                  {item.evidence ? (
                    <span
                      className="crpv-ws-kanban-verified"
                      title={item.evidence}
                      aria-label={`Evidence: ${item.evidence}`}
                    >●</span>
                  ) : item.unverified ? (
                    <span className="crpv-ws-kanban-unverified" title="No evidence provided">*</span>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>

      {pendingMove && (
        <div className="crpv-ws-kanban-evidence-panel">
          <p className="crpv-ws-kanban-evidence-prompt cap">
            Moving <strong>{pendingMove.name}</strong> → {toLabel}
          </p>
          <textarea
            ref={evidenceRef}
            className="crpv-ws-kanban-evidence-input"
            value={evidenceText}
            onChange={(e) => setEvidenceText(e.target.value)}
            placeholder="What evidence supports this change? Leave blank to mark as unverified."
            rows={2}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) confirmMove(false);
              if (e.key === "Escape") setPendingMove(null);
            }}
          />
          <div className="crpv-ws-kanban-evidence-actions">
            <button
              type="button"
              className="crpv-ws-kanban-evidence-save"
              onClick={() => confirmMove(false)}
            >
              {evidenceText.trim() ? "Save with evidence" : "Save (mark unverified)"}
            </button>
            <button
              type="button"
              className="crpv-ws-kanban-evidence-cancel"
              onClick={() => setPendingMove(null)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Strategy ─────────────────────────────────────────────────────────────────

function StrategyOutside({ baseline, companyId }: { baseline: BaselineResult | null; companyId: string | undefined }) {
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

function StrategyOrgPanel({
  strategy,
  loading,
  updatedAt,
  baseline,
  updateNarrativeField,
  updateListField,
}: {
  strategy: StrategyCascade | null;
  loading: boolean;
  updatedAt?: string;
  baseline: BaselineResult | null;
  updateNarrativeField: (field: "winning_aspiration" | "where_to_play" | "how_to_win", value: string) => Promise<void>;
  updateListField: (field: "capabilities_json" | "management_systems_json", items: CascadeItem[]) => Promise<void>;
}) {
  const { savedField, flash } = useSaveFlash();

  if (loading) return <div className="crpv-ws-placeholder cap">Loading…</div>;
  if (!strategy) return <div className="crpv-ws-placeholder">No strategy data yet.</div>;

  return (
    <div className="crpv-ws-section crpv-ws-section-wide">
      <SectionHeader
        title="Strategy · Organization Signals"
        desc="Where you're going, where you'll compete, and how you'll win."
        updatedAt={updatedAt}
      />

      <FieldBlock
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

      <FieldBlock
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

      <FieldBlock
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
    </div>
  );
}

// ─── JTBD ─────────────────────────────────────────────────────────────────────

function JTBDOutside({ baseline, companyId }: { baseline: BaselineResult | null; companyId: string | undefined }) {
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

const INNOVATION_OPTIONS = [
  { value: "differentiated", label: "Differentiated — you do things others can't" },
  { value: "dominant",       label: "Dominant — you outperform on what matters most" },
  { value: "disruptive",     label: "Disruptive — you're redefining how the job gets done" },
  { value: "discrete",       label: "Discrete — you serve a segment no one else is focused on" },
];

function JTBDOrgPanel({
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

      <FieldBlock
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

      <FieldBlock
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

      <FieldBlock
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

// ─── Needs ────────────────────────────────────────────────────────────────────

function NeedsOutside({ baseline, companyId }: { baseline: BaselineResult | null; companyId?: string }) {
  const { getStatus, setStatus } = useSignalReview(companyId);

  if (!baseline) {
    return (
      <div className="crpv-ws-section">
        <div className="crpv-ws-placeholder">No outside signals found.</div>
      </div>
    );
  }

  const { outside_voice_signals = [], evidence_ledger = [] } = baseline;

  return (
    <div className="crpv-ws-section crpv-ws-section-wide">
      <BaselineWarningBanner baseline={baseline} />
      <SectionHeader
        title="Needs · Outside Signals"
        desc="What the market is saying about their experience and frustrations."
      />
      {outside_voice_signals.length > 0 && (
        <OutsideSignalItems label="Sentiment signals" signals={outside_voice_signals} getStatus={getStatus} setStatus={setStatus} />
      )}
      {evidence_ledger.length > 0 && (
        <div className="crpv-ws-field">
          <label className="crpv-ws-label">Evidence items ({evidence_ledger.length})</label>
          <div className="crpv-ws-readonly-list">
            {evidence_ledger.slice(0, 15).map((item, i) => {
              const content = `${item.bucket ?? ""}::${item.snippet ?? ""}`;
              const status = getStatus(content);
              const isSuspicious = item.signal_strength === "weak" || !cleanSnippet(item.snippet);
              return (
                <div key={i} className={`crpv-ws-outside-evidence-item${status === "flagged" ? " crpv-rv-flagged" : ""}`}>
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
                    <ReviewControl
                      content={content}
                      status={status}
                      onSet={setStatus}
                      isSuspicious={isSuspicious}
                    />
                  </div>
                </div>
              );
            })}
            {evidence_ledger.length > 15 && (
              <p className="crpv-ws-hint">{evidence_ledger.length - 15} more items not shown</p>
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

const STATE_LABEL: Record<string, string> = {
  underserved: "Underserved",
  served:      "Served",
  overserved:  "Overserved",
};

function NeedRow({
  need,
  idx,
  total,
  reorderingId,
  onMove,
  onScoreChange,
}: {
  need: OdiNeedRow;
  idx: number;
  total: number;
  reorderingId: string | null;
  onMove: (idx: number, dir: "up" | "down") => Promise<void>;
  onScoreChange: (id: string, imp: number, sat: number) => Promise<void>;
}) {
  const [imp, setImp] = useState(need.importance);
  const [sat, setSat] = useState(need.satisfaction);

  useEffect(() => { setImp(need.importance); setSat(need.satisfaction); }, [need.importance, need.satisfaction]);

  const busy = reorderingId === need.id;

  return (
    <div className={`crpv-ws-need-row${busy ? " crpv-ws-need-moving" : ""}`}>
      <div className="crpv-ws-need-outcome">{need.desired_outcome}</div>
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

function NeedsOrgPanel({
  needs: initialNeeds,
  loading,
  updateNeedScores,
}: {
  needs: OdiNeedRow[];
  loading: boolean;
  updateNeedScores: (id: string, imp: number, sat: number) => Promise<void>;
}) {
  const [localNeeds, setLocalNeeds] = useState<OdiNeedRow[]>(initialNeeds);
  const [reorderingId, setReorderingId] = useState<string | null>(null);

  useEffect(() => { setLocalNeeds(initialNeeds); }, [initialNeeds]);

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
          total={localNeeds.length}
          reorderingId={reorderingId}
          onMove={moveNeed}
          onScoreChange={updateNeedScores}
        />
      ))}

      {Object.keys(grouped).length > 1 && (
        <p className="crpv-ws-needs-journeys cap">
          Journeys: {Object.entries(grouped).map(([k, v]) => `${k} (${v.length})`).join(" · ")}
        </p>
      )}
    </div>
  );
}

// ─── Council tab ─────────────────────────────────────────────────────────────

type CouncilKey = "strategy_council" | "mojo_council";
type CouncilRecStatus = "pending" | "accepted" | "ignored";

interface CouncilRec {
  id: string;
  title: string;
  recommendation: string;
  rationale: string;
  category: string;
  priority: "high" | "medium" | "low";
  confidence: number;
  status: CouncilRecStatus;
  source_context_json: Record<string, unknown> | null;
  decided_at: string | null;
  created_at: string;
}

interface CouncilRun {
  id: string;
  status: "running" | "completed" | "failed";
  summary: string;
  recommendation_count: number;
  source_snapshot_json: Record<string, unknown> | null;
  created_at: string;
}

const COUNCIL_OPTIONS: Array<{ key: CouncilKey; label: string; desc: string }> = [
  { key: "mojo_council",     label: "Mojo Council",     desc: "Heath, Dunford, Roger Martin, Berger, Torres, Miller, Ulwick" },
  { key: "strategy_council", label: "Strategy Council", desc: "Jobs, Bartlett, Hormozi, Robbins, Priestley" },
];

function councilKeyFromRun(run: CouncilRun): CouncilKey {
  const snap = (run.source_snapshot_json ?? {}) as Record<string, unknown>;
  return String(snap.council_key || "").trim().toLowerCase() === "mojo_council"
    ? "mojo_council" : "strategy_council";
}

function councilKeyFromRec(rec: CouncilRec): CouncilKey {
  const ctx = (rec.source_context_json ?? {}) as Record<string, unknown>;
  const direct = String(ctx.council_key || "").trim().toLowerCase();
  if (direct === "mojo_council") return "mojo_council";
  const snap = (ctx.source_snapshot ?? {}) as Record<string, unknown>;
  return String(snap.council_key || "").trim().toLowerCase() === "mojo_council"
    ? "mojo_council" : "strategy_council";
}

function panelDiscussion(run: CouncilRun | null): string {
  if (!run) return "";
  const snap = (run.source_snapshot_json ?? {}) as Record<string, unknown>;
  const raw = snap.panel_discussion;
  if (typeof raw === "string") return raw.trim();
  if (Array.isArray(raw)) return raw.map((e) => String(e || "").trim()).filter(Boolean).join("\n\n");
  return "";
}

function councilFmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(d);
}

async function extractCouncilError(error: unknown, fallback: string): Promise<string> {
  const err = error as { message?: string; context?: { text?: () => Promise<string> } } | null;
  const base = typeof err?.message === "string" && err.message.trim() ? err.message.trim() : fallback;
  try {
    const raw = (await err?.context?.text?.())?.trim();
    if (!raw) return base;
    try {
      const parsed = JSON.parse(raw) as { error?: string; message?: string };
      if (parsed?.error) return parsed.error;
      if (parsed?.message) return parsed.message;
    } catch { /* ignore */ }
    return `${base}: ${raw}`;
  } catch {
    return base;
  }
}

function WorkshopCouncilTab({ companyId, companyName }: { companyId: string; companyName: string }) {
  const [councilKey, setCouncilKey]       = useState<CouncilKey>("mojo_council");
  const [runs, setRuns]                   = useState<CouncilRun[]>([]);
  const [recs, setRecs]                   = useState<CouncilRec[]>([]);
  const [loading, setLoading]             = useState(true);
  const [running, setRunning]             = useState(false);
  const [decisionId, setDecisionId]       = useState<string | null>(null);
  const [statusFilter, setStatusFilter]   = useState<CouncilRecStatus | "all">("pending");
  const [error, setError]                 = useState<string | null>(null);

  const scopedRuns = useMemo(() => runs.filter((r) => councilKeyFromRun(r) === councilKey), [runs, councilKey]);
  const scopedRecs = useMemo(() => recs.filter((r) => councilKeyFromRec(r) === councilKey), [recs, councilKey]);
  const latestRun  = scopedRuns[0] ?? null;
  const discussion = useMemo(() => panelDiscussion(latestRun), [latestRun]);
  const filtered   = useMemo(() =>
    statusFilter === "all" ? scopedRecs : scopedRecs.filter((r) => r.status === statusFilter),
    [scopedRecs, statusFilter]);

  const counts = useMemo(() => ({
    pending:  scopedRecs.filter((r) => r.status === "pending").length,
    accepted: scopedRecs.filter((r) => r.status === "accepted").length,
    ignored:  scopedRecs.filter((r) => r.status === "ignored").length,
  }), [scopedRecs]);

  const meta = COUNCIL_OPTIONS.find((o) => o.key === councilKey)!;
  const sb = supabase as any;

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [recRes, runRes] = await Promise.all([
        sb.from("council_recommendations").select("*").eq("company_id", companyId).order("created_at", { ascending: false }).limit(250),
        sb.from("council_review_runs").select("id, status, summary, recommendation_count, source_snapshot_json, created_at").eq("company_id", companyId).order("created_at", { ascending: false }).limit(40),
      ]);
      if (recRes.error) throw recRes.error;
      if (runRes.error) throw runRes.error;
      setRecs((recRes.data ?? []) as CouncilRec[]);
      setRuns((runRes.data ?? []) as CouncilRun[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load council data");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [companyId]);

  async function runCouncil() {
    setRunning(true);
    setError(null);
    const beforeId = scopedRuns[0]?.id ?? null;
    try {
      const { data, error: invokeError } = await supabase.functions.invoke("council-review", {
        body: { company_id: companyId, council_key: councilKey },
      });
      if (invokeError) {
        const msg = await extractCouncilError(invokeError, "Council review failed");
        const mayTimeout = ["upstream", "timing out", "timed out", "timeout"].some((s) => msg.toLowerCase().includes(s));
        if (!mayTimeout) throw new Error(msg);
        // Poll for completion after timeout
        for (let i = 0; i < 10; i++) {
          await new Promise((r) => setTimeout(r, 1500));
          const { data: polled } = await sb.from("council_review_runs")
            .select("id, source_snapshot_json").eq("company_id", companyId).order("created_at", { ascending: false }).limit(20);
          const newest = (Array.isArray(polled) ? polled : [])
            .find((r: any) => String((r?.source_snapshot_json ?? {}).council_key || "") === councilKey && r.id !== beforeId);
          if (newest) { await load(); return; }
        }
        throw new Error(`${msg}. The run may still be processing — refresh in a few seconds.`);
      }
      if (data?.error) throw new Error(String(data.error));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Council review failed");
    } finally {
      setRunning(false);
    }
  }

  async function decide(id: string, status: CouncilRecStatus) {
    setDecisionId(`${id}:${status}`);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      await sb.from("council_recommendations").update({
        status, decided_at: new Date().toISOString(), decided_by: user?.id ?? null,
      }).eq("id", id).eq("company_id", companyId);
      setRecs((prev) => prev.map((r) => r.id === id ? { ...r, status, decided_at: new Date().toISOString() } : r));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setDecisionId(null);
    }
  }

  const STATUS_FILTERS: Array<{ key: CouncilRecStatus | "all"; label: string; count?: number }> = [
    { key: "all",      label: "All",      count: scopedRecs.length },
    { key: "pending",  label: "Pending",  count: counts.pending },
    { key: "accepted", label: "Accepted", count: counts.accepted },
    { key: "ignored",  label: "Ignored",  count: counts.ignored },
  ];

  return (
    <div className="crpv-ws-section crpv-ws-section-wide">
      <SectionHeader title="Council" desc="Run an outside-in advisory session based on what the research and org signals have found so far." />

      {/* Council selector */}
      <div className="crpv-ws-field">
        <label className="crpv-ws-label">Select council</label>
        <div className="crpv-council-selector">
          {COUNCIL_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              type="button"
              className={`crpv-council-selector-btn${councilKey === opt.key ? " active" : ""}`}
              onClick={() => setCouncilKey(opt.key)}
            >
              <span className="crpv-council-selector-name">{opt.label}</span>
              <span className="crpv-council-selector-desc cap">{opt.desc}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Run button */}
      <div className="crpv-council-run-row">
        <button
          type="button"
          className="crpv-council-run-btn"
          onClick={runCouncil}
          disabled={running}
        >
          {running ? `Running ${meta.label}…` : `Run ${meta.label}`}
        </button>
        {latestRun && (
          <span className="crpv-council-run-meta cap">
            Last run {councilFmtDate(latestRun.created_at)} · {latestRun.recommendation_count} recommendations
          </span>
        )}
        <button type="button" className="btn ghost" onClick={load} disabled={loading || running}>
          Refresh
        </button>
      </div>

      {error && <p className="crpv-ws-hint" style={{ color: "var(--crpv-hot)" }}>{error}</p>}

      {/* Latest run summary */}
      {latestRun?.summary && (
        <div className="crpv-ws-field">
          <label className="crpv-ws-label">Summary</label>
          <div className="crpv-ws-readonly crpv-council-summary">{latestRun.summary}</div>
        </div>
      )}

      {/* Panel discussion (collapsible) */}
      {discussion && (
        <div className="crpv-ws-field">
          <details className="crpv-council-discussion">
            <summary className="crpv-ws-label" style={{ cursor: "pointer", listStyle: "none" }}>
              Panel Discussion ▸
            </summary>
            <div className="crpv-ws-readonly crpv-council-discussion-body">{discussion}</div>
          </details>
        </div>
      )}

      {/* Status filter + recommendations */}
      <div className="crpv-ws-field">
        <div className="crpv-council-filters">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              className={`crpv-council-filter${statusFilter === f.key ? " active" : ""}`}
              onClick={() => setStatusFilter(f.key)}
            >
              <span className="cap">{f.label}</span>
              {f.count !== undefined && <span className="crpv-council-filter-count">{f.count}</span>}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="crpv-ws-placeholder cap">Loading council recommendations…</div>
        ) : filtered.length === 0 ? (
          <div className="crpv-ws-placeholder">
            {scopedRecs.length === 0
              ? `No recommendations yet. Run ${meta.label} to get started.`
              : "No recommendations in this filter."}
          </div>
        ) : (
          <div className="crpv-council-recs">
            {filtered.map((rec) => (
              <article key={rec.id} className={`crpv-council-rec crpv-council-rec-${rec.status}`}>
                <div className="crpv-council-rec-hd">
                  <span className="crpv-council-rec-title">{rec.title}</span>
                  <div className="crpv-council-rec-badges">
                    <span className={`crpv-council-badge crpv-council-priority-${rec.priority} cap`}>{rec.priority}</span>
                    <span className={`crpv-council-badge crpv-council-status-${rec.status} cap`}>{rec.status}</span>
                  </div>
                </div>
                <p className="crpv-council-rec-meta cap">{rec.category} · {rec.confidence}% confidence</p>
                <p className="crpv-council-rec-body">{rec.recommendation}</p>
                {rec.rationale && (
                  <div className="crpv-council-rationale">
                    <p className="crpv-ws-label">Why this matters</p>
                    <p className="crpv-council-rationale-body">{rec.rationale}</p>
                  </div>
                )}
                <div className="crpv-council-rec-footer">
                  <span className="crpv-council-rec-date cap">{councilFmtDate(rec.created_at)}</span>
                  <div className="crpv-council-rec-actions">
                    <button
                      type="button"
                      className={`crpv-council-action-accept${rec.status === "accepted" ? " active" : ""}`}
                      onClick={() => decide(rec.id, "accepted")}
                      disabled={!!decisionId || rec.status === "accepted"}
                    >
                      {decisionId === `${rec.id}:accepted` ? "Saving…" : "Accept"}
                    </button>
                    <button
                      type="button"
                      className={`crpv-council-action-ignore${rec.status === "ignored" ? " active" : ""}`}
                      onClick={() => decide(rec.id, "ignored")}
                      disabled={!!decisionId || rec.status === "ignored"}
                    >
                      {decisionId === `${rec.id}:ignored` ? "Saving…" : "Ignore"}
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Field-aligned compare components ────────────────────────────────────────

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
  return (
    <div className="crpv-ws-cmp-field">
      <div className="crpv-ws-cmp-row-label cap">
        {label}
        {alignment && <GapBadge alignment={alignment} />}
      </div>
      <div className="crpv-ws-cmp-cells">
        <div className="crpv-ws-cmp-cell">{outsideCell}</div>
        <div className="crpv-ws-cmp-cell">{orgCell}</div>
      </div>
    </div>
  );
}

function CmpOutsideValue({ note, value }: { note: string; value: string | null | undefined }) {
  return (
    <>
      <p className="crpv-ws-cmp-cell-note">{note}</p>
      {value
        ? <div className="crpv-ws-readonly">{value}</div>
        : <div className="crpv-ws-cmp-none">No outside data found</div>}
    </>
  );
}

function StrategyCompare({
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
        label="Direction"
        alignment={baseline ? alignmentOf(strategy?.winning_aspiration, baseline.top_hypotheses?.[0]) : undefined}
        outsideCell={<CmpOutsideValue note="Top market assumption" value={baseline?.top_hypotheses?.[0]} />}
        orgCell={
          <FieldBlock
            label="Where you're headed"
            value={strategy?.winning_aspiration}
            onSave={async (v) => { await updateNarrativeField("winning_aspiration", v); flash("aspiration"); }}
            hint="What does winning look like in the market you're in right now?"
            rows={4}
            isSaved={savedField === "aspiration"}
          />
        }
      />
      <CompareFieldRow
        label="Market"
        alignment={baseline ? alignmentOf(strategy?.where_to_play, baseline.category_archetype) : undefined}
        outsideCell={<CmpOutsideValue note="Market space (inferred)" value={baseline?.category_archetype} />}
        orgCell={
          <FieldBlock
            label="Where you'll compete"
            value={strategy?.where_to_play}
            onSave={async (v) => { await updateNarrativeField("where_to_play", v); flash("where"); }}
            hint="Which customers, geographies, and channels are you going after?"
            rows={3}
            isSaved={savedField === "where"}
          />
        }
      />
      <CompareFieldRow
        label="Edge"
        alignment={baseline ? alignmentOf(strategy?.how_to_win, baseline.lens_card?.economic_engine) : undefined}
        outsideCell={<CmpOutsideValue note="How they make money (inferred)" value={baseline?.lens_card?.economic_engine} />}
        orgCell={
          <FieldBlock
            label="How you'll win"
            value={strategy?.how_to_win}
            onSave={async (v) => { await updateNarrativeField("how_to_win", v); flash("how"); }}
            hint="What specifically gives you an edge in the spaces you're competing in?"
            rows={3}
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

function PositioningCompare({
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
        label="Value delivered"
        alignment={baseline ? alignmentOf(canvas?.value_for_customer, baseline.message_alignment?.outside_voice_posture) : undefined}
        outsideCell={<CmpOutsideValue note="What the market sees" value={baseline?.message_alignment?.outside_voice_posture} />}
        orgCell={
          <FieldBlock
            label="The real value you deliver"
            value={canvas?.value_for_customer}
            onSave={async (v) => { await updateTextField("value_for_customer", v); flash("value"); }}
            hint="What changes for the customer? Not what your product does — what they actually gain."
            rows={3}
            isSaved={savedField === "value"}
          />
        }
      />
      <CompareFieldRow
        label="Market category"
        alignment={baseline ? alignmentOf(canvas?.market_category, baseline.category_archetype) : undefined}
        outsideCell={<CmpOutsideValue note="Market space (inferred)" value={baseline?.category_archetype} />}
        orgCell={
          <FieldBlock
            label="The category you're in"
            value={canvas?.market_category}
            onSave={async (v) => { await updateTextField("market_category", v); flash("category"); }}
            rows={2}
            isSaved={savedField === "category"}
          />
        }
      />
      <CompareFieldRow
        label="Who it's for"
        alignment={baseline ? alignmentOf(canvas?.best_fit_customers, baseline.lens_card?.primary_buyer) : undefined}
        outsideCell={<CmpOutsideValue note="Primary buyer (inferred)" value={baseline?.lens_card?.primary_buyer} />}
        orgCell={
          <FieldBlock
            label="Who this is built for"
            value={canvas?.best_fit_customers}
            onSave={async (v) => { await updateTextField("best_fit_customers", v); flash("customers"); }}
            hint="Be specific. Who gets the most out of what you do?"
            rows={2}
            isSaved={savedField === "customers"}
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
        <div className="crpv-ws-cmp-support-col">
          <FieldBlock
            label="Why you belong there"
            value={canvas?.category_rationale}
            onSave={async (v) => { await updateTextField("category_rationale", v); flash("rationale"); }}
            hint="What earns your place in this category?"
            rows={2}
            isSaved={savedField === "rationale"}
          />
          <ListEditor
            label="Who else they could choose"
            items={canvas?.competitive_alternatives ?? []}
            onSave={async (items) => { await updateItemsField("competitive_alternatives_json", items); flash("competitors"); }}
            addPlaceholder="Add a competitor or alternative…"
            isSaved={savedField === "competitors"}
          />
          <ListEditor
            label="What makes you different"
            items={canvas?.unique_attributes ?? []}
            onSave={async (items) => { await updateItemsField("unique_attributes_json", items); flash("attributes"); }}
            addPlaceholder="Add a differentiator…"
            isSaved={savedField === "attributes"}
          />
          <FieldBlock
            label="Current tagline"
            value={canvas?.current_tagline}
            onSave={async (v) => { await updateTextField("current_tagline", v); flash("tagline_current"); }}
            rows={1}
            singleLine
            isSaved={savedField === "tagline_current"}
          />
          <FieldBlock
            label="Proposed tagline"
            value={canvas?.proposed_tagline}
            onSave={async (v) => { await updateTextField("proposed_tagline", v); flash("tagline_proposed"); }}
            rows={1}
            singleLine
            isSaved={savedField === "tagline_proposed"}
          />
        </div>
      </div>
    </>
  );
}

function JTBDCompare({
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
        outsideCell={<CmpOutsideValue note="Primary buyer (inferred)" value={baseline?.lens_card?.primary_buyer} />}
        orgCell={
          <FieldBlock
            label="Who does this job"
            value={marketDef?.job_executor}
            onSave={(v) => saveTextField("job_executor", v)}
            hint="The person actually doing the job — not the buyer, not the org."
            rows={2}
            isSaved={savedField === "job_executor"}
          />
        }
      />
      <CompareFieldRow
        label="Who makes the call"
        alignment={baseline ? alignmentOf(marketDef?.chooser, baseline.lens_card?.chooser) : undefined}
        outsideCell={<CmpOutsideValue note="Decision maker (inferred)" value={baseline?.lens_card?.chooser} />}
        orgCell={
          <FieldBlock
            label="Who makes the call"
            value={marketDef?.chooser}
            onSave={(v) => saveTextField("chooser", v)}
            hint="The person who decides which solution to use."
            rows={2}
            isSaved={savedField === "chooser"}
          />
        }
      />
      <CompareFieldRow
        label="The job"
        alignment={baseline ? alignmentOf(marketDef?.jtbd, baseline.top_hypotheses?.[0]) : undefined}
        outsideCell={<CmpOutsideValue note="Top inferred hypothesis" value={baseline?.top_hypotheses?.[0]} />}
        orgCell={
          <FieldBlock
            label="The job they're trying to do"
            value={marketDef?.jtbd}
            onSave={(v) => saveTextField("jtbd", v)}
            hint="From their perspective. What are they trying to accomplish?"
            rows={5}
            isSaved={savedField === "jtbd"}
          />
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
        <div className="crpv-ws-cmp-support-col">
          {marketDef && (
            <div className="crpv-ws-field">
              <div className="crpv-ws-field-hd">
                <label className="crpv-ws-label">How you'll approach it</label>
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
          )}
        </div>
      </div>
    </>
  );
}

// ─── Company switcher ─────────────────────────────────────────────────────────

function CompanySwitcher({
  activeCompany,
  companies,
  loading,
  onSelect,
  suffix,
}: {
  activeCompany: Company | null | undefined;
  companies: Company[];
  loading: boolean;
  onSelect: (id: string) => void;
  suffix?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) { setQuery(""); return; }
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const filtered = query.trim()
    ? companies.filter((c) => c.name.toLowerCase().includes(query.toLowerCase()))
    : companies;

  const label = activeCompany ? activeCompany.name.toUpperCase() : "SELECT COMPANY";

  return (
    <div className="crpv-co-switcher" ref={containerRef}>
      <button
        type="button"
        className="crpv-co-trigger cap"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        [{label}]{suffix ? ` ${suffix}` : ""}
        <span className="crpv-co-caret">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="crpv-co-dropdown" role="listbox">
          {companies.length > 6 && (
            <div className="crpv-co-search-wrap">
              <input
                ref={inputRef}
                className="crpv-co-search"
                type="text"
                placeholder="Filter companies…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          )}
          {loading ? (
            <div className="crpv-co-empty cap">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="crpv-co-empty cap">No match</div>
          ) : (
            <ul className="crpv-co-list">
              {filtered.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    className={`crpv-co-option${c.id === activeCompany?.id ? " active" : ""}`}
                    role="option"
                    aria-selected={c.id === activeCompany?.id}
                    onClick={() => { onSelect(c.id); setOpen(false); }}
                  >
                    <span className="crpv-co-option-name">{c.name}</span>
                    {(c.quarter || c.archetype) && (
                      <span className="crpv-co-option-meta cap">
                        {[c.quarter, c.archetype].filter(Boolean).join(" · ")}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main view ────────────────────────────────────────────────────────────────

export default function ClientRefinePreviewWorkshopView() {
  const navigate = useNavigate();
  const { companies, setActiveCompanyId, loading: companiesLoading } = useCompany();
  const { activeCompany, hasCompany } = useClientViewData({ actionLimit: 0 });
  const [activeTab,   setActiveTab]   = useState<WorkshopTab>("positioning");
  const [activeStage, setActiveStage] = useState<SignalStage>("outside");
  const [showCompare, setShowCompare] = useState(false);

  const companyId = activeCompany?.id;

  const { preferredRun: baselineRun, loading: baselineLoading } = usePublicBaseline(companyId);
  const baseline = baselineOf(baselineRun);

  const {
    loading: posLoading,
    item: positioning,
    updateTextField: updatePosTextField,
    updateItemsField: updatePosItemsField,
  } = usePositioningCanvas(companyId);

  const {
    loading: stratLoading,
    item: strategy,
    updateNarrativeField,
    updateListField,
  } = useStrategyCascade(companyId);

  const {
    loading: odiLoading,
    marketDefinition,
    needs,
    updateNeedScores,
    updateMarketDefinition,
  } = useOdiNeeds(companyId);

  const goToMainSite   = useCallback(() => navigate("/"), [navigate]);
  const goToRefineHome = useCallback(() => navigate(CLIENT_REFINE_PREVIEW_ROUTE), [navigate]);

  // Compare mode only makes sense on the org stage
  const compareActive = showCompare && activeStage === "org";

  if (!hasCompany) {
    return (
      <section className="crpv-page crpv-workshop-page">
        <article className="crpv-empty-state">
          <p className="cap">Client Refine Preview · Workshop</p>
          <h1>Select a company to edit strategy.</h1>
          {companiesLoading ? (
            <p className="crpv-muted">Loading companies…</p>
          ) : companies.length > 0 ? (
            <div className="crpv-company-grid">
              {companies.map((company) => (
                <button
                  key={company.id}
                  type="button"
                  className="crpv-company-button"
                  onClick={() => setActiveCompanyId(company.id)}
                >
                  <span>{company.name}</span>
                  <small>{company.quarter || "Quarter"} · {company.archetype || "Archetype"}</small>
                </button>
              ))}
            </div>
          ) : (
            <p className="crpv-muted">No companies available.</p>
          )}
        </article>
      </section>
    );
  }

  const TABS: { key: WorkshopTab; label: string }[] = [
    { key: "positioning", label: "Positioning" },
    { key: "strategy",    label: "Strategy" },
    { key: "jtbd",        label: "JTBD" },
    { key: "needs",       label: "Needs" },
    { key: "council",     label: "Council" },
  ];

  function renderOutsideTab() {
    if (baselineLoading) return <div className="crpv-ws-placeholder cap">Loading outside signals…</div>;
    if (activeTab === "positioning") return <PositioningOutside baseline={baseline} companyId={companyId} />;
    if (activeTab === "strategy")   return <StrategyOutside baseline={baseline} companyId={companyId} />;
    if (activeTab === "jtbd")       return <JTBDOutside baseline={baseline} companyId={companyId} />;
    return <NeedsOutside baseline={baseline} companyId={companyId} />;
  }

  function renderOrgTab() {
    if (!companyId) return null;
    if (activeTab === "positioning") return (
      <PositioningOrgPanel
        canvas={positioning}
        loading={posLoading}
        baseline={baseline}
        updateTextField={updatePosTextField}
        updateItemsField={updatePosItemsField}
      />
    );
    if (activeTab === "strategy") return (
      <StrategyOrgPanel
        strategy={strategy}
        loading={stratLoading}
        baseline={baseline}
        updateNarrativeField={updateNarrativeField}
        updateListField={updateListField}
      />
    );
    if (activeTab === "jtbd") return (
      <JTBDOrgPanel
        marketDef={marketDefinition}
        loading={odiLoading}
        companyId={companyId}
        baseline={baseline}
        updateMarketDefinition={updateMarketDefinition}
      />
    );
    return (
      <NeedsOrgPanel
        needs={needs}
        loading={odiLoading}
        updateNeedScores={updateNeedScores}
      />
    );
  }

  function renderCompareTab() {
    if (!companyId) return null;
    if (activeTab === "strategy") return (
      <StrategyCompare
        baseline={baseline}
        strategy={strategy}
        loading={stratLoading}
        updateNarrativeField={updateNarrativeField}
        updateListField={updateListField}
      />
    );
    if (activeTab === "positioning") return (
      <PositioningCompare
        baseline={baseline}
        canvas={positioning}
        loading={posLoading}
        updateTextField={updatePosTextField}
        updateItemsField={updatePosItemsField}
      />
    );
    if (activeTab === "jtbd") return (
      <JTBDCompare
        baseline={baseline}
        marketDef={marketDefinition}
        loading={odiLoading}
        companyId={companyId}
        updateMarketDefinition={updateMarketDefinition}
      />
    );
    // Needs — side by side without field rows (evidence vs ODI needs don't map 1:1)
    return (
      <div className="crpv-ws-cmp-support">
        <div className="crpv-ws-cmp-support-col">
          <NeedsOutside baseline={baseline} />
        </div>
        <div className="crpv-ws-cmp-support-col">
          <NeedsOrgPanel needs={needs} loading={odiLoading} updateNeedScores={updateNeedScores} />
        </div>
      </div>
    );
  }

  return (
    <section className="crpv-page crpv-workshop-page">
      <header className="crpv-header">
        <div className="left">
          <b>Mojo</b>
          <CompanySwitcher
            activeCompany={activeCompany}
            companies={companies}
            loading={companiesLoading}
            onSelect={(id) => { setActiveCompanyId(id); setShowCompare(false); }}
            suffix={`· WORKSHOP · ${activeStage.toUpperCase()}`}
          />
        </div>
        <div className="crpv-header-tools">
          <button type="button" className="btn ghost" onClick={goToRefineHome}>← Refine Home</button>
          <button type="button" className="btn ghost crpv-main-site-btn" onClick={goToMainSite}>← Main site</button>
        </div>
      </header>

      <SignalBar
        activeStage={activeStage}
        setActiveStage={(s) => { setActiveStage(s); setShowCompare(false); }}
        baseline={baseline}
        positioning={positioning}
        strategy={strategy}
      />

      <nav className="crpv-ws-tabs">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={`crpv-ws-tab${activeTab === tab.key ? " active" : ""}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
        {activeStage === "org" && activeTab !== "council" && (
          <button
            type="button"
            className={`crpv-ws-tab crpv-ws-compare-toggle${showCompare ? " active" : ""}`}
            onClick={() => setShowCompare((v) => !v)}
            title="Compare with outside signals"
          >
            {showCompare ? "Hide compare" : "Compare ⇄"}
          </button>
        )}
      </nav>

      {activeTab === "council" ? (
        <div className="crpv-ws-content">
          {companyId ? (
            <WorkshopCouncilTab companyId={companyId} companyName={activeCompany?.name ?? ""} />
          ) : (
            <div className="crpv-ws-placeholder">Select a company to run the council.</div>
          )}
        </div>
      ) : activeStage === "customer" ? (
        <div className="crpv-ws-content">
          <CustomerPlaceholder />
        </div>
      ) : compareActive ? (
        <div className="crpv-ws-cmp">
          <div className="crpv-ws-cmp-col-headers">
            <div className="crpv-ws-cmp-col-hd cap">Outside Signals</div>
            <div className="crpv-ws-cmp-col-hd cap">Organization Signals</div>
          </div>
          <div className="crpv-ws-cmp-scroll">
            {renderCompareTab()}
          </div>
        </div>
      ) : (
        <div className="crpv-ws-content">
          {activeStage === "outside" ? renderOutsideTab() : renderOrgTab()}
        </div>
      )}
    </section>
  );
}
