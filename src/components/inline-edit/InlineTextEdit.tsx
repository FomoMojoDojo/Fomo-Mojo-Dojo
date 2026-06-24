import { useEffect, useRef, useState } from "react";

type Props = {
  value: string;
  onSave: (next: string) => Promise<void> | void;
  placeholder?: string;
  style?: React.CSSProperties;
  inputStyle?: React.CSSProperties;
  disabled?: boolean;
};

export default function InlineTextEdit({ value, onSave, placeholder, style, inputStyle, disabled }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const [hover, setHover] = useState(false);
  // Optimistic display: after a successful save, keep showing the submitted value
  // until the parent re-flows the persisted value into `value`. Cleared whenever
  // `value` changes, so the authoritative refetched value always wins on arrival.
  const [optimistic, setOptimistic] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setDraft(value); setOptimistic(null); }, [value]);

  const displayed = optimistic ?? value;

  useEffect(() => {
    if (editing) inputRef.current?.focus();
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
      <input
        ref={inputRef}
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); commit(); }
          if (e.key === "Escape") { e.preventDefault(); cancel(); }
        }}
        disabled={saving}
        placeholder={placeholder}
        style={{
          fontFamily: "inherit", fontSize: "inherit", fontWeight: "inherit",
          color: "inherit", lineHeight: "inherit", letterSpacing: "inherit",
          background: "rgba(17,17,17,0.04)", border: "1px solid rgba(17,17,17,0.18)",
          borderRadius: 4, padding: "2px 6px", width: "100%", outline: "none",
          boxSizing: "border-box",
          ...inputStyle,
        }}
      />
    );
  }

  return (
    <span
      style={{ display: "inline-flex", alignItems: "baseline", gap: 6, cursor: disabled ? "default" : "text", ...style }}
      onMouseEnter={() => !disabled && setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <span style={{ flex: 1 }}>{displayed || <span style={{ color: "rgba(17,17,17,0.35)", fontStyle: "italic" }}>{placeholder ?? "(empty)"}</span>}</span>
      {!disabled && (
        <button
          type="button"
          onClick={() => { setDraft(displayed); setEditing(true); }}
          aria-label="Edit"
          style={{
            background: "none", border: "none", padding: "0 2px", cursor: "pointer",
            color: hover ? "rgba(17,17,17,0.55)" : "transparent",
            fontSize: "0.75em", lineHeight: 1, flexShrink: 0,
            transition: "color 0.12s",
          }}
        >
          ✎
        </button>
      )}
    </span>
  );
}
