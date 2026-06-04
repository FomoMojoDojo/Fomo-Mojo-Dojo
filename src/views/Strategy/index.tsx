import { useMemo, useState, useCallback } from "react";
import StrategyInspectPanel from "./StrategyInspectPanel";
import { Link } from "react-router-dom";
import TopNav from "@/components/layout/TopNav";
import { useCompany } from "@/hooks/useCompany";
import { useStrategyCascade } from "@/hooks/useStrategyCascade";
import { useManagedOutcomes } from "@/hooks/useManagedOutcomes";
import { useStrategicProblems, type StrategicProblem } from "@/hooks/useStrategicProblems";
import { useStrategicAssumptions, type StrategicAssumption } from "@/hooks/useStrategicAssumptions";
import { useLatestLocalAlignment } from "@/hooks/useLocalAlignment";
import { useSourceConfidence } from "@/hooks/useSourceConfidence";
import { AreaAlignmentPanel } from "@/components/alignment/AreaAlignmentPanel";
import PageContextStatus from "@/components/layout/PageContextStatus";
import GenericAuditTraceNote from "@/components/diagnostics/GenericAuditTraceNote";
import type { CascadeItem } from "@/lib/types";
import { isGenericAuditCompany } from "@/lib/genericAudit";
import { parseClaritySuggestion } from "@/lib/text/claritySuggestion";
import { useCompanyClaims, findClaimByTopicAndStatement } from "@/lib/claims/useCompanyClaims";
import ClaimStateBadge from "@/components/claims/ClaimStateBadge";
import type { ClaimState } from "@/lib/claimState";
import { useDerivedTensions } from "@/hooks/useDerivedTensions";
import TensionBlock from "@/components/tensions/TensionBlock";
import { StrategicDirectionDelta } from "@/components/strategy/StrategicDirectionDelta";
import {
  OUTCOME_LEVEL_META,
  OUTCOME_LEVELS,
  buildDesiredOutcomeSentence,
  normalizeDesiredOutcomeDirection,
  isFullyStructured,
  type OutcomeLevel,
} from "@/lib/desiredOutcome";
import { toast } from "sonner";

const c = {
  bg: "#faf7f6",
  panel: "#FFFFFF",
  paper: "#FFFFFF",
  line: "#DDE6D1",
  lineFaint: "#EEF3E9",
  charcoal: "#233C4B",
  secondary: "#46606D",
  muted: "#6E847F",
  coral: "#FF7D2D",
  teal: "#5F9B8C",
  amber: "#FAC846",
};

function sectionLabel(text: string, opacity = 0.82) {
  return (
    <div
      className="font-mono text-[11px] uppercase tracking-[0.14em]"
      style={{ color: c.muted, opacity }}
    >
      {text}
    </div>
  );
}

function connector(fragmented = false) {
  return (
    <div className={`flex justify-center ${fragmented ? "py-4" : "py-2"}`}>
      <div className="flex flex-col items-center">
        <div style={{ height: fragmented ? 28 : 20, width: 1, background: fragmented ? c.lineFaint : c.line }} />
        <div className="font-sans text-[18px] leading-none" style={{ color: fragmented ? c.muted : c.amber, opacity: fragmented ? 0.55 : 1 }}>
          ↓
        </div>
      </div>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="py-8">
      <p className="font-sans text-[14px]" style={{ color: c.muted }}>
        {message}
      </p>
    </div>
  );
}

function NarrativeBlock({
  label,
  text,
  emptyText,
  coherenceNote,
  textOpacity = 1,
  saving,
  onAcceptSuggestion,
  onIgnoreSuggestion,
  sectionPaddingTop = 24,
  sectionPaddingBottom = 20,
  claimId,
  claimState,
}: {
  label: string;
  text: string;
  emptyText: string;
  coherenceNote?: string | null;
  textOpacity?: number;
  saving?: boolean;
  onAcceptSuggestion?: (suggested: string) => void | Promise<void>;
  onIgnoreSuggestion?: (primary: string) => void | Promise<void>;
  sectionPaddingTop?: number;
  sectionPaddingBottom?: number;
  claimId?: string | null;
  claimState?: ClaimState | null;
}) {
  const parsed = parseClaritySuggestion(text);
  const renderedText = parsed.primary || emptyText;

  return (
    <section style={{ borderTop: `1px solid ${c.line}`, paddingTop: sectionPaddingTop, paddingBottom: sectionPaddingBottom }}>
      <div className="flex items-center gap-2">
        {sectionLabel(label)}
        {claimId && claimState && (
          <ClaimStateBadge state={claimState} claimId={claimId} size="sm" />
        )}
      </div>
      <p
        className="mt-3 font-sans text-[15px] leading-[1.9] sm:text-[16px]"
        style={{ color: c.charcoal, opacity: textOpacity }}
      >
        {renderedText}
      </p>
      {coherenceNote && (
        <p className="mt-1.5 font-mono text-[9px] uppercase tracking-[0.08em]" style={{ color: c.muted, opacity: 0.65 }}>
          · {coherenceNote}
        </p>
      )}
      {parsed.suggested ? (
        <div className="mt-4" style={{ borderLeft: `2px solid ${c.line}`, paddingLeft: 14, paddingTop: 6, paddingBottom: 6 }}>
          <p className="font-mono text-[10px] uppercase tracking-[0.1em]" style={{ color: c.muted }}>
            Suggested clearer version
          </p>
          <p className="mt-2 font-sans text-[14px] leading-[1.7]" style={{ color: c.secondary }}>
            {parsed.suggested}
          </p>
          {onAcceptSuggestion && onIgnoreSuggestion ? (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => onAcceptSuggestion(parsed.suggested!)}
                disabled={!!saving}
                className="font-mono text-[10px] uppercase tracking-[0.08em] underline disabled:opacity-50"
                style={{ color: c.teal, background: "none", border: "none", cursor: "pointer", padding: 0 }}
              >
                Accept
              </button>
              <button
                type="button"
                onClick={() => onIgnoreSuggestion(parsed.primary)}
                disabled={!!saving}
                className="font-mono text-[10px] uppercase tracking-[0.08em] underline disabled:opacity-50"
                style={{ color: c.muted, background: "none", border: "none", cursor: "pointer", padding: 0 }}
              >
                Ignore
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function statusTone(status: CascadeItem["status"]) {
  if (status === "strong") return { dot: c.teal, text: "STRONG" };
  if (status === "gap") return { dot: c.coral, text: "GAP" };
  return { dot: c.amber, text: "DEVELOPING" };
}


const STATUS_CYCLE: CascadeItem["status"][] = ["developing", "strong", "gap"];

function GridSection({
  label,
  items,
  onUpdate,
  sectionPaddingTop = 32,
  sectionPaddingBottom = 24,
}: {
  label: string;
  items: CascadeItem[];
  onUpdate?: (items: CascadeItem[]) => void;
  sectionPaddingTop?: number;
  sectionPaddingBottom?: number;
}) {
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);

  const cycleStatus = async (index: number) => {
    if (!onUpdate) return;
    const current = items[index].status;
    const next = STATUS_CYCLE[(STATUS_CYCLE.indexOf(current) + 1) % STATUS_CYCLE.length];
    const updated = items.map((item, i) => (i === index ? { ...item, status: next } : item));
    setSaving(true);
    try { await onUpdate(updated); } finally { setSaving(false); }
  };

  const removeItem = async (index: number) => {
    if (!onUpdate) return;
    const updated = items.filter((_, i) => i !== index);
    setSaving(true);
    try { await onUpdate(updated); } finally { setSaving(false); }
  };

  const addItem = async () => {
    const name = newName.trim();
    if (!name || !onUpdate) return;
    const updated = [...items, { name, status: "developing" as const }];
    setSaving(true);
    try {
      await onUpdate(updated);
      setNewName("");
    } finally { setSaving(false); }
  };

  return (
    <section style={{ borderTop: `1px solid ${c.line}`, paddingTop: sectionPaddingTop, paddingBottom: sectionPaddingBottom }}>
      {sectionLabel(label)}
      <div className="mt-4 grid grid-cols-1 gap-0 lg:grid-cols-2 xl:grid-cols-3">
        {items.map((item, index) => {
          const tone = statusTone(item.status);
          const nameWeight = item.status === "strong" ? 600 : item.status === "developing" ? 500 : 400;
          const nameOpacity = item.status === "strong" ? 1 : item.status === "developing" ? 0.82 : 0.58;
          const nameStyle = item.status === "gap" ? "italic" : "normal";
          return (
            <div
              key={`${label}-${item.name}-${index}`}
              style={{ borderLeft: `2px solid ${tone.dot}40`, paddingLeft: 14, paddingTop: 12, paddingBottom: 12, marginRight: 24, marginBottom: 8 }}
            >
              <p className="font-sans text-[14px] leading-[1.45]" style={{ color: c.charcoal, fontWeight: nameWeight, opacity: nameOpacity, fontStyle: nameStyle }}>
                {item.name}
              </p>
              <div className="mt-2 flex items-center gap-3">
                {onUpdate ? (
                  <button
                    type="button"
                    onClick={() => cycleStatus(index)}
                    disabled={saving}
                    className="font-mono text-[10px] uppercase tracking-[0.1em] hover:opacity-70 disabled:opacity-40"
                    style={{ color: tone.dot, background: "none", border: "none", cursor: "pointer", padding: 0 }}
                    title="Click to cycle status"
                  >
                    {tone.text}
                  </button>
                ) : (
                  <p className="font-mono text-[10px] uppercase tracking-[0.1em]" style={{ color: tone.dot }}>
                    {tone.text}
                  </p>
                )}
                {onUpdate ? (
                  <button
                    type="button"
                    onClick={() => removeItem(index)}
                    disabled={saving}
                    className="ml-auto font-mono text-[9px] uppercase tracking-[0.08em] underline disabled:opacity-40"
                    style={{ color: c.muted, background: "none", border: "none", cursor: "pointer", padding: 0 }}
                  >
                    Remove
                  </button>
                ) : null}
              </div>
              {item.note ? (
                <p className="mt-2 font-sans text-[12px] leading-[1.55]" style={{ color: c.secondary }}>
                  {item.note}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>

      {onUpdate ? (
        <div className="mt-4 flex gap-2">
          <input
            className="flex-1 border px-3 py-2 font-sans text-[13px] outline-none"
            style={{ borderColor: c.line, background: "#fff", color: c.charcoal }}
            value={newName}
            placeholder={`Add ${label.toLowerCase()}…`}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") addItem(); }}
          />
          <button
            type="button"
            onClick={addItem}
            disabled={saving || !newName.trim()}
            className="border px-3 py-2 font-mono text-[10px] uppercase tracking-[0.08em] disabled:opacity-40"
            style={{ borderColor: c.line, color: c.secondary, background: "#fff" }}
          >
            {saving ? "Saving…" : "Add"}
          </button>
        </div>
      ) : null}
    </section>
  );
}

type ProvenanceSource = StrategicProblem["source"] | StrategicAssumption["source"];
type AssumptionViewFilter = "all" | "generated" | "submitted";
type UnifiedAssumption = {
  key: string;
  origin: "generated" | "submitted";
  submittedId?: string;
  assumption: string;
  evidence: string;
  status: StrategicAssumption["status"];
  statusLabel: string;
  statusTone: { bg: string; fg: string; border: string };
  source?: ProvenanceSource;
  createdAt?: string;
  updatedAt?: string;
};

function sourceLabel(source: ProvenanceSource) {
  if (source === "intake") return "Intake";
  if (source === "company") return "Company";
  if (source === "public") return "Public";
  if (source === "evidence") return "Evidence";
  return "Client";
}

function sourceTone(source: ProvenanceSource) {
  if (source === "public") return { bg: "#EEF4F9", fg: c.secondary, border: "#C9D8E7" };
  if (source === "company" || source === "intake") return { bg: "#EEF6E7", fg: c.teal, border: "#BDD8CF" };
  if (source === "evidence") return { bg: "#F8F4E6", fg: "#9D7B2B", border: "#E7D5AA" };
  return { bg: "#FFF0E6", fg: c.coral, border: "#FFD1B4" };
}

function normalizeText(value: string) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function strategicProblemTitle(statement: string, fallbackIndex: number) {
  const lines = String(statement || "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  const headline = lines[0] || "";
  if (headline) return normalizeText(headline);

  const compact = normalizeText(statement || "");
  if (!compact) return `Strategic Problem ${fallbackIndex + 1}`;
  return compact;
}

function strategicProblemSummary(statement: string, title: string) {
  const lines = String(statement || "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  const body = lines.slice(1).join(" ").trim();
  const fallback = lines[0] || "";
  const candidate = body || fallback;
  const cleaned = normalizeText(candidate || "");
  if (!cleaned) return "No additional context captured yet.";

  const normalizedTitle = String(title || "").replace(/\s+/g, " ").trim().toLowerCase();
  const normalizedBody = cleaned.toLowerCase();
  if (normalizedTitle && normalizedBody === normalizedTitle) {
    return "Open this problem to review the full client statement.";
  }
  return cleaned;
}

function strategicProblemDecisionAsk(statement: string) {
  const text = String(statement || "").toLowerCase();

  if (/(audience|segment|buyer|customer|icp|persona|who we serve|target market)/.test(text)) {
    return "Decide which audience segment to prioritize first.";
  }
  if (/(position|category|differentiat|competit|alternative|value proposition|tagline)/.test(text)) {
    return "Decide the market category and differentiation focus.";
  }
  if (/(channel|outreach|acquisition|conversion|pipeline|funnel|distribution)/.test(text)) {
    return "Decide the primary acquisition path to focus on next.";
  }
  if (/(referral|partner|ecosystem|alliance)/.test(text)) {
    return "Decide which partner and referral path should lead.";
  }
  if (/(evidence|data|measure|metric|proof|validate|interview|survey)/.test(text)) {
    return "Decide what evidence must be collected next.";
  }
  if (/(team|org|capabil|resource|operat|workflow|process|delivery)/.test(text)) {
    return "Decide which internal capability gap to fix first.";
  }
  if (/(pricing|price|package|offer)/.test(text)) {
    return "Decide the pricing and offer structure to test.";
  }

  return "Decide the first strategic choice and owner.";
}

function problemStatusTone(status: StrategicProblem["status"]) {
  if (status === "reconciled") {
    return { bg: "#F3F6F1", fg: "#708070", border: "#D4DDCF", label: "Reconciled (Closed)" };
  }
  return { bg: "#FFF0E6", fg: c.coral, border: "#FFD1B4", label: "Open (In play)" };
}

function sourceEvidenceWeight(source: StrategicProblem["source"]) {
  if (source === "evidence") return 5;
  if (source === "public") return 4;
  if (source === "company") return 3;
  if (source === "intake") return 2;
  return 1;
}

const EVIDENCE_HINT_TERMS = [
  "evidence",
  "data",
  "metric",
  "measure",
  "validate",
  "test",
  "interview",
  "survey",
  "conversion",
  "retention",
  "adoption",
  "usage",
  "proof",
  "signal",
  "impact",
  "outcome",
];

function evidenceHintCount(statement: string) {
  const normalized = String(statement || "").toLowerCase();
  if (!normalized) return 0;
  return EVIDENCE_HINT_TERMS.reduce((count, term) => {
    return normalized.includes(term) ? count + 1 : count;
  }, 0);
}

function assumptionStatusLabel(status: StrategicAssumption["status"]) {
  if (status === "validating") return "Validating";
  if (status === "validated") return "Validated";
  if (status === "invalidated") return "Invalidated";
  return "Untested";
}

function assumptionStatusTone(status: StrategicAssumption["status"]) {
  if (status === "validated") return { bg: "#EEF6E7", fg: c.teal, border: "#BDD8CF" };
  if (status === "invalidated") return { bg: "#FFF0E6", fg: c.coral, border: "#FFD1B4" };
  if (status === "validating") return { bg: "#F8F4E6", fg: "#9D7B2B", border: "#E7D5AA" };
  return { bg: "#EEF4F9", fg: c.secondary, border: "#C9D8E7" };
}

function originTone(origin: UnifiedAssumption["origin"]) {
  if (origin === "submitted") return { bg: "#EEF6E7", fg: c.teal, border: "#BDD8CF", label: "Submitted" };
  return { bg: "#EEF4F9", fg: c.secondary, border: "#C9D8E7", label: "Generated" };
}

function UnifiedAssumptionCard({
  item,
  isEditing,
  onEdit,
  onCancelEdit,
  editDraft,
  onDraftChange,
  onSaveEdit,
  isSaving,
}: {
  item: UnifiedAssumption;
  isEditing: boolean;
  onEdit: () => void;
  onCancelEdit: () => void;
  editDraft: {
    assumption: string;
    evidence: string;
    source: StrategicAssumption["source"];
    status: StrategicAssumption["status"];
  } | null;
  onDraftChange: (draft: {
    assumption: string;
    evidence: string;
    source: StrategicAssumption["source"];
    status: StrategicAssumption["status"];
  }) => void;
  onSaveEdit: () => void;
  isSaving: boolean;
}) {
  const originStyle = originTone(item.origin);
  const sourceStyle = item.source ? sourceTone(item.source) : null;
  const createdLabel = item.createdAt ? new Date(item.createdAt).toLocaleDateString() : "Generated snapshot";
  const updatedLabel = item.updatedAt
    ? new Date(item.updatedAt).toLocaleDateString()
    : item.createdAt
      ? new Date(item.createdAt).toLocaleDateString()
      : "Not edited yet";

  const itemAgeDays = (() => {
    const ms = Number.isFinite(Date.parse(item.updatedAt ?? ""))
      ? Date.parse(item.updatedAt!)
      : Number.isFinite(Date.parse(item.createdAt ?? ""))
        ? Date.parse(item.createdAt!)
        : 0;
    return ms > 0 ? Math.max(0, (Date.now() - ms) / 86_400_000) : 0;
  })();
  const assumptionPadding =
    item.status === "untested"   ? 17 :
    item.status === "validating" ? 15 :
    item.status === "validated"  ? 12 : 10;
  const evidenceBaseOpacity =
    item.status === "validated" ? (itemAgeDays > 60 ? 0.82 : 0.95) :
    item.status === "validating" ? 0.82 :
    item.status === "invalidated" ? (itemAgeDays < 7 ? 0.50 : 0.42) : 0.68;

  return (
    <div
      style={{
        borderLeft: `${item.status === "validated" ? 3 : 2}px solid ${item.statusTone.fg}${item.status === "validated" ? "90" : item.status === "untested" ? "45" : item.status === "invalidated" ? "28" : "60"}`,
        paddingLeft: 14, paddingTop: assumptionPadding, paddingBottom: assumptionPadding, marginBottom: 2,
      }}
    >
      {isEditing && editDraft ? (
        <div className="space-y-3">
          <textarea
            className="w-full rounded-[12px] border px-3 py-2 font-sans text-[14px] outline-none"
            style={{ borderColor: c.line, background: "#fff", color: c.charcoal }}
            rows={2}
            value={editDraft.assumption}
            onChange={(event) => onDraftChange({ ...editDraft, assumption: event.target.value })}
          />
          <input
            className="w-full rounded-[12px] border px-3 py-2 font-sans text-[13px] outline-none"
            style={{ borderColor: c.line, background: "#fff", color: c.secondary }}
            value={editDraft.evidence}
            onChange={(event) => onDraftChange({ ...editDraft, evidence: event.target.value })}
            placeholder="Evidence needed (editable)"
          />
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="font-mono text-[10px] uppercase tracking-[0.08em]"
              style={{ color: c.muted }}
            >
              Source
            </span>
            <select
              className="rounded-md border px-2 py-1.5 font-mono text-[11px] uppercase tracking-[0.08em]"
              style={{ borderColor: c.line, color: c.secondary, background: "#fff" }}
              value={editDraft.source}
              onChange={(event) =>
                onDraftChange({
                  ...editDraft,
                  source: event.target.value as StrategicAssumption["source"],
                })
              }
            >
              <option value="client">Client</option>
              <option value="intake">Intake</option>
              <option value="company">Company</option>
              <option value="public">Public</option>
              <option value="evidence">Evidence</option>
            </select>
            <span
              className="ml-2 font-mono text-[10px] uppercase tracking-[0.08em]"
              style={{ color: c.muted }}
            >
              Status
            </span>
            <select
              className="rounded-md border px-2 py-1.5 font-mono text-[11px] uppercase tracking-[0.08em]"
              style={{ borderColor: c.line, color: c.secondary, background: "#fff" }}
              value={editDraft.status}
              onChange={(event) =>
                onDraftChange({
                  ...editDraft,
                  status: event.target.value as StrategicAssumption["status"],
                })
              }
            >
              <option value="untested">Untested</option>
              <option value="validating">Validating</option>
              <option value="validated">Validated</option>
              <option value="invalidated">Invalidated</option>
            </select>
          </div>
          <div style={{ borderLeft: `2px solid ${c.lineFaint}`, paddingLeft: 10, paddingTop: 6, paddingBottom: 6 }}>
            <p className="font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: c.muted }}>
              Created: {createdLabel}
            </p>
            <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: c.muted }}>
              Last edited: {updatedLabel}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onSaveEdit}
              disabled={isSaving}
              className="rounded-md border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.08em] disabled:opacity-50"
              style={{ borderColor: c.line, color: c.secondary, background: "#fff" }}
            >
              {isSaving ? "Saving..." : "Save"}
            </button>
            <button
              type="button"
              onClick={onCancelEdit}
              disabled={isSaving}
              className="rounded-md border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.08em] disabled:opacity-50"
              style={{ borderColor: c.line, color: c.secondary, background: "#fff" }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-start justify-between gap-3">
            <p className="font-sans text-[14px] leading-[1.55]" style={{
              color: c.charcoal,
              fontWeight: item.status === "validated" ? 500 : 400,
              opacity: item.status === "validated" ? 1 : item.status === "validating" ? 0.88 : item.status === "invalidated" ? 0.5 : 0.75,
              fontStyle: item.status === "invalidated" ? "italic" : "normal",
            }}>
              {item.assumption}
            </p>
            <div className="flex flex-wrap items-center justify-end gap-3 shrink-0">
              <span
                className="font-mono text-[9px] uppercase tracking-[0.08em]"
                style={{ color: originStyle.fg }}
              >
                {originStyle.label}
              </span>
              {sourceStyle ? (
                <span
                  className="font-mono text-[9px] uppercase tracking-[0.08em]"
                  style={{ color: sourceStyle.fg }}
                >
                  {sourceLabel(item.source!)}
                </span>
              ) : null}
              <span
                className="font-mono text-[9px] uppercase tracking-[0.08em]"
                style={{ color: item.statusTone.fg }}
              >
                {item.statusLabel}
              </span>
              <button
                type="button"
                onClick={onEdit}
                className="font-mono text-[9px] uppercase tracking-[0.08em] underline"
                style={{ color: c.muted, background: "none", border: "none", cursor: "pointer", padding: 0 }}
              >
                Edit
              </button>
            </div>
          </div>
          <p className="mt-2 font-sans text-[12px] leading-[1.55]" style={{
            color: c.secondary,
            opacity: evidenceBaseOpacity,
          }}>
            {item.status === "validated" || item.status === "invalidated"
              ? (item.evidence ? `Evidence: ${item.evidence}` : "Evidence: not recorded.")
              : item.status === "validating"
                ? (item.evidence ? `Evidence in progress: ${item.evidence}` : "Evidence in progress: not yet defined.")
                : (item.evidence ? `Evidence needed: ${item.evidence}` : "Evidence needed: not defined yet.")}
          </p>
        </>
      )}
    </div>
  );
}

function suggestEvidenceNeeded(assumptionText: string): string {
  const text = String(assumptionText || "").trim().toLowerCase();
  if (!text) return "";

  if (text.includes("referral") || text.includes("partner")) {
    return "Interview 5+ referral partners, capture referral-to-intake conversion by source for at least 4 weeks, and run one partner message/pitch test with clear success criteria.";
  }
  if (text.includes("family") || text.includes("customer") || text.includes("audience") || text.includes("buyer")) {
    return "Run 6-10 audience interviews focused on this assumption, collect a short survey (30+ responses), and validate with one observed behavior metric from actual intake or conversion data.";
  }
  if (text.includes("position") || text.includes("category") || text.includes("tagline") || text.includes("message") || text.includes("value")) {
    return "Test message comprehension with 8+ target buyers, compare against 2-3 alternatives in structured interviews, and measure lift on one conversion action (e.g., form starts or booked calls).";
  }
  if (text.includes("digital") || text.includes("website") || text.includes("channel") || text.includes("outreach")) {
    return "Define baseline funnel metrics, run one controlled channel/content test for 2-4 weeks, and confirm the change in conversion quality (not just traffic volume).";
  }
  if (text.includes("donor") || text.includes("fundraising") || text.includes("grant")) {
    return "Review 12+ months of donor/grant pipeline data, interview 5+ donors or funders, and test one change in outreach/follow-up with a measurable retention or conversion target.";
  }

  return "Define a measurable outcome for this assumption, run 5-8 direct interviews with the target decision-maker, and execute one small pilot test with clear pass/fail criteria.";
}

// ── Outcome editor types and form component ───────────────────────────────
type OutcomeDraft = {
  level: OutcomeLevel | "";
  actor: string;
  action: string;
  metric: string;
  context: string;
  constraint: string;
  is_primary: boolean;
  confidence: string;
};

const EMPTY_OUTCOME_DRAFT: OutcomeDraft = {
  level: "primary",
  actor: "",
  action: "",
  metric: "percentage",
  context: "",
  constraint: "",
  is_primary: false,
  confidence: "65",
};

function OutcomeForm({
  draft,
  preview,
  saving,
  mode,
  onChange,
  onSave,
  onCancel,
}: {
  draft: OutcomeDraft;
  preview: string;
  saving: boolean;
  mode: "add" | "edit";
  onChange: (draft: OutcomeDraft) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  function field(key: keyof OutcomeDraft, value: string) {
    onChange({ ...draft, [key]: value });
  }

  return (
    <div className="space-y-4">
      {/* Level */}
      <div>
        <label
          className="block font-mono text-[10px] uppercase tracking-[0.1em] mb-1"
          style={{ color: c.muted }}
        >
          Level
        </label>
        <select
          className="w-full rounded-[12px] border px-3 py-2 font-sans text-[13px] outline-none"
          style={{ borderColor: c.line, background: "#fff", color: c.charcoal }}
          value={draft.level}
          onChange={(e) => field("level", e.target.value)}
        >
          {OUTCOME_LEVELS.map((lvl) => (
            <option key={lvl} value={lvl}>
              {OUTCOME_LEVEL_META[lvl].label}
            </option>
          ))}
        </select>
      </div>

      {/* Actor */}
      <div>
        <label
          className="block font-mono text-[10px] uppercase tracking-[0.1em] mb-1"
          style={{ color: c.muted }}
        >
          Actor — who changes behavior?
        </label>
        <input
          className="w-full rounded-[12px] border px-3 py-2 font-sans text-[14px] outline-none"
          style={{ borderColor: c.line, background: "#fff", color: c.charcoal }}
          value={draft.actor}
          placeholder="e.g. qualified prospects, clients, delivery teams"
          onChange={(e) => field("actor", e.target.value)}
        />
      </div>

      {/* Action */}
      <div>
        <label
          className="block font-mono text-[10px] uppercase tracking-[0.1em] mb-1"
          style={{ color: c.muted }}
        >
          Action — what will they do differently? (observable)
        </label>
        <input
          className="w-full rounded-[12px] border px-3 py-2 font-sans text-[14px] outline-none"
          style={{ borderColor: c.line, background: "#fff", color: c.charcoal }}
          value={draft.action}
          placeholder="e.g. book a strategy call, commit to a decision, complete onboarding"
          onChange={(e) => field("action", e.target.value)}
        />
      </div>

      {/* Metric */}
      <div>
        <label
          className="block font-mono text-[10px] uppercase tracking-[0.1em] mb-1"
          style={{ color: c.muted }}
        >
          Metric — how will we measure it?
        </label>
        <input
          className="w-full rounded-[12px] border px-3 py-2 font-sans text-[14px] outline-none"
          style={{ borderColor: c.line, background: "#fff", color: c.charcoal }}
          value={draft.metric}
          placeholder="e.g. percentage, rate, share, count"
          onChange={(e) => field("metric", e.target.value)}
        />
      </div>

      {/* Context */}
      <div>
        <label
          className="block font-mono text-[10px] uppercase tracking-[0.1em] mb-1"
          style={{ color: c.muted }}
        >
          Context — when or where does this happen?
        </label>
        <input
          className="w-full rounded-[12px] border px-3 py-2 font-sans text-[14px] outline-none"
          style={{ borderColor: c.line, background: "#fff", color: c.charcoal }}
          value={draft.context}
          placeholder="e.g. after their first interaction, within one week of identifying a priority"
          onChange={(e) => field("context", e.target.value)}
        />
      </div>

      {/* Constraint */}
      <div>
        <label
          className="block font-mono text-[10px] uppercase tracking-[0.1em] mb-1"
          style={{ color: c.muted }}
        >
          Constraint — optional limit or condition
        </label>
        <input
          className="w-full rounded-[12px] border px-3 py-2 font-sans text-[14px] outline-none"
          style={{ borderColor: c.line, background: "#fff", color: c.charcoal }}
          value={draft.constraint}
          placeholder="e.g. without adding headcount, within the same sales cycle"
          onChange={(e) => field("constraint", e.target.value)}
        />
      </div>

      {/* Is primary + confidence */}
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={draft.is_primary}
            onChange={(e) => onChange({ ...draft, is_primary: e.target.checked })}
            className="rounded"
          />
          <span
            className="font-mono text-[10px] uppercase tracking-[0.08em]"
            style={{ color: c.secondary }}
          >
            Primary anchor
          </span>
        </label>
        <div className="flex items-center gap-2">
          <label
            className="font-mono text-[10px] uppercase tracking-[0.08em]"
            style={{ color: c.muted }}
          >
            Confidence
          </label>
          <input
            type="number"
            min={0}
            max={100}
            className="w-16 rounded-[10px] border px-2 py-1 font-sans text-[13px] outline-none text-center"
            style={{ borderColor: c.line, background: "#fff", color: c.charcoal }}
            value={draft.confidence}
            onChange={(e) => field("confidence", e.target.value)}
          />
          <span className="font-mono text-[10px]" style={{ color: c.muted }}>
            /100
          </span>
        </div>
      </div>

      {/* Live sentence preview */}
      {preview ? (
        <div style={{ borderLeft: `2px solid ${c.teal}`, paddingLeft: 14, paddingTop: 6, paddingBottom: 6 }}>
          <p
            className="font-mono text-[10px] uppercase tracking-[0.1em]"
            style={{ color: c.teal }}
          >
            Outcome preview
          </p>
          <p
            className="mt-1.5 font-sans text-[14px] leading-[1.65]"
            style={{ color: c.charcoal }}
          >
            {preview}
          </p>
        </div>
      ) : null}

      {/* Save / cancel */}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="rounded-md border px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.08em] disabled:opacity-50"
          style={{ borderColor: c.teal, color: c.teal, background: "#EEF6E7" }}
        >
          {saving ? "Saving…" : mode === "add" ? "Add Outcome" : "Save Changes"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="rounded-md border px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.08em] disabled:opacity-50"
          style={{ borderColor: c.line, color: c.secondary, background: "#fff" }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
// ─────────────────────────────────────────────────────────────────────────────

export default function StrategyView() {
  const [inspectOpen, setInspectOpen] = useState(false);
  const { activeCompany } = useCompany();
  const auditMode = isGenericAuditCompany(activeCompany);
  const { loading, item, frameworksUsed, error, savingField, updateNarrativeField, updateListField } = useStrategyCascade(activeCompany?.id);
  const {
    items: managedOutcomes,
    saving: outcomeSaving,
    createManagedOutcome,
    updateManagedOutcome,
  } = useManagedOutcomes(activeCompany?.id);
  const {
    loading: problemsLoading,
    items: strategicProblems,
    error: strategicProblemsError,
    tableMissing: strategicProblemsTableMissing,
    saving: strategicProblemSaving,
    reconcilingId,
    deletingId,
    addProblem,
    setProblemStatus,
    deleteProblem,
  } = useStrategicProblems(activeCompany?.id);
  const {
    loading: assumptionsLoading,
    items: strategicAssumptions,
    error: strategicAssumptionsError,
    tableMissing: strategicAssumptionsTableMissing,
    saving: strategicAssumptionSaving,
    updatingId: assumptionUpdatingId,
    addAssumption,
    updateAssumption,
  } = useStrategicAssumptions(activeCompany?.id);
  const { data: localAlignment } = useLatestLocalAlignment(activeCompany?.id);
  const strategyAlignment = localAlignment?.areas?.strategy ?? null;
  const { signals: sourceSignals } = useSourceConfidence({
    companyId: activeCompany?.id,
    areaScoresJson: activeCompany?.area_scores_json,
    evidenceStatus: activeCompany?.evidence_status,
  });
  const { claims: claimsMap } = useCompanyClaims(activeCompany?.id);
  const cascadeClaims = useMemo(() => ({
    winning_aspiration: findClaimByTopicAndStatement(claimsMap, "strategy", item?.winning_aspiration),
    where_to_play:      findClaimByTopicAndStatement(claimsMap, "strategy", item?.where_to_play),
    how_to_win:         findClaimByTopicAndStatement(claimsMap, "strategy", item?.how_to_win),
  }), [claimsMap, item?.winning_aspiration, item?.where_to_play, item?.how_to_win]);
  // ── Strategic tensions ───────────────────────────────────────────────────
  const { forContext: tensionsForContext } = useDerivedTensions({
    cascade: item ?? null,
    sourceSignals,
  });
  const strategyTensions = tensionsForContext("strategy", 3);

  // ── Outcome editor state ─────────────────────────────────────────────────
  const [outcomeFormOpen, setOutcomeFormOpen] = useState(false);
  const [editingOutcomeId, setEditingOutcomeId] = useState<string | null>(null);
  const [outcomeDraft, setOutcomeDraft] = useState<OutcomeDraft>(EMPTY_OUTCOME_DRAFT);

  const outcomeSentencePreview = useMemo(() => {
    if (!outcomeDraft.actor && !outcomeDraft.action) return "";
    try {
      return buildDesiredOutcomeSentence({
        direction: normalizeDesiredOutcomeDirection("increase"),
        metric: outcomeDraft.metric || "percentage",
        actor: outcomeDraft.actor,
        action: outcomeDraft.action,
        object: "",
        context: outcomeDraft.context,
        constraint: outcomeDraft.constraint || null,
        level: outcomeDraft.level || null,
      });
    } catch {
      return "";
    }
  }, [outcomeDraft]);

  const openAddOutcome = useCallback(() => {
    setEditingOutcomeId(null);
    setOutcomeDraft(EMPTY_OUTCOME_DRAFT);
    setOutcomeFormOpen(true);
  }, []);

  const openEditOutcome = useCallback((id: string) => {
    const o = managedOutcomes.find((x) => x.id === id);
    if (!o) return;
    setEditingOutcomeId(id);
    setOutcomeDraft({
      level: (o.level as OutcomeLevel) || "primary",
      actor: o.actor || "",
      action: o.action || "",
      metric: o.metric || "percentage",
      context: o.context || "",
      constraint: o.constraint || "",
      is_primary: o.is_primary,
      confidence: String(o.confidence ?? 65),
    });
    setOutcomeFormOpen(true);
  }, [managedOutcomes]);

  const cancelOutcomeForm = useCallback(() => {
    setOutcomeFormOpen(false);
    setEditingOutcomeId(null);
    setOutcomeDraft(EMPTY_OUTCOME_DRAFT);
  }, []);

  const saveOutcome = async () => {
    if (!outcomeDraft.actor.trim() || !outcomeDraft.action.trim()) {
      toast.error("Actor and action are required.");
      return;
    }
    const payload = {
      journey_key: "customer",
      actor: outcomeDraft.actor.trim(),
      action: outcomeDraft.action.trim(),
      metric: outcomeDraft.metric.trim() || "percentage",
      context: outcomeDraft.context.trim(),
      constraint: outcomeDraft.constraint.trim() || null,
      is_primary: outcomeDraft.is_primary,
      level: (outcomeDraft.level || "primary") as OutcomeLevel,
      evidence_basis: "Team-authored desired outcome.",
      confidence: Number.isFinite(Number(outcomeDraft.confidence))
        ? Number(outcomeDraft.confidence)
        : 65,
    };
    try {
      if (editingOutcomeId) {
        await updateManagedOutcome(editingOutcomeId, payload);
        toast.success("Outcome updated.");
      } else {
        await createManagedOutcome(payload);
        toast.success("Outcome added.");
      }
      cancelOutcomeForm();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save outcome.");
    }
  };
  // ─────────────────────────────────────────────────────────────────────────

  const [newProblemText, setNewProblemText] = useState("");
  const [newProblemSource, setNewProblemSource] = useState<StrategicProblem["source"]>("client");
  const [reconcileNoteById, setReconcileNoteById] = useState<Record<string, string>>({});
  const [expandedProblemIds, setExpandedProblemIds] = useState<Set<string>>(new Set());
  const [newAssumptionText, setNewAssumptionText] = useState("");
  const [newAssumptionSource, setNewAssumptionSource] = useState<StrategicAssumption["source"]>("client");
  const [newAssumptionNote, setNewAssumptionNote] = useState("");
  const [assumptionsEditorOpen, setAssumptionsEditorOpen] = useState(false);
  const [assumptionViewFilter, setAssumptionViewFilter] = useState<AssumptionViewFilter>("all");
  const [editingAssumptionKey, setEditingAssumptionKey] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState<{
    assumption: string;
    evidence: string;
    source: StrategicAssumption["source"];
    status: StrategicAssumption["status"];
  } | null>(null);
  const [hiddenGeneratedKeys, setHiddenGeneratedKeys] = useState<Set<string>>(new Set());

  const applyClaritySuggestion = async (
    field: "winning_aspiration" | "where_to_play" | "how_to_win",
    value: string,
    mode: "accept" | "ignore",
  ) => {
    const next = String(value || "").trim();
    if (!next) return;
    try {
      await updateNarrativeField(field, next);
      toast.success(mode === "accept" ? "Suggestion applied." : "Suggestion ignored.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update strategy narrative.");
    }
  };

  const openProblemsCount = useMemo(
    () => strategicProblems.filter((problem) => problem.status !== "reconciled").length,
    [strategicProblems],
  );
  const orderedStrategicProblems = useMemo(
    () =>
      [...strategicProblems].sort((a, b) => {
        const aRank = a.status === "reconciled" ? 1 : 0;
        const bRank = b.status === "reconciled" ? 1 : 0;
        if (aRank !== bRank) return aRank - bRank;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }),
    [strategicProblems],
  );
  const strategicProblemCards = useMemo(() => {
    const baseTitles = orderedStrategicProblems.map((problem, index) =>
      strategicProblemTitle(problem.statement, index),
    );
    const counts = new Map<string, number>();
    for (const title of baseTitles) {
      const key = title.toLowerCase();
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const seen = new Map<string, number>();

    return orderedStrategicProblems.map((problem, index) => {
      const baseTitle = baseTitles[index];
      const key = baseTitle.toLowerCase();
      const total = counts.get(key) ?? 0;
      const nextSeen = (seen.get(key) ?? 0) + 1;
      seen.set(key, nextSeen);

      const disambiguator =
        total > 1
          ? `${sourceLabel(problem.source)} · ${new Date(problem.created_at).toLocaleDateString()}`
          : "";
      const title = disambiguator ? `${baseTitle} — ${disambiguator}` : baseTitle;
      const summary = strategicProblemSummary(problem.statement, baseTitle);
      const decisionAsk = strategicProblemDecisionAsk(problem.statement);

      return {
        problem,
        title,
        summary,
        decisionAsk,
      };
    });
  }, [orderedStrategicProblems]);
  const strategicProblemCardById = useMemo(
    () => new Map(strategicProblemCards.map((entry) => [entry.problem.id, entry])),
    [strategicProblemCards],
  );
  const currentFocusProblem = useMemo(() => {
    const openProblems = orderedStrategicProblems.filter((problem) => problem.status !== "reconciled");
    if (!openProblems.length) return null;

    const ranked = openProblems
      .map((problem) => {
        const card = strategicProblemCardById.get(problem.id);
        const sourcePoints = sourceEvidenceWeight(problem.source);
        const hintPoints = evidenceHintCount(problem.statement);
        const updatedMs = Number.isFinite(Date.parse(problem.updated_at))
          ? Date.parse(problem.updated_at)
          : Date.parse(problem.created_at);
        const ageDays = Number.isFinite(updatedMs)
          ? Math.max(0, (Date.now() - updatedMs) / 86_400_000)
          : Number.POSITIVE_INFINITY;
        const freshnessPoints = ageDays <= 14 ? 2 : ageDays <= 45 ? 1 : 0;
        const total = sourcePoints + hintPoints + freshnessPoints;
        return {
          problem,
          card,
          sourcePoints,
          hintPoints,
          freshnessPoints,
          updatedMs,
          total,
        };
      })
      .sort((a, b) => {
        if (b.total !== a.total) return b.total - a.total;
        return b.updatedMs - a.updatedMs;
      });

    const lead = ranked[0];
    const reasonParts: string[] = [];
    if (lead.sourcePoints >= 4) {
      reasonParts.push("it is backed by the strongest outside evidence source among open problems");
    } else if (lead.sourcePoints === 3) {
      reasonParts.push("it is supported by company-side context we can verify quickly");
    } else if (lead.sourcePoints === 2) {
      reasonParts.push("it is grounded in intake evidence we can test in Diagnose");
    } else {
      reasonParts.push("it is the clearest unresolved problem stated by the client team");
    }
    if (lead.hintPoints > 0) {
      reasonParts.push("it is phrased in measurable terms");
    }
    if (lead.freshnessPoints > 0) {
      reasonParts.push("it was updated recently and is likely time-sensitive");
    }

    return {
      problem: lead.problem,
      title: lead.card?.title || strategicProblemTitle(lead.problem.statement, 0),
      summary: lead.card?.summary || strategicProblemSummary(lead.problem.statement, ""),
      decisionAsk: lead.card?.decisionAsk || strategicProblemDecisionAsk(lead.problem.statement),
      whyNow: reasonParts.join("; "),
    };
  }, [orderedStrategicProblems, strategicProblemCardById]);

  const suggestedEvidenceForNewAssumption = useMemo(
    () => suggestEvidenceNeeded(newAssumptionText),
    [newAssumptionText],
  );
  const outcomesByLevel = useMemo(() => {
    const groups: Record<"primary" | "secondary" | "tertiary" | "unset", typeof managedOutcomes> = {
      primary: [],
      secondary: [],
      tertiary: [],
      unset: [],
    };
    for (const o of managedOutcomes) {
      const lvl = o.level ?? null;
      if (lvl === "primary" || lvl === "secondary" || lvl === "tertiary") {
        groups[lvl].push(o);
      } else if (o.is_primary) {
        groups.primary.push(o);
      } else {
        groups.unset.push(o);
      }
    }
    return groups;
  }, [managedOutcomes]);
  const unifiedAssumptions = useMemo<UnifiedAssumption[]>(() => {
    const generated = (item?.assumptions ?? [])
      .map((assumption, index) => ({
        key: `generated-${index}-${assumption.assumption}`,
        origin: "generated" as const,
        assumption: String(assumption.assumption || "").trim(),
        evidence: String(assumption.note || assumption.outcome || "").trim(),
        status: assumption.tested ? "validated" : "untested",
        statusLabel: assumption.tested ? "Tested" : "Untested",
        statusTone: assumptionStatusTone(assumption.tested ? "validated" : "untested"),
        source: "public" as ProvenanceSource,
      }))
      .filter((assumption) => !hiddenGeneratedKeys.has(assumption.key));

    const submitted = strategicAssumptions.map((assumption) => ({
      key: `submitted-${assumption.id}`,
      origin: "submitted" as const,
      submittedId: assumption.id,
      assumption: String(assumption.assumption || "").trim(),
      evidence: String(assumption.note || "").trim(),
      status: assumption.status,
      statusLabel: assumptionStatusLabel(assumption.status),
      statusTone: assumptionStatusTone(assumption.status),
      source: assumption.source,
      createdAt: assumption.created_at,
      updatedAt: assumption.updated_at,
    }));

    return [...generated, ...submitted].filter((assumption) => assumption.assumption);
  }, [hiddenGeneratedKeys, item?.assumptions, strategicAssumptions]);

  const openAssumptionsCount = useMemo(
    () =>
      unifiedAssumptions.filter(
        (assumption) => assumption.status === "untested" || assumption.status === "validating",
      ).length,
    [unifiedAssumptions],
  );

  const capabilityGapCount = useMemo(
    () => (item?.capabilities ?? []).filter((cap) => cap.status === "gap").length,
    [item?.capabilities],
  );

  const focusProblemAgeDays = useMemo(() => {
    if (!currentFocusProblem) return 0;
    const ms = Number.isFinite(Date.parse(currentFocusProblem.problem.updated_at))
      ? Date.parse(currentFocusProblem.problem.updated_at)
      : Number.isFinite(Date.parse(currentFocusProblem.problem.created_at))
        ? Date.parse(currentFocusProblem.problem.created_at)
        : 0;
    return ms > 0 ? Math.max(0, (Date.now() - ms) / 86_400_000) : 0;
  }, [currentFocusProblem]);

  const filteredUnifiedAssumptions = useMemo(() => {
    if (assumptionViewFilter === "generated") {
      return unifiedAssumptions.filter((assumption) => assumption.origin === "generated");
    }
    if (assumptionViewFilter === "submitted") {
      return unifiedAssumptions.filter((assumption) => assumption.origin === "submitted");
    }
    return unifiedAssumptions;
  }, [assumptionViewFilter, unifiedAssumptions]);

  const handleAddStrategicProblem = async () => {
    try {
      await addProblem({ statement: newProblemText, source: newProblemSource });
      setNewProblemText("");
      setNewProblemSource("client");
      toast.success("Strategic problem captured.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save strategic problem.");
    }
  };

  const markReconciled = async (problem: StrategicProblem) => {
    const note = reconcileNoteById[problem.id] || "";
    try {
      await setProblemStatus(problem.id, "reconciled", note);
      toast.success("Marked as reconciled.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to reconcile strategic problem.");
    }
  };

  const reopenProblem = async (problem: StrategicProblem) => {
    try {
      await setProblemStatus(problem.id, "open", null);
      toast.success("Reopened strategic problem.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to reopen strategic problem.");
    }
  };

  const handleDeleteProblem = async (problem: StrategicProblem) => {
    const confirmed = window.confirm("Delete this strategic problem permanently?");
    if (!confirmed) return;
    try {
      await deleteProblem(problem.id);
      toast.success("Strategic problem deleted.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete strategic problem.");
    }
  };

  const toggleProblemExpanded = (id: string) => {
    setExpandedProblemIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleAddAssumption = async () => {
    const noteToSave = newAssumptionNote.trim() || suggestedEvidenceForNewAssumption;
    try {
      await addAssumption({
        assumption: newAssumptionText,
        source: newAssumptionSource,
        status: "untested",
        note: noteToSave,
      });
      setNewAssumptionText("");
      setNewAssumptionSource("client");
      setNewAssumptionNote("");
      toast.success("Assumption captured.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save assumption.");
    }
  };

  const beginAssumptionEdit = (assumption: UnifiedAssumption) => {
    setEditingAssumptionKey(assumption.key);
    setEditingDraft({
      assumption: assumption.assumption,
      evidence: assumption.evidence || suggestEvidenceNeeded(assumption.assumption),
      source: (assumption.source as StrategicAssumption["source"]) || "public",
      status: assumption.status,
    });
  };

  const cancelAssumptionEdit = () => {
    setEditingAssumptionKey(null);
    setEditingDraft(null);
  };

  const saveAssumptionEdit = async (assumption: UnifiedAssumption) => {
    if (!editingDraft) return;
    const draft = {
      assumption: editingDraft.assumption.trim(),
      evidence: editingDraft.evidence.trim(),
      source: editingDraft.source,
      status: editingDraft.status,
    };
    if (!draft.assumption) {
      toast.error("Assumption text cannot be empty.");
      return;
    }

    try {
      if (assumption.origin === "submitted" && assumption.submittedId) {
        await updateAssumption(assumption.submittedId, {
          assumption: draft.assumption,
          source: draft.source,
          status: draft.status,
          note: draft.evidence,
        });
        toast.success("Assumption updated.");
      } else {
        await addAssumption({
          assumption: draft.assumption,
          source: draft.source,
          status: draft.status,
          note: draft.evidence,
        });
        setHiddenGeneratedKeys((current) => {
          const next = new Set(current);
          next.add(assumption.key);
          return next;
        });
        toast.success("Generated assumption saved as submitted.");
      }
      cancelAssumptionEdit();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save assumption edit.");
    }
  };

  return (
    <div
      className="min-h-screen strategic-surface"
      style={{
        background: c.bg,
        backgroundImage:
          'url("data:image/svg+xml,%3Csvg width=\'6\' height=\'6\' viewBox=\'0 0 6 6\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'%23000\' fill-opacity=\'0.025\'%3E%3Cpath d=\'M5 0h1L0 5V4zM6 5v1H5z\'/%3E%3C/g%3E%3C/svg%3E")',
      }}
    >
      <TopNav />

      <main className="mx-auto max-w-[1120px] px-4 pb-12 pt-4 sm:px-6 md:px-8">
        <PageContextStatus lastScoredAt={activeCompany?.last_scored_at} sourceSignals={sourceSignals} />

        <div className="mb-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
              <p className="font-mono text-[10px] uppercase tracking-[0.12em]" style={{ color: "#9298B5" }}>
                Direction · {activeCompany?.name || "No company selected"} · Directional coherence
              </p>
              <Link
                to="/routes"
                className="font-mono text-[10px] uppercase tracking-[0.1em]"
                style={{ color: "#6a9e94", textDecoration: "underline", opacity: 0.7 }}
              >
                ← Commitment Review
              </Link>
            </div>
            {item && (
              <button
                type="button"
                onClick={() => setInspectOpen(true)}
                className="shrink-0 font-mono text-[10px] uppercase tracking-[0.08em] underline"
                style={{ color: c.muted, background: "none", border: "none", cursor: "pointer", padding: 0 }}
              >
                Inspect →
              </button>
            )}
          </div>
          <GenericAuditTraceNote
            active={auditMode}
            className="mt-3 max-w-4xl"
            source="strategy_cascades plus client-stated strategic problems, assumptions, and local alignment artifacts."
            evaluation="AI checks narrative coherence across aspiration, where-to-play, how-to-win, and evidence status from reconciled problem statements."
            scoring="Strategy context contributes to foundation constraints and downstream score ceilings in shared scoring logic."
            why="This makes it explicit when cascade guidance is evidence-backed versus template-like, so strategic language can be tightened."
          />
        </div>

        {!activeCompany?.id ? (
          <EmptyState message="Select a company to view its strategy cascade." />
        ) : (
          <div className="space-y-0">
            {item?.winning_aspiration && (() => {
              const hasWhere = Boolean(item.where_to_play);
              const hasHow   = Boolean(item.how_to_win);
              const stratHeadline =
                hasWhere && hasHow ? "Strategy cascade holds across all core dimensions."
                : hasWhere || hasHow ? "Strategic direction is defined — full cascade keeps reaching for coherence."
                : "Winning aspiration is set — direction and method remain open.";
              const stratContext = hasWhere && hasHow
                ? String(item.where_to_play ?? "").split(/\n/).filter(Boolean)[0]?.slice(0, 160) || ""
                : "Complete the where-to-play and how-to-win dimensions to lock in the full cascade.";
              return (
                <section style={{ paddingBottom: openProblemsCount > 0 ? 16 : 22, marginBottom: 4, borderBottom: `2px solid ${c.line}` }}>
                  <p className="font-mono text-[10px] uppercase tracking-[0.18em]" style={{ color: c.muted }}>
                    Strategy cascade · <span style={{ color: hasWhere && hasHow ? c.teal : c.muted }}>{hasWhere && hasHow ? "settled" : "settling"}</span>
                  </p>
                  <h2 className="mt-3 font-sans font-semibold leading-[1.25] max-w-3xl" style={{ fontSize: 36, color: c.charcoal }}>
                    {stratHeadline}
                  </h2>
                  {stratContext && (
                    <p className="mt-2 font-sans text-[14px] leading-[1.55] max-w-2xl" style={{ color: c.secondary }}>
                      {stratContext}
                    </p>
                  )}
                  <p className="mt-3 font-mono text-[10px]" style={{ color: c.muted, opacity: 0.7 }}>
                    Org capability signals: {sourceSignals.hasCompanyEvidence ? "active" : "incomplete"} · Research: {sourceSignals.hasPrimaryEvidence ? "active" : "none"}
                  </p>
                  {openProblemsCount > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className="font-mono text-[9px] uppercase tracking-[0.14em] px-2 py-[3px]" style={{ border: `1px solid ${c.line}`, color: c.muted }}>
                        {openProblemsCount} open {openProblemsCount === 1 ? "problem" : "problems"}
                      </span>
                    </div>
                  )}
                  <div className="mt-4" style={{ borderLeft: `3px solid ${c.teal}`, paddingLeft: 14 }}>
                    <p className="mb-1 font-mono text-[9px] uppercase tracking-[0.14em]" style={{ color: c.teal }}>Winning aspiration</p>
                    <p className="font-sans text-[17px] font-semibold leading-[1.4] max-w-3xl" style={{ color: c.charcoal }}>
                      {item.winning_aspiration}
                    </p>
                  </div>
                  {(hasWhere || hasHow) && (
                    <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 max-w-3xl">
                      {item.where_to_play && (
                        <div style={{ borderLeft: `2px solid ${c.lineFaint}`, paddingLeft: 12 }}>
                          <p className="mb-1.5 font-mono text-[9px] uppercase tracking-[0.12em]" style={{ color: c.muted }}>Where to play</p>
                          <p className="font-sans text-[13px] leading-[1.6]" style={{ color: c.secondary }}>
                            {String(item.where_to_play).split(/\n/).filter(Boolean)[0] || String(item.where_to_play).slice(0, 120)}
                          </p>
                        </div>
                      )}
                      {item.how_to_win && (
                        <div style={{
                          borderLeft: `2px solid ${c.lineFaint}`,
                          paddingLeft: 12,
                          opacity: capabilityGapCount > 0 ? 0.82 : 1,
                        }}>
                          <p className="mb-1.5 font-mono text-[9px] uppercase tracking-[0.12em]" style={{ color: c.muted }}>
                            How to win{capabilityGapCount > 0 ? " — capability gaps remain" : ""}
                          </p>
                          <p className="font-sans text-[13px] leading-[1.6]" style={{ color: c.secondary }}>
                            {String(item.how_to_win).split(/\n/).filter(Boolean)[0] || String(item.how_to_win).slice(0, 120)}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </section>
              );
            })()}

            {strategyTensions.length > 0 && (
              <section style={{ borderTop: `1px solid ${c.lineFaint}`, paddingTop: 16, paddingBottom: 16 }}>
                <TensionBlock tensions={strategyTensions} context="strategy" />
              </section>
            )}

            {activeCompany?.id && (
              <StrategicDirectionDelta companyId={activeCompany.id} />
            )}

            <section style={{ borderTop: `1px solid ${c.line}`, paddingTop: 32, paddingBottom: 24 }}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  {sectionLabel("Problems in Play")}
                  <p className="mt-2 max-w-4xl font-sans text-[13px] mojo-desc" style={{ color: c.muted }}>
                    Problems actively shaping decisions. One focus problem at a time — reconcile when evidence resolves or reframes it.
                  </p>
                </div>
                <span className="font-mono text-[10px] uppercase tracking-[0.1em]" style={{ color: c.muted, opacity: 0.7 }}>
                  {openProblemsCount} open
                </span>
              </div>
              <div className="mt-4" style={{ borderLeft: `2px solid ${c.line}`, paddingLeft: 14, paddingTop: 8, paddingBottom: 8, opacity: 0.82 }}>
                <p className="font-mono text-[10px] uppercase tracking-[0.10em]" style={{ color: c.muted, opacity: 0.75 }}>
                  What reconciliation means
                </p>
                <p className="mt-1.5 font-sans text-[13px] leading-[1.65]" style={{ color: c.secondary }}>
                  <span className="font-semibold" style={{ color: c.charcoal }}>Open (In play):</span> this problem is
                  still unresolved and should influence strategy decisions now.
                </p>
                <p className="mt-1 font-sans text-[13px] leading-[1.65]" style={{ color: c.secondary }}>
                  <span className="font-semibold" style={{ color: c.charcoal }}>Reconciled (Closed):</span> evidence has
                  resolved, reframed, or merged this problem for now. You can reopen it any time if new evidence shows up.
                </p>
              </div>
              {currentFocusProblem ? (
                <div className="mt-4" style={{ borderLeft: `2px solid ${c.teal}`, paddingLeft: 14, paddingTop: focusProblemAgeDays > 45 ? 20 : 16, paddingBottom: focusProblemAgeDays > 45 ? 20 : 16 }}>
                  <p className="font-mono text-[10px] uppercase tracking-[0.10em]" style={{ color: c.teal }}>
                    Current focus problem (evidence-led)
                  </p>
                  <p className="mt-2 font-sans text-[16px] font-semibold leading-[1.45]" style={{ color: c.charcoal }}>
                    {currentFocusProblem.title}
                  </p>
                  <p className="mt-1 font-sans text-[13px] leading-[1.65]" style={{ color: c.secondary }}>
                    {currentFocusProblem.summary}
                  </p>
                  <p className="mt-2 font-sans text-[12px] leading-[1.65]" style={{ color: c.secondary }}>
                    <span className="font-mono text-[10px] uppercase tracking-[0.08em]">Why this now:</span>{" "}
                    {currentFocusProblem.whyNow}.
                  </p>
                  <p className="mt-1 font-sans text-[12px] leading-[1.65]" style={{ color: c.secondary }}>
                    <span className="font-mono text-[10px] uppercase tracking-[0.08em]" style={{ opacity: 0.65 }}>The ask:</span>{" "}
                    {currentFocusProblem.decisionAsk}
                  </p>
                </div>
              ) : (
                <div className="mt-4" style={{ borderLeft: `2px solid ${c.lineFaint}`, paddingLeft: 14, paddingTop: 8, paddingBottom: 8 }}>
                  <p className="font-mono text-[10px] uppercase tracking-[0.10em]" style={{ color: c.muted, opacity: 0.75 }}>
                    Current focus problem (evidence-led)
                  </p>
                  <p className="mt-1.5 font-sans text-[13px] leading-[1.65]" style={{ color: c.secondary }}>
                    Add at least one open strategic problem to identify the single problem we should focus on first.
                  </p>
                </div>
              )}

              {strategicProblemsTableMissing ? (
                <p className="mt-4 font-sans text-[13px]" style={{ color: c.secondary }}>
                  Strategic problem capture table is not available yet in this environment. Run latest migrations to enable it.
                </p>
              ) : (
                <>
                  <div className="mt-5" style={{ borderTop: `1px solid ${c.lineFaint}`, paddingTop: 16 }}>
                    <p className="font-mono text-[10px] uppercase tracking-[0.10em]" style={{ color: c.muted, opacity: 0.6 }}>
                      Record a problem
                    </p>
                    <textarea
                      className="mt-3 w-full border px-3 py-2 font-sans text-[14px] outline-none"
                      style={{ borderColor: c.line, background: "#fff", color: c.charcoal }}
                      rows={3}
                      value={newProblemText}
                      placeholder="Example: We are not clear which audience and category to prioritize for growth."
                      onChange={(event) => setNewProblemText(event.target.value)}
                    />
                    <div className="mt-2 flex flex-wrap items-center gap-3">
                      <select
                        className="border px-2 py-1.5 font-mono text-[11px] uppercase tracking-[0.08em]"
                        style={{ borderColor: c.line, color: c.secondary, background: "#fff" }}
                        value={newProblemSource}
                        onChange={(event) => setNewProblemSource(event.target.value as StrategicProblem["source"])}
                      >
                        <option value="client">Client</option>
                        <option value="intake">Intake</option>
                        <option value="company">Company</option>
                        <option value="public">Public</option>
                        <option value="evidence">Evidence</option>
                      </select>
                      <button
                        type="button"
                        onClick={handleAddStrategicProblem}
                        disabled={strategicProblemSaving}
                        className="border px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.08em] disabled:opacity-50"
                        style={{ borderColor: c.line, color: c.secondary, background: "#fff" }}
                      >
                        {strategicProblemSaving ? "Saving..." : "Record"}
                      </button>
                    </div>
                  </div>

                  {problemsLoading ? (
                    <p className="mt-4 font-sans text-[13px]" style={{ color: c.secondary }}>
                      Loading strategic problems...
                    </p>
                  ) : strategicProblemsError ? (
                    <p className="mt-4 font-sans text-[13px]" style={{ color: c.coral }}>
                      Failed to load strategic problems: {strategicProblemsError}
                    </p>
                  ) : strategicProblems.length === 0 ? (
                    <p className="mt-4 font-sans text-[13px]" style={{ color: c.secondary }}>
                      No client-stated strategic problems captured yet.
                    </p>
                  ) : (
                    <div className="mt-4 space-y-3">
                      {strategicProblemCards.map((entry) => {
                        const { problem, title, summary, decisionAsk } = entry;
                        const sourceStyle = sourceTone(problem.source);
                        const statusStyle = problemStatusTone(problem.status);
                        const expanded = expandedProblemIds.has(problem.id);
                        const inactive = problem.status === "reconciled";
                        return (
                          <div
                            key={problem.id}
                            style={{
                              borderLeft: `2px solid ${statusStyle.fg}60`,
                              paddingLeft: 14,
                              paddingTop: inactive ? 8 : 14,
                              paddingBottom: inactive ? 8 : 14,
                              opacity: inactive ? 0.58 : 1,
                            }}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="font-sans text-[14px] font-semibold leading-[1.4]" style={{ color: c.charcoal }}>
                                  {title}
                                </p>
                                <p className="mt-1 font-sans text-[13px] leading-[1.6]" style={{ color: c.secondary }}>
                                  {summary}
                                </p>
                                <p className="mt-1 font-sans text-[12px] leading-[1.55]" style={{ color: c.muted }}>
                                  <span className="font-mono text-[10px] uppercase tracking-[0.08em]" style={{ opacity: 0.65 }}>The ask:</span>{" "}
                                  {decisionAsk}
                                </p>
                                <div className="mt-2 flex flex-wrap items-center gap-3">
                                  <span
                                    className="font-mono text-[9px] uppercase tracking-[0.08em]"
                                    style={{ color: sourceStyle.fg }}
                                  >
                                    {sourceLabel(problem.source)}
                                  </span>
                                  <span
                                    className="font-mono text-[9px] uppercase tracking-[0.08em]"
                                    style={{ color: statusStyle.fg }}
                                  >
                                    {statusStyle.label}
                                  </span>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => toggleProblemExpanded(problem.id)}
                                className="shrink-0 font-mono text-[9px] uppercase tracking-[0.08em] underline"
                                style={{ color: c.muted, background: "none", border: "none", cursor: "pointer", padding: 0 }}
                              >
                                {expanded ? "Collapse" : "Expand"}
                              </button>
                            </div>

                            {expanded ? (
                              <div className="mt-3">
                                <p className="font-sans text-[14px] leading-[1.6]" style={{ color: c.charcoal }}>
                                  {problem.statement}
                                </p>

                                {problem.reconciliation_note ? (
                                  <p className="mt-2 font-sans text-[12px] leading-[1.6]" style={{ color: c.secondary }}>
                                    Reconciliation note: {problem.reconciliation_note}
                                  </p>
                                ) : null}

                                <div className="mt-3 flex flex-wrap items-center gap-2">
                                  {problem.status === "reconciled" ? (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() => reopenProblem(problem)}
                                        disabled={reconcilingId === problem.id || deletingId === problem.id}
                                        className="rounded-md border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.08em] disabled:opacity-50"
                                        style={{ borderColor: c.line, color: c.secondary, background: "#fff" }}
                                      >
                                        {reconcilingId === problem.id ? "Saving..." : "Reopen"}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleDeleteProblem(problem)}
                                        disabled={deletingId === problem.id || reconcilingId === problem.id}
                                        className="rounded-md border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.08em] disabled:opacity-50"
                                        style={{ borderColor: "#F1C3AC", color: c.coral, background: "#fff" }}
                                      >
                                        {deletingId === problem.id ? "Deleting..." : "Delete"}
                                      </button>
                                    </>
                                  ) : (
                                    <>
                                      <input
                                        value={reconcileNoteById[problem.id] || ""}
                                        onChange={(event) =>
                                          setReconcileNoteById((current) => ({
                                            ...current,
                                            [problem.id]: event.target.value,
                                          }))
                                        }
                                        placeholder="Optional: what evidence resolved this, or how it was merged/reframed"
                                        className="min-w-[260px] flex-1 rounded-md border px-2.5 py-1.5 font-sans text-[12px] outline-none"
                                        style={{ borderColor: c.line, background: "#fff", color: c.secondary }}
                                      />
                                      <button
                                        type="button"
                                        onClick={() => markReconciled(problem)}
                                        disabled={reconcilingId === problem.id || deletingId === problem.id}
                                        className="rounded-md border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.08em] disabled:opacity-50"
                                        style={{ borderColor: c.line, color: c.secondary, background: "#fff" }}
                                      >
                                        {reconcilingId === problem.id ? "Saving..." : "Mark Reconciled (Close)"}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleDeleteProblem(problem)}
                                        disabled={deletingId === problem.id || reconcilingId === problem.id}
                                        className="rounded-md border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.08em] disabled:opacity-50"
                                        style={{ borderColor: "#F1C3AC", color: c.coral, background: "#fff" }}
                                      >
                                        {deletingId === problem.id ? "Deleting..." : "Delete"}
                                      </button>
                                    </>
                                  )}
                                </div>
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </section>

            <section style={{ borderTop: `1px solid ${c.line}`, paddingTop: 22, paddingBottom: 24 }}>
              <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                <div>
                  {sectionLabel("Desired Outcomes")}
                  <p className="mt-2.5 max-w-4xl font-sans text-[14px] mojo-desc" style={{ color: c.secondary }}>
                    Outcomes anchor opportunities, route choices, and score movement. Each outcome must describe a measurable change in behavior — who does what differently, and when.
                  </p>
                </div>
                <span className="font-mono text-[9px] uppercase tracking-[0.12em]" style={{ color: c.muted, opacity: 0.55 }}>{managedOutcomes.length} {managedOutcomes.length !== 1 ? "outcomes" : "outcome"}</span>
              </div>

              {/* Outcome list */}
              {managedOutcomes.length === 0 && !outcomeFormOpen ? (
                <p className="font-sans text-[13px] mb-4" style={{ color: c.secondary }}>
                  No desired outcomes yet.
                </p>
              ) : (
                <div className="space-y-5 mb-4">
                  {(["primary", "secondary", "tertiary", "unset"] as const).map((lvl) => {
                    const items = outcomesByLevel[lvl];
                    if (!items.length) return null;
                    const meta = lvl !== "unset" ? OUTCOME_LEVEL_META[lvl as OutcomeLevel] : null;
                    const levelAccent =
                      lvl === "primary" ? c.coral :
                      lvl === "secondary" ? c.teal :
                      lvl === "tertiary" ? c.amber :
                      c.muted;

                    return (
                      <div key={lvl}>
                        <div className="flex items-center gap-2 mb-2">
                          <div className="h-[3px] w-5 rounded-full" style={{ background: levelAccent }} />
                          <p className="font-mono text-[10px] uppercase tracking-[0.1em] font-semibold" style={{ color: levelAccent }}>
                            {meta ? meta.shortLabel : "Unclassified"}
                          </p>
                          {meta && (
                            <p className="font-sans text-[11px]" style={{ color: c.muted }}>
                              — {meta.problem}
                            </p>
                          )}
                        </div>

                        <div className="space-y-0">
                          {items.map((outcome) => {
                            const structured = isFullyStructured(outcome);
                            const isEditing = outcomeFormOpen && editingOutcomeId === outcome.id;
                            return (
                              <div
                                key={outcome.id}
                                style={{
                                  borderLeft: `2px solid ${isEditing ? c.teal : levelAccent}60`,
                                  paddingLeft: 14, paddingTop: 14, paddingBottom: 14, marginBottom: 8,
                                }}
                              >
                                {isEditing ? null : (
                                  <>
                                    {/* Statement + edit button */}
                                    <div className="flex items-start justify-between gap-3">
                                      <p className="font-sans text-[15px] font-semibold leading-[1.45]" style={{ color: c.charcoal }}>
                                        {outcome.outcome_statement || outcome.outcome_title}
                                      </p>
                                      <button
                                        type="button"
                                        onClick={() => openEditOutcome(outcome.id)}
                                        className="shrink-0 font-mono text-[9px] uppercase tracking-[0.08em] underline hover:opacity-70"
                                        style={{ color: c.muted, background: "none", border: "none", cursor: "pointer", padding: 0 }}
                                      >
                                        Edit
                                      </button>
                                    </div>

                                    {/* Behavior-first breakdown */}
                                    {(outcome.actor || outcome.action) ? (
                                      <div className="mt-2 flex flex-wrap gap-4">
                                        {outcome.actor && (
                                          <div>
                                            <p className="font-mono text-[9px] uppercase tracking-[0.1em]" style={{ color: c.muted, opacity: 0.75 }}>Actor</p>
                                            <p className="font-sans text-[13px] mt-0.5" style={{ color: c.charcoal }}>{outcome.actor}</p>
                                          </div>
                                        )}
                                        {outcome.action && (
                                          <div>
                                            <p className="font-mono text-[9px] uppercase tracking-[0.1em]" style={{ color: c.muted, opacity: 0.75 }}>Action</p>
                                            <p className="font-sans text-[13px] mt-0.5" style={{ color: c.charcoal }}>{outcome.action}</p>
                                          </div>
                                        )}
                                      </div>
                                    ) : (
                                      <div className="mt-2" style={{ borderLeft: `2px solid ${c.coral}60`, paddingLeft: 10 }}>
                                        <p className="font-mono text-[9px] uppercase tracking-[0.1em]" style={{ color: c.coral }}>Behavior-first rule not met</p>
                                        <p className="font-sans text-[12px] mt-0.5" style={{ color: c.secondary }}>
                                          Add Actor and Action to anchor this outcome to observable behavior.
                                        </p>
                                      </div>
                                    )}

                                    {/* Detail */}
                                    <div className="mt-2 space-y-1">
                                      <p className="font-sans text-[12px]" style={{ color: c.secondary }}>
                                        <span className="font-semibold" style={{ color: c.charcoal }}>Leading indicator:</span>{" "}
                                        {outcome.leading_indicator || outcome.metric || "—"}
                                      </p>
                                      {outcome.context && (
                                        <p className="font-sans text-[12px]" style={{ color: c.secondary }}>
                                          <span className="font-semibold" style={{ color: c.charcoal }}>Context:</span>{" "}
                                          {outcome.context}
                                        </p>
                                      )}
                                      {outcome.constraint && (
                                        <p className="font-sans text-[12px]" style={{ color: c.secondary }}>
                                          <span className="font-semibold" style={{ color: c.charcoal }}>Constraint:</span>{" "}
                                          {outcome.constraint}
                                        </p>
                                      )}
                                    </div>

                                    {/* Status tags */}
                                    <div className="mt-2 flex flex-wrap items-center gap-3">
                                      <span className="font-mono text-[9px] uppercase tracking-[0.08em]" style={{ color: structured ? c.teal : c.coral }}>
                                        {structured ? "Behavior-first ✓" : "Incomplete"}
                                      </span>
                                      {outcome.is_primary && (
                                        <span className="font-mono text-[9px] uppercase tracking-[0.08em]" style={{ color: c.muted }}>
                                          Primary anchor
                                        </span>
                                      )}
                                      {outcome.confidence != null && (
                                        <span className="font-mono text-[9px] uppercase tracking-[0.08em]" style={{ color: c.muted }}>
                                          Confidence {outcome.confidence}/100
                                        </span>
                                      )}
                                    </div>
                                  </>
                                )}

                                {/* Inline edit form */}
                                {isEditing && (
                                  <OutcomeForm
                                    draft={outcomeDraft}
                                    preview={outcomeSentencePreview}
                                    saving={outcomeSaving}
                                    mode="edit"
                                    onChange={setOutcomeDraft}
                                    onSave={saveOutcome}
                                    onCancel={cancelOutcomeForm}
                                  />
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Add form */}
              {outcomeFormOpen && !editingOutcomeId && (
                <div
                  className="mb-4"
                  style={{ borderLeft: `2px solid ${c.teal}`, paddingLeft: 14, paddingTop: 12, paddingBottom: 12 }}
                >
                  <p className="font-mono text-[10px] uppercase tracking-[0.10em] mb-3" style={{ color: c.teal }}>
                    New outcome
                  </p>
                  <OutcomeForm
                    draft={outcomeDraft}
                    preview={outcomeSentencePreview}
                    saving={outcomeSaving}
                    mode="add"
                    onChange={setOutcomeDraft}
                    onSave={saveOutcome}
                    onCancel={cancelOutcomeForm}
                  />
                </div>
              )}

              {/* Add button */}
              {!outcomeFormOpen && (
                <button
                  type="button"
                  onClick={openAddOutcome}
                  className="font-mono text-[11px] uppercase tracking-[0.08em] underline hover:opacity-70"
                  style={{ color: c.teal, background: "none", border: "none", cursor: "pointer", padding: 0 }}
                >
                  <span>+</span>
                  <span>Add Outcome</span>
                </button>
              )}
            </section>

            {activeCompany?.id ? (
              <div className="my-5">
                <AreaAlignmentPanel
                  title="Strategy"
                  area={strategyAlignment}
                  run={localAlignment}
                  lineColor={c.line}
                  panelColor={c.panel}
                  textColor={c.charcoal}
                  mutedColor={c.muted}
                />
              </div>
            ) : null}

            {connector()}

            {loading ? (
              <EmptyState message="Loading strategy cascade…" />
            ) : error ? (
              <EmptyState message={`Failed to load strategy cascade: ${error}`} />
            ) : !item ? (
              <div className="py-8">
                <p className="font-sans text-[14px]" style={{ color: c.muted }}>
                  No strategy cascade yet.
                </p>
                <p className="mt-1 font-sans text-[13px]" style={{ color: c.muted }}>
                  Run AI Research from the Admin panel to generate the full cascade.
                </p>
                <Link
                  to="/admin/companies"
                  className="mt-3 inline-block font-mono text-[11px] uppercase tracking-[0.08em] underline"
                  style={{ color: c.teal }}
                >
                  Go to Admin → Companies
                </Link>
              </div>
            ) : (
              <>
                <NarrativeBlock
                  label="Winning Aspiration"
                  text={item.winning_aspiration}
                  emptyText="No winning aspiration generated yet."
                  saving={savingField === "winning_aspiration"}
                  sectionPaddingTop={36}
                  sectionPaddingBottom={32}
                  claimId={cascadeClaims.winning_aspiration?.id ?? null}
                  claimState={cascadeClaims.winning_aspiration?.state ?? null}
                  onAcceptSuggestion={(suggested) =>
                    applyClaritySuggestion("winning_aspiration", suggested, "accept")
                  }
                  onIgnoreSuggestion={(primary) =>
                    applyClaritySuggestion("winning_aspiration", primary, "ignore")
                  }
                />

                {connector(capabilityGapCount > 0)}

                <div className="grid grid-cols-1 gap-x-10 gap-y-0 lg:grid-cols-[56%_44%]">
                  <NarrativeBlock
                    label="Where To Play"
                    text={item.where_to_play}
                    emptyText="No where-to-play definition generated yet."
                    saving={savingField === "where_to_play"}
                    sectionPaddingTop={20}
                    sectionPaddingBottom={14}
                    claimId={cascadeClaims.where_to_play?.id ?? null}
                    claimState={cascadeClaims.where_to_play?.state ?? null}
                    onAcceptSuggestion={(suggested) =>
                      applyClaritySuggestion("where_to_play", suggested, "accept")
                    }
                    onIgnoreSuggestion={(primary) =>
                      applyClaritySuggestion("where_to_play", primary, "ignore")
                    }
                  />
                  <NarrativeBlock
                    label="How To Win"
                    text={item.how_to_win}
                    emptyText="No how-to-win logic generated yet."
                    coherenceNote={capabilityGapCount > 0 ? `${capabilityGapCount} required ${capabilityGapCount === 1 ? "capability gap remains" : "capability gaps remain"} unresolved` : null}
                    textOpacity={capabilityGapCount > 0 ? 0.84 : 1}
                    saving={savingField === "how_to_win"}
                    sectionPaddingTop={20}
                    sectionPaddingBottom={14}
                    claimId={cascadeClaims.how_to_win?.id ?? null}
                    claimState={cascadeClaims.how_to_win?.state ?? null}
                    onAcceptSuggestion={(suggested) =>
                      applyClaritySuggestion("how_to_win", suggested, "accept")
                    }
                    onIgnoreSuggestion={(primary) =>
                      applyClaritySuggestion("how_to_win", primary, "ignore")
                    }
                  />
                </div>

                {connector(capabilityGapCount > 0)}

                <GridSection
                  label="Required Capabilities"
                  items={item.capabilities}
                  sectionPaddingTop={32 + Math.min(capabilityGapCount * 4, 16)}
                  onUpdate={async (updated) => {
                    try {
                      await updateListField("capabilities_json", updated);
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : "Failed to update capabilities.");
                    }
                  }}
                />

                {connector()}

                <GridSection
                  label="Management Systems"
                  items={item.management_systems}
                  sectionPaddingTop={18}
                  sectionPaddingBottom={12}
                  onUpdate={async (updated) => {
                    try {
                      await updateListField("management_systems_json", updated);
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : "Failed to update management systems.");
                    }
                  }}
                />

                {connector()}

                <section style={{ borderTop: `1px solid ${c.line}`, paddingTop: 32, paddingBottom: 24 }}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      {sectionLabel("Assumptions Snapshot", 0.72)}
                      <p className="mt-2 max-w-4xl font-sans text-[13px] leading-[1.7]" style={{ color: c.muted }}>
                        Research-generated and team-submitted assumptions in one view. Validate or invalidate to sharpen the strategy signal.
                      </p>
                    </div>
                    <span className="font-mono text-[10px] uppercase tracking-[0.1em]" style={{ color: c.muted, opacity: 0.6 }}>
                      {openAssumptionsCount} untested
                    </span>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-5" style={{ borderBottom: `1px solid ${c.lineFaint}`, paddingBottom: 0 }}>
                    {([
                      { key: "all", label: "All" },
                      { key: "generated", label: "Research-generated" },
                      { key: "submitted", label: "Team-submitted" },
                    ] as Array<{ key: AssumptionViewFilter; label: string }>).map((filter) => {
                      const selected = assumptionViewFilter === filter.key;
                      return (
                        <button
                          key={filter.key}
                          type="button"
                          onClick={() => setAssumptionViewFilter(filter.key)}
                          className="font-mono text-[9px] uppercase tracking-[0.1em]"
                          style={{
                            paddingBottom: 8,
                            borderBottomWidth: selected ? 1 : 0,
                            borderBottomStyle: "solid",
                            borderBottomColor: c.teal,
                            color: selected ? c.teal : c.muted,
                            opacity: selected ? 1 : 0.72,
                            background: "none", border: "none", borderBottom: selected ? `1px solid ${c.teal}` : "1px solid transparent", cursor: "pointer", padding: "0 0 8px 0",
                          }}
                        >
                          {filter.label}
                        </button>
                      );
                    })}
                  </div>

                  {filteredUnifiedAssumptions.length === 0 ? (
                    <p className="mt-4 font-sans text-[13px]" style={{ color: c.secondary }}>
                      {assumptionViewFilter === "generated"
                        ? "No generated assumptions yet."
                        : assumptionViewFilter === "submitted"
                          ? "No submitted assumptions yet."
                          : "No assumptions captured yet."}
                    </p>
                  ) : (
                    <div className="mt-4 space-y-3">
                      {filteredUnifiedAssumptions.map((assumption) => (
                        <UnifiedAssumptionCard
                          key={assumption.key}
                          item={assumption}
                          isEditing={editingAssumptionKey === assumption.key}
                          editDraft={editingDraft}
                          onEdit={() => beginAssumptionEdit(assumption)}
                          onCancelEdit={cancelAssumptionEdit}
                          onDraftChange={setEditingDraft}
                          onSaveEdit={() => saveAssumptionEdit(assumption)}
                          isSaving={
                            strategicAssumptionSaving ||
                            (assumption.origin === "submitted" &&
                              !!assumption.submittedId &&
                              assumptionUpdatingId === assumption.submittedId)
                          }
                        />
                      ))}
                    </div>
                  )}

                  {assumptionsLoading ? (
                    <p className="mt-3 font-sans text-[12px]" style={{ color: c.muted }}>
                      Loading submitted assumptions...
                    </p>
                  ) : null}

                  <div className="mt-5 border-t pt-4" style={{ borderColor: c.lineFaint }}>
                    <button
                      type="button"
                      onClick={() => setAssumptionsEditorOpen((open) => !open)}
                      className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.08em] underline"
                      style={{ color: c.teal, background: "none", border: "none", cursor: "pointer", padding: 0 }}
                    >
                      <span>{assumptionsEditorOpen ? "Hide Add Assumption" : "Add Assumption"}</span>
                      <span>{assumptionsEditorOpen ? "−" : "+"}</span>
                    </button>

                    {assumptionsEditorOpen ? (
                      <div className="mt-4">
                        {strategicAssumptionsTableMissing ? (
                          <p className="font-sans text-[13px]" style={{ color: c.secondary }}>
                            Assumptions table is not available yet in this environment. Run latest migrations to enable it.
                          </p>
                        ) : (
                          <>
                            <div style={{ borderTop: `1px solid ${c.lineFaint}`, paddingTop: 16 }}>
                              <p className="font-mono text-[10px] uppercase tracking-[0.12em]" style={{ color: c.muted }}>
                                Add Assumption
                              </p>
                              <textarea
                                className="mt-3 w-full rounded-[14px] border px-3 py-2 font-sans text-[14px] outline-none"
                                style={{ borderColor: c.line, background: "#fff", color: c.charcoal }}
                                rows={3}
                                value={newAssumptionText}
                                placeholder="Example: Families will switch providers if referral friction is reduced."
                                onChange={(event) => setNewAssumptionText(event.target.value)}
                              />
                              {suggestedEvidenceForNewAssumption ? (
                                <div
                                  className="mt-3"
                                  style={{ borderLeft: `2px solid ${c.lineFaint}`, paddingLeft: 12, paddingTop: 8, paddingBottom: 8 }}
                                >
                                  <p className="font-mono text-[10px] uppercase tracking-[0.1em]" style={{ color: c.muted }}>
                                    Suggested Evidence Needed
                                  </p>
                                  <p className="mt-1 font-sans text-[12px] leading-[1.55]" style={{ color: c.secondary }}>
                                    {suggestedEvidenceForNewAssumption}
                                  </p>
                                  <button
                                    type="button"
                                    onClick={() => setNewAssumptionNote(suggestedEvidenceForNewAssumption)}
                                    className="mt-2 font-mono text-[10px] uppercase tracking-[0.08em] underline"
                                    style={{ color: c.teal, background: "none", border: "none", cursor: "pointer", padding: 0 }}
                                  >
                                    Use Suggestion
                                  </button>
                                </div>
                              ) : null}
                              <input
                                className="mt-3 w-full rounded-[14px] border px-3 py-2 font-sans text-[13px] outline-none"
                                style={{ borderColor: c.line, background: "#fff", color: c.secondary }}
                                value={newAssumptionNote}
                                placeholder="Evidence needed (editable)"
                                onChange={(event) => setNewAssumptionNote(event.target.value)}
                              />
                              <div className="mt-3 flex flex-wrap items-center gap-2">
                                <select
                                  className="rounded-md border px-2 py-1.5 font-mono text-[11px] uppercase tracking-[0.08em]"
                                  style={{ borderColor: c.line, color: c.secondary, background: "#fff" }}
                                  value={newAssumptionSource}
                                  onChange={(event) => setNewAssumptionSource(event.target.value as StrategicAssumption["source"])}
                                >
                                  <option value="client">Client</option>
                                  <option value="intake">Intake</option>
                                  <option value="company">Company</option>
                                  <option value="public">Public</option>
                                  <option value="evidence">Evidence</option>
                                </select>
                                <button
                                  type="button"
                                  onClick={handleAddAssumption}
                                  disabled={strategicAssumptionSaving}
                                  className="rounded-md border px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.08em] disabled:opacity-50"
                                  style={{ borderColor: c.line, color: c.secondary, background: c.paper }}
                                >
                                  {strategicAssumptionSaving ? "Saving..." : "Add Assumption"}
                                </button>
                              </div>
                            </div>
                            {strategicAssumptionsError ? (
                              <p className="mt-4 font-sans text-[13px]" style={{ color: c.coral }}>
                                Failed to load assumptions: {strategicAssumptionsError}
                              </p>
                            ) : null}
                          </>
                        )}
                      </div>
                    ) : null}
                  </div>
                </section>
              </>
            )}
          </div>
        )}
      </main>

      <StrategyInspectPanel
        open={inspectOpen}
        onClose={() => setInspectOpen(false)}
        cascade={item}
        frameworksUsed={frameworksUsed}
        signals={sourceSignals}
      />
    </div>
  );
}
