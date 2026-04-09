import { useMemo, useState } from "react";
import TopNav from "@/components/layout/TopNav";
import { useCompany } from "@/hooks/useCompany";
import { useStrategyCascade } from "@/hooks/useStrategyCascade";
import { useStrategicProblems, type StrategicProblem } from "@/hooks/useStrategicProblems";
import { useStrategicAssumptions, type StrategicAssumption } from "@/hooks/useStrategicAssumptions";
import { useLatestLocalAlignment } from "@/hooks/useLocalAlignment";
import { useSourceConfidence } from "@/hooks/useSourceConfidence";
import { MetaBadge } from "@/components/ui/semantic-badges";
import { AreaAlignmentPanel } from "@/components/alignment/AreaAlignmentPanel";
import PageContextStatus from "@/components/layout/PageContextStatus";
import GenericAuditTraceNote from "@/components/diagnostics/GenericAuditTraceNote";
import type { CascadeItem } from "@/lib/types";
import { isGenericAuditCompany } from "@/lib/genericAudit";
import { parseClaritySuggestion } from "@/lib/text/claritySuggestion";
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

function sectionLabel(text: string) {
  return (
    <div
      className="font-mono text-[10px] uppercase tracking-[0.14em]"
      style={{ color: c.muted }}
    >
      {text}
    </div>
  );
}

function connector() {
  return (
    <div className="flex justify-center py-2">
      <div className="flex flex-col items-center">
        <div className="h-5 w-px" style={{ background: c.line }} />
        <div className="font-sans text-[18px] leading-none" style={{ color: c.amber }}>
          ↓
        </div>
      </div>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div
      className="rounded-[24px] border px-6 py-12 text-center"
      style={{ borderColor: c.line, background: c.panel }}
    >
      <p className="font-sans text-[15px]" style={{ color: c.secondary }}>
        {message}
      </p>
    </div>
  );
}

function NarrativeBlock({
  label,
  text,
  emptyText,
  saving,
  onAcceptSuggestion,
  onIgnoreSuggestion,
}: {
  label: string;
  text: string;
  emptyText: string;
  saving?: boolean;
  onAcceptSuggestion?: (suggested: string) => void | Promise<void>;
  onIgnoreSuggestion?: (primary: string) => void | Promise<void>;
}) {
  const parsed = parseClaritySuggestion(text);
  const renderedText = parsed.primary || emptyText;

  return (
    <section
      className="rounded-[24px] border px-5 py-5 sm:px-6"
      style={{ borderColor: c.line, background: c.panel }}
    >
      {sectionLabel(label)}
      <p
        className="mt-3 font-sans text-[15px] leading-[1.9] sm:text-[16px]"
        style={{ color: c.charcoal }}
      >
        {renderedText}
      </p>
      {parsed.suggested ? (
        <div className="mt-4 rounded-[16px] border px-4 py-3" style={{ borderColor: c.line, background: c.paper }}>
          <p className="font-mono text-[10px] uppercase tracking-[0.1em]" style={{ color: c.muted }}>
            Suggested clearer version
          </p>
          <p className="mt-2 font-sans text-[14px] leading-[1.7]" style={{ color: c.secondary }}>
            {parsed.suggested}
          </p>
          {onAcceptSuggestion && onIgnoreSuggestion ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => onAcceptSuggestion(parsed.suggested!)}
                disabled={!!saving}
                className="rounded-md border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.08em] disabled:opacity-50"
                style={{ borderColor: c.line, color: c.secondary, background: "#fff" }}
              >
                Accept Suggestion
              </button>
              <button
                type="button"
                onClick={() => onIgnoreSuggestion(parsed.primary)}
                disabled={!!saving}
                className="rounded-md border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.08em] disabled:opacity-50"
                style={{ borderColor: c.line, color: c.secondary, background: "#fff" }}
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

function CapabilityCard({ item }: { item: CascadeItem }) {
  const tone = statusTone(item.status);

  return (
    <div
      className="rounded-[18px] border p-4"
      style={{ borderColor: c.line, background: c.paper }}
    >
      <p className="font-sans text-[15px] font-semibold leading-[1.45]" style={{ color: c.charcoal }}>
        {item.name}
      </p>
      <p
        className="mt-3 font-mono text-[10px] uppercase tracking-[0.1em]"
        style={{ color: tone.dot }}
      >
        {tone.text}
      </p>
      {item.note ? (
        <p className="mt-2 font-sans text-[12px] leading-[1.55]" style={{ color: c.secondary }}>
          {item.note}
        </p>
      ) : null}
    </div>
  );
}

function GridSection({
  label,
  items,
}: {
  label: string;
  items: CascadeItem[];
}) {
  return (
    <section
      className="rounded-[24px] border px-5 py-5 sm:px-6"
      style={{ borderColor: c.line, background: c.panel }}
    >
      {sectionLabel(label)}
      <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">
        {items.map((item, index) => (
          <CapabilityCard key={`${label}-${item.name}-${index}`} item={item} />
        ))}
      </div>
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
  return (
    <div
      className="rounded-[18px] border p-4"
      style={{ borderColor: c.line, background: c.paper }}
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
          <div className="rounded-[10px] border px-2.5 py-2" style={{ borderColor: c.lineFaint, background: "#F9FBF7" }}>
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
            <p className="font-sans text-[15px] leading-[1.5]" style={{ color: c.charcoal }}>
              {item.assumption}
            </p>
            <div className="flex flex-wrap items-center justify-end gap-1.5">
              <span
                className="rounded-full border px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em]"
                style={{ borderColor: originStyle.border, background: originStyle.bg, color: originStyle.fg }}
              >
                {originStyle.label}
              </span>
              {sourceStyle ? (
                <span
                  className="rounded-full border px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em]"
                  style={{ borderColor: sourceStyle.border, background: sourceStyle.bg, color: sourceStyle.fg }}
                >
                  {sourceLabel(item.source!)}
                </span>
              ) : null}
              <span
                className="rounded-full border px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em]"
                style={{ borderColor: item.statusTone.border, background: item.statusTone.bg, color: item.statusTone.fg }}
              >
                {item.statusLabel}
              </span>
              <button
                type="button"
                onClick={onEdit}
                className="rounded-md border px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em]"
                style={{ borderColor: c.line, color: c.secondary, background: "#fff" }}
              >
                Edit
              </button>
            </div>
          </div>
          <p className="mt-2 font-sans text-[12px] leading-[1.55]" style={{ color: c.secondary }}>
            {item.evidence ? `Evidence needed: ${item.evidence}` : "Evidence needed: not defined yet."}
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

export default function StrategyView() {
  const { activeCompany } = useCompany();
  const auditMode = isGenericAuditCompany(activeCompany);
  const { loading, item, error, savingField, updateNarrativeField } = useStrategyCascade(activeCompany?.id);
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
  });
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
      className="min-h-screen"
      style={{
        background: c.bg,
        backgroundImage:
          'url("data:image/svg+xml,%3Csvg width=\'6\' height=\'6\' viewBox=\'0 0 6 6\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'%23000\' fill-opacity=\'0.025\'%3E%3Cpath d=\'M5 0h1L0 5V4zM6 5v1H5z\'/%3E%3C/g%3E%3C/svg%3E")',
      }}
    >
      <TopNav />

      <main className="mx-auto max-w-[1120px] px-4 pb-12 pt-6 sm:px-6 md:px-8">
        <PageContextStatus lastScoredAt={activeCompany?.last_scored_at} sourceSignals={sourceSignals} />

        <div className="mb-8 border-b pb-5" style={{ borderColor: c.line }}>
          <div className="flex flex-wrap items-center gap-3">
            <div>
              <div className="font-mono text-[11px] uppercase tracking-[0.08em]" style={{ color: c.muted }}>
                {activeCompany?.name || "No company selected"}
              </div>
              <h1 className="mt-2 font-sans text-[34px] font-semibold" style={{ color: c.charcoal }}>
                Strategy Cascade
              </h1>
              <p className="mojo-under-title max-w-3xl font-sans text-[15px] mojo-desc" style={{ color: c.secondary }}>
                A good strategy is a set of reinforcing choices. This cascade shows the current
                strategic logic from aspiration through capabilities, management systems, and the
                assumptions that still need proof.
              </p>
            </div>
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
          <div className="space-y-1">
            <section
              className="rounded-[24px] border px-5 py-5 sm:px-6"
              style={{ borderColor: c.line, background: c.panel }}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  {sectionLabel("Client-Stated Strategic Problem(s)")}
                  <p className="mt-2.5 max-w-4xl font-sans text-[14px] mojo-desc" style={{ color: c.secondary }}>
                    Capture the strategic problems in the client&apos;s own words, then narrow to one priority problem
                    for this cycle using evidence. Problems stay open while they are still shaping active choices.
                  </p>
                </div>
                <MetaBadge>{openProblemsCount} open</MetaBadge>
              </div>
              <div className="mt-4 rounded-[18px] border p-4" style={{ borderColor: c.line, background: c.paper }}>
                <p className="font-mono text-[10px] uppercase tracking-[0.12em]" style={{ color: c.muted }}>
                  What reconciliation means
                </p>
                <p className="mt-2 font-sans text-[13px] leading-[1.65]" style={{ color: c.secondary }}>
                  <span className="font-semibold" style={{ color: c.charcoal }}>Open (In play):</span> this problem is
                  still unresolved and should influence strategy decisions now.
                </p>
                <p className="mt-1.5 font-sans text-[13px] leading-[1.65]" style={{ color: c.secondary }}>
                  <span className="font-semibold" style={{ color: c.charcoal }}>Reconciled (Closed):</span> evidence has
                  resolved, reframed, or merged this problem for now. You can reopen it any time if new evidence shows up.
                </p>
              </div>
              {currentFocusProblem ? (
                <div className="mt-3 rounded-[18px] border p-4" style={{ borderColor: c.line, background: c.paper }}>
                  <p className="font-mono text-[10px] uppercase tracking-[0.12em]" style={{ color: c.muted }}>
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
                    <span className="font-mono text-[10px] uppercase tracking-[0.08em]">Decision ask:</span>{" "}
                    {currentFocusProblem.decisionAsk}
                  </p>
                </div>
              ) : (
                <div className="mt-3 rounded-[18px] border p-4" style={{ borderColor: c.line, background: c.paper }}>
                  <p className="font-mono text-[10px] uppercase tracking-[0.12em]" style={{ color: c.muted }}>
                    Current focus problem (evidence-led)
                  </p>
                  <p className="mt-2 font-sans text-[13px] leading-[1.65]" style={{ color: c.secondary }}>
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
                  <div className="mt-4 rounded-[18px] border p-4" style={{ borderColor: c.line, background: c.paper }}>
                    <p className="font-mono text-[10px] uppercase tracking-[0.12em]" style={{ color: c.muted }}>
                      Add Strategic Problem
                    </p>
                    <textarea
                      className="mt-3 w-full rounded-[14px] border px-3 py-2 font-sans text-[14px] outline-none"
                      style={{ borderColor: c.line, background: "#fff", color: c.charcoal }}
                      rows={3}
                      value={newProblemText}
                      placeholder="Example: We are not clear which audience and category to prioritize for growth."
                      onChange={(event) => setNewProblemText(event.target.value)}
                    />
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <select
                        className="rounded-md border px-2 py-1.5 font-mono text-[11px] uppercase tracking-[0.08em]"
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
                        className="rounded-md border px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.08em] disabled:opacity-50"
                        style={{ borderColor: c.line, color: c.secondary, background: c.paper }}
                      >
                        {strategicProblemSaving ? "Saving..." : "Add Problem"}
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
                            className="rounded-[18px] border p-4 transition-opacity"
                            style={{
                              borderColor: c.line,
                              background: inactive ? "#F8FAF6" : c.paper,
                              opacity: inactive ? 0.64 : 1,
                            }}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="font-sans text-[15px] font-semibold leading-[1.4]" style={{ color: c.charcoal }}>
                                  {title}
                                </p>
                                <p className="mt-1 font-sans text-[13px] leading-[1.6]" style={{ color: c.secondary }}>
                                  {summary}
                                </p>
                                <p className="mt-1 font-sans text-[12px] leading-[1.55]" style={{ color: c.muted }}>
                                  <span className="font-mono text-[10px] uppercase tracking-[0.08em]">Decision ask:</span>{" "}
                                  {decisionAsk}
                                </p>
                                <div className="mt-2 flex flex-wrap items-center gap-2">
                                  <span
                                    className="rounded-full border px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em]"
                                    style={{ borderColor: sourceStyle.border, background: sourceStyle.bg, color: sourceStyle.fg }}
                                  >
                                    {sourceLabel(problem.source)}
                                  </span>
                                  <span
                                    className="rounded-full border px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em]"
                                    style={{ borderColor: statusStyle.border, background: statusStyle.bg, color: statusStyle.fg }}
                                  >
                                    {statusStyle.label}
                                  </span>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => toggleProblemExpanded(problem.id)}
                                className="shrink-0 rounded-md border px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em]"
                                style={{ borderColor: c.line, color: c.secondary, background: "#fff" }}
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
              <EmptyState message="No structured strategy cascade yet. Run AI Research again to generate the full cascade view." />
            ) : (
              <>
                <NarrativeBlock
                  label="Winning Aspiration"
                  text={item.winning_aspiration}
                  emptyText="No winning aspiration generated yet."
                  saving={savingField === "winning_aspiration"}
                  onAcceptSuggestion={(suggested) =>
                    applyClaritySuggestion("winning_aspiration", suggested, "accept")
                  }
                  onIgnoreSuggestion={(primary) =>
                    applyClaritySuggestion("winning_aspiration", primary, "ignore")
                  }
                />

                {connector()}

                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <NarrativeBlock
                    label="Where To Play"
                    text={item.where_to_play}
                    emptyText="No where-to-play definition generated yet."
                    saving={savingField === "where_to_play"}
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
                    saving={savingField === "how_to_win"}
                    onAcceptSuggestion={(suggested) =>
                      applyClaritySuggestion("how_to_win", suggested, "accept")
                    }
                    onIgnoreSuggestion={(primary) =>
                      applyClaritySuggestion("how_to_win", primary, "ignore")
                    }
                  />
                </div>

                {connector()}

                <GridSection
                  label="Required Capabilities"
                  items={item.capabilities}
                />

                {connector()}

                <GridSection
                  label="Management Systems"
                  items={item.management_systems}
                />

                {connector()}

                <section
                  className="rounded-[24px] border px-5 py-5 sm:px-6"
                  style={{ borderColor: c.line, background: c.panel }}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      {sectionLabel("Assumptions Snapshot")}
                      <p className="mt-3 max-w-4xl font-sans text-[14px] leading-[1.7]" style={{ color: c.secondary }}>
                        Generated assumptions and submitted assumptions are shown together here so we can track them in one place.
                      </p>
                    </div>
                    <MetaBadge>{openAssumptionsCount} needing validation</MetaBadge>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    {([
                      { key: "all", label: `All (${unifiedAssumptions.length})` },
                      {
                        key: "generated",
                        label: `Generated (${unifiedAssumptions.filter((assumption) => assumption.origin === "generated").length})`,
                      },
                      {
                        key: "submitted",
                        label: `Submitted (${unifiedAssumptions.filter((assumption) => assumption.origin === "submitted").length})`,
                      },
                    ] as Array<{ key: AssumptionViewFilter; label: string }>).map((filter) => {
                      const selected = assumptionViewFilter === filter.key;
                      return (
                        <button
                          key={filter.key}
                          type="button"
                          onClick={() => setAssumptionViewFilter(filter.key)}
                          className="rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-[0.08em]"
                          style={{
                            borderColor: selected ? c.teal : c.line,
                            background: selected ? "#EEF6E7" : "#fff",
                            color: selected ? c.teal : c.secondary,
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
                      className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.08em]"
                      style={{ borderColor: c.line, color: c.secondary, background: c.paper }}
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
                            <div className="rounded-[18px] border p-4" style={{ borderColor: c.line, background: c.paper }}>
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
                                  className="mt-3 rounded-[14px] border px-3 py-2"
                                  style={{ borderColor: c.lineFaint, background: "#F7FAF5" }}
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
                                    className="mt-2 rounded-md border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.08em]"
                                    style={{ borderColor: c.line, color: c.secondary, background: "#fff" }}
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
    </div>
  );
}
