import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { OdiNeedRow } from "@/hooks/useOdiNeeds";
import { SectionHeader } from "../primitives";

// ── Types ─────────────────────────────────────────────────────────────────────

const SOURCE_TYPES = [
  { value: "reddit", label: "Reddit"  },
  { value: "forum",  label: "Forum"   },
  { value: "review", label: "Review"  },
  { value: "other",  label: "Other"   },
] as const;

type SocialSourceType = typeof SOURCE_TYPES[number]["value"];

interface SocialExtraction {
  customer_problems:  string[];
  repeated_themes:    string[];
  emotional_language: string[];
  possible_needs:     string[];
  suggested_job_step: string | null;
  confidence:         "early" | "inferred";
  validated:          false;
}

function parseExtraction(raw: unknown): SocialExtraction | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const arr = (k: string): string[] =>
    Array.isArray(r[k]) ? (r[k] as unknown[]).map(String).filter(Boolean) : [];
  return {
    customer_problems:  arr("customer_problems"),
    repeated_themes:    arr("repeated_themes"),
    emotional_language: arr("emotional_language"),
    possible_needs:     arr("possible_needs"),
    suggested_job_step: typeof r.suggested_job_step === "string" && r.suggested_job_step.trim()
      ? r.suggested_job_step.trim()
      : null,
    confidence: "early",
    validated:  false,
  };
}

// ── Shared styles ─────────────────────────────────────────────────────────────

const LABEL: React.CSSProperties = {
  fontSize: 9,
  fontFamily: "monospace",
  letterSpacing: "0.1em",
  color: "#999",
  textTransform: "uppercase",
};

const SOURCE_DISPLAY: Record<string, string> = {
  social_reddit: "Reddit",
  social_forum:  "Forum",
  social_review: "Review",
  social_other:  "Other",
};

const INPUT_BASE: React.CSSProperties = {
  fontSize: 12,
  color: "#333",
  border: "1px solid #ddd",
  borderRadius: 4,
  padding: "7px 10px",
  background: "#fff",
  fontFamily: "inherit",
  width: "100%",
  boxSizing: "border-box",
};

// ── Extraction display ────────────────────────────────────────────────────────

function ExtractionSection({ label, items }: { label: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div style={{ marginBottom: 10 }}>
      <p style={{ ...LABEL, margin: "0 0 5px" }}>{label}</p>
      <ul style={{ margin: 0, padding: "0 0 0 16px" }}>
        {items.map((item, i) => (
          <li key={i} style={{ fontSize: 12, color: "#444", lineHeight: 1.55, marginBottom: 2 }}>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ExtractionPanel({ extraction }: { extraction: SocialExtraction }) {
  return (
    <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #f0ede8" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <span style={{ ...LABEL }}>Extracted signal</span>
        <span style={{ fontSize: 9, fontFamily: "monospace", letterSpacing: "0.08em", color: "#bbb", textTransform: "uppercase", background: "#f9f7f4", borderRadius: 3, padding: "2px 6px" }}>
          Early · not validated
        </span>
      </div>
      <ExtractionSection label="Customer problems"  items={extraction.customer_problems}  />
      <ExtractionSection label="Repeated themes"    items={extraction.repeated_themes}    />
      <ExtractionSection label="Emotional language" items={extraction.emotional_language} />
      <ExtractionSection label="Possible needs"     items={extraction.possible_needs}     />
      {extraction.suggested_job_step && (
        <div>
          <p style={{ ...LABEL, margin: "0 0 4px" }}>Suggested job step</p>
          <p style={{ fontSize: 12, color: "#555", margin: 0, fontStyle: "italic" }}>
            {extraction.suggested_job_step}
          </p>
        </div>
      )}
    </div>
  );
}

// ── Signal card ───────────────────────────────────────────────────────────────

function SignalCard({
  need,
  analyzing,
  onDelete,
  deleting,
}: {
  need: OdiNeedRow;
  analyzing: boolean;
  onDelete: () => void;
  deleting: boolean;
}) {
  const extraction = parseExtraction(need.social_extraction_json);

  return (
    <div style={{ border: "1px solid #e8e6e0", borderRadius: 6, padding: "12px 14px", background: "#fff", position: "relative" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 9, fontFamily: "monospace", letterSpacing: "0.08em", color: "#999", textTransform: "uppercase", background: "#f2f0eb", borderRadius: 3, padding: "2px 6px" }}>
          {SOURCE_DISPLAY[need.source_path] ?? need.source_path}
        </span>
        <span style={{ fontSize: 9, fontFamily: "monospace", letterSpacing: "0.08em", color: "#bbb", textTransform: "uppercase" }}>
          Early signal
        </span>
        {analyzing && (
          <span style={{ fontSize: 9, fontFamily: "monospace", letterSpacing: "0.08em", color: "#aaa", textTransform: "uppercase" }}>
            Extracting…
          </span>
        )}
      </div>

      <p style={{ fontSize: 13, color: "#333", margin: "0 0 6px", lineHeight: 1.55, whiteSpace: "pre-wrap" }}>
        {need.desired_outcome}
      </p>

      {need.source_url && (
        <p style={{ fontSize: 11, color: "#aaa", margin: "0 0 4px", fontFamily: "monospace", wordBreak: "break-all" }}>
          {need.source_url}
        </p>
      )}

      {need.notes && (
        <p style={{ fontSize: 12, color: "#777", margin: "4px 0 0", fontStyle: "italic" }}>
          Note: {need.notes}
        </p>
      )}

      {extraction && <ExtractionPanel extraction={extraction} />}

      <button
        type="button"
        onClick={onDelete}
        disabled={deleting}
        aria-label="Remove signal"
        style={{ position: "absolute", top: 10, right: 10, fontSize: 13, color: "#ccc", background: "none", border: "none", cursor: deleting ? "default" : "pointer", padding: 0, lineHeight: 1 }}
      >
        ✕
      </button>
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

export default function SocialSignalsPanel({
  companyId,
  socialNeeds,
  onAdded,
}: {
  companyId: string | null;
  socialNeeds: OdiNeedRow[];
  onAdded: () => void;
}) {
  const [sourceType, setSourceType] = useState<SocialSourceType>("reddit");
  const [url,        setUrl]        = useState("");
  const [text,       setText]       = useState("");
  const [notes,      setNotes]      = useState("");
  const [saving,     setSaving]     = useState(false);
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [error,      setError]      = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!companyId || !text.trim()) return;
    setSaving(true);
    setError(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data: inserted, error: err } = await supabase
        .from("odi_needs")
        .insert({
          company_id:      companyId,
          user_id:         user.id,
          source_path:     `social_${sourceType}`,
          desired_outcome: text.trim(),
          source_url:      url.trim() || null,
          notes:           notes.trim() || null,
          importance:      5,
          satisfaction:    5,
          opportunity_score: 0,
          service_state:   "served",
          tier:            "need",
          journey_key:     "customer",
          step_number:     0,
          step_label:      "",
          frameworks_used: ["social"],
        })
        .select("id")
        .single();

      if (err) throw new Error(err.message);

      const needId = inserted?.id ?? null;

      setSourceType("reddit");
      setUrl("");
      setText("");
      setNotes("");
      setSaving(false);
      onAdded();

      // Kick off extraction in the background — don't block the UI.
      if (needId) {
        setAnalyzingId(needId);
        try {
          await supabase.functions.invoke("analyze-social-signal", {
            body: { need_id: needId, text: text.trim(), source_type: sourceType },
          });
        } catch {
          // Extraction is best-effort; silent failure is acceptable.
        } finally {
          setAnalyzingId(null);
          onAdded(); // refresh to pick up the written extraction
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      await supabase.from("odi_needs").delete().eq("id", id);
      onAdded();
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="crpv-ws-section crpv-ws-section-wide" style={{ marginTop: 32 }}>
      <SectionHeader
        title="Social Signals"
        desc="Paste Reddit posts, forum comments, reviews, or social conversations that may reveal customer problems. This can help spot patterns, but still needs to be checked with real customers."
      />

      {socialNeeds.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <p style={{ ...LABEL, margin: "0 0 10px" }}>
            Early signals · {socialNeeds.length} added
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {socialNeeds.map((n) => (
              <SignalCard
                key={n.id}
                need={n}
                analyzing={analyzingId === n.id}
                onDelete={() => handleDelete(n.id)}
                deleting={deletingId === n.id}
              />
            ))}
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-end" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <label style={LABEL}>Source type</label>
            <select
              value={sourceType}
              onChange={(e) => setSourceType(e.target.value as SocialSourceType)}
              style={{ ...INPUT_BASE, width: "auto", padding: "7px 10px" }}
            >
              {SOURCE_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 5 }}>
            <label style={LABEL}>Source URL (optional)</label>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://reddit.com/r/…"
              style={INPUT_BASE}
            />
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <label style={LABEL}>
            Raw text / comment body <span style={{ color: "#cc5555" }}>*</span>
          </label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste the Reddit post, forum comment, review, or social conversation here…"
            rows={5}
            required
            style={{ ...INPUT_BASE, fontSize: 13, resize: "vertical", lineHeight: 1.5 }}
          />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <label style={LABEL}>Notes (optional)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="What pattern does this point to? What problem does it reveal?"
            rows={2}
            style={{ ...INPUT_BASE, resize: "vertical", lineHeight: 1.5, color: "#555" }}
          />
        </div>

        {error && (
          <p style={{ fontSize: 12, color: "#cc5555", margin: 0 }}>{error}</p>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            type="submit"
            disabled={!companyId || !text.trim() || saving}
            style={{
              fontSize: 12,
              color: "#555",
              border: "1px solid #ccc",
              borderRadius: 4,
              padding: "8px 16px",
              background: saving ? "#f5f5f5" : "#fff",
              cursor: saving || !text.trim() ? "default" : "pointer",
              fontFamily: "inherit",
            }}
          >
            {saving ? "Adding…" : "Add signal"}
          </button>
          <span style={{ fontSize: 11, color: "#bbb", fontStyle: "italic" }}>
            Won't affect readiness or route recommendations.
          </span>
        </div>
      </form>
    </div>
  );
}
