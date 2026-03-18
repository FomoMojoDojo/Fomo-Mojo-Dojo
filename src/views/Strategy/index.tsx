import { useMemo, useState } from "react";
import TopNav from "@/components/layout/TopNav";
import { useCompany } from "@/hooks/useCompany";
import { useStrategyCascade } from "@/hooks/useStrategyCascade";
import { useStrategicProblems, type StrategicProblem } from "@/hooks/useStrategicProblems";
import { useStrategicAssumptions, type StrategicAssumption } from "@/hooks/useStrategicAssumptions";
import { useLatestLocalAlignment } from "@/hooks/useLocalAlignment";
import { useSourceConfidence } from "@/hooks/useSourceConfidence";
import { MetaBadge } from "@/components/ui/semantic-badges";
import { SourceLegend } from "@/components/provenance/SourceLegend";
import { AreaAlignmentPanel } from "@/components/alignment/AreaAlignmentPanel";
import type { CascadeItem } from "@/lib/types";
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
}: {
  label: string;
  text: string;
}) {
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
        {text}
      </p>
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
  assumption: string;
  evidence: string;
  statusLabel: string;
  statusTone: { bg: string; fg: string; border: string };
  source?: ProvenanceSource;
  createdAt?: string;
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

function UnifiedAssumptionCard({ item }: { item: UnifiedAssumption }) {
  const originStyle = originTone(item.origin);
  const sourceStyle = item.source ? sourceTone(item.source) : null;
  return (
    <div
      className="rounded-[18px] border p-4"
      style={{ borderColor: c.line, background: c.paper }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span
          className="rounded-full border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.08em]"
          style={{ borderColor: originStyle.border, background: originStyle.bg, color: originStyle.fg }}
        >
          {originStyle.label}
        </span>
        {sourceStyle ? (
          <span
            className="rounded-full border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.08em]"
            style={{ borderColor: sourceStyle.border, background: sourceStyle.bg, color: sourceStyle.fg }}
          >
            {sourceLabel(item.source!)}
          </span>
        ) : null}
        <span
          className="rounded-full border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.08em]"
          style={{ borderColor: item.statusTone.border, background: item.statusTone.bg, color: item.statusTone.fg }}
        >
          {item.statusLabel}
        </span>
        {item.createdAt ? (
          <span className="font-mono text-[10px]" style={{ color: c.muted }}>
            {new Date(item.createdAt).toLocaleDateString()}
          </span>
        ) : null}
      </div>

      <p className="mt-2 font-sans text-[15px] leading-[1.6]" style={{ color: c.charcoal }}>
        {item.assumption}
      </p>

      <p className="mt-2 font-sans text-[12px] leading-[1.6]" style={{ color: c.secondary }}>
        {item.evidence ? `Evidence needed: ${item.evidence}` : "Evidence needed: not defined yet."}
      </p>
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
  const { loading, item, error } = useStrategyCascade(activeCompany?.id);
  const {
    loading: problemsLoading,
    items: strategicProblems,
    error: strategicProblemsError,
    tableMissing: strategicProblemsTableMissing,
    saving: strategicProblemSaving,
    reconcilingId,
    addProblem,
    setProblemStatus,
  } = useStrategicProblems(activeCompany?.id);
  const {
    loading: assumptionsLoading,
    items: strategicAssumptions,
    error: strategicAssumptionsError,
    tableMissing: strategicAssumptionsTableMissing,
    saving: strategicAssumptionSaving,
    updatingId: assumptionUpdatingId,
    addAssumption,
    setAssumptionStatus,
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
  const [newAssumptionText, setNewAssumptionText] = useState("");
  const [newAssumptionSource, setNewAssumptionSource] = useState<StrategicAssumption["source"]>("client");
  const [newAssumptionNote, setNewAssumptionNote] = useState("");
  const [assumptionNoteById, setAssumptionNoteById] = useState<Record<string, string>>({});
  const [assumptionsEditorOpen, setAssumptionsEditorOpen] = useState(false);
  const [assumptionViewFilter, setAssumptionViewFilter] = useState<AssumptionViewFilter>("all");

  const openProblemsCount = useMemo(
    () => strategicProblems.filter((problem) => problem.status !== "reconciled").length,
    [strategicProblems],
  );

  const openAssumptionsCount = useMemo(
    () =>
      strategicAssumptions.filter(
        (assumption) => assumption.status === "untested" || assumption.status === "validating",
      ).length,
    [strategicAssumptions],
  );
  const suggestedEvidenceForNewAssumption = useMemo(
    () => suggestEvidenceNeeded(newAssumptionText),
    [newAssumptionText],
  );
  const unifiedAssumptions = useMemo<UnifiedAssumption[]>(() => {
    const generated = (item?.assumptions ?? []).map((assumption, index) => ({
      key: `generated-${index}-${assumption.assumption}`,
      origin: "generated" as const,
      assumption: String(assumption.assumption || "").trim(),
      evidence: String(assumption.note || assumption.outcome || "").trim(),
      statusLabel: assumption.tested ? "Tested" : "Untested",
      statusTone: assumptionStatusTone(assumption.tested ? "validated" : "untested"),
    }));

    const submitted = strategicAssumptions.map((assumption) => ({
      key: `submitted-${assumption.id}`,
      origin: "submitted" as const,
      assumption: String(assumption.assumption || "").trim(),
      evidence: String(assumption.note || "").trim(),
      statusLabel: assumptionStatusLabel(assumption.status),
      statusTone: assumptionStatusTone(assumption.status),
      source: assumption.source,
      createdAt: assumption.created_at,
    }));

    return [...generated, ...submitted].filter((assumption) => assumption.assumption);
  }, [item?.assumptions, strategicAssumptions]);

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

  const updateAssumptionStatus = async (
    assumption: StrategicAssumption,
    status: StrategicAssumption["status"],
  ) => {
    const note = assumptionNoteById[assumption.id] ?? assumption.note ?? "";
    try {
      await setAssumptionStatus(assumption.id, status, note);
      toast.success(`Assumption marked ${assumptionStatusLabel(status).toLowerCase()}.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update assumption.");
    }
  };

  const saveAssumptionEvidenceNeeded = async (assumption: StrategicAssumption) => {
    const note = assumptionNoteById[assumption.id] ?? assumption.note ?? "";
    try {
      await setAssumptionStatus(assumption.id, assumption.status, note);
      toast.success("Evidence needed saved.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save evidence needed.");
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
        <div className="mb-8 border-b pb-5" style={{ borderColor: c.line }}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="font-mono text-[11px] uppercase tracking-[0.08em]" style={{ color: c.muted }}>
                {activeCompany?.name || "No company selected"}
              </div>
              <h1 className="mt-2 font-sans text-[34px] font-semibold" style={{ color: c.charcoal }}>
                Strategy Cascade
              </h1>
              <p className="mt-2 max-w-3xl font-sans text-[15px] leading-[1.7]" style={{ color: c.secondary }}>
                A good strategy is a set of reinforcing choices. This cascade shows the current
                strategic logic from aspiration through capabilities, management systems, and the
                assumptions that still need proof.
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              <MetaBadge>
                {activeCompany?.last_scored_at
                  ? `Updated ${new Date(activeCompany.last_scored_at).toLocaleDateString()}`
                  : "Awaiting research"}
              </MetaBadge>
              <SourceLegend signals={sourceSignals} />
            </div>
          </div>
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
                  <p className="mt-3 max-w-4xl font-sans text-[14px] leading-[1.7]" style={{ color: c.secondary }}>
                    Capture what the client says the strategic problem is. Multiple statements are expected, especially early.
                    Reconcile them before locking strategic choices in the cascade below.
                  </p>
                </div>
                <MetaBadge>{openProblemsCount} open</MetaBadge>
              </div>

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
                      {strategicProblems.map((problem) => {
                        const sourceStyle = sourceTone(problem.source);
                        return (
                          <div
                            key={problem.id}
                            className="rounded-[18px] border p-4"
                            style={{ borderColor: c.line, background: c.paper }}
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              <span
                                className="rounded-full border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.08em]"
                                style={{ borderColor: sourceStyle.border, background: sourceStyle.bg, color: sourceStyle.fg }}
                              >
                                {sourceLabel(problem.source)}
                              </span>
                              <MetaBadge>{problem.status === "reconciled" ? "Reconciled" : "Open"}</MetaBadge>
                              <span className="font-mono text-[10px]" style={{ color: c.muted }}>
                                {new Date(problem.created_at).toLocaleDateString()}
                              </span>
                            </div>

                            <p className="mt-2 font-sans text-[15px] leading-[1.6]" style={{ color: c.charcoal }}>
                              {problem.statement}
                            </p>

                            {problem.reconciliation_note ? (
                              <p className="mt-2 font-sans text-[12px] leading-[1.6]" style={{ color: c.secondary }}>
                                Reconciliation note: {problem.reconciliation_note}
                              </p>
                            ) : null}

                            <div className="mt-3 flex flex-wrap items-center gap-2">
                              {problem.status === "reconciled" ? (
                                <button
                                  type="button"
                                  onClick={() => reopenProblem(problem)}
                                  disabled={reconcilingId === problem.id}
                                  className="rounded-md border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.08em] disabled:opacity-50"
                                  style={{ borderColor: c.line, color: c.secondary, background: "#fff" }}
                                >
                                  {reconcilingId === problem.id ? "Saving..." : "Reopen"}
                                </button>
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
                                    placeholder="Optional note for how this was reconciled"
                                    className="min-w-[260px] flex-1 rounded-md border px-2.5 py-1.5 font-sans text-[12px] outline-none"
                                    style={{ borderColor: c.line, background: "#fff", color: c.secondary }}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => markReconciled(problem)}
                                    disabled={reconcilingId === problem.id}
                                    className="rounded-md border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.08em] disabled:opacity-50"
                                    style={{ borderColor: c.line, color: c.secondary, background: "#fff" }}
                                  >
                                    {reconcilingId === problem.id ? "Saving..." : "Mark Reconciled"}
                                  </button>
                                </>
                              )}
                            </div>
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
                  text={item.winning_aspiration || "No winning aspiration generated yet."}
                />

                {connector()}

                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <NarrativeBlock
                    label="Where To Play"
                    text={item.where_to_play || "No where-to-play definition generated yet."}
                  />
                  <NarrativeBlock
                    label="How To Win"
                    text={item.how_to_win || "No how-to-win logic generated yet."}
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
                        <UnifiedAssumptionCard key={assumption.key} item={assumption} />
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
                      <span>{assumptionsEditorOpen ? "Hide Assumption Entry" : "Add Or Edit Assumptions"}</span>
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

                            {assumptionsLoading ? (
                              <p className="mt-4 font-sans text-[13px]" style={{ color: c.secondary }}>
                                Loading assumptions...
                              </p>
                            ) : strategicAssumptionsError ? (
                              <p className="mt-4 font-sans text-[13px]" style={{ color: c.coral }}>
                                Failed to load assumptions: {strategicAssumptionsError}
                              </p>
                            ) : strategicAssumptions.length === 0 ? (
                              <p className="mt-4 font-sans text-[13px]" style={{ color: c.secondary }}>
                                No assumptions captured yet.
                              </p>
                            ) : (
                              <div className="mt-4 space-y-3">
                                {strategicAssumptions.map((assumption) => {
                                  const sourceStyle = sourceTone(assumption.source);
                                  const statusStyle = assumptionStatusTone(assumption.status);
                                  return (
                                    <div
                                      key={assumption.id}
                                      className="rounded-[18px] border p-4"
                                      style={{ borderColor: c.line, background: c.paper }}
                                    >
                                      <div className="flex flex-wrap items-center gap-2">
                                        <span
                                          className="rounded-full border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.08em]"
                                          style={{ borderColor: sourceStyle.border, background: sourceStyle.bg, color: sourceStyle.fg }}
                                        >
                                          {sourceLabel(assumption.source)}
                                        </span>
                                        <span
                                          className="rounded-full border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.08em]"
                                          style={{ borderColor: statusStyle.border, background: statusStyle.bg, color: statusStyle.fg }}
                                        >
                                          {assumptionStatusLabel(assumption.status)}
                                        </span>
                                        <span className="font-mono text-[10px]" style={{ color: c.muted }}>
                                          {new Date(assumption.created_at).toLocaleDateString()}
                                        </span>
                                      </div>

                                      <p className="mt-2 font-sans text-[15px] leading-[1.6]" style={{ color: c.charcoal }}>
                                        {assumption.assumption}
                                      </p>

                                      {assumption.note ? (
                                        <p className="mt-2 font-sans text-[12px] leading-[1.6]" style={{ color: c.secondary }}>
                                          Evidence needed: {assumption.note}
                                        </p>
                                      ) : null}

                                      <div
                                        className="mt-3 rounded-[12px] border px-3 py-2"
                                        style={{ borderColor: c.lineFaint, background: "#F7FAF5" }}
                                      >
                                        <p className="font-mono text-[10px] uppercase tracking-[0.1em]" style={{ color: c.muted }}>
                                          Suggested Evidence Needed
                                        </p>
                                        <p className="mt-1 font-sans text-[12px] leading-[1.55]" style={{ color: c.secondary }}>
                                          {suggestEvidenceNeeded(assumption.assumption)}
                                        </p>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setAssumptionNoteById((current) => ({
                                              ...current,
                                              [assumption.id]: suggestEvidenceNeeded(assumption.assumption),
                                            }))
                                          }
                                          className="mt-2 rounded-md border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.08em]"
                                          style={{ borderColor: c.line, color: c.secondary, background: "#fff" }}
                                        >
                                          Use Suggestion
                                        </button>
                                      </div>

                                      <div className="mt-3 flex flex-wrap items-center gap-2">
                                        <input
                                          value={assumptionNoteById[assumption.id] ?? assumption.note ?? ""}
                                          onChange={(event) =>
                                            setAssumptionNoteById((current) => ({
                                              ...current,
                                              [assumption.id]: event.target.value,
                                            }))
                                          }
                                          placeholder="Evidence needed (editable)"
                                          className="min-w-[240px] flex-1 rounded-md border px-2.5 py-1.5 font-sans text-[12px] outline-none"
                                          style={{ borderColor: c.line, background: "#fff", color: c.secondary }}
                                        />
                                        <button
                                          type="button"
                                          onClick={() => saveAssumptionEvidenceNeeded(assumption)}
                                          disabled={assumptionUpdatingId === assumption.id}
                                          className="rounded-md border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.08em] disabled:opacity-50"
                                          style={{ borderColor: c.line, color: c.secondary, background: "#fff" }}
                                        >
                                          {assumptionUpdatingId === assumption.id ? "Saving..." : "Save Evidence"}
                                        </button>
                                        {assumption.status !== "validating" ? (
                                          <button
                                            type="button"
                                            onClick={() => updateAssumptionStatus(assumption, "validating")}
                                            disabled={assumptionUpdatingId === assumption.id}
                                            className="rounded-md border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.08em] disabled:opacity-50"
                                            style={{ borderColor: c.line, color: c.secondary, background: "#fff" }}
                                          >
                                            {assumptionUpdatingId === assumption.id ? "Saving..." : "Set Validating"}
                                          </button>
                                        ) : null}
                                        {assumption.status !== "validated" ? (
                                          <button
                                            type="button"
                                            onClick={() => updateAssumptionStatus(assumption, "validated")}
                                            disabled={assumptionUpdatingId === assumption.id}
                                            className="rounded-md border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.08em] disabled:opacity-50"
                                            style={{ borderColor: c.line, color: c.secondary, background: "#fff" }}
                                          >
                                            {assumptionUpdatingId === assumption.id ? "Saving..." : "Mark Validated"}
                                          </button>
                                        ) : null}
                                        {assumption.status !== "invalidated" ? (
                                          <button
                                            type="button"
                                            onClick={() => updateAssumptionStatus(assumption, "invalidated")}
                                            disabled={assumptionUpdatingId === assumption.id}
                                            className="rounded-md border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.08em] disabled:opacity-50"
                                            style={{ borderColor: c.line, color: c.secondary, background: "#fff" }}
                                          >
                                            {assumptionUpdatingId === assumption.id ? "Saving..." : "Mark Invalidated"}
                                          </button>
                                        ) : null}
                                        {assumption.status !== "untested" ? (
                                          <button
                                            type="button"
                                            onClick={() => updateAssumptionStatus(assumption, "untested")}
                                            disabled={assumptionUpdatingId === assumption.id}
                                            className="rounded-md border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.08em] disabled:opacity-50"
                                            style={{ borderColor: c.line, color: c.secondary, background: "#fff" }}
                                          >
                                            {assumptionUpdatingId === assumption.id ? "Saving..." : "Reset Untested"}
                                          </button>
                                        ) : null}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
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
