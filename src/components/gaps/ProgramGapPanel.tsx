import type { InputItem } from "@/lib/types";
import type { OpportunityRow } from "@/hooks/useOpportunities";
import type { StrategicAssumption } from "@/hooks/useStrategicAssumptions";
import { PHASE_ORDER, type EngagementPhase } from "@/lib/engagementPhase";

// Re-export for any legacy consumers.
export type { EngagementPhase as ProgramPhase };

const c = {
  charcoal: "#233C4B",
  secondary: "#46606D",
  muted: "#6E847F",
  line: "#DDE6D1",
  lineFaint: "#EEF3E9",
  teal: "#5F9B8C",
  coral: "#FF7D2D",
  amber: "#C48A2A",
};

type CheckStatus = "complete" | "partial" | "missing";

type GapCheck = {
  label: string;
  status: CheckStatus;
  note?: string;
  phase: EngagementPhase;
};

function statusDot(status: CheckStatus) {
  if (status === "complete") return { bg: c.teal, border: "#B5D9CC" };
  if (status === "partial") return { bg: c.amber, border: "#F3D77A" };
  return { bg: "#CBD5D0", border: c.line };
}

function CheckRow({ check }: { check: GapCheck }) {
  const dot = statusDot(check.status);
  return (
    <div className="flex items-start gap-2 py-1.5">
      <span
        className="mt-[3px] inline-block h-[8px] w-[8px] shrink-0 rounded-full border"
        style={{ background: dot.bg, borderColor: dot.border }}
      />
      <div className="min-w-0">
        <p className="font-sans text-[12px] leading-[1.4]" style={{ color: c.charcoal }}>
          {check.label}
        </p>
        {check.note && (
          <p className="font-sans text-[11px] mt-0.5" style={{ color: c.muted }}>
            {check.note}
          </p>
        )}
      </div>
    </div>
  );
}

const PHASE_LABELS: Record<EngagementPhase, string> = {
  outside_signals:  "Outside",
  validate_outside: "Validate · Outside",
  diagnose:         "Diagnose",
  validate_diagnose:"Validate · Diagnose",
  focus:            "Focus",
  validate_focus:   "Validate · Focus",
  flow:             "Flow",
  validate_flow:    "Validate · Flow",
};

function Column({
  title,
  subtitle,
  accent,
  checks,
  currentPhase,
}: {
  title: string;
  subtitle: string;
  accent: string;
  checks: GapCheck[];
  currentPhase: EngagementPhase;
}) {
  const complete = checks.filter((ch) => ch.status === "complete").length;
  const total = checks.length;
  const phases = [...new Set(checks.map((ch) => ch.phase))].sort(
    (a, b) => PHASE_ORDER.indexOf(a) - PHASE_ORDER.indexOf(b),
  );
  const multiPhase = phases.length > 1;
  const curIdx = PHASE_ORDER.indexOf(currentPhase);

  return (
    <div
      className="rounded-lg p-4"
      style={{ border: `1px solid ${c.line}`, background: "#FFFFFF" }}
    >
      <div
        className="h-[3px] w-8 rounded-full mb-3"
        style={{ background: accent }}
      />
      <p className="font-mono text-[10px] uppercase tracking-[0.08em] font-semibold" style={{ color: accent }}>
        {title}
      </p>
      <p className="font-sans text-[11px] mt-0.5 mb-3" style={{ color: c.muted }}>
        {subtitle}
      </p>
      {total === 0 ? (
        <p className="font-sans text-[12px]" style={{ color: c.muted }}>
          No gaps for this stage.
        </p>
      ) : (
        <>
          <div
            className="text-right font-mono text-[11px] mb-3"
            style={{ color: c.secondary }}
          >
            {complete}/{total} complete
          </div>
          {multiPhase ? (
            phases.map((phase) => {
              const phaseChecks = checks.filter((ch) => ch.phase === phase);
              const isPrior = PHASE_ORDER.indexOf(phase) < curIdx;
              const label = isPrior
                ? `${PHASE_LABELS[phase]} (carried over)`
                : PHASE_LABELS[phase];
              return (
                <div key={phase} className="mb-3">
                  <p
                    className="font-mono text-[9px] uppercase tracking-[0.1em] mb-1"
                    style={{ color: isPrior ? c.amber : c.muted }}
                  >
                    {label}
                  </p>
                  {phaseChecks.map((check) => (
                    <CheckRow key={check.label} check={check} />
                  ))}
                </div>
              );
            })
          ) : (
            checks.map((check) => (
              <CheckRow key={check.label} check={check} />
            ))
          )}
        </>
      )}
    </div>
  );
}

export default function ProgramGapPanel({
  inputs,
  opportunities,
  assumptions,
  managedOutcomeCount,
  jobStepCount,
  jobStepDesignedCount,
  strategicProblemCount,
  reconciledProblemCount,
  routeCount,
  solutionIdeaCount,
  odiNeedCount,
  hasPublicEvidence,
  hasCompanyEvidence,
  hasPrimaryEvidence,
  currentPhase,
}: {
  inputs: InputItem[];
  opportunities: OpportunityRow[];
  assumptions: StrategicAssumption[];
  managedOutcomeCount: number;
  jobStepCount: number;
  jobStepDesignedCount: number;
  strategicProblemCount: number;
  reconciledProblemCount: number;
  routeCount: number;
  solutionIdeaCount: number;
  odiNeedCount: number;
  hasPublicEvidence: boolean;
  hasCompanyEvidence: boolean;
  hasPrimaryEvidence: boolean;
  currentPhase: EngagementPhase;
}) {
  const focusOpps = opportunities.filter((o) => o.priority_tier === "focus");
  const linkedOpps = opportunities.filter((o) => o.managed_outcome_id);
  const validatedAssumptions = assumptions.filter((a) => a.status === "validated");
  const testedAssumptions = assumptions.filter(
    (a) => a.status === "validated" || a.status === "validating",
  );

  const completenessChecks: GapCheck[] = [
    {
      label: "Public evidence gathered",
      status: hasPublicEvidence ? "complete" : "missing",
      note: hasPublicEvidence ? undefined : "Run Web Baseline to generate public evidence.",
      phase: "outside_signals",
    },
    {
      label: "Competitive landscape documented",
      status: hasPublicEvidence ? "partial" : "missing",
      note: "Verify competitor claims are in the evidence ledger.",
      phase: "outside_signals",
    },
    // validate_outside checkpoint
    {
      label: "External findings presented to client",
      status: hasPublicEvidence ? "partial" : "missing",
      note: "Present signals, gaps, and contradictions found from outside research.",
      phase: "validate_outside",
    },
    {
      label: "Client perspective and fit assessed",
      status: "missing",
      note: "Capture corrections, surprises, and confirm the engagement is well-scoped.",
      phase: "validate_outside",
    },
    // diagnose
    {
      label: "Strategic problem documented",
      status: strategicProblemCount > 0 ? "complete" : "missing",
      note: strategicProblemCount > 0 ? undefined : "Add client-stated strategic problem in Strategy.",
      phase: "diagnose",
    },
    {
      label: "Strategic problem reconciled",
      status:
        reconciledProblemCount > 0
          ? "complete"
          : strategicProblemCount > 0
          ? "partial"
          : "missing",
      note:
        reconciledProblemCount > 0
          ? undefined
          : "Reconcile multiple problem statements to one decision-ready framing.",
      phase: "diagnose",
    },
    {
      label: "Company documents uploaded",
      status: hasCompanyEvidence ? "complete" : "missing",
      note: hasCompanyEvidence ? undefined : "Upload strategy, brand, or operating documents.",
      phase: "diagnose",
    },
    {
      label: "Job steps / checkpoints mapped",
      status:
        jobStepDesignedCount > 0
          ? jobStepDesignedCount >= jobStepCount * 0.7
            ? "complete"
            : "partial"
          : "missing",
      note: `${jobStepDesignedCount}/${jobStepCount} checkpoints designed.`,
      phase: "diagnose",
    },
    {
      label: "Assumptions documented",
      status: assumptions.length >= 3 ? "complete" : assumptions.length > 0 ? "partial" : "missing",
      note: `${assumptions.length} assumption${assumptions.length !== 1 ? "s" : ""} recorded.`,
      phase: "diagnose",
    },
    // validate_diagnose checkpoint
    {
      label: "Working hypotheses documented and shared",
      status: strategicProblemCount > 0 && hasCompanyEvidence ? "partial" : "missing",
      note: "State what the evidence points to — clearly and in client language.",
      phase: "validate_diagnose",
    },
    {
      label: "Evidence separated from assumption",
      status: assumptions.length >= 2 ? "partial" : "missing",
      note: "Label each claim as evidence-supported or still assumed.",
      phase: "validate_diagnose",
    },
    // focus
    {
      label: "Customer needs scored",
      status: odiNeedCount >= 5 ? "complete" : odiNeedCount > 0 ? "partial" : "missing",
      note: `${odiNeedCount} need${odiNeedCount !== 1 ? "s" : ""} with importance/satisfaction scores.`,
      phase: "focus",
    },
    {
      label: "Managed outcome defined",
      status: managedOutcomeCount > 0 ? "complete" : "missing",
      note: managedOutcomeCount > 0 ? undefined : "Define at least one desired outcome to anchor opportunities.",
      phase: "focus",
    },
    {
      label: "Opportunities prioritized",
      status: focusOpps.length >= 3 ? "complete" : focusOpps.length > 0 ? "partial" : "missing",
      note: `${focusOpps.length} focus-tier opportunit${focusOpps.length !== 1 ? "ies" : "y"}.`,
      phase: "focus",
    },
    {
      label: "Routes assigned",
      status: routeCount >= 2 ? "complete" : routeCount > 0 ? "partial" : "missing",
      note: `${routeCount} route${routeCount !== 1 ? "s" : ""} defined.`,
      phase: "focus",
    },
    // validate_focus checkpoint
    {
      label: "Chosen outcome presented with evidence",
      status: focusOpps.length > 0 && routeCount > 0 ? "partial" : "missing",
      note: "Show why this outcome was selected and what backs the decision.",
      phase: "validate_focus",
    },
    {
      label: "Stakeholder alignment confirmed",
      status: "missing",
      note: "All stakeholders committed before execution begins.",
      phase: "validate_focus",
    },
    // flow
    {
      label: "Solutions defined for top opportunities",
      status: solutionIdeaCount >= 3 ? "complete" : solutionIdeaCount > 0 ? "partial" : "missing",
      note: `${solutionIdeaCount} solution idea${solutionIdeaCount !== 1 ? "s" : ""} documented.`,
      phase: "flow",
    },
    // validate_flow checkpoint
    {
      label: "Leading indicators reviewed against baseline",
      status: "missing",
      note: "Compare current signals against the starting baseline.",
      phase: "validate_flow",
    },
    {
      label: "Continue, adjust, or close decision made",
      status: "missing",
      note: "Make an explicit call on whether to continue, adjust the route, or close the loop.",
      phase: "validate_flow",
    },
  ];

  const consistencyChecks: GapCheck[] = [
    {
      label: "Public and internal claims compared",
      status: hasPublicEvidence && hasCompanyEvidence ? "complete" : "missing",
      note: "Need both public and company evidence to cross-reference.",
      phase: "outside_signals",
    },
    {
      label: "Opportunities linked to desired outcomes",
      status:
        linkedOpps.length > 0 && focusOpps.length > 0
          ? linkedOpps.length >= focusOpps.length
            ? "complete"
            : "partial"
          : "missing",
      note: `${linkedOpps.length}/${opportunities.length} opportunities linked to an outcome.`,
      phase: "diagnose",
    },
    {
      label: "Job step framing consistent with customer language",
      status: jobStepDesignedCount > 0 ? "partial" : "missing",
      note: "Review step labels against interview transcripts.",
      phase: "diagnose",
    },
    {
      label: "Contradictions surfaced and resolved",
      status: hasPublicEvidence && hasCompanyEvidence ? "partial" : "missing",
      note: "Note any signals that conflict and bring them to the client.",
      phase: "validate_diagnose",
    },
    {
      label: "Innovation strategy set and reflected in priorities",
      status: focusOpps.length >= 3 && routeCount > 0 ? "partial" : "missing",
      note: "Set innovation strategy in market definition to align opportunity priority.",
      phase: "focus",
    },
    {
      label: "Routes cover top-priority opportunities",
      status:
        routeCount > 0 && focusOpps.length > 0 ? "partial" : "missing",
      note: `${routeCount} routes vs ${focusOpps.length} focus opportunities.`,
      phase: "focus",
    },
    {
      label: "Key assumptions have validation notes",
      status:
        testedAssumptions.length > 0 && assumptions.length > 0
          ? testedAssumptions.length >= assumptions.length * 0.5
            ? "complete"
            : "partial"
          : "missing",
      note: `${testedAssumptions.length}/${assumptions.length} assumptions in testing or validated.`,
      phase: "focus",
    },
    {
      label: "Tradeoffs acknowledged and accepted",
      status: routeCount > 0 ? "partial" : "missing",
      note: "Document what is being deprioritised and why.",
      phase: "validate_focus",
    },
    {
      label: "Chosen branch documented and shared",
      status: routeCount >= 1 && solutionIdeaCount >= 1 ? "partial" : "missing",
      note: "Document the chosen route narrative and rationale.",
      phase: "flow",
    },
    {
      label: "Next steps have clear owners and timing",
      status: "missing",
      note: "Assign owners and dates to each route workstream step.",
      phase: "flow",
    },
    {
      label: "Operating cadence in place and reviewed",
      status: "missing",
      note: "Confirm the team has a regular review cadence and is following it.",
      phase: "validate_flow",
    },
  ];

  const evidenceChecks: GapCheck[] = [
    {
      label: "Public evidence collected",
      status: hasPublicEvidence ? "complete" : "missing",
      note: hasPublicEvidence ? "Public baseline run." : "Run Web Baseline.",
      phase: "outside_signals",
    },
    {
      label: "Customer reviews / public feedback analyzed",
      status: hasPublicEvidence ? "partial" : "missing",
      note: "Verify G2, Trustpilot, or interview excerpts are in the ledger.",
      phase: "outside_signals",
    },
    {
      label: "Company strategy documents uploaded",
      status: hasCompanyEvidence ? "complete" : "missing",
      note: hasCompanyEvidence ? undefined : "Upload brand, strategy, or operating docs.",
      phase: "diagnose",
    },
    {
      label: "Customer / stakeholder interviews conducted",
      status: hasPrimaryEvidence ? "complete" : "missing",
      note: hasPrimaryEvidence ? undefined : "Upload or link interview transcripts.",
      phase: "diagnose",
    },
    {
      label: "Importance / satisfaction data collected",
      status: odiNeedCount >= 5 ? "complete" : odiNeedCount > 0 ? "partial" : "missing",
      note: `${odiNeedCount} need${odiNeedCount !== 1 ? "s" : ""} scored.`,
      phase: "focus",
    },
    {
      label: "Top assumptions tested",
      status:
        validatedAssumptions.length >= 2
          ? "complete"
          : validatedAssumptions.length > 0
          ? "partial"
          : "missing",
      note: `${validatedAssumptions.length} assumption${validatedAssumptions.length !== 1 ? "s" : ""} validated.`,
      phase: "focus",
    },
    {
      label: "Solution ideas tested with customers",
      status: solutionIdeaCount >= 2 && hasPrimaryEvidence ? "partial" : "missing",
      note: "Run concept tests or prototype sessions on top solution ideas.",
      phase: "focus",
    },
    {
      label: "Progress metrics tracked and reviewed",
      status: "missing",
      note: "Define leading indicators and schedule a review cadence.",
      phase: "flow",
    },
    {
      label: "Evidence updated since last major decision",
      status: inputs.some((i) => i.status === "complete") ? "partial" : "missing",
      note: "Refresh evidence after each strategy or route change.",
      phase: "flow",
    },
    {
      label: "Drift signals identified",
      status: "missing",
      note: "Note any signals that suggest re-examination of the chosen path is needed.",
      phase: "validate_flow",
    },
  ];

  const curIdx = PHASE_ORDER.indexOf(currentPhase);

  function filterForPhase(checks: GapCheck[]): GapCheck[] {
    return checks.filter((ch) => {
      const chIdx = PHASE_ORDER.indexOf(ch.phase);
      if (chIdx === curIdx) return true;            // current phase: show all
      if (chIdx < curIdx) return ch.status !== "complete"; // prior phases: only incomplete
      return false;                                  // future phases: hide
    });
  }

  const filteredCompleteness = filterForPhase(completenessChecks);
  const filteredConsistency = filterForPhase(consistencyChecks);
  const filteredEvidence = filterForPhase(evidenceChecks);

  return (
    <div
      className="rounded-xl overflow-hidden mb-4"
      style={{ border: `1px solid ${c.line}`, background: "#FAFBF8" }}
    >
      <div
        className="px-4 py-3 flex items-baseline justify-between gap-3"
        style={{ borderBottom: `1px solid ${c.line}`, background: "#FFFFFF" }}
      >
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: c.muted }}>
            Program Gaps
          </p>
          <p className="font-sans text-[13px] font-semibold mt-0.5" style={{ color: c.charcoal }}>
            Completeness · Consistency · Evidence
          </p>
        </div>
        <p className="font-sans text-[11px]" style={{ color: c.muted }}>
          Stage: {PHASE_LABELS[currentPhase]}
        </p>
      </div>
      <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
        <Column
          title="Completeness"
          subtitle="Do we have all the components for good strategy and prioritization?"
          accent={c.coral}
          checks={filteredCompleteness}
          currentPhase={currentPhase}
        />
        <Column
          title="Consistency"
          subtitle="Are all components aligned and well-understood across the team?"
          accent={c.amber}
          checks={filteredConsistency}
          currentPhase={currentPhase}
        />
        <Column
          title="Evidence"
          subtitle="What has been proven, and what still needs to be?"
          accent={c.teal}
          checks={filteredEvidence}
          currentPhase={currentPhase}
        />
      </div>
    </div>
  );
}
