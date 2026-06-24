import { useEffect, useRef, useState } from "react";

type Props = {
  value: string;
  onSave: (next: string) => Promise<void> | void;
  placeholder?: string;
  rows?: number;
  style?: React.CSSProperties;
  textareaStyle?: React.CSSProperties;
  disabled?: boolean;
};

export default function InlineTextareaEdit({ value, onSave, placeholder, rows = 4, style, textareaStyle, disabled }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const [hover, setHover] = useState(false);
  // Optimistic display: after a successful save, keep showing the submitted value
  // until the parent re-flows the persisted value into `value`. Cleared whenever
  // `value` changes, so the authoritative refetched value always wins on arrival.
  const [optimistic, setOptimistic] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { setDraft(value); setOptimistic(null); }, [value]);

  const displayed = optimistic ?? value;

  useEffect(() => {
    if (editing && textareaRef.current) {
      const el = textareaRef.current;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }
  }, [editing]);

  async function commit() {
    const trimmed = draft.trim();
    if (trimmed === value) { setEditing(false); return; }
    setSaving(true);
    try { await onSave(trimmed); setOptimistic(trimmed); } finally { setSaving(false); setEditing(false); }
  }

  function cancel() {
    setDraft(value);
    setEditing(false);
  }

  if (editing) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 6, ...style }}>
        <textarea
          ref={textareaRef}
          value={draft}
          rows={rows}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); commit(); }
            if (e.key === "Escape") { e.preventDefault(); cancel(); }
          }}
          disabled={saving}
          placeholder={placeholder}
          style={{
            fontFamily: "inherit", fontSize: "inherit", fontWeight: "inherit",
            color: "inherit", lineHeight: "inherit", letterSpacing: "inherit",
            background: "rgba(17,17,17,0.04)", border: "1px solid rgba(17,17,17,0.18)",
            borderRadius: 4, padding: "6px 8px", width: "100%", outline: "none",
            resize: "vertical", boxSizing: "border-box",
            ...textareaStyle,
          }}
        />
        <span style={{ fontSize: 10, color: "rgba(17,17,17,0.4)", fontFamily: '"IBM Plex Mono", monospace' }}>
          Enter to save · Shift+Enter for newline · Esc to cancel
        </span>
      </div>
    );
  }

  return (
    <div
      style={{ position: "relative", ...style }}
      onMouseEnter={() => !disabled && setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <p style={{ margin: 0, whiteSpace: "pre-wrap", cursor: disabled ? "default" : "text" }}>
        {displayed || <span style={{ color: "rgba(17,17,17,0.35)", fontStyle: "italic" }}>{placeholder ?? "(empty)"}</span>}
      </p>
      {!disabled && (
        <button
          type="button"
          onClick={() => { setDraft(displayed); setEditing(true); }}
          aria-label="Edit"
          style={{
            position: "absolute", top: 0, right: 0,
            background: "none", border: "none", padding: "0 2px", cursor: "pointer",
            color: hover ? "rgba(17,17,17,0.55)" : "transparent",
            fontSize: "0.8em", lineHeight: 1,
            transition: "color 0.12s",
          }}
        >
          ✎
        </button>
      )}
    </div>
  );
}
