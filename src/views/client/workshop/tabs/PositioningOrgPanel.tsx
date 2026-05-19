import { useState, useMemo } from "react";
import type { PositioningCanvas, PositioningItem } from "@/lib/types";
import type { SourceConfidenceSignals } from "@/lib/sourceConfidence";
import type { BaselineResult } from "../types";
import type { PositioningProposalRow } from "@/hooks/usePositioningProposal";
import { useSaveFlash } from "../hooks";
import { alignmentOf } from "../helpers";
import { SectionHeader, ListEditor, StatementField } from "../primitives";
import PositioningInspectPanel from "@/views/Positioning/PositioningInspectPanel";
import { SignalBasisChip, type SignalBasis } from "@/components/design-system/SignalBasisChip";
import {
  getCategoryHighlightWords,
  getOutcomeHighlightPhrases,
  getDifferentiatorHighlightWords,
  getBestFitHighlightPhrases,
} from "@/lib/positioningStrength";

// ── Hierarchy design tokens (matches routes view R) ────────────────────────────
const P = {
  ink:           "#111111",
  inkSoft:       "#555555",
  inkFaint:      "#999999",
  signal:        "#ff5b29",
  hairline:      "rgba(17,17,17,0.12)",
  hairlineFaint: "rgba(17,17,17,0.08)",
  mono:          '"IBM Plex Mono", ui-monospace, monospace',
  sans:          '"Inter", system-ui, sans-serif',
} as const;

const PROPOSAL_FIELD_LABELS: Record<string, string> = {
  competitive_alternatives_json: "Competitive Alternatives",
  unique_attributes_json:        "Unique Attributes",
  value_for_customer:            "Value for Customer",
  best_fit_customers:            "Best-Fit Customers",
  market_category:               "Market Category",
  category_rationale:            "Category Rationale",
  current_tagline:               "Current Tagline",
  proposed_tagline:              "Proposed Tagline",
};

const PROPOSAL_FIELDS = Object.keys(PROPOSAL_FIELD_LABELS);

function summarizeProposalValue(field: string, val: unknown): string {
  if (field === "competitive_alternatives_json" || field === "unique_attributes_json") {
    if (!Array.isArray(val) || val.length === 0) return "(none)";
    const names = (val as unknown[]).map((item) =>
      typeof item === "object" && item && "name" in item
        ? String((item as Record<string, unknown>).name)
        : String(item),
    );
    if (names.length <= 3) return names.join(", ");
    return `${names.slice(0, 3).join(", ")} +${names.length - 3}`;
  }
  return String(val ?? "") || "(empty)";
}

function proposalDiffedFields(proposal: PositioningProposalRow): string[] {
  return PROPOSAL_FIELDS.filter((field) => {
    const curr = proposal.current_state[field];
    const prop = proposal.proposed_state[field];
    if (field === "competitive_alternatives_json" || field === "unique_attributes_json") {
      const names = (arr: unknown) =>
        (Array.isArray(arr) ? arr : [])
          .map((item) => (typeof item === "object" && item && "name" in item ? String((item as Record<string, unknown>).name) : ""))
          .sort()
          .join("|");
      return names(curr) !== names(prop);
    }
    return String(curr ?? "") !== String(prop ?? "");
  });
}

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function splitValueText(text: string): [string, string] {
  const words = text.split(" ");
  const split = Math.max(2, Math.ceil(words.length * 0.5));
  return [words.slice(0, split).join(" "), words.slice(split).join(" ")];
}

function HPos_SectionHeader({ number, label }: { number: string; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 12, borderTop: `1px solid ${P.hairline}`, paddingTop: 20, marginBottom: 22 }}>
      <span style={{ fontFamily: P.mono, fontSize: 9, color: P.inkFaint, textTransform: "uppercase", letterSpacing: "0.12em" }}>§ {number}</span>
      <span style={{ fontFamily: P.mono, fontSize: 10, color: "rgba(17,17,17,0.7)", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 500 }}>{label}</span>
    </div>
  );
}

function HPos_AddRow({ placeholder, gridFirstCol, onAdd }: { placeholder: string; gridFirstCol: string; onAdd: (name: string) => Promise<void> }) {
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  async function commit() {
    const t = value.trim();
    if (!t) return;
    setSaving(true);
    await onAdd(t);
    setValue("");
    setSaving(false);
  }
  return (
    <div style={{ display: "grid", gridTemplateColumns: `${gridFirstCol} 1fr auto`, borderTop: `1px solid ${P.hairlineFaint}`, padding: "10px 0", alignItems: "center" }}>
      <span style={{ fontFamily: P.mono, fontSize: 11, color: "rgba(17,17,17,0.2)", userSelect: "none" }}>+</span>
      <input
        type="text" value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && commit()}
        placeholder={placeholder} disabled={saving}
        style={{ fontFamily: P.sans, fontSize: 14, color: P.ink, background: "none", border: "none", outline: "none", width: "100%" }}
      />
      {value.trim() && (
        <button type="button" onClick={commit} disabled={saving}
          style={{ fontFamily: P.mono, fontSize: 9, color: P.signal, background: "none", border: "none", cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.1em", padding: 0 }}>
          Add
        </button>
      )}
    </div>
  );
}

export default function PositioningOrgPanel({
  canvas,
  loading,
  updatedAt,
  baseline,
  signals,
  updateTextField,
  updateItemsField,
  hasHierarchy,
  unroutedCount,
  signalBasis,
  onReEvaluate,
  reEvalLoading,
  onGenerateProposal,
  generateLoading,
  generateMessage,
  proposal,
  onAcceptProposal,
  onRejectProposal,
  acceptLoading,
  rejectLoading,
}: {
  canvas: PositioningCanvas | null;
  loading: boolean;
  updatedAt?: string;
  baseline: BaselineResult | null;
  signals: SourceConfidenceSignals;
  updateTextField: (field: "value_for_customer" | "best_fit_customers" | "market_category" | "category_rationale" | "current_tagline" | "proposed_tagline", value: string) => Promise<void>;
  updateItemsField: (field: "competitive_alternatives_json" | "unique_attributes_json", items: PositioningItem[]) => Promise<void>;
  hasHierarchy?: boolean;
  unroutedCount?: number;
  signalBasis?: SignalBasis;
  onReEvaluate?: () => void;
  reEvalLoading?: boolean;
  onGenerateProposal?: () => void;
  generateLoading?: boolean;
  generateMessage?: string | null;
  proposal?: PositioningProposalRow | null;
  onAcceptProposal?: (proposalId: string) => void;
  onRejectProposal?: (proposalId: string) => void;
  acceptLoading?: boolean;
  rejectLoading?: boolean;
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

  // ── Hierarchy layout ───────────────────────────────────────────────────────
  if (hasHierarchy) {
    const competitors     = canvas.competitive_alternatives;
    const differentiators = canvas.unique_attributes;
    const [valueBefore, valueSignal] = canvas.value_for_customer
      ? splitValueText(canvas.value_for_customer) : ["", ""];
    const showTagline = !!(canvas.current_tagline && canvas.proposed_tagline);

    const removeItem = (field: "competitive_alternatives_json" | "unique_attributes_json", items: PositioningItem[], id: string) =>
      updateItemsField(field, items.filter((i) => i.id !== id));
    const addItem = (field: "competitive_alternatives_json" | "unique_attributes_json", items: PositioningItem[], name: string) =>
      updateItemsField(field, [...items, { id: `item-${Date.now()}-${Math.random().toString(36).slice(2)}`, name, description: "" }]);

    const xBtn = (onClick: () => void) => (
      <button type="button" onClick={onClick} aria-label="Remove"
        style={{ color: "rgba(17,17,17,0.25)", background: "none", border: "none", cursor: "pointer", fontSize: 15, padding: 0, lineHeight: 1 }}
        onMouseEnter={(e) => { e.currentTarget.style.color = P.signal; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(17,17,17,0.25)"; }}
      >×</button>
    );

    return (
      <>
        <div style={{ margin: -36, padding: "40px 48px 80px", background: "#ffffff", opacity: canvas.strategy_alignment === "off_strategy" ? 0.58 : undefined }}>

          {/* HERO */}
          <div style={{ marginBottom: 52 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18 }}>
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: P.signal, display: "inline-block", flexShrink: 0 }} />
              <span style={{ fontFamily: P.mono, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.16em", color: "rgba(17,17,17,0.4)" }}>
                Strategy · Positioning
              </span>
            </div>
            <h1 style={{ fontFamily: P.sans, fontSize: 30, fontWeight: 700, color: P.ink, margin: "0 0 10px", lineHeight: 1.05, letterSpacing: "-0.022em" }}>
              Your Market <span style={{ color: P.signal }}>Position</span>
            </h1>
            <p style={{ fontFamily: P.sans, fontSize: 13, color: "rgba(17,17,17,0.55)", margin: signalBasis ? "0 0 10px" : "0 0 20px", lineHeight: 1.55, maxWidth: 520 }}>
              {canvas.value_for_customer
                ? "How you deliver value and who you serve — the frame through which buyers evaluate you."
                : "Market position not yet defined. Add competitors, differentiators, and your value statement."}
            </p>
            {signalBasis && <SignalBasisChip {...signalBasis} />}
            {canvas.strategy_alignment === "off_strategy" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 4, margin: signalBasis ? "10px 0 0" : "0" }}>
                <span style={{ fontFamily: P.mono, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(17,17,17,0.4)" }}>
                  OFF-STRATEGY · retained by choice
                </span>
                {canvas.strategy_alignment_reason && (
                  <p style={{ fontFamily: P.sans, fontSize: 12, color: "rgba(17,17,17,0.45)", margin: 0, lineHeight: 1.5, maxWidth: 520, fontStyle: "italic" }}>
                    {canvas.strategy_alignment_reason}
                  </p>
                )}
              </div>
            )}
            {onReEvaluate && (
              <button
                type="button"
                onClick={onReEvaluate}
                disabled={reEvalLoading}
                style={{
                  marginTop: canvas.strategy_alignment ? 6 : 0,
                  fontFamily: P.mono,
                  fontSize: 10,
                  letterSpacing: "0.06em",
                  color: "rgba(17,17,17,0.35)",
                  background: "none",
                  border: "none",
                  cursor: reEvalLoading ? "wait" : "pointer",
                  padding: 0,
                  opacity: reEvalLoading ? 0.5 : 1,
                  display: "block",
                }}
              >
                {reEvalLoading ? "Evaluating…" : "↻ Re-evaluate alignment"}
              </button>
            )}
            {typeof unroutedCount === "number" && unroutedCount > 0 && (
              <p style={{ fontFamily: P.sans, fontSize: 14, margin: 0 }}>
                <span style={{ color: P.signal, fontWeight: 600 }}>{unroutedCount}</span>
                <span style={{ color: "rgba(17,17,17,0.5)", marginLeft: 5 }}>opportunities currently unrouted</span>
              </p>
            )}
            {onGenerateProposal && (
              <div style={{ marginTop: 12 }}>
                <button
                  type="button"
                  onClick={onGenerateProposal}
                  disabled={generateLoading}
                  style={{ fontFamily: P.mono, fontSize: 10, letterSpacing: "0.06em", color: generateLoading ? "rgba(17,17,17,0.25)" : P.signal, background: "none", border: `1px solid ${generateLoading ? "rgba(17,17,17,0.12)" : P.signal}`, cursor: generateLoading ? "wait" : "pointer", padding: "4px 10px", borderRadius: 2 }}
                >
                  {generateLoading ? "Generating proposal…" : "Generate proposal from current evidence"}
                </button>
                {generateMessage && (
                  <p style={{ fontFamily: P.mono, fontSize: 10, color: "rgba(17,17,17,0.4)", margin: "6px 0 0" }}>{generateMessage}</p>
                )}
              </div>
            )}
          </div>

          {/* Pending proposal section */}
          {proposal && (() => {
            const diffFields = proposalDiffedFields(proposal);
            return (
              <div style={{ borderLeft: `3px solid ${P.signal}`, paddingLeft: 20, marginBottom: 52, background: "#fffaf8", padding: "20px 24px", borderRadius: 2, marginLeft: -4 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                  <span style={{ fontFamily: P.mono, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.14em", color: P.signal }}>Proposed Changes</span>
                  <span style={{ fontFamily: P.mono, fontSize: 9, color: P.inkFaint }}>
                    {timeAgo(proposal.created_at)} · {diffFields.length} field{diffFields.length !== 1 ? "s" : ""} would change
                  </span>
                </div>
                {proposal.reason && (
                  <p style={{ fontFamily: P.sans, fontSize: 13, color: P.inkSoft, margin: "0 0 16px", lineHeight: 1.55, maxWidth: 600 }}>{proposal.reason}</p>
                )}
                <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
                  {diffFields.map((field) => {
                    const currVal = summarizeProposalValue(field, proposal.current_state[field]);
                    const propVal = summarizeProposalValue(field, proposal.proposed_state[field]);
                    return (
                      <div key={field} style={{ borderTop: `1px solid ${P.hairlineFaint}`, paddingTop: 10 }}>
                        <span style={{ fontFamily: P.mono, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.1em", color: P.inkFaint, display: "block", marginBottom: 4 }}>
                          {PROPOSAL_FIELD_LABELS[field] ?? field}
                        </span>
                        <p style={{ fontFamily: P.sans, fontSize: 12, color: "rgba(17,17,17,0.35)", margin: "0 0 4px", lineHeight: 1.4 }}>
                          {currVal}
                        </p>
                        <p style={{ fontFamily: P.sans, fontSize: 13, color: P.ink, fontWeight: 500, margin: 0, lineHeight: 1.4 }}>
                          {propVal}
                        </p>
                      </div>
                    );
                  })}
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <button
                    type="button"
                    onClick={() => onAcceptProposal?.(proposal.id)}
                    disabled={acceptLoading || rejectLoading}
                    style={{ fontFamily: P.mono, fontSize: 10, letterSpacing: "0.08em", color: "#fff", background: P.signal, border: "none", cursor: acceptLoading ? "wait" : "pointer", padding: "6px 14px", borderRadius: 2, opacity: (acceptLoading || rejectLoading) ? 0.5 : 1 }}
                  >
                    {acceptLoading ? "Accepting…" : "Accept"}
                  </button>
                  <button
                    type="button"
                    onClick={() => onRejectProposal?.(proposal.id)}
                    disabled={acceptLoading || rejectLoading}
                    style={{ fontFamily: P.mono, fontSize: 10, letterSpacing: "0.08em", color: P.inkSoft, background: "none", border: `1px solid ${P.hairline}`, cursor: rejectLoading ? "wait" : "pointer", padding: "6px 14px", borderRadius: 2, opacity: (acceptLoading || rejectLoading) ? 0.5 : 1 }}
                  >
                    {rejectLoading ? "Rejecting…" : "Reject"}
                  </button>
                </div>
              </div>
            );
          })()}

          {/* § 01 — WHO ELSE THEY COULD CHOOSE */}
          <div style={{ marginBottom: 52 }}>
            <HPos_SectionHeader number="01" label="Who Else They Could Choose" />
            <div>
              {competitors.map((item, idx) => (
                <div key={item.id} style={{ display: "grid", gridTemplateColumns: "40px 1fr 24px", alignItems: "center", borderTop: idx === 0 ? `1px solid ${P.hairlineFaint}` : "none", borderBottom: `1px solid ${P.hairlineFaint}`, padding: "12px 0" }}>
                  <span style={{ fontFamily: P.mono, fontSize: 11, color: "rgba(17,17,17,0.3)" }}>{String(idx + 1).padStart(2, "0")}</span>
                  <span style={{ fontFamily: P.sans, fontSize: 15, color: "rgba(17,17,17,0.9)", lineHeight: 1.4 }}>{item.name}</span>
                  {xBtn(() => removeItem("competitive_alternatives_json", competitors, item.id))}
                </div>
              ))}
              <HPos_AddRow placeholder="Add a competitor or alternative…" gridFirstCol="40px" onAdd={(name) => addItem("competitive_alternatives_json", competitors, name)} />
            </div>
          </div>

          {/* § 02 — WHAT MAKES YOU DIFFERENT */}
          <div style={{ marginBottom: 52 }}>
            <HPos_SectionHeader number="02" label="What Makes You Different" />
            <div>
              {differentiators.map((item, idx) => (
                <div key={item.id} style={{ display: "grid", gridTemplateColumns: "80px 1fr 24px", borderTop: idx === 0 ? `1px solid ${P.hairlineFaint}` : "none", borderBottom: `1px solid ${P.hairlineFaint}`, padding: "18px 0" }}>
                  <span style={{ fontFamily: P.mono, fontSize: 36, fontWeight: 400, color: "rgba(17,17,17,0.15)", lineHeight: 1, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em" }}>
                    {String(idx + 1).padStart(2, "0")}
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontFamily: P.sans, fontSize: 18, fontWeight: 600, color: P.ink, margin: "0 0 4px", lineHeight: 1.25, letterSpacing: "-0.01em" }}>{item.name}</p>
                    {item.description && (
                      <p style={{ fontFamily: P.sans, fontSize: 14, color: "rgba(17,17,17,0.7)", margin: 0, lineHeight: 1.55, maxWidth: 520 }}>{item.description}</p>
                    )}
                  </div>
                  <div style={{ paddingTop: 3 }}>
                    {xBtn(() => removeItem("unique_attributes_json", differentiators, item.id))}
                  </div>
                </div>
              ))}
              <HPos_AddRow placeholder="Add a differentiator…" gridFirstCol="80px" onAdd={(name) => addItem("unique_attributes_json", differentiators, name)} />
            </div>
          </div>

          {/* § 03 — THE REAL VALUE YOU DELIVER (keystone stripe) */}
          {canvas.value_for_customer && (
            <div style={{ marginBottom: 52 }}>
              <HPos_SectionHeader number="03" label="The Real Value You Deliver" />
              <div style={{ background: P.ink, marginLeft: -48, width: "calc(100% + 96px)", padding: "28px 48px" }}>
                <p style={{ fontFamily: P.mono, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.14em", color: "rgba(246,246,244,0.45)", margin: "0 0 10px" }}>
                  § 03 · KEYSTONE
                </p>
                <p style={{ fontFamily: P.sans, fontSize: 26, fontWeight: 600, color: "#f6f6f4", lineHeight: 1.4, margin: "0 0 8px", maxWidth: 600 }}>
                  {valueBefore} <span style={{ color: P.signal }}>{valueSignal}</span>
                </p>
                {canvas.category_rationale && (
                  <p style={{ fontFamily: P.sans, fontSize: 14, color: "rgba(246,246,244,0.7)", margin: 0, lineHeight: 1.55 }}>
                    {canvas.category_rationale}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* § 04 + § 05 — Paired columns */}
          {(canvas.best_fit_customers || canvas.market_category) && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 40, marginBottom: 52 }}>
              {/* § 04 */}
              <div>
                <HPos_SectionHeader number="04" label="Who This Is Built For" />
                {canvas.best_fit_customers && (
                  <>
                    <div style={{ display: "inline-flex", border: `1px solid rgba(255,91,41,0.4)`, padding: "3px 10px", marginBottom: 14, borderRadius: 2 }}>
                      <span style={{ fontFamily: P.mono, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: P.signal }}>Target Buyer</span>
                    </div>
                    <p style={{ fontFamily: P.sans, fontSize: 15, color: "rgba(17,17,17,0.85)", lineHeight: 1.6, margin: 0 }}>{canvas.best_fit_customers}</p>
                  </>
                )}
              </div>
              {/* § 05 */}
              <div>
                <HPos_SectionHeader number="05" label="Why You Belong" />
                {canvas.market_category && (
                  <p style={{ fontFamily: P.sans, fontSize: 15, color: "rgba(17,17,17,0.85)", lineHeight: 1.6, margin: canvas.category_rationale ? "0 0 10px" : 0 }}>
                    <span style={{ fontFamily: P.mono, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.1em", color: P.inkFaint, display: "block", marginBottom: 4 }}>Category</span>
                    {canvas.market_category}
                  </p>
                )}
                {canvas.category_rationale && (
                  <p style={{ fontFamily: P.sans, fontSize: 14, color: "rgba(17,17,17,0.7)", lineHeight: 1.6, margin: 0 }}>{canvas.category_rationale}</p>
                )}
              </div>
            </div>
          )}

          {/* § 06 — TAGLINE SHIFT */}
          {showTagline && (
            <div style={{ marginBottom: 52 }}>
              <HPos_SectionHeader number="06" label="Tagline Shift" />
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 24, alignItems: "center" }}>
                <div>
                  <p style={{ fontFamily: P.mono, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.12em", color: "rgba(17,17,17,0.4)", margin: "0 0 8px" }}>Before</p>
                  <p style={{ fontFamily: P.sans, fontSize: 19, color: "rgba(17,17,17,0.45)", textDecoration: "line-through", textDecorationColor: "rgba(17,17,17,0.3)", lineHeight: 1.3, margin: 0 }}>{canvas.current_tagline}</p>
                </div>
                <span style={{ fontFamily: P.mono, fontSize: 22, color: P.signal, userSelect: "none" }}>→</span>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                    <span style={{ width: 5, height: 5, borderRadius: "50%", background: P.signal, display: "inline-block", flexShrink: 0 }} />
                    <p style={{ fontFamily: P.mono, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.12em", color: "rgba(17,17,17,0.4)", margin: 0 }}>After</p>
                  </div>
                  <p style={{ fontFamily: P.sans, fontSize: 22, fontWeight: 600, color: P.ink, lineHeight: 1.25, margin: 0 }}>{canvas.proposed_tagline}</p>
                </div>
              </div>
            </div>
          )}

        </div>
      </>
    );
  }

  return (
    <>
    <div className="crpv-ws-section">
      <div style={{ marginBottom: 24 }}>
        <p style={{ fontFamily: "monospace", fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: "#9aaba5", margin: "0 0 8px" }}>
          Market interpretation
          {updatedAt && (
            <span style={{ color: "#bbb", marginLeft: 8 }}>· {updatedAt}</span>
          )}
        </p>
        <p style={{ fontSize: 15, fontWeight: 400, color: "#1e3340", lineHeight: 1.5, margin: "0 0 4px", letterSpacing: "-0.005em", maxWidth: 640 }}>
          {attrHasVague
            ? "Some differentiation claims are hard to defend — alternatives can make the same argument."
            : canvas.value_for_customer
            ? "How you deliver value in the market — and where that read may be shifting."
            : "Market position not yet defined — differentiation and audience signals needed."}
        </p>
        {canvas.strategy_alignment === "off_strategy" && (
          <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontFamily: "monospace", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(17,17,17,0.4)" }}>
              OFF-STRATEGY · retained by choice
            </span>
            {canvas.strategy_alignment_reason && (
              <p style={{ fontSize: 11, color: "rgba(17,17,17,0.4)", margin: 0, lineHeight: 1.5, maxWidth: 520, fontStyle: "italic" }}>
                {canvas.strategy_alignment_reason}
              </p>
            )}
          </div>
        )}
        {onReEvaluate && (
          <button
            type="button"
            onClick={onReEvaluate}
            disabled={reEvalLoading}
            style={{
              marginTop: 8,
              fontFamily: "monospace",
              fontSize: 10,
              letterSpacing: "0.06em",
              color: "rgba(17,17,17,0.35)",
              background: "none",
              border: "none",
              cursor: reEvalLoading ? "wait" : "pointer",
              padding: 0,
              opacity: reEvalLoading ? 0.5 : 1,
              display: "block",
            }}
          >
            {reEvalLoading ? "Evaluating…" : "↻ Re-evaluate alignment"}
          </button>
        )}
        {onGenerateProposal && (
          <div style={{ marginTop: 10 }}>
            <button
              type="button"
              onClick={onGenerateProposal}
              disabled={generateLoading}
              style={{ fontFamily: "monospace", fontSize: 10, letterSpacing: "0.06em", color: generateLoading ? "#ccc" : "#e05a2b", background: "none", border: `1px solid ${generateLoading ? "#ddd" : "#e05a2b"}`, cursor: generateLoading ? "wait" : "pointer", padding: "4px 10px", borderRadius: 2 }}
            >
              {generateLoading ? "Generating proposal…" : "Generate proposal from current evidence"}
            </button>
            {generateMessage && (
              <p style={{ fontFamily: "monospace", fontSize: 10, color: "#aaa", margin: "6px 0 0" }}>{generateMessage}</p>
            )}
          </div>
        )}
      </div>

      {/* Pending proposal section */}
      {proposal && (() => {
        const diffFields = proposalDiffedFields(proposal);
        return (
          <div style={{ borderLeft: "3px solid #e05a2b", paddingLeft: 16, background: "#fffaf8", padding: "16px 20px", borderRadius: 2, marginBottom: 24 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontFamily: "monospace", fontSize: 9, textTransform: "uppercase" as const, letterSpacing: "0.14em", color: "#e05a2b" }}>Proposed Changes</span>
              <span style={{ fontFamily: "monospace", fontSize: 9, color: "#bbb" }}>
                {timeAgo(proposal.created_at)} · {diffFields.length} field{diffFields.length !== 1 ? "s" : ""} would change
              </span>
            </div>
            {proposal.reason && (
              <p style={{ fontSize: 13, color: "#555", margin: "0 0 14px", lineHeight: 1.55, maxWidth: 600 }}>{proposal.reason}</p>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
              {diffFields.map((field) => {
                const currVal = summarizeProposalValue(field, proposal.current_state[field]);
                const propVal = summarizeProposalValue(field, proposal.proposed_state[field]);
                return (
                  <div key={field} style={{ borderTop: "1px solid rgba(17,17,17,0.06)", paddingTop: 8 }}>
                    <span style={{ fontFamily: "monospace", fontSize: 9, textTransform: "uppercase" as const, letterSpacing: "0.1em", color: "#bbb", display: "block", marginBottom: 3 }}>
                      {PROPOSAL_FIELD_LABELS[field] ?? field}
                    </span>
                    <p style={{ fontSize: 12, color: "rgba(17,17,17,0.35)", margin: "0 0 3px", lineHeight: 1.4 }}>{currVal}</p>
                    <p style={{ fontSize: 13, color: "#111", fontWeight: 500, margin: 0, lineHeight: 1.4 }}>{propVal}</p>
                  </div>
                );
              })}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                onClick={() => onAcceptProposal?.(proposal.id)}
                disabled={acceptLoading || rejectLoading}
                style={{ fontFamily: "monospace", fontSize: 10, letterSpacing: "0.08em", color: "#fff", background: "#e05a2b", border: "none", cursor: acceptLoading ? "wait" : "pointer", padding: "5px 12px", borderRadius: 2, opacity: (acceptLoading || rejectLoading) ? 0.5 : 1 }}
              >
                {acceptLoading ? "Accepting…" : "Accept"}
              </button>
              <button
                type="button"
                onClick={() => onRejectProposal?.(proposal.id)}
                disabled={acceptLoading || rejectLoading}
                style={{ fontFamily: "monospace", fontSize: 10, letterSpacing: "0.08em", color: "#555", background: "none", border: "1px solid rgba(17,17,17,0.15)", cursor: rejectLoading ? "wait" : "pointer", padding: "5px 12px", borderRadius: 2, opacity: (acceptLoading || rejectLoading) ? 0.5 : 1 }}
              >
                {rejectLoading ? "Rejecting…" : "Reject"}
              </button>
            </div>
          </div>
        );
      })()}

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
