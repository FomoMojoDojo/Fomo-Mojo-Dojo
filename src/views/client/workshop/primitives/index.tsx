import { useState, useEffect, useLayoutEffect, useRef, useCallback, Fragment } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import type { GapAlignment } from "../types";
import { relativeTime } from "../helpers";
import type { PositioningItem } from "@/lib/types";

// ─── FieldWarningDot ─────────────────────────────────────────────────────────

function FieldWarningDot({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      aria-label="See insight"
      style={{
        display: "inline-block",
        width: 7,
        height: 7,
        borderRadius: "50%",
        background: "#F59E0B",
        cursor: "pointer",
        flexShrink: 0,
        border: "none",
        padding: 0,
        marginLeft: 5,
        verticalAlign: "middle",
      }}
    />
  );
}

// ─── FieldAnnotation ─────────────────────────────────────────────────────────

function FieldAnnotation({
  open,
  whyMatters,
  whatToChange,
}: {
  open: boolean;
  whyMatters: string;
  whatToChange: string;
}) {
  if (!open) return null;
  return (
    <div style={{ maxWidth: 420, marginTop: 10 }}>
      <p style={{
        fontFamily: "monospace",
        fontSize: 9,
        textTransform: "uppercase",
        letterSpacing: "0.14em",
        color: "#9E9086",
        margin: "0 0 3px",
      }}>
        Why this matters
      </p>
      <p style={{ fontSize: 12, color: "#6B5545", lineHeight: 1.7, margin: "0 0 12px" }}>
        {whyMatters}
      </p>
      <p style={{
        fontFamily: "monospace",
        fontSize: 9,
        textTransform: "uppercase",
        letterSpacing: "0.14em",
        color: "#9E9086",
        margin: "0 0 3px",
      }}>
        What to change
      </p>
      <p style={{ fontSize: 12, color: "#6B5545", lineHeight: 1.7, margin: 0 }}>
        {whatToChange}
      </p>
    </div>
  );
}

// ─── HighlightedText ─────────────────────────────────────────────────────────
// Splits text into runs; flagged runs get the amber wavy underline.
// Clicking a flagged run calls onPhraseClick and stops propagation so the
// surrounding display div's onClick (which enters edit mode) does not fire.

function HighlightedText({
  text,
  phrases,
  tooltip,
  onPhraseClick,
}: {
  text: string;
  phrases: string[];
  tooltip?: string;
  onPhraseClick: (e: React.MouseEvent) => void;
}) {
  if (!phrases.length || !text.trim()) return <>{text}</>;

  const sorted = [...phrases].sort((a, b) => b.length - a.length);
  const escaped = sorted.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = new RegExp(`(${escaped.join("|")})`, "gi");

  const parts: { text: string; highlighted: boolean }[] = [];
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index! > last) parts.push({ text: text.slice(last, match.index), highlighted: false });
    parts.push({ text: match[0], highlighted: true });
    last = match.index! + match[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last), highlighted: false });

  return (
    <>
      {parts.map((part, i) =>
        part.highlighted ? (
          <span
            key={i}
            className="crpv-ws-flagged-phrase"
            data-tip={tooltip}
            onClick={(e) => { e.stopPropagation(); onPhraseClick(e); }}
          >
            {part.text}
          </span>
        ) : (
          <span key={i}>{part.text}</span>
        )
      )}
    </>
  );
}

// ─── Gap badge ────────────────────────────────────────────────────────────────

const GAP_LABEL: Record<GapAlignment, string> = {
  aligned: "Aligned with outside signals",
  drift:   "Slight drift from outside signals",
  gap:     "Gap vs. outside signals",
  missing: "Not found in outside signals",
};

export function GapBadge({ alignment, baselineValue }: { alignment: GapAlignment; baselineValue?: string }) {
  const label = GAP_LABEL[alignment];
  const excerpt = alignment !== "missing" && baselineValue
    ? ` — Outside: "${baselineValue.slice(0, 80)}${baselineValue.length > 80 ? "…" : ""}"`
    : "";
  const preview = `${label}${excerpt}`;
  return (
    <span
      className={`crpv-ws-gap-badge crpv-ws-gap-${alignment}`}
      title={preview}
      aria-label={`Signal alignment: ${alignment}`}
    />
  );
}

// ─── FieldBlock ───────────────────────────────────────────────────────────────

export function FieldBlock({
  label,
  value,
  onSave,
  hint,
  rows = 3,
  isSaved,
  singleLine = false,
  gap,
  hideLabel = false,
  autoGrow = false,
}: {
  label: string;
  value: string;
  onSave: (v: string) => Promise<void>;
  hint?: string;
  rows?: number;
  isSaved?: boolean;
  singleLine?: boolean;
  gap?: { alignment: GapAlignment; baselineValue?: string };
  hideLabel?: boolean;
  autoGrow?: boolean;
}) {
  const [local, setLocal] = useState(value);
  const [saving, setSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { setLocal(value); }, [value]);

  useEffect(() => {
    if (!autoGrow || singleLine || !textareaRef.current) return;
    const el = textareaRef.current;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [local, autoGrow, singleLine]);

  const handleBlur = useCallback(async () => {
    if (local === value) return;
    setSaving(true);
    try { await onSave(local); } catch { /* revert on next load */ }
    finally { setSaving(false); }
  }, [local, value, onSave]);

  return (
    <div className={`crpv-ws-field${autoGrow ? " crpv-ws-field-grow" : ""}`}>
      <div className="crpv-ws-field-hd">
        {!hideLabel && (
          <label className="crpv-ws-label">
            {label}
            {gap && <GapBadge alignment={gap.alignment} baselineValue={gap.baselineValue} />}
          </label>
        )}
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
          ref={textareaRef}
          className="crpv-ws-textarea"
          rows={autoGrow ? 1 : rows}
          value={local}
          onChange={(e) => setLocal(e.target.value)}
          onBlur={handleBlur}
          style={autoGrow ? { resize: "none", overflow: "hidden", flexShrink: 0 } : undefined}
        />
      )}
    </div>
  );
}

// ─── StatementField ───────────────────────────────────────────────────────────
// Display mode: rich div with HighlightedText. Clicking it enters edit mode.
// Edit mode: textarea (auto-grows). Blur saves and returns to display mode.
// Clicking a highlighted phrase toggles the FieldAnnotation; does NOT enter edit mode.

export function StatementField({
  label,
  value,
  onSave,
  hint,
  isSaved,
  singleLine = false,
  gap,
  warning,
  flaggedPhrases,
  highlightTooltip,
}: {
  label: string;
  value: string;
  onSave: (v: string) => Promise<void>;
  hint?: string;
  rows?: number;
  isSaved?: boolean;
  singleLine?: boolean;
  gap?: { alignment: GapAlignment; baselineValue?: string };
  warning?: { explanation: string; suggestion: string };
  flaggedPhrases?: string[];
  highlightTooltip?: string;
}) {
  const [local, setLocal] = useState(value);
  const [saving, setSaving] = useState(false);
  const [insightOpen, setInsightOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setLocal(value); }, [value]);

  // Auto-grow textarea (only while it is mounted in edit mode)
  useLayoutEffect(() => {
    if (!isEditing || singleLine || !textareaRef.current) return;
    const el = textareaRef.current;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [local, singleLine, isEditing]);

  // Focus the right element when entering edit mode
  useLayoutEffect(() => {
    if (!isEditing) return;
    if (singleLine) inputRef.current?.focus();
    else textareaRef.current?.focus();
  }, [isEditing, singleLine]);

  const handleBlur = useCallback(async () => {
    setIsEditing(false);
    if (local === value) return;
    setSaving(true);
    try { await onSave(local); } catch { /* revert on next load */ }
    finally { setSaving(false); }
  }, [local, value, onSave]);

  const handleKeyDown = useCallback((e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      textareaRef.current?.blur();
    }
  }, []);

  const handleInputKeyDown = useCallback((e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      inputRef.current?.blur();
    }
  }, []);

  const toggleInsight = useCallback(() => setInsightOpen((v) => !v), []);

  // Display mode: rich text with inline highlights. Only for multi-line fields.
  const showDisplay = !singleLine && !isEditing;
  const hasHighlights = !!(flaggedPhrases && flaggedPhrases.length > 0 && local.trim());

  return (
    <div className="crpv-ws-stmt">
      <div className="crpv-ws-stmt-hd">
        <span className="crpv-ws-label">
          {label}
          {warning && <FieldWarningDot onClick={toggleInsight} />}
        </span>
        <span className="crpv-ws-stmt-spacer" />
        {gap && <GapBadge alignment={gap.alignment} baselineValue={gap.baselineValue} />}
        {saving && <span className="crpv-ws-saving cap">Saving…</span>}
        {!saving && isSaved && <span className="crpv-ws-saved cap">Saved ✓</span>}
      </div>
      <div className="crpv-ws-stmt-rule" />

      {singleLine && isEditing ? (
        <input
          ref={inputRef}
          type="text"
          className={`crpv-ws-stmt-body${!local.trim() ? " crpv-ws-stmt-empty" : ""}`}
          value={local}
          placeholder={label}
          onChange={(e) => setLocal(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleInputKeyDown}
        />
      ) : singleLine ? (
        // Display mode for singleLine — div wraps full text, no clipping
        <div
          className={`crpv-ws-stmt-body${!local.trim() ? " crpv-ws-stmt-empty" : ""}`}
          onClick={() => setIsEditing(true)}
          style={{ cursor: "text" }}
        >
          {local.trim() ? local : label}
        </div>
      ) : showDisplay ? (
        // Display mode — renders highlighted text; clicking non-phrase area enters edit mode
        <div
          className={`crpv-ws-stmt-body${!local.trim() ? " crpv-ws-stmt-empty" : ""}`}
          onClick={() => setIsEditing(true)}
          style={{ cursor: "text" }}
        >
          {local.trim()
            ? hasHighlights
              ? <HighlightedText text={local} phrases={flaggedPhrases!} tooltip={highlightTooltip} onPhraseClick={toggleInsight} />
              : local
            : label}
        </div>
      ) : (
        // Edit mode — plain textarea
        <textarea
          ref={textareaRef}
          className={`crpv-ws-stmt-body${!local.trim() ? " crpv-ws-stmt-empty" : ""}`}
          value={local}
          placeholder={label}
          onChange={(e) => setLocal(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          style={{ resize: "none", overflow: "hidden" }}
        />
      )}

      {warning && (
        <FieldAnnotation
          open={insightOpen}
          whyMatters={warning.explanation}
          whatToChange={warning.suggestion}
        />
      )}
      <div className="crpv-ws-stmt-ft">
        {hint && <span className="crpv-ws-stmt-hint">{hint}</span>}
        <button
          type="button"
          className="crpv-ws-stmt-edit-btn cap"
          tabIndex={-1}
          onClick={() => setIsEditing(true)}
        >
          Edit ⌃
        </button>
      </div>
    </div>
  );
}

// ─── ListEditor ───────────────────────────────────────────────────────────────
// Each row shows HighlightedText in display mode; clicking it switches to an
// auto-focused input for that row. Blur saves and returns to display mode.

export function ListEditor({
  label,
  items,
  onSave,
  addPlaceholder = "Add…",
  isSaved,
  listWarning,
  warningIndices,
  warningWords,
  warningTooltip,
}: {
  label: string;
  items: PositioningItem[];
  onSave: (items: PositioningItem[]) => Promise<void>;
  addPlaceholder?: string;
  isSaved?: boolean;
  listWarning?: { explanation: string; suggestion: string };
  warningIndices?: Set<number>;
  warningWords?: Map<number, string[]>;
  warningTooltip?: string;
}) {
  const [draft, setDraft] = useState<PositioningItem[]>(items);
  const [adding, setAdding] = useState("");
  const [saving, setSaving] = useState(false);
  const [insightOpen, setInsightOpen] = useState(false);
  const [focusedIdx, setFocusedIdx] = useState<number | null>(null);

  useEffect(() => { setDraft(items); }, [items]);

  const save = useCallback(async (updated: PositioningItem[]) => {
    setSaving(true);
    try { await onSave(updated); } catch { /* silent */ }
    finally { setSaving(false); }
  }, [onSave]);

  const handleItemBlur = useCallback(async (idx: number, name: string) => {
    setFocusedIdx(null);
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

  const hasAnyWarning = listWarning && warningIndices && warningIndices.size > 0;
  const toggleInsight = useCallback(() => setInsightOpen((v) => !v), []);

  return (
    <div className="crpv-ws-field">
      <div className="crpv-ws-field-hd">
        <label className="crpv-ws-label">
          {label}
          {hasAnyWarning && <FieldWarningDot onClick={toggleInsight} />}
        </label>
        {saving && <span className="crpv-ws-saving cap">Saving…</span>}
        {!saving && isSaved && <span className="crpv-ws-saved cap">Saved ✓</span>}
      </div>
      <div className="crpv-ws-list">
        {draft.map((item, idx) => {
          const rowWords = warningWords?.get(idx) ?? [];
          const isRowEditing = focusedIdx === idx;
          const isWarned = !!(warningIndices?.has(idx) && listWarning);

          return (
            <Fragment key={item.id}>
              <div className="crpv-ws-list-row">
                {isRowEditing ? (
                  // Edit mode: plain input with autofocus
                  <input
                    autoFocus
                    className="crpv-ws-list-input"
                    defaultValue={item.name}
                    onBlur={(e) => handleItemBlur(idx, e.target.value)}
                  />
                ) : (
                  // Display mode: highlighted text, click to edit
                  <div
                    className="crpv-ws-list-input"
                    onClick={() => setFocusedIdx(idx)}
                    style={{ cursor: "text" }}
                  >
                    {rowWords.length > 0
                      ? <HighlightedText
                          text={item.name}
                          phrases={rowWords}
                          tooltip={warningTooltip}
                          onPhraseClick={toggleInsight}
                        />
                      : item.name}
                  </div>
                )}
                {isWarned && <FieldWarningDot onClick={toggleInsight} />}
                <button type="button" className="crpv-ws-remove-btn" onClick={() => removeItem(idx)} aria-label="Remove">✕</button>
              </div>
            </Fragment>
          );
        })}
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
      {listWarning && (
        <FieldAnnotation
          open={insightOpen}
          whyMatters={listWarning.explanation}
          whatToChange={listWarning.suggestion}
        />
      )}
    </div>
  );
}

// ─── SectionHeader ────────────────────────────────────────────────────────────

export function SectionHeader({ title, desc, updatedAt }: { title: string; desc: string; updatedAt?: string }) {
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

export { KanbanBoard } from "./KanbanBoard";
export { ReviewControl, ReadonlyList, OutsideSignalItems, AnnotatableQuestionList, ReviewableBlock, BaselineWarningBanner } from "./shared";
export { EvidenceImpactBanner, ARTIFACT_TO_TAB } from "./EvidenceImpactBanner";
